import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

export interface ChannexResponse<T = any> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    page?: number;
    order_by?: string;
    order_direction?: string;
    message?: string;
  };
}

export interface ChannexPropertyPayload {
  title: string;
  currency: string; // ISO 4217 (VND, USD, etc.)
  email?: string;
  phone?: string;
  website?: string;
  country?: string; // 2-letter ISO (VN, US)
  state?: string;
  city?: string;
  address?: string;
  zip_code?: string;
  timezone?: string; // IANA (Asia/Ho_Chi_Minh)
  content?: {
    description?: string;
    important_information?: string;
    photos?: Array<{
      url: string;
      position: number;
      description?: string;
      author?: string;
      kind: "photo" | "ad" | "menu";
    }>;
  };
}

export interface ChannexRoomTypePayload {
  property_id: string;
  title: string;
  count_of_rooms: number;
  occ_adults?: number;
  occ_children?: number;
  occ_infants?: number;
  default_occupancy?: number;
  room_kind?: "room" | "dorm";
  content?: {
    description?: string;
    photos?: Array<{
      url: string;
      position: number;
      description?: string;
      author?: string;
      kind: "photo" | "ad" | "menu";
    }>;
  };
}

export interface ChannexRatePlanOption {
  occupancy: number;
  is_primary: boolean;
  rate: number; // minor units on write
}

export interface ChannexRatePlanPayload {
  property_id: string;
  room_type_id: string;
  title: string;
  currency: string;
  sell_mode?: "per_room" | "per_person";
  rate_mode?: "manual" | "derived" | "auto" | "cascade";
  options: ChannexRatePlanOption[]; // REQUIRED on staging and prod
}

export interface ChannexAvailabilityValue {
  property_id: string;
  room_type_id: string;
  date?: string; // YYYY-MM-DD
  date_from?: string; // YYYY-MM-DD
  date_to?: string; // YYYY-MM-DD
  availability: number;
}

export interface ChannexRestrictionValue {
  property_id: string;
  rate_plan_id: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  rate?: number; // minor units (e.g. integer VND)
  rates?: Array<{ occupancy: number; rate: number }>; // for per_person sell_mode
  min_stay_arrival?: number;
  min_stay_through?: number;
  max_stay?: number;
  stop_sell?: boolean;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
}

export interface ChannexRevisionAttribute {
  booking_id: string;
  status: "new" | "modified" | "cancelled";
  property_id: string;
  ota_name?: string;
  ota_reservation_code?: string;
  arrival_date: string;
  departure_date: string;
  amount: string; // decimal string in major units, e.g. "2500000.00"
  currency: string;
  payment_collect?: "ota" | "property";
  customer?: {
    name?: string;
    surname?: string;
    mail?: string;
    phone?: string;
    country?: string;
    address?: string;
  };
  rooms?: Array<{
    checkin_date: string;
    checkout_date: string;
    room_type_id: string;
    rate_plan_id: string;
    amount: string;
    occupancy?: {
      adults?: number;
      children?: number;
      infants?: number;
    };
    days?: Record<string, string>;
    guests?: any[];
  }>;
}

export interface ChannexRevisionItem {
  id: string; // revision UUID
  type: string;
  attributes: ChannexRevisionAttribute;
}

export interface ChannexChannelAdapterParam {
  position: number;
  type: string;
  title?: string;
  default?: string | boolean | number;
  options?: string[];
  rules?: Array<{
    apply: string;
    when: string | boolean;
    influence_field: string;
    with_value: string;
  }>;
}

export interface ChannexChannelAdapter {
  code: string;
  title: string;
  params: Record<string, ChannexChannelAdapterParam>;
  kind: "ota" | "meta" | "cm";
  actions: string[];
  mapping_mode: string | null;
  message_support: boolean;
  property_mapping: string | null;
  rate_params?: Record<string, ChannexChannelAdapterParam> | null;
}

export type ChannexChannelAdapterResource =
  ChannexChannelAdapter | { attributes: ChannexChannelAdapter };

