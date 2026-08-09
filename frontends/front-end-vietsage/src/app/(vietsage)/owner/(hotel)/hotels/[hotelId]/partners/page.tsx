import { StaffLocalPartnersClient } from "@/features/local-partners/components/staff-local-partners-client";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function OwnerLocalPartnersPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const context = await loadServerWorkspaceContext(`/owner/hotels/${hotelId}/partners`);
  return <StaffLocalPartnersClient hotelId={hotelId} canManage={context.permissions.includes("hotel.local-partners.manage")} />;
}
