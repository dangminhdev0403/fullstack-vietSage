import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; roomId: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: Params) {
  const { hotelId, roomId } = await context.params;
  if (!hotelId || !roomId) return validationErrorResponse("hotelId and roomId are required");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const rawStatus = (payload as Record<string, unknown>)?.status;
  if (typeof rawStatus !== "string" || !rawStatus.trim()) {
    return validationErrorResponse("Trạng thái phòng không hợp lệ");
  }

  const raw = rawStatus.trim().toUpperCase();
  const mapped =
    raw === "CLEAN" || raw === "CLEANED" || raw === "READY" || raw === "TRỐNG" ? "AVAILABLE" :
    raw === "DIRTY" || raw === "CHỜ DỌN" || raw === "CLEANING" ? "PROCESSING" :
    raw === "BẢO TRÌ" || raw === "OUT_OF_SERVICE" ? "MAINTENANCE" :
    raw === "KHÓA" || raw === "ĐÃ KHÓA" ? "BLOCKED" : raw;

  try {
    const data = await executeHotelOpsBackendRequest("update staff room status", (accessToken) =>
      hotelOpsService.updateRoomStatus(hotelId, roomId, mapped, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Cập nhật trạng thái phòng thành công");
  } catch (error) {
    if (error instanceof HttpError) return hotelOpsHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
