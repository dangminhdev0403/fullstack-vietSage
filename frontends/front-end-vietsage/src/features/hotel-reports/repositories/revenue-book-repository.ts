import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  CollectRevenueInput,
  CreateRevenueEntryInput,
  RevenueBook,
  RevenueBookQuery,
  UpdateRevenueEntryInput,
  UpsertRevenueTargetInput,
  UpsertRevenueTargetResponse,
  VoidRevenueEntryInput,
} from "../types/revenue-book-contract";

function path(hotelId: string, suffix = "") {
  return `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reports/revenue-book${suffix}`;
}

export const revenueBookRepository = {
  async list(
    hotelId: string,
    input: RevenueBookQuery,
    signal?: AbortSignal,
  ): Promise<RevenueBook> {
    const params = new URLSearchParams();
    if (input.from) params.set("from", input.from);
    if (input.to) params.set("to", input.to);
    if (input.category) params.set("category", input.category);
    if (input.paymentMethod) params.set("paymentMethod", input.paymentMethod);
    if (input.source) params.set("source", input.source);
    if (input.settlementStatus) {
      params.set("settlementStatus", input.settlementStatus);
    }
    const queryString = params.toString();
    const response = await requestInternalApiEnvelope<RevenueBook>(
      queryString ? `${path(hotelId)}?${queryString}` : path(hotelId),
      { method: "GET", signal },
    );
    return response.data;
  },
  async create(hotelId: string, body: CreateRevenueEntryInput) {
    return (
      await requestInternalApiEnvelope<unknown>(path(hotelId, "/entries"), {
        method: "POST",
        body,
      })
    ).data;
  },
  async update(hotelId: string, id: string, body: UpdateRevenueEntryInput) {
    return (
      await requestInternalApiEnvelope<unknown>(
        path(hotelId, `/entries/${encodeURIComponent(id)}`),
        { method: "PATCH", body },
      )
    ).data;
  },
  async collect(hotelId: string, id: string, body: CollectRevenueInput) {
    return (
      await requestInternalApiEnvelope<unknown>(
        path(hotelId, `/entries/${encodeURIComponent(id)}/collections`),
        { method: "POST", body },
      )
    ).data;
  },
  async void(hotelId: string, id: string, body: VoidRevenueEntryInput) {
    return (
      await requestInternalApiEnvelope<unknown>(
        path(hotelId, `/entries/${encodeURIComponent(id)}/void`),
        { method: "POST", body },
      )
    ).data;
  },
  async upsertTarget(
    hotelId: string,
    body: UpsertRevenueTargetInput,
  ): Promise<UpsertRevenueTargetResponse> {
    return (
      await requestInternalApiEnvelope<UpsertRevenueTargetResponse>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reports/targets`,
        {
          method: "PUT",
          body,
        },
      )
    ).data;
  },
};
