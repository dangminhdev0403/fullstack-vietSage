import { HttpMethod, UserStatus, UserType } from "@prisma/client";
import { Injectable, OnApplicationBootstrap, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core/injector/modules-container";
import * as argon2 from "argon2";
import { loadAppConfig } from "../../../common/config/env.config";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { resolveModuleKeyFromPath } from "../../../common/config/permission-module.util";
import { BUSINESS_PERMISSIONS } from "../../../common/config/business-permissions.registry";
import { publicMatcher } from "../../../common/config/routes.config";
import { API_DESCRIPTION_KEY } from "../../../shared/decorators/api-descript.decorator";
import { AuthRepository } from "../auth.repository";
import {
  buildRoutePermissionKey,
  isPermissionPathTooLong,
} from "../utils/route-permission-key.util";

interface RoutePermissionSeed {
  method: HttpMethod;
  path: string;
  description: string;
}

interface BootstrapAdminConfig {
  email: string;
  name: string;
  password: string;
}

const SUPER_ADMIN_ROLE = {
  code: "SUPER_ADMIN",
  name: "Quản trị viên cấp cao",
  description: "Vai trò hệ thống có toàn quyền truy cập nền tảng",
} as const;

const BUSINESS_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "platform.users.view": "Xem danh sách người dùng",
  "platform.users.manage": "Quản lý người dùng",
  "platform.roles.view": "Xem danh sách vai trò",
  "platform.roles.manage": "Quản lý vai trò",
  "platform.permissions.manage": "Quản lý phân quyền",
  "platform.hotels.view": "Xem danh sách khách sạn",
  "platform.hotels.manage": "Quản lý khách sạn",
  "hotel.dashboard.view": "Xem tổng quan khách sạn",
  "hotel.rooms.view": "Xem danh sách phòng",
  "hotel.rooms.manage": "Quản lý phòng",
  "hotel.rooms.qr.manage": "Quản lý mã QR",
  "hotel.stays.view": "Xem danh sách khách lưu trú",
  "hotel.stays.manage": "Quản lý khách lưu trú",
  "hotel.requests.view": "Xem danh sách yêu cầu khách",
  "hotel.requests.manage": "Quản lý yêu cầu khách",
  "hotel.billing.view": "Xem danh sách thanh toán",
  "hotel.billing.manage": "Quản lý thanh toán",
  "hotel.services.view": "Xem danh mục và dịch vụ",
  "hotel.services.manage": "Quản lý danh mục và dịch vụ",
  "guest.experience.use": "Quản lý GuestOS",
  "system.health.view": "Xem trạng thái hệ thống",
};

