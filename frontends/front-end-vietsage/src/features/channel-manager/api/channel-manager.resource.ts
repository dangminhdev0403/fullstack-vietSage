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
  ChannexChannelCatalog,
  ChannexChannelCreateInput,
  ChannexChannelCreateResult,
  ChannexChannelDetail,
  ChannexChannelPrepareInput,
  ChannexChannelPrepareResult,
  ChannexChannelSession,
  ChannexChannelUpdateInput,
  ChannexDoctorReport,
  ChannexMappingItem,
  ChannexPendingModification,
  ChannelConnection,
  CreateConnectionPayload,
  InventoryGridResponse,
  RestrictionUpdateItem,
  SimulateBookingInput,
  SimulateBookingResult,
  SimulatedBookingItem,
  CancelSimulatedBookingInput,
  CancelSimulatedBookingResult,
  ChannexPropertyConfig,
  ConfigureChannexPropertyResult,
} from "../types/channel-manager.types";

export type ChannelManagerScope = {
  hotelId: string;
  roleScope?: "owner" | "admin";
};

export const channelManagerResource = createResource<ChannelManagerScope>()({
  namespace: ["vietsage"],
  name: "channel-manager",
  scopeKey: ({ hotelId, roleScope = "owner" }) => [
    "hotel",
    hotelId,
    "channel-manager",
    roleScope,
  ],
  queries: {
    connections: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<ChannelManagerScope, void>): Promise<
        ChannelConnection[]
      > =>
        channelManagerRepository.getConnections(
          scope.hotelId,
          signal,
          scope.roleScope,
        ),
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
          scope.roleScope,
        ),
    }),
    channexMappings: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
      }: ResourceQueryContext<ChannelManagerScope, void>): Promise<
        ChannexMappingItem[]
      > =>
        channelManagerRepository.getChannexMappings(
          scope.hotelId,
          scope.roleScope,
        ),
    }),
    pendingChannexModifications: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
      }: ResourceQueryContext<ChannelManagerScope, void>): Promise<
        ChannexPendingModification[]
      > =>
        channelManagerRepository.getPendingChannexModifications(
          scope.hotelId,
          scope.roleScope,
        ),
    }),
    channexChannelCatalog: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
      }: ResourceQueryContext<
        ChannelManagerScope,
        void
      >): Promise<ChannexChannelCatalog> =>
        channelManagerRepository.getChannexChannelCatalog(
          scope.hotelId,
          scope.roleScope,
        ),
    }),
    channexConfig: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
      }: ResourceQueryContext<
        ChannelManagerScope,
        void
      >): Promise<ChannexPropertyConfig> =>
        channelManagerRepository.getChannexConfig(
          scope.hotelId,
          scope.roleScope ?? "admin",
        ),
    }),
    simulatedBookings: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
      }: ResourceQueryContext<ChannelManagerScope, void>): Promise<
        SimulatedBookingItem[]
      > =>
        channelManagerRepository.getSimulatedBookings(
          scope.hotelId,
          scope.roleScope ?? "admin",
        ),
    }),
    channexChannelDetail: defineQuery({
      inputKey: (channelId: string) => [channelId],
      queryFn: ({
        scope,
        input: channelId,
      }: ResourceQueryContext<
        ChannelManagerScope,
        string
      >): Promise<ChannexChannelDetail> =>
        channelManagerRepository.getChannexChannel(
          scope.hotelId,
          channelId,
          scope.roleScope,
        ),
    }),
  },
  mutations: {
    createConnection: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        CreateConnectionPayload
      >) =>
        channelManagerRepository.createConnection(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "connections" }],
    }),
    deleteConnection: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { id: string }>) =>
        channelManagerRepository.deleteConnection(
          scope.hotelId,
          variables.id,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "connections" }],
    }),
    syncNow: defineMutation({
      mutationFn: ({
        variables,
        scope,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { connectionId: string }
      >) =>
        channelManagerRepository.syncNow(
          scope.hotelId,
          variables.connectionId,
          scope.roleScope,
        ),
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
        channelManagerRepository.updateRestrictions(
          scope.hotelId,
          variables.items,
          scope.roleScope,
        ),
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
        channelManagerRepository.updateAvailability(
          scope.hotelId,
          variables.items,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
    bulkUpdate: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, BulkUpdatePayload>) =>
        channelManagerRepository.bulkUpdate(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
    syncChannexContent: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { currency?: string } | void
      >) =>
        channelManagerRepository.syncChannexContent(
          scope.hotelId,
          variables || undefined,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexMappings" },
        { type: "query", operation: "channexConfig" },
      ],
    }),
    pushChannexAri: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        {
          startDate?: string;
          endDate?: string;
          roomType?: string;
          ratePlanCode?: string;
        }
      >) =>
        channelManagerRepository.pushChannexAri(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
    }),
    pollChannexFeed: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { limit?: number }>) =>
        channelManagerRepository.pollChannexFeed(
          scope.hotelId,
          variables.limit,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexMappings" },
        { type: "query", operation: "pendingChannexModifications" },
      ],
    }),
    resolveChannexModification: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { logId: string }>) =>
        channelManagerRepository.resolveChannexModification(
          scope.hotelId,
          variables.logId,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "pendingChannexModifications" },
      ],
    }),
    runChannexDoctor: defineMutation({
      mutationFn: ({
        scope,
      }: ResourceMutationContext<
        ChannelManagerScope,
        void
      >): Promise<ChannexDoctorReport> =>
        channelManagerRepository.runChannexDoctor(
          scope.hotelId,
          scope.roleScope,
        ),
    }),
    createChannexChannelSession: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { channelId?: string }
      >): Promise<ChannexChannelSession> =>
        channelManagerRepository.createChannexChannelSession(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
    }),
    prepareChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        ChannexChannelPrepareInput
      >): Promise<ChannexChannelPrepareResult> =>
        channelManagerRepository.prepareChannexChannel(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
    }),
    createChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        ChannexChannelCreateInput
      >): Promise<ChannexChannelCreateResult> =>
        channelManagerRepository.createChannexChannel(
          scope.hotelId,
          variables,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "channexChannelCatalog" }],
    }),
    activateChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { channelId: string }>) =>
        channelManagerRepository.activateChannexChannel(
          scope.hotelId,
          variables.channelId,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexChannelCatalog" },
        { type: "query", operation: "channexChannelDetail" },
      ],
    }),
    deactivateChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { channelId: string }>) =>
        channelManagerRepository.deactivateChannexChannel(
          scope.hotelId,
          variables.channelId,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexChannelCatalog" },
        { type: "query", operation: "channexChannelDetail" },
      ],
    }),
    updateChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { channelId: string; payload: ChannexChannelUpdateInput }
      >) =>
        channelManagerRepository.updateChannexChannel(
          scope.hotelId,
          variables.channelId,
          variables.payload,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexChannelCatalog" },
        { type: "query", operation: "channexChannelDetail" },
        { type: "query", operation: "channexMappings" },
      ],
    }),
    syncChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { channelId: string }>) =>
        channelManagerRepository.syncChannexChannel(
          scope.hotelId,
          variables.channelId,
          scope.roleScope,
        ),
      invalidates: [{ type: "query", operation: "inventoryGrid" }],
    }),
    deleteChannexChannel: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<ChannelManagerScope, { channelId: string }>) =>
        channelManagerRepository.deleteChannexChannel(
          scope.hotelId,
          variables.channelId,
          scope.roleScope,
        ),
      invalidates: [
        { type: "query", operation: "channexChannelCatalog" },
        { type: "query", operation: "channexMappings" },
      ],
    }),
    simulateBooking: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        SimulateBookingInput
      >): Promise<SimulateBookingResult> =>
        channelManagerRepository.simulateBooking(
          scope.hotelId,
          variables,
          scope.roleScope ?? "admin",
        ),
      invalidates: [
        { type: "query", operation: "channexMappings" },
        { type: "query", operation: "simulatedBookings" },
        { type: "query", operation: "inventoryGrid" },
      ],
    }),
    cancelSimulatedBooking: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        CancelSimulatedBookingInput
      >): Promise<CancelSimulatedBookingResult> =>
        channelManagerRepository.cancelSimulatedBooking(
          scope.hotelId,
          variables,
          scope.roleScope ?? "admin",
        ),
      invalidates: [
        { type: "query", operation: "channexMappings" },
        { type: "query", operation: "simulatedBookings" },
        { type: "query", operation: "inventoryGrid" },
      ],
    }),
    configureChannexProperty: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        ChannelManagerScope,
        { channexPropertyId: string }
      >): Promise<ConfigureChannexPropertyResult> =>
        channelManagerRepository.configureChannexProperty(
          scope.hotelId,
          variables.channexPropertyId,
          scope.roleScope ?? "admin",
        ),
      invalidates: [
        { type: "query", operation: "channexConfig" },
        { type: "query", operation: "channexMappings" },
      ],
    }),
  },
});
