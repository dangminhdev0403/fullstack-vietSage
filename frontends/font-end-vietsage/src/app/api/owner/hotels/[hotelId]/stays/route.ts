import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { CreateHotelStayInput } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};


const createStaySchema = z.object({
  roomId: z.string().trim().min(1),
  guestDisplayName: z.string().trim().min(1),
  guestPhone: z.string().trim().optional(),
  plannedCheckInAt: z.string().trim().min(1),
  plannedCheckOutAt: z.string().trim().min(1),
}).strict();

function sanitizeCreateStayPayload(payload: unknown): { body: CreateHotelStayInput } | null {
  const parsed = createStaySchema.safeParse(payload);
  if (!parsed.success) return null;

  const input = parsed.data;
  const body: CreateHotelStayInput = {
    roomId: input.roomId,
    guestDisplayName: input.guestDisplayName,
    plannedCheckInAt: input.plannedCheckInAt ?? new Date().toISOString(),
    plannedCheckOutAt: input.plannedCheckOutAt,
  };

  if (input.guestPhone) body.guestPhone = input.guestPhone;
  return { body };
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const createStayPayload = sanitizeCreateStayPayload(payload);
  if (!createStayPayload) {
    return validationErrorResponse("roomId, guestDisplayName, plannedCheckInAt và plannedCheckOutAt là bắt buộc");
  }

  try {
    const data = await executeOwnerBackendRequest("create and check-in owner stay", (accessToken) =>
      hotelOpsService.createAndCheckInStay(hotelId, createStayPayload.body, accessToken),
    );

    if (data instanceof Response) return data;
    return successResponse(data, 201, "Đã check-in lượt lưu trú thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
