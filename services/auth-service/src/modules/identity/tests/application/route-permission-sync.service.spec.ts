import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core/injector/modules-container";
import { API_DESCRIPTION_KEY } from "../../../../shared/decorators/api-descript.decorator";
import { AuthRepository } from "../../infrastructure/repositories/auth.repository";
import { RoutePermissionSyncService } from "../../application/route-permission-sync.service";

describe("RoutePermissionSyncService", () => {
  const setRouteMetadata = (
    controller: new (...args: any[]) => unknown,
    controllerPath: string,
    routes: Array<{
      handlerName: string;
      method: RequestMethod;
      path: string;
      description?: string;
    }>,
  ) => {
    Reflect.defineMetadata(PATH_METADATA, controllerPath, controller);

    for (const route of routes) {
      const handler = controller.prototype[route.handlerName] as unknown;
      Reflect.defineMetadata(PATH_METADATA, route.path, handler);
      Reflect.defineMetadata(METHOD_METADATA, route.method, handler);

      if (route.description) {
        Reflect.defineMetadata(API_DESCRIPTION_KEY, route.description, handler);
      }
    }
  };

  class DemoController {
    list() {
      return true;
    }

    detail() {
      return true;
    }

    longPath() {
      return true;
    }

    noDescription() {
      return true;
    }
  }

  class PublicController {
    login() {
      return true;
    }
  }

  const clearRouteMetadata = (controller: new (...args: any[]) => unknown, handlers: string[]) => {
    Reflect.deleteMetadata(PATH_METADATA, controller);

    for (const handlerName of handlers) {
      const handler = controller.prototype[handlerName] as unknown;
      Reflect.deleteMetadata(PATH_METADATA, handler);
      Reflect.deleteMetadata(METHOD_METADATA, handler);
      Reflect.deleteMetadata(API_DESCRIPTION_KEY, handler);
    }
  };

  let authRepository: {
    upsertPermission: jest.Mock;
    upsertBusinessPermission: jest.Mock;
    upsertRoleByCode: jest.Mock;
    listPermissionIds: jest.Mock;
    createRolePermissions: jest.Mock;
    findUserByEmail: jest.Mock;
    upsertUserByEmail: jest.Mock;
    upsertActiveUserRole: jest.Mock;
  };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    clearRouteMetadata(DemoController, ["list", "detail", "longPath", "noDescription"]);
    clearRouteMetadata(PublicController, ["login"]);
    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "list",
        method: RequestMethod.GET,
        path: "/",
        description: "List users",
      },
      {
        handlerName: "detail",
        method: RequestMethod.GET,
        path: ":id",
        description: "Get user detail",
      },
      {
        handlerName: "longPath",
        method: RequestMethod.GET,
        path: `/${"a".repeat(300)}`,
        description: "Too long path",
      },
      {
        handlerName: "noDescription",
        method: RequestMethod.PATCH,
        path: ":id/status",
      },
    ]);

    setRouteMetadata(PublicController, "auth", [
      {
        handlerName: "login",
        method: RequestMethod.POST,
        path: "login",
        description: "Login",
      },
    ]);

    authRepository = {
      upsertPermission: jest.fn(),
      upsertBusinessPermission: jest.fn(),
      upsertRoleByCode: jest.fn().mockResolvedValue({ id: "role-super-admin" }),
      listPermissionIds: jest.fn().mockResolvedValue(["perm-1", "perm-2"]),
      createRolePermissions: jest.fn().mockResolvedValue({ count: 2 }),
      findUserByEmail: jest.fn().mockResolvedValue(null),
      upsertUserByEmail: jest.fn().mockResolvedValue({ id: "user-admin" }),
      upsertActiveUserRole: jest.fn().mockResolvedValue({}),
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    delete process.env.AUTH_ADMIN_EMAIL;
    delete process.env.AUTH_ADMIN_NAME;
    delete process.env.AUTH_ADMIN_PASSWORD;
  });

  function createModulesContainer(): ModulesContainer {
    const controllers = new Map<string, { metatype: new (...args: any[]) => unknown }>();
    controllers.set("DemoController", { metatype: DemoController });
    controllers.set("PublicController", { metatype: PublicController });

    const moduleRef = {
      controllers,
    };

    return {
      values: () => [moduleRef],
    } as unknown as ModulesContainer;
  }

  function extractUpsertKeys(): string[] {
    return authRepository.upsertPermission.mock.calls.map(
      (call: [string, string]) => `${call[0]}:${call[1]}`,
    );
  }

  it("upserts non-public routes with descriptions", async () => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";

    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "longPath",
        method: RequestMethod.GET,
        path: "long",
        description: "Long path but valid",
      },
      {
        handlerName: "noDescription",
        method: RequestMethod.PATCH,
        path: ":id/status",
        description: "Update user status",
      },
    ]);

    const service = new RoutePermissionSyncService(
      createModulesContainer(),
      authRepository as unknown as AuthRepository,
      logger,
    );

    await service.onApplicationBootstrap();

    const upsertKeys = extractUpsertKeys();

    expect(upsertKeys).toContain("GET:/users");
    expect(upsertKeys).toContain("GET:/users/:id");
    expect(upsertKeys).toContain("PATCH:/users/:id/status");
    expect(upsertKeys).not.toContain("POST:/auth/login");
    expect(authRepository.upsertPermission).toHaveBeenCalledWith(
      "GET",
      "/users",
      "List users",
      "users",
    );
    expect(authRepository.upsertBusinessPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "hotel.services.manage",
        description: "Quản lý danh mục và dịch vụ",
      }),
    );
    expect(authRepository.createRolePermissions).toHaveBeenCalledWith("role-super-admin", [
      "perm-1",
      "perm-2",
    ]);
  });

  it("skips missing descriptions when strict mode is disabled", async () => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";

    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "longPath",
        method: RequestMethod.GET,
        path: "long",
        description: "Long path but valid",
      },
    ]);

    const service = new RoutePermissionSyncService(
      createModulesContainer(),
      authRepository as unknown as AuthRepository,
      logger,
    );

    await service.onApplicationBootstrap();

    const upsertKeys = extractUpsertKeys();

    expect(upsertKeys).not.toContain("PATCH:/users/:id/status");
  });

  it("throws on missing descriptions when strict mode is enabled", async () => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "true";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";

    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "longPath",
        method: RequestMethod.GET,
        path: "long",
        description: "Long path but valid",
      },
    ]);

    const service = new RoutePermissionSyncService(
      createModulesContainer(),
      authRepository as unknown as AuthRepository,
      logger,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(/Thiếu @ApiDescript/i);
  });

  it("throws on oversized path when strict mode is enabled", async () => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "true";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";

    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "noDescription",
        method: RequestMethod.PATCH,
        path: ":id/status",
        description: "Update user status",
      },
    ]);

    const service = new RoutePermissionSyncService(
      createModulesContainer(),
      authRepository as unknown as AuthRepository,
      logger,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(/vượt quá độ dài tối đa/i);
  });

  it("creates bootstrap admin when AUTH_ADMIN_* is configured", async () => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "true";
    process.env.AUTHZ_STRICT_MODE = "false";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";
    process.env.AUTH_ADMIN_EMAIL = "admin@vietsage.local";
    process.env.AUTH_ADMIN_NAME = "VietSage Admin";
    process.env.AUTH_ADMIN_PASSWORD = "ChangeMe123!";

    setRouteMetadata(DemoController, "users", [
      {
        handlerName: "longPath",
        method: RequestMethod.GET,
        path: "long",
        description: "Long path but valid",
      },
      {
        handlerName: "noDescription",
        method: RequestMethod.PATCH,
        path: ":id/status",
        description: "Update user status",
      },
    ]);

    const service = new RoutePermissionSyncService(
      createModulesContainer(),
      authRepository as unknown as AuthRepository,
      logger,
    );

    await service.onApplicationBootstrap();

    expect(authRepository.upsertUserByEmail).toHaveBeenCalledTimes(1);
    expect(authRepository.upsertActiveUserRole).toHaveBeenCalledWith(
      "user-admin",
      "role-super-admin",
    );
  });
});
