import { NextResponse } from "next/server";
import { HttpError } from "@/core/http/http-error";
import { billingService } from "@/features/billing/service/billing-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; folioId: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId, folioId } = await context.params;
  if (!hotelId || !folioId) return validationErrorResponse("hotelId and folioId are required");
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "1";
  const limit = url.searchParams.get("limit") ?? "100";
  try {
    const data = await executeHotelOpsBackendRequest("list billing folio items", (accessToken) =>
      billingService.listFolioItems(hotelId, folioId, { query: { page, limit }, accessToken }),
    );
    if (data instanceof NextResponse) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
