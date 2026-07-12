import { UnauthorizedException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";
import { AuthService } from "../application/authentication.service";

describe("AuthService", () => {
  let service: AuthService;
  let authRepository: {
    findUserByEmail: jest.Mock;
    findPrimaryActiveRoleIdByUserId: jest.Mock;
    countActiveRoleByUserId: jest.Mock;
    updateUserPasswordHash: jest.Mock;
    findRefreshTokenWithUserByHash: jest.Mock;
    rotateRefreshTokenById: jest.Mock;
    createRefreshToken: jest.Mock;
    findUserById: jest.Mock;
    updateUserLastLogin: jest.Mock;
    deleteRefreshTokenByHash: jest.Mock;
    deleteRefreshTokensByUserId: jest.Mock;
    findUserProfileWithRelations: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };

  beforeEach(() => {
    authRepository = {
      findUserByEmail: jest.fn(),
      findPrimaryActiveRoleIdByUserId: jest.fn(),
      countActiveRoleByUserId: jest.fn(),
      updateUserPasswordHash: jest.fn(),
      findRefreshTokenWithUserByHash: jest.fn(),
      rotateRefreshTokenById: jest.fn(),
      createRefreshToken: jest.fn(),
      findUserById: jest.fn(),
      updateUserLastLogin: jest.fn(),
      deleteRefreshTokenByHash: jest.fn(),
      deleteRefreshTokensByUserId: jest.fn(),
      findUserProfileWithRelations: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    service = new AuthService(
      authRepository as unknown as AuthRepository,
      jwtService as unknown as JwtService,
    );
  });

  it("validates active user with argon2 password", async () => {
    const passwordHash = await argon2.hash("Password123!");

    authRepository.findUserByEmail.mockResolvedValue({
      id: "u1",
      email: "admin@vietsage.local",
      status: UserStatus.ACTIVE,
      passwordHash,
    });
    authRepository.findPrimaryActiveRoleIdByUserId.mockResolvedValue({ roleId: "r1" });

    const result = await service.validateUser("admin@vietsage.local", "Password123!");

    expect(result).toEqual({ userId: "u1", email: "admin@vietsage.local", roleId: "r1" });
    expect(authRepository.updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("upgrades legacy SHA-256 password hash after successful login", async () => {
    const legacyHash = createHash("sha256").update("Password123!").digest("hex");

    authRepository.findUserByEmail.mockResolvedValue({
      id: "u2",
      email: "legacy@vietsage.local",
      status: UserStatus.ACTIVE,
      passwordHash: legacyHash,
    });
    authRepository.findPrimaryActiveRoleIdByUserId.mockResolvedValue({ roleId: "r2" });

    authRepository.updateUserPasswordHash.mockResolvedValue(undefined);

    const result = await service.validateUser("legacy@vietsage.local", "Password123!");

    expect(result).toEqual({ userId: "u2", email: "legacy@vietsage.local", roleId: "r2" });
    expect(authRepository.updateUserPasswordHash).toHaveBeenCalledTimes(1);
    const updateCall = authRepository.updateUserPasswordHash.mock.calls[0];
    expect(updateCall[0]).toEqual("u2");
    expect(updateCall[1]).toEqual(expect.stringContaining("$argon2"));
  });

  it("rejects refresh when token was already rotated by concurrent request", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: "u1", roleId: "r1", type: "refresh" });
    jwtService.signAsync
      .mockResolvedValueOnce("access-token-new")
      .mockResolvedValueOnce("refresh-token-new");

    authRepository.findRefreshTokenWithUserByHash.mockResolvedValue({
      id: "rt-1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "u1",
        email: "admin@vietsage.local",
        status: UserStatus.ACTIVE,
      },
    });

    authRepository.countActiveRoleByUserId.mockResolvedValue(1);
    authRepository.rotateRefreshTokenById.mockResolvedValue({ count: 0 });

    await expect(service.refresh("refresh-token-value")).rejects.toThrow(
      "Refresh token is no longer active",
    );
  });

  it("rotates refresh token and returns new token pair", async () => {
    const inputRefreshToken = "refresh-token-value";

    jwtService.verifyAsync.mockResolvedValue({ sub: "u1", roleId: "r1", type: "refresh" });
    jwtService.signAsync
      .mockResolvedValueOnce("access-token-new")
      .mockResolvedValueOnce("refresh-token-new");

    authRepository.findRefreshTokenWithUserByHash.mockResolvedValue({
      id: "rt-1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "u1",
        email: "admin@vietsage.local",
        status: UserStatus.ACTIVE,
      },
    });

    authRepository.countActiveRoleByUserId.mockResolvedValue(1);
    authRepository.rotateRefreshTokenById.mockResolvedValue({ count: 1 });

    const result = await service.refresh(inputRefreshToken);

    expect(authRepository.rotateRefreshTokenById).toHaveBeenCalledWith(
      "rt-1",
      createHash("sha256").update(inputRefreshToken).digest("hex"),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );

    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();

    expect(result).toEqual({
      accessToken: "access-token-new",
      refreshToken: "refresh-token-new",
      tokenType: "Bearer",
      accessTtl: expect.any(String),
      refreshTtl: expect.any(String),
    });
  });

  it("includes roleId in access and refresh JWT payload", async () => {
    jwtService.signAsync
      .mockResolvedValueOnce("access-token")
      .mockResolvedValueOnce("refresh-token");
    authRepository.createRefreshToken.mockResolvedValue(undefined);
    authRepository.updateUserLastLogin.mockResolvedValue(undefined);
    authRepository.deleteRefreshTokensByUserId.mockResolvedValue({ count: 0 });

    await service.login({
      userId: "u1",
      email: "admin@vietsage.local",
      roleId: "r1",
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        jti: expect.any(String),
        sub: "u1",
        email: "admin@vietsage.local",
        roleId: "r1",
        type: "access",
      }),
      expect.any(Object),
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        jti: expect.any(String),
        sub: "u1",
        roleId: "r1",
        type: "refresh",
      }),
      expect.any(Object),
    );

    expect(authRepository.deleteRefreshTokensByUserId).toHaveBeenCalledWith("u1");
    expect(authRepository.createRefreshToken).toHaveBeenCalledWith(
      "u1",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
  });

  it("generates unique refresh JWT payloads for repeated same-user issuance", async () => {
    jwtService.signAsync.mockImplementation(async (payload: unknown) => JSON.stringify(payload));
    authRepository.createRefreshToken.mockResolvedValue(undefined);
    authRepository.updateUserLastLogin.mockResolvedValue(undefined);
    authRepository.deleteRefreshTokensByUserId.mockResolvedValue({ count: 0 });

    const user = {
      userId: "u1",
      email: "admin@vietsage.local",
      roleId: "r1",
    };

    const first = await service.login(user);
    const second = await service.login(user);

    expect(first.refreshToken).not.toEqual(second.refreshToken);

    const firstRefreshPayload = jwtService.signAsync.mock.calls[1][0];
    const secondRefreshPayload = jwtService.signAsync.mock.calls[3][0];

    expect(firstRefreshPayload).toEqual(
      expect.objectContaining({
        jti: expect.any(String),
        sub: "u1",
        roleId: "r1",
        type: "refresh",
      }),
    );
    expect(secondRefreshPayload).toEqual(
      expect.objectContaining({
        jti: expect.any(String),
        sub: "u1",
        roleId: "r1",
        type: "refresh",
      }),
    );
    expect(firstRefreshPayload.jti).not.toEqual(secondRefreshPayload.jti);
    expect(authRepository.createRefreshToken.mock.calls[0][1]).not.toEqual(
      authRepository.createRefreshToken.mock.calls[1][1],
    );
  });

  it("rejects JWT payload with wrong token type", async () => {
    await expect(
      service.validateJwtPayload({
        sub: "u1",
        jti: "access-jti",
        email: "admin@vietsage.local",
        roleId: "r1",
        type: "refresh" as "access",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
