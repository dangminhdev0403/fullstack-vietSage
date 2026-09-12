import { handleKbttRequest, type KbttRouteContext } from "../_utils";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: KbttRouteContext) {
  return handleKbttRequest(request, context, "GET");
}

export function PUT(request: Request, context: KbttRouteContext) {
  return handleKbttRequest(request, context, "PUT");
}

export function DELETE(request: Request, context: KbttRouteContext) {
  return handleKbttRequest(request, context, "DELETE");
}
