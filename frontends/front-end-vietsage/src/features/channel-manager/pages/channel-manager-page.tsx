"use client";

import { useRouter } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useWorkspaceProfile } from "@/features/workspace/components/workspace-profile-context";
import {
  HOTEL_CHANNEL_MANAGER,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";
import { AriPushCard } from "../components/ari-push-card";
import { InventoryGrid } from "../components/inventory-grid";

interface ChannelManagerPageProps {
  hotelId: string;
  baseRoutePrefix?: string;
}

export function ChannelManagerPage({
  hotelId,
  baseRoutePrefix = "/owner/hotels",
}: ChannelManagerPageProps) {
  const router = useRouter();
  const { accessibleHotels = [], hotelName } = useWorkspaceProfile();
  const currentHotel = accessibleHotels.find((hotel) => hotel.id === hotelId);
  const currentDisplayName =
    currentHotel?.name || hotelName || "Khách sạn hiện tại";
  const isFeatureEnabled = currentHotel
    ? hasHotelFeature(currentHotel.enabledFeatures, HOTEL_CHANNEL_MANAGER)
    : true;

  if (!isFeatureEnabled) {
    return (
      <div className="space-y-6 pb-24">
        <section
          data-ui="feature-disabled-notice"
          className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <VsIcon name="lock" className="text-3xl" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-amber-950">
            Channel Manager chưa được kích hoạt
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-amber-900">
            Tính năng phân phối OTA chưa được mở cho “{currentDisplayName}”.
            Liên hệ quản trị viên nền tảng để kích hoạt.
          </p>
          <button
            type="button"
            onClick={() =>
              router.push(
                baseRoutePrefix === "/owner/hotels"
                  ? "/owner/dashboard"
                  : `/hotels/${hotelId}/rooms`,
              )
            }
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-6 text-base font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-600/40"
          >
            <VsIcon name="arrow_back" className="text-lg" />
            Về màn hình chính
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="rounded-2xl border border-[#e5ddcd] bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wider text-[#735c00]">
          Channel Manager
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#17201b]">
          Giá và quỹ phòng OTA
        </h1>
        <p className="mt-2 text-base text-[#5a6760]">
          {currentDisplayName}. Chỉnh dữ liệu PMS, lưu thay đổi, sau đó đồng bộ
          lên Channex.
        </p>
      </header>

      <AriPushCard hotelId={hotelId} roleScope="owner" />
      <InventoryGrid hotelId={hotelId} roleScope="owner" />
    </div>
  );
}
