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

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const baseUrl = getBackendApiBaseUrl();

  try {
    const result = await executeOwnerBackendRequest(
      "get channex mappings",
      async (accessToken) => {
        const backendRes = await fetch(
          `${baseUrl}/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/channex/mappings`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          },
        );

        const data = await backendRes.json();
        if (!backendRes.ok) {
          throw new Error(data.message || "Lấy danh sách mapping thất bại");
        }
        return data?.data ?? data;
      },
    );

    if (result instanceof Response) return result;

    return successResponse(
      result,
      200,
      "Lấy danh sách mapping Channex thành công",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lấy danh sách mapping thất bại";
    return NextResponse.json(
      { status: 500, message, data: [] },
      { status: 500 },
    );
  }
}
