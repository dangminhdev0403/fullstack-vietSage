import { NextResponse } from "next/server";
import { z } from "zod";

import {
  executeHotelOpsBackendRequest,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";
import {
  kbttConnectionSchema,
  kbttCredentialsSchema,
  kbttErrorCode,
  kbttErrorMessage,
  type KbttCredentials,
} from "@/features/kbtt/types/kbtt-contract";

export type KbttRouteContext = { params: Promise<{ hotelId: string }> };

export async function handleHotelOpsKbttConnectionRequest(
  request: Request,
  context: KbttRouteContext,
  method: "GET" | "PUT" | "POST" | "DELETE",
) {
  const { hotelId } = await context.params;
  if (!z.string().trim().min(1).safeParse(hotelId).success) {
    return validationErrorResponse("Khách sạn không hợp lệ.");
  }

  let credentials: KbttCredentials | undefined;
  if (method === "PUT") {
    const parsed = kbttCredentialsSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return validationErrorResponse("Vui lòng nhập tài khoản và mật khẩu hợp lệ.");
    }
    credentials = parsed.data;
  }

  try {
    const result = await executeHotelOpsBackendRequest(
      `kbtt ${method}`,
      async (accessToken) => {
        const payload = await httpServer.request<{ data: unknown }>(
          method,
          `/hotels/${encodeURIComponent(hotelId)}/kbtt/connection${method === "POST" ? "/check" : ""}`,
          credentials,
          { accessToken, headers: { "Cache-Control": "no-store" } },
        );
        const connection = kbttConnectionSchema.parse(payload?.data);
        return {
          ...connection,
          lastErrorCode: connection.lastErrorCode
            ? kbttErrorCode({ code: connection.lastErrorCode })
            : null,
          lastErrorMessage:
            connection.lastErrorCode || connection.lastErrorMessage
              ? kbttErrorMessage(connection.lastErrorCode)
              : null,
        };
      },
    );

    if (result instanceof Response) {
      result.headers.set("Cache-Control", "no-store");
      return result;
    }

    return NextResponse.json(
      { status: 200, error: null, message: "OK", data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof HttpError && error.status >= 400 && error.status <= 599
        ? error.status
        : 502;
    const code = error instanceof HttpError ? kbttErrorCode(error.data) : null;
    const detail =
      status === 403
        ? "Bạn không có quyền quản lý kết nối của khách sạn này."
        : status === 404
          ? "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập."
          : status === 401
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            : kbttErrorMessage(code);
    return NextResponse.json(
      { status, message: "KBTT_ERROR", data: { code, detail } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (credentials) credentials.password = "";
  }
}
