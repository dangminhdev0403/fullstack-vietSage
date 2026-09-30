import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  readJsonBody,
} from "../_backend";
import { validationErrorResponse } from "../../../../_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  return proxyChannelManagerRequest({
    operation: "list channel connections",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "connections"),
  });
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  return proxyChannelManagerRequest({
    operation: "create channel connection",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "connections"),
    body,
  });
}
