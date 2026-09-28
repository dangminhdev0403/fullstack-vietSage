import { ChannelManagerPage } from "@/features/channel-manager/pages/channel-manager-page";

type PageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function StaffHotelChannelManagerPage({ params }: PageProps) {
  const { hotelId } = await params;

  return (
    <ChannelManagerPage
      hotelId={hotelId}
      baseRoutePrefix="/hotels"
    />
  );
}
