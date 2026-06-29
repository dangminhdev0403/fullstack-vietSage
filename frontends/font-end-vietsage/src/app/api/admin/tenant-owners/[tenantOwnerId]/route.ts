import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../_utils";

export const dynamic = "force-dynamic";

type TenantOwnerParams = {
  params: Promise<{ tenantOwnerId: string }>;
};

const updateTenantOwnerSchema = z.object({
  owner: z
    .object({
      fullName: z.string().trim().min(1).optional(),
      status: z.enum(["ACTIVE", "LOCKED", "DISABLED"]).optional(),
    })
    .optional(),
  tenant: z
    .object({
      name: z.string().trim().min(1).optional(),
    })
    .optional(),
  tenantUserStatus: z.enum(["ACTIVE", "INVITED", "DISABLED"]).optional(),
});

export async function GET(_request: Request, context: TenantOwnerParams) {
  const { tenantOwnerId } = await context.params;
  if (!tenantOwnerId) {
    return validationErrorResponse("tenantOwnerId is required");
  }

  try {
    const data = await adminService.getTenantOwner(tenantOwnerId);
    return successResponse(data, 200, "Tenant owner fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

export async function PATCH(request: Request, context: TenantOwnerParams) {
  const { tenantOwnerId } = await context.params;
  if (!tenantOwnerId) {
    return validationErrorResponse("tenantOwnerId is required");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const parsed = updateTenantOwnerSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Tenant owner payload is invalid");
  }

  try {
    const data = await adminService.updateTenantOwner(tenantOwnerId, parsed.data);
    return successResponse(data, 200, "Tenant owner updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
