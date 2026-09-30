import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
} from "../../../_backend";
import { validationErrorResponse } from "../../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; connectionId: string }>;
};

export async function POST(_request: Request, context: Params) {
  const { hotelId, connectionId } = await context.params;
  if (!hotelId || !connectionId) {
    return validationErrorResponse("hotelId and connectionId are required");
  }

  return proxyAdminChannelManagerRequest({
    operation: "admin sync channel connection",
    method: "POST",
    path: channelManagerBackendPath(
      hotelId,
      `connections/${encodeURIComponent(connectionId)}/sync-now`,
    ),
    body: {},
  });
}