@Injectable()
export class RoutePermissionSyncService implements OnApplicationBootstrap {
  private readonly config = loadAppConfig();
  private readonly methodByCode = this.buildMethodLookup();

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly authRepository: AuthRepository,
    private readonly logger: AppLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.authz.routeSyncEnabled) {
      this.logger.info("Route permission sync disabled", {
        module: "rbac",
        service: "RoutePermissionSyncService",
        event: "ROUTE_PERMISSION_SYNC_DISABLED",
        reason: "AUTHZ_ROUTE_SYNC_ENABLED=false",
      });
      return;
    }

    try {
      const routePermissions = this.collectRoutePermissions();

      for (const item of routePermissions) {
        const moduleKey = resolveModuleKeyFromPath(item.path);
        await this.authRepository.upsertPermission(
          item.method,
          item.path,
          item.description,
          moduleKey,
        );
      }

      for (const permission of BUSINESS_PERMISSIONS) {
        await this.authRepository.upsertBusinessPermission({
          key: permission.key,
          description: BUSINESS_PERMISSION_DESCRIPTIONS[permission.key] ?? permission.key,
          moduleKey: permission.moduleKey,
        });
      }

      this.logger.info("Route permission sync completed", {
        module: "rbac",
        service: "RoutePermissionSyncService",
        event: "ROUTE_PERMISSION_SYNC_COMPLETED",
        routeCount: routePermissions.length,
        businessPermissionCount: BUSINESS_PERMISSIONS.length,
      });

      const superAdminRole = await this.authRepository.upsertRoleByCode(SUPER_ADMIN_ROLE);
      const permissionIds = await this.authRepository.listPermissionIds();
      const rolePermissionResult = await this.authRepository.createRolePermissions(
        superAdminRole.id,
        permissionIds,
      );

      this.logger.info("Super admin permission sync completed", {
        module: "rbac",
        service: "RoutePermissionSyncService",
        event: "SUPER_ADMIN_PERMISSION_SYNC_COMPLETED",
        createdCount: rolePermissionResult.count,
        permissionCount: permissionIds.length,
      });

      await this.syncAuthAdmin(superAdminRole.id);
    } catch (error) {
      if (this.config.authz.strictMode) {
        throw error;
      }

      this.logger.error("Route permission sync failed but startup will continue", {
        module: "rbac",
        service: "RoutePermissionSyncService",
        event: "ROUTE_PERMISSION_SYNC_FAILED",
        reason: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private collectRoutePermissions(): RoutePermissionSeed[] {
    const permissionsByKey = new Map<string, RoutePermissionSeed>();

    for (const moduleRef of this.modulesContainer.values()) {
      for (const controllerRef of moduleRef.controllers.values()) {
        const controllerClass = controllerRef.metatype;
        if (!controllerClass) {
          continue;
        }

        const controllerPaths = this.toPathList(
          Reflect.getMetadata(PATH_METADATA, controllerClass),
        );
        const prototype = controllerClass.prototype as Record<string, unknown>;

        for (const handlerName of Object.getOwnPropertyNames(prototype)) {
          if (handlerName === "constructor") {
            continue;
          }

          const handlerCandidate = prototype[handlerName];
          if (typeof handlerCandidate !== "function") {
            continue;
          }

          const handler = handlerCandidate as (...args: unknown[]) => unknown;
          const method = this.resolveMethod(Reflect.getMetadata(METHOD_METADATA, handler));
          if (!method) {
            continue;
          }

          const description = this.resolveApiDescription(handler);
          const methodPaths = this.toPathList(Reflect.getMetadata(PATH_METADATA, handler));

          for (const controllerPath of controllerPaths) {
            for (const methodPath of methodPaths) {
              const permissionKey = buildRoutePermissionKey({
                method,
                basePath: controllerPath,
                routePath: methodPath,
              });

              if (!permissionKey) {
                this.handleMissingKey(method, controllerPath, methodPath);
                continue;
              }

              if (publicMatcher.isPublic(permissionKey.path)) {
                continue;
              }

              if (isPermissionPathTooLong(permissionKey.path)) {
                this.handleOversizedPath(permissionKey.method, permissionKey.path);
                continue;
              }

              if (!description) {
                this.handleMissingDescription(permissionKey.method, permissionKey.path);
                continue;
              }

              const mapKey = `${permissionKey.method}:${permissionKey.path}`;
              permissionsByKey.set(mapKey, {
                method: permissionKey.method,
                path: permissionKey.path,
                description,
              });
            }
          }
        }
      }
    }

    return Array.from(permissionsByKey.values()).sort((a, b) => {
      if (a.method === b.method) {
        return a.path.localeCompare(b.path);
      }

      return a.method.localeCompare(b.method);
    });
  }

  private async syncAuthAdmin(superAdminRoleId: string): Promise<void> {
    const adminConfig = this.resolveBootstrapAdminConfig();
    if (!adminConfig) {
      this.logger.info("Auth admin bootstrap skipped", {
        module: "auth",
        service: "RoutePermissionSyncService",
        event: "AUTH_ADMIN_BOOTSTRAP_SKIPPED",
        reason: "missing_admin_config",
      });
      return;
    }

    const existingAdmin = await this.authRepository.findUserByEmail(adminConfig.email);
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(adminConfig.password);
      const createdAdmin = await this.authRepository.upsertUserByEmail({
        email: adminConfig.email,
        passwordHash,
        fullName: adminConfig.name,
        status: UserStatus.ACTIVE,
        userType: UserType.VIETSAGE_ADMIN,
      });

      await this.authRepository.upsertActiveUserRole(createdAdmin.id, superAdminRoleId);
      this.logger.info("Auth admin bootstrap completed", {
        module: "auth",
        service: "RoutePermissionSyncService",
        event: "AUTH_ADMIN_BOOTSTRAP_COMPLETED",
        email: adminConfig.email,
      });
      return;
    }

    await this.authRepository.upsertActiveUserRole(existingAdmin.id, superAdminRoleId);
    this.logger.info("Auth admin already exists", {
      module: "auth",
      service: "RoutePermissionSyncService",
      event: "AUTH_ADMIN_ALREADY_EXISTS",
      email: adminConfig.email,
    });
  }

  private resolveBootstrapAdminConfig(): BootstrapAdminConfig | null {
    const { email, name, password } = this.config.authAdmin;
    const values = [email, name, password];
    const presentCount = values.filter((value) => value !== null).length;

    if (presentCount === 0) {
      return null;
    }

    if (presentCount !== 3) {
      throw new Error(
        "AUTH_ADMIN_EMAIL, AUTH_ADMIN_NAME, AUTH_ADMIN_PASSWORD phải được cấu hình cùng nhau",
      );
    }

    return {
      email: email!.trim().toLowerCase(),
      name: name!.trim(),
      password: password!,
    };
  }

  private resolveMethod(metadata: unknown): HttpMethod | null {
    if (typeof metadata !== "number") {
      return null;
    }

    const method = this.methodByCode.get(metadata);
    if (!method || method === "ALL") {
      return null;
    }

    return method;
  }

  private resolveApiDescription(handler: (...args: unknown[]) => unknown): string | null {
    const metadata = Reflect.getMetadata(API_DESCRIPTION_KEY, handler);
    if (typeof metadata !== "string") {
      return null;
    }

    const trimmed = metadata.trim();
    return trimmed.length ? trimmed : null;
  }

  private toPathList(pathMetadata: unknown): string[] {
    if (Array.isArray(pathMetadata)) {
      const values = pathMetadata.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      );

      return values.length ? values : ["/"];
    }

    if (typeof pathMetadata === "string" && pathMetadata.trim().length > 0) {
      return [pathMetadata];
    }

    return ["/"];
  }

  private handleMissingKey(method: string, controllerPath: string, methodPath: string): void {
    const message = `Không thể tạo khóa quyền cho ${method} ${controllerPath} + ${methodPath}`;

    if (this.config.authz.strictMode) {
      throw new Error(message);
    }

    this.logger.warn(message, {
      module: "rbac",
      service: "RoutePermissionSyncService",
      event: "ROUTE_PERMISSION_KEY_MISSING",
      reason: message,
    });
  }

  private handleOversizedPath(method: string, path: string): void {
    const message = `Đường dẫn quyền vượt quá độ dài tối đa (${path.length}/255): ${method} ${path}`;

    if (this.config.authz.strictMode) {
      throw new Error(message);
    }

    this.logger.warn(message, {
      module: "rbac",
      service: "RoutePermissionSyncService",
      event: "ROUTE_PERMISSION_PATH_TOO_LONG",
      reason: message,
    });
  }

  private handleMissingDescription(method: string, path: string): void {
    const message = `Thiếu @ApiDescript cho endpoint không công khai: ${method} ${path}`;

    if (this.config.authz.strictMode) {
      throw new Error(message);
    }

    this.logger.warn("Route permission description missing", {
      module: "rbac",
      service: "RoutePermissionSyncService",
      event: "ROUTE_PERMISSION_DESCRIPTION_MISSING",
      reason: message,
      endpoint: `${method} ${path}`,
    });
  }

  private buildMethodLookup(): Map<number, HttpMethod | "ALL"> {
    const lookup = new Map<number, HttpMethod | "ALL">();

    for (const [name, value] of Object.entries(RequestMethod)) {
      if (typeof value === "number") {
        if (name === "ALL") {
          lookup.set(value, "ALL");
          continue;
        }

        if (
          name === "GET" ||
          name === "POST" ||
          name === "PUT" ||
          name === "PATCH" ||
          name === "DELETE" ||
          name === "OPTIONS"
        ) {
          lookup.set(value, name);
        }
      }
    }

    return lookup;
  }
}
