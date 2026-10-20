import { HttpError } from "@/core/http/http-error";
import { z } from "zod";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Context = { params: Promise<{ hotelId: string; roomTypeId: string }> };

const updateRoomTypeSchema = z.object({
  basePrice: z.number().finite().positive().optional(),
  maxOccupancy: z.number().int().min(1).max(50).nullable().optional(),
}).strict().refine((value) => value.basePrice !== undefined || value.maxOccupancy !== undefined, {
  message: "Cần nhập giá gốc hoặc sức chứa",
});

export async function PATCH(request: Request, context: Context) {
  const { hotelId, roomTypeId } = await context.params;
  if (!hotelId || !roomTypeId) return validationErrorResponse("hotelId and roomTypeId are required");
  let body: unknown;
  try { body = await request.json(); } catch { return validationErrorResponse("Invalid JSON"); }
  const parsed = updateRoomTypeSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0]?.message || "Thông tin loại phòng không hợp lệ");
  try {
    const result = await executeOwnerBackendRequest("update owner room type price", (token) =>
      hotelOpsService.updateRoomTypePrice(hotelId, roomTypeId, parsed.data, token));
    return result instanceof Response ? result : successResponse(result, 200, "Base price saved locally");
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
