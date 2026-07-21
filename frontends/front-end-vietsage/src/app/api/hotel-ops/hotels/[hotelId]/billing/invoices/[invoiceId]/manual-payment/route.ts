import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { billingService } from "@/features/billing/service/billing-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; invoiceId: string }> };
const schema = z.object({
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MANUAL"]),
  note: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId, invoiceId } = await context.params;
  if (!hotelId || !invoiceId) return validationErrorResponse("hotelId and invoiceId are required");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin thanh toán không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("confirm counter payment", (accessToken) =>
      billingService.confirmManualPayment(hotelId, invoiceId, parsed.data, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Đã thu tiền và hoàn tất checkout");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
