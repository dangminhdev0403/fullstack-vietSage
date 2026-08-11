import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../_utils";

const schema = z.object({ fullName: z.string().trim().min(2).optional(), email: z.string().trim().email().optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }).refine((v) => v.fullName || v.email || v.status);
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!tenantId) return validationErrorResponse("tenantId là bắt buộc");
  if (!parsed.success) return validationErrorResponse("Thông tin cập nhật nhân viên chưa hợp lệ");
  try {
    if (parsed.data.status) {
      await staffManagementService.updateStatus(userId, parsed.data.status, tenantId);
    }
    const data = await staffManagementService.updateUser(userId, { fullName: parsed.data.fullName, email: parsed.data.email }, tenantId);
    return successResponse(data, 200, "Đã cập nhật nhân viên");
  } catch (error) {
    return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse();
  }
}
