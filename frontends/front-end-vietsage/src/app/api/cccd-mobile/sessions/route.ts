import { intakePayloadV2Schema } from "@/features/local-biometric/intake/intake-contract";
import { parseCccdQr } from "@/features/local-biometric/utils/cccd-qr-parser";
import { deskIdSchema, limitedBytes, limitedJson, phoneCommand } from "@/features/local-biometric/workstation/mobile-shift-security";
import { failure, guard, json, phoneToken, setMobileCookie, shiftStore } from "@/features/local-biometric/workstation/mobile-shift-server";
import { MobileShiftError, PAIR_MS, SHIFT_MS } from "@/features/local-biometric/workstation/mobile-shift-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uploadState = globalThis as typeof globalThis & { cccdActiveUploads?: Set<string> };
const activeUploads = uploadState.cccdActiveUploads ??= new Set<string>();
export async function GET(request: Request) {
  try { guard(request); return json(shiftStore.phone(await phoneToken())); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    guard(request);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ?? "";
    if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      const requestId = deskIdSchema.parse(request.headers.get("x-scan-request"));
      const transferId = deskIdSchema.parse(request.headers.get("x-transfer-id"));
      const token = await phoneToken();
      if (activeUploads.has(requestId) || activeUploads.size >= 4) throw new MobileShiftError("CAPACITY", 429);
      activeUploads.add(requestId);
      try {
        const bytes = await limitedBytes(request);
        const jpeg = bytes.length >= 5 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
        const png = bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
        const webp = bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
        if ((contentType === "image/jpeg" && !jpeg) || (contentType === "image/png" && !png) || (contentType === "image/webp" && !webp)) throw new Error("INVALID_IMAGE");
        return json(shiftStore.submitDocument(token, requestId, transferId, contentType, bytes), 202);
      } finally { activeUploads.delete(requestId); }
    }
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
