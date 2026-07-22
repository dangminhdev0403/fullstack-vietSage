import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { UpdateHotelRoomInput } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../_utils";

type Params = { params: Promise<{ hotelId: string; roomId: string }> };

function sanitizeUpdateRoomPayload(payload: unknown): UpdateHotelRoomInput | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Record<string, unknown>;
  const updatePayload: UpdateHotelRoomInput = {};

  if (typeof input.roomNumber === "string") {
    const roomNumber = input.roomNumber.trim();
    if (!roomNumber) return null;
    updatePayload.roomNumber = roomNumber;
  }

  if ("floor" in input) {
    updatePayload.floor = typeof input.floor === "string" && input.floor.trim() ? input.floor.trim() : null;
  }

  if ("type" in input) {
    updatePayload.type = typeof input.type === "string" && input.type.trim() ? input.type.trim() : null;
  }

  if ("price" in input) {
    const price = typeof input.price === "number" ? input.price : Number(input.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    updatePayload.price = price;
  }

  if ("maxActiveGuestDevices" in input) {
    if (input.maxActiveGuestDevices === null || input.maxActiveGuestDevices === "") {
      updatePayload.maxActiveGuestDevices = null;
    } else {
      const maxActiveGuestDevices = Number(input.maxActiveGuestDevices);
      if (!Number.isInteger(maxActiveGuestDevices) || maxActiveGuestDevices < 1) return null;
      updatePayload.maxActiveGuestDevices = maxActiveGuestDevices;
    }
  }

  if ("status" in input && typeof input.status === "string" && input.status.trim()) {
    updatePayload.status = input.status.trim();
  }

  return Object.keys(updatePayload).length > 0 ? updatePayload : null;
}

export async function PATCH(request: Request, context: Params) {
  const { hotelId, roomId } = await context.params;
  if (!hotelId || !roomId) return validationErrorResponse("hotelId and roomId are required");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload) && "tenantId" in payload) {
    return validationErrorResponse("Không được gửi tenantId từ giao diện chủ khách sạn.");
  }

  const updateRoomPayload = sanitizeUpdateRoomPayload(payload);
  if (!updateRoomPayload) {
    return validationErrorResponse("Thông tin phòng không hợp lệ");
  }

  try {
    const data = await executeOwnerBackendRequest("update owner room", (accessToken) => hotelOpsService.updateRoom(hotelId, roomId, updateRoomPayload, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner room updated successfully");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
