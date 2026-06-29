import { Injectable } from "@nestjs/common";
import {
  Prisma,
  RoleStatus,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const tenantScopedUserInclude = {
  user: {
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
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TenantUserInclude;

export type TenantScopedHotelUserRow = Prisma.TenantUserGetPayload<{
  include: typeof tenantScopedUserInclude;
}>;

@Injectable()
export class HotelUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActorById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE,
            role: {
              status: RoleStatus.ACTIVE,
            },
          },
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
        tenantUsers: {
          where: {
            status: TenantUserStatus.ACTIVE,
          },
          select: {
            tenantId: true,
          },
        },
      },
    });
  }

  async findTenantById(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
  }

  async findRolesByIds(roleIds: string[]) {
    return this.prisma.role.findMany({
      where: {
        id: {
          in: roleIds,
        },
        status: RoleStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }

  async createHotelUserWithTenantAndRoles(input: {
    tenantId: string;
    normalizedEmail: string;
    fullName: string;
    passwordHash: string;
    roleIds: string[];
    assignedById: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.normalizedEmail,
          passwordHash: input.passwordHash,
          fullName: input.fullName,
          status: UserStatus.ACTIVE,
          userType: UserType.HOTEL_STAFF,
        },
      });

      await tx.tenantUser.create({
        data: {
          tenantId: input.tenantId,
          userId: createdUser.id,
          status: TenantUserStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      if (input.roleIds.length > 0) {
        const assignedAt = new Date();

        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            userId: createdUser.id,
            roleId,
            status: UserRoleStatus.ACTIVE,
            assignedAt,
            assignedById: input.assignedById,
          })),
          skipDuplicates: true,
        });
      }

      return createdUser;
    });
  }

  async listTenantUsers(where: Prisma.TenantUserWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.tenantUser.count({ where });
      const rows = await tx.tenantUser.findMany({
        where,
        include: tenantScopedUserInclude,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async findTenantUserMembership(tenantId: string, userId: string) {
    return this.prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            userType: true,
          },
        },
      },
    });
  }

  async updateTenantUserStatus(
    tenantId: string,
    userId: string,
    status: TenantUserStatus,
    joinedAt: Date | undefined,
  ) {
    return this.prisma.tenantUser.update({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      data: {
        status,
        joinedAt,
      },
    });
  }

  async upsertActiveUserRoles(userId: string, roleIds: string[], assignedById: string) {
    if (roleIds.length === 0) {
      return [];
    }

    const assignedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId,
          roleId,
          status: UserRoleStatus.ACTIVE,
          assignedAt,
          assignedById,
        })),
        skipDuplicates: true,
      });
      const updated = await tx.userRole.updateMany({
        where: {
          userId,
          roleId: {
            in: roleIds,
          },
        },
        data: {
          status: UserRoleStatus.ACTIVE,
          assignedAt,
          assignedById,
          revokedAt: null,
          revokedById: null,
        },
      });

      return [created, updated] as const;
    });
  }

  async revokeActiveUserRole(userId: string, roleId: string, revokedById: string) {
    return this.prisma.userRole.updateMany({
      where: {
        userId,
        roleId,
        status: UserRoleStatus.ACTIVE,
      },
      data: {
        status: UserRoleStatus.REVOKED,
        revokedAt: new Date(),
        revokedById,
      },
    });
  }

  async findTenantScopedHotelUser(tenantId: string, userId: string) {
    return this.prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      include: tenantScopedUserInclude,
    });
  }
}
