import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  ResourceDataUpdater,
  ResourceMatchingDataUpdater,
  ResourceRollback,
} from "./types";

type RollbackFunction = Exclude<ResourceRollback, void>;

export function combineRollbacks(
  ...rollbacks: readonly ResourceRollback[]
): RollbackFunction {
  return async () => {
    for (const rollback of [...rollbacks].reverse()) {
      if (typeof rollback === "function") {
        await rollback();
      }
    }
  };
}

export function patchQueryData<TData>(
  client: QueryClient,
  queryKey: QueryKey,
  updater: ResourceDataUpdater<TData>,
): RollbackFunction {
  const previousState = client.getQueryState<TData>(queryKey);
  const previous = client.getQueryData<TData>(queryKey);
  const applied = client.setQueryData<TData>(queryKey, updater);
  const appliedState = client.getQueryState<TData>(queryKey);

  return async () => {
    const current = client.getQueryData<TData>(queryKey);
    const currentState = client.getQueryState<TData>(queryKey);
    const changedAfterPatch =
      current !== applied ||
      currentState?.dataUpdatedAt !== appliedState?.dataUpdatedAt;

    if (changedAfterPatch) {
      await client.invalidateQueries({ queryKey, exact: true });
      return;
    }

    if (!previousState) {
      client.removeQueries({ queryKey, exact: true });
      return;
    }

    client.setQueryData<TData>(queryKey, previous, {
      updatedAt: previousState.dataUpdatedAt,
    });
  };
}

export function patchMatchingQueryData<TData>(
  client: QueryClient,
  queryKey: QueryKey,
  updater: ResourceMatchingDataUpdater<TData>,
): RollbackFunction {
  const rollbacks = client
    .getQueriesData<TData>({ queryKey })
    .flatMap(([matchedKey, current]) => {
      if (current === undefined) return [];
      return [
        patchQueryData<TData>(client, matchedKey, () =>
          updater(current, matchedKey),
        ),
      ];
    });

  return combineRollbacks(...rollbacks);
}
