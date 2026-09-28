import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import { successResponse, validationErrorResponse } from "../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; connectionId: string }>;
};

export async function DELETE(_request: Request, context: Params) {
  const { hotelId, connectionId } = await context.params;
  if (!hotelId || !connectionId) {
    return validationErrorResponse("hotelId and connectionId are required");
  }

  const result = channelManagerMockStore.deleteConnection(hotelId, connectionId);
  return successResponse(result, 200, "Connection deleted successfully");
}
