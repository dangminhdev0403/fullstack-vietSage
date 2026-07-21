"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import type {
  CreateAssignedHotelStaffUserInput,
  StaffDirectorySnapshot,
} from "../types/staff-management-contract";

export type StaffManagementScope = {
  surface: "owner" | "admin";
  tenantId?: string | null;
  hotelId?: string | null;
};

type StaffDirectoryQueryParams = {
  q?: string;
  page?: number;
  limit?: number;
};

function directoryPath(scope: StaffManagementScope, paramsOptions?: StaffDirectoryQueryParams): string {
  const params = new URLSearchParams();
  if (scope.hotelId) params.set("hotelId", scope.hotelId);
  if (paramsOptions?.q) params.set("q", paramsOptions.q);
  if (paramsOptions?.page) params.set("page", String(paramsOptions.page));
  if (paramsOptions?.limit) params.set("limit", String(paramsOptions.limit));
  const query = params.toString();
  return `/api/${scope.surface}/staff${query ? `?${query}` : ""}`;
}

function userRolesPath(scope: StaffManagementScope, userId: string): string {
  return `/api/${scope.surface}/staff/${encodeURIComponent(userId)}/roles`;
}

export function useStaffDirectoryQuery(scope: StaffManagementScope, queryOptions?: StaffDirectoryQueryParams) {
  const enabled = Boolean(scope.tenantId);
  return useQuery({
    queryKey: [
      "staff-directory",
      scope.surface,
      scope.tenantId ?? null,
      scope.hotelId ?? null,
      queryOptions?.q ?? "",
      queryOptions?.page ?? 1,
      queryOptions?.limit ?? 20,
    ],
    enabled,
    queryFn: async () => {
      const payload = await requestInternalApiEnvelope<StaffDirectorySnapshot>(directoryPath(scope, queryOptions), {
        method: "GET",
        headers: scope.tenantId ? { [HTTP_HEADER_TENANT_ID]: scope.tenantId } : undefined,
      });
      return payload.data;
    },
  });
}

export function useStaffManagementMutations(scope: StaffManagementScope) {
  const queryClient = useQueryClient();
  const queryKey = ["staff-directory", scope.surface, scope.tenantId ?? null, scope.hotelId ?? null];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createUser = useMutation({
    mutationFn: async (input: CreateAssignedHotelStaffUserInput) => {
      const payload = await requestInternalApiEnvelope(directoryPath({ ...scope, hotelId: null }), {
        method: "POST",
        body: input,
        headers: scope.tenantId ? { [HTTP_HEADER_TENANT_ID]: scope.tenantId } : undefined,
      });
      return payload.data;
    },
    onSuccess: invalidate,
  });

  const assignRole = useMutation({
    mutationFn: async (input: { userId: string; roleId: string }) => {
      const payload = await requestInternalApiEnvelope(
        userRolesPath(scope, input.userId),
        {
          method: "POST",
          body: {
            roleIds: [input.roleId],
          },
          headers: scope.tenantId ? { [HTTP_HEADER_TENANT_ID]: scope.tenantId } : undefined,
        },
      );
      return payload.data;
    },
    onSuccess: invalidate,
  });

  const revokeRole = useMutation({
    mutationFn: async (input: { userId: string; roleId: string }) => {
      const payload = await requestInternalApiEnvelope(
        `${userRolesPath(scope, input.userId)}/${encodeURIComponent(input.roleId)}`,
        {
          method: "DELETE",
          headers: scope.tenantId ? { [HTTP_HEADER_TENANT_ID]: scope.tenantId } : undefined,
        },
      );
      return payload.data;
    },
    onSuccess: invalidate,
  });

  const updateAssignment = useMutation({
    mutationFn: async (input: { userId: string; assigned: boolean }) => {
      if (!scope.hotelId) throw new Error("Hãy chọn khách sạn trước khi phân công.");
      const payload = await requestInternalApiEnvelope(
        `/api/${scope.surface}/hotels/${encodeURIComponent(scope.hotelId)}/staff-assignments/${encodeURIComponent(input.userId)}`,
        { method: input.assigned ? "PUT" : "DELETE" },
      );
      return payload.data;
    },
    onSuccess: invalidate,
  });

  return { createUser, assignRole, revokeRole, updateAssignment };
}
