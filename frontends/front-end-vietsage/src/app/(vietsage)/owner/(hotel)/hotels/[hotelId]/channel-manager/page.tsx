import { ChannelManagerPage } from "@/features/channel-manager/pages/channel-manager-page";

type PageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OwnerHotelChannelManagerPage({ params }: PageProps) {
  const { hotelId } = await params;

  return (
    <ChannelManagerPage
      hotelId={hotelId}
      baseRoutePrefix="/owner/hotels"
    />
  );
}
