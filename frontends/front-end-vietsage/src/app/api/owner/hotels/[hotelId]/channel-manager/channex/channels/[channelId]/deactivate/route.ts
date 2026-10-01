import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
  validationErrorResponse,
} from "../../../../_backend";

type Params = {
  params: Promise<{ hotelId: string; channelId: string }>;
};

export async function POST(_request: Request, context: Params) {
  const { hotelId, channelId } = await context.params;
  if (!hotelId || !channelId)
    return validationErrorResponse("hotelId and channelId are required");
  return proxyChannelManagerRequest({
    operation: "deactivate channex channel",
    method: "POST",
    path: channelManagerBackendPath(
      hotelId,
      `channex/channels/${encodeURIComponent(channelId)}/deactivate`,
    ),
    body: {},
  });
}
