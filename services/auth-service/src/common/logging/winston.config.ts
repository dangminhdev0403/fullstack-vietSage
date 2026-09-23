import * as path from "node:path";
import { utilities as nestWinstonModuleUtilities } from "nest-winston";
import * as winston from "winston";
import "winston-daily-rotate-file";

const isDev = process.env.NODE_ENV !== "production";

// ─── Transports ──────────────────────────────────────────────────────────────

const minLevel = resolveWinstonLevel();

const filterByLevel = winston.format((info) => {
  const priority: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
  const maxPriority = priority[minLevel] ?? 1;
  const currentPriority = priority[info.level] ?? 2;
  return currentPriority <= maxPriority ? info : false;
});

const consoleTransport = new winston.transports.Console({
  level: "debug",
  format: winston.format.combine(
    filterByLevel(),
    isDev
      ? winston.format.combine(
          winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
          nestWinstonModuleUtilities.format.nestLike("VietSage", {
            colors: true,
            prettyPrint: true,
          }),
        )
      : winston.format.combine(winston.format.timestamp(), winston.format.json()),
  ),
});

const transports: winston.transport[] = [consoleTransport];

if (process.env.LOG_TO_FILE === "true") {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join("logs", "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      silent: isDev,
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join("logs", "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "10m",
      maxFiles: "30d",
      level: "error",
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      silent: isDev,
    }),
  );
}

// ─── Winston instance ─────────────────────────────────────────────────────────

export const winstonInstance = winston.createLogger({
  level: "debug",
  transports,
  // Prevent Winston from exiting on uncaught exception — NestJS handles shutdown
  exitOnError: false,
});

function resolveWinstonLevel(): string {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (["debug", "info", "warn", "error"].includes(configured)) return configured;
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

