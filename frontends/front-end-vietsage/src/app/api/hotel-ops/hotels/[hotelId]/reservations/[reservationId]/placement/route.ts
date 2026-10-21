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
  targetRoomId: z.string().trim().min(1, "Thiếu phòng đích (targetRoomId)"),
  mode: z.enum(["MOVE", "SWAP"]).optional(),
  expectedUpdatedAt: z.string().datetime({ message: "expectedUpdatedAt phải là ISO datetime hợp lệ" }),
  swapWithReservationId: z.string().trim().min(1).optional(),
  swapExpectedUpdatedAt: z.string().datetime().optional(),
  expectedSwapUpdatedAt: z.string().datetime().optional(),
});

export async function PUT(request: Request, context: Params) {
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
      parsed.error.issues[0]?.message || "Dữ liệu chuyển đổi phòng không hợp lệ",
    );
  }

  const cleanReservationId = reservationId.replace(/^res-/, "");
  const cleanSwapWithReservationId = parsed.data.swapWithReservationId?.replace(/^res-/, "");

  const backendPayload = {
    targetRoomId: parsed.data.targetRoomId,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    ...(cleanSwapWithReservationId ? { swapWithReservationId: cleanSwapWithReservationId } : {}),
    ...(parsed.data.swapExpectedUpdatedAt || parsed.data.expectedSwapUpdatedAt
      ? {
          swapExpectedUpdatedAt:
            parsed.data.swapExpectedUpdatedAt || parsed.data.expectedSwapUpdatedAt,
        }
      : {}),
  };

  try {
    const data = await executeHotelOpsBackendRequest("update reservation placement", (accessToken) =>
      hotelOpsService.updateReservationPlacement(hotelId, cleanReservationId, backendPayload, { accessToken }),
    );

    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}
