import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelOpsPage,
  HotelRoomSummary,
  HousekeepingTask,
  HousekeepingTaskPage,
  HousekeepingTasksSummary,
  StaffRequestListItem,
} from "../types/housekeeping-contract";

export type ListRoomsParams = {
  page?: number;
  limit?: number;
  status?: string;
  floor?: string;
  q?: string;
};

export type ListRequestsParams = {
  page?: number;
  limit?: number;
  status?: string;
  priority?: "NORMAL" | "URGENT";
  roomNumber?: string;
};

export type UpdateRequestStatusInput = {
  status: "PENDING" | "ACKNOWLEDGED" | "COMPLETED" | "CANCELLED" | "REJECTED";
  assignedToUserId?: string;
  note?: string;
};

export type ListTasksParams = {
  page?: number;
  limit?: number;
  status?: HousekeepingTask["status"];
  priority?: HousekeepingTask["priority"];
  roomId?: string;
  assignedToUserId?: string;
};

export type TaskVersionInput = { expectedVersion?: number };

export const housekeepingRepository = {
  async listTasks(
    hotelId: string,
    params?: ListTasksParams,
    signal?: AbortSignal,
  ): Promise<HousekeepingTaskPage> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.priority) searchParams.set("priority", params.priority);
    if (params?.roomId) searchParams.set("roomId", params.roomId);
    if (params?.assignedToUserId) searchParams.set("assignedToUserId", params.assignedToUserId);
    const qs = searchParams.toString();
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks${qs ? `?${qs}` : ""}`;
    const response = await requestInternalApiEnvelope<HousekeepingTaskPage>(endpoint, {
      method: "GET",
      signal,
    });
    return response.data ?? { items: [], total: 0, page: params?.page ?? 1, limit: params?.limit ?? 100, totalPages: 0 };
  },

  async getTasksSummary(hotelId: string, signal?: AbortSignal): Promise<HousekeepingTasksSummary> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/summary`;
    const response = await requestInternalApiEnvelope<HousekeepingTasksSummary>(endpoint, { method: "GET", signal });
    return response.data ?? { queued: 0, claimed: 0, inProgress: 0, blocked: 0, completed: 0, totalActive: 0 };
  },

  async claimTask(hotelId: string, taskId: string, payload?: TaskVersionInput): Promise<HousekeepingTask> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/${encodeURIComponent(taskId)}/claim`;
    const response = await requestInternalApiEnvelope<HousekeepingTask>(endpoint, { method: "POST", body: payload ?? {} });
    return response.data;
  },

  async startTask(hotelId: string, taskId: string, payload?: TaskVersionInput): Promise<HousekeepingTask> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/${encodeURIComponent(taskId)}/start`;
    const response = await requestInternalApiEnvelope<HousekeepingTask>(endpoint, { method: "POST", body: payload ?? {} });
    return response.data;
  },

  async blockTask(hotelId: string, taskId: string, payload: { reason: string; notes?: string; expectedVersion?: number }): Promise<HousekeepingTask> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/${encodeURIComponent(taskId)}/block`;
    const response = await requestInternalApiEnvelope<HousekeepingTask>(endpoint, { method: "POST", body: payload });
    return response.data;
  },

  async completeTask(hotelId: string, taskId: string, payload?: { notes?: string; expectedVersion?: number }): Promise<HousekeepingTask> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/${encodeURIComponent(taskId)}/complete`;
    const response = await requestInternalApiEnvelope<HousekeepingTask>(endpoint, { method: "POST", body: payload ?? {} });
    return response.data;
  },

  async reopenTask(hotelId: string, taskId: string, payload?: { reason?: string; expectedVersion?: number }): Promise<HousekeepingTask> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/housekeeping/tasks/${encodeURIComponent(taskId)}/reopen`;
    const response = await requestInternalApiEnvelope<HousekeepingTask>(endpoint, { method: "POST", body: payload ?? {} });
    return response.data;
  },

  async listRooms(
    hotelId: string,
    params?: ListRoomsParams,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<HotelRoomSummary>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status.toUpperCase());
    }
    if (params?.floor && params.floor !== "all") {
      searchParams.set("floor", params.floor.trim());
    }

    const qs = searchParams.toString();
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms${qs ? `?${qs}` : ""}`;
    const response = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
      endpoint,
      { method: "GET", signal },
    );
    return (
      response.data ?? {
        items: [],
        total: 0,
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        totalPages: 0,
      }
    );
  },

  async confirmRoomReady(
    hotelId: string,
    roomId: string,
    expectedUpdatedAt: string,
  ): Promise<HotelRoomSummary> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(roomId)}/ready`;
    const response = await requestInternalApiEnvelope<HotelRoomSummary>(
      endpoint,
      {
        method: "PATCH",
        body: { expectedUpdatedAt },
      },
    );
    return response.data;
  },

  async updateRoomStatus(
    hotelId: string,
    roomId: string,
    status: string,
  ): Promise<HotelRoomSummary> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(roomId)}/status`;
    const response = await requestInternalApiEnvelope<HotelRoomSummary>(
      endpoint,
      {
        method: "PATCH",
        body: { status },
      },
    );
    return response.data;
  },

  async listRequests(
    hotelId: string,
    params?: ListRequestsParams,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<StaffRequestListItem>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.priority) searchParams.set("priority", params.priority);
    if (params?.roomNumber) searchParams.set("roomNumber", params.roomNumber);

    const qs = searchParams.toString();
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests${qs ? `?${qs}` : ""}`;
    const response = await requestInternalApiEnvelope<HotelOpsPage<StaffRequestListItem>>(
      endpoint,
      { method: "GET", signal },
    );
    return (
      response.data ?? {
        items: [],
        total: 0,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        totalPages: 0,
      }
    );
  },

  async updateRequestStatus(
    hotelId: string,
    requestId: string,
    payload: UpdateRequestStatusInput,
  ): Promise<StaffRequestListItem> {
    const endpoint = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests/${encodeURIComponent(requestId)}/status`;
    const response = await requestInternalApiEnvelope<StaffRequestListItem>(
      endpoint,
      {
        method: "PATCH",
        body: payload,
      },
    );
    return response.data;
  },
};
