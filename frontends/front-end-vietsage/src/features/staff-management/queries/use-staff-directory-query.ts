"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  CreateHotelStaffUserInput,
  StaffDirectorySnapshot,
} from "../types/staff-management-contract";

export type StaffManagementScope = {
  surface: "owner" | "admin";
  tenantId?: string | null;
  hotelId?: string | null;
};

function directoryPath(scope: StaffManagementScope): string {
  const params = new URLSearchParams();
  if (scope.tenantId) params.set("tenantId", scope.tenantId);
  if (scope.hotelId) params.set("hotelId", scope.hotelId);
  const query = params.toString();
  return `/api/${scope.surface}/staff${query ? `?${query}` : ""}`;
}

function userRolesPath(scope: StaffManagementScope, userId: string): string {
  return `/api/${scope.surface}/staff/${encodeURIComponent(userId)}/roles`;
}

export function useStaffDirectoryQuery(scope: StaffManagementScope) {
  const enabled = Boolean(scope.tenantId);
  return useQuery({
    queryKey: ["staff-directory", scope.surface, scope.tenantId ?? null, scope.hotelId ?? null],
    enabled,
    queryFn: async () => {
      const payload = await requestInternalApiEnvelope<StaffDirectorySnapshot>(directoryPath(scope), {
        method: "GET",
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
    mutationFn: async (input: CreateHotelStaffUserInput) => {
      const payload = await requestInternalApiEnvelope(directoryPath({ ...scope, hotelId: null }), {
        method: "POST",
        body: {
          ...input,
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        },
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
            ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          },
        },
      );
      return payload.data;
    },
    onSuccess: invalidate,
  });

  const revokeRole = useMutation({
    mutationFn: async (input: { userId: string; roleId: string }) => {
      const params = new URLSearchParams();
      if (scope.tenantId) params.set("tenantId", scope.tenantId);
      const payload = await requestInternalApiEnvelope(
        `${userRolesPath(scope, input.userId)}/${encodeURIComponent(input.roleId)}${params.size ? `?${params}` : ""}`,
        { method: "DELETE" },
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
