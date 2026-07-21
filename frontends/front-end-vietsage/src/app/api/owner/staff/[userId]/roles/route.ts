import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../_utils";

const schema = z.object({
  roleIds: z.array(z.string().trim().min(1)).min(1),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const tenantId = request.headers.get(HTTP_HEADER_TENANT_ID)?.trim();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!userId.trim() || !parsed.success || !tenantId) return validationErrorResponse("Vai trò nhân viên chưa hợp lệ");
  try {
    const result = await executeOwnerBackendRequest("assign owner staff role", (accessToken) =>
      staffManagementService.assignRoles(userId, parsed.data.roleIds, tenantId, accessToken),
    );
    return result instanceof NextResponse ? result : successResponse(result);
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
