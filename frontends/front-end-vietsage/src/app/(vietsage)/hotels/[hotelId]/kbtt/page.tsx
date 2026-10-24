import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function HotelKbttOperationalPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  redirect(`/hotels/${encodeURIComponent(hotelId)}/front-desk?tab=kbtt`);
}
