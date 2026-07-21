import { redirect } from "next/navigation";

type PageProps = {
  params:
    | Promise<{ hotelId: string; requestId: string }>
    | { hotelId: string; requestId: string };
};

export const dynamic = "force-dynamic";

export default async function OwnerHotelRequestDetailPage({
  params,
}: PageProps) {
  const { hotelId, requestId } = await Promise.resolve(params);

  redirect(
    `/owner/hotels/${encodeURIComponent(hotelId)}/requests?requestId=${encodeURIComponent(requestId)}`,
  );
}
