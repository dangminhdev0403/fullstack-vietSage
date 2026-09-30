"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex } from "../hooks/use-channel-manager";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import type { SimulatedBookingItem } from "../types/channel-manager.types";

interface OtaBookingsTabProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
  onSwitchToSimulator?: () => void;
  onSwitchToAri?: () => void;
}

type StatusFilter = "ALL" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";

interface ChannelMeta {
  name: string;
  tag: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  pillClass: string;
}

const getChannelMeta = (otaName: string): ChannelMeta => {
  const norm = (otaName || "").toLowerCase().replace(/[\s\._-]/g, "");
  if (norm.includes("booking")) {
    return {
      name: "Booking.com",
      tag: "B.",
      bgColor: "bg-[#003580]",
      textColor: "text-white",
      borderColor: "border-[#00224f]",
      pillClass: "bg-blue-50 text-blue-900 border-blue-200/80",
    };
  }
  if (norm.includes("trip") || norm.includes("ctrip")) {
    return {
      name: "Trip.com",
      tag: "Trip",
      bgColor: "bg-[#2681ff]",
      textColor: "text-white",
      borderColor: "border-blue-400",
      pillClass: "bg-indigo-50 text-indigo-900 border-indigo-200/80",
    };
  }
  if (norm.includes("agoda")) {
    return {
      name: "Agoda",
      tag: "agoda",
      bgColor: "bg-[#00a599]",
      textColor: "text-white",
      borderColor: "border-teal-400",
      pillClass: "bg-teal-50 text-teal-900 border-teal-200/80",
    };
  }
  if (norm.includes("airbnb")) {
    return {
      name: "Airbnb",
      tag: "air",
      bgColor: "bg-[#ff385c]",
      textColor: "text-white",
      borderColor: "border-rose-400",
      pillClass: "bg-rose-50 text-rose-900 border-rose-200/80",
    };
  }
  if (norm.includes("expedia")) {
    return {
      name: "Expedia",
      tag: "Exp",
      bgColor: "bg-[#00355f]",
      textColor: "text-amber-300",
      borderColor: "border-amber-400",
      pillClass: "bg-amber-50 text-amber-900 border-amber-200/80",
    };
  }
  if (norm.includes("traveloka")) {
    return {
      name: "Traveloka",
      tag: "Tvlk",
      bgColor: "bg-[#1ba0e2]",
      textColor: "text-white",
      borderColor: "border-sky-400",
      pillClass: "bg-sky-50 text-sky-900 border-sky-200/80",
    };
  }
  return {
    name: otaName || "OTA",
    tag: "OTA",
    bgColor: "bg-slate-700",
    textColor: "text-white",
    borderColor: "border-slate-500",
    pillClass: "bg-slate-100 text-slate-800 border-slate-300",
  };
};

function formatMoneyWithCurrency(amount: number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  const curr = (currency || "VND").toUpperCase();
  if (curr === "VND") {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const [year, month, day] = isoStr.split("T")[0].split("-");
  if (!year || !month || !day) return isoStr;
  return `${day}/${month}/${year}`;
}

function calculateNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(checkIn.split("T")[0]).getTime();
  const end = new Date(checkOut.split("T")[0]).getTime();
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1;
}

