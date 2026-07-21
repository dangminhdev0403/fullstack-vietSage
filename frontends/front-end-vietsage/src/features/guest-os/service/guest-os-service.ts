import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpQuery } from "@/core/http/http-client";
import type {
  CancelGuestRequestResult,
  CreateGuestEmergencyCallInput,
  CreateGuestRequestInput,
  GuestCategoryServicesResult,
  GuestEmergencyCallResult,
  GuestCurrentSessionResult,
  GuestLocaleCode,
  GuestMessagesResult,
  GuestMessageThread,
  GuestRequest,
  GuestRequestsResult,
  GuestScanQrRequest,
  GuestScanQrResult,
  GuestServicesResult,
  GuestSessionCloseResult,
  ListGuestRequestsQuery,
} from "@/features/guest-os/types/guest-os-contract";

export type GuestOsServiceOptions = {
  baseUrl: string;
  pathPrefix?: string;
  timeoutMs?: number;
};

function localeHeaders(locale?: GuestLocaleCode): Record<string, string> | undefined {
  return locale ? { "Accept-Language": locale, "x-lang": locale } : undefined;
}

export class GuestOsService {
  private readonly httpClient: HttpClient;
  private readonly pathPrefix: string;

  constructor(options: GuestOsServiceOptions) {
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
    this.pathPrefix = options.pathPrefix?.replace(/\/$/, "") ?? "";
  }

  private path(pathname: string): string {
    return `${this.pathPrefix}${pathname}`;
  }

  async scanQr(input: GuestScanQrRequest): Promise<GuestScanQrResult> {
    const { locale, ...body } = input;
    const payload = await this.httpClient.request<unknown, Omit<GuestScanQrRequest, "locale">>({
      method: "POST",
      path: this.path("/guest/qr/scan"),
      body,
      headers: localeHeaders(locale),
      isPublic: true,
    });

    return unwrapApiEnvelope<GuestScanQrResult>(payload).data;
  }

  async getCurrentSession(sessionToken: string, locale?: GuestLocaleCode): Promise<GuestCurrentSessionResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: this.path("/guest/session/me"),
      accessToken: sessionToken,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestCurrentSessionResult>(payload).data;
  }

  async listServices(sessionToken: string, locale?: GuestLocaleCode): Promise<GuestServicesResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: this.path("/guest/services"),
      accessToken: sessionToken,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestServicesResult>(payload).data;
  }

  async listServicesByCategory(sessionToken: string, categoryId: string, query: { page?: number; limit?: number } = {}, locale?: GuestLocaleCode): Promise<GuestCategoryServicesResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: this.path(`/guest/service-categories/${encodeURIComponent(categoryId)}/services`),
      accessToken: sessionToken,
      query: query as HttpQuery,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestCategoryServicesResult>(payload).data;
  }

  async createRequest(sessionToken: string, input: CreateGuestRequestInput, locale?: GuestLocaleCode): Promise<GuestRequest> {
    const payload = await this.httpClient.request<unknown, CreateGuestRequestInput>({
      method: "POST",
      path: this.path("/guest/requests"),
      accessToken: sessionToken,
      body: input,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestRequest>(payload).data;
  }

  async listRequests(sessionToken: string, query: ListGuestRequestsQuery = {}, locale?: GuestLocaleCode): Promise<GuestRequestsResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path: this.path("/guest/requests"),
      accessToken: sessionToken,
      query: query as HttpQuery,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestRequestsResult>(payload).data;
  }

  async cancelRequest(sessionToken: string, requestId: string, locale?: GuestLocaleCode): Promise<CancelGuestRequestResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "PATCH",
      path: this.path(`/guest/requests/${encodeURIComponent(requestId)}/cancel`),
      accessToken: sessionToken,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<CancelGuestRequestResult>(payload).data;
  }

  async closeSession(sessionToken: string, locale?: GuestLocaleCode): Promise<GuestSessionCloseResult> {
    const payload = await this.httpClient.request<unknown>({
      method: "POST",
      path: this.path("/guest/session/close"),
      accessToken: sessionToken,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestSessionCloseResult>(payload).data;
  }

  async listMessages(
    sessionToken: string,
    options?: { before?: string; limit?: number },
    locale?: GuestLocaleCode,
  ): Promise<GuestMessagesResult> {
    const params = new URLSearchParams();
    if (options?.before) params.set("before", options.before);
    if (options?.limit) params.set("limit", String(options.limit));

    const queryString = params.toString();
    const path = this.path(`/guest/messages${queryString ? `?${queryString}` : ""}`);
    const payload = await this.httpClient.request<unknown>({
      method: "GET",
      path,
      accessToken: sessionToken,
      headers: localeHeaders(locale),
    });
    return unwrapApiEnvelope<GuestMessagesResult>(payload).data;
  }

  async sendMessage(sessionToken: string, body: string, locale?: GuestLocaleCode): Promise<{ thread: GuestMessageThread; message: GuestMessagesResult["items"][number] }> {
    const payload = await this.httpClient.request<unknown, { body: string }>({ method: "POST", path: this.path("/guest/messages"), accessToken: sessionToken, body: { body }, headers: localeHeaders(locale) });
    return unwrapApiEnvelope<{ thread: GuestMessageThread; message: GuestMessagesResult["items"][number] }>(payload).data;
  }

  async createEmergencyCall(
    sessionToken: string,
    input: CreateGuestEmergencyCallInput,
    locale?: GuestLocaleCode,
  ): Promise<GuestEmergencyCallResult> {
    const payload = await this.httpClient.request<unknown, CreateGuestEmergencyCallInput>({
      method: "POST",
      path: this.path("/emergency/guest/calls"),
      accessToken: sessionToken,
      body: input,
      headers: localeHeaders(locale),
    });

    return unwrapApiEnvelope<GuestEmergencyCallResult>(payload).data;
  }
}

export function createGuestOsService(options: GuestOsServiceOptions): GuestOsService {
  return new GuestOsService(options);
}
