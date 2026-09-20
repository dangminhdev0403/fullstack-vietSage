import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Context = { params: Promise<{ hotelId: string; userId: string }> };

const assignRoomSchema = z.object({
  roomId: z.string().trim().min(1, "roomId là bắt buộc"),
});

export async function PUT(request: Request, context: Context) {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  const { hotelId, userId } = await context.params;
  if (!hotelId?.trim() || !userId?.trim()) {
    return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  }

  const json = await request.json().catch(() => null);
  const parsed = assignRoomSchema.safeParse(json);
  if (!parsed.success) {
    return validationErrorResponse("roomId là bắt buộc");
  }

  try {
    const result = await staffManagementService.assignRoom(
      hotelId,
      userId,
      parsed.data.roomId,
      undefined,
      tenantId,
    );
    return successResponse(result, 200, "Đã gán phòng cho nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export async function DELETE(request: Request, context: Context) {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  const { hotelId, userId } = await context.params;
  if (!hotelId?.trim() || !userId?.trim()) {
    return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  }

  try {
    const result = await staffManagementService.unassignRoom(
      hotelId,
      userId,
      undefined,
      tenantId,
    );
    return successResponse(result, 200, "Đã bỏ gán phòng cho nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
