import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  ChannelConnection,
  CreateConnectionPayload,
  InventoryGridResponse,
  RestrictionUpdateItem,
} from "../types/channel-manager.types";

function basePath(hotelId: string): string {
  return `/api/owner/hotels/${encodeURIComponent(hotelId)}/channel-manager`;
}

export const channelManagerRepository = {
  async getConnections(
    hotelId: string,
    signal?: AbortSignal,
  ): Promise<ChannelConnection[]> {
    const response = await requestInternalApiEnvelope<ChannelConnection[]>(
      `${basePath(hotelId)}/connections`,
      { method: "GET", signal },
    );
    return response.data;
  },

  async createConnection(
    hotelId: string,
    data: CreateConnectionPayload,
  ): Promise<ChannelConnection> {
    const response = await requestInternalApiEnvelope<ChannelConnection>(
      `${basePath(hotelId)}/connections`,
      {
        method: "POST",
        body: data,
      },
    );
    return response.data;
  },

  async deleteConnection(
    hotelId: string,
    id: string,
  ): Promise<{ success: boolean; id: string }> {
    const response = await requestInternalApiEnvelope<{ success: boolean; id: string }>(
      `${basePath(hotelId)}/connections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return response.data;
  },

  async syncNow(connectionId: string): Promise<{
    success: boolean;
    connectionId: string;
    syncedAt: string;
    message: string;
  }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      connectionId: string;
      syncedAt: string;
      message: string;
    }>(`/api/owner/hotels/global/channel-manager/connections/${encodeURIComponent(connectionId)}/sync`, {
      method: "POST",
    });
    return response.data;
  },

  async getInventoryGrid(
    hotelId: string,
    dateFrom: string,
    dateTo: string,
    signal?: AbortSignal,
  ): Promise<InventoryGridResponse> {
    const params = new URLSearchParams({ dateFrom, dateTo });
    const response = await requestInternalApiEnvelope<InventoryGridResponse>(
      `${basePath(hotelId)}/grid?${params.toString()}`,
      { method: "GET", signal },
    );
    return response.data;
  },

  async updateRestrictions(
    hotelId: string,
    items: RestrictionUpdateItem[],
  ): Promise<{ success: boolean; updatedCount: number }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      updatedCount: number;
    }>(`${basePath(hotelId)}/restrictions`, {
      method: "PUT",
      body: { items },
    });
    return response.data;
  },

  async updateAvailability(
    hotelId: string,
    items: AvailabilityUpdateItem[],
  ): Promise<{ success: boolean; updatedCount: number }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      updatedCount: number;
    }>(`${basePath(hotelId)}/availability`, {
      method: "PUT",
      body: { items },
    });
    return response.data;
  },

  async bulkUpdate(
    hotelId: string,
    data: BulkUpdatePayload,
  ): Promise<{ success: boolean; affectedCells: number; message: string }> {
    const response = await requestInternalApiEnvelope<{
      success: boolean;
      affectedCells: number;
      message: string;
    }>(`${basePath(hotelId)}/bulk-update`, {
      method: "POST",
      body: data,
    });
    return response.data;
  },
};
