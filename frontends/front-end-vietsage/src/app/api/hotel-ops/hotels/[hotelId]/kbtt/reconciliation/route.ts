import { NextResponse } from "next/server";
import { z } from "zod";
import { executeHotelOpsBackendRequest, validationErrorResponse, hotelOpsHttpErrorResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";
import { kbttReconciliationSchema } from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params;
  if (!z.string().trim().min(1).max(128).safeParse(hotelId).success) return validationErrorResponse("Khách sạn không hợp lệ.");
  const params = new URL(request.url).searchParams;
  const force = params.get("force");
  const localOnly = params.get("localOnly");
  if (force !== null && force !== "true" && force !== "false") return validationErrorResponse("Yêu cầu làm mới không hợp lệ.");
  if (localOnly !== null && localOnly !== "true" && localOnly !== "false") return validationErrorResponse("Yêu cầu tải khách không hợp lệ.");
  if (localOnly === "true" && force === "true") return validationErrorResponse("Không thể vừa làm mới BCA vừa chỉ tải khách VietSage.");
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await executeHotelOpsBackendRequest("kbtt reconciliation", async (accessToken) => {
      const payload = await httpServer.request<{ data: unknown }>("GET",
        `/hotels/${encodeURIComponent(hotelId)}/kbtt/reconciliation${localOnly === "true" ? "?localOnly=true" : force === "true" ? "?force=true" : ""}`, undefined, { accessToken, headers });
      return kbttReconciliationSchema.parse(payload.data);
    });
    if (result instanceof Response) { result.headers.set("Cache-Control", "no-store"); return result; }
    return NextResponse.json({ status: 200, error: null, message: "OK", data: result }, { headers });
  } catch (error) {
    const response = error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
