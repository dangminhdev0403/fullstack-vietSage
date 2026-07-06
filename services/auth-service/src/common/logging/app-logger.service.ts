import { Injectable } from "@nestjs/common";
import { RequestContext } from "./request-context";
import { redactLogMetadata } from "./log-redactor";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
type LogDomain = "AUTH" | "HTTP" | "SOCKET" | "DATABASE" | "APP";

export interface LogMetadata {
  module?: string;
  controller?: string;
  service?: string;
  operation?: string;
  event?: string;
  [key: string]: unknown;
}

@Injectable()
export class AppLogger {
  debug(message: unknown, metadata: LogMetadata = {}): void {
    this.write("DEBUG", message, metadata);
  }

  log(message: unknown, metadata: LogMetadata = {}): void {
    this.info(message, metadata);
  }

  info(message: unknown, metadata: LogMetadata = {}): void {
    this.write("INFO", message, metadata);
  }

  warn(message: unknown, metadata: LogMetadata = {}): void {
    this.write("WARN", message, metadata);
  }

  error(message: unknown, metadata: LogMetadata = {}): void {
    this.write("ERROR", message, metadata);
  }

  http(metadata: LogMetadata): void {
    this.write("INFO", this.endpoint(metadata.method, metadata.url) ?? "HTTP", {
      module: "http",
      event: "HTTP_REQUEST_COMPLETED",
      ...metadata,
    });
  }

  auth(level: Exclude<LogLevel, "DEBUG">, message: string, metadata: LogMetadata = {}): void {
    this.write(level, message, { module: "auth", ...metadata });
  }

  socket(message: string, metadata: LogMetadata = {}): void {
    this.write("INFO", message, { module: "socket", ...metadata });
  }

  database(level: Exclude<LogLevel, "DEBUG">, message: string, metadata: LogMetadata = {}): void {
    this.write(level, message, { module: "database", ...metadata });
  }

