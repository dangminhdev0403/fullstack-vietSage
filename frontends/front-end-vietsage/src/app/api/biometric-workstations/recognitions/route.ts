import { NextResponse } from "next/server";
import { authenticatePersistentWorkstation } from "@/features/local-biometric/workstation/persistent-workstation-client";
import {
  acceptsRecognitionBodyLength,
  bearerToken,
  recognitionRelayAvailable,
} from "@/features/local-biometric/workstation/workstation-auth";
import { workstationStore, type RecognitionInput } from "@/features/local-biometric/workstation/workstation-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };

function parseRecognition(value: unknown): RecognitionInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const required = ["providerEventId", "deviceId", "deviceUserId", "occurredAt", "sourceTable", "verifyType", "eventCode"] as const;
  if (required.some((key) => typeof body[key] !== "string" || !body[key])) return null;
  const payload = Object.fromEntries(required.map((key) => [key, body[key]])) as RecognitionInput;
  if (typeof body.deviceIndex === "string") payload.deviceIndex = body.deviceIndex;
  if (typeof body.inOutStatus === "string") payload.inOutStatus = body.inOutStatus;
  return payload;
}

export async function POST(request: Request) {
  if (!recognitionRelayAvailable()) {
    return NextResponse.json({ error: "Recognition relay unavailable" }, { status: 503, headers });
  }
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  let workstation: { hotelId: string };
  try {
    workstation = await authenticatePersistentWorkstation(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (!acceptsRecognitionBodyLength(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "Invalid recognition size" }, { status: 413, headers });
  }
  const payload = parseRecognition(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "Invalid recognition" }, { status: 400, headers });
  const result = workstationStore.ingestRecognitionHotel(workstation.hotelId, payload);
  return NextResponse.json(result, { status: result.duplicate ? 200 : 202, headers });
}
