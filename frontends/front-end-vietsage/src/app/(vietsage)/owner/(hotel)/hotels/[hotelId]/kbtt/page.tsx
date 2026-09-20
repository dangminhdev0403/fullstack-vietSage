import { notFound } from "next/navigation";

import { KbttDeclarationsPage } from "@/features/kbtt/components/kbtt-declarations-page";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

export default async function OwnerKbttPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { hotelId } = await params;
  const sp = searchParams ? await searchParams : {};
  const initialTab = sp.tab === "declarations" ? "declarations" : "connection";
  const callbackUrl =
    `/owner/hotels/${encodeURIComponent(hotelId)}/kbtt` as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  if (!canUseHotelId(context, hotelId)) notFound();
  const canView = context.permissions.some((permission) =>
    ["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"].includes(
      permission,
    ),
  );
  if (!canView) notFound();
  const canManageConnection = context.permissions.includes("hotel.kbtt.manage");
  const canConfigure = context.permissions.some((permission) =>
    ["hotel.kbtt.view", "hotel.kbtt.manage"].includes(permission),
  );

  return (
    <KbttDeclarationsPage
      hotelId={hotelId}
      canManage={false}
      canManageConnection={canManageConnection}
      canConfigure={canConfigure}
      initialTab={initialTab}
    />
  );
}
