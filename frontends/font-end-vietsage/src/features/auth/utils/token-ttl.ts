const DURATION_PATTERN = /^(\d+)\s*(ms|s|m|h|d)$/i;

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationToMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }

  const matched = trimmed.match(DURATION_PATTERN);
  if (matched) {
    const amount = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    return amount * UNIT_TO_MS[unit];
  }

  return null;
}

export function computeTokenExpiryEpochMs(accessTtl: string, nowEpochMs = Date.now()): number {
  const ttlMs = parseDurationToMs(accessTtl);
  const fallbackMs = 15 * 60 * 1_000;

  return nowEpochMs + (ttlMs ?? fallbackMs);
}
