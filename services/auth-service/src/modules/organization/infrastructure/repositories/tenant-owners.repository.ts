import { Injectable } from "@nestjs/common";
import { Prisma, RoleStatus, TenantUserStatus, UserRoleStatus, UserStatus } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

const TENANT_OWNER_ROLE_CODE = "TENANT_OWNER";

export class TenantOwnerRoleNotConfiguredError extends Error {
  constructor() {
    super("Vai trò TENANT_OWNER chưa được cấu hình");
  }
}

const tenantOwnerInclude = {
  tenantUsers: {
    include: {
      tenant: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 1,
  },
  userRoles: {
    where: {
      status: UserRoleStatus.ACTIVE,
      role: {
        status: RoleStatus.ACTIVE,
        code: TENANT_OWNER_ROLE_CODE,
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
    take: 1,
  },
} satisfies Prisma.UserInclude;

export type TenantOwnerRow = Prisma.UserGetPayload<{ include: typeof tenantOwnerInclude }>;

@Injectable()
export class TenantOwnersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActorRoleCodes(userId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE,
            role: { status: RoleStatus.ACTIVE },
          },
          select: {
            role: { select: { code: true } },
          },
        },
      },
    });

    return actor?.userRoles.map((entry) => entry.role.code) ?? [];
  }

  async listTenantOwners(
    where: Prisma.UserWhereInput,
    tenantUserWhere: Prisma.TenantUserWhereInput,
    skip: number,
    take: number,
  ) {
    const include = this.buildTenantOwnerInclude(tenantUserWhere);

    return this.prisma.$transaction(async (tx) => {
      const total = await tx.user.count({ where });
      const rows = await tx.user.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async findTenantOwnerByUserId(userId: string) {
    return this.prisma.user.findFirst({
      where: this.buildTenantOwnerWhere({ userId }),
      include: tenantOwnerInclude,
    });
  }

  async createTenantOwner(input: {
    normalizedEmail: string;
    fullName: string;
    passwordHash: string;
    tenantCode: string;
    tenantName: string;
    assignedById: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenantOwnerRole = await tx.role.findFirst({
        where: {
          code: TENANT_OWNER_ROLE_CODE,
          status: RoleStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (!tenantOwnerRole) {
        throw new TenantOwnerRoleNotConfiguredError();
      }

      const owner = await tx.user.create({
        data: {
          email: input.normalizedEmail,
          passwordHash: input.passwordHash,
          fullName: input.fullName,
          status: UserStatus.ACTIVE,
          userType: "PARTNER",
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          code: input.tenantCode,
          name: input.tenantName,
        },
      });

      const joinedAt = new Date();
      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          status: TenantUserStatus.ACTIVE,
          joinedAt,
        },
      });

      await tx.userRole.create({
        data: {
          userId: owner.id,
          roleId: tenantOwnerRole.id,
          status: UserRoleStatus.ACTIVE,
          assignedAt: joinedAt,
          assignedById: input.assignedById,
        },
      });

      return this.findTenantOwnerByUserIdInTransaction(tx, owner.id);
    });
  }

  async updateTenantOwner(input: {
    userId: string;
    tenantUserId: string;
    tenantId: string;
    owner?: Prisma.UserUpdateInput;
    tenant?: Prisma.TenantUpdateInput;
    tenantUserStatus?: TenantUserStatus;
    joinedAt?: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.owner && Object.keys(input.owner).length > 0) {
        await tx.user.update({
          where: { id: input.userId },
          data: input.owner,
        });
      }

      if (input.tenant && Object.keys(input.tenant).length > 0) {
        await tx.tenant.update({
          where: { id: input.tenantId },
          data: input.tenant,
        });
      }

      if (input.tenantUserStatus) {
        await tx.tenantUser.update({
          where: { id: input.tenantUserId },
          data: {
            status: input.tenantUserStatus,
            joinedAt: input.joinedAt,
          },
        });
      }

      return this.findTenantOwnerByUserIdInTransaction(tx, input.userId);
    });
  }

  buildTenantOwnerWhere(input: {
    userId?: string;
    tenantId?: string;
    ownerStatus?: UserStatus;
    tenantUserStatus?: TenantUserStatus;
    q?: string;
  }): Prisma.UserWhereInput {
    const tenantUserWhere = this.buildTenantUserWhere(input);
    const where: Prisma.UserWhereInput = {
      ...(input.userId ? { id: input.userId } : {}),
      ...(input.ownerStatus ? { status: input.ownerStatus } : {}),
      userRoles: {
        some: {
          status: UserRoleStatus.ACTIVE,
          role: {
            code: TENANT_OWNER_ROLE_CODE,
            status: RoleStatus.ACTIVE,
          },
        },
      },
      tenantUsers: {
        some: tenantUserWhere,
      },
    };

    const needle = input.q?.trim();
    if (needle) {
      where.OR = [
        { email: { contains: needle, mode: "insensitive" } },
        { fullName: { contains: needle, mode: "insensitive" } },
        {
          tenantUsers: {
            some: {
              ...tenantUserWhere,
              tenant: {
                OR: [
                  { code: { contains: needle, mode: "insensitive" } },
                  { name: { contains: needle, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ];
    }

    return where;
  }

  buildTenantUserWhere(input: {
    tenantId?: string;
    tenantUserStatus?: TenantUserStatus;
  }): Prisma.TenantUserWhereInput {
    return {
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.tenantUserStatus ? { status: input.tenantUserStatus } : {}),
    };
  }

  private buildTenantOwnerInclude(tenantUserWhere: Prisma.TenantUserWhereInput) {
    return {
      ...tenantOwnerInclude,
      tenantUsers: {
        ...tenantOwnerInclude.tenantUsers,
        where: tenantUserWhere,
      },
    } satisfies Prisma.UserInclude;
  }

  private async findTenantOwnerByUserIdInTransaction(tx: Prisma.TransactionClient, userId: string) {
    return tx.user.findFirstOrThrow({
      where: this.buildTenantOwnerWhere({ userId }),
      include: tenantOwnerInclude,
    });
  }
}
