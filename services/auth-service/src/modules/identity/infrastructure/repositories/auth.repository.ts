import { Injectable } from "@nestjs/common";
import { HttpMethod, RoleStatus, UserRoleStatus, UserStatus, UserType } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async findPrimaryActiveRoleIdByUserId(userId: string) {
    return this.prisma.userRole.findFirst({
      where: {
        userId,
        status: UserRoleStatus.ACTIVE,
        role: {
          status: RoleStatus.ACTIVE,
        },
      },
      orderBy: [{ assignedAt: "asc" }],
      select: {
        roleId: true,
      },
    });
  }

  async countActiveRoleByUserId(userId: string, roleId: string) {
    return this.prisma.userRole.count({
      where: {
        userId,
        roleId,
        status: UserRoleStatus.ACTIVE,
        role: {
          status: RoleStatus.ACTIVE,
        },
      },
    });
  }

  async upsertUserByEmail(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    status: UserStatus;
    userType: UserType;
  }) {
    return this.prisma.user.upsert({
      where: {
        email: data.email,
      },
      update: {
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        status: data.status,
        userType: data.userType,
      },
      create: data,
    });
  }

  async updateUserPasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async updateUserLastLogin(userId: string, lastLoginAt: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt },
    });
  }

  async findRefreshTokenWithUserByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async rotateRefreshTokenById(
    tokenId: string,
    currentTokenHash: string,
    nextTokenHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.refreshToken.updateMany({
      where: {
        id: tokenId,
        tokenHash: currentTokenHash,
      },
      data: {
        tokenHash: nextTokenHash,
        expiresAt,
      },
    });
  }

  async deleteRefreshTokenByHash(tokenHash: string) {
    return this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async deleteRefreshTokensByUserId(userId: string) {
    return this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findUserProfileWithRelations(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE,
            role: {
              status: RoleStatus.ACTIVE,
            },
          },
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        tenantUsers: {
          include: {
            tenant: true,
          },
        },
      },
    });
  }

  async countUserWithRoutePermission(userId: string, method: HttpMethod, path: string) {
    return this.prisma.user.count({
      where: {
        id: userId,
        userRoles: {
          some: {
            status: UserRoleStatus.ACTIVE,
            role: {
              status: RoleStatus.ACTIVE,
              rolePermissions: {
                some: {
                  permission: {
                    method,
                    path,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async countPermissionByMethodPath(method: HttpMethod, path: string) {
    return this.prisma.permission.count({
      where: {
        method,
        path,
      },
    });
  }

  async countUserWithBusinessPermission(userId: string, permissionKey: string) {
    return this.prisma.user.count({
      where: {
        id: userId,
        userRoles: {
          some: {
            status: UserRoleStatus.ACTIVE,
            role: {
              status: RoleStatus.ACTIVE,
              rolePermissions: {
                some: {
                  permission: {
                    path: permissionKey,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async upsertBusinessPermission(data: { key: string; description: string; moduleKey: string }) {
    return this.upsertPermission(HttpMethod.OPTIONS, data.key, data.description, data.moduleKey);
  }

  async upsertPermission(method: HttpMethod, path: string, description: string, moduleKey: string) {
    return this.prisma.permission.upsert({
      where: {
        method_path: {
          method,
          path,
        },
      },
      update: {
        description,
        moduleKey,
      },
      create: {
        method,
        path,
        description,
        moduleKey,
      },
    });
  }

  async upsertRoleByCode(data: { code: string; name: string; description: string | null }) {
    return this.prisma.role.upsert({
      where: {
        code: data.code,
      },
      update: {},
      create: data,
    });
  }

  async upsertActiveUserRole(userId: string, roleId: string) {
    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
      update: {
        status: UserRoleStatus.ACTIVE,
        revokedAt: null,
        revokedById: null,
      },
      create: {
        userId,
        roleId,
        status: UserRoleStatus.ACTIVE,
      },
    });
  }

  async listPermissionIds() {
    const permissions = await this.prisma.permission.findMany({
      select: {
        id: true,
      },
    });

    return permissions.map((permission) => permission.id);
  }

  async createRolePermissions(roleId: string, permissionIds: string[]) {
    if (permissionIds.length === 0) {
      return { count: 0 };
    }

    return this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }
}
