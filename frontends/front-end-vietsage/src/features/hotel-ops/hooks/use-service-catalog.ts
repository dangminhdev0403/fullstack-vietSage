"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serviceCatalogResource } from "../resources/service-catalog-resource";
import type { ServiceCatalogScope } from "../repositories/service-catalog-repository";
import type { HotelServiceCategory, HotelServiceItem } from "../types/hotel-ops-contract";

function upsert<T extends { id: string }>(current: T[] | undefined, saved: T): T[] {
  return current?.some((item) => item.id === saved.id)
    ? current.map((item) => item.id === saved.id ? saved : item)
    : [saved, ...(current ?? [])];
}

export function useServiceCatalog(
  scope: ServiceCatalogScope,
  initialCategories: HotelServiceCategory[],
  initialItems: HotelServiceItem[],
) {
  const client = useQueryClient();
  const resource = serviceCatalogResource.bind(scope);
  const categories = useQuery({ ...resource.queries.categories.options(undefined), initialData: initialCategories });
  const items = useQuery({ ...resource.queries.items.options(undefined), initialData: initialItems });
  const saveCategory = useMutation(resource.mutations.saveCategory.options({
    onSuccess: ({ data, cache }) => { cache.queries.categories.set(client, undefined, (current) => upsert(current, data)); },
  }));
  const saveItem = useMutation(resource.mutations.saveItem.options({
    onSuccess: ({ data, cache }) => { cache.queries.items.set(client, undefined, (current) => upsert(current, data)); },
  }));
  return {
    categories: categories.data,
    items: items.data,
    saveCategory,
    saveItem,
    updateItems: (updater: (current: HotelServiceItem[]) => HotelServiceItem[]) =>
      resource.queries.items.set(client, undefined, (current) => updater(current ?? [])),
    refresh: () => Promise.all([
      client.fetchQuery({ ...resource.queries.categories.options(undefined), staleTime: 0 }),
      client.fetchQuery({ ...resource.queries.items.options(undefined), staleTime: 0 }),
    ]),
  };
}
