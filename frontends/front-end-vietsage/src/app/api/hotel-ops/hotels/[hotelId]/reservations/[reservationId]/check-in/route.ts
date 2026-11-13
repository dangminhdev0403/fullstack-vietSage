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

type Params = { params: Promise<{ hotelId: string; reservationId: string }> };

const occupantSchema = z
  .object({
    fullName: z.string().trim().min(1),
    phone: z.string().trim().max(40).optional(),
    identityNumber: z.string().trim().max(32).optional(),
    dateOfBirth: z.string().trim().max(20).optional(),
    gender: z.string().trim().max(20).optional(),
    nationality: z.string().trim().max(80).optional(),
    residencePlace: z.string().trim().max(500).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

const checkInReservationSchema = z
  .object({
    guestDisplayName: z.string().trim().min(2).max(120).optional(),
    guestPhone: z.string().trim().max(40).optional(),
    guestIdentityNumber: z.string().trim().max(32).optional(),
    guestDateOfBirth: z.string().trim().max(20).optional(),
    guestGender: z.string().trim().max(20).optional(),
    guestNationality: z.string().trim().max(80).optional(),
    guestResidencePlace: z.string().trim().max(500).optional(),
    plannedCheckOutAt: z
      .string()
      .trim()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Ngày trả phòng dự kiến không hợp lệ")
      .optional(),
    occupants: z.array(occupantSchema).optional(),
    allowEarlyCheckIn: z.boolean().optional(),
    allowLateCheckIn: z.boolean().optional(),
    confirmEarlyCheckIn: z.boolean().optional(),
    confirmLateCheckIn: z.boolean().optional(),
    expectedUpdatedAt: z.string().trim().min(1).optional(),
    expectedRoomId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export async function POST(request: Request, context: Params) {
  const { hotelId, reservationId } = await context.params;
  if (!hotelId || !reservationId) return validationErrorResponse("hotelId and reservationId are required");

  const rawText = await request.text().catch(() => "");
  let rawBody: unknown = {};
  if (rawText.trim()) {
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return validationErrorResponse("Dữ liệu check-in không hợp lệ");
    }
  }
  const parsed = checkInReservationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message || "Thông tin check-in đặt phòng không hợp lệ",
    );
  }

  try {
    const data = await executeHotelOpsBackendRequest("check in reservation", (accessToken) =>
      hotelOpsService.checkInReservation(hotelId, reservationId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Đã check-in và kích hoạt QR phòng");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
