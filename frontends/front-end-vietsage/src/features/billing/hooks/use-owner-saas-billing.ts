"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ownerSaasBillingResource } from "../resources/owner-saas-billing-resource";
import type { OwnerAnalyticsQuery } from "../repositories/owner-saas-billing-repository";

export interface UseOwnerSaasBillingOptions {
  hotelId: string;
  query?: OwnerAnalyticsQuery;
  enabled?: boolean;
}

export function useOwnerSaasBilling({
  hotelId,
  query,
  enabled = true,
}: UseOwnerSaasBillingOptions) {
  const boundResource = useMemo(
    () => ownerSaasBillingResource.bind({ hotelId }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.analytics.options(query),
    [boundResource, query],
  );

  const q = useQuery({
    ...queryOptions,
    enabled: Boolean(hotelId) && enabled,
    staleTime: 10_000,
  });

  return {
    data: q.data ?? null,
    loading: q.isPending,
    isPending: q.isPending,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.isError
      ? "Không tải được dữ liệu đối soát phí VietSage SaaS. Vui lòng thử lại."
      : null,
    refetch: q.refetch,
  };
}
