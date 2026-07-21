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

type Params = { params: Promise<{ hotelId: string; requestId: string }> };
const schema = z.object({
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().min(1).optional(),
}).strict();

export async function PATCH(request: Request, context: Params) {
  const { hotelId, requestId } = await context.params;
  if (!hotelId || !requestId) return validationErrorResponse("hotelId and requestId are required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Request assignment payload is invalid");
  try {
    const data = await executeHotelOpsBackendRequest("assign hotel request", (accessToken) =>
      hotelOpsService.updateRequestAssignment(hotelId, requestId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
