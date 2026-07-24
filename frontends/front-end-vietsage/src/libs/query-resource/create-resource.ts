import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import {
  patchMatchingQueryData,
  patchQueryData,
} from "./rollback";
import type {
  BoundInfiniteQueryOperation,
  BoundMutationOperation,
  BoundQueryOperation,
  ResourceBuiltQueryOptions,
  ResourceInfiniteQueryDefinitionTypes,
  ResourceInfiniteQueryDefinitionShape,
  ResourceLocalInvalidation,
  ResourceMutationDefinitionTypes,
  ResourceMutationDefinitionShape,
  ResourceMutationLifecycle,
  ResourceQueryDefinitionTypes,
  ResourceQueryDefinitionShape,
  ResourceRollback,
} from "./types";

type QueryDefinitions<TScope> = Readonly<
  Record<string, ResourceQueryDefinitionShape<TScope>>
>;
type InfiniteQueryDefinitions<TScope> = Readonly<
  Record<string, ResourceInfiniteQueryDefinitionShape<TScope>>
>;
type MutationDefinitions<TScope> = Readonly<
  Record<string, ResourceMutationDefinitionShape<TScope>>
>;

type AllowedLocalInvalidation<TQueries, TInfiniteQueries> =
  | Readonly<{
      type: "query";
      operation: keyof TQueries & string;
    }>
  | Readonly<{
      type: "infinite";
      operation: keyof TInfiniteQueries & string;
    }>;

type MutationInvalidation<TDefinition> = TDefinition extends {
  readonly invalidates?: infer TInvalidations;
}
  ? TInvalidations extends readonly ResourceLocalInvalidation[]
    ? TInvalidations[number]
    : never
  : never;

type ValidateMutationDefinitions<
  TQueries,
  TInfiniteQueries,
  TMutations,
> = {
  readonly [TOperation in keyof TMutations]: Exclude<
    MutationInvalidation<TMutations[TOperation]>,
    AllowedLocalInvalidation<TQueries, TInfiniteQueries>
  > extends never
    ? TMutations[TOperation]
    : never;
};

type QueryInput<TDefinition> =
  ResourceQueryDefinitionTypes<TDefinition>["input"];

type QueryData<TDefinition> =
  ResourceQueryDefinitionTypes<TDefinition>["data"];

type QueryError<TDefinition> =
  ResourceQueryDefinitionTypes<TDefinition>["error"];

type InfiniteInput<TDefinition> =
  ResourceInfiniteQueryDefinitionTypes<TDefinition>["input"];

type InfinitePage<TDefinition> =
  ResourceInfiniteQueryDefinitionTypes<TDefinition>["page"];

type InfinitePageParam<TDefinition> =
  ResourceInfiniteQueryDefinitionTypes<TDefinition>["pageParam"];

type InfiniteError<TDefinition> =
  ResourceInfiniteQueryDefinitionTypes<TDefinition>["error"];

type MutationVariables<TDefinition> =
  ResourceMutationDefinitionTypes<TDefinition>["variables"];

type MutationData<TDefinition> =
  ResourceMutationDefinitionTypes<TDefinition>["data"];

type MutationError<TDefinition> =
  ResourceMutationDefinitionTypes<TDefinition>["error"];

export type BoundResourceQueries<TQueries> = {
  readonly [TOperation in keyof TQueries]: BoundQueryOperation<
    QueryInput<TQueries[TOperation]>,
    QueryData<TQueries[TOperation]>,
    QueryError<TQueries[TOperation]>
  >;
};

export type BoundResourceInfiniteQueries<TInfiniteQueries> = {
  readonly [TOperation in keyof TInfiniteQueries]: BoundInfiniteQueryOperation<
    InfiniteInput<TInfiniteQueries[TOperation]>,
    InfinitePage<TInfiniteQueries[TOperation]>,
    InfiniteError<TInfiniteQueries[TOperation]>,
    InfinitePageParam<TInfiniteQueries[TOperation]>
  >;
};

export type BoundResourceCache<TQueries, TInfiniteQueries> = {
  readonly key: QueryKey;
  readonly queries: BoundResourceQueries<TQueries>;
  readonly infiniteQueries: BoundResourceInfiniteQueries<TInfiniteQueries>;
  invalidate(client: QueryClient): Promise<void>;
  cancel(client: QueryClient): Promise<void>;
  remove(client: QueryClient): void;
};

export type BoundResourceMutations<
  TScope,
  TQueries,
  TInfiniteQueries,
  TMutations,
