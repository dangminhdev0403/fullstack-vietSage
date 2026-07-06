import { SetMetadata } from "@nestjs/common";

export const AUTH_RATE_LIMIT_METADATA_KEY = "authRateLimitKey";
export type AuthRateLimitKey = "login" | "refresh";

export const AuthRateLimit = (key: AuthRateLimitKey) =>
  SetMetadata(AUTH_RATE_LIMIT_METADATA_KEY, key);
