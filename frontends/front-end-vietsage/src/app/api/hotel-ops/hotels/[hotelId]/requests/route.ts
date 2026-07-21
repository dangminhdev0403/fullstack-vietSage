import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";
import { hotelRequestStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string }> };

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDayFilter(value: string | null, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!displayMatch) return value.trim();
  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
}

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  if (status && !(hotelRequestStatuses as string[]).includes(status)) {
    return validationErrorResponse("Request status filter is invalid");
  }

  const priority = params.get("priority");
  if (priority && priority !== "NORMAL" && priority !== "URGENT") {
    return validationErrorResponse("Request priority filter is invalid");
  }

  const query: ListHotelRequestsQuery = {
    page: positiveInt(params.get("page"), 1),
    limit: positiveInt(params.get("limit"), 20),
    status: status as ListHotelRequestsQuery["status"],
    priority: priority as ListHotelRequestsQuery["priority"],
    roomNumber: params.get("roomNumber") ?? undefined,
    serviceItemId: params.get("serviceItemId") ?? undefined,
    assignedToUserId: params.get("assignedToUserId") ?? undefined,
    from: normalizeDayFilter(params.get("from"), "start"),
    to: normalizeDayFilter(params.get("to"), "end"),
  };

  try {
    const data = await executeHotelOpsBackendRequest("list hotel requests", (accessToken) =>
      hotelOpsService.listRequests(hotelId, { query, accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError
      ? hotelOpsHttpErrorResponse(error)
      : unknownServerErrorResponse();
  }
}
