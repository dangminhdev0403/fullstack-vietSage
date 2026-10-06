import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_COOKIE_OPTIONS, LOCALMATE_SESSION_COOKIE } from "../_lib/session-cookie";
import { toBffErrorResponse } from "../_lib/bff-error";

const sessionSchema = z.object({
  location: z.string().trim().min(2).max(120),
  guestDisplayName: z.string().trim().min(2).max(120).nullish(),
  guestPhone: z
    .string()
    .trim()
    .nullish()
    .refine((val) => !val || /^\+?[0-9][0-9 .()-]{5,39}$/.test(val), {
      message: "Số điện thoại không hợp lệ",
    }),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = sessionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_SESSION_PAYLOAD", details: parsed.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const cookieStore = await cookies();
    const previousToken = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;
    const backendResponse = await httpServer.post<unknown>("/public/localmate/sessions", parsed.data, {
      ...(previousToken
        ? { headers: { "x-public-localmate-token": previousToken } }
        : {}),
    });
    const backendRes = unwrapApiEnvelope<{
      token: string;
      sessionId: string;
      expiresAt: string;
    }>(backendResponse).data;

    cookieStore.set(LOCALMATE_SESSION_COOKIE, backendRes.token, LOCALMATE_COOKIE_OPTIONS);

    return NextResponse.json(
      { sessionId: backendRes.sessionId, expiresAt: backendRes.expiresAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to create public LocalMate session");
  }
}
