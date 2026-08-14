import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../_utils";

export const dynamic = "force-dynamic";

const jsonRecordSchema = z.record(z.string(), z.unknown());

const createHotelSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  timezone: z.string().trim().min(1).optional(),
  brandSettings: jsonRecordSchema.optional(),
  googleSheetUrl: z.string().trim().max(500).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "100");

    const data = await adminService.listHotels({
      query: { page, limit },
    });

    return successResponse(data, 200, "Hotels retrieved successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }
    return unknownServerErrorResponse();
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const parsed = createHotelSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Hotel payload is invalid");
  }

  try {
    const data = await adminService.createHotel(
      {
        ...(parsed.data.tenantId?.trim() ? { tenantId: parsed.data.tenantId.trim() } : {}),
        name: parsed.data.name.trim(),
        ...(parsed.data.timezone?.trim() ? { timezone: parsed.data.timezone.trim() } : {}),
        ...(parsed.data.brandSettings ? { brandSettings: parsed.data.brandSettings } : {}),
        ...(parsed.data.googleSheetUrl?.trim()
          ? { googleSheetUrl: parsed.data.googleSheetUrl.trim() }
          : {}),
      },
    );

    return successResponse(data, 201, "Hotel created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

