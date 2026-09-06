import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extension.
import { safeRandomUuid } from "./safe-uuid.ts";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("safeRandomUuid generates valid RFC 4122 v4 UUID format", () => {
  const id = safeRandomUuid();
  assert.match(id, UUID_V4_REGEX);
});

test("safeRandomUuid generates unique values", () => {
  const ids = new Set(Array.from({ length: 100 }, () => safeRandomUuid()));
  assert.equal(ids.size, 100);
});

test("safeRandomUuid falls back correctly when crypto.randomUUID is not a function", () => {
  const originalCrypto = globalThis.crypto;
  try {
    // Simulate insecure context where crypto exists but randomUUID does NOT
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });

    const id = safeRandomUuid();
    assert.match(id, UUID_V4_REGEX);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  }
});

test("safeRandomUuid falls back correctly when crypto is completely undefined", () => {
  const originalCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const id = safeRandomUuid();
    assert.match(id, UUID_V4_REGEX);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  }
});
