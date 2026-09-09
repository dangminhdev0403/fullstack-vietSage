import { desktopCommand, deskIdSchema, limitedJson } from "@/features/local-biometric/workstation/mobile-shift-security";
import { desktopOwner, failure, guard, json as rawJson, shiftStore } from "@/features/local-biometric/workstation/mobile-shift-server";
const json = (data: unknown, status = 200) => rawJson({ status, error: null, message: "OK", data }, status);
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ hotelId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    guard(request);
    const { hotelId } = await context.params;
    const deskId = deskIdSchema.parse(new URL(request.url).searchParams.get("deskId"));
    const { owner, accessToken } = await desktopOwner(request, hotelId, deskId);
    const requestId = new URL(request.url).searchParams.get("requestId");
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (requestId || sessionId) {
      const document = shiftStore.document(owner, deskIdSchema.parse(sessionId), deskIdSchema.parse(requestId));
      return new Response(document.bytes, { headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": document.contentType,
        "X-Transfer-Id": document.transferId,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    const view = shiftStore.desk(owner, accessToken);
    if (view) delete view.payload;
    return json(view ?? { session: null });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    guard(request);
    const { hotelId } = await context.params;
    const body = desktopCommand.parse(await limitedJson(request));
    const { owner, labels, accessToken } = await desktopOwner(request, hotelId, body.deskId);
    switch (body.action) {
      case "read": return json(shiftStore.desk(owner, accessToken));
      case "create": return json(shiftStore.create(owner, labels, accessToken), 201);
      case "approve": return json(shiftStore.approve(owner, body.sessionId, body.comparisonCode));
      case "target": return json(shiftStore.target(owner, body.sessionId, body.targetKey, body.targetLabel));
      case "ack": return json(shiftStore.ack(owner, body.sessionId, body.requestId, body.transferId));
      case "discard": return json(shiftStore.discard(owner, body.sessionId, body.requestId));
      case "revoke": shiftStore.revoke(owner, body.sessionId); return json({ revoked: true });
    }
  } catch (error) { return failure(error); }
}
