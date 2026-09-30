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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const baseUrl = getBackendApiBaseUrl();

  try {
    const result = await executeOwnerBackendRequest(
      "poll channex feed",
      async (accessToken) => {
        const backendRes = await fetch(
          `${baseUrl}/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/channex/poll-feed`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        const data = await backendRes.json();
        if (!backendRes.ok) {
          throw new Error(
            data.message || "Quét booking feed từ Channex thất bại",
          );
        }
        return data?.data ?? data;
      },
    );

    if (result instanceof Response) return result;

    return successResponse(
      result,
      200,
      "Xử lý booking feed từ Channex thành công",
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Quét booking feed từ Channex thất bại";
    return NextResponse.json(
      { status: 500, message, data: null },
      { status: 500 },
    );
  }
}
