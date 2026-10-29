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

const createPartnerSchema = z.object({
  name: z.string().trim().min(2, "Tên đối tác tối thiểu 2 ký tự").max(120),
  code: z.string().trim().min(1, "Mã đối tác tối thiểu 1 ký tự").max(40),
  category: z.enum(["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"]).default("DIRECT"),
  contactPerson: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().email().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
}).strict();

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const q = searchParams.get("q") || undefined;
  const isActive = searchParams.get("isActive") === "false" ? false : undefined;

  try {
    const data = await executeHotelOpsBackendRequest(
      "list booking partners",
      async (accessToken) => {
        return await hotelOpsService.listBookingPartners(
          hotelId,
          { category, q, isActive },
          accessToken,
        );
      },
    );

    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy danh sách đối tác thành công");
  } catch (error) {
    return error instanceof HttpError
      ? hotelOpsHttpErrorResponse(error)
      : unknownServerErrorResponse("Không thể tải danh sách đối tác");
  }
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const parsed = createPartnerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message || "Thông tin đối tác không hợp lệ");
  }

  try {
    const data = await executeHotelOpsBackendRequest(
      "create booking partner",
      async (accessToken) => {
        return await hotelOpsService.createBookingPartner(
          hotelId,
          parsed.data,
          accessToken,
        );
      },
    );

    if (data instanceof Response) return data;
    return successResponse(data, 201, "Tạo đối tác thành công");
  } catch (error) {
    return error instanceof HttpError
      ? hotelOpsHttpErrorResponse(error)
      : unknownServerErrorResponse("Không thể tạo đối tác");
  }
}
