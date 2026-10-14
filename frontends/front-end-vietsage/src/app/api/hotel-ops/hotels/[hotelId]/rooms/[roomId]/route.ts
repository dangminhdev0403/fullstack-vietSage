import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { UpdateHotelRoomInput } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
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

  if (typeof input.roomNumber === "string" && input.roomNumber.trim()) {
    updatePayload.roomNumber = input.roomNumber.trim();
  }

  if ("floor" in input) {
    updatePayload.floor = typeof input.floor === "string" && input.floor.trim() ? input.floor.trim() : null;
  }

  if ("roomTypeId" in input && typeof input.roomTypeId === "string" && input.roomTypeId.trim()) {
    updatePayload.roomTypeId = input.roomTypeId.trim();
  }

  if ("type" in input) {
    updatePayload.type = typeof input.type === "string" && input.type.trim() ? input.type.trim() : null;
  }

  if ("price" in input) {
    const price = typeof input.price === "number" ? input.price : Number(input.price);
    if (Number.isFinite(price) && price > 0) updatePayload.price = price;
  }

  if ("maxActiveGuestDevices" in input) {
    const maxDevices =
      typeof input.maxActiveGuestDevices === "number"
        ? input.maxActiveGuestDevices
        : Number(input.maxActiveGuestDevices);
    if (Number.isInteger(maxDevices) && maxDevices >= 1) {
      updatePayload.maxActiveGuestDevices = maxDevices;
    }
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

  if (
    payload &&
    typeof payload === "object" &&
    ("status" in (payload as Record<string, unknown>) ||
      "expectedUpdatedAt" in (payload as Record<string, unknown>))
  ) {
    return validationErrorResponse("Đổi trạng thái phòng phải sử dụng endpoint /status chuyên biệt");
  }

  const updateRoomPayload = sanitizeUpdateRoomPayload(payload);
  if (!updateRoomPayload) {
    return validationErrorResponse("Thông tin phòng không hợp lệ");
  }

  try {
    const data = await executeHotelOpsBackendRequest("update staff room", (accessToken) =>
      hotelOpsService.updateRoom(
        hotelId,
        roomId,
        updateRoomPayload,
        accessToken,
      ),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Cập nhật thông tin phòng thành công");
  } catch (error) {
    if (error instanceof HttpError) return hotelOpsHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
