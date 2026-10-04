import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
  validationErrorResponse,
} from "../../../../_backend";

type Params = { params: Promise<{ hotelId: string; logId: string }> };

export async function POST(_request: Request, context: Params) {
  const { hotelId, logId } = await context.params;
  if (!hotelId || !logId)
    return validationErrorResponse("hotelId and logId are required");
  return proxyAdminChannelManagerRequest({
    operation: "admin resolve channex modification",
    method: "POST",
    path: channelManagerBackendPath(
      hotelId,
      `channex/pending-modifications/${encodeURIComponent(logId)}/resolve`,
    ),
  });
}
