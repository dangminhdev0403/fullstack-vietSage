"use client";

import { useMemo, useState } from "react";
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

const getChannelMeta = (otaName: string) => {
  const norm = (otaName || "").toLowerCase().replace(/[\s\._-]/g, "");
  if (norm.includes("booking")) {
    return {
      name: "Booking.com",
      icon: "🅱️",
      badge: "bg-blue-100 text-blue-800 border-blue-200",
      accent: "#003580",
    };
  }
  if (norm.includes("trip") || norm.includes("ctrip")) {
    return {
      name: "Trip.com",
      icon: "🌏",
      badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
      accent: "#2681ff",
    };
  }
  if (norm.includes("agoda")) {
    return {
      name: "Agoda",
      icon: "🔷",
      badge: "bg-cyan-100 text-cyan-800 border-cyan-200",
      accent: "#00a599",
    };
  }
  if (norm.includes("airbnb")) {
    return {
      name: "Airbnb",
      icon: "🏠",
      badge: "bg-rose-100 text-rose-800 border-rose-200",
      accent: "#ff385c",
    };
  }
  if (norm.includes("expedia")) {
    return {
      name: "Expedia",
      icon: "✈️",
      badge: "bg-amber-100 text-amber-800 border-amber-200",
      accent: "#00355f",
    };
  }
  if (norm.includes("traveloka")) {
    return {
      name: "Traveloka",
      icon: "🐦",
      badge: "bg-sky-100 text-sky-800 border-sky-200",
      accent: "#1ba0e2",
    };
  }
  return {
    name: otaName || "OTA",
    icon: "🌐",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
    accent: "#4b5563",
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
  onSwitchToAri,
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
      // Status filter
      if (statusFilter !== "ALL") {
        const normStatus = (b.status || "").toUpperCase();
        if (statusFilter === "CONFIRMED" && normStatus !== "CONFIRMED") return false;
        if (statusFilter === "CANCELLED" && normStatus !== "CANCELLED") return false;
        if (statusFilter === "CHECKED_IN" && normStatus !== "CHECKED_IN") return false;
      }
      // Channel filter
      if (channelFilter !== "ALL") {
        if (b.otaName !== channelFilter) return false;
      }
      // Search query
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#e5ddcd] bg-white p-6 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đồng bộ 2 chiều Realtime</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#17201b]">
            Đơn đặt phòng OTA & Lịch sử nhận phòng
          </h2>
          <p className="mt-1 text-sm text-[#5a6760]">
            Danh sách tất cả các đơn đặt phòng tự động tiếp nhận từ Booking.com, Trip.com, Agoda và hệ thống phân phối OTA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refreshSimulatedBookings()}
            disabled={isLoadingSimulatedBookings}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 shadow-2xs hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
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
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#003580] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#002860] transition active:scale-95 disabled:opacity-50"
            title="Kéo các thông báo đơn đặt phòng mới nhất từ hàng đợi Channex Feed"
          >
            <VsIcon
              name="cloud_download"
              className={`text-base ${pollFeed.isPending ? "animate-bounce" : ""}`}
            />
            <span>{pollFeed.isPending ? "Đang kéo Feed..." : "📥 Kéo Feed Channex"}</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng đơn OTA</span>
            <span className="text-xl">📦</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-blue-950">
            {stats.total}
          </p>
          <p className="mt-1 text-xs text-blue-600">Đơn đã tiếp nhận từ các sàn</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-bold uppercase tracking-wider">Đang giữ phòng</span>
            <span className="text-xl">🟢</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-950">
            {stats.confirmed}
          </p>
          <p className="mt-1 text-xs text-emerald-600">Đơn hợp lệ đang trừ kho phòng</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-bold uppercase tracking-wider">Đơn đã hủy</span>
            <span className="text-xl">⚪</span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-rose-950">
            {stats.cancelled}
          </p>
          <p className="mt-1 text-xs text-rose-600">Đã tự động hoàn trả ô phòng</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-bold uppercase tracking-wider">Doanh thu dự kiến</span>
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
          <p className="mt-1 text-xs text-amber-600">Từ các đơn đang có hiệu lực</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-[#e5ddcd] bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400"
            />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, mã OTA, tên khách, số phòng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-9 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status & Channel Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Pills */}
            <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-3 py-1.5 transition ${
                  statusFilter === "ALL"
                    ? "bg-white text-gray-900 shadow-2xs font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Tất cả ({simulatedBookings.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CONFIRMED")}
                className={`rounded-lg px-3 py-1.5 transition ${
                  statusFilter === "CONFIRMED"
                    ? "bg-white text-emerald-800 shadow-2xs font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                🟢 Giữ phòng ({stats.confirmed})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CANCELLED")}
                className={`rounded-lg px-3 py-1.5 transition ${
                  statusFilter === "CANCELLED"
                    ? "bg-white text-rose-800 shadow-2xs font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                ⚪ Đã hủy ({stats.cancelled})
              </button>
            </div>

            {/* Channel Dropdown */}
            {availableChannels.length > 1 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
      <div className="overflow-hidden rounded-2xl border border-[#e5ddcd] bg-white shadow-sm">
        {isLoadingSimulatedBookings ? (
          <div className="py-16 text-center text-xs text-gray-500">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="mt-3 font-semibold text-gray-700">Đang tải danh sách đơn đặt phòng OTA...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-16 text-center">
            <span className="text-4xl text-gray-300">📭</span>
            <p className="mt-3 text-base font-bold text-gray-800">
              Không tìm thấy đơn đặt phòng nào
            </p>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "ALL" || channelFilter !== "ALL"
                ? "Thử bỏ bộ lọc hoặc từ khóa tìm kiếm để xem tất cả đơn."
                : "Chưa có đơn đặt phòng nào từ OTA được tiếp nhận vào khách sạn này."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="py-3.5 px-4">Kênh & Mã đơn</th>
                  <th className="py-3.5 px-4">Khách hàng</th>
                  <th className="py-3.5 px-4">Hạng phòng & Phòng gán</th>
                  <th className="py-3.5 px-4">Lịch lưu trú</th>
                  <th className="py-3.5 px-4">Tổng tiền</th>
                  <th className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBookings.map((b) => {
                  const isCancelled = (b.status || "").toUpperCase() === "CANCELLED";
                  const isCheckedIn = (b.status || "").toUpperCase() === "CHECKED_IN";
                  const channel = getChannelMeta(b.otaName);
                  const nights = calculateNights(b.checkInDate, b.checkOutDate);

                  return (
                    <tr
                      key={b.bookingId}
                      className={`transition hover:bg-gray-50/70 ${
                        isCancelled ? "bg-gray-50/40 opacity-70" : ""
                      }`}
                    >
                      {/* Column 1: Channel & Codes */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl" title={channel.name}>
                            {channel.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${channel.badge}`}
                              >
                                {channel.name}
                              </span>
                              {b.otaReservationCode && (
                                <span className="font-mono text-[11px] font-bold text-gray-900">
                                  #{b.otaReservationCode}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 font-mono">
                              <span>Mã PMS: {b.reservationCode}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(b.reservationCode, b.bookingId)}
                                className="text-gray-400 hover:text-blue-600 transition"
                                title="Sao chép mã đơn"
                              >
                                {copiedKey === b.bookingId ? "✓" : "📋"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Guest Details */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 text-sm">{b.guestName}</div>
                        {b.guestPhone ? (
                          <div className="mt-0.5 text-xs text-gray-500 font-mono">
                            📞 {b.guestPhone}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-gray-400 italic">
                            Chưa có SĐT
                          </div>
                        )}
                      </td>

                      {/* Column 3: Room Type & Room Number */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-800">
                          {b.roomType || "Chưa xác định"}
                        </div>
                        <div className="mt-1">
                          {b.roomNumber ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                                isCancelled
                                  ? "bg-gray-100 text-gray-500 border-gray-200 line-through"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              }`}
                            >
                              <span>{isCancelled ? "🔓" : "🔒"}</span>
                              <span>Phòng {b.roomNumber}</span>
                              <span className="text-[10px] font-normal">
                                {isCancelled ? "(Đã trả trống)" : "(Đang giữ)"}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                              <span>⏳</span>
                              <span>Chờ lễ tân gán phòng</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Stay Dates */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-900">
                          {formatDate(b.checkInDate)} ➔ {formatDate(b.checkOutDate)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {nights} đêm
                        </div>
                      </td>

                      {/* Column 5: Amount */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-sm text-gray-900">
                          {formatMoneyWithCurrency(b.amount, b.currency)}
                        </div>
                        {b.currency && (
                          <div className="text-[10px] font-bold uppercase text-gray-400">
                            {b.currency}
                          </div>
                        )}
                      </td>

                      {/* Column 6: Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700">
                            <span>●</span>
                            <span>Đã hủy</span>
                          </span>
                        ) : isCheckedIn ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700">
                            <span>●</span>
                            <span>Đã nhận phòng</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            <span>●</span>
                            <span>Đang giữ phòng</span>
                          </span>
                        )}
                      </td>

                      {/* Column 7: Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedBooking(b)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition shadow-2xs"
                        >
                          <VsIcon name="visibility" className="text-sm" />
                          <span>Chi tiết</span>
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getChannelMeta(selectedBooking.otaName).icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Chi tiết đơn đặt phòng OTA
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    {selectedBooking.otaName} • #{selectedBooking.otaReservationCode || selectedBooking.reservationCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3.5">
                <div>
                  <span className="text-gray-500">Khách hàng:</span>
                  <p className="font-bold text-gray-900 text-sm mt-0.5">
                    {selectedBooking.guestName}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Số điện thoại:</span>
                  <p className="font-bold text-gray-900 text-sm mt-0.5 font-mono">
                    {selectedBooking.guestPhone || "Không có"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Hạng phòng:</span>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {selectedBooking.roomType || "Chưa xác định"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Phòng thực tế xếp:</span>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {selectedBooking.roomNumber ? `Phòng ${selectedBooking.roomNumber}` : "Chờ xếp phòng"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Ngày Check-in:</span>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {formatDate(selectedBooking.checkInDate)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Ngày Check-out:</span>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {formatDate(selectedBooking.checkOutDate)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Tổng thanh toán:</span>
                  <p className="font-extrabold text-blue-700 text-sm mt-0.5">
                    {formatMoneyWithCurrency(selectedBooking.amount, selectedBooking.currency)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Trạng thái kho:</span>
                  <p className="font-bold mt-0.5">
                    {(selectedBooking.status || "").toUpperCase() === "CANCELLED" ? (
                      <span className="text-rose-600">Đã giải phóng về kho trống</span>
                    ) : (
                      <span className="text-emerald-600">Đang giữ phòng</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Technical / Mapping IDs */}
              <div className="rounded-xl border border-gray-150 p-3 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Channex Booking ID:</span>
                  <span className="text-gray-700 font-semibold">{selectedBooking.bookingId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">VietSage Reservation ID:</span>
                  <span className="text-gray-700 font-semibold">{selectedBooking.reservationId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Thời điểm nhận đơn:</span>
                  <span className="text-gray-700">
                    {new Date(selectedBooking.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </span>
                </div>
              </div>

              {/* Explain inventory status */}
              {(selectedBooking.status || "").toUpperCase() === "CANCELLED" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-rose-800">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>💡</span> Đơn này đã bị hủy từ kênh OTA
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-rose-700">
                    Hệ thống VietSage đã tự động hoàn trả phòng <strong>{selectedBooking.roomNumber || selectedBooking.roomType}</strong> lại vào kho phòng trống (lưới ARI) ngày {formatDate(selectedBooking.checkInDate)}.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-800">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>✅</span> Đơn đang có hiệu lực
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                    Phòng <strong>{selectedBooking.roomNumber || selectedBooking.roomType}</strong> đang được khóa giữ chỗ cho khách {selectedBooking.guestName} từ {formatDate(selectedBooking.checkInDate)} đến {formatDate(selectedBooking.checkOutDate)}.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-3">
              {onSwitchToAri && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBooking(null);
                    onSwitchToAri();
                  }}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                >
                  Xem lưới phòng (ARI)
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-bold text-white hover:bg-black transition"
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
