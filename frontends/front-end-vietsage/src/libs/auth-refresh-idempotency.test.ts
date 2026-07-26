import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { createRefreshIdempotencyKey } from "./auth-refresh-idempotency.ts";

test("stale concurrent refresh requests reuse one idempotency key", () => {
  const refreshToken = "vsr_original_refresh_token";

  assert.equal(
    createRefreshIdempotencyKey(refreshToken),
    createRefreshIdempotencyKey(refreshToken),
  );
});

test("different refresh tokens use different idempotency keys", () => {
  assert.notEqual(
    createRefreshIdempotencyKey("vsr_refresh_token_a"),
    createRefreshIdempotencyKey("vsr_refresh_token_b"),
  );
});
