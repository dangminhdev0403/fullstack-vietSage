import { NextResponse } from "next/server";
import { toApiErrorMessage } from "@/core/http/api-envelope";

export function toBffErrorResponse(error: unknown, fallbackMessage: string) {
  const err = error as
    | { status?: number; message?: string; data?: unknown }
    | null
    | undefined;
  const status = typeof err?.status === "number" ? err.status : 500;
  const upstreamMessage = err?.data ? toApiErrorMessage(err.data) : null;
  return NextResponse.json(
    { error: upstreamMessage || err?.message || fallbackMessage },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
