"use client";

import { useQuery } from "@tanstack/react-query";

import {
  OWNER_HOTELS_LIST_INPUT,
  ownerHotelsResource,
} from "@/features/owner/resources/owner-hotels-resource";

export function ownerHotelsQueryKey() {
  return ownerHotelsResource
    .bind(undefined)
    .queries.list.key(OWNER_HOTELS_LIST_INPUT);
}

export function useOwnerHotelsQuery() {
  const ownerHotels = ownerHotelsResource.bind(undefined);
  return useQuery(ownerHotels.queries.list.options(OWNER_HOTELS_LIST_INPUT));
}
