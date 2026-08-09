import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

export async function GET() {
  try { const data = await executeHotelOpsBackendRequest("service portal data", (token) => servicePortalClient.data(token)); return data instanceof Response ? data : successResponse(data); }
  catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null); if (!body || typeof body !== "object") return validationErrorResponse("Dữ liệu không hợp lệ");
  try { const data = await executeHotelOpsBackendRequest("update service profile", (token) => servicePortalClient.profile(token, body)); return data instanceof Response ? data : successResponse(data); }
  catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: string; orderId?: string; toStatus?: string; input?: unknown } | null;
  if (!body) return validationErrorResponse("Dữ liệu không hợp lệ");
  try {
    const data = body.action === "transition" && body.orderId && body.toStatus
      ? await executeHotelOpsBackendRequest("transition service order", (token) => servicePortalClient.transition(token, body.orderId!, body.toStatus!))
      : await executeHotelOpsBackendRequest("create service item", (token) => servicePortalClient.create(token, body.input));
    return data instanceof Response ? data : successResponse(data, 201);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
