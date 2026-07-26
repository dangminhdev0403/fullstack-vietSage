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

test("both message mutations surface request failures", () => {
  for (const source of sources) {
    assert.match(source, /onError:/);
    assert.match(source, /setSendError/);
  }
});

test("guest realtime and send success update the exact resource history query key", () => {
  const guestSource = sources[0];
  assert.match(guestSource, /const historyOptions = guestMessages\.infiniteQueries\.history\.options\(historyInput\)/);
  assert.match(guestSource, /setQueryData<InfiniteData<GuestMessagesResult>>\(\s*historyOptions\.queryKey/);
  assert.match(guestSource, /invalidateQueries\(\{ queryKey: historyOptions\.queryKey \}\)/);
  assert.doesNotMatch(guestSource, /\["guest-messages", sessionToken\]/);
});

test("frontdesk realtime and reply success update exact resource thread keys", () => {
  const staffSource = sources[1];
  assert.match(staffSource, /const threadListOptions = hotelMessages\.infiniteQueries\.threads\.options/);
  assert.match(staffSource, /const detailOptions = hotelMessages\.infiniteQueries\.detail\.options/);
  assert.match(staffSource, /const threadDetailKey = \(threadId: string\)[\s\S]{0,160}\.queryKey/);
  assert.match(staffSource, /setQueryData<InfiniteData<ThreadPage>>\(\s*threadDetailKey\(threadId\)/);
  assert.match(staffSource, /setQueryData<InfiniteData<ThreadList>>\(threadListOptions\.queryKey/);
  assert.doesNotMatch(staffSource, /\["hotel-message-thread", hotelId/);
  assert.doesNotMatch(staffSource, /\["hotel-message-threads", hotelId/);
});
