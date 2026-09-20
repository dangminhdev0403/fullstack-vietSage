type RuntimeConsoleLevel = "debug" | "info" | "warn" | "error";

function enabled(level: RuntimeConsoleLevel): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return typeof window === "undefined" && (level === "warn" || level === "error");
}

function write(level: RuntimeConsoleLevel, args: unknown[]): void {
  if (enabled(level)) console[level](...args);
}

export const runtimeConsole = {
  enabled,
  debug: (...args: unknown[]) => write("debug", args),
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};
