import { handleKbttAutoSubmitRequest, type KbttRouteContext } from "../_utils";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: KbttRouteContext) {
  return handleKbttAutoSubmitRequest(request, context, "GET");
}

export function PUT(request: Request, context: KbttRouteContext) {
  return handleKbttAutoSubmitRequest(request, context, "PUT");
}

export function POST(request: Request, context: KbttRouteContext) {
  return handleKbttAutoSubmitRequest(request, context, "POST");
}
