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
  let retry!: () => void;
  const manager = createOwnerConnectionManager({ enabled: true, getTicket: async () => { calls++; return calls === 1 ? pending.promise : { ticket: "fresh", expiresAt: new Date(Date.now() + 60_000).toISOString() }; }, createSocket: (auth) => { const handlers = new Map<string, Function[]>(); const socket: any = { auth, on: (e: string, h: Function) => handlers.set(e, [...(handlers.get(e) ?? []), h]), connect() {}, disconnect() { this.disconnected = true; }, trigger: (e: string) => handlers.get(e)?.forEach((h) => h()) }; sockets.push(socket); return socket; }, scheduleReconnect: (callback) => { retry = callback; return () => {}; } });
  const off = manager.subscribe("hotel-1", {}); const off2 = manager.subscribe("hotel-1", {}); off(); off2();
  pending.resolve({ ticket: "stale", expiresAt: new Date(Date.now() + 60_000).toISOString() }); await Promise.resolve(); await Promise.resolve();
  assert.equal(sockets.length, 0);
  manager.subscribe("hotel-1", {}); await manager.settled("hotel-1"); assert.equal(sockets[0].auth.ticket, "fresh");
  sockets[0].trigger("disconnect"); retry(); await Promise.resolve(); await manager.settled("hotel-1"); assert.equal(sockets[1].auth.ticket, "fresh"); assert.equal(calls, 3);
});

test("retries a transient ticket failure without requiring another subscription", async () => {
  let calls = 0;
  let errors = 0;
  let retries = 0;
  let retry!: () => void;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => {
      if (++calls === 1) throw Object.assign(new Error("temporarily unavailable"), { status: 503 });
      return { ticket: "fresh", expiresAt: "future" };
    },
    createSocket: (auth) => {
      const socket = { auth, on() {}, connect() {}, disconnect() {} };
      sockets.push(socket);
      return socket;
    },
    scheduleReconnect: (callback) => {
      retries++;
      retry = callback;
      return () => {};
    },
  });
  const off = manager.subscribe("hotel-1", { onError: () => errors++ });
  await manager.settled("hotel-1");
  assert.equal(errors, 1);
  assert.equal(retries, 1);
  assert.equal(sockets.length, 0);
  manager.subscribe("hotel-1", {});
  assert.equal(calls, 1);
  retry();
  retry();
  await Promise.resolve();
  await manager.settled("hotel-1");
  assert.equal(calls, 2);
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].auth.ticket, "fresh");
  off();
});

test("unsubscribe cancels ticket retry and ignores its callback after resubscribe", async () => {
  let calls = 0;
  let cancelled = 0;
  let retry!: () => void;
  const sockets: any[] = [];
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => {
      if (++calls === 1) throw new Error("offline");
      return { ticket: "fresh", expiresAt: "future" };
    },
    createSocket: (auth) => {
      const socket = { auth, on() {}, connect() {}, disconnect() {} };
      sockets.push(socket);
      return socket;
    },
    scheduleReconnect: (callback) => {
      retry = callback;
      return () => { cancelled++; };
    },
  });
  const off = manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  off();
  assert.equal(cancelled, 1);
  const offNew = manager.subscribe("hotel-1", {});
  retry();
  await Promise.resolve();
  await manager.settled("hotel-1");
  assert.equal(calls, 2);
  assert.equal(sockets.length, 1);
  offNew();
});

test("terminal ticket failures do not schedule automatic retries", async () => {
  for (const error of [{ retryable: false }, { status: 401 }, { status: 403 }]) {
    let retries = 0;
    const manager = createOwnerConnectionManager({
      enabled: true,
      getTicket: async () => { throw error; },
      createSocket: () => { throw new Error("must not create a socket"); },
      scheduleReconnect: () => { retries++; return () => {}; },
    });
    const off = manager.subscribe("hotel-1", {});
    await manager.settled("hotel-1");
    assert.equal(retries, 0);
    off();
  }
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
  let retries = 0;
  let retry!: () => void;
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
    scheduleReconnect: (callback) => {
      retries++;
      retry = callback;
      return () => {};
    },
  });
  manager.subscribe("hotel-1", {});
  await manager.settled("hotel-1");
  sockets[0].trigger("connect_error", new Error("offline"));
  sockets[0].trigger("disconnect");
  assert.equal(retries, 1);
  retry();
  await Promise.resolve();
  await manager.settled("hotel-1");
  assert.equal(tickets, 2);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].auth.ticket, "t2");
});

test("forwards external service order events to subscribers", async () => {
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
  const createdEvents: unknown[] = [];
  const statusEvents: unknown[] = [];
  manager.subscribe("hotel-1", {
    onExternalOrderCreated: (event) => createdEvents.push(event),
    onExternalOrderStatusChanged: (event) => statusEvents.push(event),
  });
  await manager.settled("hotel-1");

  const payload = {
    orderId: "ord-123",
    hotelId: "hotel-1",
    roomNumber: "200",
    guestDisplayName: "Nguyen Van A",
    serviceName: "Massage 60 phút",
  };
  sockets[0].trigger("external_service_order.created", payload);
  sockets[0].trigger("external_service_order.status_changed", { ...payload, status: "CONFIRMED" });

  assert.equal(createdEvents.length, 1);
  assert.deepEqual(createdEvents[0], payload);
  assert.equal(statusEvents.length, 1);
});

