import { handleKbttRequest, type KbttRouteContext } from "../../_utils";

export function POST(request: Request, context: KbttRouteContext) {
  return handleKbttRequest(request, context, "POST");
}
