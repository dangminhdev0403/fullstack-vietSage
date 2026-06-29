import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";

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
    return validationErrorResponse("roleId is required");
  }

  let payload: UpdateRolePayload | null = null;
  try {
    payload = (await request.json()) as UpdateRolePayload;
  } catch {
    payload = null;
  }

  const name = normalizeOptionalString(payload?.name);
  const description = normalizeOptionalString(payload?.description);
  const body = {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };

  if (!body.name && !body.description) {
    return validationErrorResponse("name or description is required");
  }

  try {
    const data = await rbacService.updateRole(roleId, body);
    return successResponse(data, 200, "Role updated successfully");
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
    return validationErrorResponse("roleId is required");
  }

  try {
    const data = await rbacService.deleteRole(roleId);
    return successResponse(data, 200, "Role deleted successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
