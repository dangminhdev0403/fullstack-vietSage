import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OwnerKbttPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { hotelId } = await params;
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/settings?tab=integrations`);
}
