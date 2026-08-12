"use client";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export type GuestDiscoveryTabKey = "hotel" | "external";

type GuestDiscoveryTabsProps = {
  activeTab: GuestDiscoveryTabKey;
  onTabChange: (tab: GuestDiscoveryTabKey) => void;
  hotelLabel: string;
  externalLabel: string;
  hotelBadgeText?: string;
  externalBadgeText?: string;
};

export function GuestDiscoveryTabs({
  activeTab,
  onTabChange,
  hotelLabel,
  externalLabel,
  hotelBadgeText = "Phục vụ tại phòng",
  externalBadgeText = "Khám phá dịch vụ quanh khách sạn",
}: GuestDiscoveryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Loại dịch vụ"
      className="grid w-full grid-cols-2 gap-2 rounded-[22px] bg-[#ece6d8]/70 p-1.5 shadow-[inner_0_2px_4px_rgba(0,0,0,0.04)] md:rounded-[26px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "hotel"}
        aria-controls="guest-services-tabpanel"
        onClick={() => onTabChange("hotel")}
        className={`vs-touch-button relative flex flex-col items-center justify-center rounded-[18px] px-3 py-3 text-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25483f] md:rounded-[22px] md:py-3.5 ${
          activeTab === "hotel"
            ? "bg-[#25483f] text-white shadow-[0_8px_20px_rgba(37,72,63,0.22)]"
            : "text-[#4a554e] hover:bg-[#fffdfa]/60 hover:text-[#18211d]"
        }`}
      >
        <div className="flex items-center gap-2">
          <VsIcon
            name="room_service"
            className={`text-xl ${activeTab === "hotel" ? "text-[#d7bd61]" : "text-[#7a887f]"}`}
          />
          <span className="text-sm font-bold md:text-base">{hotelLabel}</span>
        </div>
        <span
          className={`mt-1 text-[11px] font-medium ${
            activeTab === "hotel" ? "text-white/80" : "text-[#7a887f]"
          }`}
        >
          {hotelBadgeText}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "external"}
        aria-controls="guest-services-tabpanel"
        onClick={() => onTabChange("external")}
        className={`vs-touch-button relative flex flex-col items-center justify-center rounded-[18px] px-3 py-3 text-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25483f] md:rounded-[22px] md:py-3.5 ${
          activeTab === "external"
            ? "bg-[#25483f] text-white shadow-[0_8px_20px_rgba(37,72,63,0.22)]"
            : "text-[#4a554e] hover:bg-[#fffdfa]/60 hover:text-[#18211d]"
        }`}
      >
        <div className="flex items-center gap-2">
          <VsIcon
            name="storefront"
            className={`text-xl ${activeTab === "external" ? "text-[#d7bd61]" : "text-[#7a887f]"}`}
          />
          <span className="text-sm font-bold md:text-base">{externalLabel}</span>
        </div>
        <span
          className={`mt-1 text-[11px] font-medium ${
            activeTab === "external" ? "text-white/80" : "text-[#7a887f]"
          }`}
        >
          {externalBadgeText}
        </span>
      </button>
    </div>
  );
}
