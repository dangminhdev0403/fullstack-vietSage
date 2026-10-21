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

const bodySchema = z.object({
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày nhận phòng không hợp lệ").optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày trả phòng không hợp lệ").optional(),
  plannedCheckInAt: z.string().datetime().optional(),
  plannedCheckOutAt: z.string().datetime().optional(),
  expectedUpdatedAt: z.string().trim().min(1, "expectedUpdatedAt là bắt buộc"),
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message || "Dữ liệu cập nhật ngày không hợp lệ",
    );
  }

  try {
    const data = await executeHotelOpsBackendRequest("update reservation dates", (accessToken) =>
      hotelOpsService.updateReservationDates(hotelId, reservationId, parsed.data, {
        accessToken,
      }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Cập nhật ngày đặt phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
