import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import type { BulkUpdatePayload } from "@/features/channel-manager/types/channel-manager.types";
import { successResponse, validationErrorResponse } from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse("Invalid JSON payload");
  }

  const payload = body as Partial<BulkUpdatePayload>;
  if (!payload.dateFrom || !payload.dateTo || !Array.isArray(payload.daysOfWeek)) {
    return validationErrorResponse("dateFrom, dateTo, and daysOfWeek are required");
  }

  const result = channelManagerMockStore.bulkUpdate(hotelId, {
    roomTypeIds: payload.roomTypeIds,
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    daysOfWeek: payload.daysOfWeek,
    rate: payload.rate,
    minStay: payload.minStay,
    stopSell: payload.stopSell,
  });

  return successResponse(result, 200, result.message);
}
