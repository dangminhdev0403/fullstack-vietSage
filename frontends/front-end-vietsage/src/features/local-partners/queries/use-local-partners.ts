"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { localPartnersResource } from "../resources/local-partners-resource";
export function useLocalPartners(hotelId: string) {
  const resource = localPartnersResource.bind({ hotelId });
  return {
    list: useQuery(resource.queries.list.options(undefined as never)),
    categories: useQuery(resource.queries.categories.options(undefined as never)),
    create: useMutation(resource.mutations.create.options()),
    update: useMutation(resource.mutations.update.options()),
    status: useMutation(resource.mutations.status.options()),
  };
}
