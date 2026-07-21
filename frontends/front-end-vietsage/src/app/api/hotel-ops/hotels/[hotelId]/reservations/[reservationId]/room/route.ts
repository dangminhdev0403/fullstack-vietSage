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

type Params = { params: Promise<{ hotelId: string; reservationId: string }> };
const schema = z.object({ roomId: z.string().trim().min(1) }).strict();

export async function PUT(request: Request, context: Params) {
  const { hotelId, reservationId } = await context.params;
  if (!hotelId || !reservationId) return validationErrorResponse("hotelId and reservationId are required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("roomId is required");
  try {
    const data = await executeHotelOpsBackendRequest("assign reservation room", (accessToken) =>
      hotelOpsService.assignReservationRoom(hotelId, reservationId, parsed.data.roomId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
