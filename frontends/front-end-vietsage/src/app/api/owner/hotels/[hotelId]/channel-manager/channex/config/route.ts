import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  readJsonBody,
  validationErrorResponse,
} from "../../_backend";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  return proxyChannelManagerRequest({
    operation: "get channex config",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "channex/config"),
  });
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  return proxyChannelManagerRequest({
    operation: "configure channex property",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "channex/config"),
    body,
  });
}