export function OtaBookingsTab({
  hotelId,
  roleScope = "owner",
}: OtaBookingsTabProps) {
  const queryClient = useQueryClient();
  const {
    simulatedBookings,
    isLoadingSimulatedBookings,
    refreshSimulatedBookings,
    pollFeed,
  } = useChannex(hotelId, roleScope, {
    loadSimulatedBookings: true,
    loadMappings: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [selectedBooking, setSelectedBooking] = useState<SimulatedBookingItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedBooking(null);
      }
    };
    if (selectedBooking) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedBooking]);

  // Realtime WebSocket synchronization
  const realtimeHandlers = useMemo(
    () => ({
      onChannelBookingCreated: () => {
        toast.info("Có đơn đặt phòng OTA mới từ Channex!");
        void refreshSimulatedBookings();
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
      onChannelBookingCancelled: () => {
        toast.warning("Một đơn đặt phòng OTA vừa bị hủy trên sàn!");
        void refreshSimulatedBookings();
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
    }),
    [queryClient, hotelId, refreshSimulatedBookings],
  );
  useOwnerRequestRealtime(hotelId, realtimeHandlers);

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Đã sao chép mã đơn vào bộ nhớ tạm");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleManualDrain = async () => {
    try {
      const res = await pollFeed.mutateAsync({ limit: 10 });
      await refreshSimulatedBookings();
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await showSuccessAlert(
        "Đồng bộ thành công!",
        `Đã kéo ${res.totalProcessed} thông báo (${res.newBookingsCount} đơn mới) từ Channex Feed về hệ thống.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể kéo feed từ Channex.";
      await showErrorAlert("Lỗi kéo feed", msg);
    }
  };

  // Distinct channels in bookings
  const availableChannels = useMemo(() => {
    const set = new Set<string>();
    for (const b of simulatedBookings) {
      if (b.otaName) set.add(b.otaName);
    }
    return Array.from(set);
  }, [simulatedBookings]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return simulatedBookings.filter((b) => {
      if (statusFilter !== "ALL") {
        const normStatus = (b.status || "").toUpperCase();
        if (statusFilter === "CONFIRMED" && normStatus !== "CONFIRMED") return false;
        if (statusFilter === "CANCELLED" && normStatus !== "CANCELLED") return false;
        if (statusFilter === "CHECKED_IN" && normStatus !== "CHECKED_IN") return false;
      }
      if (channelFilter !== "ALL") {
        if (b.otaName !== channelFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesCode = (b.reservationCode || "").toLowerCase().includes(q);
        const matchesOtaCode = (b.otaReservationCode || "").toLowerCase().includes(q);
        const matchesGuest = (b.guestName || "").toLowerCase().includes(q);
        const matchesPhone = (b.guestPhone || "").toLowerCase().includes(q);
        const matchesRoom = (b.roomNumber || "").toLowerCase().includes(q);
        const matchesType = (b.roomType || "").toLowerCase().includes(q);
        if (!matchesCode && !matchesOtaCode && !matchesGuest && !matchesPhone && !matchesRoom && !matchesType) {
          return false;
        }
      }
      return true;
    });
  }, [simulatedBookings, statusFilter, channelFilter, searchQuery]);

  // Metric stats
  const stats = useMemo(() => {
    let confirmedCount = 0;
    let cancelledCount = 0;
    let checkedInCount = 0;
    let totalRevenueVnd = 0;
    let totalRevenueGbp = 0;

    for (const b of simulatedBookings) {
      const st = (b.status || "").toUpperCase();
      if (st === "CONFIRMED") confirmedCount++;
      else if (st === "CANCELLED") cancelledCount++;
      else if (st === "CHECKED_IN") checkedInCount++;

      if (st !== "CANCELLED" && b.amount) {
        const curr = (b.currency || "VND").toUpperCase();
        if (curr === "GBP") totalRevenueGbp += b.amount;
        else totalRevenueVnd += b.amount;
      }
    }

    return {
      total: simulatedBookings.length,
      confirmed: confirmedCount,
      cancelled: cancelledCount,
      checkedIn: checkedInCount,
      revenueVnd: totalRevenueVnd,
      revenueGbp: totalRevenueGbp,
    };
  }, [simulatedBookings]);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#e5ddcd] bg-white p-6 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đồng bộ 2 chiều Realtime</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#17201b]">
            Đơn đặt phòng OTA & Lịch sử nhận phòng
          </h2>
          <p className="mt-1 text-sm text-[#5a6760]">
            Danh sách tất cả các đơn đặt phòng tự động tiếp nhận từ Booking.com, Trip.com, Agoda và các kênh phân phối.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refreshSimulatedBookings()}
            disabled={isLoadingSimulatedBookings}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <VsIcon
              name="refresh"
              className={`text-base ${isLoadingSimulatedBookings ? "animate-spin" : ""}`}
            />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleManualDrain}
            disabled={pollFeed.isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#003580] px-4.5 text-sm font-bold text-white shadow-xs hover:bg-[#002860] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Kéo các thông báo đơn đặt phòng mới nhất từ hàng đợi Channex Feed"
          >
            <VsIcon
              name="cloud_download"
              className={`text-base ${pollFeed.isPending ? "animate-bounce" : ""}`}
            />
            <span>{pollFeed.isPending ? "Đang kéo Feed..." : "Kéo Feed Channex"}</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Tổng đơn OTA</span>
            <span className="text-xl">📦</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-blue-950">
            {stats.total}
          </p>
          <p className="mt-1 text-xs text-blue-600 font-medium">Đơn đã tiếp nhận từ các sàn</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Đang giữ phòng</span>
            <span className="text-xl">🟢</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-950">
            {stats.confirmed}
          </p>
          <p className="mt-1 text-xs text-emerald-600 font-medium">Đơn hợp lệ đang trừ kho phòng</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Đơn đã hủy</span>
            <span className="text-xl">⚪</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-rose-950">
            {stats.cancelled}
          </p>
          <p className="mt-1 text-xs text-rose-600 font-medium">Đã tự động hoàn trả kho phòng</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Doanh thu dự kiến</span>
            <span className="text-xl">💰</span>
          </div>
          <div className="mt-3">
            {stats.revenueGbp > 0 && (
              <p className="text-2xl font-extrabold text-amber-950">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "GBP" }).format(stats.revenueGbp)}
              </p>
            )}
            {stats.revenueVnd > 0 && (
              <p className={`${stats.revenueGbp > 0 ? "text-sm text-amber-800 font-semibold" : "text-2xl font-extrabold text-amber-950"}`}>
                {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(stats.revenueVnd)}
              </p>
            )}
            {stats.revenueGbp === 0 && stats.revenueVnd === 0 && (
              <p className="text-2xl font-extrabold text-amber-950">0 ₫</p>
            )}
          </div>
          <p className="mt-1 text-xs text-amber-600 font-medium">Từ các đơn đang có hiệu lực</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-[#e5ddcd] bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, mã OTA, tên khách, số phòng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status & Channel Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Segmented Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-3.5 py-1.5 transition cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tất cả ({simulatedBookings.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CONFIRMED")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition cursor-pointer ${
                  statusFilter === "CONFIRMED"
                    ? "bg-white text-emerald-800 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Giữ phòng ({stats.confirmed})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CANCELLED")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition cursor-pointer ${
                  statusFilter === "CANCELLED"
                    ? "bg-white text-rose-800 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span>Đã hủy ({stats.cancelled})</span>
              </button>
            </div>

            {/* Channel Dropdown */}
            {availableChannels.length > 1 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="ALL">Mọi kênh OTA</option>
                {availableChannels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-[#e5ddcd] bg-white shadow-xs">
        {isLoadingSimulatedBookings ? (
          <div className="py-20 text-center text-sm text-slate-500">
            <span className="inline-block h-7 w-7 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
            <p className="mt-3 font-semibold text-slate-700">Đang tải danh sách đơn đặt phòng OTA...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-20 text-center">
            <span className="text-4xl text-slate-300">📭</span>
            <p className="mt-3 text-base font-bold text-slate-800">
              Không tìm thấy đơn đặt phòng nào
            </p>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "ALL" || channelFilter !== "ALL"
                ? "Thử bỏ bộ lọc hoặc từ khóa tìm kiếm để xem tất cả đơn."
                : "Chưa có đơn đặt phòng nào từ OTA được tiếp nhận vào khách sạn này."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-4 px-5">Kênh & Mã đơn</th>
                  <th className="py-4 px-5">Khách hàng</th>
                  <th className="py-4 px-5">Hạng phòng & Phòng gán</th>
                  <th className="py-4 px-5">Lịch lưu trú</th>
                  <th className="py-4 px-5">Tổng tiền</th>
                  <th className="py-4 px-5 text-center">Trạng thái</th>
                  <th className="py-4 px-3 text-right w-10">
                    <span className="sr-only">Xem chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map((b) => {
                  const isCancelled = (b.status || "").toUpperCase() === "CANCELLED";
                  const isCheckedIn = (b.status || "").toUpperCase() === "CHECKED_IN";
                  const channel = getChannelMeta(b.otaName);
                  const nights = calculateNights(b.checkInDate, b.checkOutDate);

                  return (
                    <tr
                      key={b.bookingId}
                      onClick={() => setSelectedBooking(b)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedBooking(b);
                        }
                      }}
                      className={`group cursor-pointer transition-colors duration-150 ${
                        isCancelled
                          ? "bg-slate-50/50 hover:bg-slate-100/70 text-slate-500"
                          : "hover:bg-amber-50/25"
                      }`}
                      title="Nhấp vào đơn để xem thông tin chi tiết"
                    >
                      {/* Column 1: Kênh & Mã đơn */}
                      <td className="py-4 px-5 align-middle">
                        <div className="flex items-center gap-3">
                          {/* Channel Badge / Logo */}
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black text-xs shadow-2xs ${channel.bgColor} ${channel.textColor}`}
                            title={channel.name}
                          >
                            {channel.tag}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {channel.name}
                              </span>
                              {b.otaReservationCode && (
                                <span className="font-mono text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                  #{b.otaReservationCode}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-mono text-slate-500">
                              <span>PMS: {b.reservationCode}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(b.reservationCode, b.bookingId);
                                }}
                                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition cursor-pointer"
                                title="Sao chép mã PMS"
                              >
                                {copiedKey === b.bookingId ? (
                                  <span className="text-emerald-600 font-bold text-xs">✓</span>
                                ) : (
                                  <VsIcon name="content_copy" className="text-xs" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Khách hàng */}
                      <td className="py-4 px-5 align-middle">
                        <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {b.guestName}
                        </div>
                        {b.guestPhone ? (
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-mono text-slate-500">
                            <VsIcon name="call" className="text-xs text-slate-400" />
                            <span>{b.guestPhone}</span>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-xs text-slate-400 italic">
                            Chưa có SĐT
                          </div>
                        )}
                      </td>

                      {/* Column 3: Hạng phòng & Phòng gán */}
                      <td className="py-4 px-5 align-middle">
                        <div className="text-sm font-semibold text-slate-900">
                          {b.roomType || "Chưa xác định"}
                        </div>
                        <div className="mt-1">
                          {b.roomNumber ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                                isCancelled
                                  ? "bg-slate-100 text-slate-500 border border-slate-200"
                                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              <span>{isCancelled ? "🔓" : "🔑"}</span>
                              <span>Phòng {b.roomNumber}</span>
                              <span className="font-normal text-[11px] text-slate-500">
                                {isCancelled ? "(Đã hoàn kho)" : "(Đang giữ)"}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                              <span>⏳</span>
                              <span>Chờ lễ tân gán phòng</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Lịch lưu trú */}
                      <td className="py-4 px-5 align-middle">
                        <div className="text-sm font-semibold text-slate-900">
                          {formatDate(b.checkInDate)} → {formatDate(b.checkOutDate)}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {nights} đêm
                          </span>
                        </div>
                      </td>

                      {/* Column 5: Tổng tiền */}
                      <td className="py-4 px-5 align-middle">
                        <div className="text-base font-extrabold text-slate-900 tracking-tight">
                          {formatMoneyWithCurrency(b.amount, b.currency)}
                        </div>
                        {b.currency && (
                          <div className="text-[11px] font-bold uppercase text-slate-400 mt-0.5">
                            {b.currency}
                          </div>
                        )}
                      </td>

                      {/* Column 6: Trạng thái */}
                      <td className="py-4 px-5 text-center align-middle">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            <span>Đã hủy</span>
                          </span>
                        ) : isCheckedIn ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            <span>Đã nhận phòng</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Đang giữ phòng</span>
                          </span>
                        )}
                      </td>

                      {/* Column 7: Affordance Indicator (Replaces separate action column) */}
                      <td className="py-4 px-3 text-right align-middle">
                        <VsIcon
                          name="chevron_right"
                          className="text-slate-300 text-lg group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all inline-block"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black text-sm shadow-xs ${getChannelMeta(selectedBooking.otaName).bgColor} ${getChannelMeta(selectedBooking.otaName).textColor}`}
                >
                  {getChannelMeta(selectedBooking.otaName).tag}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Chi tiết đơn đặt phòng OTA
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {selectedBooking.otaName} • #{selectedBooking.otaReservationCode || selectedBooking.reservationCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="mt-5 space-y-4">
              {/* Quick Details Grid */}
              <div className="grid grid-cols-2 gap-3.5 rounded-xl bg-slate-50/80 border border-slate-100 p-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Khách hàng</span>
                  <p className="font-bold text-slate-900 text-base mt-1">
                    {selectedBooking.guestName}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Số điện thoại</span>
                  <p className="font-bold text-slate-900 text-base mt-1 font-mono">
                    {selectedBooking.guestPhone || "Không có"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hạng phòng</span>
                  <p className="font-semibold text-slate-900 text-sm mt-1">
                    {selectedBooking.roomType || "Chưa xác định"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Phòng xếp thực tế</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {selectedBooking.roomNumber ? `Phòng ${selectedBooking.roomNumber}` : "Chờ xếp phòng"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ngày Check-in</span>
                  <p className="font-semibold text-slate-900 text-sm mt-1">
                    {formatDate(selectedBooking.checkInDate)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ngày Check-out</span>
                  <p className="font-semibold text-slate-900 text-sm mt-1">
                    {formatDate(selectedBooking.checkOutDate)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tổng thanh toán</span>
                  <p className="font-extrabold text-blue-700 text-lg mt-1">
                    {formatMoneyWithCurrency(selectedBooking.amount, selectedBooking.currency)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Trạng thái phòng</span>
                  <p className="font-bold mt-1 text-sm">
                    {(selectedBooking.status || "").toUpperCase() === "CANCELLED" ? (
                      <span className="text-rose-600">Đã giải phóng về kho trống</span>
                    ) : (
                      <span className="text-emerald-600">Đang giữ chỗ</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Technical / Reference IDs */}
              <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Channex Booking ID:</span>
                  <span className="text-slate-700 font-semibold">{selectedBooking.bookingId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">VietSage PMS Code:</span>
                  <span className="text-slate-700 font-semibold">{selectedBooking.reservationCode}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Thời điểm nhận đơn:</span>
                  <span className="text-slate-700">
                    {new Date(selectedBooking.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </span>
                </div>
              </div>

              {/* Inventory Status Explanation */}
              {(selectedBooking.status || "").toUpperCase() === "CANCELLED" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-rose-800">
                  <p className="font-bold text-sm flex items-center gap-1.5">
                    <span>💡</span> Đơn đặt phòng này đã bị hủy từ kênh OTA
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-rose-700">
                    Hệ thống VietSage đã tự động hoàn trả phòng <strong>{selectedBooking.roomNumber || selectedBooking.roomType}</strong> lại vào quỹ phòng trống ngày {formatDate(selectedBooking.checkInDate)}.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-800">
                  <p className="font-bold text-sm flex items-center gap-1.5">
                    <span>✅</span> Đơn đặt phòng đang có hiệu lực
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                    Phòng <strong>{selectedBooking.roomNumber || selectedBooking.roomType}</strong> đang được khóa giữ chỗ cho khách {selectedBooking.guestName} từ {formatDate(selectedBooking.checkInDate)} đến {formatDate(selectedBooking.checkOutDate)}.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-black transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
