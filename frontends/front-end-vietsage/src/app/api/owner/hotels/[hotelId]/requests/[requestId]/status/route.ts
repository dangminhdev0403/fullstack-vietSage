import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { UpdateHotelRequestStatusInput } from "@/features/hotel-ops/types/hotel-ops-contract";

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

const updateRequestStatusSchema = z
  .object({
    status: z.enum(["CREATED", "ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FAILED"]),
    assignedToUserId: z.string().trim().min(1).optional(),
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

  const parsed = updateRequestStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Request status payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("update owner hotel request status", (accessToken) =>
      hotelOpsService.updateRequestStatus(hotelId, requestId, parsed.data satisfies UpdateHotelRequestStatusInput, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel request status updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
