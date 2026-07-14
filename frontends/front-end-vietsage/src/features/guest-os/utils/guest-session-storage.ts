const GUEST_SESSION_STORAGE_KEY = "guestSessionToken";
const LEGACY_GUEST_SESSION_STORAGE_KEY = "vietsage.guestSession.v1";

export type GuestSessionStorage = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

type StoredGuestSession = { sessionToken: string };

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

export function clearGuestSessionCompatibilityKeys(storage: GuestSessionStorage): void {
  storage.removeItem(GUEST_SESSION_STORAGE_KEY);
  storage.removeItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
}

export function migrateLegacyGuestSession(storage: GuestSessionStorage, currentToken: string | null): string | null {
  let migratedToken: string | null = null;
  if (!currentToken) {
    const rawToken = storage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (rawToken) migratedToken = parseStoredGuestSession(rawToken)?.sessionToken ?? null;

    if (!migratedToken) {
      const legacyRaw = storage.getItem(LEGACY_GUEST_SESSION_STORAGE_KEY);
      if (legacyRaw) {
        try {
          migratedToken = parseStoredGuestSession(JSON.parse(legacyRaw))?.sessionToken ?? null;
        } catch {
          migratedToken = null;
        }
      }
    }
  }

  clearGuestSessionCompatibilityKeys(storage);
  return migratedToken;
}

export function clearStoredGuestSession(): void {
  if (isBrowser()) clearGuestSessionCompatibilityKeys(window.localStorage);
}
