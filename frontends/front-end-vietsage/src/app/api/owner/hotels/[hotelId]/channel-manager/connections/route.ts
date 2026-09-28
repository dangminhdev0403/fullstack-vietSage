import { channelManagerMockStore } from "@/features/channel-manager/api/channel-manager-mock-store";
import type { CreateConnectionPayload } from "@/features/channel-manager/types/channel-manager.types";
import { successResponse, validationErrorResponse } from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const data = channelManagerMockStore.getConnections(hotelId);
  return successResponse(data, 200, "Channel connections fetched successfully");
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse("Invalid JSON payload");
  }

  const payload = body as Partial<CreateConnectionPayload>;
  if (!payload.channelType || !payload.name || !payload.inboundUrl) {
    return validationErrorResponse("channelType, name, and inboundUrl are required");
  }

  const newConn = channelManagerMockStore.createConnection(hotelId, {
    channelType: payload.channelType,
    name: payload.name,
    inboundUrl: payload.inboundUrl,
  });

  return successResponse(newConn, 201, "Connection created successfully");
}
