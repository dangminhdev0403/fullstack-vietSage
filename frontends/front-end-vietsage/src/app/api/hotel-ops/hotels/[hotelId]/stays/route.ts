import {
  handleCreateAndCheckInStay,
  type CheckInStayRouteParams,
} from "./_check-in-handler";

export async function POST(request: Request, context: CheckInStayRouteParams) {
  return handleCreateAndCheckInStay(request, context);
}
