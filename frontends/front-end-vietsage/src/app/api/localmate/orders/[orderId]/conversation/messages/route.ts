import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_SESSION_COOKIE } from "../../../../_lib/session-cookie";
import { toBffErrorResponse } from "../../../../_lib/bff-error";

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().trim().min(1).max(120),
});

export async function POST(
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

    const raw = await request.json();
    const parsed = sendMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_MESSAGE_PAYLOAD", details: parsed.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const message = unwrapApiEnvelope<unknown>(
      await httpServer.post(
        `/public/localmate/orders/${encodeURIComponent(orderId)}/conversation/messages`,
        parsed.data,
        { headers: { "x-public-localmate-token": token } },
      ),
    ).data;

    return NextResponse.json(message, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to send message");
  }
}
