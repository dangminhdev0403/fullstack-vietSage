import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import type {
  CreateAssignedHotelStaffUserInput,
  StaffDirectorySnapshot,
} from "@/features/staff-management/types/staff-management-contract";

export type StaffManagementScope = {
  surface: "owner" | "admin";
  tenantId?: string | null;
  hotelId?: string | null;
};

export type StaffDirectoryListInput = {
  q?: string;
  page: number;
  limit: number;
};

export type AssignStaffRoleInput = {
  userId: string;
  roleId: string;
};

export type UpdateStaffAssignmentInput = {
  userId: string;
  assigned: boolean;
};

type RepositoryRequestOptions = {
  signal?: AbortSignal;
};

function tenantHeaders(
  scope: StaffManagementScope,
): Record<string, string> | undefined {
  return scope.tenantId
    ? { [HTTP_HEADER_TENANT_ID]: scope.tenantId }
    : undefined;
}

function directoryPath(
  scope: StaffManagementScope,
  input?: StaffDirectoryListInput,
): string {
  const params = new URLSearchParams();
  if (scope.hotelId) params.set("hotelId", scope.hotelId);
  if (input?.q) params.set("q", input.q);
  if (input?.page) params.set("page", String(input.page));
  if (input?.limit) params.set("limit", String(input.limit));
  const query = params.toString();

  return `/api/${scope.surface}/staff${query ? `?${query}` : ""}`;
}

function userRolesPath(
  scope: StaffManagementScope,
  userId: string,
): string {
  return `/api/${scope.surface}/staff/${encodeURIComponent(userId)}/roles`;
}

export const staffDirectoryRepository = {
  async list(
    scope: StaffManagementScope,
    input: StaffDirectoryListInput,
    options: RepositoryRequestOptions = {},
  ): Promise<StaffDirectorySnapshot> {
    const payload =
      await requestInternalApiEnvelope<StaffDirectorySnapshot>(
        directoryPath(scope, input),
        {
          method: "GET",
          headers: tenantHeaders(scope),
          signal: options.signal,
        },
      );

    return payload.data;
  },

  async createUser(
    scope: StaffManagementScope,
    input: CreateAssignedHotelStaffUserInput,
  ): Promise<unknown> {
    const payload = await requestInternalApiEnvelope(
      directoryPath({ ...scope, hotelId: null }),
      {
        method: "POST",
        body: input,
        headers: tenantHeaders(scope),
      },
    );

    return payload.data;
  },

  async assignRole(
    scope: StaffManagementScope,
    input: AssignStaffRoleInput,
  ): Promise<unknown> {
    const payload = await requestInternalApiEnvelope(
      userRolesPath(scope, input.userId),
      {
        method: "POST",
        body: { roleIds: [input.roleId] },
        headers: tenantHeaders(scope),
      },
    );

    return payload.data;
  },

  async revokeRole(
    scope: StaffManagementScope,
    input: AssignStaffRoleInput,
  ): Promise<unknown> {
    const payload = await requestInternalApiEnvelope(
      `${userRolesPath(scope, input.userId)}/${encodeURIComponent(input.roleId)}`,
      {
        method: "DELETE",
        headers: tenantHeaders(scope),
      },
    );

    return payload.data;
  },

  async updateAssignment(
    scope: StaffManagementScope,
    input: UpdateStaffAssignmentInput,
  ): Promise<unknown> {
    if (!scope.hotelId) {
      throw new Error("Hãy chọn khách sạn trước khi phân công.");
    }

    const payload = await requestInternalApiEnvelope(
      `/api/${scope.surface}/hotels/${encodeURIComponent(scope.hotelId)}/staff-assignments/${encodeURIComponent(input.userId)}`,
      { method: input.assigned ? "PUT" : "DELETE" },
    );

    return payload.data;
  },
};
