import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import {
  mapChannelConnection,
  mapInventoryGrid,
  type BackendConnection,
  type BackendInventoryGrid,
} from "./channel-manager.mapper";
import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  ChannexChannelCatalog,
  ChannexChannelCreateInput,
  ChannexChannelCreateResult,
  ChannexChannelPrepareInput,
  ChannexChannelPrepareResult,
  ChannexChannelSession,
  ChannexDoctorReport,
  ChannexMappingItem,
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

export type ChannelManagerRoleScope = "owner" | "admin";

function basePath(
  hotelId: string,
  scope: ChannelManagerRoleScope = "owner",
): string {
  return `/api/${scope}/hotels/${encodeURIComponent(hotelId)}/channel-manager`;
}

export const channelManagerRepository = {
  async getConnections(
    hotelId: string,
    signal?: AbortSignal,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannelConnection[]> {
    const response = await requestInternalApiEnvelope<BackendConnection[]>(
      `${basePath(hotelId, scope)}/connections`,
      { method: "GET", signal },
    );
    const appOrigin =
      typeof window === "undefined" ? "" : window.location.origin;
    return response.data.map((connection) =>
      mapChannelConnection(connection, appOrigin),
    );
  },

  async createConnection(
    hotelId: string,
    data: CreateConnectionPayload,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannelConnection> {
    const response = await requestInternalApiEnvelope<BackendConnection>(
      `${basePath(hotelId, scope)}/connections`,
      {
        method: "POST",
        body: {
          channelCode: data.channelType,
          title: data.name,
          inboundIcalUrl: data.inboundUrl,
          roomMappings: [],
        },
      },
    );
    const appOrigin =
      typeof window === "undefined" ? "" : window.location.origin;
    return mapChannelConnection(response.data, appOrigin);
  },

  async deleteConnection(
    hotelId: string,
    id: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{ success: boolean; id: string }> {
    const response = await requestInternalApiEnvelope<BackendConnection>(
      `${basePath(hotelId, scope)}/connections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return { success: true, id: response.data.id };
  },

  async syncNow(
    hotelId: string,
    connectionId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{
    success: boolean;
    connectionId: string;
    syncedAt: string;
    message: string;
  }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      connectionId: string;
      syncedAt: string;
      message?: string;
      eventsCount?: number;
    }>(
      `${basePath(hotelId, scope)}/connections/${encodeURIComponent(connectionId)}/sync`,
      { method: "POST", body: {} },
    );
    return {
      ...response.data,
      message:
        response.data.message ??
        `Đồng bộ thành công ${response.data.eventsCount ?? 0} sự kiện iCal.`,
    };
  },

  async getInventoryGrid(
    hotelId: string,
    dateFrom: string,
    dateTo: string,
    signal?: AbortSignal,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<InventoryGridResponse> {
    const params = new URLSearchParams({ dateFrom, dateTo });
    const response = await requestInternalApiEnvelope<BackendInventoryGrid>(
      `${basePath(hotelId, scope)}/grid?${params.toString()}`,
      { method: "GET", signal },
    );
    return mapInventoryGrid(response.data);
  },

  async updateRestrictions(
    hotelId: string,
    items: RestrictionUpdateItem[],
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{ success: boolean; updatedCount: number }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      count: number;
    }>(`${basePath(hotelId, scope)}/restrictions`, {
      method: "PUT",
      body: {
        items: items.map((item) => ({
          roomType: item.roomTypeId,
          date: item.date,
          rate: item.rate,
          minStayArrival: item.minStay,
          stopSell: item.stopSell,
          closedToArrival: item.closedToArrival,
          closedToDeparture: item.closedToDeparture,
        })),
      },
    });
    return {
      success: response.data.success,
      updatedCount: response.data.count,
    };
  },

  async updateAvailability(
    hotelId: string,
    items: AvailabilityUpdateItem[],
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{ success: boolean; updatedCount: number }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      count: number;
    }>(`${basePath(hotelId, scope)}/availability`, {
      method: "PUT",
      body: {
        items: items.map((item) => ({
          roomType: item.roomTypeId,
          date: item.date,
          totalRooms: item.totalRooms,
          overrideAvailable: item.available,
        })),
      },
    });
    return {
      success: response.data.success,
      updatedCount: response.data.count,
    };
  },

  async bulkUpdate(
    hotelId: string,
    data: BulkUpdatePayload,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{ success: boolean; affectedCells: number; message: string }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      updatedTotalCount: number;
    }>(`${basePath(hotelId, scope)}/bulk-update`, {
      method: "POST",
      body: {
        startDate: data.dateFrom,
        endDate: data.dateTo,
        roomTypes: data.roomTypeIds,
        daysOfWeek: data.daysOfWeek,
        rate: data.rate,
        minStayArrival: data.minStay,
        stopSell: data.stopSell,
      },
    });
    return {
      success: response.data.success,
      affectedCells: response.data.updatedTotalCount,
      message: `Đã lưu ${response.data.updatedTotalCount} ô giá/hạn chế vào DB.`,
    };
  },

  async syncChannexContent(
    hotelId: string,
    options?: { currency?: string },
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{
    channexPropertyId: string;
    roomTypesSynced: unknown[];
    ratePlansSynced: unknown[];
  }> {
    const response = await requestInternalApiEnvelope<{
      channexPropertyId: string;
      roomTypesSynced: unknown[];
      ratePlansSynced: unknown[];
    }>(`${basePath(hotelId, scope)}/channex/sync-content`, {
      method: "POST",
      body: options ?? {},
    });
    return response.data;
  },

  async pushChannexAri(
    hotelId: string,
    payload?: {
      startDate?: string;
      endDate?: string;
      roomType?: string;
      ratePlanCode?: string;
    },
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{
    startDate?: string;
    endDate?: string;
    availabilityPushedCount: number;
    restrictionsPushedCount: number;
    sourceCurrency: "VND";
    targetCurrency: string;
    rateConversionApplied: boolean;
    rateConversionMultiplier: number;
    readbackVerified: {
      availabilityMatch: boolean;
      restrictionsMatch: boolean;
    };
  }> {
    const response = await requestInternalApiEnvelope<{
      startDate?: string;
      endDate?: string;
      availabilityPushedCount: number;
      restrictionsPushedCount: number;
      sourceCurrency: "VND";
      targetCurrency: string;
      rateConversionApplied: boolean;
      rateConversionMultiplier: number;
      readbackVerified: {
        availabilityMatch: boolean;
        restrictionsMatch: boolean;
      };
    }>(`${basePath(hotelId, scope)}/channex/push-ari`, {
      method: "POST",
      body: payload || {},
    });
    return response.data;
  },

  async pollChannexFeed(
    hotelId: string,
    limit?: number,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{
    totalProcessed: number;
    newBookingsCount: number;
    cancelledBookingsCount: number;
    skippedCount: number;
  }> {
    const response = await requestInternalApiEnvelope<{
      totalProcessed: number;
      newBookingsCount: number;
      cancelledBookingsCount: number;
      skippedCount: number;
    }>(`${basePath(hotelId, scope)}/channex/poll-feed`, {
      method: "POST",
      body: { limit: limit || 10 },
    });
    return response.data;
  },

  async runChannexDoctor(
    hotelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexDoctorReport> {
    const response = await requestInternalApiEnvelope<ChannexDoctorReport>(
      `${basePath(hotelId, scope)}/channex/doctor`,
      { method: "GET" },
    );
    return response.data;
  },

  async getChannexMappings(
    hotelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexMappingItem[]> {
    const response = await requestInternalApiEnvelope<ChannexMappingItem[]>(
      `${basePath(hotelId, scope)}/channex/mappings`,
      { method: "GET" },
    );
    return response.data;
  },

  async createChannexChannelSession(
    hotelId: string,
    input: { channelId?: string } = {},
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexChannelSession> {
    const response = await requestInternalApiEnvelope<ChannexChannelSession>(
      `${basePath(hotelId, scope)}/channex/channel-session`,
      { method: "POST", body: input },
    );
    return response.data;
  },

  async getChannexChannelCatalog(
    hotelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexChannelCatalog> {
    const response = await requestInternalApiEnvelope<ChannexChannelCatalog>(
      `${basePath(hotelId, scope)}/channex/channels`,
      { method: "GET" },
    );
    return response.data;
  },

  async prepareChannexChannel(
    hotelId: string,
    payload: ChannexChannelPrepareInput,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexChannelPrepareResult> {
    const response =
      await requestInternalApiEnvelope<ChannexChannelPrepareResult>(
        `${basePath(hotelId, scope)}/channex/channels`,
        { method: "PUT", body: payload },
      );
    return response.data;
  },

  async createChannexChannel(
    hotelId: string,
    payload: ChannexChannelCreateInput,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexChannelCreateResult> {
    const response =
      await requestInternalApiEnvelope<ChannexChannelCreateResult>(
        `${basePath(hotelId, scope)}/channex/channels`,
        { method: "POST", body: payload },
      );
    return response.data;
  },

  async activateChannexChannel(
    hotelId: string,
    channelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<{ channelId: string; isActive: boolean }> {
    const response = await requestInternalApiEnvelope<{
      channelId: string;
      isActive: boolean;
    }>(
      `${basePath(hotelId, scope)}/channex/channels/${encodeURIComponent(channelId)}/activate`,
      { method: "POST", body: {} },
    );
    return response.data;
  },

  async simulateBooking(
    hotelId: string,
    payload: SimulateBookingInput,
    scope: ChannelManagerRoleScope = "admin",
  ): Promise<SimulateBookingResult> {
    const response = await requestInternalApiEnvelope<SimulateBookingResult>(
      `${basePath(hotelId, scope)}/channex/simulate-booking`,
      { method: "POST", body: payload },
    );
    return response.data;
  },

  async getChannexConfig(
    hotelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ChannexPropertyConfig> {
    const response = await requestInternalApiEnvelope<ChannexPropertyConfig>(
      `${basePath(hotelId, scope)}/channex/config`,
      { method: "GET" },
    );
    return response.data;
  },

  async configureChannexProperty(
    hotelId: string,
    channexPropertyId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<ConfigureChannexPropertyResult> {
    const response =
      await requestInternalApiEnvelope<ConfigureChannexPropertyResult>(
        `${basePath(hotelId, scope)}/channex/config`,
        {
          method: "POST",
          body: { channexPropertyId },
        },
      );
    return response.data;
  },

  async cancelSimulatedBooking(
    hotelId: string,
    payload: CancelSimulatedBookingInput,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<CancelSimulatedBookingResult> {
    const response =
      await requestInternalApiEnvelope<CancelSimulatedBookingResult>(
        `${basePath(hotelId, scope)}/channex/simulate-booking/cancel`,
        {
          method: "POST",
          body: payload,
        },
      );
    return response.data;
  },

  async getSimulatedBookings(
    hotelId: string,
    scope: ChannelManagerRoleScope = "owner",
  ): Promise<SimulatedBookingItem[]> {
    const response = await requestInternalApiEnvelope<SimulatedBookingItem[]>(
      `${basePath(hotelId, scope)}/channex/simulated-bookings`,
      { method: "GET" },
    );
    return response.data;
  },
};
