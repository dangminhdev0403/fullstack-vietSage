const MAX_LOG_STRING_LENGTH = 1_200;
const MAX_LOG_ARRAY_ITEMS = 20;
const MAX_LOG_OBJECT_KEYS = 20;
const MAX_LOG_DEPTH = 4;
const LOG_REDACTED_KEYS = new Set([
  "apikey",
  "apisecret",
  "authorization",
  "basicauth",
  "communicationkey",
  "cookie",
  "pairingcode",
  "proxyauthorization",
  "setcookie",
]);

function isSensitiveLogKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    LOG_REDACTED_KEYS.has(normalized) ||
    normalized.endsWith("credential") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token")
  );
}

export function toLogSafePayload(
  payload: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === "string") {
    if (payload.length <= MAX_LOG_STRING_LENGTH) {
      return payload;
    }

    return `${payload.slice(0, MAX_LOG_STRING_LENGTH)}...[trimmed ${payload.length - MAX_LOG_STRING_LENGTH} chars]`;
  }

  if (typeof payload !== "object") {
    return payload;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return "[max-depth]";
  }

  if (seen.has(payload)) {
    return "[circular]";
  }

  seen.add(payload);

  if (Array.isArray(payload)) {
    const limitedItems = payload
      .slice(0, MAX_LOG_ARRAY_ITEMS)
      .map((item) => toLogSafePayload(item, depth + 1, seen));

    if (payload.length > MAX_LOG_ARRAY_ITEMS) {
      limitedItems.push(`[+${payload.length - MAX_LOG_ARRAY_ITEMS} more items]`);
    }

    return limitedItems;
  }

  const entries = Object.entries(payload);
  const limitedEntries = entries.slice(0, MAX_LOG_OBJECT_KEYS).map(([key, value]) => [
    key,
    isSensitiveLogKey(key)
      ? "[redacted]"
      : toLogSafePayload(value, depth + 1, seen),
  ]);
  const result = Object.fromEntries(limitedEntries);

  if (entries.length > MAX_LOG_OBJECT_KEYS) {
    result.__truncatedKeys = `+${entries.length - MAX_LOG_OBJECT_KEYS} more keys`;
  }

  return result;
}
