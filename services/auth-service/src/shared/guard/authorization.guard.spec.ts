import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { publicMatcher } from "../../common/config/routes.config";
import {
  CANONICAL_OWNER_ROLE,
  REQUIRED_ACTIVE_ROLE_KEY,
} from "../decorators/require-active-role.decorator";
import { REQUIRED_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { AuthorizationService } from "../../modules/identity/identity-public";
import { AuthorizationGuard } from "./authorization.guard";

describe("AuthorizationGuard", () => {
  let authorizationService: {
    checkUserBusinessPermission: jest.Mock;
    getActiveRoleCode: jest.Mock;
  };

  const createContext = (
    request: Partial<Request>,
    permissionKey?: string,
    activeRole?: string | string[],
  ): ExecutionContext => {
    const handler = () => undefined;
    if (permissionKey) {
      Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, permissionKey, handler);
    }
    if (activeRole) {
      Reflect.defineMetadata(REQUIRED_ACTIVE_ROLE_KEY, activeRole, handler);
    }
    return {
      getType: () => "http",
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    authorizationService = {
      checkUserBusinessPermission: jest.fn(),
      getActiveRoleCode: jest.fn(),
    };
    jest.restoreAllMocks();
  });

  it("bypasses public routes", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(true);

    await expect(guard.canActivate(createContext({ path: "/health" }))).resolves.toBe(true);
    expect(authorizationService.checkUserBusinessPermission).not.toHaveBeenCalled();
    expect(authorizationService.getActiveRoleCode).not.toHaveBeenCalled();
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
    expect(authorizationService.getActiveRoleCode).not.toHaveBeenCalled();
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
    expect(authorizationService.getActiveRoleCode).not.toHaveBeenCalled();
  });

  it("permits matching active role (TENANT_OWNER) after business permission check", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue(CANONICAL_OWNER_ROLE);
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "u1", email: "owner@hotel.com", roleId: "role-owner" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).resolves.toBe(true);
    expect(authorizationService.checkUserBusinessPermission).toHaveBeenCalledWith(
      "u1",
      "role-owner",
      "owner.settings.manage",
    );
    expect(authorizationService.getActiveRoleCode).toHaveBeenCalledWith("u1", "role-owner");
  });

  it("rejects mismatched role with 403 even if business permission is granted", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue("HOTEL_STAFF");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "u2", email: "staff@hotel.com", roleId: "role-staff" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.getActiveRoleCode).toHaveBeenCalledWith("u2", "role-staff");
  });

  it("rejects custom role with 403 when canonical owner role is required", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue("CUSTOM_MANAGER");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "u3", email: "custom@hotel.com", roleId: "role-custom" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects SUPER_ADMIN when TENANT_OWNER alone is required even if business permission check passes", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue("SUPER_ADMIN");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "admin1", email: "admin@platform.com", roleId: "role-admin" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.checkUserBusinessPermission).toHaveBeenCalledWith(
      "admin1",
      "role-admin",
      "owner.settings.manage",
    );
    expect(authorizationService.getActiveRoleCode).toHaveBeenCalledWith("admin1", "role-admin");
  });

  it("denies before role check if business permission check fails", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(false);
    authorizationService.getActiveRoleCode.mockResolvedValue("SUPER_ADMIN");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "admin1", email: "admin@platform.com", roleId: "role-admin" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.getActiveRoleCode).not.toHaveBeenCalled();
  });

  it("rejects with 403 if active role code cannot be resolved", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue(null);
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/owner/settings",
            method: "PATCH",
            user: { userId: "u4", email: "unknown@hotel.com", roleId: "role-unknown" },
          },
          "owner.settings.manage",
          CANONICAL_OWNER_ROLE,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("supports array of allowed active roles", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue("HOTEL_MANAGER");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/hotel/settings",
            method: "GET",
            user: { userId: "u5", email: "manager@hotel.com", roleId: "role-manager" },
          },
          "hotel.settings.view",
          [CANONICAL_OWNER_ROLE, "HOTEL_MANAGER"],
        ),
      ),
    ).resolves.toBe(true);
  });

  it("permits SUPER_ADMIN when explicitly listed in allowed active roles", async () => {
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "true";
    authorizationService.checkUserBusinessPermission.mockResolvedValue(true);
    authorizationService.getActiveRoleCode.mockResolvedValue("SUPER_ADMIN");
    const guard = new AuthorizationGuard(authorizationService as unknown as AuthorizationService);
    jest.spyOn(publicMatcher, "isPublic").mockReturnValue(false);

    await expect(
      guard.canActivate(
        createContext(
          {
            path: "/platform/settings",
            method: "GET",
            user: { userId: "admin2", email: "admin2@platform.com", roleId: "role-admin2" },
          },
          "platform.roles.view",
          ["SUPER_ADMIN", CANONICAL_OWNER_ROLE],
        ),
      ),
    ).resolves.toBe(true);
  });
});
