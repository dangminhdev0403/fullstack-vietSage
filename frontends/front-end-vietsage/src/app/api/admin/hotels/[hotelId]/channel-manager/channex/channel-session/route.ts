import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
  readJsonBody,
  validationErrorResponse,
} from "../../_backend";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  return proxyAdminChannelManagerRequest({
    operation: "admin channex channel session",
    method: "POST",
    path: channelManagerBackendPath(hotelId, "channex/channel-session"),
    body,
  });
}
