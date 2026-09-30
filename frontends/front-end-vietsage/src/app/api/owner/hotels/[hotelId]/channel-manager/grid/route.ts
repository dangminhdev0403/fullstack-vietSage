import {
  channelManagerBackendPath,
  proxyChannelManagerRequest,
} from "../_backend";
import { validationErrorResponse } from "../../../../_utils";

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

  return proxyChannelManagerRequest({
    operation: "get channel inventory",
    method: "GET",
    path: channelManagerBackendPath(hotelId, "inventory"),
    query: { date_from: dateFrom, date_to: dateTo },
  });
}
