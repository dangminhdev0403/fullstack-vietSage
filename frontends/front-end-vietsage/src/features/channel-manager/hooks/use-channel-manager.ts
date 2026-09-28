"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { channelManagerResource } from "../api/channel-manager.resource";
import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  CreateConnectionPayload,
  RestrictionUpdateItem,
} from "../types/channel-manager.types";

export interface UseChannelConnectionsOptions {
  hotelId: string | null | undefined;
  enabled?: boolean;
}

export function useChannelConnections(options: UseChannelConnectionsOptions) {
  const { hotelId, enabled = true } = options;

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId: hotelId ?? "" }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.connections.options(undefined as never),
    [boundResource],
  );

  const query = useQuery({
    ...queryOptions,
    enabled: Boolean(enabled && hotelId),
    staleTime: 15_000,
  });

  return {
    connections: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface UseInventoryGridOptions {
  hotelId: string | null | undefined;
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
}

export function useInventoryGrid(options: UseInventoryGridOptions) {
  const { hotelId, dateFrom, dateTo, enabled = true } = options;

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId: hotelId ?? "" }),
    [hotelId],
  );

  const queryOptions = useMemo(
    () => boundResource.queries.inventoryGrid.options({ dateFrom, dateTo }),
    [boundResource, dateFrom, dateTo],
  );

  const query = useQuery({
    ...queryOptions,
    enabled: Boolean(enabled && hotelId && dateFrom && dateTo),
    staleTime: 15_000,
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

export function useCreateConnection(options: { hotelId: string }) {
  const { hotelId } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.createConnection.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    createConnection: (payload: CreateConnectionPayload) =>
      mutation.mutateAsync(payload),
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

export function useDeleteConnection(options: { hotelId: string }) {
  const { hotelId } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.deleteConnection.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    deleteConnection: (id: string) => mutation.mutateAsync({ id }),
    isDeleting: mutation.isPending,
    error: mutation.error,
  };
}

export function useSyncConnection(options?: { hotelId?: string }) {
  const hotelId = options?.hotelId ?? "global";
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
  );

  const mutationOptions = useMemo(
    () => boundResource.mutations.syncNow.options(),
    [boundResource],
  );

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      await boundResource.invalidate(queryClient);
    },
  });

  return {
    syncConnection: (connectionId: string) =>
      mutation.mutateAsync({ connectionId }),
    isSyncing: mutation.isPending,
    syncingConnectionId: mutation.variables?.connectionId,
    error: mutation.error,
  };
}

export function useUpdateRestrictions(options: { hotelId: string }) {
  const { hotelId } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
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

export function useUpdateAvailability(options: { hotelId: string }) {
  const { hotelId } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
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

export function useBulkUpdateRestrictions(options: { hotelId: string }) {
  const { hotelId } = options;
  const queryClient = useQueryClient();

  const boundResource = useMemo(
    () => channelManagerResource.bind({ hotelId }),
    [hotelId],
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
