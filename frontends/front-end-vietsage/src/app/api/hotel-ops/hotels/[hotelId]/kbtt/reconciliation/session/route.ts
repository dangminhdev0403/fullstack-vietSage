import { NextResponse } from "next/server";
import { z } from "zod";
import { executeHotelOpsBackendRequest, validationErrorResponse, hotelOpsHttpErrorResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";

export const dynamic = "force-dynamic";
const sessionSchema = z.object({ ready: z.literal(true) });
export async function POST(_request: Request, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params;
  if (!z.string().trim().min(1).max(128).safeParse(hotelId).success) return validationErrorResponse("Khách sạn không hợp lệ.");
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await executeHotelOpsBackendRequest("kbtt reconciliation session", async (accessToken) => {
      const payload = await httpServer.request<{ data: unknown }>("POST",
        `/hotels/${encodeURIComponent(hotelId)}/kbtt/reconciliation/session`, undefined, { accessToken, headers });
      return sessionSchema.parse(payload.data);
    });
    if (result instanceof Response) { result.headers.set("Cache-Control", "no-store"); return result; }
    return NextResponse.json({ status: 200, error: null, message: "OK", data: result }, { headers });
  } catch (error) {
    const response = error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
