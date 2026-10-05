export const CHAT_UPSTREAM_TIMEOUT_MS = 60_000;

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function getChatUpstreamError(error: unknown) {
  return isAbortError(error)
    ? ({ status: 504, message: "CHAT_UPSTREAM_TIMEOUT" } as const)
    : null;
}