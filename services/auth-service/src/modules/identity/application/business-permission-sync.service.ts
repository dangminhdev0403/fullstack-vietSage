import { RoleType, UserStatus, UserType } from "@prisma/client";
import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import * as argon2 from "argon2";
import { BUSINESS_PERMISSIONS } from "../../../common/config/business-permissions.registry";
import { loadAppConfig } from "../../../common/config/env.config";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";

interface BootstrapAdminConfig {
  email: string;
  name: string;
  password: string;
}

const SUPER_ADMIN_ROLE = {
  code: "SUPER_ADMIN",
  name: "Quản trị viên cấp cao",
  description: "Vai trò hệ thống có toàn quyền truy cập nền tảng",
  type: RoleType.SYSTEM_TEMPLATE,
} as const;

@Injectable()
export class BusinessPermissionSyncService implements OnApplicationBootstrap {
  private readonly config = loadAppConfig();

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly logger: AppLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const permission of BUSINESS_PERMISSIONS) {
        await this.authRepository.upsertBusinessPermission({
          key: permission.key,
          description: permission.description,
          moduleKey: permission.moduleKey,
        });
      }

      const superAdminRole = await this.authRepository.upsertRoleByCode(SUPER_ADMIN_ROLE);
      const permissionIds = await this.authRepository.listBusinessPermissionIds(
        BUSINESS_PERMISSIONS.map(({ key }) => key),
      );
      const rolePermissionResult = await this.authRepository.createRolePermissions(
        superAdminRole.id,
        permissionIds,
      );

      this.logger.info("Business permission catalog sync completed", {
        module: "rbac",
        service: "BusinessPermissionSyncService",
        event: "BUSINESS_PERMISSION_CATALOG_SYNC_COMPLETED",
        businessPermissionCount: BUSINESS_PERMISSIONS.length,
        superAdminGrantCount: rolePermissionResult.count,
      });

      await this.syncAuthAdmin(superAdminRole.id);
    } catch (error) {
      if (this.config.authz.strictMode) throw error;

      this.logger.error("Business permission sync failed but startup will continue", {
        module: "rbac",
        service: "BusinessPermissionSyncService",
        event: "BUSINESS_PERMISSION_CATALOG_SYNC_FAILED",
        reason: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private async syncAuthAdmin(superAdminRoleId: string): Promise<void> {
    const adminConfig = this.resolveBootstrapAdminConfig();
    if (!adminConfig) return;

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
      return;
    }

    await this.authRepository.upsertActiveUserRole(existingAdmin.id, superAdminRoleId);
  }

  private resolveBootstrapAdminConfig(): BootstrapAdminConfig | null {
    const { email, name, password } = this.config.authAdmin;
    const values = [email, name, password];
    const presentCount = values.filter((value) => value !== null).length;
    if (presentCount === 0) return null;
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
}
