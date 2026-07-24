import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpMethod, type HttpQuery } from "@/core/http/http-client";
import { httpServer } from "@/core/http/http-server";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import type {
  CreateHotelStaffUserInput,
  HotelStaffAssignment,
  HotelStaffAssignmentsPage,
  HotelStaffUser,
  HotelStaffUsersPage,
  ManagedHotelRole,
} from "../types/staff-management-contract";

export class StaffManagementService {
  private readonly baseUrl: string;
  private readonly httpClient: HttpClient;

  constructor(options: { baseUrl: string; timeoutMs?: number }) {
    this.baseUrl = options.baseUrl;
    this.httpClient = new HttpClient(options);
  }

  private async request<TResponse, TBody = unknown>(options: {
    method: HttpMethod;
    path: string;
    body?: TBody;
    query?: HttpQuery;
    tenantId?: string;
    accessToken?: string;
  }): Promise<TResponse> {
    if (options.accessToken) {
      return this.httpClient.request<TResponse, TBody>({
        ...options,
      });
    }
    const tokens = await readServerSessionTokens();
    return httpServer.request<TResponse, TBody>(options.method, options.path, options.body, {
      baseUrl: this.baseUrl,
      query: options.query,
      tenantId: options.tenantId,
      accessToken: tokens.accessToken,
    });
  }

  async listUsers(options: { tenantId?: string; page?: number; limit?: number; q?: string; accessToken?: string } = {}) {
    const payload = await this.request<unknown>({
      method: "GET",
      path: "/hotel-users",
      tenantId: options.tenantId,
      query: {
        page: options.page ?? 1,
        limit: options.limit ?? 100,
        ...(options.q ? { q: options.q } : {}),
      },
      accessToken: options.accessToken,
    });
    return unwrapApiEnvelope<HotelStaffUsersPage>(payload).data;
  }

  async listManagedRoles(tenantId?: string, accessToken?: string) {
    const payload = await this.request<unknown>({
      method: "GET",
      path: "/hotel-users/managed-roles",
      tenantId,
      accessToken,
    });
    return unwrapApiEnvelope<ManagedHotelRole[]>(payload).data;
  }

  async createUser(body: CreateHotelStaffUserInput, tenantId?: string, accessToken?: string) {
    const payload = await this.request<unknown, CreateHotelStaffUserInput>({
      method: "POST",
      path: "/hotel-users",
      body,
      tenantId,
      accessToken,
    });
    return unwrapApiEnvelope<HotelStaffUser>(payload).data;
  }

  async assignRoles(userId: string, roleIds: string[], tenantId?: string, accessToken?: string) {
    const payload = await this.request<unknown, { roleIds: string[] }>({
      method: "POST",
      path: `/hotel-users/${encodeURIComponent(userId)}/roles`,
      body: { roleIds },
      tenantId,
      accessToken,
    });
    return unwrapApiEnvelope<HotelStaffUser>(payload).data;
  }

  async revokeRole(userId: string, roleId: string, tenantId?: string, accessToken?: string) {
    const payload = await this.request<unknown>({
      method: "DELETE",
      path: `/hotel-users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
      tenantId,
      accessToken,
    });
    return unwrapApiEnvelope<{ revoked: true; userId: string; roleId: string }>(payload).data;
  }

  async listAssignments(hotelId: string, accessToken?: string) {
    const payload = await this.request<unknown>({
      method: "GET",
      path: `/hotels/${encodeURIComponent(hotelId)}/staff-assignments`,
      query: { page: 1, limit: 100, status: "ACTIVE" },
      accessToken,
    });
    return unwrapApiEnvelope<HotelStaffAssignmentsPage>(payload).data;
  }

  async assignHotel(hotelId: string, userId: string, accessToken?: string) {
    const payload = await this.request<unknown>({
      method: "PUT",
      path: `/hotels/${encodeURIComponent(hotelId)}/staff-assignments/${encodeURIComponent(userId)}`,
      accessToken,
    });
    return unwrapApiEnvelope<HotelStaffAssignment>(payload).data;
  }

  async revokeHotel(hotelId: string, userId: string, accessToken?: string) {
    const payload = await this.request<unknown>({
      method: "DELETE",
      path: `/hotels/${encodeURIComponent(hotelId)}/staff-assignments/${encodeURIComponent(userId)}`,
      accessToken,
    });
    return unwrapApiEnvelope<{ revoked: true; hotelId: string; userId: string }>(payload).data;
  }
}
