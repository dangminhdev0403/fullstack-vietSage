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
  params: Promise<{ hotelId: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Thiếu mã khách sạn (hotelId)"),
});

export async function GET(_request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(
      paramsResult.error.issues[0]?.message || "Thiếu mã khách sạn (hotelId)",
    );
  }
  const { hotelId } = paramsResult.data;

  try {
    const data = await executeHotelOpsBackendRequest("list priority alerts", (accessToken) =>
      hotelOpsService.getPriorityAlerts(hotelId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy danh sách phòng cần ưu tiên xử lý thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
