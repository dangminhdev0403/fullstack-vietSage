import { NextResponse } from "next/server";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../../_utils";

export async function DELETE(request: Request, context: { params: Promise<{ userId: string; roleId: string }> }) {
  const { userId, roleId } = await context.params;
  const tenantId = new URL(request.url).searchParams.get("tenantId")?.trim();
  if (!userId.trim() || !roleId.trim() || !tenantId) return validationErrorResponse("Người dùng, vai trò hoặc tenant chưa hợp lệ");
  try {
    const result = await executeOwnerBackendRequest("revoke owner staff role", (accessToken) =>
      staffManagementService.revokeRole(userId, roleId, tenantId, accessToken),
    );
    return result instanceof NextResponse ? result : successResponse(result);
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
