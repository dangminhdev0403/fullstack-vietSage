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
const paymentMethodEnum = z.enum(["CASH", "BANK_TRANSFER", "CARD", "MANUAL"]);
const paymentSplitSchema = z
  .object({
    method: paymentMethodEnum,
    amount: z.number().finite().positive(),
    destinationAccount: z.string().trim().max(120).optional(),
  })
  .strict();

const schema = z
  .object({
    method: paymentMethodEnum.default("MANUAL"),
    note: z.string().trim().max(500).optional(),
    amount: z.number().finite().positive().optional(),
    splits: z.array(paymentSplitSchema).min(1).max(4).optional(),
    destinationAccount: z.string().trim().max(120).optional(),
    clientRequestId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.splits ||
      new Set(data.splits.map((leg) => leg.method)).size === data.splits.length,
    "Không được trùng phương thức thanh toán",
  )
  .refine(
    (data) => {
      if (!data.splits || data.amount === undefined) return true;
      const sum = Math.round(data.splits.reduce((acc, leg) => acc + leg.amount, 0) * 100) / 100;
      return Math.abs(sum - data.amount) < 0.01;
    },
    "Tổng số tiền chia theo phương thức phải khớp số tiền thu",
  );

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
