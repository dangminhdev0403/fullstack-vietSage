import * as path from "node:path";
import { utilities as nestWinstonModuleUtilities } from "nest-winston";
import * as winston from "winston";
import "winston-daily-rotate-file";

const isDev = process.env.NODE_ENV !== "production";

// ─── Transports ──────────────────────────────────────────────────────────────

const consoleTransport = new winston.transports.Console({
  format: isDev
    ? winston.format.combine(
        winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
        nestWinstonModuleUtilities.format.nestLike("VietSage", {
          colors: true,
          prettyPrint: true,
        }),
      )
    : winston.format.combine(winston.format.timestamp(), winston.format.json()),
});

const fileRotateAll = new winston.transports.DailyRotateFile({
  filename: path.join("logs", "app-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  // ponytail: file transport only in prod — adds I/O overhead in dev
  silent: isDev,
});

const fileRotateError = new winston.transports.DailyRotateFile({
  filename: path.join("logs", "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "10m",
  maxFiles: "30d",
  level: "error",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  silent: isDev,
});

// ─── External transport (optional — inject via env) ───────────────────────────
// Set LOKI_URL, DATADOG_API_KEY, or similar in the deployment env.
// Add a dedicated transport package and push here when a monitoring target is chosen.
// ponytail: skipped external transport — no monitoring target confirmed yet.

// ─── Winston instance ─────────────────────────────────────────────────────────

export const winstonInstance = winston.createLogger({
  // Hard minimum — AppLogger applies its own gate on top
  level: resolveWinstonLevel(),
  transports: [consoleTransport, fileRotateAll, fileRotateError],
  // Prevent Winston from exiting on uncaught exception — NestJS handles shutdown
  exitOnError: false,
});

function resolveWinstonLevel(): string {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (["debug", "info", "warn", "error"].includes(configured)) return configured;
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}
