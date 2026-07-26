import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
}).strict();

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(NextResponse.json({ status: 400, message: "VALIDATION_ERROR", data: { detail: "Password payload is invalid" } }, { status: 400 }));
  }

  const tokens = await readServerSessionTokens();
  if (!tokens.accessToken) {
    return noStore(NextResponse.json({ status: 401, message: "UNAUTHORIZED", data: { detail: "Access token is required" } }, { status: 401 }));
  }

  try {
    const data = await httpServer.request("POST", "/auth/change-password", parsed.data, { accessToken: tokens.accessToken });
    return noStore(NextResponse.json(data, { status: 200 }));
  } catch (error) {
    if (error instanceof HttpError) {
      return noStore(NextResponse.json(error.data ?? { status: error.status, message: error.message }, { status: error.status }));
    }
    return noStore(NextResponse.json({ status: 500, message: "INTERNAL_SERVER_ERROR" }, { status: 500 }));
  }
}
