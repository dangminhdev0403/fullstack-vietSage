import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../_utils";

type HotelParams = {
  params: Promise<{ hotelId: string }>;
};

const jsonRecordSchema = z.record(z.string(), z.unknown());

const updateHotelSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
    brandSettings: jsonRecordSchema.nullable().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
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
    const data = await adminService.getHotel(hotelId);
    return successResponse(data, 200, "Hotel fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
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

  const parsed = updateHotelSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Hotel payload is invalid");
  }

  try {
    const data = await adminService.updateHotel(hotelId, {
      ...(parsed.data.name?.trim() ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.timezone?.trim() ? { timezone: parsed.data.timezone.trim() } : {}),
      ...("brandSettings" in parsed.data ? { brandSettings: parsed.data.brandSettings } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });
    return successResponse(data, 200, "Hotel updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
