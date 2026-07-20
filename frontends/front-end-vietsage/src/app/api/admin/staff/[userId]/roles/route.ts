import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../_utils";

const schema = z.object({
  tenantId: z.string().trim().min(1),
  roleIds: z.array(z.string().trim().min(1)).min(1),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!userId.trim() || !parsed.success) return validationErrorResponse("Vai trò nhân viên chưa hợp lệ");
  try {
    const data = await staffManagementService.assignRoles(userId, parsed.data.roleIds, parsed.data.tenantId);
    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
