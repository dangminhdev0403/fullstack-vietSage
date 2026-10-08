import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_SESSION_COOKIE } from "../_lib/session-cookie";
import { toBffErrorResponse } from "../_lib/bff-error";
import { candidateKeySchema, proposalKeySchema } from "../public-chat/payload-schema";

const orderInputSchema = z.object({
  proposalKey: proposalKeySchema,
  candidateKey: candidateKeySchema,
  partySize: z.number().int().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = orderInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_ORDER_PAYLOAD", details: parsed.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "UNAUTHORIZED_NO_SESSION" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const backendPayload = {
      proposalKey: parsed.data.proposalKey,
      candidateKey: parsed.data.candidateKey,
      partySize: parsed.data.partySize,
      idempotencyKey: parsed.data.idempotencyKey,
    };

    const order = unwrapApiEnvelope<unknown>(
      await httpServer.post("/public/localmate/orders", backendPayload, {
        headers: { "x-public-localmate-token": token },
      }),
    ).data;

    return NextResponse.json(order, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to create order");
  }
}
