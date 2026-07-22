import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  readFileSync(new URL("../src/app/(vietsage)/g/messages/page.tsx", import.meta.url), "utf8"),
  readFileSync(
    new URL("../src/app/(vietsage)/hotels/[hotelId]/messages/room-messages-client.tsx", import.meta.url),
    "utf8",
  ),
];

test("over-limit chat drafts report an explicit error instead of silently disabling submit", () => {
  for (const source of sources) {
    assert.doesNotMatch(source, /disabled=\{!body\.trim\(\) \|\| body\.length > 1000 \|\|/);
    assert.match(source, /body\.length > 1000[\s\S]{0,180}setSendError/);
    assert.match(source, /role="alert"/);
  }
});

test("both message mutations surface request failures and refresh their active query", () => {
  for (const source of sources) {
    assert.match(source, /onError:/);
    assert.match(source, /setSendError/);
    assert.match(source, /invalidateQueries/);
  }
});

test("staff reply cache updates use the submitted thread instead of mutable selection state", () => {
  const staffSource = sources[1];
  assert.match(staffSource, /mutationFn: \(variables: \{ threadId: string; body: string \}\)/);
  assert.match(staffSource, /onSuccess: \(res, variables\)/);
  assert.match(staffSource, /\["hotel-message-thread", hotelId, variables\.threadId\]/);
  assert.match(staffSource, /reply\.mutate\(\{ threadId: selectedId, body: body\.trim\(\) \}\)/);
});
