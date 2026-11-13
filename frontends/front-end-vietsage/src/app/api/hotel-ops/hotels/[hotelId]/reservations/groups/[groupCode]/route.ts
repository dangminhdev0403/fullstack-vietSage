import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; groupCode: string }> };

const updateGroupBodySchema = z
  .object({
    groupName: z.string().trim().max(120).nullable().optional(),
    leadGuestName: z
      .string()
      .trim()
      .min(2, "Tên trưởng đoàn tối thiểu 2 ký tự")
      .max(120)
      .optional(),
    leadGuestPhone: z.string().trim().max(40).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    sourceCategory: z
      .enum(["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"])
      .optional(),
    sourcePartnerId: z.string().trim().min(1).nullable().optional(),
    bookingOwnerUserId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export async function GET(_request: Request, context: Params) {
  const { hotelId, groupCode } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!groupCode) return validationErrorResponse("groupCode is required");

  const decodedGroupCode = decodeURIComponent(groupCode);

  try {
    const data = await executeHotelOpsBackendRequest(
      "get group reservation details",
      async (accessToken) => {
        return await hotelOpsService.getGroupDetails(hotelId, decodedGroupCode, {
          accessToken,
        });
      },
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: Params) {
  const { hotelId, groupCode } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!groupCode) return validationErrorResponse("groupCode is required");

  const rawBody = await request.json().catch(() => null);
  const parsed = updateGroupBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message || "Thông tin cập nhật đoàn không hợp lệ",
    );
  }

  const decodedGroupCode = decodeURIComponent(groupCode);

  try {
    const data = await executeHotelOpsBackendRequest(
      "update group shared fields",
      async (accessToken) => {
        return await hotelOpsService.updateGroupSharedFields(
          hotelId,
          decodedGroupCode,
          parsed.data,
          { accessToken },
        );
      },
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}