export interface ChannexChannelConnectionResource {
  id?: string;
  channel?: string;
  title?: string;
  currency?: string | null;
  is_active?: boolean;
  attributes?: {
    id?: string;
    channel?: string;
    title?: string;
    currency?: string | null;
    is_active?: boolean;
  };
}

export interface ChannexPropertyResource {
  id?: string;
  title?: string;
  currency?: string;
  attributes?: { title?: string; currency?: string };
  relationships?: {
    groups?: Array<{ id?: string }> | { data?: Array<{ id?: string }> };
  };
}

export interface ChannexRatePlanOptionResource {
  id?: string;
  title?: string;
  room_type_id?: string;
  attributes?: {
    id?: string;
    title?: string;
    room_type_id?: string;
    occupancy?: number;
  };
  relationships?: { room_type?: { data?: { id?: string } } };
}

export interface ChannexCreatedChannelResource {
  id?: string;
  attributes?: { id?: string; is_active?: boolean };
}

@Injectable()
export class ChannexApiClient {
  private readonly logger = new Logger(ChannexApiClient.name);
  private readonly defaultBaseUrl: string;
  private readonly defaultApiKey?: string;

  constructor() {
    const configuredBaseUrl =
      process.env.CHANNEX_BASE_URL?.trim() || "https://staging.channex.io/api/v1";
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new Error("CHANNEX_BASE_URL không hợp lệ");
    }

    const allowedHosts = new Set(["staging.channex.io", "app.channex.io"]);
    if (
      parsedBaseUrl.protocol !== "https:" ||
      !allowedHosts.has(parsedBaseUrl.hostname) ||
      parsedBaseUrl.pathname.replace(/\/$/, "") !== "/api/v1" ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash
    ) {
      throw new Error("CHANNEX_BASE_URL không hợp lệ");
    }

