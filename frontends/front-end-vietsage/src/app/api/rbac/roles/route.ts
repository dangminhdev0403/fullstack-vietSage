import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { CreateRoleInput } from "@/features/rbac/types/rbac-contract";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../admin/_utils";

export const dynamic = "force-dynamic";

type CreateRolePayload = {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  baseRoleId?: unknown;
  permissionIds?: unknown;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export async function POST(request: Request) {
  let payload: CreateRolePayload | null = null;
  try {
    payload = (await request.json()) as CreateRolePayload;
  } catch {
    payload = null;
  }

  const code = normalizeString(payload?.code);
  const name = normalizeString(payload?.name);
  const baseRoleId = normalizeString(payload?.baseRoleId);
  const description = normalizeOptionalString(payload?.description);

  if (!code) {
    return validationErrorResponse("Mã vai trò (code) là bắt buộc");
  }
  if (!name) {
    return validationErrorResponse("Tên vai trò (name) là bắt buộc");
  }
  if (!baseRoleId) {
    return validationErrorResponse("Vai trò cơ sở (baseRoleId) là bắt buộc");
  }

  if (
    !Array.isArray(payload?.permissionIds) ||
    !payload.permissionIds.every((item) => typeof item === "string")
  ) {
    return validationErrorResponse("permissionIds phải là một danh sách chuỗi");
  }

  const permissionIds: string[] = payload.permissionIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);

  const input: CreateRoleInput = {
    code,
    name,
    baseRoleId,
    permissionIds,
    ...(description !== undefined ? { description } : {}),
  };

  try {
    const data = await rbacService.createRole(input);
    return successResponse(data, 201, "Tạo vai trò thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
