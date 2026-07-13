import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../admin/_utils";

export const dynamic = "force-dynamic";

type DisableRoleParams = { params: Promise<{ roleId: string }> };

function normalizeRoleId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(_request: Request, context: DisableRoleParams) {
  const params = await context.params;
  const roleId = normalizeRoleId(params.roleId);

  if (!roleId) {
    return validationErrorResponse("roleId is required");
  }

  try {
    const data = await rbacService.disableRole(roleId);
    return successResponse(data, 200, "Role disabled successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
