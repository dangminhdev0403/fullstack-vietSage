import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all([
  readFile(new URL("../src/libs/auth-session-refresh.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/auth/refresh/route.ts", import.meta.url), "utf8"),
]);

const productionAuthDiagnostics = await Promise.all([
  readFile(new URL("../src/proxy.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/libs/auth-session-refresh.ts", import.meta.url), "utf8"),
]);

test("auth refresh logs never contain access or refresh token fragments", () => {
  for (const source of sources) {
    assert.doesNotMatch(source, /tokenTail\s*\(/);
    assert.doesNotMatch(
      source,
      /(?:accessTokenTail|refreshTokenTail|oldRefreshTokenTail|currentRefreshTokenTail)\s*:/,
    );
  }
});

test("routine auth diagnostics use the production-aware console", () => {
  for (const source of productionAuthDiagnostics) {
    assert.doesNotMatch(source, /console\.info\(/);
  }
});
