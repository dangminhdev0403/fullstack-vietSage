"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { hotelFeaturesResource } from "@/features/admin/resources/hotel-features-resource";
import type { UpdateHotelFeatureStatusPayload } from "@/features/admin/types/admin-contract";

export type UseHotelFeaturesOptions = {
  hotelId: string | null | undefined;
  enabled?: boolean;
};

export function useHotelFeatures(options: UseHotelFeaturesOptions) {
  const { hotelId, enabled = true } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => hotelFeaturesResource.bind({ hotelId: hotelId ?? "" }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.list.options(undefined as never),
    [boundResource],
  );

  const query = useQuery({
    ...queryOptions,
    enabled: Boolean(enabled && hotelId),
    staleTime: 10_000,
  });

  const mutationOptions = useMemo(
    () => boundResource.mutations.updateStatus.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onError: () => {
      // Khi mutation fail, tự động refetch / rollback về trạng thái server
      void queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
    },
  });

  return {
    features: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateStatus: (
      featureKey: string,
      status: UpdateHotelFeatureStatusPayload["status"],
    ) => mutation.mutateAsync({ featureKey, status }),
    isUpdating: mutation.isPending,
    updatingVariables: mutation.variables,
  };
}
