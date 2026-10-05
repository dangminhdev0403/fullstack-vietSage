import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_SESSION_COOKIE } from "../../../_lib/session-cookie";
import { toBffErrorResponse } from "../../../_lib/bff-error";

export async function GET(
  request: Request,
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

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const before = searchParams.get("before");

    const query: Record<string, string> = {};
    if (limit) query.limit = limit;
    if (before) query.before = before;

    const conversation = unwrapApiEnvelope<unknown>(
      await httpServer.get(`/public/localmate/orders/${encodeURIComponent(orderId)}/conversation`, {
        headers: { "x-public-localmate-token": token },
        query,
      }),
    ).data;

    return NextResponse.json(conversation, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to get conversation");
  }
}
