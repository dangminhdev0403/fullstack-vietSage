"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";

export function useKbttAutoSubmitEnabled(hotelId: string) {
  const queryClient = useQueryClient();
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const enabled = useQuery({
    ...resource.queries.autoSubmitEnabled.options(undefined),
    enabled: Boolean(hotelId),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const mutation = useMutation(resource.mutations.updateAutoSubmitEnabled.options());

  return {
    enabled,
    updating: mutation.isPending,
    async setEnabled(autoSubmitEnabled: boolean) {
      const state = await mutation.mutateAsync({ autoSubmitEnabled });
      resource.queries.autoSubmitEnabled.set(queryClient, undefined, state);
      return state;
    },
  };
}
