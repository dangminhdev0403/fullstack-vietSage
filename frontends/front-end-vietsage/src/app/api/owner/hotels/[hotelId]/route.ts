import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../_utils";

type HotelParams = {
  params: Promise<{ hotelId: string }>;
};

const jsonRecordSchema = z.record(z.string(), z.unknown());

const ownerUpdateHotelSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
    brandSettings: jsonRecordSchema.nullable().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    googleMapsUrl: z.string().trim().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    locationAccuracyMeters: z.number().nullable().optional(),
    locationSource: z.enum(["DEVICE_GEOLOCATION", "GOOGLE_MAPS_URL", "MANUAL"]).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one hotel field is required",
  });

export async function GET(_request: Request, context: HotelParams) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  try {
    const data = await executeOwnerBackendRequest("get owner hotel", (accessToken) => adminService.getHotel(hotelId, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

export async function PATCH(request: Request, context: HotelParams) {
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

  const parsed = ownerUpdateHotelSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Hotel payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("update owner hotel", (accessToken) => adminService.updateHotel(
      hotelId,
      {
        ...(parsed.data.name?.trim() ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.timezone?.trim() ? { timezone: parsed.data.timezone.trim() } : {}),
        ...("brandSettings" in parsed.data ? { brandSettings: parsed.data.brandSettings } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...("googleMapsUrl" in parsed.data ? { googleMapsUrl: parsed.data.googleMapsUrl } : {}),
        ...("latitude" in parsed.data ? { latitude: parsed.data.latitude } : {}),
        ...("longitude" in parsed.data ? { longitude: parsed.data.longitude } : {}),
        ...("locationAccuracyMeters" in parsed.data ? { locationAccuracyMeters: parsed.data.locationAccuracyMeters } : {}),
        ...("locationSource" in parsed.data ? { locationSource: parsed.data.locationSource } : {}),
      },
      accessToken,
    ));
    if (data instanceof Response) return data;

    return successResponse(data, 200, "Owner hotel updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
