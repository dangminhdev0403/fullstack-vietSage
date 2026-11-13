"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { hotelExpensesResource } from "../resources/hotel-expenses-resource";
import type {
  HotelExpensesQuery,
} from "../types/hotel-expenses-contract";

export function useHotelExpenses(hotelId: string, queryInput: HotelExpensesQuery) {
  const resource = useMemo(() => hotelExpensesResource.bind({ hotelId }), [hotelId]);
  const query = useQuery({
    ...resource.queries.list.options(queryInput),
    refetchOnWindowFocus: true,
  });

  const create = useMutation(
    resource.mutations.create.options({
      onSuccess: async ({ client, cache }) => {
        await cache.invalidate(client);
      },
    }),
  );

  const update = useMutation(
    resource.mutations.update.options({
      onSuccess: async ({ client, cache }) => {
        await cache.invalidate(client);
      },
    }),
  );

  const pay = useMutation(
    resource.mutations.pay.options({
      onSuccess: async ({ client, cache }) => {
        await cache.invalidate(client);
      },
    }),
  );

  const voidExpense = useMutation(
    resource.mutations.void.options({
      onSuccess: async ({ client, cache }) => {
        await cache.invalidate(client);
      },
    }),
  );

  return { query, create, update, pay, voidExpense };
}
