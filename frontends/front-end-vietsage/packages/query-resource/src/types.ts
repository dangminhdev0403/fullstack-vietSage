import type {
  InfiniteData,
  QueryClient,
  QueryFunction,
  QueryKey,
  UseInfiniteQueryOptions,
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

export type ResourceQueryContext<TScope, TInput> = {
  scope: TScope;
  input: TInput;
  signal: AbortSignal;
};

export type ResourceInfiniteQueryContext<TScope, TInput, TPageParam> =
  ResourceQueryContext<TScope, TInput> & {
    pageParam: TPageParam;
  };

export type ResourceMutationContext<TScope, TVariables> = {
  scope: TScope;
  variables: TVariables;
};

export type ResourceQueryDefaults<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, QueryKey>,
  | "enabled"
  | "initialData"
  | "queryFn"
  | "queryKey"
  | "select"
  | "subscribed"
>;

export type ResourceInfiniteQueryDefaults<
  TPage,
  TError,
  TPageParam,
> = Omit<
  UseInfiniteQueryOptions<
    TPage,
    TError,
    InfiniteData<TPage, TPageParam>,
    QueryKey,
    TPageParam
  >,
  | "getNextPageParam"
  | "getPreviousPageParam"
  | "enabled"
  | "initialData"
  | "initialPageParam"
  | "queryFn"
  | "queryKey"
  | "select"
  | "subscribed"
>;

export type ResourceMutationDefaults<TData, TError, TVariables> = Omit<
  UseMutationOptions<TData, TError, TVariables, ResourceRollback>,
  | "mutationFn"
  | "mutationKey"
  | "onError"
  | "onMutate"
  | "onSettled"
  | "onSuccess"
  | "scope"
>;

export type ResourceLocalInvalidation = Readonly<
  | {
      type: "query";
      operation: string;
    }
  | {
      type: "infinite";
      operation: string;
    }
>;

export type ResourceQueryDefinition<
  TScope,
  TInput,
  TData,
  TError = Error,
> = {
  readonly kind: "query";
  readonly inputKey: (input: TInput) => QueryKey;
  readonly queryFn: (
    context: ResourceQueryContext<TScope, TInput>,
  ) => Promise<TData>;
  readonly defaults?: ResourceQueryDefaults<TData, TError>;
};

export type ResourceInfiniteQueryDefinition<
  TScope,
  TInput,
  TPage,
  TPageParam,
  TError = Error,
> = {
  readonly kind: "infinite";
  readonly inputKey: (input: TInput) => QueryKey;
  readonly queryFn: (
    context: ResourceInfiniteQueryContext<TScope, TInput, TPageParam>,
  ) => Promise<TPage>;
  readonly initialPageParam: TPageParam;
  readonly getNextPageParam: (
    lastPage: TPage,
    allPages: TPage[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | null | undefined;
  readonly getPreviousPageParam?: (
    firstPage: TPage,
    allPages: TPage[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | null | undefined;
  readonly defaults?: ResourceInfiniteQueryDefaults<
    TPage,
    TError,
    TPageParam
  >;
};

export type ResourceMutationDefinition<
  TScope,
  TVariables,
  TData,
  TError = Error,
  TInvalidations extends
    readonly ResourceLocalInvalidation[] = readonly ResourceLocalInvalidation[],
> = {
  readonly kind: "mutation";
  readonly mutationFn: (
    context: ResourceMutationContext<TScope, TVariables>,
  ) => Promise<TData>;
  readonly invalidates?: TInvalidations;
  readonly serialScope?: (scope: TScope) => string;
  readonly defaults?: ResourceMutationDefaults<TData, TError, TVariables>;
};

export type ResourceQueryDefinitionTypes<TDefinition> =
  TDefinition extends ResourceQueryDefinition<
    infer TScope,
    infer TInput,
    infer TData,
    infer TError
  >
    ? {
        scope: TScope;
        input: TInput;
        data: TData;
        error: TError;
      }
    : never;

export type ResourceInfiniteQueryDefinitionTypes<TDefinition> =
  TDefinition extends ResourceInfiniteQueryDefinition<
    infer TScope,
    infer TInput,
    infer TPage,
    infer TPageParam,
    infer TError
  >
    ? {
        scope: TScope;
        input: TInput;
        page: TPage;
        pageParam: TPageParam;
        error: TError;
      }
    : never;

export type ResourceMutationDefinitionTypes<TDefinition> =
  TDefinition extends ResourceMutationDefinition<
    infer TScope,
    infer TVariables,
    infer TData,
    infer TError,
    infer TInvalidations
  >
    ? {
        scope: TScope;
        variables: TVariables;
        data: TData;
        error: TError;
        invalidations: TInvalidations;
      }
    : never;

export type ResourceQueryDefinitionShape<TScope> = {
  readonly kind: "query";
  readonly inputKey: (input: never) => QueryKey;
  readonly queryFn: (
    context: ResourceQueryContext<TScope, never>,
  ) => Promise<unknown>;
  readonly defaults?: unknown;
};

export type ResourceInfiniteQueryDefinitionShape<TScope> = {
  readonly kind: "infinite";
  readonly inputKey: (input: never) => QueryKey;
  readonly queryFn: (
    context: ResourceInfiniteQueryContext<TScope, never, never>,
  ) => Promise<unknown>;
  readonly initialPageParam: unknown;
  readonly getNextPageParam: (...args: never[]) => unknown;
  readonly getPreviousPageParam?: (...args: never[]) => unknown;
  readonly defaults?: unknown;
};

export type ResourceMutationDefinitionShape<TScope> = {
  readonly kind: "mutation";
  readonly mutationFn: (
    context: ResourceMutationContext<TScope, never>,
  ) => Promise<unknown>;
  readonly invalidates?: readonly ResourceLocalInvalidation[];
  readonly serialScope?: (scope: TScope) => string;
  readonly defaults?: unknown;
};

export type ResourceRollback =
  | void
  | (() => void | Promise<void>);

export type ResourceBuiltQueryOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, QueryKey>,
  "queryFn" | "queryKey"
> & {
  queryKey: QueryKey;
  queryFn: QueryFunction<TData, QueryKey>;
};

export type ResourceBuiltInfiniteQueryOptions<
  TPage,
  TError,
  TPageParam,
> = UseInfiniteQueryOptions<
  TPage,
  TError,
  InfiniteData<TPage, TPageParam>,
  QueryKey,
  TPageParam
> & {
  queryKey: QueryKey;
};

export type ResourceDataUpdater<TData> = (
  current: TData | undefined,
) => TData | undefined;

export type ResourceMatchingDataUpdater<TData> = (
  current: TData,
  queryKey: QueryKey,
) => TData;

export type BoundQueryOperation<TInput, TData, TError> = {
  readonly prefix: QueryKey;
  key(input: TInput): QueryKey;
  options(input: TInput): ResourceBuiltQueryOptions<TData, TError>;
  prefetch(client: QueryClient, input: TInput): Promise<void>;
  fetch(client: QueryClient, input: TInput): Promise<TData>;
  ensure(
    client: QueryClient,
    input: TInput,
    options?: { revalidateIfStale?: boolean },
  ): Promise<TData>;
  get(client: QueryClient, input: TInput): TData | undefined;
  set(
    client: QueryClient,
    input: TInput,
    value: TData | ResourceDataUpdater<TData>,
  ): TData | undefined;
  patch(
    client: QueryClient,
    input: TInput,
    updater: ResourceDataUpdater<TData>,
  ): Exclude<ResourceRollback, void>;
  patchAll(
    client: QueryClient,
    updater: ResourceMatchingDataUpdater<TData>,
  ): Exclude<ResourceRollback, void>;
  invalidate(client: QueryClient, input: TInput): Promise<void>;
  invalidateAll(client: QueryClient): Promise<void>;
  cancel(client: QueryClient, input: TInput): Promise<void>;
  cancelAll(client: QueryClient): Promise<void>;
  remove(client: QueryClient, input: TInput): void;
  removeAll(client: QueryClient): void;
};

export type BoundInfiniteQueryOperation<
  TInput,
  TPage,
  TError,
  TPageParam,
> = {
  readonly prefix: QueryKey;
  key(input: TInput): QueryKey;
  options(
    input: TInput,
  ): ResourceBuiltInfiniteQueryOptions<TPage, TError, TPageParam>;
  prefetch(client: QueryClient, input: TInput): Promise<void>;
  fetch(
    client: QueryClient,
    input: TInput,
  ): Promise<InfiniteData<TPage, TPageParam>>;
  ensure(
    client: QueryClient,
    input: TInput,
    options?: { revalidateIfStale?: boolean },
  ): Promise<InfiniteData<TPage, TPageParam>>;
  get(
    client: QueryClient,
    input: TInput,
  ): InfiniteData<TPage, TPageParam> | undefined;
  set(
    client: QueryClient,
    input: TInput,
    value:
      | InfiniteData<TPage, TPageParam>
      | ResourceDataUpdater<InfiniteData<TPage, TPageParam>>,
  ): InfiniteData<TPage, TPageParam> | undefined;
  patch(
    client: QueryClient,
    input: TInput,
    updater: ResourceDataUpdater<InfiniteData<TPage, TPageParam>>,
  ): Exclude<ResourceRollback, void>;
  patchAll(
    client: QueryClient,
    updater: ResourceMatchingDataUpdater<
      InfiniteData<TPage, TPageParam>
    >,
  ): Exclude<ResourceRollback, void>;
  invalidate(client: QueryClient, input: TInput): Promise<void>;
  invalidateAll(client: QueryClient): Promise<void>;
  cancel(client: QueryClient, input: TInput): Promise<void>;
  cancelAll(client: QueryClient): Promise<void>;
  remove(client: QueryClient, input: TInput): void;
  removeAll(client: QueryClient): void;
};

export type ResourceMutationLifecycleContext<
  TScope,
  TVariables,
  TCache,
> = {
  scope: TScope;
  variables: TVariables;
  client: QueryClient;
  cache: TCache;
};

export type ResourceMutationLifecycle<
  TScope,
  TVariables,
  TData,
  TError,
  TCache,
  TRollback extends ResourceRollback,
> = {
  optimistic?: (
    context: ResourceMutationLifecycleContext<TScope, TVariables, TCache>,
  ) => TRollback | Promise<TRollback>;
  onSuccess?: (
    context: ResourceMutationLifecycleContext<
      TScope,
      TVariables,
      TCache
    > & {
      data: TData;
      rollback: TRollback | undefined;
    },
  ) => void | Promise<void>;
  onError?: (
    context: ResourceMutationLifecycleContext<
      TScope,
      TVariables,
      TCache
    > & {
      error: TError;
      rollback: TRollback | undefined;
    },
  ) => void | Promise<void>;
  onSettled?: (
    context: ResourceMutationLifecycleContext<
      TScope,
      TVariables,
      TCache
    > & {
      data: TData | undefined;
      error: TError | null;
      rollback: TRollback | undefined;
    },
  ) => void | Promise<void>;
};

export type BoundMutationOperation<
  TScope,
  TVariables,
  TData,
  TError,
  TCache,
> = {
  readonly key: QueryKey;
  options<TRollback extends ResourceRollback = void>(
    lifecycle?: ResourceMutationLifecycle<
      TScope,
      TVariables,
      TData,
      TError,
      TCache,
      TRollback
    >,
  ): UseMutationOptions<TData, TError, TVariables, TRollback>;
};
