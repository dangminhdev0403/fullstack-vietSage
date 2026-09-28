import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import { successResponse, validationErrorResponse } from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom") || new Date().toISOString().split("T")[0];
  const dateTo =
    searchParams.get("dateTo") ||
    new Date(Date.now() + 13 * 86400000).toISOString().split("T")[0];

  const grid = channelManagerMockStore.getInventoryGrid(hotelId, dateFrom, dateTo);
  return successResponse(grid, 200, "Inventory grid fetched successfully");
}
