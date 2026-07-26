import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./owner-rooms-client.tsx", import.meta.url), "utf8");

test("modal phòng dùng bố cục responsive, không ép năm cột", () => {
  assert.match(source, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(source, /max-w-4xl/);
  assert.match(source, /sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(source, /xl:grid-cols-5/);
});

test("modal phòng có semantics và actions an toàn trên mobile", () => {
  assert.match(source, /aria-labelledby="room-form-title"/);
  assert.match(source, /flex-col-reverse gap-3[^\"]*sm:flex-row sm:justify-end/);
});
