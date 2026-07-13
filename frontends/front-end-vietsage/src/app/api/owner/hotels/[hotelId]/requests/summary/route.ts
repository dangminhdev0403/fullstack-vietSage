import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const searchParams = new URL(request.url).searchParams;
  const priority = searchParams.get("priority") ?? undefined;
  if (priority && priority !== "NORMAL" && priority !== "URGENT") {
    return validationErrorResponse("Request priority filter is invalid");
  }

  const query: Pick<ListHotelRequestsQuery, "roomNumber" | "serviceItemId" | "priority" | "assignedToUserId"> = {
    roomNumber: searchParams.get("roomNumber") ?? undefined,
    serviceItemId: searchParams.get("serviceItemId") ?? undefined,
    priority: priority as ListHotelRequestsQuery["priority"],
    assignedToUserId: searchParams.get("assignedToUserId") ?? undefined,
  };

  try {
    const data = await executeOwnerBackendRequest("summarize owner hotel requests", (accessToken) => hotelOpsService.getRequestsSummary(hotelId, { query, accessToken }));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel request summary fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
