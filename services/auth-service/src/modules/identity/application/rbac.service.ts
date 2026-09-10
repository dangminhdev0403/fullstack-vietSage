import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleStatus, RoleType, type Permission, type Role } from "@prisma/client";
import {
  compareModuleKeysByNavigationOrder,
  humanizeModuleName,
  isHiddenModuleKey,
  resolveModuleKeyFromMenuPath,
  resolvePermissionMenuPath,
  sortMenuPathsByNavigationOrder,
} from "../../../common/config/permission-module.util";
import { DEFAULT_NAVIGATION_MENU } from "../../../common/config/navigation.config";
import {
  BUSINESS_PERMISSIONS,
  isBusinessPermissionKey,
} from "../../../common/config/business-permissions.registry";
import { resolveBusinessPermissionMenuPath } from "../../../common/config/business-permission-menu.util";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { RbacRepository } from "../infrastructure/repositories/rbac.repository";
import type {
  CreateRoleBodyInput,
  ListPermissionsQueryInput,
  ListRolePermissionModulePermissionsQueryInput,
  ReplaceRolePermissionsBodyInput,
  RoleModulePermissionsBodyInput,
  UpdateRoleBodyInput,
} from "../domain/schemas/rbac.schema";
import { AuthService } from "./authentication.service";

type RoleWithRelations = Prisma.RoleGetPayload<{
  include: {
    rolePermissions: {
      include: {
        permission: true;
      };
    };
    _count: {
      select: {
        userRoles: true;
        rolePermissions: true;
      };
    };
  };
}>;

type FrontendNavigationRole = {
  id: string;
  description: string | null;
  createdAt: string;
  name: string;
  code: string;
  status: RoleStatus;
  type: RoleType;
  menus: string[];
  enabledCount: number;
};

export type PermissionModuleLookupItem = {
  id: string;
  module: string;
  name: string;
};

export type RolePermissionModuleSummary = {
  moduleKey: string;
  moduleName: string;
  totalPermissions: number;
  enabledCount: number;
  disabledCount: number;
  allSelected: boolean;
  allDisabled: boolean;
};

export type RolePermissionModulePermissionItem = {
  permissionId: string;
  method: Permission["method"];
  path: string;
  description: string;
  enabled: boolean;
};

export type RolePermissionModulePermissionsPage = {
  page: number;
  limit: number;
  total: number;
  items: RolePermissionModulePermissionItem[];
};

