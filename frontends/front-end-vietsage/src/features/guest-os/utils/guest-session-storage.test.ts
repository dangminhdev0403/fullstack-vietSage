import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { clearGuestSessionCompatibilityKeys, migrateLegacyGuestSession } from "./guest-session-storage.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("imports a legacy token only when the Zustand token is empty and removes compatibility keys", () => {
  const storage = new MemoryStorage();
  storage.setItem("guestSessionToken", " token-a ");
  storage.setItem("vietsage.guestSession.v1", JSON.stringify({ sessionToken: "token-b" }));

  assert.equal(migrateLegacyGuestSession(storage, null), "token-a");
  assert.equal(storage.getItem("guestSessionToken"), null);
  assert.equal(storage.getItem("vietsage.guestSession.v1"), null);
});

test("keeps the Zustand token authoritative and only cleans compatibility keys", () => {
  const storage = new MemoryStorage();
  storage.setItem("guestSessionToken", "legacy");

  assert.equal(migrateLegacyGuestSession(storage, "zustand"), null);
  assert.equal(storage.getItem("guestSessionToken"), null);
});

test("clears both compatibility representations", () => {
  const storage = new MemoryStorage();
  storage.setItem("guestSessionToken", "legacy");
  storage.setItem("vietsage.guestSession.v1", "legacy");
  clearGuestSessionCompatibilityKeys(storage);
  assert.equal(storage.getItem("guestSessionToken"), null);
  assert.equal(storage.getItem("vietsage.guestSession.v1"), null);
});

test("ignores malformed legacy JSON and removes both compatibility keys", () => {
  const storage = new MemoryStorage();
  storage.setItem("vietsage.guestSession.v1", "{not-json");

  assert.equal(migrateLegacyGuestSession(storage, null), null);
  assert.equal(storage.getItem("guestSessionToken"), null);
  assert.equal(storage.getItem("vietsage.guestSession.v1"), null);
});
