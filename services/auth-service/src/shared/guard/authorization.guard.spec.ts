import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { publicMatcher } from "../../common/config/routes.config";
import { REQUIRED_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { AuthorizationService } from "../../modules/identity/identity-public";
import { AuthorizationGuard } from "./authorization.guard";

describe("AuthorizationGuard", () => {
  let authorizationService: {
    checkUserBusinessPermission: jest.Mock;
  };

  const createContext = (request: Partial<Request>, permissionKey?: string): ExecutionContext => {
    const handler = () => undefined;
    if (permissionKey) {
      Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, permissionKey, handler);
    }
    return {
      getType: () => "http",
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    authorizationService = {
      checkUserBusinessPermission: jest.fn(),
    };
    jest.restoreAllMocks();
  });

  it("bypasses public routes", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(true);

    await expect(guard.canActivate(createContext({ path: "/health" }))).resolves.toBe(true);
    expect(authorizationService.checkUserBusinessPermission).not.toHaveBeenCalled();
  });

  it("allows private routes when enforcement is disabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext({
          path: "/roles",
          method: "GET",
          user: { userId: "u1", email: "a@b.c", roleId: "r1" },
        }),
      ),
    ).resolves.toBe(true);
  });

  it("denies private routes without explicit business permission metadata", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext({
          path: "/unmapped",
          method: "GET",
          originalUrl: "/unmapped",
          user: { userId: "u1", email: "a@b.c", roleId: "r1" },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("authorizes only the explicit business permission for the active role", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/roles",
            method: "GET",
            user: { userId: "u1", email: "a@b.c", roleId: "r1" },
          },
          "platform.roles.view",
        ),
      ),
    ).resolves.toBe(true);
    expect(authorizationService.checkUserBusinessPermission).toHaveBeenCalledWith(
      "u1",
      "r1",
      "platform.roles.view",
    );
  });

  it("denies when the active role lacks the explicit business permission", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(false);
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/roles",
            method: "GET",
            user: { userId: "u1", email: "a@b.c", roleId: "r1" },
          },
          "platform.roles.view",
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
