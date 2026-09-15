"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import type { KbttAutoSubmitConfig } from "../types/kbtt-contract";

export function useKbttAutoSubmit(hotelId: string) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const autoSubmitOptions = useMemo(
    () => ({
      ...resource.queries.autoSubmitConfig.options(undefined),
      enabled: Boolean(hotelId),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
    [resource, hotelId],
  );
  const autoSubmit = useQuery(autoSubmitOptions);

  const updateMutationOptions = useMemo(
    () => resource.mutations.updateAutoSubmitConfig.options(),
    [resource],
  );
  const testMutationOptions = useMemo(
    () => resource.mutations.testAutoSubmit.options(),
    [resource],
  );

  const updateMutation = useMutation(updateMutationOptions);
  const testMutation = useMutation(testMutationOptions);

  const updateConfig = useCallback(
    async (config: KbttAutoSubmitConfig) => {
      return await updateMutation.mutateAsync(config);
    },
    [updateMutation],
  );

  const testDryRun = useCallback(
    async (dryRun = true) => {
      return await testMutation.mutateAsync({ dryRun });
    },
    [testMutation],
  );

  return {
    autoSubmit,
    updating: updateMutation.isPending,
    testing: testMutation.isPending,
    updateConfig,
    testDryRun,
  };
}
