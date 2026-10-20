import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  BulkReservationInput,
  BulkReservationResult,
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import type {
  BillingPage,
  FolioItem,
  FolioListItem,
  FolioSummary,
} from "@/features/billing/types/billing-contract";

export type StaffRoomsListInput = Readonly<{
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  floor?: string;
  zone?: string;
  type?: string;
  vipOnly?: boolean;
  businessDate?: string;
}>;

export type StayFolioContext = {
  folio: FolioListItem | null;
  summary: FolioSummary | null;
  items: FolioItem[];
};

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
    if (input?.status && input.status !== "all")
      params.set("status", input.status.toUpperCase());
    if (input?.floor && input.floor !== "all")
      params.set("floor", input.floor.trim());
    if (input?.zone && input.zone !== "all")
      params.set("zone", input.zone.trim());
    if (input?.type && input.type !== "all")
      params.set("type", input.type.trim());
    if (input?.vipOnly) params.set("vipOnly", "true");
    if (input?.businessDate) params.set("businessDate", input.businessDate);

    const qs = params.toString();
    const response = await requestInternalApiEnvelope<
      HotelOpsPage<HotelRoomSummary>
    >(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms${qs ? `?${qs}` : ""}`,
      { method: "GET", signal },
    );
    return response.data;
  },

  async getActiveFolioByStay(
    hotelId: string,
    stayId: string,
    signal?: AbortSignal,
  ): Promise<FolioListItem | null> {
    try {
      const response = await requestInternalApiEnvelope<FolioListItem>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/stays/${encodeURIComponent(stayId)}/active-folio`,
        { method: "GET", signal },
      );
      return response.data;
    } catch (err: unknown) {
      const errorObj = err as { status?: number; data?: { code?: string } };
      if (errorObj?.status === 404 || errorObj?.data?.code === "NOT_FOUND") {
        return null;
      }
      throw err;
    }
  },

  async getFolioSummary(
    hotelId: string,
    folioId: string,
    signal?: AbortSignal,
  ): Promise<FolioSummary | null> {
    const response = await requestInternalApiEnvelope<FolioSummary>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/folios/${encodeURIComponent(folioId)}/summary`,
      { method: "GET", signal },
    );
    return response.data;
  },

  async listFolioItems(
    hotelId: string,
    folioId: string,
    signal?: AbortSignal,
  ): Promise<FolioItem[]> {
    const response = await requestInternalApiEnvelope<BillingPage<FolioItem>>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/folios/${encodeURIComponent(folioId)}/items?limit=100`,
      { method: "GET", signal },
    );
    return response.data?.items ?? [];
  },

  async getStayFolioContext(
    hotelId: string,
    stayId: string,
    signal?: AbortSignal,
  ): Promise<StayFolioContext> {
    const folio = await this.getActiveFolioByStay(hotelId, stayId, signal);
    if (!folio?.id) {
      return { folio: null, summary: null, items: [] };
    }
    const [summary, items] = await Promise.all([
      this.getFolioSummary(hotelId, folio.id, signal),
      this.listFolioItems(hotelId, folio.id, signal),
    ]);
    return {
      folio,
      summary,
      items,
    };
  },

  async createBulkReservations(
    hotelId: string,
    input: BulkReservationInput,
    signal?: AbortSignal,
  ): Promise<BulkReservationResult> {
    const response = await requestInternalApiEnvelope<BulkReservationResult>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/bulk`,
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response.data;
  },
};
