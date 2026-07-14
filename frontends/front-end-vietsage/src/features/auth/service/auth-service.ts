import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient } from "@/core/http/http-client";
import { HttpError } from "@/core/http/http-error";
import type {
  AuthProfileData,
  AuthTenant,
  AuthTokensData,
  AuthLoginRequest,
  AuthRefreshRequest,
} from "@/features/auth/types/auth-contract";
import { computeTokenExpiryEpochMs } from "@/features/auth/utils/token-ttl";

import type {
  AuthLoginResponseEnvelope,
  AuthMeResponseEnvelope,
  AuthLogoutResponseEnvelope,
  AuthRefreshResponseEnvelope,
} from "@/features/auth/types/auth-contract";

export type AuthServiceOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  tokenType: string;
  accessTtl: string;
  refreshTtl: string;
};

export type AuthIdentity = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
  tenants: AuthTenant[];
};

export type AuthLoginResult = {
  identity: AuthIdentity;
  tokens: AuthTokens;
};

export type AuthMeResult = {
  identity: AuthIdentity;
  tokens: AuthTokens;
};

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthServiceError";
    this.code = code;
  }
}

function toAuthTokens(payload: AuthTokensData): AuthTokens {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpiresAt: computeTokenExpiryEpochMs(payload.accessTtl),
    tokenType: payload.tokenType,
    accessTtl: payload.accessTtl,
    refreshTtl: payload.refreshTtl,
  };
}

function toAuthIdentity(payload: AuthProfileData): AuthIdentity {
  const roles = payload.roles ?? [];

  return {
    id: payload.id,
    email: payload.email,
    fullName: payload.fullName,
    status: payload.status,
    roles,
    permissions: payload.permissions ?? [],
    tenants: payload.tenants ?? [],
  };
}

function toAuthServiceError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error;
  }

  if (error instanceof HttpError) {
    if (error.status === 400 || error.status === 401) {
      return new AuthServiceError("INVALID_CREDENTIALS", "Invalid credentials");
    }

    if (error.status === 403) {
      return new AuthServiceError("UNAUTHORIZED", "Unauthorized request");
    }

    if (error.status === 0 || error.status === 408) {
      return new AuthServiceError("NETWORK_ERROR", "Network request failed");
    }
  }

  if (error instanceof Error) {
    return new AuthServiceError("UNKNOWN", error.message);
  }

  return new AuthServiceError("UNKNOWN", "Unexpected auth service error");
}

export class AuthService {
  private readonly httpClient: HttpClient;

  constructor(options: AuthServiceOptions) {
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  async login(credentials: AuthLoginRequest): Promise<AuthLoginResult> {
    try {
      const loginPayload = await this.httpClient.request<
        AuthLoginResponseEnvelope,
        AuthLoginRequest
      >({
        method: "POST",
        path: "/auth/login",
        body: credentials,
        isPublic: true,
      });

      const loginEnvelope = unwrapApiEnvelope<AuthTokensData>(loginPayload);
      const tokens = toAuthTokens(loginEnvelope.data);
      const identity = await this.me(tokens);

      return {
        identity: identity.identity,
        tokens: identity.tokens,
      };
    } catch (error) {
      throw toAuthServiceError(error);
    }
  }

  async refresh(refreshToken: string, idempotencyKey: string): Promise<AuthTokens> {
    return this.requestRefresh(refreshToken, idempotencyKey);
  }

  private async requestRefresh(
    refreshToken: string,
    idempotencyKey: string,
  ): Promise<AuthTokens> {
    try {
      const refreshPayload = await this.httpClient.request<
        AuthRefreshResponseEnvelope,
        AuthRefreshRequest
      >({
        method: "POST",
        path: "/auth/refresh",
        body: { refreshToken },
        headers: { "Idempotency-Key": idempotencyKey },
        isPublic: true,
      });
      const refreshEnvelope = unwrapApiEnvelope<AuthTokensData>(refreshPayload);
      const tokens = toAuthTokens(refreshEnvelope.data);
      return tokens;
    } catch (error) {
      throw toAuthServiceError(error);
    }
  }

  async logout(accessToken: string): Promise<boolean> {
    try {
      const logoutPayload = await this.httpClient.request<AuthLogoutResponseEnvelope>({
        method: "POST",
        path: "/auth/logout",
        accessToken,
      });

      const envelope = unwrapApiEnvelope<{ success?: boolean }>(logoutPayload);
      return envelope.data.success === true;
    } catch {
      return false;
    }
  }

  async me(tokens: AuthTokens): Promise<AuthMeResult> {
    try {
      const mePayload = await this.httpClient.request<AuthMeResponseEnvelope>({
        method: "GET",
        path: "/auth/me",
        accessToken: tokens.accessToken,
      });

      const meEnvelope = unwrapApiEnvelope<AuthProfileData>(mePayload);
      return {
        identity: toAuthIdentity(meEnvelope.data),
        tokens,
      };
    } catch (error) {
      throw toAuthServiceError(error);
    }
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return new AuthService(options);
}
