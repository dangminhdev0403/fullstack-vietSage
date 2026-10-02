import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Context = { params: Promise<{ hotelId: string; roomTypeId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { hotelId, roomTypeId } = await context.params;
  if (!hotelId || !roomTypeId) return validationErrorResponse("hotelId and roomTypeId are required");
  let body: unknown;
  try { body = await request.json(); } catch { return validationErrorResponse("Invalid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof (body as { basePrice?: unknown }).basePrice !== "number" ||
      !Number.isFinite((body as { basePrice: number }).basePrice) ||
      (body as { basePrice: number }).basePrice <= 0) {
    return validationErrorResponse("Giá gốc phải lớn hơn 0");
  }
  try {
    const result = await executeOwnerBackendRequest("update owner room type price", (token) =>
      hotelOpsService.updateRoomTypePrice(hotelId, roomTypeId, body as { basePrice: number }, token));
    return result instanceof Response ? result : successResponse(result, 200, "Base price saved locally");
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
