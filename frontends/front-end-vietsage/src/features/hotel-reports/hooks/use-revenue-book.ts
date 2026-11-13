"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { revenueBookResource } from "../resources/revenue-book-resource";
import type {
  CollectRevenueInput,
  CreateRevenueEntryInput,
  RevenueBookQuery,
  UpdateRevenueEntryInput,
  VoidRevenueEntryInput,
} from "../types/revenue-book-contract";

export function useRevenueBook(hotelId: string, input: RevenueBookQuery) {
  const resource = useMemo(
    () => revenueBookResource.bind({ hotelId }),
    [hotelId],
  );
  const query = useQuery({
    ...resource.queries.list.options(input),
    refetchOnWindowFocus: true,
  });
  const create = useMutation(resource.mutations.create.options());
  const update = useMutation(resource.mutations.update.options());
  const collect = useMutation(resource.mutations.collect.options());
  const cancel = useMutation(resource.mutations.void.options());
  return {
    ...query,
    busy:
      create.isPending ||
      update.isPending ||
      collect.isPending ||
      cancel.isPending,
    async createEntry(body: CreateRevenueEntryInput) {
      await create.mutateAsync(body);
    },
    async updateEntry(id: string, body: UpdateRevenueEntryInput) {
      await update.mutateAsync({ id, body });
    },
    async collectEntry(id: string, body: CollectRevenueInput) {
      await collect.mutateAsync({ id, body });
    },
    async voidEntry(id: string, body: VoidRevenueEntryInput) {
      await cancel.mutateAsync({ id, body });
    },
  };
}
