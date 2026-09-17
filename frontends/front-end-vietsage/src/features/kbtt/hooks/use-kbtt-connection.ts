"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import type { KbttCredentials } from "../types/kbtt-contract";

export function useKbttConnection(hotelId: string) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const connectionOptions = useMemo(
    () => ({
      ...resource.queries.connection.options(undefined),
      enabled: Boolean(hotelId),
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 15_000,
    }),
    [resource, hotelId],
  );
  const connection = useQuery(connectionOptions);

  const connectMutationOptions = useMemo(() => resource.mutations.connect.options(), [resource]);
  const checkMutationOptions = useMemo(() => resource.mutations.check.options(), [resource]);
  const disconnectMutationOptions = useMemo(() => resource.mutations.disconnect.options(), [resource]);

  const connectMutation = useMutation(connectMutationOptions);
  const checkMutation = useMutation(checkMutationOptions);
  const disconnectMutation = useMutation(disconnectMutationOptions);

  const connect = useCallback(
    async (credentials: KbttCredentials) => {
      try {
        return await connectMutation.mutateAsync(credentials);
      } finally {
        connectMutation.reset();
      }
    },
    [connectMutation],
  );

  const check = useCallback(() => checkMutation.mutateAsync(), [checkMutation]);
  const disconnect = useCallback(() => disconnectMutation.mutateAsync(), [disconnectMutation]);

  return {
    connection,
    busy: connectMutation.isPending || checkMutation.isPending || disconnectMutation.isPending,
    connect,
    check,
    disconnect,
  };
}
