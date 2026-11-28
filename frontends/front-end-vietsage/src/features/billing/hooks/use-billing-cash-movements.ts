"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type { CashMovementsResponse } from "@/features/billing/types/billing-contract";

export interface UseBillingCashMovementsOptions {
  hotelId: string;
  query?: {
    from?: string;
    to?: string;
    paymentMethod?: string;
    destinationAccount?: string;
    movementType?: string;
    q?: string;
  };
  enabled?: boolean;
}

export function useBillingCashMovements({
  hotelId,
  query,
  enabled = true,
}: UseBillingCashMovementsOptions) {
  const boundResource = useMemo(
    () => staffRoomsResource.bind({ hotelId }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.cashMovements.options(query),
    [boundResource, query],
  );

  const q = useQuery<CashMovementsResponse>({
    ...queryOptions,
    enabled: Boolean(hotelId) && enabled,
    staleTime: 10_000,
  });

  return {
    data: q.data ?? null,
    items: q.data?.items ?? [],
    summary: q.data?.summary ?? null,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
