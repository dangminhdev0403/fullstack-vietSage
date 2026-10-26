import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  BulkReservationInput,
  BulkReservationResult,
  GroupConfirmationData,
  HotelArrival,
  HotelOpsPage,
  HotelRoomSummary,
  ReservationConfirmationData,
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

export type HotelArrivalReservationItem = HotelArrival & {
  activeStayId?: string | null;
  assignedRoomId?: string | null;
  assignedRoomNumber?: string | null;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
  guestCount?: number | null;
  ratePerNight?: number | string | null;
  totalAmount?: number | string | null;
  depositAmount?: number | string | null;
};

export type GroupRoomDetailItem = {
  id?: string;
  reservationId?: string;
  reservationCode: string;
  groupCode?: string | null;
  status: HotelArrival["status"];
  guestDisplayName?: string;
  guestName?: string;
  guestPhone?: string | null;
  guestCount?: number | null;
  plannedCheckInAt?: string;
  plannedCheckOutAt?: string;
  checkInDate?: string;
  checkOutDate?: string;
  roomId?: string | null;
  assignedRoomId?: string | null;
  roomNumber?: string | null;
  assignedRoomNumber?: string | null;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
  rate?: number | string | null;
  ratePerNight?: number | string | null;
  nightlyRate?: number | string | null;
  nightlyRateSnapshot?: number | string | null;
  totalAmount?: number | string | null;
  depositAmount?: number | string | null;
  activeStayId?: string | null;
  stayId?: string | null;
  notes?: string | null;
  updatedAt?: string | null;
  room?: {
    id: string;
    roomNumber: string;
    type?: string | null;
    maxOccupancy?: number | null;
  } | null;
};

export type GroupBookingDetailResponse = {
  groupCode?: string;
  leadGuestName?: string;
  leadGuestPhone?: string | null;
  checkInDate?: string;
  checkOutDate?: string;
  plannedCheckInAt?: string;
  plannedCheckOutAt?: string;
  notes?: string | null;
  rooms?: GroupRoomDetailItem[];
};

export type BookingPaymentItem = {
  id: string;
  hotelId: string;
  reservationId?: string | null;
  groupCode?: string | null;
  stayId?: string | null;
  paymentType?: string;
  inputMode?: "AMOUNT" | "PERCENT";
  percentValue?: number | null;
  amount: number | string;
  currency?: string;
  paymentMethod: string;
  referenceCode?: string | null;
  notes?: string | null;
  createdAt?: string;
};

export type ListBookingPaymentsQuery = {
  reservationId?: string;
  groupCode?: string;
  stayId?: string;
  paymentType?: string;
  page?: number;
  limit?: number;
};

export type CreateBookingPaymentInput = {
  reservationId?: string;
  groupCode?: string;
  stayId?: string;
  paymentType?: "DEPOSIT" | "PREPAYMENT" | "ADJUSTMENT" | "REFUND" | string;
  inputMode?: "AMOUNT" | "PERCENT";
  percentValue?: number;
  amount?: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD" | "QR" | "EWALLET" | string;
  referenceCode?: string;
  notes?: string;
};

export type ReceivableItem = {
  id: string;
  hotelId: string;
  stayId?: string | null;
  reservationId?: string | null;
  groupCode?: string | null;
  debtorName: string;
  debtorType?: "INDIVIDUAL" | "COMPANY" | "AGENT" | "GROUP" | string;
  contactPhone?: string | null;
  amount: number | string;
  paidAmount?: number | string;
  balanceAmount?: number | string;
  status: "OPEN" | "PARTIALLY_PAID" | "SETTLED" | "WRITTEN_OFF" | string;
  dueDate?: string | null;
  notes?: string | null;
  createdAt?: string;
};

export type ListReceivablesQuery = {
  status?: string;
  debtorType?: string;
  q?: string;
  stayId?: string;
  reservationId?: string;
  groupCode?: string;
  page?: number;
  limit?: number;
};

export type TransferStayToReceivableInput = {
  debtorName: string;
  debtorType?: "INDIVIDUAL" | "COMPANY" | "AGENT" | "GROUP" | string;
  contactPhone?: string;
  taxCode?: string;
  companyName?: string;
  amount?: number;
  dueDate?: string;
  notes?: string;
};

