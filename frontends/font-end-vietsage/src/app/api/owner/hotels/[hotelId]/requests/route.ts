import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";
import { hotelRequestStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

function getPositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDayFilter(value: string | null, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) return trimmed;

  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
}

function normalizePriority(value: string | null): ListHotelRequestsQuery["priority"] {
  if (value === "NORMAL" || value === "URGENT") return value;
  return undefined;
}

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status");
  const rawPriority = searchParams.get("priority");
  const priority = normalizePriority(rawPriority);

  if (status && !(hotelRequestStatuses as string[]).includes(status)) {
    return validationErrorResponse("Request status filter is invalid");
  }

  if (rawPriority && !priority) {
    return validationErrorResponse("Request priority filter is invalid");
  }

  const query: ListHotelRequestsQuery = {
    page: getPositiveInt(searchParams.get("page"), 1),
    limit: getPositiveInt(searchParams.get("limit"), 20),
    status: status as ListHotelRequestsQuery["status"],
    priority,
    roomNumber: searchParams.get("roomNumber") ?? undefined,
    serviceItemId: searchParams.get("serviceItemId") ?? undefined,
    assignedToUserId: searchParams.get("assignedToUserId") ?? undefined,
    from: normalizeDayFilter(searchParams.get("from"), "start"),
    to: normalizeDayFilter(searchParams.get("to"), "end"),
  };

  try {
    const data = await executeOwnerBackendRequest("list owner hotel requests", (accessToken) => hotelOpsService.listRequests(hotelId, { query, accessToken }));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel requests fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
