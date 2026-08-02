import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error strip-types needs extension
import { badgeText, createEventDeduper, isConversationClosedEventForHotel, isConversationClosedEventForScope, isConversationClosedEventForStay, isGuestMessageEventForHotel, isGuestMessageEventForScope, isGuestMessageEventForStay } from "./message-unread.ts";
// @ts-expect-error strip-types needs extension
import { createGuestConnectionManager } from "./guest-connection-manager.ts";
// @ts-expect-error strip-types needs extension
import { buildWorkspaceNavigation } from "../workspace/config/workspace-registry.ts";
// @ts-expect-error strip-types needs extension
import { HttpError } from "../../core/http/http-error.ts";

const event = { eventId: "e1", messageId: "m1", hotelId: "h1", stayId: "s1", threadId: "t1", message: { id: "m1", senderType: "GUEST" } };

test("formats unread badges", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(100), "99+");
});

test("dedupes bounded event ids", () => {
  const dedupe = createEventDeduper(2);
  assert.equal(dedupe.accept("e1"), true);
  assert.equal(dedupe.accept("e1"), false);
  assert.equal(dedupe.accept("e2"), true);
  assert.equal(dedupe.accept("e3"), true);
  assert.equal(dedupe.accept("e1"), true);
});

test("isolates message events by hotel and stay", () => {
  assert.equal(isGuestMessageEventForHotel(event, "h1"), true);
  assert.equal(isGuestMessageEventForHotel(event, "h2"), false);
  assert.equal(isGuestMessageEventForStay(event, "s1"), true);
  assert.equal(isGuestMessageEventForStay(event, "s2"), false);
  assert.equal(isGuestMessageEventForScope(event, "h1", "s1"), true);
  assert.equal(isGuestMessageEventForScope(event, "h2", "s1"), false);
  assert.equal(isGuestMessageEventForScope(event, "h1", "s2"), false);
});

test("room messages page uses dedicated message permissions", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../../app/(vietsage)/hotels/[hotelId]/messages/page.tsx", import.meta.url), "utf8"),
  );
  assert.match(source, /hotel\.messages\.view/);
  assert.match(source, /hotel\.messages\.manage/);
  assert.doesNotMatch(source, /hotel\.requests\.(?:view|manage)/);
});

test("staff.messages navigation requires hotel.messages.view or hotel.messages.manage", () => {
  const navWithoutMsgPermission = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.requests.view"],
    hotelId: "h1",
  });
  assert.equal(
    navWithoutMsgPermission.some((item) => item.key === "staff.messages"),
    false,
  );

  const navWithMsgPermission = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.messages.view"],
    hotelId: "h1",
  });
  assert.equal(
    navWithMsgPermission.some((item) => item.key === "staff.messages"),
    true,
  );
});

test("HttpError preserves Retry-After for the guest BFF", () => {
  const headers = new Headers({ "retry-after": "60" });
  const error = new HttpError({
    message: "Too Many Requests",
    status: 429,
    requestUrl: "/api/guest/messages",
    data: { status: 429, message: "RATE_LIMITED" },
    headers,
  });

  assert.equal(error.status, 429);
  assert.equal(error.headers?.get("retry-after"), "60");
});

test("validates conversation.closed event envelopes by hotel and stay", () => {
  const closedEvent = { eventId: "c1", hotelId: "h1", stayId: "s1" };
  assert.equal(isConversationClosedEventForHotel(closedEvent, "h1"), true);
  assert.equal(isConversationClosedEventForHotel(closedEvent, "h2"), false);
  assert.equal(isConversationClosedEventForStay(closedEvent, "s1"), true);
  assert.equal(isConversationClosedEventForStay(closedEvent, "s2"), false);
  assert.equal(isConversationClosedEventForScope(closedEvent, "h1", "s1"), true);
  assert.equal(isConversationClosedEventForScope(closedEvent, "h2", "s1"), false);
  assert.equal(isConversationClosedEventForScope(closedEvent, "h1", "s2"), false);
});

test("shares one guest connection per sessionToken across multiple subscribers", () => {
  let socketCreatedCount = 0;
  let socketDisconnectedCount = 0;
  const mockSocket = {
    on: () => {},
    connect: () => {},
    disconnect: () => { socketDisconnectedCount += 1; },
  };
  const manager = createGuestConnectionManager({
    enabled: true,
    createSocket: () => {
      socketCreatedCount += 1;
      return mockSocket;
    },
  });

  const unsub1 = manager.subscribe("sess-1", {});
  const unsub2 = manager.subscribe("sess-1", {});

  assert.equal(socketCreatedCount, 1);

  unsub1();
  assert.equal(socketDisconnectedCount, 0);

  unsub2();
  assert.equal(socketDisconnectedCount, 1);
});