  private write(level: LogLevel, message: unknown, metadata: LogMetadata): void {
    if (level === "DEBUG" && !this.isDebugEnabled()) {
      return;
    }

    const normalized = this.normalizeMessage(message, metadata);
    const context = RequestContext.get();
    const entry = redactLogMetadata({
      timestamp: new Date().toISOString(),
      level,
      message: normalized.message,
      ...context,
      ...normalized.metadata,
    });

    const line = this.formatEntry(entry);
    if (level === "ERROR") {
      console.error(line);
      return;
    }

    if (level === "WARN") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  private normalizeMessage(
    message: unknown,
    metadata: LogMetadata,
  ): { message: string; metadata: LogMetadata } {
    if (typeof message === "string") {
      return { message, metadata };
    }

    if (message instanceof Error) {
      return {
        message: message.name,
        metadata: {
          ...metadata,
          errorMessage: message.message,
          stackTrace: message.stack,
        },
      };
    }

    if (this.isRecord(message)) {
      const event = typeof message.event === "string" ? message.event : undefined;
      return {
        message: event ?? "Log event",
        metadata: { ...message, ...metadata },
      };
    }

    return { message: String(message), metadata };
  }

  private formatEntry(
    entry: LogMetadata & { timestamp: string; level: LogLevel; message: string },
  ): string {
    const domain = this.resolveDomain(entry);
    const title = this.resolveTitle(entry, domain);
    const fields = this.resolveFields(entry, domain);
    const stack =
      entry.level === "ERROR"
        ? this.toText(entry.stackTrace ?? (entry as Record<string, unknown>).stack)
        : undefined;
    const lines = [
      `${this.color(entry.level, this.levelBadge(entry.level, domain))} [${this.time(entry.timestamp)}] ${this.color(entry.level, title)}`,
    ];

    fields.forEach(([label, value], index) => {
      const branch = index === fields.length - 1 && !stack ? "└─" : "├─";
      lines.push(
        `${this.color(entry.level, branch)} ${label.padEnd(10)}: ${this.formatValue(value)}`,
      );
    });

    if (stack) {
      lines.push(`${this.color(entry.level, "└─")} ${"Stack".padEnd(10)}`);
      for (const line of stack.split(/\r?\n/).filter(Boolean)) {
        lines.push(`   ${line}`);
      }
    }

    return lines.join("\n");
  }

  private resolveFields(
    entry: LogMetadata & { level: LogLevel; message: string },
    domain: LogDomain,
  ): Array<[string, unknown]> {
    const fields: Array<[string, unknown]> = [];
    const requestId = entry.requestId ?? "n/a";

    if (entry.level === "ERROR") {
      fields.push(["Endpoint", this.endpoint(entry.method, entry.url)]);
      fields.push(["Message", entry.errorMessage]);
      fields.push(["Status", entry.httpStatus ?? entry.statusCode]);
      fields.push(["RequestId", requestId]);
    } else if (domain === "HTTP") {
      fields.push(["Status", entry.statusCode ?? entry.httpStatus]);
      fields.push(["Duration", this.duration(entry.durationMs)]);
      fields.push([
        "User",
        entry.userEmail ?? this.getNested(entry.authenticatedUser, "email") ?? entry.userId,
      ]);
      fields.push(["RequestId", requestId]);
    } else if (domain === "AUTH") {
      fields.push(["User", entry.email ?? entry.userEmail ?? entry.userId]);
      fields.push(["User ID", entry.email || entry.userEmail ? entry.userId : undefined]);
      fields.push(["Reason", entry.reason]);
      fields.push(["Request", this.endpoint(entry.method, entry.url)]);
      fields.push(["Duration", this.duration(entry.durationMs)]);
      fields.push(["RequestId", requestId]);
    } else if (domain === "SOCKET") {
      fields.push(["Socket", entry.socketId]);
      fields.push(["Room", entry.room]);
      fields.push(["Event", entry.eventName ?? entry.event]);
      fields.push(["RequestId", requestId]);
    } else if (domain === "DATABASE") {
      fields.push(["Model", entry.model]);
      fields.push(["Operation", entry.operation]);
      fields.push(["Duration", this.duration(entry.durationMs)]);
      fields.push(["Reason", entry.reason ?? entry.errorMessage]);
      fields.push(["RequestId", requestId]);
    } else {
      fields.push(["Endpoint", this.endpoint(entry.method, entry.url)]);
      fields.push(["Message", entry.errorMessage]);
      fields.push(["Status", entry.httpStatus ?? entry.statusCode]);
      fields.push(["Reason", entry.reason]);
      fields.push(["Hotel", entry.hotelId]);
      fields.push(["Stay", entry.stayId]);
      fields.push(["Folio", entry.folioId]);
      fields.push(["Invoice", entry.invoiceId]);
      fields.push(["Actor", entry.actorUserId]);
      fields.push(["Count", entry.duplicateCount ?? entry.createdCount ?? entry.routeCount]);
      fields.push(["RequestId", requestId]);
    }

    if (entry.level === "DEBUG") {
      for (const [key, value] of Object.entries(entry)) {
        if (this.isHiddenField(key) || fields.some(([label]) => this.keyToLabel(key) === label)) {
          continue;
        }
        fields.push([this.keyToLabel(key), value]);
      }
    }

    return fields.filter(([, value]) => value !== undefined && value !== null && value !== "");
  }

  private resolveTitle(entry: LogMetadata & { message: string }, domain: LogDomain): string {
    if (entry.exceptionType && entry.level === "ERROR") {
      return this.toText(entry.exceptionType) ?? "ERROR";
    }

    if (domain === "HTTP") {
      return this.endpoint(entry.method, entry.url) ?? entry.message;
    }

    return this.toTitle(String(entry.event ?? entry.message));
  }

  private resolveDomain(entry: LogMetadata): LogDomain {
    const moduleName = String(entry.module ?? "").toLowerCase();
    if (moduleName.includes("auth") || moduleName.includes("rbac")) return "AUTH";
    if (moduleName.includes("http")) return "HTTP";
    if (moduleName.includes("socket") || moduleName.includes("realtime")) return "SOCKET";
    if (moduleName.includes("database") || moduleName.includes("prisma")) return "DATABASE";
    return "APP";
  }

  private levelBadge(level: LogLevel, domain: LogDomain): string {
    if (level === "ERROR") return "✗";
    if (level === "WARN") return "⚠";
    if (domain === "SOCKET") return "🛰";
    if (domain === "AUTH") return "🔐";
    if (domain === "HTTP") return "🌐";
    if (domain === "DATABASE") return "🗄";
    return "✓";
  }

  private color(level: LogLevel, value: string): string {
    if (!process.stdout.isTTY && !process.stderr.isTTY) return value;
    const code = level === "ERROR" ? 31 : level === "WARN" ? 33 : level === "DEBUG" ? 90 : 36;
    return `\u001b[${code}m${value}\u001b[0m`;
  }

  private formatValue(value: unknown): string {
    const text = this.toText(value);
    if (!text) return "";
    return text.length > 300 && !this.isDebugEnabled() ? `${text.slice(0, 297)}...` : text;
  }

  private toText(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch {
      return "[Unserializable]";
    }
  }

  private duration(value: unknown): string | undefined {
    return typeof value === "number" ? `${value} ms` : undefined;
  }

  private endpoint(method: unknown, url: unknown): string | undefined {
    if (!method && !url) return undefined;
    return [method, url].filter(Boolean).join(" ");
  }

  private time(timestamp: string): string {
    return new Date(timestamp).toISOString().slice(11, 23);
  }

  private toTitle(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_:.-]+/g, " ")
      .trim()
      .toUpperCase();
  }

  private isDebugEnabled(): boolean {
    return (process.env.LOG_LEVEL ?? "").toLowerCase() === "debug";
  }

  private isHiddenField(key: string): boolean {
    return [
      "timestamp",
      "level",
      "message",
      "module",
      "service",
      "controller",
      "operation",
      "event",
      "stack",
      "stackTrace",
    ].includes(key);
  }

  private keyToLabel(key: string): string {
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
  }

  private getNested(value: unknown, key: string): unknown {
    return this.isRecord(value) ? value[key] : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
