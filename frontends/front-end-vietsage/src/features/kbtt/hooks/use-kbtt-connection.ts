"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import type { KbttCredentials } from "../types/kbtt-contract";

export function useKbttConnection(hotelId: string) {
  const resource = kbttResource.bind({ hotelId });
  const connection = useQuery({
    ...resource.queries.connection.options(undefined),
    enabled: Boolean(hotelId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const connect = useMutation(resource.mutations.connect.options());
  const check = useMutation(resource.mutations.check.options());
  const disconnect = useMutation(resource.mutations.disconnect.options());

  return {
    connection,
    busy: connect.isPending || check.isPending || disconnect.isPending,
    async connect(credentials: KbttCredentials) {
      try {
        return await connect.mutateAsync(credentials);
      } finally {
        connect.reset();
      }
    },
    check: () => check.mutateAsync(),
    disconnect: () => disconnect.mutateAsync(),
  };
}
