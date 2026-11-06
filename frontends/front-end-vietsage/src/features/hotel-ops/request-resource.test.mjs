import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";
import * as queryResource from "@dangminhdev04032005/query-resource";

const require = createRequire(import.meta.url);
function load(path, imports) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  imports = { "@dangminhdev04032005/query-resource": queryResource, ...imports };
  const module = { exports: {} };
  new Function("require", "exports", "module", code)((name) => name in imports ? imports[name] : require(name), module.exports, module);
  return module.exports;
}
function requests(transport) {
  const repository = load("./repositories/request-queue-repository.ts", {
    "@/core/http/internal-api-client": { requestInternalApi: transport },
  });
  const { requestQueueResource } = load("./resources/request-queue-resource.ts", {
    "../repositories/request-queue-repository": repository,
  });
  return requestQueueResource;
}

test("request detail is deduplicated in scope, isolates hotels and forwards cancellation", async () => {
  const calls = [];
  const resource = requests(async (url, options) => { calls.push({ url, options }); return { id: "request/a" }; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  try {
    const a = resource.bind({ basePath: "/api/hotel-ops/hotels/a/requests" }).queries.detail;
    const b = resource.bind({ basePath: "/api/hotel-ops/hotels/b/requests" }).queries.detail;
    await Promise.all([a.fetch(client, { requestId: "request/a" }), a.fetch(client, { requestId: "request/a" })]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/hotel-ops/hotels/a/requests/request%2Fa");
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.equal(b.get(client, { requestId: "request/a" }), undefined);
  } finally { client.clear(); }
});

test("request commands keep their endpoint, optional notes and nullable assignment", async () => {
  const calls = [];
  const resource = requests(async (url, options) => { calls.push({ url, options }); return { id: "r" }; });
  const bound = resource.bind({ basePath: "/requests" });
  const client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  try {
    for (const [name, variables] of [
      ["status", { requestId: "r/a", status: "COMPLETED", note: undefined }],
      ["assignment", { requestId: "r/a", assignedToUserId: null }],
      ["note", { requestId: "r/a", note: "Internal" }],
    ]) {
      await client.getMutationCache().build(client, bound.mutations[name].options()).execute(variables);
    }
    assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
      ["/requests/r%2Fa/status", "PATCH"], ["/requests/r%2Fa/assignment", "PATCH"], ["/requests/r%2Fa/events", "POST"],
    ]);
    assert.equal(calls[1].options.body.assignedToUserId, null);
    assert.equal("requestId" in calls[0].options.body, false);
  } finally { client.clear(); }
});

test("hotel realtime invalidates resource detail keys only for the affected hotel without duplicate targets", async () => {
  const resource = requests(async () => ({}));
  const invalidation = (name) => ({ bind: ({ hotelId, roleScope }) => {
    const root = ["vietsage", "hotel", hotelId, name, roleScope ?? ""];
    const invalidate = (client) => client.invalidateQueries({ queryKey: root });
    const queries = Object.fromEntries(["list", "allRooms", "plan", "marketplaceOrders", "inventoryGrid", "simulatedBookings"].map((operation) => [operation, {
      invalidateAll: (client) => client.invalidateQueries({ queryKey: [...root, operation] }),
    }]));
    return { invalidate, queries };
  } });
  const imports = { "../resources/request-queue-resource": { requestQueueResource: resource } };
  for (const [path, symbol] of [
    ["../resources/staff-rooms-resource", "staffRoomsResource"],
    ["../resources/owner-rooms-resource", "ownerRoomsResource"],
    ["../resources/owner-room-types-resource", "ownerRoomTypesResource"],
    ["../resources/room-plan-resource", "roomPlanResource"],
    ["../resources/hotel-messages-resource", "hotelMessagesResource"],
    ["@/features/local-partners/resources/local-partners-resource", "localPartnersResource"],
    ["@/features/channel-manager/api/channel-manager.resource", "channelManagerResource"],
    ["@/features/housekeeping/resources/housekeeping-resource", "housekeepingResource"],
  ]) imports[path] = { [symbol]: invalidation(symbol) };
  const realtime = load("./utils/invalidate-hotel-realtime-queries.ts", imports);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const calls = [];
  const nativeInvalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (filters) => { calls.push(filters.queryKey); return nativeInvalidate(filters); };
  const key = (hotelId) => resource.bind({ basePath: `/api/hotel-ops/hotels/${hotelId}/requests` }).queries.detail.key({ requestId: "r" });
  try {
    client.setQueryData(key("a"), { id: "r" });
    client.setQueryData(key("b"), { id: "r" });
    await realtime.invalidateHotelRequestRealtimeQueries(client, "a");
    assert.equal(client.getQueryState(key("a")).isInvalidated, true);
    assert.equal(client.getQueryState(key("b")).isInvalidated, false);
    calls.length = 0;
    await realtime.invalidateHotelRealtimeQueries(client, "a");
    assert.equal(new Set(calls.map(JSON.stringify)).size, calls.length);
    assert.equal(calls.some((key) => key.includes("staffRoomsResource") && key.includes("list")), false);
    assert.equal(calls.some((key) => key.includes("housekeepingResource") && key.includes("a")), true);
    assert.equal(calls.some((key) => key.includes("housekeepingResource") && key.includes("b")), false);
    calls.length = 0;
    await realtime.invalidateHotelRealtimeQueries(client, "");
    assert.equal(calls.length, 0);
  } finally { client.clear(); }
});


test("marketplace order commands invalidate only the affected hotel's orders", async () => {
  const calls = [];
  const repository = load("../local-partners/repositories/local-partners-repository.ts", {
    "@/core/http/internal-api-client": { requestInternalApiEnvelope: async (...args) => { calls.push(args); return { data: {} }; } },
  });
  const { localPartnersResource } = load("../local-partners/resources/local-partners-resource.ts", {
    "../repositories/local-partners-repository": repository,
  });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const a = localPartnersResource.bind({ hotelId: "a/b" });
  const b = localPartnersResource.bind({ hotelId: "b" });
  try {
    a.queries.marketplaceOrders.set(client, undefined, []);
    a.queries.providers.set(client, undefined, []);
    b.queries.marketplaceOrders.set(client, undefined, []);
    await client.getMutationCache().build(client, a.mutations.acknowledgeOrder.options()).execute({ orderId: "o/a" });
    await client.getMutationCache().build(client, a.mutations.cancelOrder.options()).execute({ orderId: "o/a" });
    assert.deepEqual(calls.map(([path, options]) => [path, options.method]), [
      ["/api/hotel-ops/hotels/a%2Fb/local-partners/providers/orders/o%2Fa/acknowledge", "POST"],
      ["/api/hotel-ops/hotels/a%2Fb/local-partners/providers/orders/o%2Fa/cancel", "POST"],
    ]);
    assert.equal(client.getQueryState(a.queries.marketplaceOrders.key(undefined)).isInvalidated, true);
    assert.equal(client.getQueryState(a.queries.providers.key(undefined)).isInvalidated, false);
    assert.equal(client.getQueryState(b.queries.marketplaceOrders.key(undefined)).isInvalidated, false);
  } finally { client.clear(); }
});
