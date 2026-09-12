import {
  BadRequestException,
  ConflictException,
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
import { RbacRepository } from "../infrastructure/repositories/rbac.repository";
import type {
  CreateRoleBodyInput,
  ListPermissionsQueryInput,
  ListRolePermissionModulePermissionsQueryInput,
  UpdateRoleBodyInput,
} from "../domain/schemas/rbac.schema";

const ALLOWED_BASE_ROLE_CODES = new Set([
  "TENANT_OWNER",
  "HOTEL_FRONTDESK",
  "SERVICE_STAFF",
]);

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
  baseRoleId: string | null;
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
  ) {}

  async listRoles(): Promise<FrontendNavigationRole[]> {
    const roles = await this.rbacRepository.listRolesWithRelations();
    return roles.map((role) => this.mapRoleToFrontendNavigation(role));
  }

  async createRole(dto: CreateRoleBodyInput): Promise<Role> {
    const code = dto.code.trim();
    const name = dto.name.trim();

    const permissionIds = dto.permissionIds.map((id) => id.trim());
    const uniqueSet = new Set(permissionIds);
    if (uniqueSet.size !== permissionIds.length) {
      throw new BadRequestException("Danh sách permissionIds chứa giá trị trùng lặp");
    }

    const existingRoleByCode = await this.rbacRepository.findRoleByCode(code);
    if (existingRoleByCode) {
      throw new ConflictException("Mã vai trò đã tồn tại");
    }

    const existingRoleByName = await this.rbacRepository.findRoleWithRelationsByName(name);
    if (existingRoleByName) {
      throw new ConflictException("Tên vai trò đã tồn tại");
    }

    const baseRole = await this.validateBaseRoleOrThrow(dto.baseRoleId);
    const validPermissionIds = await this.validatePermissionsSubsetOrThrow(
      dto.permissionIds,
      baseRole,
    );

    try {
      return await this.rbacRepository.createRoleWithPermissions({
        code,
        name,
        description: dto.description?.trim() || null,
        baseRoleId: baseRole.id,
        permissionIds: validPermissionIds,
      });
    } catch (error) {
      this.handlePrismaConflict(error);
      throw error;
    }
  }

  async updateRole(roleId: string, dto: UpdateRoleBodyInput): Promise<Role> {
    const role = await this.findRoleWithRelationsOrThrow(roleId);

    if (role.type === RoleType.SYSTEM_TEMPLATE) {
      throw new ForbiddenException(
        `Vai trò ${role.code} là vai trò hệ thống mặc định và không thể chỉnh sửa`,
      );
    }

    let nextName: string | undefined;
    if (dto.name !== undefined) {
      nextName = dto.name.trim();
      const existingRoleByName = await this.rbacRepository.findRoleWithRelationsByName(nextName);
      if (existingRoleByName && existingRoleByName.id !== roleId) {
        throw new ConflictException("Tên vai trò đã tồn tại");
      }
    }

    const targetBaseRoleId = dto.baseRoleId ?? role.baseRoleId;
    if (!targetBaseRoleId) {
      throw new BadRequestException(
        "Vai trò này cần được gán vai trò gốc (baseRoleId) hợp lệ trước khi chỉnh sửa",
      );
    }

    const baseRole = await this.validateBaseRoleOrThrow(targetBaseRoleId);

    let validPermissionIds: string[] | undefined;
    if (dto.permissionIds !== undefined) {
      validPermissionIds = await this.validatePermissionsSubsetOrThrow(
        dto.permissionIds,
        baseRole,
      );
    } else if (dto.baseRoleId !== undefined && dto.baseRoleId !== role.baseRoleId) {
      const currentPermissionIds = role.rolePermissions.map((rp) => rp.permissionId);
      validPermissionIds = await this.validatePermissionsSubsetOrThrow(
        currentPermissionIds,
        baseRole,
      );
    }

    try {
      return await this.rbacRepository.updateRoleWithPermissions(
        roleId,
        {
          name: nextName,
          description: dto.description !== undefined ? (dto.description?.trim() || null) : undefined,
          baseRoleId: dto.baseRoleId !== undefined ? baseRole.id : undefined,
        },
        validPermissionIds,
      );
    } catch (error) {
      this.handlePrismaConflict(error);
      throw error;
    }
  }

  async deleteRole(roleId: string): Promise<{ deleted: true }> {
    const role = await this.findRoleOrThrow(roleId);

    if (role.type === RoleType.SYSTEM_TEMPLATE) {
      throw new ForbiddenException(
        `Vai trò ${role.code} là vai trò hệ thống mặc định và không thể xóa`,
      );
    }

    const assignedUsersCount = await this.rbacRepository.countUserRolesByRoleId(roleId);
    if (assignedUsersCount > 0) {
      throw new ConflictException("Không thể xóa vai trò đang có người dùng được gán");
    }

    await this.rbacRepository.deleteRole(roleId);
    return { deleted: true };
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
      baseRoleId: role.baseRoleId ?? null,
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

  private async validateBaseRoleOrThrow(baseRoleId: string): Promise<RoleWithRelations> {
    const baseRole = await this.rbacRepository.findRoleWithRelationsById(baseRoleId);

    if (!baseRole) {
      throw new NotFoundException("Không tìm thấy vai trò gốc");
    }

    if (
      baseRole.status !== RoleStatus.ACTIVE ||
      baseRole.type !== RoleType.SYSTEM_TEMPLATE ||
      !ALLOWED_BASE_ROLE_CODES.has(baseRole.code) ||
      baseRole.code === "SUPER_ADMIN"
    ) {
      throw new BadRequestException(
        "Vai trò gốc không hợp lệ. Chỉ chấp nhận các vai trò mặc định: TENANT_OWNER, HOTEL_FRONTDESK, SERVICE_STAFF",
      );
    }

    return baseRole;
  }

  private async validatePermissionsSubsetOrThrow(
    permissionIdsInput: string[],
    baseRole: RoleWithRelations,
  ): Promise<string[]> {
    const permissionIds = permissionIdsInput.map((id) => id.trim());

    const uniqueSet = new Set(permissionIds);
    if (uniqueSet.size !== permissionIds.length) {
      throw new BadRequestException("Danh sách permissionIds chứa giá trị trùng lặp");
    }

    if (permissionIds.length === 0) {
      return [];
    }

    const existingPermissions = await this.rbacRepository.findPermissionsByIds(permissionIds);
    if (existingPermissions.length !== permissionIds.length) {
      const existingIdSet = new Set(existingPermissions.map((p) => p.id));
      const missingIds = permissionIds.filter((id) => !existingIdSet.has(id));
      throw new BadRequestException(`Các id quyền không tồn tại: ${missingIds.join(", ")}`);
    }

    const basePermissionIdSet = new Set(
      baseRole.rolePermissions.map((rp) => rp.permissionId),
    );
    const notInBaseIds = permissionIds.filter((id) => !basePermissionIdSet.has(id));
    if (notInBaseIds.length > 0) {
      throw new BadRequestException(
        `Các quyền không thuộc phạm vi của vai trò gốc (${baseRole.code}): ${notInBaseIds.join(", ")}`,
      );
    }

    return permissionIds;
  }

  private handlePrismaConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[]) ?? [];
      if (target.includes("code")) {
        throw new ConflictException("Mã vai trò đã tồn tại");
      }
      if (target.includes("name")) {
        throw new ConflictException("Tên vai trò đã tồn tại");
      }
      throw new ConflictException("Vai trò đã tồn tại");
    }
  }
}

function normalizeModuleKey(moduleKey: string): string {
  return moduleKey.trim().toLowerCase();
}
