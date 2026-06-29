import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { publicMatcher } from "../../common/config/routes.config";
import { AuthorizationService } from "../../modules/auth/services/authorization.service";
import { AuthorizationGuard } from "./authorization.guard";

describe("AuthorizationGuard", () => {
  let authorizationService: {
    checkUserRoutePermission: jest.Mock;
  };

  const createContext = (request: Partial<Request>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    authorizationService = {
      checkUserRoutePermission: jest.fn(),
    };

    jest.restoreAllMocks();
  });

  it("bypasses public routes", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(true);

    const request = {
      path: "/health",
    } as Partial<Request>;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authorizationService.checkUserRoutePermission).not.toHaveBeenCalled();
  });

  it("allows private routes when enforcement is disabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";
    process.env.AUTHZ_STRICT_MODE = "false";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    const request = {
      path: "/auth/me",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      route: { path: "/auth/me" },
      baseUrl: "",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authorizationService.checkUserRoutePermission).not.toHaveBeenCalled();
  });

  it("denies with 403 when user has no matching permission", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);
    authorizationService.checkUserRoutePermission.mockResolvedValue({
      allowed: false,
      permissionExists: true,
    });

    const request = {
      path: "/auth/me",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      route: { path: "/auth/me" },
      baseUrl: "",
      originalUrl: "/auth/me",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authorizationService.checkUserRoutePermission).toHaveBeenCalledWith(
      "u1",
      "GET",
      "/auth/me",
    );
  });

  it("allows unresolved route when strict mode is disabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    const request = {
      path: "/auth/me",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      baseUrl: "",
      originalUrl: "/auth/me",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authorizationService.checkUserRoutePermission).not.toHaveBeenCalled();
  });

  it("denies unresolved route when strict mode is enabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "true";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    const request = {
      path: "/auth/me",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      baseUrl: "",
      originalUrl: "/auth/me",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows missing permission row when strict mode is disabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);
    authorizationService.checkUserRoutePermission.mockResolvedValue({
      allowed: false,
      permissionExists: false,
    });

    const request = {
      path: "/users/1",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      baseUrl: "/users",
      route: { path: ":id" },
      originalUrl: "/users/1",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it("denies missing permission row when strict mode is enabled", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "true";

    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);
    authorizationService.checkUserRoutePermission.mockResolvedValue({
      allowed: false,
      permissionExists: false,
    });

    const request = {
      path: "/users/1",
      method: "GET",
      user: { userId: "u1", email: "a@b.c", roleId: "r1" },
      baseUrl: "/users",
      route: { path: ":id" },
      originalUrl: "/users/1",
    } as unknown as Request;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
