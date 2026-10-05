import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_SESSION_COOKIE } from "../../_lib/session-cookie";
import { toBffErrorResponse } from "../../_lib/bff-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "UNAUTHORIZED_NO_SESSION" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const order = unwrapApiEnvelope<unknown>(
      await httpServer.get(`/public/localmate/orders/${encodeURIComponent(orderId)}`, {
        headers: { "x-public-localmate-token": token },
      }),
    ).data;

    return NextResponse.json(order, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to get order");
  }
}
