import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function OwnerKbttPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/front-desk?tab=kbtt`);
}
