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

function normalizeRoleId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invalidRoleIdResponse() {
  return validationErrorResponse("roleId is required");
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
