import { notFound } from "next/navigation";

import { KbttConnectionPage } from "@/features/kbtt/components/kbtt-connection-page";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

export default async function OwnerKbttConnectionPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await params;
  const callbackUrl =
    `/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/connection` as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  if (!canUseHotelId(context, hotelId)) notFound();
  const canManage = context.permissions.includes("hotel.kbtt.manage");
  if (!canManage && !context.permissions.includes("hotel.kbtt.view"))
    notFound();
  return (
    <KbttConnectionPage key={hotelId} hotelId={hotelId} canManage={canManage} />
  );
}
