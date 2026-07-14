import { Logger } from "@nestjs/common";
import { config } from "dotenv";
import type { StringValue } from "ms";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().min(1),
  PORT: z.string().regex(/^\d+$/, "PORT must be a numeric string"),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().min(1),
  JWT_REFRESH_TTL: z.string().min(1),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  AUTH_SESSION_IDLE_TTL: z.string().optional(),
  AUTH_SESSION_ABSOLUTE_TTL: z.string().optional(),
  AUTH_REFRESH_IDEMPOTENCY_TTL_SECONDS: z.string().optional(),
  AUTH_IDEMPOTENCY_ENCRYPTION_KEY: z.string().optional(),
  AUTH_LEGACY_REFRESH_ACCEPT_UNTIL: z.string().optional(),
  AUTHZ_ENFORCEMENT_ENABLED: z.string().optional(),
  AUTHZ_ROUTE_SYNC_ENABLED: z.string().optional(),
  AUTHZ_STRICT_MODE: z.string().optional(),
  AUTH_ADMIN_EMAIL: z.string().optional(),
  AUTH_ADMIN_NAME: z.string().optional(),
  AUTH_ADMIN_PASSWORD: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  SWAGGER_ENABLED: z.string().optional(),
  AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS: z.string().optional(),
  AUTH_LOGIN_RATE_LIMIT_LIMIT: z.string().optional(),
  AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS: z.string().optional(),
  AUTH_REFRESH_RATE_LIMIT_LIMIT: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEET_ID: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  REQUEST_REALTIME_ENABLED: z.string().optional(),
  REQUEST_REALTIME_TICKET_SECRET: z.string().optional(),
  REQUEST_REALTIME_TICKET_TTL_SECONDS: z.string().optional(),
});

export type EnvConfig = z.infer<typeof ConfigSchema>;

function validateEnv(env: NodeJS.ProcessEnv): EnvConfig {
  const parsed = ConfigSchema.safeParse(env);

  if (!parsed.success) {
    Logger.error("Invalid environment variables", parsed.error.format());
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const envConfig = validateEnv(process.env);

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: StringValue;
  jwtRefreshTtl: StringValue;
  jwtIssuer: string;
  jwtAudience: string;
  sessionIdleTtl: StringValue;
  sessionAbsoluteTtl: StringValue;
  refreshIdempotencyTtlSeconds: number;
  idempotencyEncryptionKey: string;
  legacyRefreshAcceptUntil: Date | null;
}

export interface AuthzConfig {
  routeSyncEnabled: boolean;
  strictMode: boolean;
  enforcementEnabled: boolean;
}

export interface AuthAdminConfig {
  email: string | null;
  name: string | null;
  password: string | null;
}

export interface RateLimitConfig {
  ttlSeconds: number;
  limit: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  auth: AuthConfig;
  authz: AuthzConfig;
  authAdmin: AuthAdminConfig;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  requestRealtime: RequestRealtimeConfig;
  rateLimits: {
    login: RateLimitConfig;
    refresh: RateLimitConfig;
  };
}

export interface RequestRealtimeConfig {
  enabled: boolean;
  ticketSecret: string | null;
  ticketTtlSeconds: number;
  audience: "request-realtime";
}

function parsePort(rawPort: string): number {
  const parsed = Number.parseInt(rawPort, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("Invalid PORT environment variable. PORT must be a positive integer.");
  }

  return parsed;
}

function parseBooleanEnv(
  rawValue: string | undefined,
  defaultValue: boolean,
  envName: string,
): boolean {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`Invalid ${envName} environment variable. Expected true/false or 1/0.`);
}

function parsePositiveIntegerEnv(
  rawValue: string | undefined,
  defaultValue: number,
  envName: string,
): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== rawValue.trim()) {
    throw new Error(`Invalid ${envName} environment variable. Expected a positive integer.`);
  }

  return parsed;
}

