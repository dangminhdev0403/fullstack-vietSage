import { Injectable } from "@nestjs/common";
import {
  AuthSessionRevokeReason,
  AuthSessionStatus,
  HotelStaffAssignmentStatus,
  HotelStatus,
  HttpMethod,
  Prisma,
  RoleStatus,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

interface CreateAuthSessionInput {
  id: string;
  userId: string;
  roleId: string;
  currentRefreshHash: string;
  refreshFamilyId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

interface RotateAuthSessionInput {
  sessionId: string;
  expectedVersion: number;
  currentRefreshHash: string;
  nextRefreshHash: string;
  nextIdleExpiresAt: Date;
  rotatedAt: Date;
  historyExpiresAt: Date;
  idempotencyKey: string;
  requestFingerprint: string;
  encryptedResult: string;
  idempotencyExpiresAt: Date;
}

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

  async createAuthSession(input: CreateAuthSessionInput) {
    return this.prisma.authSession.create({ data: input });
  }

  async findAuthSessionById(sessionId: string) {
    return this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
  }

  async findAuthSessionByCurrentRefreshHash(tokenHash: string) {
    return this.prisma.authSession.findUnique({
      where: { currentRefreshHash: tokenHash },
      include: { user: true },
    });
  }

  async findAuthSessionByHistoricalRefreshHash(tokenHash: string) {
    return this.prisma.authRefreshTokenHistory.findUnique({
      where: { tokenHash },
      include: {
        session: {
          include: { user: true },
        },
      },
    });
  }

  async findRefreshIdempotency(sessionId: string, idempotencyKey: string) {
    return this.prisma.authRefreshIdempotency.findUnique({
      where: {
        sessionId_idempotencyKey: {
          sessionId,
          idempotencyKey,
        },
      },
    });
  }

  async rotateAuthSession(input: RotateAuthSessionInput): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rotated = await tx.authSession.updateMany({
          where: {
            id: input.sessionId,
            status: AuthSessionStatus.ACTIVE,
            version: input.expectedVersion,
            currentRefreshHash: input.currentRefreshHash,
          },
          data: {
            currentRefreshHash: input.nextRefreshHash,
            version: { increment: 1 },
            idleExpiresAt: input.nextIdleExpiresAt,
            lastUsedAt: input.rotatedAt,
            rotatedAt: input.rotatedAt,
          },
        });

        if (rotated.count !== 1) {
          return false;
        }

        await tx.authRefreshTokenHistory.create({
          data: {
            sessionId: input.sessionId,
            tokenHash: input.currentRefreshHash,
            expiresAt: input.historyExpiresAt,
          },
        });
        await tx.authRefreshIdempotency.create({
          data: {
            sessionId: input.sessionId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            encryptedResult: input.encryptedResult,
            expiresAt: input.idempotencyExpiresAt,
          },
        });

        return true;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  async migrateLegacyRefreshToken(input: {
    legacyTokenId: string;
    legacyTokenHash: string;
    session: CreateAuthSessionInput;
    historyExpiresAt: Date;
    idempotencyKey: string;
    requestFingerprint: string;
    encryptedResult: string;
    idempotencyExpiresAt: Date;
  }): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.refreshToken.deleteMany({
          where: {
            id: input.legacyTokenId,
            tokenHash: input.legacyTokenHash,
          },
        });
        if (consumed.count !== 1) {
          return false;
        }

        await tx.authSession.create({ data: input.session });
        await tx.authRefreshTokenHistory.create({
          data: {
            sessionId: input.session.id,
            tokenHash: input.legacyTokenHash,
            expiresAt: input.historyExpiresAt,
          },
        });
        await tx.authRefreshIdempotency.create({
          data: {
            sessionId: input.session.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            encryptedResult: input.encryptedResult,
            expiresAt: input.idempotencyExpiresAt,
          },
        });
        return true;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  async revokeAuthSession(
    sessionId: string,
    reason: AuthSessionRevokeReason,
    status: AuthSessionStatus = AuthSessionStatus.REVOKED,
  ) {
    return this.prisma.authSession.updateMany({
      where: { id: sessionId, status: AuthSessionStatus.ACTIVE },
      data: { status, revokeReason: reason, revokedAt: new Date() },
    });
  }

  async revokeAuthSessionFamily(refreshFamilyId: string, reason: AuthSessionRevokeReason) {
    return this.prisma.authSession.updateMany({
      where: { refreshFamilyId, status: AuthSessionStatus.ACTIVE },
      data: {
        status: AuthSessionStatus.COMPROMISED,
        revokeReason: reason,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAuthSessionsByUserId(userId: string, reason: AuthSessionRevokeReason) {
    return this.prisma.authSession.updateMany({
      where: { userId, status: AuthSessionStatus.ACTIVE },
      data: { status: AuthSessionStatus.REVOKED, revokeReason: reason, revokedAt: new Date() },
    });
  }

  async revokeAuthSessionsByUserRole(userId: string, roleId: string) {
    return this.prisma.authSession.updateMany({
      where: { userId, roleId, status: AuthSessionStatus.ACTIVE },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokeReason: AuthSessionRevokeReason.ROLE_CHANGED,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAuthSessionsByRoleId(roleId: string) {
    return this.prisma.authSession.updateMany({
      where: { roleId, status: AuthSessionStatus.ACTIVE },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokeReason: AuthSessionRevokeReason.ROLE_CHANGED,
        revokedAt: new Date(),
      },
    });
  }

  async touchAuthSession(sessionId: string, staleBefore: Date, idleExpiresAt: Date, now: Date) {
    return this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        status: AuthSessionStatus.ACTIVE,
        lastUsedAt: { lt: staleBefore },
      },
      data: { lastUsedAt: now, idleExpiresAt },
    });
  }

  async deleteExpiredAuthArtifacts(now: Date) {
    return this.prisma.$transaction([
      this.prisma.authRefreshIdempotency.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.authRefreshTokenHistory.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
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
          where: { status: TenantUserStatus.ACTIVE },
          include: {
            tenant: true,
          },
        },
        hotelAssignments: {
          where: {
            status: HotelStaffAssignmentStatus.ACTIVE,
            hotel: { status: HotelStatus.ACTIVE },
          },
          include: { hotel: true },
        },
      },
    });
  }

  async countUserWithRoutePermission(
    userId: string,
    roleId: string,
    method: HttpMethod,
    path: string,
  ) {
    return this.prisma.user.count({
      where: {
        id: userId,
        userRoles: {
          some: {
            roleId,
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

  async countUserWithBusinessPermission(userId: string, roleId: string, permissionKey: string) {
    return this.prisma.user.count({
      where: {
        id: userId,
        userRoles: {
          some: {
            roleId,
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
