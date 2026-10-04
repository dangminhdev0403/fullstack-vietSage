import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { executeOwnerBackendRequest, successResponse, validationErrorResponse } from "../../../../../_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  try {
    const result = await executeOwnerBackendRequest("list pending channex modifications", async (accessToken) => {
      const response = await fetch(
        `${getBackendApiBaseUrl()}/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/channex/pending-modifications`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Lấy danh sách đối soát thất bại");
      return data?.data ?? data;
    });
    if (result instanceof Response) return result;
    return successResponse(result, 200, "Lấy danh sách đối soát thành công");
  } catch (error) {
    return NextResponse.json({ status: 500, message: error instanceof Error ? error.message : "Lỗi đối soát", data: null }, { status: 500 });
  }
}
