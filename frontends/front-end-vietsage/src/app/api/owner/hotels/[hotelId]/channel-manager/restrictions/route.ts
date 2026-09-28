import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import type { RestrictionUpdateItem } from "@/features/channel-manager/types/channel-manager.types";
import { successResponse, validationErrorResponse } from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function PUT(request: Request, context: Params) {
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

  const items = (body as { items?: RestrictionUpdateItem[] })?.items;
  if (!Array.isArray(items)) {
    return validationErrorResponse("items array is required");
  }

  const result = channelManagerMockStore.updateRestrictions(hotelId, items);
  return successResponse(result, 200, "Restrictions updated successfully");
}
