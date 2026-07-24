import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpQuery, type HttpMethod } from "@/core/http/http-client";
import { httpServer } from "@/core/http/http-server";
import type {
  CreateHotelInput,
  Hotel,
  HotelListQuery,
  HotelsPage,
  TenantOption,
  TenantOwner,
  TenantOwnerCreateInput,
  TenantOwnerListQuery,
  TenantOwnerPage,
  TenantOwnerUpdateInput,
  UpdateHotelInput,
} from "@/features/admin/types/admin-contract";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export type AdminServiceOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export class AdminService {
  private readonly baseUrl: string;
  private readonly httpClient: HttpClient;

  constructor(options: AdminServiceOptions) {
    this.baseUrl = options.baseUrl;
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  private async authenticatedRequest<TResponse, TBody = unknown>(options: {
    method: HttpMethod;
    path: string;
    body?: TBody;
    query?: HttpQuery;
    accessToken?: string;
  }): Promise<TResponse> {
    if (options.accessToken) {
      return this.httpClient.request<TResponse, TBody>({
        method: options.method,
        path: options.path,
        body: options.body,
        query: options.query,
        accessToken: options.accessToken,
      });
    }

    const tokens = await readServerSessionTokens();

    return httpServer.request<TResponse, TBody>(options.method, options.path, options.body, {
      baseUrl: this.baseUrl,
      query: options.query,
      accessToken: tokens.accessToken,
    });
  }

  async listTenantOwners(options: { query?: TenantOwnerListQuery; accessToken?: string } = {}): Promise<TenantOwnerPage> {
    const payload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: "/tenant-owners",
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
    });

    return unwrapApiEnvelope<TenantOwnerPage>(payload).data;
  }

  async listTenantOptions(accessToken?: string): Promise<TenantOption[]> {
    const payload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: "/tenant-owners/tenant-options",
      accessToken,
    });

    return unwrapApiEnvelope<TenantOption[]>(payload).data;
  }

  async getTenantOwner(tenantOwnerId: string, accessToken?: string): Promise<TenantOwner> {
    const payload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: `/tenant-owners/${encodeURIComponent(tenantOwnerId)}`,
      accessToken,
    });

    return unwrapApiEnvelope<TenantOwner>(payload).data;
  }

  async createTenantOwner(body: TenantOwnerCreateInput, accessToken?: string): Promise<TenantOwner> {
    const payload = await this.authenticatedRequest<unknown, TenantOwnerCreateInput>({
      method: "POST",
      path: "/tenant-owners",
      body,
      accessToken,
    });

    return unwrapApiEnvelope<TenantOwner>(payload).data;
  }

  async updateTenantOwner(tenantOwnerId: string, body: TenantOwnerUpdateInput, accessToken?: string): Promise<TenantOwner> {
    const payload = await this.authenticatedRequest<unknown, TenantOwnerUpdateInput>({
      method: "PATCH",
      path: `/tenant-owners/${encodeURIComponent(tenantOwnerId)}`,
      body,
      accessToken,
    });

    return unwrapApiEnvelope<TenantOwner>(payload).data;
  }

  async listHotels(options: { query?: HotelListQuery; accessToken?: string } = {}): Promise<HotelsPage> {
    const payload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: "/hotels",
      query: options.query as HttpQuery,
      accessToken: options.accessToken,
    });

    return unwrapApiEnvelope<HotelsPage>(payload).data;
  }

  async createHotel(body: CreateHotelInput, accessToken?: string): Promise<Hotel> {
    const payload = await this.authenticatedRequest<unknown, CreateHotelInput>({
      method: "POST",
      path: "/hotels",
      body,
      accessToken,
    });

    return unwrapApiEnvelope<Hotel>(payload).data;
  }

  async getHotel(hotelId: string, accessToken?: string): Promise<Hotel> {
    const payload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: `/hotels/${encodeURIComponent(hotelId)}`,
      accessToken,
    });

    return unwrapApiEnvelope<Hotel>(payload).data;
  }

  async updateHotel(hotelId: string, body: UpdateHotelInput, accessToken?: string): Promise<Hotel> {
    const payload = await this.authenticatedRequest<unknown, UpdateHotelInput>({
      method: "PATCH",
      path: `/hotels/${encodeURIComponent(hotelId)}`,
      body,
      accessToken,
    });

    return unwrapApiEnvelope<Hotel>(payload).data;
  }
}

export function createAdminService(options: AdminServiceOptions): AdminService {
  return new AdminService(options);
}
