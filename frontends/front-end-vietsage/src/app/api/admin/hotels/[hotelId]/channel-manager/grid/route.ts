import {
  channelManagerBackendPath,
  proxyAdminChannelManagerRequest,
  validationErrorResponse,
} from "../_backend";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const searchParams = new URL(request.url).searchParams;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (!dateFrom || !dateTo) {
    return validationErrorResponse("dateFrom and dateTo are required");
  }

  return proxyAdminChannelManagerRequest({
    operation: "admin get channel inventory",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "inventory"),
    query: { date_from: dateFrom, date_to: dateTo },
  });
}
