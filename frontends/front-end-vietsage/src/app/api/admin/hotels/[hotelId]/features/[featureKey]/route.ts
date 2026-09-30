import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import {
  FRONTDESK_HN2N_CCCD_SCANNER,
  GUEST_AI_FLOATING_CHAT,
  HOTEL_CHANNEL_MANAGER,
} from "@/features/hotel-features/hotel-features";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../_utils";

type FeatureParams = {
  params: Promise<{ hotelId: string; featureKey: string }>;
};

const updateHotelFeatureBodySchema = z
  .object({
    status: z.enum(["ENABLED", "DISABLED"]),
  })
  .strict();
const hotelFeatureKeySchema = z.enum([
  GUEST_AI_FLOATING_CHAT,
  FRONTDESK_HN2N_CCCD_SCANNER,
  HOTEL_CHANNEL_MANAGER,
]);

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: FeatureParams) {
  const { hotelId, featureKey } = await context.params;
  if (!hotelId?.trim() || !featureKey?.trim()) {
    return validationErrorResponse("hotelId and featureKey are required");
  }
  const parsedFeatureKey = hotelFeatureKeySchema.safeParse(featureKey.trim());
  if (!parsedFeatureKey.success) {
    return validationErrorResponse("featureKey is invalid");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const parsed = updateHotelFeatureBodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message ?? "Invalid feature status payload",
    );
  }

  try {
    const data = await adminService.setHotelFeatureStatus(
      hotelId.trim(),
      parsedFeatureKey.data,
      parsed.data,
    );
    return successResponse(
      data,
      200,
      "Cập nhật trạng thái tính năng thành công",
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse(error);
  }
}
