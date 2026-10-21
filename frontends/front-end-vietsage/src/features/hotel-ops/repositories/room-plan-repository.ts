import { requestInternalApi } from "@/core/http/internal-api-client";
import type {
  RoomPlanResponse,
  UpdateReservationPlacementInput,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type RoomPlanQueryInput = {
  from: string;
  to: string;
};

export const roomPlanRepository = {
  async getRoomPlan(
    hotelId: string,
    query: RoomPlanQueryInput,
    signal?: AbortSignal,
  ): Promise<RoomPlanResponse> {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
    });
    return requestInternalApi<RoomPlanResponse>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/room-plan?${params.toString()}`,
      { method: "GET", signal },
    );
  },

  async updatePlacement(
    hotelId: string,
    reservationId: string,
    body: UpdateReservationPlacementInput,
  ): Promise<unknown> {
    return requestInternalApi<unknown>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/placement`,
      {
        method: "PUT",
        body,
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async extendStay(
    hotelId: string,
    stayId: string,
    plannedCheckOutAt: string,
  ): Promise<unknown> {
    return requestInternalApi<unknown>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/stays/${encodeURIComponent(stayId)}`,
      {
        method: "PATCH",
        body: { plannedCheckOutAt },
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async updateReservationDates(
    hotelId: string,
    reservationId: string,
    body: {
      startDate?: string;
      endDate?: string;
      expectedUpdatedAt: string;
    },
  ): Promise<unknown> {
    return requestInternalApi<unknown>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/dates`,
      {
        method: "PATCH",
        body,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
