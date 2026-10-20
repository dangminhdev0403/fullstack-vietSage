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

type Params = {
  params: Promise<{ hotelId: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Thiếu mã khách sạn (hotelId)"),
});

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from phải có định dạng YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to phải có định dạng YYYY-MM-DD"),
});

export async function GET(request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(
      paramsResult.error.issues[0]?.message || "Thiếu mã khách sạn (hotelId)",
    );
  }
  const { hotelId } = paramsResult.data;

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message || "Khoảng thời gian không hợp lệ (YYYY-MM-DD)",
    );
  }

  const { from, to } = parsed.data;

  try {
    const data = await executeHotelOpsBackendRequest("get room plan", (accessToken) =>
      hotelOpsService.getRoomPlan(hotelId, { from, to }, { accessToken }),
    );

    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}
