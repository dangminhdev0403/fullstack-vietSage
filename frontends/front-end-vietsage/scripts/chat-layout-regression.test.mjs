import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guestSource = readFileSync(
  new URL("../src/app/(vietsage)/g/messages/page.tsx", import.meta.url),
  "utf8",
);
const staffSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/hotels/[hotelId]/messages/room-messages-client.tsx",
    import.meta.url,
  ),
  "utf8",
);
const workspaceShellSource = readFileSync(
  new URL("../src/features/workspace/components/workspace-shell.tsx", import.meta.url),
  "utf8",
);

test("chat bubbles use half of the conversation box and wrap uninterrupted text", () => {
  for (const source of [guestSource, staffSource]) {
    assert.match(source, /max-w-\[50%\]/);
    assert.match(source, /\[overflow-wrap:anywhere\]/);
  }
});

test("chat composers do not silently stop accepting text at the backend limit", () => {
  for (const source of [guestSource, staffSource]) {
    assert.doesNotMatch(source, /maxLength=\{1000\}/);
    assert.match(source, /Tin nhắn dài tối đa 1000 ký tự/);
  }
});

test("staff chat keeps the active mobile conversation and composer inside the viewport", () => {
  assert.match(staffSource, /h-\[calc\(100dvh-7\.5rem\)\]/);
  assert.match(staffSource, /selectedId \? "hidden lg:flex" : "flex"/);
  assert.match(staffSource, /selectedId \? "flex" : "hidden lg:flex"/);
});

test("workspace shell does not scale or zoom dashboard content", () => {
  assert.doesNotMatch(workspaceShellSource, /(?:^|\s)(?:zoom|scale)-?\[/m);
  assert.doesNotMatch(workspaceShellSource, /transform:\s*scale|zoom\s*:/);
});
