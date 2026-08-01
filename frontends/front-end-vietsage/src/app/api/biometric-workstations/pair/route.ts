import { NextResponse } from "next/server";
import { pairPersistentWorkstation } from "@/features/local-biometric/workstation/persistent-workstation-client";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400, headers });
  }
  const code = typeof body === "object" && body !== null && "code" in body
    ? String((body as { code: unknown }).code)
    : "";
  try {
    return NextResponse.json(await pairPersistentWorkstation(code), { status: 201, headers });
  } catch (error) {
    return NextResponse.json(
      { error: "Mã kết nối không hợp lệ hoặc đã hết hạn" },
      { status: (error as { status?: number }).status ?? 502, headers },
    );
  }
}
