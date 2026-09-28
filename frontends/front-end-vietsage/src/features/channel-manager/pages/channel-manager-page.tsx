"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceProfile } from "@/features/workspace/components/workspace-profile-context";
import { InventoryGrid } from "../components/inventory-grid";
import { ChannelConnectionsTab } from "../components/channel-connections-tab";

interface ChannelManagerPageProps {
  hotelId: string;
  baseRoutePrefix?: string; // e.g. "/owner/hotels" or "/hotels"
}

export function ChannelManagerPage({
  hotelId,
  baseRoutePrefix = "/owner/hotels",
}: ChannelManagerPageProps) {
  const router = useRouter();
  const { accessibleHotels = [], hotelName } = useWorkspaceProfile();
  const [activeTab, setActiveTab] = useState<"grid" | "channels">("grid");

  const currentHotel = accessibleHotels.find((h) => h.id === hotelId);
  const currentDisplayName = currentHotel?.name || hotelName || "Khách sạn hiện tại";

  const handleHotelChange = (newHotelId: string) => {
    if (!newHotelId || newHotelId === hotelId) return;
    router.push(`${baseRoutePrefix}/${encodeURIComponent(newHotelId)}/channel-manager`);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner & Hotel Switcher */}
      <div className="bg-gradient-to-br from-emerald-950 via-[#1a352d] to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-emerald-900/40">
        {/* Subtle decorative background pattern */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                VietSage Extranet
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white/90 border border-white/10 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Channex Sync Engine v2.4
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Kho Phòng & Kênh Phân Phối (Channel Manager)
            </h1>
            <p className="text-sm sm:text-base font-medium text-emerald-100/80 max-w-2xl leading-relaxed">
              Quản lý ma trận bảng giá, tồn kho 14 ngày và kết nối tự động 2 chiều (2-Way iCal) với Airbnb, Booking.com, Agoda.
            </p>
          </div>

          {/* Active Hotel Selector Dropdown */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 min-w-[280px]">
            <label
              htmlFor="hotel-select"
              className="block text-xs font-bold text-emerald-200 uppercase tracking-wider mb-1.5"
            >
              Khách sạn đang hoạt động:
            </label>
            <div className="relative">
              <select
                id="hotel-select"
                value={hotelId}
                onChange={(e) => handleHotelChange(e.target.value)}
                className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-slate-900/90 text-white font-bold text-sm sm:text-base border border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer appearance-none"
              >
                {accessibleHotels.length > 0 ? (
                  accessibleHotels.map((h) => (
                    <option key={h.id} value={h.id} className="bg-slate-900 text-white">
                      {h.name}
                    </option>
                  ))
                ) : (
                  <option value={hotelId} className="bg-slate-900 text-white">
                    {currentDisplayName}
                  </option>
                )}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70">
                ▼
              </div>
            </div>
          </div>
        </div>

        {/* Quick Highlights / Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/5">
            <span className="text-xs font-bold text-emerald-200/90 uppercase tracking-wider block">
              Kênh Phân Phối
            </span>
            <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
              4 / 4 Kênh
            </span>
            <span className="text-[11px] font-medium text-emerald-300/80">
              Airbnb, Booking, Agoda, Direct
            </span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/5">
            <span className="text-xs font-bold text-emerald-200/90 uppercase tracking-wider block">
              Tỷ Lệ Mở Bán
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">
              92.5%
            </span>
            <span className="text-[11px] font-medium text-emerald-300/80">
              Quỹ phòng 14 ngày tới
            </span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/5">
            <span className="text-xs font-bold text-emerald-200/90 uppercase tracking-wider block">
              Tự Động Chống Trùng
            </span>
            <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
              Kích hoạt
            </span>
            <span className="text-[11px] font-medium text-emerald-300/80">
              Khóa tức thì khi có đặt phòng
            </span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/5">
            <span className="text-xs font-bold text-emerald-200/90 uppercase tracking-wider block">
              Đồng Bộ Gần Nhất
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-300 mt-1 block">
              Vừa xong
            </span>
            <span className="text-[11px] font-medium text-emerald-300/80">
              Cập nhật 2 chiều tự động
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Switcher Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("grid")}
          className={`h-12 px-6 rounded-t-2xl font-extrabold text-sm sm:text-base transition-all flex items-center gap-2.5 cursor-pointer border-t-2 border-x ${
            activeTab === "grid"
              ? "bg-white text-emerald-950 border-t-emerald-700 border-x-slate-200 border-b-white -mb-px shadow-2xs z-10"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200/70"
          }`}
        >
          <span className="text-lg">📅</span>
          <span>Bảng Giá & Kho Phòng (Inventory Grid)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("channels")}
          className={`h-12 px-6 rounded-t-2xl font-extrabold text-sm sm:text-base transition-all flex items-center gap-2.5 cursor-pointer border-t-2 border-x ${
            activeTab === "channels"
              ? "bg-white text-emerald-950 border-t-emerald-700 border-x-slate-200 border-b-white -mb-px shadow-2xs z-10"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200/70"
          }`}
        >
          <span className="text-lg">📡</span>
          <span>Kết Nối Kênh Phân Phối (Channels)</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "grid" ? (
          <InventoryGrid hotelId={hotelId} />
        ) : (
          <ChannelConnectionsTab hotelId={hotelId} />
        )}
      </div>
    </div>
  );
}
