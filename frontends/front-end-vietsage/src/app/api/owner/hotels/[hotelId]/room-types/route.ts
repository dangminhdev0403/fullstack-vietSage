import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type Context = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, context: Context) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  try {
    const result = await executeOwnerBackendRequest("list owner room types", (token) =>
      hotelOpsService.listRoomTypes(hotelId, token));
    return result instanceof Response ? result : successResponse(result, 200, "Room types fetched");
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}

export async function POST(request: Request, context: Context) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  let body: unknown;
  try { body = await request.json(); } catch { return validationErrorResponse("Invalid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "name" && key !== "basePrice")) {
    return validationErrorResponse("Chỉ nhập tên và giá gốc loại phòng");
  }
  const { name, basePrice } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > 80 ||
      typeof basePrice !== "number" || !Number.isFinite(basePrice) || basePrice <= 0) {
    return validationErrorResponse("Tên và giá gốc dương là bắt buộc");
  }
  try {
    const result = await executeOwnerBackendRequest("create owner room type", (token) =>
      hotelOpsService.createRoomType(hotelId, { name: name.trim(), basePrice }, token));
    return result instanceof Response ? result : successResponse(result, result.created ? 201 : 200, "Room type saved");
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
