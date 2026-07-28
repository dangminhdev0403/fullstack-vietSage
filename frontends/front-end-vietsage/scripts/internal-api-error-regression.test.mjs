import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/core/http/internal-api-client.ts", import.meta.url), "utf8");

test("internal API errors prefer a safe backend detail over the transport status", () => {
  assert.match(source, /readInternalApiErrorMessage\(payload, response\.status\)/);
  assert.match(source, /const detail = \(data as \{ detail\?: unknown \}\)\.detail/);
});
