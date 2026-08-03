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

type Params = { params: Promise<{ hotelId: string; stayId: string }> };

const updateSchema = z
  .object({
    plannedCheckOutAt: z.string().trim().optional(),
    guestDisplayName: z.string().trim().optional(),
    guestPhone: z.string().trim().optional(),
  })
  .strict();

export async function PATCH(request: Request, context: Params) {
  const { hotelId, stayId } = await context.params;
  if (!hotelId || !stayId) return validationErrorResponse("hotelId and stayId are required");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Dữ liệu cập nhật lượt lưu trú không hợp lệ");

  try {
    const data = await executeHotelOpsBackendRequest("update stay", (accessToken) =>
      hotelOpsService.updateStay(hotelId, stayId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Đã gia hạn lượt lưu trú thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
