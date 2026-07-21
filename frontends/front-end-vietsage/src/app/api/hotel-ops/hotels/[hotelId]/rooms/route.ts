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

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const status = url.searchParams.get("status")?.trim() || undefined;
  const floor = url.searchParams.get("floor")?.trim() || undefined;
  const type = url.searchParams.get("type")?.trim() || undefined;
  const vipOnly = url.searchParams.get("vipOnly") === "true" || undefined;

  try {
    const data = await executeHotelOpsBackendRequest("list staff rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, {
        query: {
          page,
          limit,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(floor ? { floor } : {}),
          ...(type ? { type } : {}),
          ...(vipOnly ? { vipOnly } : {}),
        },
        accessToken,
      }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Rooms fetched successfully");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
