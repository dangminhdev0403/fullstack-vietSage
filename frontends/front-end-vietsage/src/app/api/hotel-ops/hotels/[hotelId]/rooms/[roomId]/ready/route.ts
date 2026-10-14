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
  params: Promise<{ hotelId: string; roomId: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Thiếu mã khách sạn (hotelId)"),
  roomId: z.string().trim().min(1, "Thiếu mã phòng (roomId)"),
});

export async function PATCH(request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(paramsResult.error.issues[0]?.message || "Tham số không hợp lệ");
  }
  const { hotelId, roomId } = paramsResult.data;
  const body = await request.json().catch(() => null);
  const bodyResult = z
    .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
    .safeParse(body);
  if (!bodyResult.success) {
    return validationErrorResponse("Thiếu phiên bản trạng thái phòng hợp lệ");
  }

  try {
    const data = await executeHotelOpsBackendRequest("mark room ready", (accessToken) =>
      hotelOpsService.markRoomReady(
        hotelId,
        roomId,
        bodyResult.data.expectedUpdatedAt,
        accessToken,
      ),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Phòng đã sẵn sàng đón khách");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
