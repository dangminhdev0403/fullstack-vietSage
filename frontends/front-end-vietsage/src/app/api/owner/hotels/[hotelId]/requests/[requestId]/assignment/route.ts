import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { UpdateHotelRequestAssignmentInput } from "@/features/hotel-ops/types/hotel-ops-contract";

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

const updateRequestAssignmentSchema = z
  .object({
    assignedToUserId: z.string().trim().min(1).nullable().optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

export async function PATCH(request: Request, context: Params) {
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

  const parsed = updateRequestAssignmentSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Request assignment payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("update owner hotel request assignment", (accessToken) =>
      hotelOpsService.updateRequestAssignment(hotelId, requestId, parsed.data satisfies UpdateHotelRequestAssignmentInput, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel request assignment updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
