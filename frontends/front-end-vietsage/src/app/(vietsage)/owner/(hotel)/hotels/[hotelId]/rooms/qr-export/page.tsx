import { OwnerRoomsQrExportClient } from "./qr-export-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerRoomsQrExportPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);

  return <OwnerRoomsQrExportClient hotelId={hotelId} />;
}
