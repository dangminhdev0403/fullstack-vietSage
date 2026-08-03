import { NextResponse } from "next/server";
import { authenticatePersistentWorkstation } from "@/features/local-biometric/workstation/persistent-workstation-client";
import { bearerToken } from "@/features/local-biometric/workstation/workstation-auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };

const authCache = new Map<string, { workstation: { id: string; hotelId: string }; expiresAt: number }>();

async function getCachedWorkstation(token: string) {
  const cached = authCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.workstation;
  }
  const workstation = await authenticatePersistentWorkstation(token);
  authCache.set(token, { workstation, expiresAt: Date.now() + 10_000 });
  return workstation;
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const workstation = await getCachedWorkstation(token);
    const command = workstationStore.pollWorkstation(workstation.hotelId, workstation.id);

    if (!command) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    return NextResponse.json({ command }, { headers });
  } catch {
    authCache.delete(token);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
}