export type CollectReceivableInput = {
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD" | "QR" | "EWALLET" | string;
  referenceCode?: string;
  notes?: string;
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

  async getReservationConfirmation(
    hotelId: string,
    reservationId: string,
    signal?: AbortSignal,
  ): Promise<ReservationConfirmationData> {
    const response = await requestInternalApiEnvelope<ReservationConfirmationData>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/confirmation`,
      {
        method: "GET",
        signal,
      },
    );
    return response.data;
  },

  async getGroupConfirmation(
    hotelId: string,
    groupCode: string,
    signal?: AbortSignal,
  ): Promise<GroupConfirmationData> {
    const response = await requestInternalApiEnvelope<GroupConfirmationData>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/groups/${encodeURIComponent(groupCode)}/confirmation`,
      {
        method: "GET",
        signal,
      },
    );
    return response.data;
  },

  async listGroupArrivals(
    hotelId: string,
    groupCode: string,
    signal?: AbortSignal,
  ): Promise<HotelArrivalReservationItem[]> {
    const trimmed = groupCode.trim();
    if (!trimmed) return [];
    const response = await requestInternalApiEnvelope<GroupBookingDetailResponse>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/groups/${encodeURIComponent(trimmed)}`,
      { method: "GET", signal },
    );
    const detail = response.data;
    const rooms = detail?.rooms ?? [];
    return rooms.map((room) => {
      const resolvedRoomId = room.assignedRoomId ?? room.roomId ?? room.room?.id ?? null;
      const resolvedRoomNumber =
        room.assignedRoomNumber ?? room.roomNumber ?? room.room?.roomNumber ?? null;
      const resolvedRoomType = room.roomTypeName ?? room.room?.type ?? null;
      const resolvedRate =
        room.ratePerNight ?? room.rate ?? room.nightlyRateSnapshot ?? room.nightlyRate ?? null;
      const resolvedActiveStayId = room.activeStayId ?? room.stayId ?? null;
      return {
        id: room.id ?? room.reservationId ?? room.reservationCode,
        hotelId,
        reservationCode: room.reservationCode,
        groupCode: room.groupCode ?? detail?.groupCode ?? trimmed,
        status: room.status,
        guestDisplayName: room.guestDisplayName ?? room.guestName ?? detail?.leadGuestName ?? "Khách đoàn",
        guestPhone: room.guestPhone ?? detail?.leadGuestPhone ?? null,
        plannedCheckInAt:
          room.plannedCheckInAt ??
          room.checkInDate ??
          detail?.plannedCheckInAt ??
          detail?.checkInDate ??
          "",
        plannedCheckOutAt:
          room.plannedCheckOutAt ??
          room.checkOutDate ??
          detail?.plannedCheckOutAt ??
          detail?.checkOutDate ??
          "",
        roomId: resolvedRoomId,
        room:
          resolvedRoomId || resolvedRoomNumber
            ? {
                id: resolvedRoomId ?? "",
                roomNumber: resolvedRoomNumber ?? "",
                type: resolvedRoomType,
                maxOccupancy: room.room?.maxOccupancy ?? room.guestCount ?? null,
              }
            : null,
        rate:
          resolvedRate !== null && resolvedRate !== undefined
            ? String(resolvedRate)
            : null,
        nightlyRateSnapshot:
          resolvedRate !== null && resolvedRate !== undefined
            ? String(resolvedRate)
            : null,
        notes: room.notes ?? detail?.notes ?? null,
        updatedAt: room.updatedAt ?? undefined,
        activeStayId: resolvedActiveStayId,
        assignedRoomId: resolvedRoomId,
        assignedRoomNumber: resolvedRoomNumber,
        roomTypeId: room.roomTypeId ?? null,
        roomTypeName: resolvedRoomType,
        guestCount: room.guestCount,
        ratePerNight: resolvedRate,
        totalAmount: room.totalAmount ?? null,
        depositAmount: room.depositAmount ?? null,
      };
    });
  },

  async getGroupDetails(
    hotelId: string,
    groupCode: string,
    signal?: AbortSignal,
  ): Promise<GroupBookingDetailResponse> {
    const response = await requestInternalApiEnvelope<GroupBookingDetailResponse>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/groups/${encodeURIComponent(groupCode.trim())}`,
      { method: "GET", signal },
    );
    return response.data;
  },

  async updateGroupSharedFields(
    hotelId: string,
    groupCode: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await requestInternalApiEnvelope<unknown>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/groups/${encodeURIComponent(groupCode.trim())}`,
      {
        method: "PATCH",
        body: payload,
        signal,
      },
    );
    return response.data;
  },

  async assignReservationRoom(
    hotelId: string,
    reservationId: string,
    payload: {
      roomId: string;
      nightlyRateSnapshot?: number;
      expectedUpdatedAt?: string;
      expectedRoomId?: string | null;
    },
    signal?: AbortSignal,
  ): Promise<HotelArrival> {
    const response = await requestInternalApiEnvelope<HotelArrival>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/room`,
      {
        method: "PUT",
        body: payload,
        signal,
      },
    );
    return response.data;
  },

  async cancelReservation(
    hotelId: string,
    reservationId: string,
    payload?: { reason?: string },
    signal?: AbortSignal,
  ): Promise<HotelArrival> {
    const response = await requestInternalApiEnvelope<HotelArrival>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/cancel`,
      {
        method: "POST",
        body: payload ?? {},
        signal,
      },
    );
    return response.data;
  },

  async markNoShowReservation(
    hotelId: string,
    reservationId: string,
    payload?: { reason?: string },
    signal?: AbortSignal,
  ): Promise<HotelArrival> {
    const response = await requestInternalApiEnvelope<HotelArrival>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/no-show`,
      {
        method: "POST",
        body: payload ?? {},
        signal,
      },
    );
    return response.data;
  },

  async listBookingPayments(
    hotelId: string,
    query?: ListBookingPaymentsQuery,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<BookingPaymentItem>> {
    const params = new URLSearchParams();
    if (query?.reservationId) params.set("reservationId", query.reservationId);
    if (query?.groupCode) params.set("groupCode", query.groupCode);
    if (query?.stayId) params.set("stayId", query.stayId);
    if (query?.paymentType) params.set("paymentType", query.paymentType);
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));

    const qs = params.toString();
    const response = await requestInternalApiEnvelope<
      HotelOpsPage<BookingPaymentItem> | BookingPaymentItem[]
    >(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/booking-payments${qs ? `?${qs}` : ""}`,
      { method: "GET", signal },
    );
    if (Array.isArray(response.data)) {
      return {
        items: response.data,
        total: response.data.length,
        page: 1,
        limit: response.data.length || 50,
      };
    }
    return response.data;
  },

  async createBookingPayment(
    hotelId: string,
    payload: CreateBookingPaymentInput,
    signal?: AbortSignal,
  ): Promise<BookingPaymentItem> {
    const response = await requestInternalApiEnvelope<BookingPaymentItem>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/booking-payments`,
      {
        method: "POST",
        body: payload,
        signal,
      },
    );
    return response.data;
  },

  async listReceivables(
    hotelId: string,
    query?: ListReceivablesQuery,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<ReceivableItem>> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.debtorType) params.set("debtorType", query.debtorType);
    if (query?.q?.trim()) params.set("q", query.q.trim());
    if (query?.stayId) params.set("stayId", query.stayId);
    if (query?.reservationId) params.set("reservationId", query.reservationId);
    if (query?.groupCode) params.set("groupCode", query.groupCode);
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));

    const qs = params.toString();
    const response = await requestInternalApiEnvelope<
      HotelOpsPage<ReceivableItem> | ReceivableItem[]
    >(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/receivables${qs ? `?${qs}` : ""}`,
      { method: "GET", signal },
    );
    if (Array.isArray(response.data)) {
      return {
        items: response.data,
        total: response.data.length,
        page: 1,
        limit: response.data.length || 50,
      };
    }
    return response.data;
  },

  async transferStayToReceivable(
    hotelId: string,
    stayId: string,
    payload: TransferStayToReceivableInput,
    signal?: AbortSignal,
  ): Promise<ReceivableItem> {
    const response = await requestInternalApiEnvelope<ReceivableItem>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/stays/${encodeURIComponent(stayId)}/transfer-to-receivable`,
      {
        method: "POST",
        body: payload,
        signal,
      },
    );
    return response.data;
  },

  async collectReceivable(
    hotelId: string,
    receivableId: string,
    payload: CollectReceivableInput,
    signal?: AbortSignal,
  ): Promise<ReceivableItem> {
    const response = await requestInternalApiEnvelope<ReceivableItem>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/receivables/${encodeURIComponent(receivableId)}/collect`,
      {
        method: "POST",
        body: payload,
        signal,
      },
    );
    return response.data;
  },

  async checkInReservation(
    hotelId: string,
    reservationId: string,
    payload?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ accessCode: string; stayId: string; idempotent?: boolean }> {
    const response = await requestInternalApiEnvelope<{
      accessCode: string;
      stayId: string;
      idempotent?: boolean;
    }>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(reservationId)}/check-in`,
      {
        method: "POST",
        body: payload ?? {},
        signal,
      },
    );
    return response.data;
  },

  async checkOutStay(
    hotelId: string,
    stayId: string,
    payload?: { nextRoomStatus?: "PROCESSING" | "MAINTENANCE" },
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await requestInternalApiEnvelope(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/stays/${encodeURIComponent(stayId)}/check-out`,
      {
        method: "POST",
        body: payload ?? {},
        signal,
      },
    );
    return response.data;
  },
};
