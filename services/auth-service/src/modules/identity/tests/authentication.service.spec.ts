import { UnauthorizedException } from "@nestjs/common";
import { AuthSessionStatus, UserStatus } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import * as argon2 from "argon2";
import { AuthService } from "../application/authentication.service";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";

describe("AuthService", () => {
  let service: AuthService;
  let repository: Record<string, jest.Mock>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(() => {
    repository = {
      findUserByEmail: jest.fn(),
      findPrimaryActiveRoleIdByUserId: jest.fn(),
      countActiveRoleByUserId: jest.fn().mockResolvedValue(1),
      updateUserPasswordHash: jest.fn(),
      updateUserLastLogin: jest.fn(),
      createAuthSession: jest.fn(),
      findAuthSessionByCurrentRefreshHash: jest.fn(),
      findAuthSessionByHistoricalRefreshHash: jest.fn(),
      findRefreshIdempotency: jest.fn(),
      rotateAuthSession: jest.fn(),
      migrateLegacyRefreshToken: jest.fn(),
      findRefreshTokenWithUserByHash: jest.fn(),
      findAuthSessionById: jest.fn(),
      revokeAuthSession: jest.fn(),
      revokeAuthSessionFamily: jest.fn(),
      revokeAuthSessionsByUserId: jest.fn(),
      revokeAuthSessionsByRoleId: jest.fn(),
      revokeAuthSessionsByUserRole: jest.fn(),
      findUserProfileWithRelations: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue("access-token"),
      verifyAsync: jest.fn(),
    };
    service = new AuthService(
      repository as unknown as AuthRepository,
      jwtService as unknown as JwtService,
    );
  });

  it("returns deduplicated permissions required by the auth/me contract", async () => {
    repository.findUserProfileWithRelations.mockResolvedValue({
      id: "u1",
      email: "frontdesk@vietsage.local",
      fullName: "Front Desk",
      status: UserStatus.ACTIVE,
      userRoles: [
        {
          role: {
            code: "HOTEL_FRONTDESK",
            rolePermissions: [
              { permission: { path: "hotel.stays.view" } },
              { permission: { path: "hotel.stays.manage" } },
            ],
          },
        },
        {
          role: {
            code: "HOTEL_FRONTDESK_BACKUP",
            rolePermissions: [{ permission: { path: "hotel.stays.view" } }],
          },
        },
      ],
      tenantUsers: [
        { tenantId: "tenant-1", tenant: { id: "tenant-1", code: "T1", name: "Tenant 1" } },
      ],
      hotelAssignments: [
        {
          hotel: {
            id: "hotel-2",
            tenantId: "tenant-1",
            code: "H2",
            name: "Hotel 2",
            status: "ACTIVE",
          },
        },
        {
          hotel: {
            id: "hotel-outside-tenant",
            tenantId: "tenant-2",
            code: "HX",
            name: "Hotel outside tenant",
            status: "ACTIVE",
          },
        },
        {
          hotel: {
            id: "hotel-1",
            tenantId: "tenant-1",
            code: "H1",
            name: "Hotel 1",
            status: "ACTIVE",
          },
        },
      ],
    });

    await expect(service.getMe("u1")).resolves.toMatchObject({
      roles: ["HOTEL_FRONTDESK", "HOTEL_FRONTDESK_BACKUP"],
      permissions: ["hotel.stays.manage", "hotel.stays.view"],
      accessibleHotels: [
        { id: "hotel-1", code: "H1", name: "Hotel 1", tenantId: "tenant-1" },
        { id: "hotel-2", code: "H2", name: "Hotel 2", tenantId: "tenant-1" },
      ],
    });
  });

  it("validates an active user and upgrades a legacy password hash", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "u1",
      email: "admin@vietsage.local",
      status: UserStatus.ACTIVE,
      passwordHash: createHash("sha256").update("Password123!").digest("hex"),
    });
    repository.findPrimaryActiveRoleIdByUserId.mockResolvedValue({ roleId: "r1" });

    await expect(service.validateUser("admin@vietsage.local", "Password123!")).resolves.toEqual({
      userId: "u1",
      email: "admin@vietsage.local",
      roleId: "r1",
    });
    expect(repository.updateUserPasswordHash.mock.calls[0][1]).toEqual(
      expect.stringContaining("$argon2"),
    );
  });

  it("validates an argon2 password without rewriting it", async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: "u1",
      email: "admin@vietsage.local",
      status: UserStatus.ACTIVE,
      passwordHash: await argon2.hash("Password123!"),
    });
    repository.findPrimaryActiveRoleIdByUserId.mockResolvedValue({ roleId: "r1" });

    await service.validateUser("admin@vietsage.local", "Password123!");
    expect(repository.updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("creates independent opaque sessions for repeated same-user login", async () => {
    const user = { userId: "u1", email: "admin@vietsage.local", roleId: "r1" };
    const [first, second] = await Promise.all([service.login(user), service.login(user)]);

    expect(first.refreshToken).toMatch(/^vsr_[A-Za-z0-9_-]+$/);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(repository.createAuthSession).toHaveBeenCalledTimes(2);
    expect(repository).not.toHaveProperty("deleteRefreshTokensByUserId");
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sid: expect.any(String), roleId: "r1", type: "access" }),
      expect.objectContaining({ issuer: expect.any(String), audience: expect.any(String) }),
    );
  });

  it("returns one rotation result to 20 concurrent retries with the same key", async () => {
    const session = activeSession();
    let stored: { encryptedResult: string; requestFingerprint: string; idempotencyExpiresAt: Date };
    repository.findAuthSessionByCurrentRefreshHash.mockResolvedValue(session);
    repository.rotateAuthSession.mockImplementation(async (input) => {
      if (!stored) {
        stored = input;
        return true;
      }
      return false;
    });
    repository.findRefreshIdempotency.mockImplementation(async () => ({
      encryptedResult: stored.encryptedResult,
      requestFingerprint: stored.requestFingerprint,
      expiresAt: stored.idempotencyExpiresAt,
    }));

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.refresh(`vsr_${"a".repeat(64)}`, "retry-key")),
    );

    expect(repository.rotateAuthSession).toHaveBeenCalledTimes(20);
    expect(new Set(results.map((result) => result.refreshToken)).size).toBe(1);
    expect(new Set(results.map((result) => result.accessToken)).size).toBe(1);
  });

  it("revokes the refresh family when an old token is replayed with another key", async () => {
    repository.findAuthSessionByCurrentRefreshHash.mockResolvedValue(null);
    repository.findAuthSessionByHistoricalRefreshHash.mockResolvedValue({
      session: { id: "s1", refreshFamilyId: "family-1" },
    });
    repository.findRefreshIdempotency.mockResolvedValue(null);

    await expect(service.refresh(`vsr_${"b".repeat(64)}`, "different-key")).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repository.revokeAuthSessionFamily).toHaveBeenCalledWith(
      "family-1",
      "REFRESH_TOKEN_REPLAYED",
    );
  });

  it("migrates a valid legacy refresh JWT once", async () => {
    repository.findAuthSessionByCurrentRefreshHash.mockResolvedValue(null);
    repository.findAuthSessionByHistoricalRefreshHash.mockResolvedValue(null);
    jwtService.verifyAsync.mockResolvedValue({ sub: "u1", roleId: "r1", type: "refresh" });
    repository.findRefreshTokenWithUserByHash.mockResolvedValue({
      id: "legacy-1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", email: "admin@vietsage.local", status: UserStatus.ACTIVE },
    });
    repository.migrateLegacyRefreshToken.mockResolvedValue(true);

    const result = await service.refresh("legacy.jwt.token", "legacy-key");

    expect(result.refreshToken).toMatch(/^vsr_/);
    expect(repository.migrateLegacyRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ legacyTokenId: "legacy-1", legacyTokenHash: expect.any(String) }),
    );
  });

  it("rejects an access JWT after its session is revoked", async () => {
    repository.findAuthSessionById.mockResolvedValue({
      ...activeSession(),
      status: AuthSessionStatus.REVOKED,
    });

    await expect(
      service.validateJwtPayload({
        jti: "j1",
        sid: "s1",
        sub: "u1",
        email: "admin@vietsage.local",
        roleId: "r1",
        type: "access",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("expires a stale session during access validation", async () => {
    repository.findAuthSessionById.mockResolvedValue({
      ...activeSession(),
      idleExpiresAt: new Date(Date.now() - 1),
    });

    await expect(service.validateJwtPayload(accessPayload())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repository.revokeAuthSession).toHaveBeenCalledWith("s1", "EXPIRED", "EXPIRED");
  });

  it("revokes all sessions when the account is disabled", async () => {
    repository.findAuthSessionById.mockResolvedValue({
      ...activeSession(),
      user: { ...activeSession().user, status: UserStatus.DISABLED },
    });

    await expect(service.validateJwtPayload(accessPayload())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repository.revokeAuthSessionsByUserId).toHaveBeenCalledWith("u1", "USER_DISABLED");
  });

  it("revokes the session when its role assignment is removed", async () => {
    repository.findAuthSessionById.mockResolvedValue(activeSession());
    repository.countActiveRoleByUserId.mockResolvedValue(0);

    await expect(service.validateJwtPayload(accessPayload())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repository.revokeAuthSession).toHaveBeenCalledWith("s1", "ROLE_CHANGED");
  });

  it("treats logout of an already revoked session as idempotent", async () => {
    repository.revokeAuthSession.mockResolvedValue({ count: 0 });
    await expect(service.logout("s1")).resolves.toBeUndefined();
  });
});

function activeSession() {
  return {
    id: "s1",
    userId: "u1",
    roleId: "r1",
    status: AuthSessionStatus.ACTIVE,
    version: 1,
    refreshFamilyId: "family-1",
    currentRefreshHash: "hash",
    idleExpiresAt: new Date(Date.now() + 60_000),
    absoluteExpiresAt: new Date(Date.now() + 120_000),
    user: { id: "u1", email: "admin@vietsage.local", status: UserStatus.ACTIVE },
  };
}

function accessPayload() {
  return {
    jti: "j1",
    sid: "s1",
    sub: "u1",
    email: "admin@vietsage.local",
    roleId: "r1",
    type: "access" as const,
  };
}