> = {
  readonly [TOperation in keyof TMutations]: BoundMutationOperation<
    TScope,
    MutationVariables<TMutations[TOperation]>,
    MutationData<TMutations[TOperation]>,
    MutationError<TMutations[TOperation]>,
    BoundResourceCache<TQueries, TInfiniteQueries>
  >;
};

export type BoundResource<
  TScope,
  TQueries,
  TInfiniteQueries,
  TMutations,
> = BoundResourceCache<TQueries, TInfiniteQueries> & {
  readonly mutations: BoundResourceMutations<
    TScope,
    TQueries,
    TInfiniteQueries,
    TMutations
  >;
};

export type CreatedResource<
  TScope,
  TQueries,
  TInfiniteQueries,
  TMutations,
> = {
  readonly name: string;
  rootKey(scope: TScope): QueryKey;
  bind(
    scope: TScope,
  ): BoundResource<TScope, TQueries, TInfiniteQueries, TMutations>;
};

type ResourceConfig<
  TScope,
  TQueries extends QueryDefinitions<TScope>,
  TInfiniteQueries extends InfiniteQueryDefinitions<TScope>,
  TMutations extends MutationDefinitions<TScope>,
> = {
  readonly namespace: QueryKey;
  readonly name: string;
  readonly scopeKey: (scope: TScope) => QueryKey;
  readonly queries?: TQueries;
  readonly infiniteQueries?: TInfiniteQueries;
  readonly mutations?: TMutations &
    ValidateMutationDefinitions<TQueries, TInfiniteQueries, TMutations>;
};

type RuntimeQueryDefinition = {
  readonly inputKey: (input: unknown) => QueryKey;
  readonly queryFn: (context: {
    scope: unknown;
    input: unknown;
    signal: AbortSignal;
  }) => Promise<unknown>;
  readonly defaults?: Readonly<Record<string, unknown>>;
};

type RuntimeInfiniteDefinition = {
  readonly inputKey: (input: unknown) => QueryKey;
  readonly queryFn: (context: {
    scope: unknown;
    input: unknown;
    signal: AbortSignal;
    pageParam: unknown;
  }) => Promise<unknown>;
  readonly initialPageParam: unknown;
  readonly getNextPageParam: (
    lastPage: unknown,
    allPages: unknown[],
    lastPageParam: unknown,
    allPageParams: unknown[],
  ) => unknown;
  readonly getPreviousPageParam?: (
    firstPage: unknown,
    allPages: unknown[],
    firstPageParam: unknown,
    allPageParams: unknown[],
  ) => unknown;
  readonly defaults?: Readonly<Record<string, unknown>>;
};

type RuntimeMutationDefinition = {
  readonly mutationFn: (context: {
    scope: unknown;
    variables: unknown;
  }) => Promise<unknown>;
  readonly invalidates?: readonly ResourceLocalInvalidation[];
  readonly serialScope?: (scope: unknown) => string;
  readonly defaults?: Readonly<Record<string, unknown>>;
};

type RuntimeLifecycle = ResourceMutationLifecycle<
  unknown,
  unknown,
  unknown,
  unknown,
  RuntimeBoundCache,
  ResourceRollback
>;

type RuntimeQueryOperation = BoundQueryOperation<unknown, unknown, Error>;
type RuntimeInfiniteOperation = BoundInfiniteQueryOperation<
  unknown,
  unknown,
  Error,
  unknown
>;
type RuntimeBoundCache = {
  readonly key: QueryKey;
  readonly queries: Record<string, RuntimeQueryOperation>;
  readonly infiniteQueries: Record<string, RuntimeInfiniteOperation>;
  invalidate(client: QueryClient): Promise<void>;
  cancel(client: QueryClient): Promise<void>;
  remove(client: QueryClient): void;
};

function recordEntries(
  value: Readonly<Record<string, unknown>> | undefined,
): [string, unknown][] {
  return Object.entries(value ?? {});
}

function createMeta(
  defaults: Readonly<Record<string, unknown>> | undefined,
  resource: string,
  operation: string,
  capability: "query" | "infinite" | "mutation",
): Record<string, unknown> {
  const current =
    defaults?.meta &&
    typeof defaults.meta === "object" &&
    !Array.isArray(defaults.meta)
      ? (defaults.meta as Record<string, unknown>)
      : {};

  return {
    ...current,
    resource,
    operation,
    capability,
  };
}

