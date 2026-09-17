import {
  handleHotelOpsKbttConnectionRequest,
  type KbttRouteContext,
} from "../_connection-utils";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: KbttRouteContext) {
  return handleHotelOpsKbttConnectionRequest(request, context, "GET");
}

export function PUT(request: Request, context: KbttRouteContext) {
  return handleHotelOpsKbttConnectionRequest(request, context, "PUT");
}

export function DELETE(request: Request, context: KbttRouteContext) {
  return handleHotelOpsKbttConnectionRequest(request, context, "DELETE");
}
