import { intakePayloadV2Schema } from "@/features/local-biometric/intake/intake-contract";
import { parseCccdQr } from "@/features/local-biometric/utils/cccd-qr-parser";
import { limitedJson, phoneCommand } from "@/features/local-biometric/workstation/mobile-shift-security";
import { failure, guard, json, phoneToken, setMobileCookie, shiftStore } from "@/features/local-biometric/workstation/mobile-shift-server";
import { PAIR_MS, SHIFT_MS } from "@/features/local-biometric/workstation/mobile-shift-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { guard(request); return json(shiftStore.phone(await phoneToken())); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    guard(request);
    const body = phoneCommand.parse(await limitedJson(request));
    if (body.action === "claim") {
      const claimed = shiftStore.claim(body.code);
      return setMobileCookie(json(claimed.view), request, claimed.token, (SHIFT_MS + PAIR_MS) / 1000);
    }
    const token = await phoneToken(body.action !== "disconnect");
    if (body.action === "disconnect") {
      shiftStore.disconnect(token);
      return setMobileCookie(json({ revoked: true }), request, "", 0);
    }
    const payload = intakePayloadV2Schema.parse({
      schemaVersion: 2, transferId: body.transferId, capturedAt: new Date().toISOString(),
      guest: parseCccdQr(body.raw),
      verification: { chipAuthenticated: false, sodVerified: false },
    });
    return json(shiftStore.submit(token, body.requestId, payload), 202);
  } catch (error) { return failure(error); }
}
