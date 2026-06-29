import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadAppConfig } from "../common/config/env.config";
import { AppLogger } from "../common/logging/app-logger.service";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    const appConfig = loadAppConfig();
    const adapter = new PrismaPg(appConfig.databaseUrl);

    super({
      adapter,
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
      ],
    });

    const prismaEvents = this as PrismaEventClient;

    prismaEvents.$on("query", (event) => {
      if (event.duration <= 300) {
        return;
      }

      const { model, operation } = this.describeQuery(event.query);
      this.logger.database("WARN", "Slow database query detected", {
        service: "PrismaService",
        operation,
        event: "DATABASE_SLOW_QUERY",
        model,
        durationMs: event.duration,
        query: event.query,
      });
    });

    prismaEvents.$on("error", (event) => {
      const isRollback = /rollback/i.test(event.message);
      const isDeadlock = /deadlock/i.test(event.message);
      const isTimeout = /timeout|timed out/i.test(event.message);
      this.logger.database("ERROR", "Database failure reported by Prisma", {
        service: "PrismaService",
        operation: "database_event",
        event: isDeadlock
          ? "DATABASE_DEADLOCK"
          : isTimeout
            ? "DATABASE_TIMEOUT"
            : isRollback
              ? "DATABASE_TRANSACTION_ROLLBACK"
              : "DATABASE_FAILURE",
        reason: event.message,
      });
    });

    prismaEvents.$on("warn", (event) => {
      this.logger.database("WARN", "Database warning reported by Prisma", {
        service: "PrismaService",
        operation: "database_warning",
        event: "DATABASE_WARNING",
        reason: event.message,
      });
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.database("INFO", "Database connection established", {
      service: "PrismaService",
      operation: "connect",
      event: "DATABASE_CONNECTED",
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.database("INFO", "Database connection closed", {
      service: "PrismaService",
      operation: "disconnect",
      event: "DATABASE_DISCONNECTED",
    });
  }

  private describeQuery(query: string): { model: string; operation: string } {
    const operation = query.trim().split(/\s+/)[0]?.toUpperCase() || "UNKNOWN";
    const tableMatch = query.match(/(?:FROM|INTO|UPDATE|JOIN)\s+"?([A-Za-z0-9_]+)"?/i);
    return {
      model: tableMatch?.[1] ?? "unknown",
      operation,
    };
  }
}

interface PrismaEventClient {
  $on(event: "query", callback: (event: { query: string; duration: number }) => void): void;
  $on(event: "error" | "warn", callback: (event: { message: string }) => void): void;
}
