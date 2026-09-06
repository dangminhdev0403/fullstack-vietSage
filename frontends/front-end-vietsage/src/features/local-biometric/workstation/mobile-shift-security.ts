import { z } from "zod";

const uuid = z.string().uuid();
const base = { deskId: uuid, sessionId: uuid };
export const desktopCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), deskId: uuid }).strict(),
  z.object({ action: z.literal("approve"), ...base, comparisonCode: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ action: z.literal("target"), ...base, targetKey: z.string().min(1).max(200), targetLabel: z.string().trim().min(1).max(160) }).strict(),
  z.object({ action: z.literal("ack"), ...base, requestId: uuid, transferId: uuid }).strict(),
  z.object({ action: z.literal("discard"), ...base, requestId: uuid }).strict(),
  z.object({ action: z.literal("revoke"), ...base }).strict(),
  z.object({ action: z.literal("read"), ...base }).strict(),
]);
export const phoneCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), code: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("submit"), requestId: uuid, transferId: uuid, raw: z.string().min(1).max(4096) }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
]);
export type DesktopCommand = z.infer<typeof desktopCommand>;
export type PhoneCommand = z.infer<typeof phoneCommand>;
export const deskIdSchema = uuid;

export function sameOrigin(request: Request) {
  const supplied = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const validOrigins = new Set<string>();

  try {
    validOrigins.add(new URL(request.url).origin);
  } catch {}

  const rawHost = request.headers.get("host");
  if (rawHost) {
    const host = rawHost.split(",")[0].trim();
    validOrigins.add(`http://${host}`);
    validOrigins.add(`https://${host}`);
  }

  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https:") ? "https" : "http");
  if (fwdHost) {
    const host = fwdHost.split(",")[0].trim();
    const proto = fwdProto.split(",")[0].trim();
    validOrigins.add(`${proto}://${host}`);
    validOrigins.add(`https://${host}`);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      validOrigins.add(new URL(referer).origin);
    } catch {}
  }

  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envAppUrl) {
    try {
      validOrigins.add(new URL(envAppUrl).origin);
    } catch {}
  }

  return request.method === "GET"
    ? !supplied || validOrigins.has(supplied)
    : !!supplied && validOrigins.has(supplied);
}

export async function limitedJson(request: Request, max = 8192): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("INVALID_BODY");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) throw new RangeError("BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) { await reader.cancel(); throw new RangeError("BODY_LIMIT"); }
      chunks.push(value);
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged));
  } finally { reader.releaseLock(); }
}
export const mobileShiftAvailable = (environment?: string) => {
  if (environment === "disabled") return false;
  if (process.env.DISABLE_MOBILE_CCCD_SCAN === "true" || process.env.ENABLE_MOBILE_CCCD_SCAN === "false") {
    return false;
  }
  return true;
};
