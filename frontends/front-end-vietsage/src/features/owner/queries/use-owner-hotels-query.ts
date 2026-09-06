"use client";

import { useQuery } from "@tanstack/react-query";

import type { HotelsPage } from "@/features/admin/types/admin-contract";
import {
  OWNER_HOTELS_LIST_INPUT,
  ownerHotelsResource,
} from "@/features/owner/resources/owner-hotels-resource";

export function ownerHotelsQueryKey() {
  return ownerHotelsResource
    .bind(undefined)
    .queries.list.key(OWNER_HOTELS_LIST_INPUT);
}

export function useOwnerHotelsQuery(options?: { initialData?: HotelsPage }) {
  const ownerHotels = ownerHotelsResource.bind(undefined);
  return useQuery({
    ...ownerHotels.queries.list.options(OWNER_HOTELS_LIST_INPUT),
    ...(options?.initialData ? { initialData: options.initialData } : {}),
  });
}
