/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { createGuestConnectionManager } from "./guest-connection-manager.ts";

test("guest token disconnects socket when subscribers reach zero", () => {
  const sockets: any[] = [];
  const manager = createGuestConnectionManager({
    enabled: true,
    createSocket: (auth) => {
      const socket: any = { auth, connect() {}, disconnect() { this.disconnected = true; }, on() {} };
      sockets.push(socket);
      return socket;
    },
  });

  const unsub1 = manager.subscribe("token-1", {});
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].auth.sessionToken, "token-1");

  unsub1();
  assert.equal(sockets[0].disconnected, true);
});

test("multiple subscribers for same token share single socket", () => {
  const sockets: any[] = [];
  const manager = createGuestConnectionManager({
    enabled: true,
    createSocket: (auth) => {
      const handlers = new Map<string, (value?: unknown) => void>();
      const socket: any = {
        auth,
        connect() {},
        disconnect() {},
        on(event: string, handler: (value?: unknown) => void) { handlers.set(event, handler); },
        trigger(event: string, value?: unknown) { handlers.get(event)?.(value); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  let sub1Calls = 0;
  let sub2Calls = 0;
  const unsub1 = manager.subscribe("token-1", { onCreated: () => sub1Calls++ });
  const unsub2 = manager.subscribe("token-1", { onCreated: () => sub2Calls++ });
  sockets[0].trigger("guest_request.created", { request: { id: "r1" } });
  assert.equal(sockets.length, 1);
  assert.equal(sub1Calls, 1);
  assert.equal(sub2Calls, 1);
  unsub1();
  unsub2();
});

test("guest connect errors do not trigger onReconnect, but successful reconnect after connect does", () => {
  const sockets: any[] = [];
  let reconnectCount = 0;
  const manager = createGuestConnectionManager({
    enabled: true,
    createSocket: (auth) => {
      const handlers = new Map<string, (value?: unknown) => void>();
      const socket: any = {
        auth,
        connect() {},
        disconnect() {},
        on(event: string, handler: (value?: unknown) => void) { handlers.set(event, handler); },
        trigger(event: string, value?: unknown) { handlers.get(event)?.(value); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  const unsub = manager.subscribe("token-current", { onReconnect: () => reconnectCount++ });
  // Initial connect does not trigger onReconnect
  sockets[0].trigger("connect");
  assert.equal(reconnectCount, 0);

  // Connect error does NOT trigger onReconnect
  sockets[0].trigger("connect_error", new Error("offline"));
  assert.equal(reconnectCount, 0);

  // Next socket attempt connects (successful reconnection)
  if (sockets[1]) {
    sockets[1].trigger("connect");
    assert.equal(reconnectCount, 1);
  }
  unsub();
});

test("guest connection forwards stay-scoped message and close events", () => {
  const handlers = new Map<string, (value?: unknown) => void>();
  const manager = createGuestConnectionManager({
    enabled: true,
    createSocket: () => ({
      connect() {},
      disconnect() {},
      on(event: string, handler: (value?: unknown) => void) { handlers.set(event, handler); },
    }),
  });
  const received: unknown[] = [];
  const unsub = manager.subscribe("token-1", {
    onGuestMessageCreated: (event: unknown) => received.push(event),
    onConversationClosed: (event: unknown) => received.push(event),
  });
  const messageEvent = { thread: { stayId: "stay-1" }, message: { id: "message-1" } };
  const closeEvent = { stayId: "stay-1", roomId: "room-1" };
  handlers.get("guest_message.created")?.(messageEvent);
  handlers.get("conversation.closed")?.(closeEvent);
  assert.deepEqual(received, [messageEvent, closeEvent]);
  unsub();
});