function buildQueryOperation(
  definition: RuntimeQueryDefinition,
  prefix: QueryKey,
  scope: unknown,
  resource: string,
  operation: string,
): RuntimeQueryOperation {
  const key = (input: unknown): QueryKey => [
    ...prefix,
    ...definition.inputKey(input),
  ];
  const options = (
    input: unknown,
  ): ResourceBuiltQueryOptions<unknown, Error> =>
    queryOptions({
      ...definition.defaults,
      queryKey: key(input),
      queryFn: ({ signal }) =>
        definition.queryFn({ scope, input, signal }),
      meta: createMeta(definition.defaults, resource, operation, "query"),
    }) as ResourceBuiltQueryOptions<unknown, Error>;

  return {
    prefix,
    key,
    options,
    prefetch: (client, input) => client.prefetchQuery(options(input)),
    fetch: (client, input) => client.fetchQuery(options(input)),
    ensure: (client, input, ensureOptions) =>
      client.ensureQueryData({
        ...options(input),
        revalidateIfStale: ensureOptions?.revalidateIfStale,
      }),
    get: (client, input) => client.getQueryData(key(input)),
    set: (client, input, value) =>
      client.setQueryData(
        key(input),
        typeof value === "function" ? value : () => value,
      ),
    patch: (client, input, updater) =>
      patchQueryData(client, key(input), updater),
    patchAll: (client, updater) =>
      patchMatchingQueryData(client, prefix, updater),
    invalidate: (client, input) =>
      client.invalidateQueries({ queryKey: key(input), exact: true }),
    invalidateAll: (client) =>
      client.invalidateQueries({ queryKey: prefix }),
    cancel: (client, input) =>
      client.cancelQueries({ queryKey: key(input), exact: true }),
    cancelAll: (client) => client.cancelQueries({ queryKey: prefix }),
    remove: (client, input) =>
      client.removeQueries({ queryKey: key(input), exact: true }),
    removeAll: (client) => client.removeQueries({ queryKey: prefix }),
  };
}

function buildInfiniteOperation(
  definition: RuntimeInfiniteDefinition,
  prefix: QueryKey,
  scope: unknown,
  resource: string,
  operation: string,
): RuntimeInfiniteOperation {
  const key = (input: unknown): QueryKey => [
    ...prefix,
    ...definition.inputKey(input),
  ];
  const options = (input: unknown) =>
    infiniteQueryOptions({
      ...definition.defaults,
      queryKey: key(input),
      queryFn: ({ signal, pageParam }) =>
        definition.queryFn({ scope, input, signal, pageParam }),
      initialPageParam: definition.initialPageParam,
      getNextPageParam: definition.getNextPageParam,
      getPreviousPageParam: definition.getPreviousPageParam,
      meta: createMeta(
        definition.defaults,
        resource,
        operation,
        "infinite",
      ),
    });

  return {
    prefix,
    key,
    options,
    prefetch: (client, input) =>
      client.prefetchInfiniteQuery(options(input)),
    fetch: (client, input) => client.fetchInfiniteQuery(options(input)),
    ensure: (client, input, ensureOptions) =>
      client.ensureInfiniteQueryData({
        ...options(input),
        revalidateIfStale: ensureOptions?.revalidateIfStale,
      }),
    get: (client, input) =>
      client.getQueryData<InfiniteData<unknown, unknown>>(key(input)),
    set: (client, input, value) =>
      client.setQueryData<InfiniteData<unknown, unknown>>(
        key(input),
        typeof value === "function" ? value : () => value,
      ),
    patch: (client, input, updater) =>
      patchQueryData(client, key(input), updater),
    patchAll: (client, updater) =>
      patchMatchingQueryData(client, prefix, updater),
    invalidate: (client, input) =>
      client.invalidateQueries({ queryKey: key(input), exact: true }),
    invalidateAll: (client) =>
      client.invalidateQueries({ queryKey: prefix }),
    cancel: (client, input) =>
      client.cancelQueries({ queryKey: key(input), exact: true }),
    cancelAll: (client) => client.cancelQueries({ queryKey: prefix }),
    remove: (client, input) =>
      client.removeQueries({ queryKey: key(input), exact: true }),
    removeAll: (client) => client.removeQueries({ queryKey: prefix }),
  };
}

async function invalidateLocalTargets(
  cache: RuntimeBoundCache,
  client: QueryClient,
  targets: readonly ResourceLocalInvalidation[] | undefined,
): Promise<void> {
  const operations = (targets ?? []).map((target) => {
    const operation =
      target.type === "query"
        ? cache.queries[target.operation]
        : cache.infiniteQueries[target.operation];

    if (!operation) {
      throw new Error(
        `Unknown ${target.type} invalidation target: ${target.operation}`,
      );
    }

    return operation;
  });

  await Promise.all(
    operations.map((operation) => operation.invalidateAll(client)),
  );
}

