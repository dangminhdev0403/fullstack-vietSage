import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./owner-rooms-client.tsx", import.meta.url), "utf8");

test("does not render BAD_REQUEST instead of the backend detail", () => {
  assert.match(source, /\^\[A-Z\]\[A-Z0-9_\]\+\$/);
  assert.match(source, /getNestedMessage\(error\.data\) \?\? fallback/);
});
