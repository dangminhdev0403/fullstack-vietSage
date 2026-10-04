import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
  validationErrorResponse,
} from "../../_backend";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  return proxyAdminChannelManagerRequest({
    operation: "admin list pending channex modifications",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "channex/pending-modifications"),
  });
}
