import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { httpServer } from "@/core/http/http-server";
import { HttpError } from "@/core/http/http-error";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type { AuthProfileData } from "@/features/auth/types/auth-contract";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { MobileShiftStore, MobileShiftError } from "./mobile-shift-store";
import { mobileShiftAvailable, sameOrigin } from "./mobile-shift-security";

const state = globalThis as typeof globalThis & { cccdShiftStore?: MobileShiftStore; cccdShiftTimer?: ReturnType<typeof setInterval> };
export const shiftStore = state.cccdShiftStore ??= new MobileShiftStore();
state.cccdShiftTimer ??= setInterval(() => shiftStore.cleanup(), 1_000);
state.cccdShiftTimer.unref();
export const MOBILE_COOKIE = "vietsage-cccd-scan";
export const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
});
export function guard(request: Request) {
  if (!mobileShiftAvailable(process.env.NODE_ENV)) throw new MobileShiftError("SHARED_STORE_REQUIRED", 503);
  if (!sameOrigin(request)) throw new MobileShiftError("INVALID_ORIGIN", 403);
}
export function failure(error: unknown) {
  const status = error instanceof MobileShiftError ? error.status : error instanceof RangeError ? 413 : error instanceof HttpError ? (error.status === 401 || error.status === 403 ? error.status : 503) : 422;
  const code = error instanceof MobileShiftError ? error.code : status === 413 ? "BODY_LIMIT" : status === 503 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST";
  const message = code === "SHARED_STORE_REQUIRED" ? "Quét điện thoại chưa được bật trên production: cần kho chuyển tiếp dùng chung."
    : status === 401 ? "Phiên lễ tân đã hết hạn. Đăng nhập lại trên máy lễ tân."
    : status === 403 ? "Không có quyền sử dụng phiên quét này."
    : status === 404 ? "Phiên đã hết hạn hoặc bị ngắt. Hãy kết nối lại."
    : status === 409 ? "Máy lễ tân chưa sẵn sàng hoặc lượt quét đã đổi. Hãy kiểm tra lại."
    : status === 503 ? "Chưa kết nối được máy chủ. Dữ liệu chưa được gửi."
    : "Yêu cầu không hợp lệ. Hãy thử lại.";
  return json({ error: message, message, code }, status);
}
async function profile(accessToken: string, hotelId: string) {
  const raw = await httpServer.get<unknown>("/auth/me", { accessToken });
  const p = unwrapApiEnvelope<AuthProfileData>(raw).data;
  if (p.status !== "ACTIVE" || !p.permissions.includes("hotel.stays.manage")) throw new MobileShiftError("NO_SCAN_PERMISSION", 403);
  let hotel = p.accessibleHotels.find((item) => item.id === hotelId);
  if (p.activeRole.code === "TENANT_OWNER") {
    // Existing owner authorization is enforced by the hotel rooms backend, not cached browser roles.
    await httpServer.get(`/hotels/${encodeURIComponent(hotelId)}/rooms`, { accessToken, query: { page: 1, limit: 1 } });
    hotel ??= { id: hotelId, name: "Khách sạn đang chọn", code: "", tenantId: "" };
  }
  if (!hotel) throw new MobileShiftError("WRONG_HOTEL", 403);
  // Decode only AFTER the backend has validated signature, live session and role.
  const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  if (typeof claims.sid !== "string" || claims.sub !== p.id) throw new MobileShiftError("INVALID_PARENT", 401);
  return { operatorId: p.id, parentId: claims.sid as string, hotelLabel: hotel.name, operatorLabel: p.fullName };
}
export async function desktopOwner(request: Request, hotelId: string, deskId: string) {
  const session = await auth();
  if (!session?.user?.id || session.authError) throw new MobileShiftError("NO_PARENT", 401);
  let tokens = await readServerSessionTokens(request);
  if (!tokens.accessToken) throw new MobileShiftError("NO_PARENT", 401);
  // Only desktop requests rotate its session; a phone can never prolong the parent login.
  if (tokens.refreshToken && (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt <= Date.now() + 30_000)) {
    tokens = { ...tokens, ...await refreshAndSaveSessionTokens(tokens.refreshToken) };
  }
  const validated = await profile(tokens.accessToken!, hotelId);
  if (validated.operatorId !== session.user.id) throw new MobileShiftError("INVALID_PARENT", 401);
  const owner = { hotelId, deskId, operatorId: validated.operatorId, parentId: validated.parentId };
  shiftStore.desk(owner, tokens.accessToken!);
  return { owner, labels: validated, accessToken: tokens.accessToken! };
}
export async function phoneToken(validate = true) {
  const token = (await cookies()).get(MOBILE_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new MobileShiftError();
  if (validate) {
    const parent = shiftStore.parent(token);
    try {
      const validated = await profile(parent.accessToken, parent.hotelId);
      if (validated.operatorId !== parent.operatorId || validated.parentId !== parent.parentId) throw new MobileShiftError("INVALID_PARENT", 403);
    } catch (error) {
      // Preserve pairing on transient auth/token/network errors; never allow scan acceptance while unauthorized.
      if (error instanceof HttpError && error.status === 401) {
        const exp = JSON.parse(Buffer.from(parent.accessToken.split(".")[1], "base64url").toString()).exp;
        if (typeof exp === "number" && exp * 1000 <= Date.now()) throw new MobileShiftError("PARENT_UNAVAILABLE", 409);
        shiftStore.disconnect(token);
        throw new MobileShiftError("PARENT_REVOKED", 401);
      }
      if ((error instanceof HttpError || error instanceof MobileShiftError) && error.status === 403) shiftStore.disconnect(token);
      throw error;
    }
  }
  return token;
}
export function setMobileCookie(response: NextResponse, request: Request, token: string, maxAge: number) {
  response.cookies.set(MOBILE_COOKIE, token, {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict",
    path: "/api/cccd-mobile", maxAge,
  });
  return response;
}
