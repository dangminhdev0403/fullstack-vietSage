import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
import {
  disconnectPersistentWorkstations,
  issuePersistentPairing,
  persistentWorkstationStatus,
} from "@/features/local-biometric/workstation/persistent-workstation-client";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ hotelId: string }> | { hotelId: string } };

async function context(request: Request, routeContext: Context) {
  const { hotelId } = await Promise.resolve(routeContext.params);
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers }) };
  const denied = await authorizeHotelWorkstation(session, hotelId);
  if (denied) return { response: denied };
  const { accessToken } = await readServerSessionTokens(request);
  if (!accessToken) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers }) };
  return { hotelId, accessToken };
}

export async function POST(request: Request, routeContext: Context) {
  try {
    const authorized = await context(request, routeContext);
    if ("response" in authorized) return authorized.response;
    return NextResponse.json(await issuePersistentPairing(authorized.hotelId, authorized.accessToken), { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "Không có quyền kết nối máy quét" }, { status: 403, headers });
  }
}

export async function GET(request: Request, routeContext: Context) {
  try {
    const authorized = await context(request, routeContext);
    if ("response" in authorized) return authorized.response;
    return NextResponse.json(await persistentWorkstationStatus(authorized.hotelId, authorized.accessToken), { headers });
  } catch {
    return NextResponse.json({ error: "Không thể kiểm tra máy quét" }, { status: 502, headers });
  }
}

export async function DELETE(request: Request, routeContext: Context) {
  try {
    const authorized = await context(request, routeContext);
    if ("response" in authorized) return authorized.response;
    return NextResponse.json(await disconnectPersistentWorkstations(authorized.hotelId, authorized.accessToken), { headers });
  } catch {
    return NextResponse.json({ error: "Không thể hủy kết nối máy quét" }, { status: 502, headers });
  }
}
