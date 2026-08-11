import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { OwnerNearbyProvidersClient } from "@/features/local-partners/components/staff-local-partners-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function StaffLocalPartnersPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/partners` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);

  if (!tokens.accessToken) {
    notFound();
  }

  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const canViewPartners = context.permissions.includes("hotel.local-partners.view") || context.permissions.includes("hotel.local-partners.manage");

  if (!canUseHotelId(context, hotelId) || !canViewPartners) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <OwnerNearbyProvidersClient hotelId={hotelId} canManage={false} />
    </div>
  );
}
