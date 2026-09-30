import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
  readJsonBody,
  validationErrorResponse,
} from "../../_backend";

type Params = {
  params: Promise<{ hotelId: string }>;
};

async function hotelIdFrom(context: Params) {
  return (await context.params).hotelId;
}

export async function GET(_request: Request, context: Params) {
  const hotelId = await hotelIdFrom(context);
  if (!hotelId) return validationErrorResponse("hotelId is required");
  return proxyAdminChannelManagerRequest({
    operation: "admin get channex channel catalog",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "channex/channels"),
  });
}

export async function PUT(request: Request, context: Params) {
  const hotelId = await hotelIdFrom(context);
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  return proxyAdminChannelManagerRequest({
    operation: "admin prepare channex channel",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "channex/channels/prepare"),
    body,
  });
}

export async function POST(request: Request, context: Params) {
  const hotelId = await hotelIdFrom(context);
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  return proxyAdminChannelManagerRequest({
    operation: "admin create channex channel",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "channex/channels"),
    body,
  });
}
