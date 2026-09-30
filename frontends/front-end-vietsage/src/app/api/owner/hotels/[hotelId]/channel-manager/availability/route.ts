import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  readJsonBody,
} from "../_backend";
import { validationErrorResponse } from "../../../../_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function PUT(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  return proxyChannelManagerRequest({
    operation: "update channel availability",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "inventory/availability"),
    body,
  });
}
