const WINDOW_MS = 60_000;
const LIMIT = 12;
const MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// ponytail: process-local guard; replace with a shared limiter when the frontend runs multiple replicas.
export function consumePublicChatQuota(key: string, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value as string);
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

export function clearPublicChatQuota() {
  buckets.clear();
}
