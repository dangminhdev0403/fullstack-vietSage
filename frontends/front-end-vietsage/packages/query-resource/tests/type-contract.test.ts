import { QueryClient } from "@tanstack/react-query";

import {
  createResource,
  defineInfiniteQuery,
  defineMutation,
  defineQuery,
  type ResourceInfiniteQueryContext,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "../src/index";

type Scope = {
  tenantId: string;
};

type ListInput = {
  page: number;
  q: string;
};

type Item = {
  id: string;
  name: string;
};

type ItemPage = {
  items: Item[];
  nextCursor?: string;
};

const fullResource = createResource<Scope>()({
  namespace: ["contract-test"],
  name: "items",
  scopeKey: (scope) => ["tenant", scope.tenantId],
  queries: {
    list: defineQuery({
      inputKey: (input: ListInput) => [input],
      queryFn: async ({
        scope,
        input,
      }: ResourceQueryContext<Scope, ListInput>): Promise<ItemPage> => ({
        items: [{ id: scope.tenantId, name: input.q }],
      }),
    }),
    detail: defineQuery({
      inputKey: (input: { id: string }) => [input.id],
      queryFn: async ({
        input,
      }: ResourceQueryContext<Scope, { id: string }>): Promise<Item> => ({
        id: input.id,
        name: input.id,
      }),
    }),
  },
  infiniteQueries: {
    activity: defineInfiniteQuery({
      inputKey: (input: { itemId: string }) => [input.itemId],
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage: ItemPage) => lastPage.nextCursor,
      queryFn: async ({
        input,
        pageParam,
      }: ResourceInfiniteQueryContext<
        Scope,
        { itemId: string },
        string | undefined
      >): Promise<ItemPage> => ({
        items: [{ id: input.itemId, name: pageParam ?? "first" }],
      }),
    }),
  },
  mutations: {
    create: defineMutation({
      mutationFn: async ({
        variables,
      }: ResourceMutationContext<Scope, { name: string }>): Promise<Item> => ({
        id: "new",
        name: variables.name,
      }),
      invalidates: [{ type: "query", operation: "list" }],
    }),
    update: defineMutation({
      mutationFn: async ({
        variables,
      }: ResourceMutationContext<
        Scope,
        { id: string; name: string }
      >): Promise<Item> => variables,
    }),
    remove: defineMutation({
      mutationFn: async ({
        variables,
      }: ResourceMutationContext<Scope, { id: string }>): Promise<string> =>
        variables.id,
    }),
  },
});

const client = new QueryClient();
const full = fullResource.bind({ tenantId: "tenant-1" });

const pagePromise: Promise<ItemPage> = full.queries.list.ensure(client, {
  page: 1,
  q: "",
});
void pagePromise;

const createOptions = full.mutations.create.options();
const createResult: Promise<Item> = createOptions.mutationFn!(
  { name: "New" },
  {
    client,
    meta: undefined,
    mutationKey: createOptions.mutationKey,
  },
);
void createResult;

full.infiniteQueries.activity.options({ itemId: "item-1" });

// @ts-expect-error list input requires both page and q
full.queries.list.options({ page: 1 });

// @ts-expect-error the full resource does not declare an approve mutation
full.mutations.approve.options();

const readOnlyResource = createResource<void>()({
  namespace: ["contract-test"],
  name: "countries",
  scopeKey: () => ["public"],
  queries: {
    all: defineQuery({
      inputKey: (input: undefined) =>
        input === undefined ? [] : [],
      queryFn: async (): Promise<Item[]> => [],
    }),
  },
});

const readOnly = readOnlyResource.bind(undefined);
readOnly.queries.all.options(undefined);

// @ts-expect-error a read-only resource has no create capability
readOnly.mutations.create.options();

defineQuery({
  inputKey: (input: undefined) =>
    input === undefined ? [] : [],
  queryFn: async (): Promise<Item[]> => [],
  defaults: {
    // @ts-expect-error enabled guards belong to the feature hook
    enabled: false,
  },
});

const createOnlyResource = createResource<Scope>()({
  namespace: ["contract-test"],
  name: "imports",
  scopeKey: (scope) => ["tenant", scope.tenantId],
  mutations: {
    create: defineMutation({
      mutationFn: async ({
        variables,
      }: ResourceMutationContext<Scope, FormData>): Promise<boolean> =>
        variables.has("file"),
    }),
  },
});

const createOnly = createOnlyResource.bind({ tenantId: "tenant-1" });
createOnly.mutations.create.options();

// @ts-expect-error a create-only resource has no list query
createOnly.queries.list.options({});

createResource<Scope>()({
  namespace: ["contract-test"],
  name: "invalid-invalidation",
  scopeKey: (scope) => ["tenant", scope.tenantId],
  queries: {
    list: defineQuery({
      inputKey: (input: undefined) =>
        input === undefined ? [] : [],
      queryFn: async (): Promise<Item[]> => [],
    }),
  },
  mutations: {
    // @ts-expect-error invalidation targets must reference a declared query
    create: defineMutation({
      mutationFn: async (): Promise<Item> => ({ id: "1", name: "item" }),
      invalidates: [{ type: "query", operation: "missing" }],
    }),
  },
});
