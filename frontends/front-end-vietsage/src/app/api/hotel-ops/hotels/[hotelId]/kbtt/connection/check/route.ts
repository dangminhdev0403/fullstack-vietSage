import {
  handleHotelOpsKbttConnectionRequest,
  type KbttRouteContext,
} from "../../_connection-utils";

export const dynamic = "force-dynamic";

export function POST(request: Request, context: KbttRouteContext) {
  return handleHotelOpsKbttConnectionRequest(request, context, "POST");
}
