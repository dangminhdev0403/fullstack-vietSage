import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { HousekeepingRoomDetail } from "@/features/housekeeping/components/housekeeping-room-detail";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";

export const dynamic = "force-dynamic";

export default async function StaffRoomDetailPage({ params }: { params: Promise<{ hotelId: string; roomId: string }> }) {
  const { hotelId, roomId } = await params;
  const callbackUrl = `/hotels/${hotelId}/rooms/${roomId}` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || resolveWorkspacePersona(context.activeRole.baseRoleCode ?? context.activeRole.code) !== "housekeeping") notFound();

  return <HousekeepingRoomDetail hotelId={hotelId} roomId={roomId} currentUser={session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email } : undefined} />;
}
