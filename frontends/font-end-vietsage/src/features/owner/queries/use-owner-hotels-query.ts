"use client";

import { useQuery } from "@tanstack/react-query";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelsPage } from "@/features/admin/types/admin-contract";

const OWNER_HOTELS_QUERY = {
  page: 1,
  limit: 100,
} as const;

export function ownerHotelsQueryKey() {
  return ["hotels", "owner", OWNER_HOTELS_QUERY] as const;
}

async function fetchOwnerHotels(signal?: AbortSignal): Promise<HotelsPage> {
  const params = new URLSearchParams({
    page: String(OWNER_HOTELS_QUERY.page),
    limit: String(OWNER_HOTELS_QUERY.limit),
  });

  const payload = await requestInternalApiEnvelope<HotelsPage>(`/api/owner/hotels?${params.toString()}`, {
    method: "GET",
    signal,
  });

  return payload.data;
}

export function useOwnerHotelsQuery() {
  return useQuery({
    queryKey: ownerHotelsQueryKey(),
    queryFn: ({ signal }) => fetchOwnerHotels(signal),
  });
}
