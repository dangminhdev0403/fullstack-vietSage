import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { LOCALMATE_PUBLIC_HANDOFF_KEY, readPublicBookingHandoff, writePublicBookingHandoff } from "./public-booking-handoff.ts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("round-trips a valid booking candidate before expiry", () => {
  const storage = new MemoryStorage();
  writePublicBookingHandoff(storage, { candidateKey: "cand_LM-LC-001" }, 1_000);

  assert.deepEqual(readPublicBookingHandoff(storage, 1_000), {
    candidateKey: "cand_LM-LC-001",
    expiresAt: 901_000,
  });
});

test("fails closed when browser storage is unavailable", () => {
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(writePublicBookingHandoff(storage, { candidateKey: "cand_LM-LC-001" }, 1_000), false);
  assert.equal(readPublicBookingHandoff(storage, 1_000), null);
});

test("rejects expired or malformed handoffs and removes them", () => {
  const storage = new MemoryStorage();
  writePublicBookingHandoff(storage, { candidateKey: "cand_LM-LC-001" }, 1_000);
  assert.equal(readPublicBookingHandoff(storage, 901_001), null);
  assert.equal(storage.getItem(LOCALMATE_PUBLIC_HANDOFF_KEY), null);

  storage.setItem(LOCALMATE_PUBLIC_HANDOFF_KEY, JSON.stringify({ candidateKey: "../../bad", expiresAt: 999_999 }));
  assert.equal(readPublicBookingHandoff(storage, 2_000), null);
  assert.equal(storage.getItem(LOCALMATE_PUBLIC_HANDOFF_KEY), null);
});
