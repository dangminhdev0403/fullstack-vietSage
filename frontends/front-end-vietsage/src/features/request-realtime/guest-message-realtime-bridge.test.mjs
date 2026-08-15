import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./guest-request-realtime-notifier.tsx", import.meta.url), "utf8");

test("bridges socket guest_message.created events to the active guest chat", () => {
  const handler = source.slice(source.indexOf("onGuestMessageCreated:"), source.indexOf("onExternalOrderHotelAcknowledged:"));
  assert.match(handler, /dispatchGuestRequestRealtime\(\{ kind: "message" \}\)/);
});
