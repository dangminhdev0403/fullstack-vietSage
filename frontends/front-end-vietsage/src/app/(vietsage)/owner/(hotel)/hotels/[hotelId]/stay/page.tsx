import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
};

export default async function LegacyOwnerHotelStayPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/rooms`);
}
