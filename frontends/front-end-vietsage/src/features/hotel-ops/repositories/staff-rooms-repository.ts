import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type StaffRoomsListInput = Readonly<{
  page: number;
  limit: number;
  q: string;
  status: string;
  floor: string;
  type: string;
  vipOnly: boolean;
}>;

export const staffRoomsRepository = {
  async list(
    hotelId: string,
    input: StaffRoomsListInput,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<HotelRoomSummary>> {
    const params = new URLSearchParams({
      page: String(input.page),
      limit: String(input.limit),
      ...(input.q ? { q: input.q } : {}),
      ...(input.status !== "all" ? { status: input.status.toUpperCase() } : {}),
      ...(input.floor !== "all" ? { floor: input.floor } : {}),
      ...(input.type !== "all" ? { type: input.type } : {}),
      ...(input.vipOnly ? { vipOnly: "true" } : {}),
    });
    const response = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms?${params}`,
      { method: "GET", signal },
    );
    return response.data;
  },
};