    this.defaultBaseUrl = parsedBaseUrl.toString().replace(/\/$/, "");
    this.defaultApiKey = process.env.CHANNEX_API_KEY?.trim() || undefined;
  }

  getBaseUrl(): string {
    return this.defaultBaseUrl;
  }

  getEffectiveApiKey(overrideApiKey?: string): string {
    const key = overrideApiKey?.trim() || this.defaultApiKey;
    if (!key) {
      throw new BadRequestException("Channex API key chưa được cấu hình");
    }
    return key;
  }

  /**
   * Generic HTTP request caller targeting Channex REST API v1
   */
  async request<T = any>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: any;
      query?: Record<string, string | number | boolean | undefined>;
      apiKey?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<ChannexResponse<T>> {
    const apiKey = this.getEffectiveApiKey(options.apiKey);
    let url = `${this.defaultBaseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    if (options.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }

    const headers: Record<string, string> = {
      "user-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const method = options.method || "GET";
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const timeoutMs = options.timeoutMs || 25000;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });

      const responseText = await response.text();
      let responseJson: any = null;
      if (responseText) {
        try {
          responseJson = JSON.parse(responseText);
        } catch {
          responseJson = { raw: responseText };
        }
      }

      if (!response.ok) {
        const errorDetails = responseJson?.errors || responseJson?.error || responseText;
        let formattedMessage = `Channex API ${method} ${endpoint} lỗi (HTTP ${response.status})`;

        if (responseJson?.errors) {
          const { code, title, details } = responseJson.errors;
          const detailStr = Array.isArray(details)
            ? details.join(", ")
            : typeof details === "object"
              ? JSON.stringify(details)
              : details || "";
          formattedMessage = `${title || code || "Lỗi"}${detailStr ? `: ${detailStr}` : ""}`;
        }

        this.logger.error(`[Channex API Error] ${method} ${url}: ${JSON.stringify(errorDetails)}`);
        if (response.status === 404) {
          throw new NotFoundException(formattedMessage);
        }
        throw new BadRequestException(formattedMessage);
      }

      return responseJson as ChannexResponse<T>;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error(`[Channex HTTP Call Failed] ${method} ${url}: ${err.message}`);
      throw new InternalServerErrorException(
        `Không thể kết nối đến máy chủ Channex: ${err.message}`,
      );
    }
  }

  // ================= CONTENT ENTITIES ================= //

  async getProperties(apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/properties", { apiKey });
  }

  async getProperty(
    propertyId: string,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexPropertyResource>> {
    return this.request<ChannexPropertyResource>(`/properties/${propertyId}`, { apiKey });
  }

  async createProperty(
    property: ChannexPropertyPayload,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/properties", {
      method: "POST",
      body: { property },
      apiKey,
    });
  }

  async updateProperty(
    propertyId: string,
    property: Partial<ChannexPropertyPayload>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>(`/properties/${propertyId}`, {
      method: "PUT",
      body: { property },
      apiKey,
    });
  }

  async getRoomTypes(propertyId: string, apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/room_types", {
      query: { "filter[property_id]": propertyId },
      apiKey,
    });
  }

  async createRoomType(
    roomType: ChannexRoomTypePayload,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/room_types", {
      method: "POST",
      body: { room_type: roomType },
      apiKey,
    });
  }

  async updateRoomType(
    roomTypeId: string,
    roomType: Partial<ChannexRoomTypePayload>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>(`/room_types/${roomTypeId}`, {
      method: "PUT",
      body: { room_type: roomType },
      apiKey,
    });
  }

  async getRatePlans(propertyId: string, apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/rate_plans", {
      query: { "filter[property_id]": propertyId },
      apiKey,
    });
  }

  async getRatePlanOptions(
    propertyId: string,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexRatePlanOptionResource[]>> {
    return this.request<ChannexRatePlanOptionResource[]>("/rate_plans/options", {
      query: {
        "filter[property_id]": propertyId,
        multi_occupancy: true,
      },
      apiKey,
    });
  }

  async createRatePlan(
    ratePlan: ChannexRatePlanPayload,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/rate_plans", {
      method: "POST",
      body: { rate_plan: ratePlan },
      apiKey,
    });
  }

  async updateRatePlan(
    ratePlanId: string,
    ratePlan: Partial<ChannexRatePlanPayload>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>(`/rate_plans/${ratePlanId}`, {
      method: "PUT",
      body: { rate_plan: ratePlan },
      apiKey,
    });
  }

  async deleteRatePlan(ratePlanId: string, apiKey?: string): Promise<ChannexResponse<any>> {
    return this.request<any>(`/rate_plans/${ratePlanId}`, {
      method: "DELETE",
      apiKey,
    });
  }

  // ================= ARI (AVAILABILITY & RESTRICTIONS) ================= //

  async postAvailability(
    values: ChannexAvailabilityValue[],
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/availability", {
      method: "POST",
      body: { values },
      apiKey,
    });
  }

  async getAvailability(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
    apiKey?: string,
  ): Promise<ChannexResponse<Record<string, Record<string, number>>>> {
    return this.request<Record<string, Record<string, number>>>("/availability", {
      query: {
        "filter[property_id]": propertyId,
        "filter[date][gte]": dateFrom,
        "filter[date][lte]": dateTo,
      },
      apiKey,
    });
  }

  async postRestrictions(
    values: ChannexRestrictionValue[],
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/restrictions", {
      method: "POST",
      body: { values },
      apiKey,
    });
  }

  async getRestrictions(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
    restrictions: string = "rate,min_stay_arrival,stop_sell,closed_to_arrival,closed_to_departure",
    apiKey?: string,
  ): Promise<ChannexResponse<Record<string, Record<string, any>>>> {
    return this.request<Record<string, Record<string, any>>>("/restrictions", {
      query: {
        "filter[property_id]": propertyId,
        "filter[date][gte]": dateFrom,
        "filter[date][lte]": dateTo,
        "filter[restrictions]": restrictions,
      },
      apiKey,
    });
  }

  // ================= BOOKINGS & REVISION FEED ================= //

  async getBookingFeed(
    limit: number = 10,
    apiKey?: string,
    propertyId?: string,
  ): Promise<ChannexResponse<ChannexRevisionItem[]>> {
    return this.request<ChannexRevisionItem[]>("/booking_revisions/feed", {
      query: {
        limit,
        ...(propertyId ? { "filter[property_id]": propertyId } : {}),
      },
      apiKey,
    });
  }

  async getBookingRevision(
    revisionId: string,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexRevisionItem>> {
    return this.request<ChannexRevisionItem>(`/booking_revisions/${revisionId}`, { apiKey });
  }

  async ackBookingRevision(revisionId: string, apiKey?: string): Promise<ChannexResponse<any>> {
    return this.request<any>(`/booking_revisions/${revisionId}/ack`, {
      method: "POST",
      body: {},
      apiKey,
    });
  }

  async getBookings(
    filter: Record<string, string> = {},
    apiKey?: string,
  ): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/bookings", {
      query: filter,
      apiKey,
    });
  }

  async createBooking(payload: any, apiKey?: string): Promise<ChannexResponse<any>> {
    return this.request<any>("/bookings", {
      method: "POST",
      body: payload,
      apiKey,
    });
  }

  // ================= CHANNEL API & WEBHOOKS ================= //

  async createChannelOneTimeToken(input: {
    property_id: string;
    group_id?: string;
    username: string;
  }): Promise<ChannexResponse<{ token: string }>> {
    return this.request<{ token: string }>("/auth/one_time_token", {
      method: "POST",
      body: { one_time_token: input },
    });
  }

  async getChannelAdapters(
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexChannelAdapterResource[]>> {
    return this.request<ChannexChannelAdapterResource[]>("/channels/list", {
      apiKey,
    });
  }

  async getChannelAdapter(
    code: string,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexChannelAdapterResource>> {
    return this.request<ChannexChannelAdapterResource>("/channels/adapter", {
      query: { code },
      apiKey,
    });
  }

  async getChannels(
    propertyId: string,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexChannelConnectionResource[]>> {
    return this.request<ChannexChannelConnectionResource[]>("/channels", {
      query: {
        "filter[property_id]": propertyId,
        "pagination[limit]": 100,
      },
      apiKey,
    });
  }

  async testChannelConnection(
    channel: string,
    settings: Record<string, string | number | boolean>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/channels/test_connection", {
      method: "POST",
      body: { channel, settings },
      apiKey,
    });
  }

  async getChannelConnectionDetails(
    channel: string,
    settings: Record<string, string | number | boolean>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/channels/connection_details", {
      method: "POST",
      body: { channel, settings },
      apiKey,
    });
  }

  async getChannelMappingDetails(
    channel: string,
    settings: Record<string, string | number | boolean>,
    apiKey?: string,
  ): Promise<ChannexResponse<any>> {
    return this.request<any>("/channels/mapping_details", {
      method: "POST",
      body: { channel, settings },
      apiKey,
    });
  }

  async createChannel(
    channel: Record<string, unknown>,
    apiKey?: string,
  ): Promise<ChannexResponse<ChannexCreatedChannelResource>> {
    return this.request<ChannexCreatedChannelResource>("/channels", {
      method: "POST",
      body: { channel },
      apiKey,
    });
  }

  async checkChannelReadiness(channelId: string, apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>(`/channels/${channelId}/check_readiness`, {
      method: "POST",
      body: {},
      apiKey,
    });
  }

  async activateChannel(channelId: string, apiKey?: string): Promise<ChannexResponse<any>> {
    return this.request<any>(`/channels/${channelId}/activate`, {
      method: "POST",
      body: {},
      apiKey,
    });
  }

  async getGroups(apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/groups", { apiKey });
  }

  async getWebhooks(apiKey?: string): Promise<ChannexResponse<any[]>> {
    return this.request<any[]>("/webhooks", { apiKey });
  }

  async registerWebhook(input: {
    callbackUrl: string;
    propertyId: string;
    headers: Record<string, string>;
    eventMask?: string;
  }): Promise<ChannexResponse<any>> {
    return this.request<any>("/webhooks", {
      method: "POST",
      body: {
        webhook: {
          callback_url: input.callbackUrl,
          event_mask: input.eventMask ?? "booking_new;booking_modification;booking_cancellation",
          property_id: input.propertyId,
          headers: input.headers,
          is_active: true,
          send_data: true,
        },
      },
    });
  }
}
