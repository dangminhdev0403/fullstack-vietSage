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

type Params = {
  params: Promise<{ hotelId: string; reservationId: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Thiếu mã khách sạn (hotelId)"),
  reservationId: z.string().trim().min(1, "Thiếu mã đặt phòng (reservationId)"),
});

const updateReservationBodySchema = z.object({
  guestDisplayName: z.string().trim().min(1, "Tên khách không được để trống").max(120).optional(),
  guestPhone: z.string().trim().max(40).nullable().optional(),
  guestCount: z.coerce.number().int().min(1).max(50).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  roomId: z.string().trim().min(1).nullable().optional(),
  roomTypeId: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày nhận phòng không hợp lệ").optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày trả phòng không hợp lệ").optional(),
  plannedCheckInAt: z.string().datetime().optional(),
  plannedCheckOutAt: z.string().datetime().optional(),
  rate: z.union([z.number(), z.string()]).nullable().optional(),
  nightlyRateSnapshot: z.union([z.number(), z.string()]).nullable().optional(),
  chargeLines: z.array(z.any()).optional(),
  sourceCategory: z.string().trim().optional(),
  sourcePartnerId: z.string().trim().min(1).nullable().optional(),
  bookingOwnerUserId: z.string().trim().min(1).nullable().optional(),
  expectedUpdatedAt: z.string().trim().optional(),
});

export async function GET(_request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(
      paramsResult.error.issues[0]?.message || "Thiếu tham số định danh",
    );
  }
  const { hotelId, reservationId } = paramsResult.data;

  try {
    const data = await executeHotelOpsBackendRequest("get reservation details", (accessToken) =>
      hotelOpsService.getReservation(hotelId, reservationId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy thông tin đặt phòng thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse("Không thể lấy thông tin đặt phòng");
  }
}

export async function PATCH(request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(
      paramsResult.error.issues[0]?.message || "Thiếu tham số định danh",
    );
  }
  const { hotelId, reservationId } = paramsResult.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse("Dữ liệu gửi lên không đúng định dạng JSON");
  }

  const parsed = updateReservationBodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message || "Dữ liệu cập nhật đặt phòng không hợp lệ",
    );
  }

  try {
    const data = await executeHotelOpsBackendRequest("update reservation details", (accessToken) =>
      hotelOpsService.updateReservation(hotelId, reservationId, parsed.data, {
        accessToken,
      }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Cập nhật thông tin đặt phòng thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse("Không thể cập nhật thông tin đặt phòng");
  }
}
