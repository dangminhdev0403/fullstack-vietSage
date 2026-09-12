import { notFound } from "next/navigation";
import { KbttConnectionPage } from "@/features/kbtt/components/kbtt-connection-page";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

export default async function OwnerKbttPage({ params }: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await params;
  const context = await loadServerWorkspaceContext(`/owner/hotels/${encodeURIComponent(hotelId)}/kbtt`);
  if (!canUseHotelId(context, hotelId)) notFound();
  const canManage = context.permissions.includes("hotel.kbtt.manage");
  if (!canManage && !context.permissions.includes("hotel.kbtt.view")) {
    return <p role="alert" className="p-6 text-base">Bạn chưa được cấp quyền xem kết nối khai báo tạm trú của khách sạn này.</p>;
  }
  return <KbttConnectionPage key={hotelId} hotelId={hotelId} canManage={canManage} />;
}
