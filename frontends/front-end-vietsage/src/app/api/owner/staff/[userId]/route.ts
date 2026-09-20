import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../_utils";

const schema = z.object({ fullName: z.string().trim().min(2).optional(), email: z.string().trim().email().optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }).refine((v) => v.fullName || v.email || v.status);
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const session = await auth();
  if (session?.user?.id === userId) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không thể tự chỉnh sửa thông tin hoặc trạng thái của chính mình" } },
      { status: 403 },
    );
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin cập nhật nhân viên chưa hợp lệ");
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  if (!tenantId) return validationErrorResponse("tenantId là bắt buộc");
  try {
    const result = await executeOwnerBackendRequest("update owner staff", async (accessToken) => {
      if (parsed.data.status) await staffManagementService.updateStatus(userId, parsed.data.status, tenantId, accessToken);
      return staffManagementService.updateUser(userId, { fullName: parsed.data.fullName, email: parsed.data.email }, tenantId, accessToken);
    });
    return result instanceof NextResponse ? result : successResponse(result, 200, "Đã cập nhật nhân viên");
  } catch (error) { return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