test("forwards room status updated events to subscribers", async () => {
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
  const roomStatusEvents: unknown[] = [];
  manager.subscribe("hotel-1", {
    onRoomStatusUpdated: (event) => roomStatusEvents.push(event),
  });
  await manager.settled("hotel-1");

  const payload = {
    eventId: "evt-123",
    hotelId: "hotel-1",
    roomId: "room-101",
    roomNumber: "101",
    status: "AVAILABLE",
    previousStatus: "PROCESSING",
    updatedAt: "2026-10-15T08:00:00.000Z",
  };
  sockets[0].trigger("room_status.updated", payload);

  assert.equal(roomStatusEvents.length, 1);
  assert.deepEqual(roomStatusEvents[0], payload);
});

test("forwards housekeeping task created, claimed, started, blocked, completed, and reopened events", async () => {
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

  const created: unknown[] = [];
  const claimed: unknown[] = [];
  const started: unknown[] = [];
  const blocked: unknown[] = [];
  const completed: unknown[] = [];
  const reopened: unknown[] = [];

  manager.subscribe("hotel-1", {
    onHousekeepingTaskCreated: (e) => created.push(e),
    onHousekeepingTaskClaimed: (e) => claimed.push(e),
    onHousekeepingTaskStarted: (e) => started.push(e),
    onHousekeepingTaskBlocked: (e) => blocked.push(e),
    onHousekeepingTaskCompleted: (e) => completed.push(e),
    onHousekeepingTaskReopened: (e) => reopened.push(e),
  });
  await manager.settled("hotel-1");

  const base = { hotelId: "hotel-1", taskId: "task-101", roomId: "room-1", roomNumber: "101" };
  sockets[0].trigger("housekeeping_task.created", { ...base, eventId: "evt-c1", status: "CREATED" });
  sockets[0].trigger("housekeeping_task.claimed", { ...base, eventId: "evt-c2", status: "CLAIMED", assignedStaffName: "Lan" });
  sockets[0].trigger("housekeeping_task.started", { ...base, eventId: "evt-c3", status: "IN_PROGRESS" });
  sockets[0].trigger("housekeeping_task.blocked", { ...base, eventId: "evt-c4", status: "BLOCKED", reason: "Khóa hỏng" });
  sockets[0].trigger("housekeeping_task.completed", { ...base, eventId: "evt-c5", status: "COMPLETED" });
  sockets[0].trigger("housekeeping_task.reopened", { ...base, eventId: "evt-c6", status: "REOPENED", reason: "Chưa sạch" });

  assert.equal(created.length, 1);
  assert.equal((created[0] as any).status, "CREATED");
  assert.equal(claimed.length, 1);
  assert.equal((claimed[0] as any).status, "CLAIMED");
  assert.equal(started.length, 1);
  assert.equal((started[0] as any).status, "IN_PROGRESS");
  assert.equal(blocked.length, 1);
  assert.equal((blocked[0] as any).status, "BLOCKED");
  assert.equal(completed.length, 1);
  assert.equal((completed[0] as any).status, "COMPLETED");
  assert.equal(reopened.length, 1);
  assert.equal((reopened[0] as any).status, "REOPENED");
});

test("dedupes housekeeping task events by eventId", async () => {
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

  let count = 0;
  manager.subscribe("hotel-1", {
    onHousekeepingTaskCompleted: () => count++,
  });
  await manager.settled("hotel-1");

  const evt = { eventId: "duplicate-evt-id-99", hotelId: "hotel-1", taskId: "task-1", status: "COMPLETED" };
  sockets[0].trigger("housekeeping_task.completed", evt);
  sockets[0].trigger("housekeeping_task.completed", evt);
  sockets[0].trigger("housekeeping_task.completed", evt);

  assert.equal(count, 1);
});

test("a replacement socket triggers onReconnect once after a real disconnect", async () => {
  const sockets: any[] = [];
  let retry!: () => void;
  const manager = createOwnerConnectionManager({
    enabled: true,
    getTicket: async () => ({ ticket: "ticket", expiresAt: "future" }),
    createSocket: () => {
      const handlers = new Map<string, Function[]>();
      const socket: any = {
        on: (event: string, handler: Function) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
        connect() {},
        disconnect() {},
        trigger: (event: string, value?: unknown) => handlers.get(event)?.forEach((handler) => handler(value)),
      };
      sockets.push(socket);
      return socket;
    },
    scheduleReconnect: (callback) => {
      retry = callback;
      return () => {};
    },
  });

  let reconnected = 0;
  manager.subscribe("hotel-1", {
    onReconnect: () => reconnected++,
  });
  await manager.settled("hotel-1");

  sockets[0].trigger("connect");
  assert.equal(reconnected, 0);

  sockets[0].trigger("disconnect");
  retry();
  await Promise.resolve();
  await manager.settled("hotel-1");
  assert.equal(sockets.length, 2);
  // Late events from the disconnected socket must not count as a reconnect.
  sockets[0].trigger("connect");
  assert.equal(reconnected, 0);
  sockets[1].trigger("connect");
  assert.equal(reconnected, 1);
});

