import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  CollectRevenueInput, CreateRevenueEntryInput, RevenueBook, RevenueBookQuery,
  UpdateRevenueEntryInput, VoidRevenueEntryInput,
} from "../types/revenue-book-contract";

function path(hotelId: string, suffix = "") {
  return `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reports/revenue-book${suffix}`;
}

export const revenueBookRepository = {
  async list(hotelId: string, input: RevenueBookQuery, signal?: AbortSignal): Promise<RevenueBook> {
    const params = new URLSearchParams();
    if (input.from) params.set("from", input.from);
    if (input.to) params.set("to", input.to);
    const response = await requestInternalApiEnvelope<RevenueBook>(`${path(hotelId)}?${params}`, { method: "GET", signal });
    return response.data;
  },
  async create(hotelId: string, body: CreateRevenueEntryInput) {
    return (await requestInternalApiEnvelope<unknown>(path(hotelId, "/entries"), { method: "POST", body })).data;
  },
  async update(hotelId: string, id: string, body: UpdateRevenueEntryInput) {
    return (await requestInternalApiEnvelope<unknown>(path(hotelId, `/entries/${encodeURIComponent(id)}`), { method: "PATCH", body })).data;
  },
  async collect(hotelId: string, id: string, body: CollectRevenueInput) {
    return (await requestInternalApiEnvelope<unknown>(path(hotelId, `/entries/${encodeURIComponent(id)}/collections`), { method: "POST", body })).data;
  },
  async void(hotelId: string, id: string, body: VoidRevenueEntryInput) {
    return (await requestInternalApiEnvelope<unknown>(path(hotelId, `/entries/${encodeURIComponent(id)}/void`), { method: "POST", body })).data;
  },
};
