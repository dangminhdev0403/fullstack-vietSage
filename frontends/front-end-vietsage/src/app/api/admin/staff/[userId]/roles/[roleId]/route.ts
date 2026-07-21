import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../../_utils";

export async function DELETE(request: Request, context: { params: Promise<{ userId: string; roleId: string }> }) {
  const { userId, roleId } = await context.params;
  const tenantId = request.headers.get(HTTP_HEADER_TENANT_ID)?.trim();
  if (!userId.trim() || !roleId.trim() || !tenantId) return validationErrorResponse("Người dùng, vai trò hoặc tenant chưa hợp lệ");
  try {
    const data = await staffManagementService.revokeRole(userId, roleId, tenantId);
    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
