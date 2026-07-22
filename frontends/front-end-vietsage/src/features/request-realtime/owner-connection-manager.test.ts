/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { createOwnerConnectionManager } from "./owner-connection-manager.ts";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

test("shares one owner socket and fans out each event once", async () => {
  let tickets = 0;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({ enabled: true, getTicket: async () => ({ ticket: `t${++tickets}`, expiresAt: new Date(Date.now() + 60_000).toISOString() }), createSocket: (auth) => { const handlers = new Map<string, Function[]>(); const socket = { auth, on: (e: string, h: Function) => handlers.set(e, [...(handlers.get(e) ?? []), h]), connect() {}, disconnect() {}, trigger: (e: string, v?: unknown) => handlers.get(e)?.forEach((h) => h(v)) }; sockets.push(socket); return socket as any; } });
  let first = 0; let second = 0;
  const a = manager.subscribe("hotel-1", { onCreated: () => first++ });
  const b = manager.subscribe("hotel-1", { onCreated: () => second++ });
  await manager.settled("hotel-1");
  assert.equal(sockets.length, 1); assert.equal(tickets, 1);
  sockets[0].trigger("guest_request.created", { request: {} });
  assert.equal(first, 1); assert.equal(second, 1);
  a(); assert.equal(sockets[0].disconnected, undefined); b();
});

test("a subscriber arriving after connection reuses the existing hotel socket", async () => {
  let tickets = 0;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: `t${++tickets}`, expiresAt: "future" }),
    createSocket: (auth) => {
      const socket: any = { auth, on() {}, connect() {}, disconnect() {} };
      sockets.push(socket);
      return socket;
    },
  });
  manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  assert.equal(tickets, 1);
  assert.equal(sockets.length, 1);
});

test("forwards the authenticated ready signal to subscribers", async () => {
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: "ticket", expiresAt: "future" }),
    createSocket: () => {
      const handlers = new Map<string, Function>();
      const socket: any = {
        on: (event: string, handler: Function) => handlers.set(event, handler),
        connect() {},
        disconnect() {},
        trigger: (event: string, value?: unknown) => handlers.get(event)?.(value),
      };
      sockets.push(socket);
      return socket;
    },
  });
  let ready = 0;
  manager.subscribe("hotel-1", { onReady: () => ready++ });
  await manager.settled("hotel-1");
  sockets[0].trigger("request_realtime.ready", { mode: "owner", scope: { hotelId: "hotel-1" } });
  assert.equal(ready, 1);
});

test("forwards message and conversation lifecycle events without request unwrapping", async () => {
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: "ticket", expiresAt: "future" }),
    createSocket: () => {
      const handlers = new Map<string, Function>();
      const socket: any = {
        on: (event: string, handler: Function) => handlers.set(event, handler),
        connect() {},
        disconnect() {},
        trigger: (event: string, value?: unknown) => handlers.get(event)?.(value),
      };
      sockets.push(socket);
      return socket;
    },
  });
  const received: unknown[] = [];
  manager.subscribe("hotel-1", {
    onGuestMessageCreated: (event) => received.push(event),
    onConversationClosed: (event) => received.push(event),
  });
  await manager.settled("hotel-1");
  const messageEvent = { thread: { id: "thread-1" }, message: { id: "message-1" } };
  const closeEvent = { stayId: "stay-1", roomId: "room-1" };
  sockets[0].trigger("guest_message.created", messageEvent);
  sockets[0].trigger("conversation.closed", closeEvent);
  assert.deepEqual(received, [messageEvent, closeEvent]);
});

test("dedupes tickets, refreshes before reconnect, and ignores stale acquisition", async () => {
  const pending = deferred<{ ticket: string; expiresAt: string }>(); const sockets: any[] = []; let calls = 0;
  const manager = createOwnerConnectionManager({ enabled: true, getTicket: async () => { calls++; return calls === 1 ? pending.promise : { ticket: "fresh", expiresAt: new Date(Date.now() + 60_000).toISOString() }; }, createSocket: (auth) => { const handlers = new Map<string, Function[]>(); const socket: any = { auth, on: (e: string, h: Function) => handlers.set(e, [...(handlers.get(e) ?? []), h]), connect() {}, disconnect() { this.disconnected = true; }, trigger: (e: string) => handlers.get(e)?.forEach((h) => h()) }; sockets.push(socket); return socket; } });
  const off = manager.subscribe("hotel-1", {}); const off2 = manager.subscribe("hotel-1", {}); off(); off2();
  pending.resolve({ ticket: "stale", expiresAt: new Date(Date.now() + 60_000).toISOString() }); await Promise.resolve(); await Promise.resolve();
  assert.equal(sockets.length, 0);
  manager.subscribe("hotel-1", {}); await manager.settled("hotel-1"); assert.equal(sockets[0].auth.ticket, "fresh");
  sockets[0].trigger("disconnect"); await manager.settled("hotel-1"); assert.equal(sockets[1].auth.ticket, "fresh"); assert.equal(calls, 3);
});

test("disabled manager creates neither ticket nor socket", async () => {
  let calls = 0; const manager = createOwnerConnectionManager({ enabled: false, getTicket: async () => { calls++; return { ticket: "x", expiresAt: "x" }; }, createSocket: () => { calls++; return {} as any; } });
  manager.subscribe("hotel-1", {}); await manager.settled("hotel-1"); assert.equal(calls, 0);
});

test("terminal authentication errors do not start an automatic reconnect loop", async () => {
  let tickets = 0;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: `t${++tickets}`, expiresAt: "future" }),
    createSocket: (auth) => {
      const handlers = new Map<string, Function[]>();
      const socket: any = {
        auth,
        on: (event: string, handler: Function) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
        connect() {},
        disconnect() {},
        trigger: (event: string, value?: unknown) => handlers.get(event)?.forEach((handler) => handler(value)),
      };
      sockets.push(socket);
      return socket;
    },
  });
  manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  sockets[0].trigger("request_realtime.error", { code: "INVALID_CREDENTIAL", retryable: false });
  sockets[0].trigger("disconnect", "io server disconnect");
  await Promise.resolve();
  assert.equal(tickets, 1);
  assert.equal(sockets.length, 1);
});

test("connect errors reacquire a fresh owner ticket", async () => {
  let tickets = 0;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: `t${++tickets}`, expiresAt: "future" }),
    createSocket: (auth) => {
      const handlers = new Map<string, Function[]>();
      const socket: any = {
        auth,
        on: (event: string, handler: Function) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
        connect() {},
        disconnect() {},
        trigger: (event: string, value?: unknown) => handlers.get(event)?.forEach((handler) => handler(value)),
      };
      sockets.push(socket);
      return socket;
    },
  });
  manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  sockets[0].trigger("connect_error", new Error("offline"));
  await manager.settled("hotel-1");
  assert.equal(tickets, 2);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].auth.ticket, "t2");
});
