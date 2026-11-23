import { HttpError } from "@/core/http/http-error";
import { upsertHotelRevenueTargetBackend } from "@/features/hotel-reports/service/revenue-book-service";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Context = { params: Promise<{ hotelId: string }> };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function PUT(request: Request, context: Context) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("Thiếu mã khách sạn.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse("Nội dung gửi lên không hợp lệ.");
  }

  const payload = body as { month?: unknown; targetAmount?: unknown } | null;
  const month =
    typeof payload?.month === "string" ? payload.month.trim() : "";
  const targetAmount = payload?.targetAmount;

  if (
    !MONTH_PATTERN.test(month) ||
    typeof targetAmount !== "number" ||
    !Number.isFinite(targetAmount) ||
    targetAmount < 0
  ) {
    return validationErrorResponse(
      "Tháng mục tiêu hoặc số tiền mục tiêu không hợp lệ.",
    );
  }

  try {
    const result = await executeHotelOpsBackendRequest(
      "upsert hotel revenue target",
      (accessToken) =>
        upsertHotelRevenueTargetBackend(hotelId, accessToken, {
          month,
          targetAmount,
        }),
    );
    if (result instanceof Response) return result;
    return successResponse(result);
  } catch (error) {
    if (error instanceof HttpError) return hotelOpsHttpErrorResponse(error);
    return unknownServerErrorResponse(error);
  }
}
