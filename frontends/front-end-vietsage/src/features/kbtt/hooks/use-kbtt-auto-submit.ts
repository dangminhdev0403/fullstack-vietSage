"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import type { Query } from "@tanstack/react-query";
import type {
  KbttAutoSubmitConfig,
  KbttAutoSubmitState,
} from "../types/kbtt-contract";

export function useKbttAutoSubmit(hotelId: string) {
  const queryClient = useQueryClient();
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const autoSubmitOptions = useMemo(
    () => ({
      ...resource.queries.autoSubmitConfig.options(undefined),
      enabled: Boolean(hotelId),
      refetchInterval: (query: Query<KbttAutoSubmitState>) => {
        const data = query.state.data;
        const isRunning =
          Boolean(data?.pendingSchedule) ||
          Boolean(data?.activeRun) ||
          (Array.isArray(data?.recentRuns) &&
            data.recentRuns.some((run) => run.status === "RUNNING"));
        return isRunning ? 2000 : false;
      },
      refetchIntervalInBackground: true,
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }),
    [resource, hotelId],
  );
  const autoSubmit = useQuery(autoSubmitOptions);

  const hasActiveRun = Boolean(
    autoSubmit.data?.pendingSchedule ||
      autoSubmit.data?.activeRun ||
      (Array.isArray(autoSubmit.data?.recentRuns) &&
        autoSubmit.data.recentRuns.some((r) => r.status === "RUNNING")),
  );
  const prevActiveRunRef = useRef(false);

  useEffect(() => {
    if (!hasActiveRun) return;
    const interval = window.setInterval(() => {
      void autoSubmit.refetch();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [hasActiveRun, autoSubmit]);

  useEffect(() => {
    if (prevActiveRunRef.current && !hasActiveRun) {
      void resource.queries.declarations.invalidateAll(queryClient);
      void resource.queries.declarationDetail.invalidateAll(queryClient);
      void resource.queries.autoSubmitConfig.invalidateAll(queryClient);
    }
    prevActiveRunRef.current = hasActiveRun;
  }, [hasActiveRun, queryClient, resource]);

  const updateMutationOptions = useMemo(
    () => resource.mutations.updateAutoSubmitConfig.options(),
    [resource],
  );
  const testMutationOptions = useMemo(
    () => resource.mutations.testAutoSubmit.options(),
    [resource],
  );
  const telegramTestOptions = useMemo(
    () => resource.mutations.testTelegram.options(),
    [resource],
  );
  const scheduleOptions = useMemo(
    () => resource.mutations.scheduleAutoSubmit.options(),
    [resource],
  );
  const cancelScheduleOptions = useMemo(
    () => resource.mutations.cancelScheduledAutoSubmit.options(),
    [resource],
  );

  const updateMutation = useMutation(updateMutationOptions);
  const testMutation = useMutation(testMutationOptions);
  const telegramTestMutation = useMutation(telegramTestOptions);
  const scheduleMutation = useMutation(scheduleOptions);
  const cancelScheduleMutation = useMutation(cancelScheduleOptions);

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
    testingTelegram: telegramTestMutation.isPending,
    scheduling: scheduleMutation.isPending,
    cancellingSchedule: cancelScheduleMutation.isPending,
    updateConfig,
    testDryRun,
    testTelegram: () => telegramTestMutation.mutateAsync(undefined),
    scheduleAutoSubmit: (mode: "dry-run" | "live") => scheduleMutation.mutateAsync({ mode }),
    cancelScheduledAutoSubmit: () => cancelScheduleMutation.mutateAsync(undefined),
  };
}
