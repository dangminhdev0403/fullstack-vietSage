import { notFound } from "next/navigation";
import { StaffLocalPartnersClient } from "@/features/local-partners/components/staff-local-partners-client";
import { canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function OwnerLocalPartnersPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/owner/hotels/${hotelId}/partners` as const;
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  if (!tokens.accessToken) notFound();

  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const canManage = context.permissions.includes("hotel.local-partners.manage");
  if (!canUseHotelId(context, hotelId) || (!canManage && !context.permissions.includes("hotel.local-partners.view"))) notFound();

  return <StaffLocalPartnersClient hotelId={hotelId} canManage={canManage} />;
}
