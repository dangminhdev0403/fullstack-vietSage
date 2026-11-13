import { HttpError } from "@/core/http/http-error";
import { requestHotelExpensesBackend } from "@/features/billing/service/hotel-expenses-service";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Context = { params: Promise<{ hotelId: string; segments?: string[] }> };

async function forward(request: Request, context: Context) {
  const { hotelId, segments = [] } = await context.params;
  const [expenseId, action] = segments;

  const valid =
    request.method === "GET"
      ? segments.length === 0
      : request.method === "PATCH"
        ? segments.length === 1 && Boolean(expenseId)
        : request.method === "POST" &&
          (segments.length === 0 ||
            (segments.length === 2 &&
              Boolean(expenseId) &&
              (action === "pay" || action === "void")));

  if (!hotelId || !valid) {
    return validationErrorResponse("Thao tác sổ chi phí không hợp lệ.");
  }

  let body: unknown;
  if (request.method !== "GET") {
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Nội dung gửi lên không hợp lệ.");
    }
  }

  const url = new URL(request.url);
  try {
    const result = await executeHotelOpsBackendRequest("hotel expenses", (accessToken) =>
      requestHotelExpensesBackend(hotelId, accessToken, {
        method: request.method === "GET" ? "GET" : request.method === "PATCH" ? "PATCH" : "POST",
        suffix: segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : "",
        query: {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
          category: url.searchParams.get("category") ?? undefined,
          paymentStatus: url.searchParams.get("paymentStatus") ?? undefined,
          includeVoided: url.searchParams.get("includeVoided") ?? undefined,
        },
        body,
      }),
    );
    if (result instanceof Response) return result;
    return successResponse(result);
  } catch (error) {
    if (error instanceof HttpError) return hotelOpsHttpErrorResponse(error);
    return unknownServerErrorResponse(error);
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
