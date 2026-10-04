"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminChannelManagerResource } from "../api/admin-channel-manager.resource";
import type { AdminChannelOverviewQuery } from "../types/admin-channel-manager.types";

export interface UseAdminChannelOverviewOptions {
  query?: AdminChannelOverviewQuery;
  enabled?: boolean;
}

export function useAdminChannelManagerOverview(
  options: UseAdminChannelOverviewOptions = {},
) {
  const { query, enabled = true } = options;

  const boundResource = useMemo(
    () => adminChannelManagerResource.bind({ roleScope: "admin" }),
    [],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.overview.options(query),
    [boundResource, query],
  );

  const q = useQuery({
    ...queryOptions,
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return {
    overview: q.data ?? null,
    summary: q.data?.summary ?? null,
    items: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    page: q.data?.page ?? 1,
    limit: q.data?.limit ?? 25,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
