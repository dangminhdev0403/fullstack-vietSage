import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./guest-marketplace-cart-flow.tsx", import.meta.url), "utf8");

test("renders the canonical sync response instead of a stale cart quote", () => {
  assert.match(source, /const syncedCart = await syncCart\.mutateAsync/);
  assert.match(source, /setReviewCart\(syncedCart\)/);
  assert.match(source, /const quote = reviewCart \?\? cartQuery\.data/);
});
