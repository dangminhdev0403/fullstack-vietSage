import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { CreateHotelRequestEventInput } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; requestId: string }>;
};

const createRequestEventSchema = z
  .object({
    note: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function POST(request: Request, context: Params) {
  const { hotelId, requestId } = await context.params;
  if (!hotelId || !requestId) {
    return validationErrorResponse("hotelId and requestId are required");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const parsed = createRequestEventSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Request event payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("create owner hotel request event", (accessToken) =>
      hotelOpsService.createRequestEvent(hotelId, requestId, parsed.data satisfies CreateHotelRequestEventInput, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Owner hotel request event created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
