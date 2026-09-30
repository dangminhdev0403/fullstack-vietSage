import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  readJsonBody,
} from "../_backend";
import { validationErrorResponse } from "../../../../_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  return proxyChannelManagerRequest({
    operation: "bulk update channel restrictions",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "inventory/bulk-update"),
    body,
  });
}
