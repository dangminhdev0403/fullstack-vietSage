import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function WorkspaceChannelManagerRedirectPage({ params }: PageProps) {
  const { hotelId } = await params;
  redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/channel-manager`);
}
