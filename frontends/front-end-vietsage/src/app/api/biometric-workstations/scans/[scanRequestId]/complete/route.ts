import { NextResponse } from "next/server";
import { parseIntakePayload } from "@/features/local-biometric/intake/intake-contract";
import { authenticatePersistentWorkstation } from "@/features/local-biometric/workstation/persistent-workstation-client";
import { bearerToken } from "@/features/local-biometric/workstation/workstation-auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";

export const dynamic = "force-dynamic";
const MAX = 1_048_576;
const headers = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ scanRequestId: string }> | { scanRequestId: string } };

export async function POST(request: Request, context: Context) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  let workstation: { id: string; hotelId: string };
  try {
    workstation = await authenticatePersistentWorkstation(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX) {
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 413, headers });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400, headers });
  }
  try {
    const data = parseIntakePayload(raw);
    const { scanRequestId } = await Promise.resolve(context.params);
    return workstationStore.completeWorkstation(workstation.hotelId, workstation.id, scanRequestId, data)
      ? NextResponse.json({ accepted: true }, { status: 202, headers })
      : NextResponse.json({ error: "Lượt quét không hợp lệ" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "Dữ liệu CCCD không hợp lệ" }, { status: 422, headers });
  }
}