function normalizeOptionalEnvText(rawValue: string | undefined): string | null {
  if (rawValue === undefined) {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalDateEnv(rawValue: string | undefined, envName: string): Date | null {
  const normalized = normalizeOptionalEnvText(rawValue);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${envName} environment variable. Expected an ISO date.`);
  }

  return parsed;
}

export function parseCorsOrigins(rawValue: string | undefined): string[] {
  if (rawValue === undefined || rawValue.trim() === "") {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  );
}

export function shouldEnableSwagger(
  nodeEnv: string,
  rawSwaggerEnabled: string | undefined,
): boolean {
  return parseBooleanEnv(rawSwaggerEnabled, nodeEnv !== "production", "SWAGGER_ENABLED");
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const validated = validateEnv(env);
  const requestRealtimeEnabled = parseBooleanEnv(
    validated.REQUEST_REALTIME_ENABLED,
    false,
    "REQUEST_REALTIME_ENABLED",
  );
  const requestRealtimeTicketSecret = normalizeOptionalEnvText(
    validated.REQUEST_REALTIME_TICKET_SECRET,
  );
  if (
    requestRealtimeEnabled &&
    (!requestRealtimeTicketSecret || requestRealtimeTicketSecret.length < 32)
  ) {
    throw new Error(
      "Invalid REQUEST_REALTIME_TICKET_SECRET environment variable. Expected at least 32 non-blank characters when request realtime is enabled.",
    );
  }

  return {
    nodeEnv: validated.NODE_ENV,
    port: parsePort(validated.PORT),
    databaseUrl: validated.DATABASE_URL,
    auth: {
      jwtAccessSecret: validated.JWT_ACCESS_SECRET,
      jwtRefreshSecret: validated.JWT_REFRESH_SECRET,
      jwtAccessTtl: validated.JWT_ACCESS_TTL as StringValue,
      jwtRefreshTtl: validated.JWT_REFRESH_TTL as StringValue,
      jwtIssuer: normalizeOptionalEnvText(validated.JWT_ISSUER) ?? "vietsage-auth",
      jwtAudience: normalizeOptionalEnvText(validated.JWT_AUDIENCE) ?? "vietsage-web",
      sessionIdleTtl: (normalizeOptionalEnvText(validated.AUTH_SESSION_IDLE_TTL) ??
        "30d") as StringValue,
      sessionAbsoluteTtl: (normalizeOptionalEnvText(validated.AUTH_SESSION_ABSOLUTE_TTL) ??
        "90d") as StringValue,
      refreshIdempotencyTtlSeconds: parsePositiveIntegerEnv(
        validated.AUTH_REFRESH_IDEMPOTENCY_TTL_SECONDS,
        300,
        "AUTH_REFRESH_IDEMPOTENCY_TTL_SECONDS",
      ),
      idempotencyEncryptionKey:
        normalizeOptionalEnvText(validated.AUTH_IDEMPOTENCY_ENCRYPTION_KEY) ??
        validated.JWT_REFRESH_SECRET,
      legacyRefreshAcceptUntil: parseOptionalDateEnv(
        validated.AUTH_LEGACY_REFRESH_ACCEPT_UNTIL,
        "AUTH_LEGACY_REFRESH_ACCEPT_UNTIL",
      ),
    },
    authz: {
      routeSyncEnabled: parseBooleanEnv(
        validated.AUTHZ_ROUTE_SYNC_ENABLED,
        true,
        "AUTHZ_ROUTE_SYNC_ENABLED",
      ),
      strictMode: parseBooleanEnv(validated.AUTHZ_STRICT_MODE, true, "AUTHZ_STRICT_MODE"),
      enforcementEnabled: parseBooleanEnv(
        validated.AUTHZ_ENFORCEMENT_ENABLED,
        true,
        "AUTHZ_ENFORCEMENT_ENABLED",
      ),
    },
    authAdmin: {
      email: normalizeOptionalEnvText(validated.AUTH_ADMIN_EMAIL),
      name: normalizeOptionalEnvText(validated.AUTH_ADMIN_NAME),
      password: normalizeOptionalEnvText(validated.AUTH_ADMIN_PASSWORD),
    },
    corsOrigins: parseCorsOrigins(validated.CORS_ORIGINS),
    swaggerEnabled: shouldEnableSwagger(validated.NODE_ENV, validated.SWAGGER_ENABLED),
    requestRealtime: {
      enabled: requestRealtimeEnabled,
      ticketSecret: requestRealtimeTicketSecret,
      ticketTtlSeconds: parsePositiveIntegerEnv(
        validated.REQUEST_REALTIME_TICKET_TTL_SECONDS,
        60,
        "REQUEST_REALTIME_TICKET_TTL_SECONDS",
      ),
      audience: "request-realtime",
    },
    rateLimits: {
      login: {
        ttlSeconds: parsePositiveIntegerEnv(
          validated.AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS,
          60,
          "AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS",
        ),
        limit: parsePositiveIntegerEnv(
          validated.AUTH_LOGIN_RATE_LIMIT_LIMIT,
          10,
          "AUTH_LOGIN_RATE_LIMIT_LIMIT",
        ),
      },
      refresh: {
        ttlSeconds: parsePositiveIntegerEnv(
          validated.AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS,
          60,
          "AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS",
        ),
        limit: parsePositiveIntegerEnv(
          validated.AUTH_REFRESH_RATE_LIMIT_LIMIT,
          30,
          "AUTH_REFRESH_RATE_LIMIT_LIMIT",
        ),
      },
    },
  };
}

export const generateOTP = () => randomInt(100000, 1000000).toString();