@Injectable()
export class RbacService {
  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly authService: AuthService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}

  async createRole(dto: CreateRoleBodyInput): Promise<Role> {
    const role = await this.rbacRepository.createRole({
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: normalizeOptionalText(dto.description),
    });
    this.logRoleEvent("Role created", "ROLE_CREATED", "createRole", {
      roleId: role.id,
      code: role.code,
    });
    return role;
  }

  async listRoles(): Promise<FrontendNavigationRole[]> {
    const roles = await this.rbacRepository.listRolesWithRelations();
    return roles.map((role) => this.mapRoleToFrontendNavigation(role));
  }

  async getRole(roleId: string): Promise<RoleWithRelations> {
    return this.findRoleWithRelationsOrThrow(roleId);
  }

  async getRoleMenus(roleId: string): Promise<string[]> {
    const role = await this.findRoleWithRelationsOrThrow(roleId);
    return this.mapRoleToMenus(role);
  }

  async getRoleByName(name: string): Promise<RoleWithRelations> {
    const normalizedName = name.trim();

    if (!normalizedName.length) {
      throw new NotFoundException("Không tìm thấy vai trò");
    }

    const role = await this.rbacRepository.findRoleWithRelationsByName(normalizedName);

    if (!role) {
      throw new NotFoundException("Không tìm thấy vai trò");
    }

    return role;
  }

  async updateRole(roleId: string, dto: UpdateRoleBodyInput): Promise<Role> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRoleMutable(role);

    const updated = await this.rbacRepository.updateRole(roleId, {
      name: dto.name === undefined ? undefined : dto.name.trim(),
      description:
        dto.description === undefined ? undefined : normalizeOptionalText(dto.description),
    });
    this.logRoleEvent("Role updated", "ROLE_UPDATED", "updateRole", { roleId, code: updated.code });
    return updated;
  }

  async disableRole(roleId: string): Promise<Role> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRoleMutable(role);

    if (role.status === RoleStatus.DISABLED) {
      return role;
    }

    const disabled = await this.rbacRepository.disableRole(roleId);
    await this.authService.revokeRoleSessions(roleId);
    this.logRoleEvent("Role disabled", "ROLE_DISABLED", "disableRole", {
      roleId,
      code: disabled.code,
    });
    return disabled;
  }

  async deleteRole(roleId: string): Promise<{ deleted: true }> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRoleMutable(role);

    await this.rbacRepository.deleteRole(roleId);
    await this.authService.revokeRoleSessions(roleId);

    this.logRoleEvent("Role deleted", "ROLE_DELETED", "deleteRole", { roleId, code: role.code });
    return { deleted: true };
  }

  async listPermissions(query: ListPermissionsQueryInput): Promise<PermissionModuleLookupItem[]> {
    const where = this.buildPermissionFilter(query);
    const permissions = await this.rbacRepository.listPermissions(where);

    return this.mapPermissionModules(permissions);
  }

  async getPermission(permissionId: string): Promise<Permission> {
    const permission = await this.rbacRepository.findPermissionById(permissionId);

    if (!permission) {
      throw new NotFoundException("Không tìm thấy quyền");
    }

    return permission;
  }

  async listRolePermissions(roleId: string): Promise<Permission[]> {
    await this.findRoleOrThrow(roleId);
    return this.listRolePermissionsByRoleId(roleId);
  }

  async listRolePermissionModules(roleId: string): Promise<RolePermissionModuleSummary[]> {
    await this.findRoleOrThrow(roleId);

    const [permissionTotalsByModule, rolePermissionModuleRows] = await Promise.all([
      this.rbacRepository.listPermissionTotalsByModule(),
      this.rbacRepository.listRolePermissionModuleKeys(roleId),
    ]);

    const enabledCountByModule = new Map<string, number>();
    for (const row of rolePermissionModuleRows) {
      const moduleKey = row.permission.moduleKey;
      enabledCountByModule.set(moduleKey, (enabledCountByModule.get(moduleKey) ?? 0) + 1);
    }

    return permissionTotalsByModule
      .map((row) => {
        const moduleKey = row.moduleKey;
        const totalPermissions = row._count._all;
        const enabledCount = enabledCountByModule.get(moduleKey) ?? 0;

        return this.buildPermissionModuleSummary(moduleKey, totalPermissions, enabledCount);
      })
      .filter((summary) => !isHiddenModuleKey(summary.moduleKey))
      .sort((a, b) => compareModuleKeysByNavigationOrder(a.moduleKey, b.moduleKey));
  }

  async listRolePermissionModulePermissions(
    roleId: string,
    moduleKey: string,
    query: ListRolePermissionModulePermissionsQueryInput,
  ): Promise<RolePermissionModulePermissionsPage> {
    await this.findRoleOrThrow(roleId);

    const resolved = await this.resolveModuleSummaryBaseOrThrow(moduleKey);

    const permissionRows = await this.rbacRepository.listPermissionsByModuleKey(
      resolved.moduleKey,
      query.page,
      query.limit,
    );

    const permissionIds = permissionRows.map((row) => row.id);
    const enabledRows = await this.rbacRepository.listRolePermissionIdsByRoleAndPermissionIds(
      roleId,
      permissionIds,
    );

    const enabledIds = new Set(enabledRows.map((row) => row.permissionId));

    return {
      page: query.page,
      limit: query.limit,
      total: resolved.totalPermissions,
      items: permissionRows.map((row) => ({
        permissionId: row.id,
        method: row.method,
        path: row.path,
        description: row.description,
        enabled: enabledIds.has(row.id),
      })),
    };
  }

  async grantRolePermissionModulePermissions(
    actorUserId: string,
    actorRoleId: string,
    roleId: string,
    moduleKey: string,
    dto: RoleModulePermissionsBodyInput,
  ): Promise<RolePermissionModuleSummary> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRolePermissionsMutable(role);

    const resolved = await this.resolveModuleSummaryBaseOrThrow(moduleKey);
    const permissionIds = await this.resolvePermissionIdsInModuleOrThrow(
      dto.permissionIds,
      resolved.moduleKey,
    );
    await this.assertActorCanManagePermissionIds(actorUserId, actorRoleId, permissionIds);

    await this.rbacRepository.createRolePermissions(roleId, permissionIds);

    this.logRoleEvent(
      "Role permissions granted",
      "ROLE_PERMISSIONS_GRANTED",
      "grantRolePermissionModulePermissions",
      {
        actorUserId,
        roleId,
        moduleKey: resolved.moduleKey,
        permissionIds,
      },
    );
    return this.fetchRolePermissionModuleSummary(
      roleId,
      resolved.moduleKey,
      resolved.totalPermissions,
    );
  }

  async revokeRolePermissionModulePermissions(
    actorUserId: string,
    actorRoleId: string,
    roleId: string,
    moduleKey: string,
    dto: RoleModulePermissionsBodyInput,
  ): Promise<RolePermissionModuleSummary> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRolePermissionsMutable(role);

    const resolved = await this.resolveModuleSummaryBaseOrThrow(moduleKey);
    const permissionIds = await this.resolvePermissionIdsInModuleOrThrow(
      dto.permissionIds,
      resolved.moduleKey,
    );
    await this.assertActorCanManagePermissionIds(actorUserId, actorRoleId, permissionIds);

    await this.rbacRepository.deleteRolePermissions(roleId, permissionIds);

    this.logRoleEvent(
      "Role permissions revoked",
      "ROLE_PERMISSIONS_REVOKED",
      "revokeRolePermissionModulePermissions",
      {
        actorUserId,
        roleId,
        moduleKey: resolved.moduleKey,
        permissionIds,
      },
    );
    return this.fetchRolePermissionModuleSummary(
      roleId,
      resolved.moduleKey,
      resolved.totalPermissions,
    );
  }

  async replacePermissions(
    actorUserId: string,
    actorRoleId: string,
    roleId: string,
    dto: ReplaceRolePermissionsBodyInput,
  ): Promise<Permission[]> {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRolePermissionsMutable(role);
    const permissionIds = await this.resolvePermissionIdsOrThrow(dto.permissionIds, true);
    const currentPermissionIds = (await this.listRolePermissionsByRoleId(roleId)).map(
      (permission) => permission.id,
    );
    await this.assertActorCanManagePermissionIds(actorUserId, actorRoleId, [
      ...currentPermissionIds,
      ...permissionIds,
    ]);

    if (permissionIds.length === 0) {
      await this.rbacRepository.clearRolePermissions(roleId);
      this.logRoleEvent(
        "Role permissions cleared",
        "ROLE_PERMISSIONS_REPLACED",
        "replacePermissions",
        {
          roleId,
          permissionCount: 0,
        },
      );
      return this.listRolePermissionsByRoleId(roleId);
    }

    await this.rbacRepository.replaceRolePermissions(roleId, permissionIds);
    this.logRoleEvent(
      "Role permissions replaced",
      "ROLE_PERMISSIONS_REPLACED",
      "replacePermissions",
      {
        roleId,
        permissionCount: permissionIds.length,
      },
    );

    return this.listRolePermissionsByRoleId(roleId);
  }

  async listRoleCapabilities(roleId: string) {
    await this.findRoleOrThrow(roleId);
    const rows = await this.rbacRepository.listBusinessPermissionsForRole(
      roleId,
      BUSINESS_PERMISSIONS.map(({ key }) => key),
    );
    const definitions = new Map<string, (typeof BUSINESS_PERMISSIONS)[number]>(
      BUSINESS_PERMISSIONS.map((item) => [item.key, item]),
    );
    return rows.map((permission) => {
      const definition = definitions.get(permission.path);
      if (!definition) {
        throw new Error(`Capability registry thiếu key ${permission.path}`);
      }
      return {
        id: permission.id,
        key: definition.key,
        domain: definition.domain,
        label: definition.label,
        description: definition.description,
        risk: definition.risk,
        enabled: permission.rolePermissions.length > 0,
      };
    });
  }

  async replaceRoleCapabilities(
    actorUserId: string,
    actorRoleId: string,
    roleId: string,
    dto: ReplaceRolePermissionsBodyInput,
  ) {
    const role = await this.findRoleOrThrow(roleId);
    this.assertRolePermissionsMutable(role);
    const capabilityKeys = BUSINESS_PERMISSIONS.map(({ key }) => key);
    const capabilities = await this.rbacRepository.listBusinessPermissionsForRole(
      roleId,
      capabilityKeys,
    );
    const capabilityIds = new Set(capabilities.map(({ id }) => id));
    const permissionIds = normalizePermissionIds(dto.permissionIds);
    const invalidIds = permissionIds.filter((id) => !capabilityIds.has(id));
    if (invalidIds.length) {
      throw new BadRequestException(`Các id capability không tồn tại: ${invalidIds.join(", ")}`);
    }
    const currentIds = capabilities
      .filter(({ rolePermissions }) => rolePermissions.length > 0)
      .map(({ id }) => id);
    await this.assertActorCanManagePermissionIds(actorUserId, actorRoleId, [
      ...currentIds,
      ...permissionIds,
    ]);
    await this.rbacRepository.replaceRoleBusinessPermissions(roleId, permissionIds, capabilityKeys);
    return this.listRoleCapabilities(roleId);
  }

  private logRoleEvent(
    message: string,
    event: string,
    operation: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.info(message, {
      module: "rbac",
      service: "RbacService",
      operation,
      event,
      ...metadata,
    });
  }

  private async listRolePermissionsByRoleId(roleId: string): Promise<Permission[]> {
    const rows = await this.rbacRepository.listRolePermissions(roleId);
    return rows.map((row) => row.permission);
  }

  private async findRoleOrThrow(roleId: string): Promise<Role> {
    const role = await this.rbacRepository.findRoleById(roleId);

    if (!role) {
      throw new NotFoundException("Không tìm thấy vai trò");
    }

    return role;
  }

  private async findRoleWithRelationsOrThrow(roleId: string): Promise<RoleWithRelations> {
    const role = await this.rbacRepository.findRoleWithRelationsById(roleId);

    if (!role) {
      throw new NotFoundException("Không tìm thấy vai trò");
    }

    return role;
  }

  private assertRoleMutable(role: Role): void {
    if (role.type === RoleType.SYSTEM_TEMPLATE) {
      throw new ForbiddenException(`Vai trò ${role.code} được bảo vệ và không thể chỉnh sửa`);
    }
  }

  private assertRolePermissionsMutable(role: Role): void {
    if (role.type === RoleType.SYSTEM_TEMPLATE) {
      throw new ForbiddenException(
        `Quyền của vai trò ${role.code} được bảo vệ và không thể chỉnh sửa`,
      );
    }
  }

  private buildPermissionFilter(query: ListPermissionsQueryInput): Prisma.PermissionWhereInput {
    const filters: Prisma.PermissionWhereInput[] = [];

    if (query.method) {
      filters.push({ method: query.method });
    }

    if (query.path && query.path.trim().length > 0) {
      filters.push({
        path: {
          contains: query.path.trim(),
          mode: "insensitive",
        },
      });
    }

    if (query.q && query.q.trim().length > 0) {
      const needle = query.q.trim();
      filters.push({
        OR: [
          {
            path: {
              contains: needle,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: needle,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    if (!filters.length) {
      return {};
    }

    return { AND: filters };
  }

  private mapPermissionModules(permissions: Permission[]): PermissionModuleLookupItem[] {
    const moduleKeys = new Set<string>();

    for (const permission of permissions) {
      const moduleKey = permission.moduleKey;

      if (isHiddenModuleKey(moduleKey)) {
        continue;
      }

      moduleKeys.add(moduleKey);
    }

    return Array.from(moduleKeys)
      .sort((moduleKeyA, moduleKeyB) => compareModuleKeysByNavigationOrder(moduleKeyA, moduleKeyB))
      .map((moduleKey) => ({
        id: moduleKey,
        module: moduleKey,
        name: humanizeModuleName(moduleKey),
      }));
  }

  private mapRoleToFrontendNavigation(role: RoleWithRelations): FrontendNavigationRole {
    return {
      id: role.id,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      code: role.code,
      name: role.name,
      status: role.status,
      type: role.type,
      menus: this.mapRoleToMenus(role),
      enabledCount: role.rolePermissions.filter(({ permission }) =>
        isBusinessPermissionKey(permission.path),
      ).length,
    };
  }

  private mapRoleToMenus(role: RoleWithRelations): string[] {
    const menus = new Set<string>([DEFAULT_NAVIGATION_MENU]);

    for (const row of role.rolePermissions) {
      const menuPath =
        resolveBusinessPermissionMenuPath(row.permission.path) ??
        resolvePermissionMenuPath(row.permission.path);

      if (!menuPath) {
        continue;
      }

      const moduleKey = resolveModuleKeyFromMenuPath(menuPath);
      if (isHiddenModuleKey(moduleKey)) {
        continue;
      }

      menus.add(menuPath);
    }

    return sortMenuPathsByNavigationOrder(Array.from(menus));
  }

  private async resolvePermissionIdsOrThrow(
    permissionIds: string[],
    allowEmpty: boolean,
  ): Promise<string[]> {
    const normalizedIds = normalizePermissionIds(permissionIds);

    if (!normalizedIds.length) {
      if (allowEmpty) {
        return [];
      }

      throw new BadRequestException("permissionIds phải chứa ít nhất một id hợp lệ");
    }

    const permissions = await this.rbacRepository.findPermissionsByIds(normalizedIds);

    const existingIds = new Set(permissions.map((permission) => permission.id));
    const missingIds = normalizedIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Các id quyền không tồn tại: ${missingIds.join(", ")}`);
    }

    return normalizedIds;
  }

  private async resolvePermissionIdsInModuleOrThrow(
    permissionIds: string[],
    moduleKey: string,
  ): Promise<string[]> {
    const normalizedIds = normalizePermissionIds(permissionIds);

    if (!normalizedIds.length) {
      throw new BadRequestException("permissionIds phải chứa ít nhất một id hợp lệ");
    }

    const permissions = await this.rbacRepository.findPermissionsByIdsWithModuleKey(normalizedIds);
    const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));
    const missingIds = normalizedIds.filter((id) => !permissionById.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Các id quyền không tồn tại: ${missingIds.join(", ")}`);
    }

    const wrongModuleIds = normalizedIds.filter(
      (id) => permissionById.get(id)?.moduleKey !== moduleKey,
    );
    if (wrongModuleIds.length > 0) {
      throw new BadRequestException(
        `Các id quyền không thuộc nhóm ${moduleKey}: ${wrongModuleIds.join(", ")}`,
      );
    }

    return normalizedIds;
  }

  private async assertActorCanManagePermissionIds(
    actorUserId: string,
    actorRoleId: string,
    permissionIds: string[],
  ): Promise<void> {
    const actorRole = await this.rbacRepository.findActiveRoleAccess(actorUserId, actorRoleId);
    if (!actorRole) {
      throw new ForbiddenException("Vai trò đang hoạt động không hợp lệ");
    }
    if (actorRole.code === "SUPER_ADMIN") {
      return;
    }

    const actorPermissionIds = new Set(actorRole.permissionIds);
    const unauthorizedIds = permissionIds.filter(
      (permissionId) => !actorPermissionIds.has(permissionId),
    );

    if (unauthorizedIds.length > 0) {
      throw new ForbiddenException("Bạn không thể cấp hoặc thu hồi quyền ngoài phạm vi của mình");
    }
  }

  private async resolveModuleSummaryBaseOrThrow(
    moduleKeyInput: string,
  ): Promise<{ moduleKey: string; totalPermissions: number }> {
    const moduleKey = normalizeModuleKey(moduleKeyInput);

    if (isHiddenModuleKey(moduleKey)) {
      throw new NotFoundException("Không tìm thấy nhóm quyền");
    }

    const totalPermissions = await this.rbacRepository.countPermissionsByModuleKey(moduleKey);

    if (totalPermissions === 0) {
      throw new NotFoundException("Không tìm thấy nhóm quyền");
    }

    return { moduleKey, totalPermissions };
  }

  private async fetchRolePermissionModuleSummary(
    roleId: string,
    moduleKey: string,
    totalPermissions: number,
  ): Promise<RolePermissionModuleSummary> {
    const enabledCount = await this.rbacRepository.countRolePermissionsByModuleKey(
      roleId,
      moduleKey,
    );

    return this.buildPermissionModuleSummary(moduleKey, totalPermissions, enabledCount);
  }

  private buildPermissionModuleSummary(
    moduleKey: string,
    totalPermissions: number,
    enabledCount: number,
  ): RolePermissionModuleSummary {
    const normalizedTotal = Math.max(totalPermissions, 0);
    const normalizedEnabled = Math.min(Math.max(enabledCount, 0), normalizedTotal);
    const disabledCount = normalizedTotal - normalizedEnabled;

    return {
      moduleKey,
      moduleName: humanizeModuleName(moduleKey),
      totalPermissions: normalizedTotal,
      enabledCount: normalizedEnabled,
      disabledCount,
      allSelected: normalizedTotal > 0 && normalizedEnabled === normalizedTotal,
      allDisabled: normalizedEnabled === 0,
    };
  }
}

function normalizePermissionIds(permissionIds: string[]): string[] {
  const ids = permissionIds.map((id) => id.trim()).filter((id) => id.length > 0);
  return Array.from(new Set(ids));
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeModuleKey(moduleKey: string): string {
  return moduleKey.trim().toLowerCase();
}
