import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { loadAppConfig } from "../../../common/config/env.config";
import {
  resolvePermissionMenuPath,
  sortMenuPathsByNavigationOrder,
} from "../../../common/config/permission-module.util";
import { resolveBusinessPermissionMenuPath } from "../../../common/config/business-permission-menu.util";
import { DEFAULT_NAVIGATION_MENU } from "../../../common/config/navigation.config";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";
import type { AuthenticatedUser } from "../domain/authenticated-user";
import { AppLogger } from "../../../common/logging/app-logger.service";

const ACCESS_TOKEN_TYPE = "access";
const REFRESH_TOKEN_TYPE = "refresh";

interface AccessTokenPayload {
  jti: string;
  sub: string;
  email: string;
  roleId: string;
  type: typeof ACCESS_TOKEN_TYPE;
}

interface RefreshTokenPayload {
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
}

interface IssuedAuthTokens {
  response: AuthTokensResponse;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly config = loadAppConfig();

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
      this.logger.warn("Login rejected because the account was missing or inactive", {
        module: "auth",
        service: "AuthService",
        operation: "validateUser",
        event: "LOGIN_FAILURE",
        reason: user ? "inactive_account" : "unknown_email",
        email: normalizedEmail,
        userId: user?.id,
        userStatus: user?.status,
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    const verification = await this.verifyPassword(password, user.passwordHash);
    if (!verification.valid) {
      this.logger.warn("Login rejected because the password did not match", {
        module: "auth",
        service: "AuthService",
        operation: "validateUser",
        event: "LOGIN_FAILURE",
        reason: "invalid_password",
        email: normalizedEmail,
        userId: user.id,
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    if (verification.upgradedHash) {
      await this.authRepository.updateUserPasswordHash(user.id, verification.upgradedHash);
    }

    const roleId = await this.resolvePrimaryRoleIdOrThrow(user.id);

    return {
      userId: user.id,
      email: user.email,
      roleId,
    };
  }

  async login(user: AuthenticatedUser): Promise<AuthTokensResponse> {
    await this.authRepository.updateUserLastLogin(user.userId, new Date());

    const tokens = await this.createRefreshSession(user.userId, user.email, user.roleId);
    this.logger.info("User logged in and a refresh session was created", {
      module: "auth",
      service: "AuthService",
      operation: "login",
      event: "LOGIN_SUCCESS",
      userId: user.userId,
      email: user.email,
      roleId: user.roleId,
    });
    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch (error) {
      this.logRefreshFailure("invalid_refresh_jwt");
      throw error;
    }

    const tokenHash = this.hashToken(refreshToken);

    const savedToken = await this.authRepository.findRefreshTokenWithUserByHash(tokenHash);

    if (!savedToken) {
      this.logRefreshFailure("token_not_found", payload.sub, payload.jti);
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (savedToken.userId !== payload.sub) {
      this.logRefreshFailure("token_user_mismatch", payload.sub, payload.jti);
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (savedToken.expiresAt.getTime() <= Date.now()) {
      this.logRefreshFailure("token_expired", savedToken.userId, payload.jti);
      throw new UnauthorizedException("Refresh token has expired");
    }

    if (savedToken.user.status !== UserStatus.ACTIVE) {
      this.logRefreshFailure("user_not_active", savedToken.user.id, payload.jti);
      throw new UnauthorizedException("User is not active");
    }

    const roleIsActive = await this.authRepository.countActiveRoleByUserId(
      savedToken.user.id,
      payload.roleId,
    );

    if (roleIsActive === 0) {
      this.logRefreshFailure("role_not_active", savedToken.user.id, payload.jti);
      throw new UnauthorizedException("User role is no longer active");
    }

    let issuedTokens: IssuedAuthTokens;
    try {
      issuedTokens = await this.signTokens(
        savedToken.user.id,
        savedToken.user.email,
        payload.roleId,
      );
    } catch (error) {
      this.logRefreshFailure("issue_new_token_failed", savedToken.user.id, payload.jti);
      throw error;
    }

    const rotateResult = await this.authRepository.rotateRefreshTokenById(
      savedToken.id,
      tokenHash,
      issuedTokens.refreshTokenHash,
      issuedTokens.refreshExpiresAt,
    );

    if (rotateResult.count !== 1) {
      this.logRefreshFailure("token_rotated_by_concurrent_request", savedToken.userId, payload.jti);
      throw new UnauthorizedException("Refresh token is no longer active");
    }

    this.logger.info("Refresh token rotation succeeded", {
      module: "auth",
      service: "AuthService",
      operation: "refresh",
      event: "REFRESH_TOKEN_ROTATED",
      userId: savedToken.user.id,
      refreshJti: this.formatJti(payload.jti),
    });

    return issuedTokens.response;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    await this.authRepository.deleteRefreshTokenByHash(tokenHash);
    this.logger.info("User logged out and refresh session was revoked", {
      module: "auth",
      service: "AuthService",
      operation: "logout",
      event: "LOGOUT_SUCCESS",
    });
  }

  async validateJwtPayload(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== ACCESS_TOKEN_TYPE) {
      this.logger.warn("Access token rejected because it had the wrong token type", {
        module: "auth",
        service: "AuthService",
        operation: "validateJwtPayload",
        event: "AUTHENTICATION_FAILURE",
        reason: "invalid_token_type",
        userId: payload.sub,
      });
      throw new UnauthorizedException("Invalid access token");
    }

    const user = await this.authRepository.findUserById(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logger.warn("Access token rejected because the user is inactive or missing", {
        module: "auth",
        service: "AuthService",
        operation: "validateJwtPayload",
        event: "AUTHENTICATION_FAILURE",
        reason: user ? "inactive_account" : "user_not_found",
        userId: payload.sub,
        userStatus: user?.status,
      });
      throw new UnauthorizedException("User is not active");
    }

    const roleIsActive = await this.authRepository.countActiveRoleByUserId(user.id, payload.roleId);
    if (roleIsActive === 0) {
      this.logger.warn("Access token rejected because the user role is no longer active", {
        module: "auth",
        service: "AuthService",
        operation: "validateJwtPayload",
        event: "AUTHENTICATION_FAILURE",
        reason: "role_not_active",
        userId: user.id,
        roleId: payload.roleId,
      });
      throw new UnauthorizedException("User role is no longer active");
    }

    return {
      userId: user.id,
      email: user.email,
      roleId: payload.roleId,
    };
  }

  async getMe(userId: string): Promise<{
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
    roles: string[];
    menus: string[];

    tenants: Array<{
      id: string;
      code: string;
      name: string;
      status: string;
    }>;
  }> {
    const user = await this.authRepository.findUserProfileWithRelations(userId);

    if (!user) {
      throw new UnauthorizedException("Không tìm thấy người dùng");
    }

    const roles = Array.from(new Set(user.userRoles.map((entry) => entry.role.code))).sort();

    const menus = new Set<string>([DEFAULT_NAVIGATION_MENU]);
    for (const entry of user.userRoles) {
      for (const rolePermission of entry.role.rolePermissions) {
        const menuPath =
          resolveBusinessPermissionMenuPath(rolePermission.permission.path) ??
          resolvePermissionMenuPath(rolePermission.permission.path);
        if (menuPath) {
          menus.add(menuPath);
        }
      }
    }

    const tenants = user.tenantUsers.map((tenantUser) => ({
      id: tenantUser.tenant.id,
      code: tenantUser.tenant.code,
      name: tenantUser.tenant.name,
      status: tenantUser.status,
    }));

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles,
      menus: sortMenuPathsByNavigationOrder(Array.from(menus)),

      tenants,
    };
  }

  private async verifyPassword(
    plainPassword: string,
    storedPasswordHash: string,
  ): Promise<PasswordVerificationResult> {
    if (storedPasswordHash.startsWith("$argon2")) {
      const valid = await argon2.verify(storedPasswordHash, plainPassword);
      return { valid };
    }

    const legacyHash = this.hashToken(plainPassword);
    if (legacyHash !== storedPasswordHash) {
      return { valid: false };
    }

    const upgradedHash = await argon2.hash(plainPassword);
    return {
      valid: true,
      upgradedHash,
    };
  }

  private async createRefreshSession(
    userId: string,
    email: string,
    roleId: string,
  ): Promise<AuthTokensResponse> {
    const issuedTokens = await this.signTokens(userId, email, roleId);

    await this.authRepository.deleteRefreshTokensByUserId(userId);
    await this.authRepository.createRefreshToken(
      userId,
      issuedTokens.refreshTokenHash,
      issuedTokens.refreshExpiresAt,
    );

    return issuedTokens.response;
  }

  private async signTokens(
    userId: string,
    email: string,
    roleId: string,
  ): Promise<IssuedAuthTokens> {
    const accessPayload: AccessTokenPayload = {
      jti: randomUUID(),
      sub: userId,
      email,
      roleId,
      type: ACCESS_TOKEN_TYPE,
    };

    const refreshPayload: RefreshTokenPayload = {
      jti: randomUUID(),
      sub: userId,
      roleId,
      type: REFRESH_TOKEN_TYPE,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.auth.jwtAccessSecret,
        expiresIn: this.config.auth.jwtAccessTtl,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.auth.jwtRefreshSecret,
        expiresIn: this.config.auth.jwtRefreshTtl,
      }),
    ]);

    const refreshExpiresAt = this.calculateExpiryDate(this.config.auth.jwtRefreshTtl);

    return {
      response: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        accessTtl: this.config.auth.jwtAccessTtl,
        refreshTtl: this.config.auth.jwtRefreshTtl,
      },
      refreshTokenHash: this.hashToken(refreshToken),
      refreshExpiresAt,
    };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.auth.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (payload.type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return payload;
  }

  private hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private logRefreshFailure(reason: string, userId?: string, refreshJti?: string): void {
    this.logger.warn("Refresh token rotation failed", {
      module: "auth",
      service: "AuthService",
      operation: "refresh",
      event: "REFRESH_TOKEN_FAILURE",
      reason,
      userId: userId ?? "unknown",
      refreshJti: this.formatJti(refreshJti),
    });
  }

  private formatJti(jti: string | undefined): string {
    return jti ?? "missing";
  }

  private async resolvePrimaryRoleIdOrThrow(userId: string): Promise<string> {
    const role = await this.authRepository.findPrimaryActiveRoleIdByUserId(userId);

    if (!role) {
      throw new UnauthorizedException("User has no active role");
    }

    return role.roleId;
  }

  private calculateExpiryDate(ttl: string): Date {
    return new Date(Date.now() + this.parseTtlToMs(ttl));
  }

  private parseTtlToMs(ttl: string): number {
    const normalized = ttl.trim();
    const unitMatch = normalized.match(/^(\d+)([smhd])$/i);

    if (unitMatch) {
      const amount = Number.parseInt(unitMatch[1], 10);
      const unit = unitMatch[2].toLowerCase();

      if (unit === "s") {
        return amount * 1000;
      }

      if (unit === "m") {
        return amount * 60 * 1000;
      }

      if (unit === "h") {
        return amount * 60 * 60 * 1000;
      }

      return amount * 24 * 60 * 60 * 1000;
    }

    const seconds = Number.parseInt(normalized, 10);
    if (Number.isNaN(seconds) || seconds <= 0) {
      throw new Error(`Unsupported JWT TTL format: ${ttl}`);
    }

    return seconds * 1000;
  }
}
