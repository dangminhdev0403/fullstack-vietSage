import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const params = new URL(request.url).searchParams;
  const priority = params.get("priority");
  const query: Pick<ListHotelRequestsQuery, "roomNumber" | "serviceItemId" | "priority" | "assignedToUserId"> = {
    roomNumber: params.get("roomNumber") ?? undefined,
    serviceItemId: params.get("serviceItemId") ?? undefined,
    priority: priority === "NORMAL" || priority === "URGENT" ? priority : undefined,
    assignedToUserId: params.get("assignedToUserId") ?? undefined,
  };

  try {
    const data = await executeHotelOpsBackendRequest("summarize hotel requests", (accessToken) =>
      hotelOpsService.getRequestsSummary(hotelId, { query, accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
