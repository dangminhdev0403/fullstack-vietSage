import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ scanRequestId: string }> | { scanRequestId: string } };

export async function DELETE(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const hotelId = new URL(request.url).searchParams.get("hotelId") ?? "";
  const denied = await authorizeHotelWorkstation(session, hotelId);
  if (denied) return denied;
  const { scanRequestId } = await Promise.resolve(context.params);
  
  const acked = workstationStore.acknowledgeScan(scanRequestId, hotelId, session.user.id);
  
  if (acked) {
    return NextResponse.json({ acknowledged: true }, { headers: { "Cache-Control": "no-store, private" } });
  } else {
    return NextResponse.json({ error: "Not found or wrong hotel/operator" }, { status: 404 });
  }
}
