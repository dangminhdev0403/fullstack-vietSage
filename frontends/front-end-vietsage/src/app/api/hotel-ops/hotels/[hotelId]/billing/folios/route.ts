import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { findRoomFolio } from "@/features/hotel-ops/utils/find-room-folio";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";

export async function GET(request: Request, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params;
  const parsed = z.string().trim().min(1).safeParse(new URL(request.url).searchParams.get("roomId"));
  if (!hotelId || !parsed.success) return validationErrorResponse("Vui lòng chọn phòng cần xem thanh toán.");
  try {
    const data = await executeHotelOpsBackendRequest("find room checkout folio", (accessToken) =>
      findRoomFolio(parsed.data, (page) => billingService.listFolios(hotelId, {
        query: { page, limit: 100 }, accessToken,
      })),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
