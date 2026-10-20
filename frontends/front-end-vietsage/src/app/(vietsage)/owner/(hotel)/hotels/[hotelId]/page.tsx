import { redirect } from "next/navigation";

type OwnerHotelPageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OwnerHotelPage({ params }: OwnerHotelPageProps) {
  const { hotelId } = await params;
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/profile`);
}
