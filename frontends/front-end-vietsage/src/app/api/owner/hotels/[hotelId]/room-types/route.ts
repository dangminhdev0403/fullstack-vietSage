import { HttpError } from "@/core/http/http-error";
import { z } from "zod";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type Context = { params: Promise<{ hotelId: string }> };

const createRoomTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  basePrice: z.number().finite().positive(),
  maxOccupancy: z.number().int().min(1).max(50).nullable().optional(),
}).strict();

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
  const parsed = createRoomTypeSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0]?.message || "Thông tin loại phòng không hợp lệ");
  try {
    const result = await executeOwnerBackendRequest("create owner room type", (token) =>
      hotelOpsService.createRoomType(hotelId, parsed.data, token));
    return result instanceof Response ? result : successResponse(result, result.created ? 201 : 200, "Room type saved");
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
