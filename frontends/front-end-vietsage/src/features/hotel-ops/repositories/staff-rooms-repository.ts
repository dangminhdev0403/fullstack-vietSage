import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type StaffRoomsListInput = Readonly<{
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  floor?: string;
  type?: string;
  vipOnly?: boolean;
}>;

export const staffRoomsRepository = {
  async list(
    hotelId: string,
    input?: StaffRoomsListInput,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<HotelRoomSummary>> {
    const params = new URLSearchParams();
    if (input?.page) params.set("page", String(input.page));
    if (input?.limit) params.set("limit", String(input.limit));
    if (input?.q?.trim()) params.set("q", input.q.trim());
    if (input?.status && input.status !== "all") params.set("status", input.status.toUpperCase());
    if (input?.floor && input.floor !== "all") params.set("floor", input.floor.trim());
    if (input?.type && input.type !== "all") params.set("type", input.type.trim());
    if (input?.vipOnly) params.set("vipOnly", "true");

    const qs = params.toString();
    const response = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms${qs ? `?${qs}` : ""}`,
      { method: "GET", signal },
    );
    return response.data;
  },
};
