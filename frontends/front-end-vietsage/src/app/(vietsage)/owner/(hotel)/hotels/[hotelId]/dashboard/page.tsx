import StaffHotelDashboardPage from "@/app/(vietsage)/hotels/[hotelId]/dashboard/page";

export const dynamic = "force-dynamic";

export default async function OwnerHotelDashboardPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  return <StaffHotelDashboardPage params={params} baseRoutePrefix="/owner/hotels" />;
}
