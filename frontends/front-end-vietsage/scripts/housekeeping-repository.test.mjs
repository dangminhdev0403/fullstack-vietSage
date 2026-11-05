import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript/lib/typescript.js";

async function compile(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const repositoryCode = await compile("../src/features/housekeeping/repositories/housekeeping-repository.ts");
const resourceCode = await compile("../src/features/housekeeping/resources/housekeeping-resource.ts");

function runModule(code, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    URLSearchParams,
    require: (name) => {
      assert.ok(name in dependencies, "Unexpected dependency: " + name);
      return dependencies[name];
    },
  });
  return module.exports;
}

function loadData(request) {
  const calls = [];
  const { housekeepingRepository } = runModule(repositoryCode, {
    "@/core/http/internal-api-client": {
      requestInternalApiEnvelope: async (endpoint, options) => {
        const url = new URL(endpoint, "https://local.test");
        calls.push({ url, options });
        return { data: await request(url, options) };
      },
    },
  });
  const { housekeepingResource } = runModule(resourceCode, {
    "@dangminhdev04032005/query-resource": {
      createResource: () => (config) => config,
      defineQuery: (query) => query,
      defineMutation: (mutation) => mutation,
    },
    "../repositories/housekeeping-repository": { housekeepingRepository },
  });
  return { repository: housekeepingRepository, queries: housekeepingResource.queries, calls };
}

function pageOf(items, url, withTotalPages = true) {
  const page = Number(url.searchParams.get("page"));
  const limit = Number(url.searchParams.get("limit"));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limit,
    ...(withTotalPages ? { totalPages: Math.ceil(items.length / limit) } : {}),
  };
}

const scope = { hotelId: "hotel/one" };

test("rooms resource includes page two beyond 100 rooms and forwards filters/signal", async () => {
  const rooms = Array.from({ length: 125 }, (_, index) => ({ id: "room-" + (index + 1) }));
  const signal = new AbortController().signal;
  const { queries, calls } = loadData((url, options) => {
    assert.equal(url.pathname, "/api/hotel-ops/hotels/hotel%2Fone/rooms");
    assert.equal(url.searchParams.get("status"), "DIRTY");
    assert.equal(url.searchParams.get("floor"), "2");
    assert.equal(url.searchParams.get("q"), "East");
    assert.equal(options.signal, signal);
    return pageOf(rooms, url);
  });
  const result = await queries.rooms.queryFn({ scope, input: { status: "dirty", floor: "2", q: " East ", page: 9, limit: 1 }, signal });
  assert.equal(result.items.length, 125);
  assert.equal(result.items[100].id, "room-101");
  assert.equal(result.items[124].id, "room-125");
  assert.deepEqual(calls.map(({ url }) => [url.searchParams.get("page"), url.searchParams.get("limit")]), [["1", "100"], ["2", "100"]]);
});

test("tasks resource includes page two with total/limit fallback and preserves assignment filter", async () => {
  const tasks = Array.from({ length: 121 }, (_, index) => ({ id: "task-" + (index + 1) }));
  const signal = new AbortController().signal;
  const { queries, calls } = loadData((url, options) => {
    assert.ok(url.pathname.endsWith("/housekeeping/tasks"));
    assert.equal(url.searchParams.get("assignedToUserId"), "staff-1");
    assert.equal(url.searchParams.get("status"), "QUEUED");
    assert.equal(options.signal, signal);
    return pageOf(tasks, url, false);
  });
  const result = await queries.tasks.queryFn({ scope, input: { assignedToUserId: "staff-1", status: "QUEUED" }, signal });
  assert.equal(result.items.length, 121);
  assert.equal(result.items[120].id, "task-121");
  assert.deepEqual(calls.map(({ url }) => url.searchParams.get("page")), ["1", "2"]);
});

test("active requests resource fetches every active status page while excluding history on the server", async () => {
  const pending = Array.from({ length: 52 }, (_, index) => ({ id: "pending-" + index, status: "PENDING" }));
  const acknowledged = Array.from({ length: 53 }, (_, index) => ({ id: "ack-" + index, status: "ACKNOWLEDGED" }));
  const completed = [{ id: "old-history", status: "COMPLETED" }];
  const signal = new AbortController().signal;
  const { queries, calls } = loadData((url, options) => {
    assert.ok(url.pathname.endsWith("/requests"));
    const status = url.searchParams.get("status");
    assert.ok(["PENDING", "ACKNOWLEDGED"].includes(status));
    assert.equal(url.searchParams.get("priority"), "URGENT");
    assert.equal(url.searchParams.get("roomNumber"), "201");
    assert.equal(options.signal, signal);
    const records = [...pending, ...acknowledged, ...completed].filter((item) => item.status === status);
    return pageOf(records, url);
  });
  const result = await queries.requests.queryFn({ scope, input: { status: "COMPLETED", priority: "URGENT", roomNumber: "201", page: 7, limit: 1 }, signal });
  assert.equal(result.items.length, 105);
  assert.equal(result.total, 105);
  assert.ok(result.items.some((item) => item.id === "pending-51"));
  assert.ok(result.items.some((item) => item.id === "ack-52"));
  assert.ok(!result.items.some((item) => item.id === "old-history"));
  assert.deepEqual(calls.map(({ url }) => url.searchParams.get("status") + ":" + url.searchParams.get("page")).sort(), ["ACKNOWLEDGED:1", "ACKNOWLEDGED:2", "PENDING:1", "PENDING:2"]);
  assert.ok(calls.every(({ url }) => url.searchParams.get("limit") === "50"));
});

test("request transitioning between active statuses is deduplicated with acknowledged state", async () => {
  const { repository } = loadData((url) => {
    const status = url.searchParams.get("status");
    return pageOf([{ id: "same-request", status }], url);
  });
  const result = await repository.listActiveRequests(scope.hotelId);
  assert.equal(result.items.length, 1);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "same-request");
  assert.equal(result.items[0].status, "ACKNOWLEDGED");
});

test("cancellation reaches later pages and propagates for each collection", async () => {
  for (const method of ["listAllRooms", "listAllTasks", "listActiveRequests"]) {
    const controller = new AbortController();
    const failure = new Error("cancelled " + method);
    const { repository, calls } = loadData((url, options) => {
      assert.equal(options.signal, controller.signal);
      if (options.signal.aborted) throw options.signal.reason;
      controller.abort(failure);
      return { items: [{ id: "first-page" }], total: 101, page: 1, limit: Number(url.searchParams.get("limit")), totalPages: 2 };
    });
    await assert.rejects(repository[method](scope.hotelId, undefined, controller.signal), (error) => error === failure);
    assert.ok(calls.length >= 2);
    assert.ok(calls.every(({ options }) => options.signal === controller.signal));
  }
});
