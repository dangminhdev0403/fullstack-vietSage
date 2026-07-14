import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthSessionRevokeReason, AuthSessionStatus, UserStatus } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { Interval } from "@nestjs/schedule";
import * as argon2 from "argon2";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { loadAppConfig } from "../../../common/config/env.config";
import { DEFAULT_NAVIGATION_MENU } from "../../../common/config/navigation.config";
import { resolveBusinessPermissionMenuPath } from "../../../common/config/business-permission-menu.util";
import {
  resolvePermissionMenuPath,
  sortMenuPathsByNavigationOrder,
} from "../../../common/config/permission-module.util";
import { AppLogger } from "../../../common/logging/app-logger.service";
import type { AuthenticatedUser } from "../domain/authenticated-user";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";

const ACCESS_TOKEN_TYPE = "access";
const REFRESH_TOKEN_TYPE = "refresh";

interface AccessTokenPayload {
  jti: string;
  sid: string;
  sub: string;
  email: string;
  roleId: string;
  type: typeof ACCESS_TOKEN_TYPE;
}

interface LegacyRefreshTokenPayload {
  jti?: string;
  sub: string;
  roleId: string;
  type: typeof REFRESH_TOKEN_TYPE;
}

interface PasswordVerificationResult {
  valid: boolean;
  upgradedHash?: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTtl: string;
  refreshTtl: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  private readonly config = loadAppConfig();
  private readonly encryptionKey = createHash("sha256")
    .update(this.config.auth.idempotencyEncryptionKey)
    .digest();

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}

  getAccessTokenSecret(): string {
    return this.config.auth.jwtAccessSecret;
  }

  async validateUser(email: string, password: string): Promise<AuthenticatedUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(normalizedEmail);

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logAuthFailure("LOGIN_FAILURE", "invalid_credentials", user?.id);
      throw this.unauthorized("AUTH_INVALID_CREDENTIALS", "Invalid email or password");
    }

    const verification = await this.verifyPassword(password, user.passwordHash);
    if (!verification.valid) {
      this.logAuthFailure("LOGIN_FAILURE", "invalid_credentials", user.id);
      throw this.unauthorized("AUTH_INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (verification.upgradedHash) {
      await this.authRepository.updateUserPasswordHash(user.id, verification.upgradedHash);
    }

    return {
      userId: user.id,
      email: user.email,
      roleId: await this.resolvePrimaryRoleIdOrThrow(user.id),
    };
  }

  async login(user: AuthenticatedUser): Promise<AuthTokensResponse> {
    const now = new Date();
    const sessionId = randomUUID();
    const refreshFamilyId = randomUUID();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.parseTtlToMs(this.config.auth.sessionAbsoluteTtl),
    );
    const refreshExpiresAt = this.nextIdleExpiry(now, absoluteExpiresAt);
    const refreshToken = this.createOpaqueRefreshToken();

    await Promise.all([
      this.authRepository.updateUserLastLogin(user.userId, now),
      this.authRepository.createAuthSession({
        id: sessionId,
        userId: user.userId,
        roleId: user.roleId,
        currentRefreshHash: this.hashToken(refreshToken),
        refreshFamilyId,
        idleExpiresAt: refreshExpiresAt,
        absoluteExpiresAt,
      }),
    ]);

    const response = await this.buildTokenResponse(
      user.userId,
      user.email,
      user.roleId,
      sessionId,
      refreshToken,
      refreshExpiresAt,
    );
    this.logger.info("User logged in and an auth session was created", {
      module: "auth",
      service: "AuthService",
      operation: "login",
      event: "LOGIN_SUCCESS",
      userId: user.userId,
      roleId: user.roleId,
      sessionId,
    });
    return response;
  }

  async refresh(
    refreshToken: string,
    suppliedIdempotencyKey?: string,
  ): Promise<AuthTokensResponse> {
    const idempotencyKey = suppliedIdempotencyKey?.trim() || randomUUID();
    const tokenHash = this.hashToken(refreshToken);
    const fingerprint = this.hashToken(`refresh:${tokenHash}`);

    if (!/^vsr_[A-Za-z0-9_-]{64}$/.test(refreshToken)) {
      if (refreshToken.split(".").length !== 3) {
        throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
      }
      return this.migrateLegacyRefresh(refreshToken, tokenHash, idempotencyKey, fingerprint);
    }

    const current = await this.authRepository.findAuthSessionByCurrentRefreshHash(tokenHash);

    if (current) {
      return this.rotateCurrentSession(current, refreshToken, idempotencyKey, fingerprint);
    }

    const historical = await this.authRepository.findAuthSessionByHistoricalRefreshHash(tokenHash);
    if (historical) {
      return this.resolveHistoricalRefresh(historical.session, idempotencyKey, fingerprint);
    }

    throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
  }

  async logout(sessionId: string): Promise<void> {
    await this.authRepository.revokeAuthSession(sessionId, AuthSessionRevokeReason.LOGOUT);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.authRepository.revokeAuthSessionsByUserId(
      userId,
      AuthSessionRevokeReason.LOGOUT_ALL,
    );
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.authRepository.revokeAuthSessionsByUserId(
      userId,
      AuthSessionRevokeReason.USER_DISABLED,
    );
  }

  async revokeRoleSessions(roleId: string): Promise<void> {
    await this.authRepository.revokeAuthSessionsByRoleId(roleId);
  }

  async revokeUserRoleSessions(userId: string, roleId: string): Promise<void> {
    await this.authRepository.revokeAuthSessionsByUserRole(userId, roleId);
  }

  @Interval(300_000)
  async cleanupExpiredRefreshArtifacts(): Promise<void> {
    await this.authRepository.deleteExpiredAuthArtifacts(new Date());
  }

  async validateJwtPayload(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== ACCESS_TOKEN_TYPE || !payload.sid) {
      throw this.unauthorized("AUTH_ACCESS_TOKEN_INVALID", "Invalid access token");
    }

    const session = await this.authRepository.findAuthSessionById(payload.sid);
    if (!session || session.userId !== payload.sub || session.roleId !== payload.roleId) {
      throw this.unauthorized("AUTH_SESSION_INVALID", "Auth session is invalid");
    }

    const now = Date.now();
    if (
      session.status !== AuthSessionStatus.ACTIVE ||
      session.idleExpiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now
    ) {
      if (session.status === AuthSessionStatus.ACTIVE) {
        await this.authRepository.revokeAuthSession(
          session.id,
          AuthSessionRevokeReason.EXPIRED,
          AuthSessionStatus.EXPIRED,
        );
      }
      throw this.unauthorized("AUTH_SESSION_EXPIRED", "Auth session has expired");
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      await this.revokeUserSessions(session.userId);
      throw this.unauthorized("AUTH_USER_INACTIVE", "User is not active");
    }

    if ((await this.authRepository.countActiveRoleByUserId(session.userId, session.roleId)) === 0) {
      await this.authRepository.revokeAuthSession(session.id, AuthSessionRevokeReason.ROLE_CHANGED);
      throw this.unauthorized("AUTH_ROLE_INACTIVE", "User role is no longer active");
    }

    return {
      userId: session.user.id,
      email: session.user.email,
      roleId: session.roleId,
      sessionId: session.id,
    };
  }

  async getMe(userId: string): Promise<{
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
    roles: string[];
    menus: string[];
    tenants: Array<{ id: string; code: string; name: string; status: string }>;
  }> {
    const user = await this.authRepository.findUserProfileWithRelations(userId);
    if (!user) {
      throw this.unauthorized("AUTH_USER_NOT_FOUND", "User was not found");
    }

    const roles = Array.from(new Set(user.userRoles.map((entry) => entry.role.code))).sort();
    const menus = new Set<string>([DEFAULT_NAVIGATION_MENU]);
    for (const entry of user.userRoles) {
      for (const rolePermission of entry.role.rolePermissions) {
        const menuPath =
          resolveBusinessPermissionMenuPath(rolePermission.permission.path) ??
          resolvePermissionMenuPath(rolePermission.permission.path);
        if (menuPath) menus.add(menuPath);
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles,
      menus: sortMenuPathsByNavigationOrder(Array.from(menus)),
      tenants: user.tenantUsers.map((tenantUser) => ({
        id: tenantUser.tenant.id,
        code: tenantUser.tenant.code,
        name: tenantUser.tenant.name,
        status: tenantUser.status,
      })),
    };
  }

  private async rotateCurrentSession(
    session: Awaited<ReturnType<AuthRepository["findAuthSessionByCurrentRefreshHash"]>> & {},
    refreshToken: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<AuthTokensResponse> {
    await this.assertSessionCanRefresh(session);
    const now = new Date();
    const nextRefreshToken = this.createOpaqueRefreshToken();
    const nextRefreshExpiresAt = this.nextIdleExpiry(now, session.absoluteExpiresAt);
    const response = await this.buildTokenResponse(
      session.userId,
      session.user.email,
      session.roleId,
      session.id,
      nextRefreshToken,
      nextRefreshExpiresAt,
    );
    const rotated = await this.authRepository.rotateAuthSession({
      sessionId: session.id,
      expectedVersion: session.version,
      currentRefreshHash: this.hashToken(refreshToken),
      nextRefreshHash: this.hashToken(nextRefreshToken),
      nextIdleExpiresAt: nextRefreshExpiresAt,
      rotatedAt: now,
      historyExpiresAt: session.absoluteExpiresAt,
      idempotencyKey,
      requestFingerprint: fingerprint,
      encryptedResult: this.encryptResponse(response),
      idempotencyExpiresAt: new Date(
        now.getTime() + this.config.auth.refreshIdempotencyTtlSeconds * 1000,
      ),
    });

    if (rotated) return response;

    const retry = await this.authRepository.findRefreshIdempotency(session.id, idempotencyKey);
    if (
      retry &&
      retry.expiresAt.getTime() > Date.now() &&
      retry.requestFingerprint === fingerprint
    ) {
      return this.decryptResponse(retry.encryptedResult);
    }

    const historical = await this.authRepository.findAuthSessionByHistoricalRefreshHash(
      this.hashToken(refreshToken),
    );
    if (historical) {
      return this.resolveHistoricalRefresh(historical.session, idempotencyKey, fingerprint);
    }
    throw this.unauthorized("AUTH_REFRESH_CONFLICT", "Refresh token is no longer active");
  }

  private async resolveHistoricalRefresh(
    session: { id: string; refreshFamilyId: string },
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<AuthTokensResponse> {
    const retry = await this.authRepository.findRefreshIdempotency(session.id, idempotencyKey);
    if (
      retry &&
      retry.expiresAt.getTime() > Date.now() &&
      retry.requestFingerprint === fingerprint
    ) {
      return this.decryptResponse(retry.encryptedResult);
    }

    await this.authRepository.revokeAuthSessionFamily(
      session.refreshFamilyId,
      AuthSessionRevokeReason.REFRESH_TOKEN_REPLAYED,
    );
    throw this.unauthorized("AUTH_REFRESH_REPLAYED", "Refresh token replay was detected");
  }

  private async migrateLegacyRefresh(
    refreshToken: string,
    tokenHash: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<AuthTokensResponse> {
    if (
      this.config.auth.legacyRefreshAcceptUntil &&
      this.config.auth.legacyRefreshAcceptUntil.getTime() <= Date.now()
    ) {
      throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
    }

    let payload: LegacyRefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<LegacyRefreshTokenPayload>(refreshToken, {
        secret: this.config.auth.jwtRefreshSecret,
      });
    } catch {
      throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
    }
    if (payload.type !== REFRESH_TOKEN_TYPE) {
      throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
    }

    const legacy = await this.authRepository.findRefreshTokenWithUserByHash(tokenHash);
    if (!legacy || legacy.userId !== payload.sub || legacy.expiresAt.getTime() <= Date.now()) {
      throw this.unauthorized("AUTH_REFRESH_INVALID", "Invalid refresh token");
    }
    if (legacy.user.status !== UserStatus.ACTIVE) {
      throw this.unauthorized("AUTH_USER_INACTIVE", "User is not active");
    }
    if ((await this.authRepository.countActiveRoleByUserId(legacy.userId, payload.roleId)) === 0) {
      throw this.unauthorized("AUTH_ROLE_INACTIVE", "User role is no longer active");
    }

    const now = new Date();
    const sessionId = randomUUID();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.parseTtlToMs(this.config.auth.sessionAbsoluteTtl),
    );
    const refreshExpiresAt = this.nextIdleExpiry(now, absoluteExpiresAt);
    const nextRefreshToken = this.createOpaqueRefreshToken();
    const response = await this.buildTokenResponse(
      legacy.userId,
      legacy.user.email,
      payload.roleId,
      sessionId,
      nextRefreshToken,
      refreshExpiresAt,
    );
    const migrated = await this.authRepository.migrateLegacyRefreshToken({
      legacyTokenId: legacy.id,
      legacyTokenHash: tokenHash,
      session: {
        id: sessionId,
        userId: legacy.userId,
        roleId: payload.roleId,
        currentRefreshHash: this.hashToken(nextRefreshToken),
        refreshFamilyId: randomUUID(),
        idleExpiresAt: refreshExpiresAt,
        absoluteExpiresAt,
      },
      historyExpiresAt: legacy.expiresAt,
      idempotencyKey,
      requestFingerprint: fingerprint,
      encryptedResult: this.encryptResponse(response),
      idempotencyExpiresAt: new Date(
        now.getTime() + this.config.auth.refreshIdempotencyTtlSeconds * 1000,
      ),
    });
    if (migrated) return response;

    const historical = await this.authRepository.findAuthSessionByHistoricalRefreshHash(tokenHash);
    if (historical) {
      return this.resolveHistoricalRefresh(historical.session, idempotencyKey, fingerprint);
    }
    throw this.unauthorized("AUTH_REFRESH_CONFLICT", "Refresh token is no longer active");
  }

  private async assertSessionCanRefresh(session: {
    id: string;
    status: AuthSessionStatus;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    userId: string;
    roleId: string;
    user: { status: UserStatus };
  }): Promise<void> {
    const now = Date.now();
    if (
      session.status !== AuthSessionStatus.ACTIVE ||
      session.idleExpiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now
    ) {
      await this.authRepository.revokeAuthSession(
        session.id,
        AuthSessionRevokeReason.EXPIRED,
        AuthSessionStatus.EXPIRED,
      );
      throw this.unauthorized("AUTH_SESSION_EXPIRED", "Auth session has expired");
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      await this.revokeUserSessions(session.userId);
      throw this.unauthorized("AUTH_USER_INACTIVE", "User is not active");
    }
    if ((await this.authRepository.countActiveRoleByUserId(session.userId, session.roleId)) === 0) {
      await this.authRepository.revokeAuthSession(session.id, AuthSessionRevokeReason.ROLE_CHANGED);
      throw this.unauthorized("AUTH_ROLE_INACTIVE", "User role is no longer active");
    }
  }

  private async buildTokenResponse(
    userId: string,
    email: string,
    roleId: string,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthTokensResponse> {
    const issuedAt = Date.now();
    const accessExpiresAt = new Date(issuedAt + this.parseTtlToMs(this.config.auth.jwtAccessTtl));
    const accessToken = await this.jwtService.signAsync(
      {
        jti: randomUUID(),
        sid: sessionId,
        sub: userId,
        email,
        roleId,
        type: ACCESS_TOKEN_TYPE,
      } satisfies AccessTokenPayload,
      {
        secret: this.config.auth.jwtAccessSecret,
        expiresIn: this.config.auth.jwtAccessTtl,
        issuer: this.config.auth.jwtIssuer,
        audience: this.config.auth.jwtAudience,
      },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      accessTtl: this.config.auth.jwtAccessTtl,
      refreshTtl: this.config.auth.sessionIdleTtl,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      sessionId,
    };
  }

  private createOpaqueRefreshToken(): string {
    return `vsr_${randomBytes(48).toString("base64url")}`;
  }

  private encryptResponse(response: AuthTokensResponse): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(response), "utf8"),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  private decryptResponse(value: string): AuthTokensResponse {
    const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
    ) as AuthTokensResponse;
  }

  private async verifyPassword(
    plainPassword: string,
    storedPasswordHash: string,
  ): Promise<PasswordVerificationResult> {
    if (storedPasswordHash.startsWith("$argon2")) {
      return { valid: await argon2.verify(storedPasswordHash, plainPassword) };
    }
    if (this.hashToken(plainPassword) !== storedPasswordHash) return { valid: false };
    return { valid: true, upgradedHash: await argon2.hash(plainPassword) };
  }

  private nextIdleExpiry(now: Date, absoluteExpiresAt: Date): Date {
    return new Date(
      Math.min(
        now.getTime() + this.parseTtlToMs(this.config.auth.sessionIdleTtl),
        absoluteExpiresAt.getTime(),
      ),
    );
  }

  private hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private unauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }

  private logAuthFailure(event: string, reason: string, userId?: string): void {
    this.logger.warn("Authentication request rejected", {
      module: "auth",
      service: "AuthService",
      operation: "authenticate",
      event,
      reason,
      userId: userId ?? "unknown",
    });
  }

  private async resolvePrimaryRoleIdOrThrow(userId: string): Promise<string> {
    const role = await this.authRepository.findPrimaryActiveRoleIdByUserId(userId);
    if (!role) {
      throw this.unauthorized("AUTH_ROLE_MISSING", "User has no active role");
    }
    return role.roleId;
  }

  private parseTtlToMs(ttl: string): number {
    const normalized = ttl.trim();
    const unitMatch = normalized.match(/^(\d+)([smhd])$/i);
    if (unitMatch) {
      const amount = Number.parseInt(unitMatch[1], 10);
      const multipliers: Record<string, number> = {
        s: 1000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
      };
      return amount * multipliers[unitMatch[2].toLowerCase()];
    }
    const seconds = Number.parseInt(normalized, 10);
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new Error(`Unsupported TTL format: ${ttl}`);
    }
    return seconds * 1000;
  }
}
