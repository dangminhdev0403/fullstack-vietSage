import { auth } from "@/auth";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
import { limitedBytes, sameOrigin } from "@/features/local-biometric/workstation/mobile-shift-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ hotelId: string }> };
const responseHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const state = globalThis as typeof globalThis & { openMrzActiveRequests?: number };

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403, headers: responseHeaders });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });

  const { hotelId } = await context.params;
  const denied = await authorizeHotelWorkstation(session, hotelId);
  if (denied) return denied;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data; boundary=")) {
    return Response.json({ error: "Dữ liệu ảnh không hợp lệ" }, { status: 415, headers: responseHeaders });
  }
  if ((state.openMrzActiveRequests ?? 0) >= 2) {
    return Response.json({ error: "OpenMRZ đang bận. Vui lòng thử lại." }, { status: 429, headers: responseHeaders });
  }

  state.openMrzActiveRequests = (state.openMrzActiveRequests ?? 0) + 1;
  try {
    const bytes = await limitedBytes(request, 16 * 1024 * 1024);
    const form = await new Request("http://open-mrz.internal", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(bytes).buffer,
    }).formData();
    const files = form.getAll("files");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      return Response.json({ error: "Ảnh phải là JPG, PNG hoặc WEBP và không vượt quá 15MB" }, { status: 415, headers: responseHeaders });
    }
    const start = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const end = new Uint8Array(await file.slice(-2).arrayBuffer());
    const jpeg = start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff && end[0] === 0xff && end[1] === 0xd9;
    const png = start.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    const webp = new TextDecoder().decode(start.slice(0, 4)) === "RIFF" && new TextDecoder().decode(start.slice(8, 12)) === "WEBP";
    if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png) || (file.type === "image/webp" && !webp)) {
      return Response.json({ error: "Nội dung ảnh không đúng định dạng" }, { status: 415, headers: responseHeaders });
    }
    const upstreamBody = new FormData();
    upstreamBody.append("files", file, file.name);
    const baseUrl = process.env.OPEN_MRZ_BASE_URL ?? "http://open-mrz:8787";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/vietsage/mrz`, {
      method: "POST",
      headers: { "X-VietSage-OCR": "1" },
      body: upstreamBody,
      signal: AbortSignal.timeout(120_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { ...responseHeaders, "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 503;
    return Response.json({ error: status === 413 ? "Ảnh vượt quá 15MB" : "Máy chủ OpenMRZ chưa sẵn sàng" }, { status, headers: responseHeaders });
  } finally {
    state.openMrzActiveRequests = Math.max(0, (state.openMrzActiveRequests ?? 1) - 1);
  }
}
