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
  rateLimits: {
    login: RateLimitConfig;
    refresh: RateLimitConfig;
  };
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

  return {
    nodeEnv: validated.NODE_ENV,
    port: parsePort(validated.PORT),
    databaseUrl: validated.DATABASE_URL,
    auth: {
      jwtAccessSecret: validated.JWT_ACCESS_SECRET,
      jwtRefreshSecret: validated.JWT_REFRESH_SECRET,
      jwtAccessTtl: validated.JWT_ACCESS_TTL as StringValue,
      jwtRefreshTtl: validated.JWT_REFRESH_TTL as StringValue,
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
