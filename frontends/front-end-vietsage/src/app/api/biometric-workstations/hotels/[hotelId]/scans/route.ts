import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
import { persistentWorkstationStatus } from "@/features/local-biometric/workstation/persistent-workstation-client";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export async function POST(request: Request, context: Context) {
  const { hotelId } = await Promise.resolve(context.params);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const denied = await authorizeHotelWorkstation(session, hotelId);
    if (denied) return denied;
    const { accessToken } = await readServerSessionTokens(request);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    if (!(await persistentWorkstationStatus(hotelId, accessToken)).online) {
      return NextResponse.json({ error: "Máy quét CCCD chưa kết nối" }, { status: 409, headers });
    }
    return NextResponse.json(workstationStore.requestScan(hotelId, session.user.id), { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "Không thể bắt đầu quét CCCD" }, { status: 502, headers });
  }
}
