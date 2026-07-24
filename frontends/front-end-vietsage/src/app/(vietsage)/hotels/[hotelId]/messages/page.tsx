import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { assertCanAccessHotelOps, canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { RoomMessagesClient } from "./room-messages-client";

export const dynamic = "force-dynamic";
export default async function RoomMessagesPage({ params }: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await params;
  const callbackUrl = `/hotels/${hotelId}/messages` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || (!context.permissions.includes("hotel.requests.view") && !context.permissions.includes("hotel.requests.manage"))) notFound();
  return <RoomMessagesClient hotelId={hotelId} canReply={context.permissions.includes("hotel.requests.manage")} />;
}
