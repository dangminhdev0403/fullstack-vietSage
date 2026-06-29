import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../admin/_utils";

export const dynamic = "force-dynamic";

type RolePermissionsParams = { params: Promise<{ roleId: string }> };

type RolePermissionsMutationPayload = {
  permissionIds: string[];
};

function normalizeRoleId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validatePermissionIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    const normalized = item.trim();
    if (normalized.length === 0) {
      return null;
    }

    ids.push(normalized);
  }

  return [...new Set(ids)];
}

function invalidRoleIdResponse() {
  return validationErrorResponse("roleId is required");
}

function invalidPermissionIdsResponse() {
  return validationErrorResponse("permissionIds must be an array of non-empty strings");
}

export async function GET(
  _request: Request,
  context: RolePermissionsParams,
) {
  const params = await context.params;
  const roleId = normalizeRoleId(params.roleId);

  if (!roleId) {
    return invalidRoleIdResponse();
  }

  try {
    const data = await rbacService.listRolePermissions(roleId);
    return successResponse(data, 200, "Role permissions fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

export async function PUT(
  request: Request,
  context: RolePermissionsParams,
) {
  const params = await context.params;
  const roleId = normalizeRoleId(params.roleId);

  if (!roleId) {
    return invalidRoleIdResponse();
  }

  let payload: RolePermissionsMutationPayload | null = null;

  try {
    payload = (await request.json()) as RolePermissionsMutationPayload;
  } catch {
    payload = null;
  }

  const permissionIds = validatePermissionIds(payload?.permissionIds);
  if (!permissionIds) {
    return invalidPermissionIdsResponse();
  }

  try {
    const data = await rbacService.replaceRolePermissions(roleId, permissionIds);
    return successResponse(data, 200, "Role permissions replaced successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
