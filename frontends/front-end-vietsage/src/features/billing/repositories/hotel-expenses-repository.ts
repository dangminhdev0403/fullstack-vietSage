import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  CreateHotelExpenseInput,
  HotelExpensesQuery,
  HotelExpensesResponse,
  PayHotelExpenseInput,
  UpdateHotelExpenseInput,
  VoidHotelExpenseInput,
} from "../types/hotel-expenses-contract";

function basePath(hotelId: string, suffix = "") {
  return `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/expenses${suffix}`;
}

export const hotelExpensesRepository = {
  async list(
    hotelId: string,
    query: HotelExpensesQuery,
    signal?: AbortSignal,
  ): Promise<HotelExpensesResponse> {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.category) params.set("category", query.category);
    if (query.paymentStatus) params.set("paymentStatus", query.paymentStatus);
    if (query.includeVoided) params.set("includeVoided", "true");
    const qs = params.toString();
    const res = await requestInternalApiEnvelope<HotelExpensesResponse>(
      `${basePath(hotelId)}${qs ? `?${qs}` : ""}`,
      { method: "GET", signal },
    );
    return res.data;
  },

  async create(hotelId: string, body: CreateHotelExpenseInput) {
    const res = await requestInternalApiEnvelope<{ id: string; version: number }>(
      basePath(hotelId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return res.data;
  },

  async update(hotelId: string, expenseId: string, body: UpdateHotelExpenseInput) {
    const res = await requestInternalApiEnvelope<{ id: string; version: number }>(
      basePath(hotelId, `/${encodeURIComponent(expenseId)}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return res.data;
  },

  async pay(hotelId: string, expenseId: string, body: PayHotelExpenseInput) {
    const res = await requestInternalApiEnvelope<{ id: string; version: number }>(
      basePath(hotelId, `/${encodeURIComponent(expenseId)}/pay`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return res.data;
  },

  async void(hotelId: string, expenseId: string, body: VoidHotelExpenseInput) {
    const res = await requestInternalApiEnvelope<{ id: string; version: number }>(
      basePath(hotelId, `/${encodeURIComponent(expenseId)}/void`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return res.data;
  },
};
