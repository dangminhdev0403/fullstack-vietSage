import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Context = { params: Promise<{ hotelId: string; userId: string }> };

const assignRoomSchema = z.object({
  roomId: z.string().trim().min(1, "roomId là bắt buộc"),
});

export async function PUT(request: Request, context: Context) {
  const { hotelId, userId } = await context.params;
  const session = await auth();
  if (session?.user?.id === userId) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không thể tự gán phòng cho chính mình" } },
      { status: 403 },
    );
  }
  if (!hotelId?.trim() || !userId?.trim()) {
    return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  }

  const json = await request.json().catch(() => null);
  const parsed = assignRoomSchema.safeParse(json);
  if (!parsed.success) {
    return validationErrorResponse("roomId là bắt buộc");
  }

  try {
    const result = await executeOwnerBackendRequest(
      "assign staff room",
      (accessToken) =>
        staffManagementService.assignRoom(
          hotelId,
          userId,
          parsed.data.roomId,
          accessToken,
        ),
    );
    return result instanceof NextResponse
      ? result
      : successResponse(result, 200, "Đã gán phòng cho nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { hotelId, userId } = await context.params;
  const session = await auth();
  if (session?.user?.id === userId) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không thể tự hủy gán phòng của chính mình" } },
      { status: 403 },
    );
  }
  if (!hotelId?.trim() || !userId?.trim()) {
    return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  }

  try {
    const result = await executeOwnerBackendRequest(
      "unassign staff room",
      (accessToken) =>
        staffManagementService.unassignRoom(hotelId, userId, accessToken),
    );
    return result instanceof NextResponse
      ? result
      : successResponse(result, 200, "Đã bỏ gán phòng cho nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
