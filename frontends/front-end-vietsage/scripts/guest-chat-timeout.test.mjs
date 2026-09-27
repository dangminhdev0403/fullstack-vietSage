import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHAT_UPSTREAM_TIMEOUT_MS,
  getChatUpstreamError,
  isAbortError,
} from "../src/app/api/guest/chat/chat-upstream.ts";

const routeSource = readFileSync(
  new URL("../src/app/api/guest/chat/route.ts", import.meta.url),
  "utf8",
);

test("guest chat gives the grounded workflow a bounded 45-second window", () => {
  assert.equal(CHAT_UPSTREAM_TIMEOUT_MS, 45_000);
});

test("guest chat recognizes cross-realm abort errors without masking other failures", () => {
  assert.equal(isAbortError(new DOMException("timed out", "AbortError")), true);
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError(new Error("provider failed")), false);
});

test("guest chat maps an upstream abort to the stable 504 contract", () => {
  assert.deepEqual(getChatUpstreamError({ name: "AbortError" }), {
    status: 504,
    message: "CHAT_UPSTREAM_TIMEOUT",
  });
  assert.equal(getChatUpstreamError(new Error("provider failed")), null);
  assert.match(routeSource, /getChatUpstreamError\(error\)/);
});