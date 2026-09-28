import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import { channelManagerRepository } from "./channel-manager.repository";
import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  ChannelConnection,
  CreateConnectionPayload,
  InventoryGridResponse,
  RestrictionUpdateItem,
} from "../types/channel-manager.types";

export type ChannelManagerScope = {
  hotelId: string;
};

export const channelManagerResource = createResource<ChannelManagerScope>()({
  namespace: ["vietsage"],
  name: "channel-manager",
  scopeKey: ({ hotelId }) => ["hotel", hotelId, "channel-manager"],
  queries: {
    connections: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<ChannelManagerScope, void>): Promise<ChannelConnection[]> =>
        channelManagerRepository.getConnections(scope.hotelId, signal),
    }),
    inventoryGrid: defineQuery({
      inputKey: (input: { dateFrom: string; dateTo: string }) => [
        input.dateFrom,
        input.dateTo,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        ChannelManagerScope,
        { dateFrom: string; dateTo: string }
      >): Promise<InventoryGridResponse> =>
        channelManagerRepository.getInventoryGrid(
          scope.hotelId,
          input.dateFrom,
          input.dateTo,
          signal,
        ),
    }),
  },
  mutations: {
    createConnection: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, CreateConnectionPayload>) =>
        channelManagerRepository.createConnection(scope.hotelId, variables),
      invalidates: [{ type: "query", operation: "connections" }],
    }),
    deleteConnection: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { id: string }>) =>
        channelManagerRepository.deleteConnection(scope.hotelId, variables.id),
      invalidates: [{ type: "query", operation: "connections" }],
    }),
    syncNow: defineMutation({
      mutationFn: ({
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { connectionId: string }>) =>
        channelManagerRepository.syncNow(variables.connectionId),
      invalidates: [{ type: "query", operation: "connections" }],
    }),
    updateRestrictions: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { items: RestrictionUpdateItem[] }
      >) =>
        channelManagerRepository.updateRestrictions(scope.hotelId, variables.items),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
    updateAvailability: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { items: AvailabilityUpdateItem[] }
      >) =>
        channelManagerRepository.updateAvailability(scope.hotelId, variables.items),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
    bulkUpdate: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, BulkUpdatePayload>) =>
        channelManagerRepository.bulkUpdate(scope.hotelId, variables),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
  },
});
