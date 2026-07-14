/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { createGuestConnectionManager } from "./guest-connection-manager.ts";

test("guest token change disconnects the old socket and reconnect uses current token", () => {
  const sockets: any[] = [];
  const manager = createGuestConnectionManager({ enabled: true, createSocket: (auth) => { const socket: any = { auth, connect() {}, disconnect() { this.disconnected = true; }, on() {} }; sockets.push(socket); return socket; } });
  manager.update("token-1", {}); manager.update("token-2", {});
  assert.equal(sockets[0].disconnected, true); assert.equal(sockets[1].auth.sessionToken, "token-2");
  manager.update(null, {}); assert.equal(sockets[1].disconnected, true);
});

test("same-token updates use the latest handlers without reconnecting", () => {
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
  let oldCalls = 0;
  let newCalls = 0;
  manager.update("token-1", { onCreated: () => oldCalls++ });
  manager.update("token-1", { onCreated: () => newCalls++ });
  sockets[0].trigger("guest_request.created", { request: { id: "r1" } });
  assert.equal(sockets.length, 1);
  assert.equal(oldCalls, 0);
  assert.equal(newCalls, 1);
});

test("guest connect errors reconnect with the current token", () => {
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
  manager.update("token-current", {});
  sockets[0].trigger("connect_error", new Error("offline"));
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].auth.sessionToken, "token-current");
});
