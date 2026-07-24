import type {
  ResourceInfiniteQueryDefinition,
  ResourceLocalInvalidation,
  ResourceMutationDefinition,
  ResourceQueryDefinition,
} from "./types";

export function defineQuery<
  TScope,
  TInput,
  TData,
  TError = Error,
>(
  definition: Omit<
    ResourceQueryDefinition<TScope, TInput, TData, TError>,
    "kind"
  >,
): ResourceQueryDefinition<TScope, TInput, TData, TError> {
  return {
    ...definition,
    kind: "query",
  };
}

export function defineInfiniteQuery<
  TScope,
  TInput,
  TPage,
  TPageParam,
  TError = Error,
>(
  definition: Omit<
    ResourceInfiniteQueryDefinition<
      TScope,
      TInput,
      TPage,
      TPageParam,
      TError
    >,
    "kind"
  >,
): ResourceInfiniteQueryDefinition<
  TScope,
  TInput,
  TPage,
  TPageParam,
  TError
> {
  return {
    ...definition,
    kind: "infinite",
  };
}

export function defineMutation<
  TScope,
  TVariables,
  TData,
  TError = Error,
  const TInvalidations extends
    readonly ResourceLocalInvalidation[] = readonly [],
>(
  definition: Omit<
    ResourceMutationDefinition<
      TScope,
      TVariables,
      TData,
      TError,
      TInvalidations
    >,
    "kind"
  >,
): ResourceMutationDefinition<
  TScope,
  TVariables,
  TData,
  TError,
  TInvalidations
> {
  return {
    ...definition,
    kind: "mutation",
  };
}
