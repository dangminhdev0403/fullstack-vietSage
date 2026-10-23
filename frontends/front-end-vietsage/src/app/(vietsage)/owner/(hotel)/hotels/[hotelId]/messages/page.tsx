import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { RoomMessagesClient } from "@/app/(vietsage)/hotels/[hotelId]/messages/room-messages-client";

export const dynamic = "force-dynamic";

export default async function OwnerRoomMessagesPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await params;
  const callbackUrl = `/owner/hotels/${hotelId}/messages` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (
    !canUseHotelId(context, hotelId) ||
    (!context.permissions.includes("hotel.messages.view") &&
      !context.permissions.includes("hotel.messages.manage"))
  ) {
    notFound();
  }

  return (
    <RoomMessagesClient
      hotelId={hotelId}
      canReply={context.permissions.includes("hotel.messages.manage")}
    />
  );
}
