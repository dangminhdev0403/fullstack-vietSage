import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import { successResponse, validationErrorResponse } from "../../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; connectionId: string }>;
};

export async function POST(_request: Request, context: Params) {
  const { connectionId } = await context.params;
  if (!connectionId) {
    return validationErrorResponse("connectionId is required");
  }

  const result = channelManagerMockStore.syncNow(connectionId);
  return successResponse(result, 200, result.message);
}