function buildMutationOperation(
  definition: RuntimeMutationDefinition,
  key: QueryKey,
  scope: unknown,
  cache: RuntimeBoundCache,
  resource: string,
  operation: string,
): BoundMutationOperation<
  unknown,
  unknown,
  unknown,
  unknown,
  RuntimeBoundCache
> {
  const built = {
    key,
    options: (lifecycle?: RuntimeLifecycle) =>
      mutationOptions({
        ...definition.defaults,
        mutationKey: key,
        mutationFn: (variables) =>
          definition.mutationFn({ scope, variables }),
        scope: definition.serialScope
          ? { id: definition.serialScope(scope) }
          : undefined,
        meta: createMeta(
          definition.defaults,
          resource,
          operation,
          "mutation",
        ),
        onMutate: lifecycle?.optimistic
          ? (variables, context) =>
              lifecycle.optimistic?.({
                scope,
                variables,
                client: context.client,
                cache,
              })
          : undefined,
        onSuccess: async (data, variables, rollback, context) => {
          await lifecycle?.onSuccess?.({
            scope,
            variables,
            data,
            rollback,
            client: context.client,
            cache,
          });
          await invalidateLocalTargets(
            cache,
            context.client,
            definition.invalidates,
          );
        },
        onError: async (error, variables, rollback, context) => {
          if (typeof rollback === "function") {
            await rollback();
          }
          await lifecycle?.onError?.({
            scope,
            variables,
            error,
            rollback,
            client: context.client,
            cache,
          });
        },
        onSettled: (data, error, variables, rollback, context) =>
          lifecycle?.onSettled?.({
            scope,
            variables,
            data,
            error,
            rollback,
            client: context.client,
            cache,
          }),
      }),
  };

  return built as unknown as BoundMutationOperation<
    unknown,
    unknown,
    unknown,
    unknown,
    RuntimeBoundCache
  >;
}

export function createResource<TScope>() {
  type EmptyDefinitions = Readonly<Record<never, never>>;

  return <
    const TQueries extends QueryDefinitions<TScope> = EmptyDefinitions,
    const TInfiniteQueries extends
      InfiniteQueryDefinitions<TScope> = EmptyDefinitions,
    const TMutations extends MutationDefinitions<TScope> = EmptyDefinitions,
  >(
    config: ResourceConfig<
      TScope,
      TQueries,
      TInfiniteQueries,
      TMutations
    >,
  ): CreatedResource<TScope, TQueries, TInfiniteQueries, TMutations> => {
    const rootKey = (scope: TScope): QueryKey => [
      ...config.namespace,
      ...config.scopeKey(scope),
      config.name,
    ];

    const bind = (
      scope: TScope,
    ): BoundResource<TScope, TQueries, TInfiniteQueries, TMutations> => {
      const key = rootKey(scope);
      const queries: Record<string, RuntimeQueryOperation> = {};
      const infiniteQueries: Record<string, RuntimeInfiniteOperation> = {};

      for (const [operation, candidate] of recordEntries(
        config.queries as Readonly<Record<string, unknown>> | undefined,
      )) {
        const definition = candidate as RuntimeQueryDefinition;
        queries[operation] = buildQueryOperation(
          definition,
          [...key, "query", operation],
          scope,
          config.name,
          operation,
        );
      }

      for (const [operation, candidate] of recordEntries(
        config.infiniteQueries as
          | Readonly<Record<string, unknown>>
          | undefined,
      )) {
        const definition = candidate as RuntimeInfiniteDefinition;
        infiniteQueries[operation] = buildInfiniteOperation(
          definition,
          [...key, "infinite", operation],
          scope,
          config.name,
          operation,
        );
      }

      const cache: RuntimeBoundCache = {
        key,
        queries,
        infiniteQueries,
        invalidate: (client) =>
          client.invalidateQueries({ queryKey: key }),
        cancel: (client) => client.cancelQueries({ queryKey: key }),
        remove: (client) => client.removeQueries({ queryKey: key }),
      };

      const mutations: Record<
        string,
        BoundMutationOperation<
          unknown,
          unknown,
          unknown,
          unknown,
          RuntimeBoundCache
        >
      > = {};

      for (const [operation, candidate] of recordEntries(
        config.mutations as Readonly<Record<string, unknown>> | undefined,
      )) {
        const definition = candidate as RuntimeMutationDefinition;
        mutations[operation] = buildMutationOperation(
          definition,
          [...key, "mutation", operation],
          scope,
          cache,
          config.name,
          operation,
        );
      }

      return {
        ...cache,
        mutations,
      } as BoundResource<
        TScope,
        TQueries,
        TInfiniteQueries,
        TMutations
      >;
    };

    return {
      name: config.name,
      rootKey,
      bind,
    };
  };
}
