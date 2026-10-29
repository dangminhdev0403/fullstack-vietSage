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
const chargeLineSchema = z.object({
  lineType: z.enum(["ROOM_NIGHT", "EXTRA"]),
  serviceDate: z.string().trim().optional(),
  serviceItemId: z.string().trim().optional(),
  nameSnapshot: z.string().trim().min(1),
  codeSnapshot: z.string().trim().optional(),
  quantity: z.number().int().min(1).default(1),
  unitPriceSnapshot: z.number().nonnegative(),
  taxAmountSnapshot: z.number().nonnegative().default(0),
  discountAmountSnapshot: z.number().nonnegative().default(0),
  totalSnapshot: z.number().nonnegative(),
  currency: z.string().trim().default("VND"),
});

const schema = z.object({
  guestDisplayName: z.string().trim().min(2, "Tên khách lưu trú tối thiểu 2 ký tự").max(120),
  guestPhone: z.string().trim().max(40).optional(),
  plannedCheckInAt: z.string().datetime({ message: "Thời gian nhận phòng không hợp lệ" }),
  plannedCheckOutAt: z.string().datetime({ message: "Thời gian trả phòng không hợp lệ" }),
  roomId: z.string().trim().min(1).optional(),
  roomTypeId: z.string().trim().min(1).optional(),
  guestCount: z.coerce.number().int().min(1).max(50).optional(),
  notes: z.string().trim().max(500).optional(),
  nightlyRateSnapshot: z.union([z.number(), z.string().trim().min(1)]).optional(),
  chargeLines: z.array(chargeLineSchema).optional(),
  sourceCategory: z.enum(["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"]).optional(),
  sourcePartnerId: z.string().trim().min(1).nullable().optional(),
  bookingOwnerUserId: z.string().trim().min(1).nullable().optional(),
  reservationCode: z.string().trim().max(80).optional(),
  groupCode: z.string().trim().max(80).optional(),
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
          roomTypeId: parsed.data.roomTypeId,
          guestCount: parsed.data.guestCount,
          notes: parsed.data.notes,
          nightlyRateSnapshot: parsed.data.nightlyRateSnapshot,
          chargeLines: parsed.data.chargeLines,
          sourceCategory: parsed.data.sourceCategory,
          sourcePartnerId: parsed.data.sourcePartnerId,
          bookingOwnerUserId: parsed.data.bookingOwnerUserId,
          ...(parsed.data.reservationCode ? { reservationCode: parsed.data.reservationCode } : {}),
          ...(parsed.data.groupCode ? { groupCode: parsed.data.groupCode } : {}),
        },
        accessToken,
      );
      if (parsed.data.roomId && !reservation.roomId) {
        await hotelOpsService.assignReservationRoom(
          hotelId,
          reservation.id,
          { roomId: parsed.data.roomId },
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
