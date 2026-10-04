import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./guest-request-realtime-notifier.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("./use-guest-request-realtime.ts", import.meta.url), "utf8");

test("forwards marketplace conversation events through the guest realtime hook", () => {
  assert.match(hookSource, /onMarketplaceConversationMessageCreated\?:/);
  assert.match(
    hookSource,
    /onMarketplaceConversationMessageCreated:\s*\(value\)\s*=>\s*handlersRef\.current\.onMarketplaceConversationMessageCreated\?\.\(value\)/,
  );
});

test("bridges socket guest_message.created events to the active guest chat", () => {
  const handler = source.slice(source.indexOf("onGuestMessageCreated:"), source.indexOf("onExternalOrderHotelAcknowledged:"));
  assert.match(handler, /dispatchGuestRequestRealtime\(\{ kind: "message" \}\)/);
});

test("invalidates the resource-generated marketplace conversation key on realtime reply", () => {
  const handler = source.slice(
    source.indexOf("onMarketplaceConversationMessageCreated:"),
    source.indexOf("onExternalOrderHotelAcknowledged:"),
  );
  assert.match(handler, /guestMarketplaceResource/);
  assert.match(handler, /queries\.conversation\.options\(\{ orderId \}\)\.queryKey/);
  assert.doesNotMatch(handler, /queryKey:\s*\[/);
});
