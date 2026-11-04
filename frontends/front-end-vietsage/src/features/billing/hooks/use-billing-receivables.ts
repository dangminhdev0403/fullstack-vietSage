"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  ListReceivablesQuery,
  ReceivableItem,
} from "@/features/hotel-ops/repositories/staff-rooms-repository";

export interface UseBillingReceivablesOptions {
  hotelId: string;
  query?: ListReceivablesQuery;
  enabled?: boolean;
}

export function useBillingReceivables({
  hotelId,
  query,
  enabled = true,
}: UseBillingReceivablesOptions) {
  const boundResource = useMemo(
    () => staffRoomsResource.bind({ hotelId }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.receivables.options(query),
    [boundResource, query],
  );

  const q = useQuery({
    ...queryOptions,
    enabled: Boolean(hotelId) && enabled,
    staleTime: 10_000,
  });

  const items: ReceivableItem[] =
    (q.data as { items?: ReceivableItem[] } | undefined)?.items ?? [];

  return {
    receivablesPage: q.data ?? null,
    receivables: items,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
