import { NextResponse } from "next/server";
import { z } from "zod";

import { executeHotelOpsBackendRequest, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";
import { kbttAutoSubmitEnabledSchema } from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ hotelId: string }> };

async function handle(request: Request, context: RouteContext, method: "GET" | "PUT") {
  const { hotelId } = await context.params;
  if (!z.string().trim().min(1).safeParse(hotelId).success) {
    return validationErrorResponse("Khách sạn không hợp lệ.");
  }
  let body: z.infer<typeof kbttAutoSubmitEnabledSchema> | undefined;
  if (method === "PUT") {
    const parsed = kbttAutoSubmitEnabledSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return validationErrorResponse("Trạng thái tự động gửi BCA không hợp lệ.");
    body = parsed.data;
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await executeHotelOpsBackendRequest("kbtt auto-submit enabled", async (accessToken) => {
      const payload = await httpServer.request<{ data: unknown }>(
        method, `/hotels/${encodeURIComponent(hotelId)}/kbtt/auto-submit/enabled`, body,
        { accessToken, headers },
      );
      return kbttAutoSubmitEnabledSchema.parse(payload?.data);
    });
    if (result instanceof Response) {
      result.headers.set("Cache-Control", "no-store");
      return result;
    }
    return NextResponse.json({ status: 200, error: null, message: "OK", data: result }, { headers });
  } catch (error) {
    const status = error instanceof HttpError && error.status >= 400 && error.status <= 599 ? error.status : 502;
    const detail = status === 403 ? "Bạn không có quyền thay đổi tự động gửi BCA."
      : status === 404 ? "Khách sạn chưa cấu hình kết nối BCA."
        : status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
          : "Không thể cập nhật trạng thái tự động gửi BCA.";
    return NextResponse.json({ status, message: "KBTT_AUTO_SUBMIT_ERROR", data: { detail } }, { status, headers });
  }
}

export function GET(request: Request, context: RouteContext) {
  return handle(request, context, "GET");
}

export function PUT(request: Request, context: RouteContext) {
  return handle(request, context, "PUT");
}
