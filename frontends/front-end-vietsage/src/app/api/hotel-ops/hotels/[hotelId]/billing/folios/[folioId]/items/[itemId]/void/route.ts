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

type Params = { params: Promise<{ hotelId: string; folioId: string; itemId: string }> };

export async function POST(request: Request, context: Params) {
  const { hotelId, folioId, itemId } = await context.params;
  if (!hotelId || !folioId || !itemId) return validationErrorResponse("hotelId, folioId, and itemId are required");
  try {
    const body = await request.json().catch(() => ({}));
    const data = await executeHotelOpsBackendRequest("void billing folio item", (accessToken) =>
      billingService.voidFolioItem(hotelId, folioId, itemId, body, { accessToken }),
    );
    if (data instanceof NextResponse) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
