import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string }> };
const schema = z.object({
  guestDisplayName: z.string().trim().min(2, "Tên khách lưu trú tối thiểu 2 ký tự").max(120),
  guestPhone: z.string().trim().max(40).optional(),
  plannedCheckInAt: z.string().datetime({ message: "Thời gian nhận phòng không hợp lệ" }),
  plannedCheckOutAt: z.string().datetime({ message: "Thời gian trả phòng không hợp lệ" }),
  roomId: z.string().trim().min(1).optional(),
  nightlyRateSnapshot: z.union([z.number(), z.string().trim().min(1)]).optional(),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0]?.message || "Thông tin đặt phòng không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("create reservation", async (accessToken) => {
      const reservation = await hotelOpsService.createReservation(
        hotelId,
        {
          guestDisplayName: parsed.data.guestDisplayName,
          guestPhone: parsed.data.guestPhone,
          plannedCheckInAt: parsed.data.plannedCheckInAt,
          plannedCheckOutAt: parsed.data.plannedCheckOutAt,
          roomId: parsed.data.roomId,
          nightlyRateSnapshot: parsed.data.nightlyRateSnapshot,
        },
        accessToken,
      );
      if (parsed.data.roomId && !reservation.roomId) {
        await hotelOpsService.assignReservationRoom(
          hotelId,
          reservation.id,
          parsed.data.roomId,
          accessToken,
        );
      }
      return reservation;
    });
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Đã tạo đặt phòng");
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      const errorData = (error.data && typeof error.data === "object") ? (error.data as Record<string, unknown>) : {};
      const detail =
        (errorData.detail as string) ||
        (errorData.message as string) ||
        "Phòng đã có khách lưu trú hoặc xung đột với lịch đặt phòng khác trong khoảng thời gian này. Vui lòng chọn phòng khác hoặc thay đổi thời gian lưu trú.";
      return Response.json(
        {
          status: 409,
          message: "INTERVAL_CONFLICT",
          data: {
            detail,
            code: "INTERVAL_CONFLICT",
            actionable: true,
            suggestedAction: "CHANGE_ROOM_OR_DATES",
            ...errorData,
          },
        },
        { status: 409 },
      );
    }
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
