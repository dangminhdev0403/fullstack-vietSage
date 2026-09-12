import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { UpdateRoleInput } from "@/features/rbac/types/rbac-contract";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../admin/_utils";

export const dynamic = "force-dynamic";

type RoleParams = { params: Promise<{ roleId: string }> };

type UpdateRolePayload = {
  name?: unknown;
  description?: unknown;
  baseRoleId?: unknown;
  permissionIds?: unknown;
};

function normalizeRoleId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export async function PATCH(request: Request, context: RoleParams) {
  const params = await context.params;
  const roleId = normalizeRoleId(params.roleId);

  if (!roleId) {
    return validationErrorResponse("roleId là bắt buộc");
  }

  let payload: UpdateRolePayload | null = null;
  try {
    payload = (await request.json()) as UpdateRolePayload;
  } catch {
    payload = null;
  }

  const name = normalizeOptionalString(payload?.name);
  const description =
    typeof payload?.description === "string"
      ? payload.description.trim().length > 0
        ? payload.description.trim()
        : null
      : undefined;
  const baseRoleId = normalizeOptionalString(payload?.baseRoleId);

  let permissionIds: string[] | undefined = undefined;
  if (payload?.permissionIds !== undefined) {
    if (
      !Array.isArray(payload.permissionIds) ||
      !payload.permissionIds.every((item) => typeof item === "string")
    ) {
      return validationErrorResponse("permissionIds phải là một danh sách chuỗi");
    }
    permissionIds = payload.permissionIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);
  }

  const body: UpdateRoleInput = {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(baseRoleId !== undefined ? { baseRoleId } : {}),
    ...(permissionIds !== undefined ? { permissionIds } : {}),
  };

  if (Object.keys(body).length === 0) {
    return validationErrorResponse("Cần ít nhất một trường để cập nhật");
  }

  try {
    const data = await rbacService.updateRole(roleId, body);
    return successResponse(data, 200, "Cập nhật vai trò thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

export async function DELETE(_request: Request, context: RoleParams) {
  const params = await context.params;
  const roleId = normalizeRoleId(params.roleId);

  if (!roleId) {
    return validationErrorResponse("roleId là bắt buộc");
  }

  try {
    const data = await rbacService.deleteRole(roleId);
    return successResponse(data, 200, "Xóa vai trò thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
