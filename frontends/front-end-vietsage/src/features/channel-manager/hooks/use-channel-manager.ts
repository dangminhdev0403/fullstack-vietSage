"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { channelManagerResource } from "../api/channel-manager.resource";
import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  RestrictionUpdateItem,
} from "../types/channel-manager.types";

export interface UseInventoryGridOptions {
  hotelId: string | null | undefined;
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
  roleScope?: "owner" | "admin";
}

export function useInventoryGrid(options: UseInventoryGridOptions) {
  const {
    hotelId,
    dateFrom,
    dateTo,
    enabled = true,
    roleScope = "owner",
  } = options;

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId: hotelId ?? "", roleScope }),
    [hotelId, roleScope],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.inventoryGrid.options({ dateFrom, dateTo }),
    [boundResource, dateFrom, dateTo],
  );

  const query = useQuery({
    ...queryOptions,
    enabled: Boolean(enabled && hotelId && dateFrom && dateTo),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return {
    gridData: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateRestrictions(options: {
  hotelId: string;
  roleScope?: "owner" | "admin";
}) {
  const { hotelId, roleScope = "owner" } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope }),
    [hotelId, roleScope],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.updateRestrictions.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    updateRestrictions: (items: RestrictionUpdateItem[]) =>
      mutation.mutateAsync({ items }),
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useUpdateAvailability(options: {
  hotelId: string;
  roleScope?: "owner" | "admin";
}) {
  const { hotelId, roleScope = "owner" } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope }),
    [hotelId, roleScope],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.updateAvailability.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    updateAvailability: (items: AvailabilityUpdateItem[]) =>
      mutation.mutateAsync({ items }),
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useBulkUpdateRestrictions(options: {
  hotelId: string;
  roleScope?: "owner" | "admin";
}) {
  const { hotelId, roleScope = "owner" } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope }),
    [hotelId, roleScope],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.bulkUpdate.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    bulkUpdate: (payload: BulkUpdatePayload) => mutation.mutateAsync(payload),
    isBulkUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useChannex(
  hotelId: string,
  roleScope: "owner" | "admin" = "owner",
  options: {
    loadMappings?: boolean;
    loadConfig?: boolean;
    loadSimulatedBookings?: boolean;
    loadChannelCatalog?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope }),
    [hotelId, roleScope],
  );
  const mappings = useQuery({
    ...boundResource.queries.channexMappings.options(undefined as never),
    enabled: Boolean(hotelId && (options.loadMappings ?? true)),
  });
  const syncContent = useMutation({
    ...boundResource.mutations.syncChannexContent.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });
  const pushAri = useMutation(boundResource.mutations.pushChannexAri.options());
  const pollFeed = useMutation({
    ...boundResource.mutations.pollChannexFeed.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });
  const doctor = useMutation(
    boundResource.mutations.runChannexDoctor.options(),
  );
  const channelSession = useMutation(
    boundResource.mutations.createChannexChannelSession.options(),
  );
  const prepareChannel = useMutation(
    boundResource.mutations.prepareChannexChannel.options(),
  );
  const createChannel = useMutation({
    ...boundResource.mutations.createChannexChannel.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });
  const activateChannel = useMutation({
    ...boundResource.mutations.activateChannexChannel.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });
  const channelCatalog = useQuery({
    ...boundResource.queries.channexChannelCatalog.options(undefined as never),
    enabled: Boolean(hotelId && (options.loadChannelCatalog ?? false)),
  });
  const cancelBooking = useMutation({
    ...boundResource.mutations.cancelSimulatedBooking.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });
  const simulatedBookings = useQuery({
    ...boundResource.queries.simulatedBookings.options(undefined as never),
    enabled: Boolean(hotelId && (options.loadSimulatedBookings ?? true)),
  });
  const config = useQuery({
    ...boundResource.queries.channexConfig.options(undefined as never),
    enabled: Boolean(hotelId && (options.loadConfig ?? true)),
  });
  const configureProperty = useMutation({
    ...boundResource.mutations.configureChannexProperty.options(),
    onSuccess: async () => boundResource.invalidate(queryClient),
  });

  return {
    mappings: mappings.data ?? [],
    isLoadingMappings: mappings.isLoading,
    refreshMappings: mappings.refetch,
    config: config.data,
    isLoadingConfig: config.isLoading,
    refreshConfig: config.refetch,
    simulatedBookings: simulatedBookings.data ?? [],
    isLoadingSimulatedBookings: simulatedBookings.isLoading,
    refreshSimulatedBookings: simulatedBookings.refetch,
    configureProperty,
    syncContent,
    pushAri,
    pollFeed,
    doctor,
    channelSession,
    prepareChannel,
    createChannel,
    activateChannel,
    channelCatalog: channelCatalog.data,
    isLoadingChannelCatalog: channelCatalog.isLoading,
    isErrorChannelCatalog: channelCatalog.isError,
    channelCatalogError: channelCatalog.error,
    refreshChannelCatalog: channelCatalog.refetch,
    cancelBooking,
  };
}
