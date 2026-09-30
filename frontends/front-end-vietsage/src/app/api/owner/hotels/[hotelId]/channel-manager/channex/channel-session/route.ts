import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import {
  executeOwnerBackendRequest,
  successResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await executeOwnerBackendRequest(
      "create channex channel session",
      async (accessToken) => {
        const response = await fetch(
          `${getBackendApiBaseUrl()}/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/channex/channel-session`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            cache: "no-store",
          },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data?.data?.detail ||
              data?.message ||
              "Không thể mở Channex Channels",
          );
        }
        return data?.data ?? data;
      },
    );
    if (result instanceof Response) return result;
    const response = successResponse(
      result,
      200,
      "Tạo phiên quản lý kênh Channex thành công",
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể mở Channex Channels";
    return NextResponse.json(
      { status: 500, message, data: null },
      { status: 500 },
    );
  }
}
