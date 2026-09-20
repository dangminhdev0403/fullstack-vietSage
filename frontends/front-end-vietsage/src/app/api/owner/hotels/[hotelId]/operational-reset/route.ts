import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type HotelParams = {
  params: Promise<{ hotelId: string }>;
};

export async function POST(_request: Request, context: HotelParams) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  try {
    const data = await executeOwnerBackendRequest(
      "reset owner hotel operational data",
      (accessToken?: string) => adminService.resetHotelOperationalData(hotelId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Thiết lập lại dữ liệu vận hành thành công");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
