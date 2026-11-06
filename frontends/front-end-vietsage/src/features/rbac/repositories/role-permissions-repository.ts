import { HttpError } from "@/core/http/http-error";
import { requestInternalApi } from "@/core/http/internal-api-client";
import type { CreateRoleInput, DeleteRoleResult, RbacRole, UpdateRoleInput } from "../types/rbac-contract";

export type RolePermission = { id: string; method: string; path: string; description: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getRoleErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    if (isRecord(payload.data) && typeof payload.data.detail === "string" && payload.data.detail.trim()) return payload.data.detail;
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  }
  return fallback;
}

export function parseRolePermissions(payload: unknown): RolePermission[] {
  if (!Array.isArray(payload)) throw new Error("Phản hồi danh sách quyền không đúng định dạng");
  return payload.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.method !== "string" || typeof item.path !== "string") return [];
    return [{
      id: item.id, method: item.method, path: item.path,
      description: typeof item.description === "string" && item.description.trim() ? item.description.trim() : "Quyền thao tác hệ thống",
    }];
  });
}

export const rolePermissionsRepository = {
  async permissions(roleId: string, signal?: AbortSignal): Promise<RolePermission[]> {
    try {
      return parseRolePermissions(await requestInternalApi<unknown>(
        `/api/rbac/roles/${encodeURIComponent(roleId)}/capabilities`, { method: "GET", signal },
      ));
    } catch (error) {
      if (error instanceof HttpError) throw new Error(getRoleErrorMessage(error.data, "Không thể tải danh sách quyền của vai trò. Vui lòng thử lại sau."));
      throw error;
    }
  },
  create: (body: CreateRoleInput) => requestInternalApi<RbacRole>("/api/rbac/roles", { method: "POST", body }),
  update: ({ roleId, body }: { roleId: string; body: UpdateRoleInput }) =>
    requestInternalApi<RbacRole>(`/api/rbac/roles/${encodeURIComponent(roleId)}`, { method: "PATCH", body }),
  remove: (roleId: string) => requestInternalApi<DeleteRoleResult>(`/api/rbac/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }),
};
