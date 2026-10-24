import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OwnerHotelDashboardPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await Promise.resolve(params);
  redirect(`/owner/dashboard?hotelId=${encodeURIComponent(hotelId)}`);
}
