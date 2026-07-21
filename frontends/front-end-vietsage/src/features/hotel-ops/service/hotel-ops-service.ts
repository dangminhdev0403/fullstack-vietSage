import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpQuery } from "@/core/http/http-client";
import type {
  CreateHotelRequestEventInput,
  CreateHotelRoomInput,
  CreateHotelStayInput,
  CreateServiceCategoryInput,
  CreateServiceItemInput,
  HotelCheckInResult,
  HotelDashboard,
  HotelGuestRequest,
  HotelArrival,
  HotelOpsPage,
  HotelRoomSummary,
  HotelRequestEvent,
  HotelReservationCheckInResult,
  HotelReservationInput,
  HotelServiceCategory,
  HotelServiceItem,
  HotelStaySummary,
  ListHotelRoomsQuery,
  ListHotelArrivalsQuery,
  ListHotelRequestsQuery,
  ListServiceCategoriesQuery,
  ListServiceItemsQuery,
  StaffRequestListItem,
  StaffRequestSummaryResponse,
  UpdateHotelRequestAssignmentInput,
  UpdateHotelRequestStatusInput,
  UpdateHotelRoomInput,
  UpdateServiceCategoryInput,
  UpdateServiceItemInput,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type HotelOpsServiceOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

type AuthRequestOptions = {
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
};

function hotelPath(hotelId: string, suffix: string): string {
  return `/hotels/${encodeURIComponent(hotelId)}${suffix}`;
}

export class HotelOpsService {
  private readonly httpClient: HttpClient;

  constructor(options: HotelOpsServiceOptions) {
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  async issueRequestRealtimeTicket(hotelId: string, accessToken?: string): Promise<{ ticket: string; expiresAt: string }> {
    const payload = await this.httpClient.request<unknown>({ method: "POST", path: hotelPath(hotelId, "/request-realtime-ticket"), accessToken });
    return unwrapApiEnvelope<{ ticket: string; expiresAt: string }>(payload).data;
  }

  async getDashboard(hotelId: string, options: AuthRequestOptions = {}): Promise<HotelDashboard> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/dashboard"),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelDashboard>(payload).data;
  }

  async listRooms(
    hotelId: string,
    options: { query?: ListHotelRoomsQuery } & AuthRequestOptions = {},
  ): Promise<HotelOpsPage<HotelRoomSummary>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/rooms"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelOpsPage<HotelRoomSummary>>(payload).data;
  }

  async listArrivals(
    hotelId: string,
    options: { query: ListHotelArrivalsQuery } & AuthRequestOptions,
  ): Promise<HotelOpsPage<HotelArrival>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/arrivals"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });
    return unwrapApiEnvelope<HotelOpsPage<HotelArrival>>(payload).data;
  }

  async createReservation(
    hotelId: string,
    body: HotelReservationInput,
    accessToken?: string,
  ): Promise<HotelArrival> {
    const payload = await this.httpClient.request<unknown, HotelReservationInput>({
      method: "POST",
      path: hotelPath(hotelId, "/reservations"),
      body,
      accessToken,
    });
    return unwrapApiEnvelope<HotelArrival>(payload).data;
  }

  async assignReservationRoom(
    hotelId: string,
    reservationId: string,
    roomId: string,
    accessToken?: string,
  ): Promise<HotelArrival> {
    const payload = await this.httpClient.request<unknown, { roomId: string }>({
      method: "PUT",
      path: hotelPath(hotelId, `/reservations/${encodeURIComponent(reservationId)}/room`),
      body: { roomId },
      accessToken,
    });
    return unwrapApiEnvelope<HotelArrival>(payload).data;
  }

  async checkInReservation(
    hotelId: string,
    reservationId: string,
    accessToken?: string,
  ): Promise<HotelReservationCheckInResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/reservations/${encodeURIComponent(reservationId)}/check-in`),
      accessToken,
    });
    return unwrapApiEnvelope<HotelReservationCheckInResult>(payload).data;
  }

  async createRoom(
    hotelId: string,
    body: CreateHotelRoomInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelRoomSummary> {
    const payload = await this.httpClient.request<unknown, CreateHotelRoomInput>({
      method: "POST",
      path: hotelPath(hotelId, "/rooms"),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelRoomSummary>(payload).data;
  }

  async updateRoom(
    hotelId: string,
    roomId: string,
    body: UpdateHotelRoomInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelRoomSummary> {
    const payload = await this.httpClient.request<unknown, UpdateHotelRoomInput>({
      method: "PATCH",
      path: hotelPath(hotelId, `/rooms/${encodeURIComponent(roomId)}`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelRoomSummary>(payload).data;
  }

  async rotateRoomQr(hotelId: string, roomId: string, accessToken?: string, accessTokenExpiresAt?: number | null): Promise<HotelRoomSummary> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/rooms/${encodeURIComponent(roomId)}/qr/rotate`),
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelRoomSummary>(payload).data;
  }

  async setRoomQrActive(
    hotelId: string,
    roomId: string,
    active: boolean,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelRoomSummary> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/rooms/${encodeURIComponent(roomId)}/qr/${active ? "activate" : "deactivate"}`),
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelRoomSummary>(payload).data;
  }

  async createStay(
    hotelId: string,
    body: CreateHotelStayInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelStaySummary> {
    const payload = await this.httpClient.request<unknown, CreateHotelStayInput>({
      method: "POST",
      path: hotelPath(hotelId, "/stays"),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelStaySummary>(payload).data;
  }

  async checkInStay(hotelId: string, stayId: string, accessToken?: string, accessTokenExpiresAt?: number | null): Promise<HotelStaySummary> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/stays/${encodeURIComponent(stayId)}/check-in`),
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelStaySummary>(payload).data;
  }

  async createAndCheckInStay(
    hotelId: string,
    body: CreateHotelStayInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelCheckInResult> {
    const payload = await this.httpClient.request<unknown, CreateHotelStayInput>({
      method: "POST",
      path: hotelPath(hotelId, "/stays/check-in"),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelCheckInResult>(payload).data;
  }

  async checkOutStay(hotelId: string, stayId: string, accessToken?: string, accessTokenExpiresAt?: number | null): Promise<HotelStaySummary> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, `/stays/${encodeURIComponent(stayId)}/check-out`),
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelStaySummary>(payload).data;
  }

  async syncServiceCatalogFromGoogleSheets(hotelId: string, options: AuthRequestOptions = {}) {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: hotelPath(hotelId, "/service-catalog/sync"),
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope(payload);
  }

  async listServiceCategories(
    hotelId: string,
    options: { query?: ListServiceCategoriesQuery } & AuthRequestOptions = {},
  ): Promise<HotelOpsPage<HotelServiceCategory>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/service-categories"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelOpsPage<HotelServiceCategory>>(payload).data;
  }

  async createServiceCategory(
    hotelId: string,
    body: CreateServiceCategoryInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelServiceCategory> {
    const payload = await this.httpClient.request<unknown, CreateServiceCategoryInput>({
      method: "POST",
      path: hotelPath(hotelId, "/service-categories"),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelServiceCategory>(payload).data;
  }

  async updateServiceCategory(
    hotelId: string,
    categoryId: string,
    body: UpdateServiceCategoryInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelServiceCategory> {
    const payload = await this.httpClient.request<unknown, UpdateServiceCategoryInput>({
      method: "PATCH",
      path: hotelPath(hotelId, `/service-categories/${encodeURIComponent(categoryId)}`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelServiceCategory>(payload).data;
  }

  async listServiceItems(
    hotelId: string,
    options: { query?: ListServiceItemsQuery } & AuthRequestOptions = {},
  ): Promise<HotelOpsPage<HotelServiceItem>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/service-items"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelOpsPage<HotelServiceItem>>(payload).data;
  }

  async createServiceItem(
    hotelId: string,
    body: CreateServiceItemInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelServiceItem> {
    const payload = await this.httpClient.request<unknown, CreateServiceItemInput>({
      method: "POST",
      path: hotelPath(hotelId, "/service-items"),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelServiceItem>(payload).data;
  }

  async updateServiceItem(
    hotelId: string,
    itemId: string,
    body: UpdateServiceItemInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelServiceItem> {
    const payload = await this.httpClient.request<unknown, UpdateServiceItemInput>({
      method: "PATCH",
      path: hotelPath(hotelId, `/service-items/${encodeURIComponent(itemId)}`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelServiceItem>(payload).data;
  }

  async listRequests(
    hotelId: string,
    options: { query?: ListHotelRequestsQuery } & AuthRequestOptions = {},
  ): Promise<HotelOpsPage<StaffRequestListItem>> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/requests"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelOpsPage<StaffRequestListItem>>(payload).data;
  }

  async getRequestsSummary(
    hotelId: string,
    options: { query?: Pick<ListHotelRequestsQuery, "q" | "roomNumber" | "serviceItemId" | "priority" | "assignedToUserId"> } & AuthRequestOptions = {},
  ): Promise<StaffRequestSummaryResponse> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, "/requests/summary"),
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
      accessTokenExpiresAt: options.accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<StaffRequestSummaryResponse>(payload).data;
  }

  async getRequest(hotelId: string, requestId: string, accessToken?: string, accessTokenExpiresAt?: number | null): Promise<HotelGuestRequest> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: hotelPath(hotelId, `/requests/${encodeURIComponent(requestId)}`),
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelGuestRequest>(payload).data;
  }

  async updateRequestStatus(
    hotelId: string,
    requestId: string,
    body: UpdateHotelRequestStatusInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelGuestRequest> {
    const payload = await this.httpClient.request<unknown, UpdateHotelRequestStatusInput>({
      method: "PATCH",
      path: hotelPath(hotelId, `/requests/${encodeURIComponent(requestId)}/status`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelGuestRequest>(payload).data;
  }

  async updateRequestAssignment(
    hotelId: string,
    requestId: string,
    body: UpdateHotelRequestAssignmentInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelGuestRequest> {
    const payload = await this.httpClient.request<unknown, UpdateHotelRequestAssignmentInput>({
      method: "PATCH",
      path: hotelPath(hotelId, `/requests/${encodeURIComponent(requestId)}/assignment`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelGuestRequest>(payload).data;
  }

  async createRequestEvent(
    hotelId: string,
    requestId: string,
    body: CreateHotelRequestEventInput,
    accessToken?: string,
    accessTokenExpiresAt?: number | null,
  ): Promise<HotelRequestEvent> {
    const payload = await this.httpClient.request<unknown, CreateHotelRequestEventInput>({
      method: "POST",
      path: hotelPath(hotelId, `/requests/${encodeURIComponent(requestId)}/events`),
      body,
      accessToken,
      accessTokenExpiresAt,
    });

    return unwrapApiEnvelope<HotelRequestEvent>(payload).data;
  }
}

export function createHotelOpsService(options: HotelOpsServiceOptions): HotelOpsService {
  return new HotelOpsService(options);
}
