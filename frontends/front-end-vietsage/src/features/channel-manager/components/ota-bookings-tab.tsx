"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex } from "../hooks/use-channel-manager";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import type { SimulatedBookingItem } from "../types/channel-manager.types";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelOpsPage, HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";

interface OtaBookingsTabProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
  onSwitchToAri?: () => void;
  baseRoutePrefix?: string;
  showTechnicalTools?: boolean;
}

type StatusFilter =
  | "ALL"
  | "TODAY_ARRIVALS"
  | "TODAY_DEPARTURES"
  | "UNASSIGNED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CANCELLED";

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
  baseRoutePrefix = "/hotels",
  showTechnicalTools = false,
}: OtaBookingsTabProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    simulatedBookings,
    isLoadingSimulatedBookings,
    refreshSimulatedBookings,
    pollFeed,
    pendingModifications,
    isLoadingPendingModifications,
    pendingModificationsError,
    refreshPendingModifications,
    resolveModification,
  } = useChannex(hotelId, roleScope, {
    loadSimulatedBookings: true,
    loadMappings: false,
    loadConfig: false,
    loadPendingModifications: showTechnicalTools,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [selectedBooking, setSelectedBooking] = useState<SimulatedBookingItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assigningBooking, setAssigningBooking] = useState<SimulatedBookingItem | null>(null);
  const [selectedRoomIdToAssign, setSelectedRoomIdToAssign] = useState<string>("");

  const todayYmd = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  // Query available rooms for quick assignment
  const { data: availableRooms = [], refetch: refetchAvailableRooms } = useQuery({
    queryKey: ["hotel-available-rooms-quick-assign", hotelId],
    queryFn: async () => {
      const res = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms?status=AVAILABLE&limit=100`,
        { method: "GET" },
      );
      return res.data?.items ?? [];
    },
    enabled: Boolean(hotelId && assigningBooking),
    staleTime: 5000,
  });

  // Fast 1-Click Check-In Handler
  const handleFastCheckIn = async (b: SimulatedBookingItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!b.reservationId) return;

    if (!b.roomNumber && !b.roomId) {
      setAssigningBooking(b);
      setSelectedRoomIdToAssign("");
      void refetchAvailableRooms();
      return;
    }

    const confirmation = await showConfirmDialog({
      icon: "question",
      title: "Nhận phòng cho khách OTA?",
      html: `
        <div class="text-left text-sm text-slate-700 leading-relaxed">
          <p>Khách hàng: <strong>${b.guestName}</strong></p>
          <p>Kênh: <strong>${b.otaName}</strong></p>
          <p>Phòng: <strong class="text-emerald-700 text-base font-bold">Phòng ${b.roomNumber}</strong> (${b.roomType || "Tiêu chuẩn"})</p>
        </div>
      `,
      confirmText: "Nhận phòng",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    setIsProcessing(true);
    try {
      const res = await requestInternalApiEnvelope<{
        accessCode: string | null;
        reservation: { id: string; status: string };
        stay: { id: string; status: string };
      }>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(b.reservationId)}/check-in`,
        { method: "POST" },
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await refreshSimulatedBookings();
      if (selectedBooking?.bookingId === b.bookingId) {
        setSelectedBooking((prev) => (prev ? { ...prev, status: "CHECKED_IN" } : null));
      }

      await showSuccessAlert(
        "Nhận phòng thành công",
        `
          <div class="text-left text-sm text-slate-700 leading-relaxed">
            <p>Khách <strong>${b.guestName}</strong> đã nhận <strong>Phòng ${b.roomNumber}</strong>.</p>
            ${res.data?.accessCode ? `<p class="mt-2">Mã GuestOS: <span class="font-mono text-base font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${res.data.accessCode}</span></p>` : ""}
          </div>
        `,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể thực hiện check-in.";
      await showErrorAlert("Lỗi nhận phòng", msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Assign Room & Check-In in 1 go
  const handleAssignAndCheckIn = async () => {
    if (!assigningBooking || !selectedRoomIdToAssign) {
      toast.error("Vui lòng chọn phòng để xếp cho khách");
      return;
    }

    const chosenRoom = availableRooms.find((r) => r.id === selectedRoomIdToAssign);
    const roomNumber = chosenRoom?.roomNumber || chosenRoom?.id || "mới";

    setIsProcessing(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(assigningBooking.reservationId)}/room`,
        {
          method: "PUT",
          body: { roomId: selectedRoomIdToAssign },
        },
      );

      const res = await requestInternalApiEnvelope<{
        accessCode: string | null;
      }>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(assigningBooking.reservationId)}/check-in`,
        { method: "POST" },
      );

      const targetBooking = assigningBooking;
      setAssigningBooking(null);
      setSelectedRoomIdToAssign("");

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await refreshSimulatedBookings();

      await showSuccessAlert(
        "Xếp phòng thành công",
        `
          <div class="text-left text-sm text-slate-700 leading-relaxed">
            <p>Đã xếp <strong>Phòng ${roomNumber}</strong> cho khách <strong>${targetBooking.guestName}</strong>.</p>
            ${res.data?.accessCode ? `<p class="mt-2">Mã GuestOS: <span class="font-mono text-base font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${res.data.accessCode}</span></p>` : ""}
          </div>
        `,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể gán phòng và check-in.";
      await showErrorAlert("Lỗi gán phòng", msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Check-Out navigation
  const handleCheckOut = (b: SimulatedBookingItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const billingPrefix = baseRoutePrefix?.startsWith("/hotels") ? "/hotels" : "/owner/hotels";
    const params = new URLSearchParams();
    if (b.roomNumber) params.set("roomNumber", b.roomNumber);
    if (b.stayId) params.set("stayId", b.stayId);
    if (b.roomId) params.set("roomId", b.roomId);
    router.push(`${billingPrefix}/${encodeURIComponent(hotelId)}/billing?${params.toString()}`);
  };

  // Registration shortcut
  const handleOpenRegistration = (b: SimulatedBookingItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const roomsPrefix = baseRoutePrefix?.startsWith("/hotels") ? "/hotels" : "/owner/hotels";
    router.push(`${roomsPrefix}/${encodeURIComponent(hotelId)}/rooms?flow=check-in`);
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedBooking(null);
        setAssigningBooking(null);
      }
    };
    if (selectedBooking || assigningBooking) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedBooking, assigningBooking]);

  // Realtime WebSocket synchronization (data refetch only - toasts handled by page/layout notifier)
  const realtimeHandlers = useMemo(
    () => ({
      onChannelBookingCreated: () => {
        void refreshSimulatedBookings();
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
      onChannelBookingCancelled: () => {
        void refreshSimulatedBookings();
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
    }),
    [queryClient, hotelId, refreshSimulatedBookings],
  );
  useOwnerRequestRealtime(hotelId, realtimeHandlers, { showConnectionToasts: false });

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

  const handleResolveModification = async (logId: string) => {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Xác nhận đã đối soát?",
      text: "Chỉ xác nhận sau khi ngày lưu trú và phòng trên PMS đã được kiểm tra, cập nhật thủ công.",
      showCancelButton: true,
      confirmButtonText: "Đã đối soát",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#b45309",
    });
    if (!confirmation.isConfirmed) return;
    try {
      await resolveModification.mutateAsync({ logId });
      await refreshPendingModifications();
      await showSuccessAlert(
        "Đã xác nhận đối soát",
        "Channex sẽ ACK revision ở lần đồng bộ tiếp theo.",
      );
    } catch (err: unknown) {
      await showErrorAlert(
        "Không thể xác nhận đối soát",
        err instanceof Error ? err.message : "Vui lòng thử lại.",
      );
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

  // Operational Counters
  const todayArrivalsCount = useMemo(() => {
    return simulatedBookings.filter((b) => {
      const st = (b.status || "").toUpperCase();
      return (
        st === "CONFIRMED" &&
        b.checkInDate &&
        b.checkInDate <= todayYmd
      );
    }).length;
  }, [simulatedBookings, todayYmd]);

  const todayDeparturesCount = useMemo(() => {
    return simulatedBookings.filter((b) => {
      const st = (b.status || "").toUpperCase();
      return (
        (st === "CHECKED_IN" || b.stayStatus === "ACTIVE") &&
        b.checkOutDate &&
        b.checkOutDate <= todayYmd
      );
    }).length;
  }, [simulatedBookings, todayYmd]);

  const unassignedCount = useMemo(() => {
    return simulatedBookings.filter((b) => {
      const st = (b.status || "").toUpperCase();
      return st === "CONFIRMED" && !b.roomNumber;
    }).length;
  }, [simulatedBookings]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return simulatedBookings.filter((b) => {
      const normStatus = (b.status || "").toUpperCase();
      if (statusFilter === "TODAY_ARRIVALS") {
        if (normStatus !== "CONFIRMED" || !b.checkInDate || b.checkInDate > todayYmd) {
          return false;
        }
      } else if (statusFilter === "TODAY_DEPARTURES") {
        if (
          (normStatus !== "CHECKED_IN" && b.stayStatus !== "ACTIVE") ||
          !b.checkOutDate ||
          b.checkOutDate > todayYmd
        ) {
          return false;
        }
      } else if (statusFilter === "UNASSIGNED") {
        if (normStatus !== "CONFIRMED" || Boolean(b.roomNumber)) return false;
      } else if (statusFilter === "CONFIRMED") {
        if (normStatus !== "CONFIRMED") return false;
      } else if (statusFilter === "CHECKED_IN") {
        if (normStatus !== "CHECKED_IN" && b.stayStatus !== "ACTIVE") return false;
      } else if (statusFilter === "CANCELLED") {
        if (normStatus !== "CANCELLED") return false;
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
  }, [simulatedBookings, statusFilter, channelFilter, searchQuery, todayYmd]);

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
    <div className="space-y-5">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!baseRoutePrefix.startsWith("/hotels") && (
          <h2 className="text-xl font-bold tracking-tight text-[#17201b]">
            Đơn đặt phòng OTA
          </h2>
        )}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => void refreshSimulatedBookings()}
            disabled={isLoadingSimulatedBookings}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <VsIcon
              name="refresh"
              className={`text-base ${isLoadingSimulatedBookings ? "animate-spin" : ""}`}
            />
            <span>Làm mới</span>
          </button>

          {showTechnicalTools && (
            <button
              type="button"
              onClick={handleManualDrain}
              disabled={pollFeed.isPending}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#003580] px-4 text-sm font-bold text-white shadow-xs hover:bg-[#002860] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <VsIcon
                name="cloud_download"
                className={`text-base ${pollFeed.isPending ? "animate-bounce" : ""}`}
              />
              <span>{pollFeed.isPending ? "Đang đồng bộ..." : "Đồng bộ Channex"}</span>
            </button>
          )}
        </div>
      </div>

      {showTechnicalTools &&
        (isLoadingPendingModifications ||
          pendingModificationsError ||
          pendingModifications.length > 0) && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-amber-950">Booking sửa đổi chờ đối soát</h3>
              <p className="text-sm text-amber-800">
                Channex chưa được ACK cho đến khi nhân viên xác nhận đã cập nhật PMS.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshPendingModifications()}
              disabled={isLoadingPendingModifications}
              className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 disabled:opacity-50"
            >
              Làm mới
            </button>
          </div>
          {pendingModificationsError && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
              Không thể tải hàng đợi đối soát. Không xác nhận booking cho đến khi lỗi được xử lý.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {pendingModifications.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3"
              >
                <div className="text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">Booking {item.bookingId}</p>
                  <p>
                    Ngày đề xuất: {formatDate(item.proposedArrival)} –{" "}
                    {formatDate(item.proposedDeparture)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleResolveModification(item.id)}
                  disabled={resolveModification.isPending}
                  className="min-h-10 rounded-xl bg-amber-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  Đã đối soát
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tổng đơn</span>
            <span className="text-base">📦</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {stats.total}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Đang giữ phòng</span>
            <span className="text-base">🟢</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-950">
            {stats.confirmed}
          </p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Đã hủy</span>
            <span className="text-base">⚪</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-rose-950">
            {stats.cancelled}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Doanh thu dự kiến</span>
            <span className="text-base">💰</span>
          </div>
          <div className="mt-2">
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
                aria-label="Xóa tìm kiếm"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status & Operational Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Segmented Tabs */}
            <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`min-h-11 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tất cả ({simulatedBookings.length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("TODAY_ARRIVALS")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                  statusFilter === "TODAY_ARRIVALS"
                    ? "bg-emerald-700 text-white shadow-2xs font-bold"
                    : "text-emerald-800 hover:bg-emerald-50 font-bold"
                }`}
              >
                <span>🛎️ Đến hôm nay</span>
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${statusFilter === "TODAY_ARRIVALS" ? "bg-white text-emerald-800 font-black" : "bg-emerald-100 text-emerald-800 font-bold"}`}>
                  {todayArrivalsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("TODAY_DEPARTURES")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                  statusFilter === "TODAY_DEPARTURES"
                    ? "bg-blue-700 text-white shadow-2xs font-bold"
                    : "text-blue-800 hover:bg-blue-50 font-bold"
                }`}
              >
                <span>🚪 Trả hôm nay</span>
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${statusFilter === "TODAY_DEPARTURES" ? "bg-white text-blue-800 font-black" : "bg-blue-100 text-blue-800 font-bold"}`}>
                  {todayDeparturesCount}
                </span>
              </button>

              {unassignedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("UNASSIGNED")}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                    statusFilter === "UNASSIGNED"
                      ? "bg-amber-600 text-white shadow-2xs font-bold"
                      : "text-amber-800 hover:bg-amber-50 font-bold"
                  }`}
                >
                  <span>⏳ Cần xếp phòng</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-xs ${statusFilter === "UNASSIGNED" ? "bg-white text-amber-800 font-black" : "bg-amber-100 text-amber-800 font-bold"}`}>
                    {unassignedCount}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setStatusFilter("CONFIRMED")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
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
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                  statusFilter === "CANCELLED"
                    ? "bg-white text-rose-800 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span>Đã hủy ({stats.cancelled})</span>
              </button>

              {stats.checkedIn > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("CHECKED_IN")}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                    statusFilter === "CHECKED_IN"
                      ? "bg-white text-blue-800 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>Đã nhận phòng ({stats.checkedIn})</span>
                </button>
              )}
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
                  <th className="py-4 px-4 text-right">Tác vụ nhanh</th>
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
                                aria-label={`Sao chép mã PMS ${b.reservationCode}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(b.reservationCode, b.bookingId);
                                }}
                                className="min-h-11 min-w-11 rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition cursor-pointer"
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

                      {/* Column 7: Fast Action Buttons */}
                      <td className="py-4 px-4 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {!isCancelled && !isCheckedIn && b.roomNumber && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={(e) => void handleFastCheckIn(b, e)}
                              className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 active:scale-95 transition cursor-pointer"
                            >
                              Nhận phòng
                            </button>
                          )}
                          {!isCancelled && !isCheckedIn && !b.roomNumber && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssigningBooking(b);
                                setSelectedRoomIdToAssign("");
                                void refetchAvailableRooms();
                              }}
                              className="inline-flex min-h-11 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 active:scale-95 transition cursor-pointer"
                            >
                              Xếp phòng
                            </button>
                          )}
                          {isCheckedIn && (
                            <button
                              type="button"
                              onClick={(e) => handleCheckOut(b, e)}
                              className="inline-flex min-h-11 items-center rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-rose-800 active:scale-95 transition cursor-pointer"
                            >
                              Trả phòng
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Xem chi tiết đơn ${b.reservationCode}`}
                            onClick={() => setSelectedBooking(b)}
                            className="min-h-11 min-w-11 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                          >
                            <VsIcon name="chevron_right" className="text-lg inline-block" />
                          </button>
                        </div>
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
                aria-label="Đóng chi tiết đơn"
                onClick={() => setSelectedBooking(null)}
                className="min-h-11 min-w-11 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
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
                    ) : (selectedBooking.status || "").toUpperCase() === "CHECKED_IN" ? (
                      <span className="text-blue-600">Đã nhận phòng (đang lưu trú)</span>
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

            </div>

            {/* Modal Actions */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {(selectedBooking.status || "").toUpperCase() === "CONFIRMED" && selectedBooking.roomNumber && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleFastCheckIn(selectedBooking)}
                    className="inline-flex items-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-emerald-800 active:scale-95 transition cursor-pointer"
                  >
                    Nhận phòng
                  </button>
                )}

                {(selectedBooking.status || "").toUpperCase() === "CONFIRMED" && !selectedBooking.roomNumber && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setAssigningBooking(selectedBooking);
                      setSelectedRoomIdToAssign("");
                      void refetchAvailableRooms();
                    }}
                    className="inline-flex items-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition cursor-pointer"
                  >
                    Xếp phòng
                  </button>
                )}

                {(selectedBooking.status || "").toUpperCase() === "CONFIRMED" && (
                  <button
                    type="button"
                    onClick={() => handleOpenRegistration(selectedBooking)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Đăng ký CCCD
                  </button>
                )}

                {(selectedBooking.status || "").toUpperCase() === "CHECKED_IN" && (
                  <button
                    type="button"
                    onClick={() => handleCheckOut(selectedBooking)}
                    className="inline-flex items-center rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-rose-800 active:scale-95 transition cursor-pointer"
                  >
                    Trả phòng
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Assignment Modal */}
      {assigningBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setAssigningBooking(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-xl font-bold">
                  🔑
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Xếp phòng cho khách
                  </h3>
                  <p className="text-xs text-slate-500">
                    {assigningBooking.otaName} • {assigningBooking.guestName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại xếp phòng"
                onClick={() => setAssigningBooking(null)}
                className="min-h-11 min-w-11 rounded-xl text-slate-400 hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Hạng phòng khách đặt:</span>
                  <span className="font-bold text-slate-900">{assigningBooking.roomType || "Tiêu chuẩn"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lưu trú:</span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(assigningBooking.checkInDate)} → {formatDate(assigningBooking.checkOutDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Chọn phòng trống:
                </label>
                {availableRooms.length === 0 ? (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-center text-sm text-rose-700">
                    Không có phòng trống khả dụng.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {availableRooms.map((r) => {
                      const isMatchingType =
                        r.type &&
                        assigningBooking.roomType &&
                        r.type.toLowerCase().trim() === assigningBooking.roomType.toLowerCase().trim();
                      const isSelected = selectedRoomIdToAssign === r.id;
                      return (
                        <div
                          key={r.id}
                          onClick={() => setSelectedRoomIdToAssign(r.id)}
                          className={`flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-base font-extrabold text-slate-900">
                              Phòng {r.roomNumber || r.id}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
                              {r.type ?? "Tiêu chuẩn"}
                            </span>
                            {r.floor && (
                              <span className="text-xs text-slate-400">Tầng {r.floor}</span>
                            )}
                          </div>
                          {isMatchingType && (
                            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
                              Đúng hạng đặt
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setAssigningBooking(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!selectedRoomIdToAssign || isProcessing}
                onClick={() => void handleAssignAndCheckIn()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-emerald-800 active:scale-95 disabled:opacity-50 transition cursor-pointer"
              >
                {isProcessing ? (
                  <span>Đang xử lý...</span>
                ) : (
                  <span>Xếp phòng & Nhận phòng</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
