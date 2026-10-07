const WINDOW_MS = 60_000;
const LIMIT = 12;
const MAX_BUCKETS = 10_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "unknown") return "unknown";

  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:192.0.2.1 -> 192.0.2.1)
  let clean = trimmed.replace(/^::ffff:/i, "");

  // Strip port from IPv4 address (e.g. 192.0.2.1:8080 -> 192.0.2.1)
  const ipv4WithPort = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
  if (ipv4WithPort) {
    clean = ipv4WithPort[1];
  } else {
    // Strip port from bracketed IPv6 address (e.g. [2001:db8::1]:8080 -> 2001:db8::1)
    const bracketedIpv6 = clean.match(/^\[([0-9a-fA-F:]+)\]:\d+$/);
    if (bracketedIpv6) {
      clean = bracketedIpv6[1];
    }
  }

  return clean.toLowerCase().trim() || "unknown";
}

/**
 * Resolves a rate limit key for public LocalMate chat.
 *
 * Primary: Binds to the opaque LocalMate session capability token read by the
 * server from its HttpOnly cookie and passed explicitly by the route.
 *
 * Secondary: Falls back to normalized, spoof-resistant IP by prioritizing `x-real-ip`
 * (typically set by the outermost edge proxy) or the rightmost (edge-appended) entry
 * in `x-forwarded-for` to resist client prefix spoofing.
 */
export function resolvePublicChatRateKey(request: Request, sessionToken?: string | null): string {
  if (sessionToken && TOKEN_PATTERN.test(sessionToken.trim())) {
    return `session:${sessionToken.trim()}`;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return `ip:${normalizeIp(realIp)}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    const chain = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (chain.length > 0) {
      return `ip:${normalizeIp(chain[chain.length - 1])}`;
    }
  }

  return "ip:unknown";
}

// ponytail: process-local guard with a fixed ceiling (LIMIT = 12 requests per 60s window across MAX_BUCKETS = 10,000 in-memory buckets).
// In multi-replica deployments, this in-memory limiter operates per-process/replica; replace with a shared distributed store (e.g. Redis)
// when horizontal scaling requires cluster-wide enforcement.
export function consumePublicChatQuota(key: string, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > MAX_BUCKETS) {
      // Bounded eviction: sweep expired entries first
      buckets.forEach((b, k) => {
        if (b.resetAt <= now) buckets.delete(k);
      });
      // If still exceeding ceiling, drop oldest key
      if (buckets.size > MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function consumePublicChatQuotas(keys: string[], now = Date.now()) {
  const results = [...new Set(keys)].map((key) => consumePublicChatQuota(key, now));
  return results.find((result) => !result.allowed) ?? { allowed: true, retryAfterSeconds: 0 };
}

export function clearPublicChatQuota() {
  buckets.clear();
}
