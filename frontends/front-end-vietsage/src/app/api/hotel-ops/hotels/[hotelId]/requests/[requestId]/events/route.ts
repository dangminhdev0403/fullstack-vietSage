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
  note: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId, requestId } = await context.params;
  if (!hotelId || !requestId) return validationErrorResponse("hotelId and requestId are required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Request event payload is invalid");
  try {
    const data = await executeHotelOpsBackendRequest("create hotel request event", (accessToken) =>
      hotelOpsService.createRequestEvent(hotelId, requestId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 201);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
