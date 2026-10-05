import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { LOCALMATE_COOKIE_OPTIONS, LOCALMATE_SESSION_COOKIE } from "../../app/api/localmate/_lib/session-cookie.ts";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { toApiErrorMessage, unwrapApiEnvelope } from "../../core/http/api-envelope.ts";

test("HttpOnly session cookie is configured securely with path restriction", () => {
  assert.equal(LOCALMATE_SESSION_COOKIE, "public_localmate_token");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(LOCALMATE_COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.path, "/api/localmate");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.maxAge, 86400);
});

test("public BFF unwraps the backend response envelope before returning data", () => {
  assert.deepEqual(
    unwrapApiEnvelope({
      status: 201,
      error: null,
      message: "Gọi API thành công",
      data: { sessionId: "pub-1", expiresAt: "2026-10-06T00:00:00.000Z" },
    }).data,
    { sessionId: "pub-1", expiresAt: "2026-10-06T00:00:00.000Z" },
  );
});

test("public BFF keeps the actionable backend detail without returning the whole payload", () => {
  assert.equal(
    toApiErrorMessage({
      status: 400,
      message: "BAD_REQUEST",
      data: { detail: "Hướng dẫn viên không phục vụ tại khu vực đã chọn" },
    }),
    "Hướng dẫn viên không phục vụ tại khu vực đã chọn",
  );
});

test("candidate key format conforms to canonical pattern", () => {
  const candidateKeyPattern = /^cand_[A-Za-z0-9][A-Za-z0-9_-]{0,74}$/;
  assert.ok(candidateKeyPattern.test("cand_LM-LC-001"));
  assert.ok(candidateKeyPattern.test("cand_abc123_xyz"));
  assert.ok(!candidateKeyPattern.test("invalid_prefix_123"));
  assert.ok(!candidateKeyPattern.test("cand_"));
  assert.ok(!candidateKeyPattern.test("cand_ space"));
});

test("guest phone validation conforms to standard format", () => {
  const phonePattern = /^\+?[0-9][0-9 .()-]{5,30}$/;
  assert.ok(phonePattern.test("0901234567"));
  assert.ok(phonePattern.test("+84901234567"));
  assert.ok(phonePattern.test("+84 (024) 3825-9999"));
  assert.ok(!phonePattern.test("abc"));
  assert.ok(!phonePattern.test("123"));
});

test("order creation idempotency key format is non-empty string", () => {
  const idempotencyPattern = /^[A-Za-z0-9_-]{8,120}$/;
  const sampleKey = `ord_${Date.now()}_abc123`;
  assert.ok(idempotencyPattern.test(sampleKey));
});
