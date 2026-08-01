import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
import { recognitionRelayAvailable } from "@/features/local-biometric/workstation/workstation-auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export async function GET(_request: Request, context: Context) {
  const headers = { "Cache-Control": "no-store, private" };
  if (!recognitionRelayAvailable()) {
    return NextResponse.json({ error: "Recognition relay unavailable" }, { status: 503, headers });
  }
  const { hotelId } = await Promise.resolve(context.params);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const denied = await authorizeHotelWorkstation(session, hotelId);
  if (denied) return denied;
  return NextResponse.json({ events: workstationStore.listRecognitions(hotelId) }, { headers });
}