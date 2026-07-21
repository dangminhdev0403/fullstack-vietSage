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
  guestDisplayName: z.string().trim().min(2).max(120),
  guestPhone: z.string().trim().max(40).optional(),
  plannedCheckInAt: z.string().datetime(),
  plannedCheckOutAt: z.string().datetime(),
  roomId: z.string().trim().min(1).optional(),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin đặt phòng không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("create reservation", async (accessToken) => {
      const reservation = await hotelOpsService.createReservation(
        hotelId,
        {
          guestDisplayName: parsed.data.guestDisplayName,
          guestPhone: parsed.data.guestPhone,
          plannedCheckInAt: parsed.data.plannedCheckInAt,
          plannedCheckOutAt: parsed.data.plannedCheckOutAt,
        },
        accessToken,
      );
      if (parsed.data.roomId) {
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
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
