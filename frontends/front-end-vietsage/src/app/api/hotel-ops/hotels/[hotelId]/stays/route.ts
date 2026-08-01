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

type Params = { params: Promise<{ hotelId: string }> };
const schema = z.object({
  roomId: z.string().trim().min(1),
  guestDisplayName: z.string().trim().min(1),
  guestPhone: z.string().trim().optional(),
  guestIdentityNumber: z.string().trim().max(32).optional(),
  guestDateOfBirth: z.string().trim().max(20).optional(),
  guestGender: z.string().trim().max(20).optional(),
  guestNationality: z.string().trim().max(80).optional(),
  guestResidencePlace: z.string().trim().max(500).optional(),
  plannedCheckInAt: z.string().trim().min(1),
  plannedCheckOutAt: z.string().trim().min(1),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin check-in không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("create and check in stay", (accessToken) =>
      hotelOpsService.createAndCheckInStay(hotelId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Đã check-in và kích hoạt QR phòng");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
