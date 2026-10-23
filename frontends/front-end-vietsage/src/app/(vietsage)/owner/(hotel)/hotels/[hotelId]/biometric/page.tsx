import StaffHotelBiometricPage from "@/app/(vietsage)/hotels/[hotelId]/biometric/page";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ hotelId: string }> };

export default async function OwnerHotelBiometricPage({ params }: PageProps) {
  return <StaffHotelBiometricPage params={params} baseRoutePrefix="/owner/hotels" />;
}
