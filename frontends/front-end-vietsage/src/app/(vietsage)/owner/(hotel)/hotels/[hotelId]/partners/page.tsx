import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ hotelId: string }> };
export const dynamic = "force-dynamic";

export default async function OwnerLocalPartnersPage({ params }: PageProps) {
  const { hotelId } = await params;
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/settings?tab=partners`);
}
