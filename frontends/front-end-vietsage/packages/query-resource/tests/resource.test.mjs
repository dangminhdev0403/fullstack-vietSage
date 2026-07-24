import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import {
  createResource,
  defineInfiniteQuery,
  defineMutation,
  defineQuery,
} from "../dist/index.js";

function createTestResource(log = []) {
  return createResource()({
    namespace: ["test-app"],
    name: "items",
    scopeKey: (scope) => ["tenant", scope.tenantId],
    queries: {
      list: defineQuery({
        inputKey: (input) => [{ page: input.page, q: input.q }],
        queryFn: async ({ scope, input, signal }) => {
          log.push({ scope, input, signal });
          return {
            items: [{ id: `${scope.tenantId}-${input.page}`, name: input.q }],
          };
        },
      }),
    },
    infiniteQueries: {
      history: defineInfiniteQuery({
        inputKey: (input) => [input.itemId],
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        queryFn: async ({ input, pageParam }) => ({
          items: [{ id: input.itemId, cursor: pageParam ?? "first" }],
          nextCursor: pageParam ? undefined : "next",
        }),
      }),
    },
    mutations: {
      create: defineMutation({
        mutationFn: async ({ variables }) => ({
          id: "created",
          name: variables.name,
        }),
        invalidates: [{ type: "query", operation: "list" }],
      }),
    },
  });
}

test("builds deterministic scoped keys and forwards query context", async () => {
  const calls = [];
  const resource = createTestResource(calls);
  const bound = resource.bind({ tenantId: "tenant-1" });
  const input = { page: 2, q: "room" };

  assert.deepEqual(bound.key, ["test-app", "tenant", "tenant-1", "items"]);
  assert.deepEqual(bound.queries.list.key(input), [
    "test-app",
    "tenant",
    "tenant-1",
    "items",
    "query",
    "list",
    { page: 2, q: "room" },
  ]);

  const controller = new AbortController();
  const options = bound.queries.list.options(input);
  const data = await options.queryFn({
    queryKey: options.queryKey,
    signal: controller.signal,
  });

  assert.deepEqual(data.items, [{ id: "tenant-1-2", name: "room" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, controller.signal);
  assert.deepEqual(options.meta, {
    capability: "query",
    operation: "list",
    resource: "items",
  });
});

test("ensure reuses cached data and returns the typed query result", async () => {
  const calls = [];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const list = createTestResource(calls).bind({ tenantId: "t1" }).queries
    .list;
  const input = { page: 1, q: "" };

  const first = await list.ensure(client, input);
  const second = await list.ensure(client, input);

  assert.deepEqual(first, second);
  assert.equal(calls.length, 1);
});

test("patch rollback restores unchanged cache and protects newer writes", async () => {
  const client = new QueryClient();
  const list = createTestResource().bind({ tenantId: "t1" }).queries.list;
  const input = { page: 1, q: "" };

  list.set(client, input, { items: [{ id: "1", name: "before" }] });
  const rollback = list.patch(client, input, (current) => ({
    items: [...current.items, { id: "2", name: "optimistic" }],
  }));

  assert.equal(list.get(client, input).items.length, 2);
  await rollback();
  assert.deepEqual(list.get(client, input), {
    items: [{ id: "1", name: "before" }],
  });

  const staleRollback = list.patch(client, input, () => ({
    items: [{ id: "1", name: "first optimistic write" }],
  }));
  list.patch(client, input, () => ({
    items: [{ id: "1", name: "newer write" }],
  }));

  await staleRollback();
  assert.equal(list.get(client, input).items[0].name, "newer write");
  assert.equal(
    client.getQueryState(list.key(input)).isInvalidated,
    true,
  );
});

test("mutation lifecycle rolls back and local invalidation is targeted", async () => {
  const client = new QueryClient();
  const bound = createTestResource().bind({ tenantId: "t1" });
  const input = { page: 1, q: "" };
  const list = bound.queries.list;
  list.set(client, input, { items: [{ id: "1", name: "before" }] });

  const options = bound.mutations.create.options({
    optimistic: ({ client: currentClient, cache, variables }) =>
      cache.queries.list.patchAll(currentClient, (current) => ({
        items: [
          ...current.items,
          { id: "temp", name: variables.name },
        ],
      })),
  });
  const context = {
    client,
    meta: options.meta,
    mutationKey: options.mutationKey,
  };

  const rollback = await options.onMutate({ name: "draft" }, context);
  assert.equal(list.get(client, input).items.length, 2);

  await options.onError(
    new Error("failed"),
    { name: "draft" },
    rollback,
    context,
  );
  assert.equal(list.get(client, input).items.length, 1);

  await options.onSuccess(
    { id: "2", name: "saved" },
    { name: "saved" },
    undefined,
    context,
  );
  assert.equal(client.getQueryState(list.key(input)).isInvalidated, true);
});

test("infinite query capabilities use a separate key family", () => {
  const history = createTestResource().bind({ tenantId: "t1" })
    .infiniteQueries.history;
  const options = history.options({ itemId: "item-1" });

  assert.deepEqual(history.prefix, [
    "test-app",
    "tenant",
    "t1",
    "items",
    "infinite",
    "history",
  ]);
  assert.deepEqual(options.queryKey, [...history.prefix, "item-1"]);
  assert.equal(
    options.getNextPageParam(
      { items: [], nextCursor: "cursor-2" },
      [],
      undefined,
      [],
    ),
    "cursor-2",
  );
});
