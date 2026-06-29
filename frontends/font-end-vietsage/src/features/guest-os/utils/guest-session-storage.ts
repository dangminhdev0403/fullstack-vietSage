const GUEST_SESSION_STORAGE_KEY = "guestSessionToken";
const LEGACY_GUEST_SESSION_STORAGE_KEY = "vietsage.guestSession.v1";

export type StoredGuestSession = {
  sessionToken: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredGuestSession(value: unknown): StoredGuestSession | null {
  if (typeof value === "string") {
    const sessionToken = value.trim();
    return sessionToken ? { sessionToken } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.sessionToken !== "string") {
    return null;
  }

  const sessionToken = value.sessionToken.trim();
  return sessionToken ? { sessionToken } : null;
}

export function getStoredGuestSession(): StoredGuestSession | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
  if (!raw) {
    const legacyRaw = window.localStorage.getItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
    if (!legacyRaw) {
      return null;
    }

    try {
      const legacySession = parseStoredGuestSession(JSON.parse(legacyRaw));
      window.localStorage.removeItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
      if (legacySession) {
        setStoredGuestSession(legacySession);
      }

      return legacySession;
    } catch {
      window.localStorage.removeItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
      return null;
    }
  }

  const parsed = parseStoredGuestSession(raw);
  if (!parsed) {
    clearStoredGuestSession();
    return null;
  }

  return parsed;
}

export function setStoredGuestSession(session: StoredGuestSession): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, session.sessionToken);
  window.localStorage.removeItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
}

export function clearStoredGuestSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
}
