import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { executeOwnerBackendRequest, successResponse, validationErrorResponse } from "../../../../../../../_utils";

type Params = { params: Promise<{ hotelId: string; logId: string }> };

export async function POST(_request: Request, context: Params) {
  const { hotelId, logId } = await context.params;
  if (!hotelId || !logId) return validationErrorResponse("hotelId and logId are required");
  try {
    const result = await executeOwnerBackendRequest("resolve channex modification", async (accessToken) => {
      const response = await fetch(
        `${getBackendApiBaseUrl()}/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/channex/pending-modifications/${encodeURIComponent(logId)}/resolve`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Xác nhận đối soát thất bại");
      return data?.data ?? data;
    });
    if (result instanceof Response) return result;
    return successResponse(result, 200, "Đã xác nhận đối soát");
  } catch (error) {
    return NextResponse.json({ status: 500, message: error instanceof Error ? error.message : "Lỗi đối soát", data: null }, { status: 500 });
  }
}
