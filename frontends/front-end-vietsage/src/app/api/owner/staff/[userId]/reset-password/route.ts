import { NextResponse } from "next/server";
import { HttpError } from "@/core/http/http-error";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { resetResponseHeaders } from "@/features/account/security/password-security";
import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../_utils";

function withNoStore(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(resetResponseHeaders())) response.headers.set(key, value);
  return response;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const tenantId = request.headers.get(HTTP_HEADER_TENANT_ID)?.trim();
  if (!userId.trim() || !tenantId) return withNoStore(validationErrorResponse("Nhân viên hoặc tenant chưa hợp lệ"));

  try {
    const result = await executeOwnerBackendRequest("reset frontdesk password", (accessToken) =>
      staffManagementService.resetFrontdeskPassword(userId, tenantId, accessToken),
    );
    return withNoStore(result instanceof NextResponse ? result : successResponse(result));
  } catch (error) {
    if (error instanceof HttpError) return withNoStore(ownerHttpErrorResponse(error));
    return withNoStore(unknownServerErrorResponse());
  }
}
