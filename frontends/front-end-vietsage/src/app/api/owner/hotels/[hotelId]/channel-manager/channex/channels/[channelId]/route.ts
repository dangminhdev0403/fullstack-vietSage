import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  validationErrorResponse,
} from "../../../_backend";

type Params = {
  params: Promise<{ hotelId: string; channelId: string }>;
};

export async function GET(_request: Request, context: Params) {
  const { hotelId, channelId } = await context.params;
  if (!hotelId || !channelId)
    return validationErrorResponse("hotelId and channelId are required");
  return proxyChannelManagerRequest({
    operation: "get channex channel",
    method: "GET",
    path: channelManagerBackendPath(
      hotelId,
      `channex/channels/${encodeURIComponent(channelId)}`,
    ),
  });
}

export async function PUT(request: Request, context: Params) {
  const { hotelId, channelId } = await context.params;
  if (!hotelId || !channelId)
    return validationErrorResponse("hotelId and channelId are required");
  const body = await request.json().catch(() => ({}));
  return proxyChannelManagerRequest({
    operation: "update channex channel",
    method: "PUT",
    path: channelManagerBackendPath(
      hotelId,
      `channex/channels/${encodeURIComponent(channelId)}`,
    ),
    body,
  });
}

export async function DELETE(_request: Request, context: Params) {
  const { hotelId, channelId } = await context.params;
  if (!hotelId || !channelId)
    return validationErrorResponse("hotelId and channelId are required");
  return proxyChannelManagerRequest({
    operation: "delete channex channel",
    method: "DELETE",
    path: channelManagerBackendPath(
      hotelId,
      `channex/channels/${encodeURIComponent(channelId)}`,
    ),
  });
}
