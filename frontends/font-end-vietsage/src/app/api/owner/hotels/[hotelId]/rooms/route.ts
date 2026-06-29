import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { CreateHotelRoomInput } from "@/features/hotel-ops/types/hotel-ops-contract";

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

function sanitizeCreateRoomPayload(payload: unknown): CreateHotelRoomInput | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Record<string, unknown>;
  const roomNumber = typeof input.roomNumber === "string" ? input.roomNumber.trim() : "";
  const price = typeof input.price === "number" ? input.price : Number(input.price);

  if (!roomNumber || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const maxActiveGuestDevices =
    "maxActiveGuestDevices" in input && input.maxActiveGuestDevices !== null && input.maxActiveGuestDevices !== ""
      ? Number(input.maxActiveGuestDevices)
      : undefined;
  if (maxActiveGuestDevices !== undefined && (!Number.isInteger(maxActiveGuestDevices) || maxActiveGuestDevices < 1)) {
    return null;
  }

  return {
    roomNumber,
    ...(typeof input.floor === "string" && input.floor.trim() ? { floor: input.floor.trim() } : {}),
    ...(typeof input.type === "string" && input.type.trim() ? { type: input.type.trim() } : {}),
    price,
    ...(maxActiveGuestDevices !== undefined ? { maxActiveGuestDevices } : {}),
  };
}

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const status = url.searchParams.get("status")?.trim() || undefined;

  try {
    const data = await executeOwnerBackendRequest("list owner rooms", (accessToken) => hotelOpsService.listRooms(hotelId, {
      query: { page: 1, limit: 100, ...(q ? { q } : {}), ...(status ? { status } : {}) },
      accessToken,
    }));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner rooms fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
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

  if (payload && typeof payload === "object" && !Array.isArray(payload) && "tenantId" in payload) {
    return validationErrorResponse("Không được gửi tenantId từ giao diện chủ khách sạn.");
  }

  const createRoomPayload = sanitizeCreateRoomPayload(payload);
  if (!createRoomPayload) {
    return validationErrorResponse("Số phòng và giá phòng là bắt buộc");
  }

  try {
    const data = await executeOwnerBackendRequest("create owner room", (accessToken) => hotelOpsService.createRoom(
      hotelId,
      createRoomPayload,
      accessToken,
    ));
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Owner room created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
