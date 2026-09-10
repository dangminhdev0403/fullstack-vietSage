import { Injectable } from "@nestjs/common";
import { Prisma, RoleStatus, UserRoleStatus } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRole(data: { code: string; name: string; description: string | null }) {
    return this.prisma.role.create({
      data,
    });
  }

  async listRolesWithRelations() {
    return this.prisma.role.findMany({
      where: {
        status: "ACTIVE",
        code: {
          not: "SUPER_ADMIN",
        },
      },
      orderBy: [{ createdAt: "asc" }],
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
          orderBy: [{ permission: { method: "asc" } }, { permission: { path: "asc" } }],
        },
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
    });
  }

  async findRoleWithRelationsById(roleId: string) {
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
          orderBy: [{ permission: { method: "asc" } }, { permission: { path: "asc" } }],
        },
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
    });
  }

  async findRoleWithRelationsByName(name: string) {
    return this.prisma.role.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      orderBy: [{ createdAt: "asc" }],
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
          orderBy: [{ permission: { method: "asc" } }, { permission: { path: "asc" } }],
        },
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
    });
  }

  async findRoleById(roleId: string) {
    return this.prisma.role.findUnique({
      where: { id: roleId },
    });
  }

  async updateRole(
    roleId: string,
    data: {
      name?: string;
      description?: string | null;
      status?: RoleStatus;
    },
  ) {
    return this.prisma.role.update({
      where: { id: roleId },
      data,
    });
  }

  async deleteRole(roleId: string) {
    return this.prisma.role.delete({
      where: { id: roleId },
    });
  }

  async disableRole(roleId: string) {
    return this.updateRole(roleId, {
      status: RoleStatus.DISABLED,
    });
  }

  async listPermissions(where: Prisma.PermissionWhereInput) {
    return this.prisma.permission.findMany({
      where,
      orderBy: [{ method: "asc" }, { path: "asc" }],
    });
  }

  async listPermissionTotalsByModule() {
    return this.prisma.permission.groupBy({
      by: ["moduleKey"],
      _count: {
        _all: true,
      },
      orderBy: [{ moduleKey: "asc" }],
    });
  }

  async listRolePermissionModuleKeys(roleId: string) {
    return this.prisma.rolePermission.findMany({
      where: { roleId },
      select: {
        permission: {
          select: {
            moduleKey: true,
          },
        },
      },
    });
  }

  async countPermissionsByModuleKey(moduleKey: string) {
    return this.prisma.permission.count({
      where: {
        moduleKey,
      },
    });
  }

  async countRolePermissionsByModuleKey(roleId: string, moduleKey: string) {
    return this.prisma.rolePermission.count({
      where: {
        roleId,
        permission: {
          moduleKey,
        },
      },
    });
  }

  async listPermissionsByModuleKey(moduleKey: string, page: number, limit: number) {
    return this.prisma.permission.findMany({
      where: {
        moduleKey,
      },
      orderBy: [{ method: "asc" }, { path: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        method: true,
        path: true,
        description: true,
      },
    });
  }

  async listRolePermissionIdsByRoleAndPermissionIds(roleId: string, permissionIds: string[]) {
    if (!permissionIds.length) {
      return [];
    }

    return this.prisma.rolePermission.findMany({
      where: {
        roleId,
        permissionId: {
          in: permissionIds,
        },
      },
      select: {
        permissionId: true,
      },
    });
  }

  async findPermissionById(permissionId: string) {
    return this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
  }

  async findPermissionsByIds(permissionIds: string[]) {
    return this.prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: {
        id: true,
      },
    });
  }

  async findPermissionsByIdsWithModuleKey(permissionIds: string[]) {
    return this.prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: {
        id: true,
        moduleKey: true,
      },
    });
  }

  async findActiveRoleAccess(userId: string, roleId: string) {
    const row = await this.prisma.userRole.findFirst({
      where: {
        userId,
        roleId,
        status: UserRoleStatus.ACTIVE,
        role: {
          status: RoleStatus.ACTIVE,
        },
      },
      select: {
        role: {
          select: {
            code: true,
            rolePermissions: {
              select: {
                permissionId: true,
              },
            },
          },
        },
      },
    });

    return row
      ? {
          code: row.role.code,
          permissionIds: row.role.rolePermissions.map(({ permissionId }) => permissionId),
        }
      : null;
  }

  async listRolePermissions(roleId: string) {
    return this.prisma.rolePermission.findMany({
      where: { roleId },
      include: {
        permission: true,
      },
      orderBy: [{ permission: { method: "asc" } }, { permission: { path: "asc" } }],
    });
  }

  async listBusinessPermissionsForRole(roleId: string, permissionKeys: string[]) {
    return this.prisma.permission.findMany({
      where: {
        method: "OPTIONS",
        path: { in: permissionKeys },
      },
      orderBy: [{ moduleKey: "asc" }, { path: "asc" }],
      select: {
        id: true,
        path: true,
        moduleKey: true,
        description: true,
        rolePermissions: {
          where: { roleId },
          select: { roleId: true },
        },
      },
    });
  }

  async createRolePermissions(roleId: string, permissionIds: string[]) {
    return this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }

  async deleteRolePermissions(roleId: string, permissionIds: string[]) {
    return this.prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: {
          in: permissionIds,
        },
      },
    });
  }

  async clearRolePermissions(roleId: string) {
    return this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.rolePermission.deleteMany({
        where: { roleId },
      });
      const created = await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });

      return [deleted, created] as const;
    });
  }

  async replaceRoleBusinessPermissions(
    roleId: string,
    permissionIds: string[],
    permissionKeys: string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          permission: {
            method: "OPTIONS",
            path: { in: permissionKeys },
          },
        },
      });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
    });
  }
}
