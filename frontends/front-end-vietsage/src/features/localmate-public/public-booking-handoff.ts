export const LOCALMATE_PUBLIC_HANDOFF_KEY = "vietsage.localmate.public-booking.v1";
const HANDOFF_TTL_MS = 15 * 60_000;
const CANDIDATE_KEY_PATTERN = /^cand_[A-Za-z0-9][A-Za-z0-9_-]{0,74}$/;

type BookingHandoff = {
  candidateKey: string;
  expiresAt: number;
};

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isPublicBookingCandidateKey(value: unknown): value is string {
  return typeof value === "string" && CANDIDATE_KEY_PATTERN.test(value);
}

export function writePublicBookingHandoff(
  storage: HandoffStorage,
  handoff: Pick<BookingHandoff, "candidateKey">,
  now = Date.now(),
): boolean {
  if (!isPublicBookingCandidateKey(handoff.candidateKey)) return false;
  try {
    storage.setItem(
      LOCALMATE_PUBLIC_HANDOFF_KEY,
      JSON.stringify({ candidateKey: handoff.candidateKey, expiresAt: now + HANDOFF_TTL_MS }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readPublicBookingHandoff(
  storage: HandoffStorage,
  now = Date.now(),
): BookingHandoff | null {
  try {
    const parsed = JSON.parse(storage.getItem(LOCALMATE_PUBLIC_HANDOFF_KEY) ?? "null") as Partial<BookingHandoff> | null;
    if (
      !parsed ||
      !isPublicBookingCandidateKey(parsed.candidateKey) ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < now
    ) {
      storage.removeItem(LOCALMATE_PUBLIC_HANDOFF_KEY);
      return null;
    }
    return { candidateKey: parsed.candidateKey, expiresAt: parsed.expiresAt };
  } catch {
    try {
      storage.removeItem(LOCALMATE_PUBLIC_HANDOFF_KEY);
    } catch {}
    return null;
  }
}

export function clearPublicBookingHandoff(storage: HandoffStorage): void {
  try {
    storage.removeItem(LOCALMATE_PUBLIC_HANDOFF_KEY);
  } catch {}
}
