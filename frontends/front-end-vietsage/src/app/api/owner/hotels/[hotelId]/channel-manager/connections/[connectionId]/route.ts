import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
} from "../../_backend";
import { validationErrorResponse } from "../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; connectionId: string }>;
};

export async function DELETE(_request: Request, context: Params) {
  const { hotelId, connectionId } = await context.params;
  if (!hotelId || !connectionId) {
    return validationErrorResponse("hotelId and connectionId are required");
  }

  return proxyChannelManagerRequest({
    operation: "delete channel connection",
    method: "DELETE",
    path: channelManagerBackendPath(
      hotelId,
      `connections/${encodeURIComponent(connectionId)}`,
    ),
  });
}
