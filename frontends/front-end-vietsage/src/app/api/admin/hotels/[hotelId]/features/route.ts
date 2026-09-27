import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type HotelParams = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: HotelParams) {
  const { hotelId } = await context.params;
  if (!hotelId?.trim()) {
    return validationErrorResponse("hotelId is required");
  }

  try {
    const data = await adminService.getHotelFeatures(hotelId.trim());
    return successResponse(data, 200, "Lấy danh sách tính năng khách sạn thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse(error);
  }
}
