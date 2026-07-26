import { NextResponse } from "next/server";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { resetResponseHeaders } from "@/features/account/security/password-security";

import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../_utils";

type TenantOwnerParams = { params: Promise<{ tenantOwnerId: string }> };

function withNoStore(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(resetResponseHeaders())) response.headers.set(key, value);
  return response;
}

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: TenantOwnerParams) {
  const { tenantOwnerId } = await context.params;
  if (!tenantOwnerId.trim()) return withNoStore(validationErrorResponse("tenantOwnerId is required"));

  try {
    const data = await adminService.resetTenantOwnerPassword(tenantOwnerId);
    return withNoStore(successResponse(data, 200, "Tenant owner password reset successfully"));
  } catch (error) {
    if (error instanceof HttpError) return withNoStore(httpErrorResponse(error));
    return withNoStore(unknownServerErrorResponse());
  }
}
