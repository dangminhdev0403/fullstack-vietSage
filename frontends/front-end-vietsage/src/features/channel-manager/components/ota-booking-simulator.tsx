"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex, useInventoryGrid } from "../hooks/use-channel-manager";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import type { SimulateBookingResult } from "../types/channel-manager.types";

interface OtaBookingSimulatorProps {
  hotelId: string;
  hotelName?: string;
  roleScope?: "owner" | "admin";
  onSwitchTab?: (tab: "SETUP" | "ARI" | "SIMULATOR" | "CHANNELS" | "ICAL") => void;
}

const POPULAR_CHANNELS = [
  { code: "Booking.com", name: "Booking.com B.V.", icon: "🅱️", color: "border-blue-300 text-blue-800 bg-blue-50" },
  { code: "Agoda", name: "Agoda Travel Operations", icon: "🔷", color: "border-cyan-300 text-cyan-800 bg-cyan-50" },
  { code: "Airbnb", name: "Airbnb Platform Inc.", icon: "🏠", color: "border-rose-300 text-rose-800 bg-rose-50" },
  { code: "Expedia", name: "Expedia Group Partner Solutions", icon: "✈️", color: "border-amber-300 text-amber-800 bg-amber-50" },
  { code: "Trip.com", name: "Trip.com Group (Ctrip)", icon: "🌏", color: "border-indigo-300 text-indigo-800 bg-indigo-50" },
  { code: "Traveloka", name: "Traveloka Indonesia / SEA", icon: "🐦", color: "border-sky-300 text-sky-800 bg-sky-50" },
];

export function OtaBookingSimulator({
  hotelId,
  hotelName: _hotelName,
  roleScope = "admin",
  onSwitchTab,
}: OtaBookingSimulatorProps) {
  const queryClient = useQueryClient();
  const {
    mappings,
    isLoadingMappings,
    simulateBooking,
    cancelBooking,
    simulatedBookings,
    isLoadingSimulatedBookings,
    refreshSimulatedBookings,
    pollFeed,
  } = useChannex(hotelId, roleScope);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleManualDrain = async () => {
    try {
      const res = await pollFeed.mutateAsync({ limit: 10 });
      await showSuccessAlert(
        "Kéo Feed Thành Công!",
        `Đã tiếp nhận ${res.totalProcessed} bản tin (${res.newBookingsCount} đơn mới) từ Channex feed.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể kéo feed từ Channex.";
      await showErrorAlert("Lỗi kéo feed", msg);
    }
  };

  // Mapped room types from Channex
  const mappedRoomTypes = useMemo(() => {
    return mappings
      .filter((m) => m.kind.toLowerCase() === "room_type")
      .map((m) => {
        const meta = m.metadata as { roomTypeName?: string } | undefined;
        return {
          id: m.localId,
          channexId: m.channexId,
          name: meta?.roomTypeName || m.localId,
        };
      });
  }, [mappings]);

  // Simulation mode: NEW booking vs CANCEL simulation
  const [simulationMode, setSimulationMode] = useState<"NEW" | "CANCEL">("NEW");

  // Form states for NEW booking
  const [selectedChannel, setSelectedChannel] = useState<string>("Booking.com");
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");

  // Default dates: tomorrow to day after tomorrow
  const getDefaultDates = () => {
    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 1);
    const checkOut = new Date(today);
    checkOut.setDate(today.getDate() + 3);

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

    return { in: fmt(checkIn), out: fmt(checkOut) };
  };

  const defaults = useMemo(() => getDefaultDates(), []);
  const [checkInDate, setCheckInDate] = useState<string>(defaults.in);
  const [checkOutDate, setCheckOutDate] = useState<string>(defaults.out);
  const [totalAmount, setTotalAmount] = useState<number>(1_500_000);
  const [guestName, setGuestName] = useState<string>("Nguyễn Văn Test OTA");
  const [guestEmail, setGuestEmail] = useState<string>("test.booking@vietsage.dev");
  const [guestPhone, setGuestPhone] = useState<string>("+84912345678");
  const [occupancy, setOccupancy] = useState<number>(2);

  // Result state
  const [lastResult, setLastResult] = useState<SimulateBookingResult | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Selected booking for cancellation mode
  const [cancelTargetBookingId, setCancelTargetBookingId] = useState<string>("");

  // Filter & search states for recent bookings table
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "CANCELLED">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Active (occupying) bookings
  const activeBookings = useMemo(() => {
    return simulatedBookings.filter((b) => b.status === "CONFIRMED" || b.status === "confirmed");
  }, [simulatedBookings]);

  const cancelledBookings = useMemo(() => {
    return simulatedBookings.filter((b) => b.status === "CANCELLED" || b.status === "cancelled");
  }, [simulatedBookings]);

  // Selected booking object for cancellation mode (defaults to first active booking if not explicitly chosen)
  const selectedBookingToCancel = useMemo(() => {
    return activeBookings.find((b) => b.bookingId === cancelTargetBookingId) || activeBookings[0] || null;
  }, [activeBookings, cancelTargetBookingId]);

  // Auto-select first room type when loaded
  const effectiveRoomType = selectedRoomType || mappedRoomTypes[0]?.id || "Standard";

  // Target parameters for Live Realtime ARI status
  const liveDateFrom =
    simulationMode === "CANCEL" && selectedBookingToCancel?.checkInDate
      ? selectedBookingToCancel.checkInDate
      : checkInDate;

  const liveDateTo =
    simulationMode === "CANCEL" && selectedBookingToCancel?.checkOutDate
      ? selectedBookingToCancel.checkOutDate
      : checkOutDate;

  const targetRoomTypeForAri =
    simulationMode === "CANCEL" && selectedBookingToCancel?.roomType
      ? selectedBookingToCancel.roomType
      : effectiveRoomType;

  // Live ARI Grid Query for immediate occupancy feedback
  const {
    gridData: liveAriData,
    isLoading: isLoadingLiveAri,
    isFetching: isFetchingLiveAri,
    refetch: refetchLiveAri,
  } = useInventoryGrid({
    hotelId,
    dateFrom: liveDateFrom,
    dateTo: liveDateTo,
    roleScope,
  });

  const currentRoomTypeAri = useMemo(() => {
    if (!liveAriData?.roomTypes || !liveAriData.roomTypes.length) return null;
    const q = targetRoomTypeForAri.trim().toLowerCase();
    return (
      liveAriData.roomTypes.find(
        (rt) =>
          rt.roomTypeId.trim().toLowerCase() === q ||
          rt.roomTypeName.trim().toLowerCase() === q ||
          rt.roomTypeCode.trim().toLowerCase() === q,
      ) || liveAriData.roomTypes[0] || null
    );
  }, [liveAriData, targetRoomTypeForAri]);

  const liveStats = useMemo(() => {
    if (!currentRoomTypeAri || !currentRoomTypeAri.days.length) {
      return { totalRooms: 0, bookedRooms: 0, availableRooms: 0 };
    }
    const firstDay = currentRoomTypeAri.days[0];
    const totalRooms = currentRoomTypeAri.totalRooms || firstDay.total || 0;
    const availableRooms = firstDay.available ?? 0;
    const bookedRooms = Math.max(0, totalRooms - availableRooms);
    return { totalRooms, bookedRooms, availableRooms };
  }, [currentRoomTypeAri]);

  // Realtime synchronization for simulator
  const realtimeHandlers = useMemo(
    () => ({
      onChannelBookingCreated: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          otaName?: string;
          roomNumber?: string | null;
          reservationCode?: string;
        } | null;
        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        void invalidateHotelRealtimeQueries(queryClient, hotelId);
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "hotel", hotelId],
          refetchType: "all",
        });
        void queryClient.refetchQueries({
          queryKey: ["vietsage", "hotel", hotelId],
        });
        void refreshSimulatedBookings();
        void refetchLiveAri();
      },
      onChannelBookingCancelled: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          otaName?: string;
          reservationCode?: string;
        } | null;
        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        void invalidateHotelRealtimeQueries(queryClient, hotelId);
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "hotel", hotelId],
          refetchType: "all",
        });
        void queryClient.refetchQueries({
          queryKey: ["vietsage", "hotel", hotelId],
        });
        void refreshSimulatedBookings();
        void refetchLiveAri();
      },
    }),
    [hotelId, queryClient, refreshSimulatedBookings, refetchLiveAri],
  );

  useOwnerRequestRealtime(hotelId, realtimeHandlers, {
    enabled: Boolean(hotelId),
    showConnectionToasts: false,
  });

  const handleSimulate = async () => {
    if (!hotelId) {
      await showErrorAlert("Lỗi", "Vui lòng chọn khách sạn trước khi bắn test đơn!");
      return;
    }

    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      await showErrorAlert("Lỗi ngày lưu trú", "Ngày check-out phải sau ngày check-in ít nhất 1 đêm.");
      return;
    }

    const channelObj = POPULAR_CHANNELS.find((c) => c.code === selectedChannel) ?? {
      name: selectedChannel,
    };

    const confirmed = await showConfirmDialog({
      title: "Xác nhận bắn đơn đặt phòng OTA test?",
      text: `Hệ thống sẽ mô phỏng tạo đơn đặt phòng mới từ sàn ${channelObj.name} (via Channex Staging API) cho hạng phòng "${effectiveRoomType}", tự động xếp phòng và chiếm ô phòng trong PMS & bảng ARI.`,
      confirmText: "Bắn đơn & Chiếm phòng ngay",
      cancelText: "Hủy",
    });

    if (!confirmed.isConfirmed) return;

    try {
      const result = await simulateBooking.mutateAsync({
        otaName: selectedChannel,
        roomType: effectiveRoomType,
        checkinDate: checkInDate,
        checkoutDate: checkOutDate,
        amount: totalAmount,
        customerName: guestName.trim() || undefined,
        customerEmail: guestEmail.trim() || undefined,
        customerPhone: guestPhone.trim() || undefined,
      });

      setLastResult(result);

      // Invalidate queries ngay lập tức mà không cần F5
      void invalidateHotelRealtimeQueries(queryClient, hotelId);
      void queryClient.invalidateQueries({
        queryKey: ["vietsage", "hotel", hotelId],
        refetchType: "all",
      });
      void queryClient.refetchQueries({
        queryKey: ["vietsage", "hotel", hotelId],
      });
      void refreshSimulatedBookings();
      void refetchLiveAri();

      await showSuccessAlert(
        "Bắn đơn & Chiếm phòng thành công!",
        `Đơn đặt phòng từ ${selectedChannel} (Mã: ${result.otaReservationCode}) đã được ghi nhận vào PMS. Phòng được tự động xếp: ${
          result.reservation?.roomNumber ? `Phòng ${result.reservation.roomNumber}` : "Đã xếp phòng"
        }. Số phòng trống trên bảng ARI đã giảm theo thời gian thực!`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bắn đơn test thất bại.";
      await showErrorAlert("Thao tác thất bại", msg);
    }
  };

  const handleCancelBooking = async (
    bookingId: string,
    reservationCode?: string | null,
    otaName?: string | null,
    roomNumber?: string | null,
  ) => {
    if (!hotelId || !bookingId) return;

    const confirmed = await showConfirmDialog({
      title: "Xác nhận mô phỏng hủy đơn từ sàn OTA?",
      text: `Hệ thống sẽ mô phỏng sự kiện sàn ${otaName || "OTA"} gửi thông báo hủy đơn cho mã đặt phòng ${
        reservationCode || bookingId.slice(0, 8)
      }. Đơn sẽ chuyển thành CANCELLED và ngay lập tức trả ${
        roomNumber ? `Phòng ${roomNumber}` : "ô phòng"
      } về trạng thái trống trên bảng ARI & PMS mà không cần F5.`,
      confirmText: "Hủy đơn & Trả phòng ngay",
      cancelText: "Giữ lại",
    });

    if (!confirmed.isConfirmed) return;

    try {
      setCancellingId(bookingId);
      const res = await cancelBooking.mutateAsync({ bookingId });

      // Update local lastResult if it matches
      setLastResult((prev) => {
        if (!prev) return null;
        if (prev.channexBookingId === bookingId) {
          return {
            ...prev,
            reservation: prev.reservation
              ? { ...prev.reservation, status: "CANCELLED" }
              : undefined,
          };
        }
        return prev;
      });

      // Tức thì invalidate toàn bộ queries
      void invalidateHotelRealtimeQueries(queryClient, hotelId);
      void queryClient.invalidateQueries({
        queryKey: ["vietsage", "hotel", hotelId],
        refetchType: "all",
      });
      void queryClient.refetchQueries({
        queryKey: ["vietsage", "hotel", hotelId],
      });
      void refreshSimulatedBookings();
      void refetchLiveAri();

      await showSuccessAlert(
        "Mô phỏng hủy đơn thành công!",
        res.message ||
          `Đơn đặt phòng đã được hủy từ sàn OTA. Phòng ${roomNumber || ""} đã được trả về kho phòng trống thành công!`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hủy đơn đặt phòng thất bại.";
      await showErrorAlert("Hủy đơn thất bại", msg);
    } finally {
      setCancellingId(null);
    }
  };

  // Filtered list of simulated bookings
  const filteredBookings = useMemo(() => {
    return simulatedBookings.filter((bk) => {
      // Filter by status
      if (statusFilter === "CONFIRMED" && bk.status !== "CONFIRMED" && bk.status !== "confirmed") {
        return false;
      }
      if (statusFilter === "CANCELLED" && bk.status !== "CANCELLED" && bk.status !== "cancelled") {
        return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOta = bk.otaName.toLowerCase().includes(q);
        const matchCode = (bk.otaReservationCode || bk.reservationCode || "").toLowerCase().includes(q);
        const matchGuest = bk.guestName.toLowerCase().includes(q);
        const matchRoom = (bk.roomNumber || "").toLowerCase().includes(q);
        if (!matchOta && !matchCode && !matchGuest && !matchRoom) {
          return false;
        }
      }

      return true;
    });
  }, [simulatedBookings, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Intro banner */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl text-white shadow-md">
              🧪
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
                  Super Admin Sandbox
                </span>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                  Channex Ingestion Pipeline
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Realtime Auto-Sync Active
                </span>
              </div>
              <h2 className="mt-1.5 text-xl font-extrabold text-gray-900">
                Sandbox Giả Lập Đặt & Hủy Phòng OTA (Realtime Sync)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-600 max-w-3xl">
                Mô phỏng toàn bộ chu trình 2 chiều từ các kênh OTA lớn (Booking.com, Agoda, Airbnb, Expedia) vào PMS:{" "}
                <strong className="text-blue-700">1. Bắn đơn mới</strong> để tự động xếp phòng và chiếm ô trên bảng ARI, sau đó thử nghiệm{" "}
                <strong className="text-rose-700">2. Mô phỏng hủy đơn</strong> để quan sát PMS lập tức trả phòng về trạng thái trống mà không cần tải lại trang!
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleManualDrain}
              disabled={pollFeed.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-50 transition disabled:opacity-50"
            >
              <span>{pollFeed.isPending ? "⏳ Đang kéo..." : "📥 Kéo Feed Channex"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real Inbound Webhook vs Local Simulator Architecture Banner */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-blue-50/70 p-5 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-emerald-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white text-base shadow-xs">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-emerald-950">
                  Kênh Tiếp Nhận Webhook Thực Tế từ Channex (Production Webhook Inbound)
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Xác Thực Secret SHA-256 Active
                </span>
              </div>
              <p className="text-xs text-emerald-800">
                Toàn bộ hạ tầng tiếp nhận đặt phòng thật từ các sàn OTA thông qua Channex Cloud đã sẵn sàng 100%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualDrain}
              disabled={pollFeed.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-50 transition disabled:opacity-50"
            >
              <span>{pollFeed.isPending ? "⏳ Đang kết nối Channex..." : "📥 Kéo Feed Đặt Phòng Thực tế (Channex Cloud)"}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-emerald-200/80 bg-white/90 p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-gray-900">
              <span className="text-emerald-600">①</span>
              <span>Webhook Endpoint Công Khai</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Route: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-emerald-900 font-bold">POST /api/v1/channel-manager/channex/webhook</code>.
              Channex bắn thông báo kèm header bảo mật <code className="rounded bg-gray-100 px-1 font-mono text-[10px] text-gray-700">X-Channex-Webhook-Secret</code>.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-white/90 p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-gray-900">
              <span className="text-emerald-600">②</span>
              <span>Cơ Chế Zero-Trust Revision Pull</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Server không phụ thuộc payload webhook mà tự động gọi ngược lại <code className="rounded bg-gray-100 px-1 font-mono text-[10px] text-blue-800">GET /booking_revisions/:id</code> trên máy chủ Channex để lấy dữ liệu gốc chuẩn xác, loại trừ rủi ro giả mạo.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-white/90 p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-gray-900">
              <span className="text-emerald-600">③</span>
              <span>2 Chiều Ack & Realtime WebSocket</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Sau khi xếp phòng và lưu CSDL, hệ thống bắn xác nhận <code className="rounded bg-gray-100 px-1 font-mono text-[10px] text-indigo-800">POST /ack</code> để Channex dọn sạch hàng đợi, đồng thời phát WebSocket cập nhật giao diện lễ tân tức thì.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200/60 bg-white/70 px-3.5 py-2 text-[11px] text-emerald-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold">💡 Lưu ý môi trường:</span>
            <span>
              Trên máy Local Dev (<code className="font-mono text-[11px]">localhost:4000</code>), Channex Cloud không thể truy cập trực tiếp IP nội bộ nên hệ thống dùng song song <strong>Sandbox Simulator</strong> và <strong>Feed Polling</strong>. Khi chạy Production có domain HTTPS hoặc dùng Ngrok tunnel, Webhook thật từ Channex sẽ trực tiếp đổ về hệ thống.
            </span>
          </div>
        </div>
      </div>

      {/* Booking.com Live Sandbox & Agoda Certification Hub */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-cyan-50/70 p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm shadow-xs">
              🏨
            </span>
            <div>
              <h3 className="text-sm font-bold text-indigo-950">
                Tài Khoản Test Thực Tế Booking.com (Hotel ID 5868189) & Agoda Certification Hub
              </h3>
              <p className="text-xs text-indigo-700">
                Khai thác tài khoản kiểm thử chính thức của Channex & Agoda để thực hiện đặt phòng mẫu end-to-end
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://docs.channex.io/guides/test-account-for-booking.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-2xs ring-1 ring-indigo-200 hover:bg-indigo-50"
            >
              <span>📖 Docs Booking Test</span>
              <span>↗</span>
            </a>
            <a
              href="https://developer.agoda.com/demand/docs/best-practices-certification-process"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-cyan-700 shadow-2xs ring-1 ring-cyan-200 hover:bg-cyan-50"
            >
              <span>📖 Docs Agoda Cert</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Booking.com Live Test Card */}
          <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-900">
                <span>🅱️</span> Booking.com Live Sandbox
              </span>
              <span className="text-xs font-semibold text-blue-700">Tiền tệ: GBP (£)</span>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Channex Staging kết nối sẵn với khách sạn test Booking.com qua mã <code className="bg-blue-50 px-1.5 py-0.5 font-mono font-bold text-blue-800 rounded">hotel_id: 5868189</code>.
            </p>

            {/* Test Card & Quick Actions */}
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Thẻ Visa Test:</span>
                <button
                  type="button"
                  onClick={() => handleCopy("4111-1111-1111-1111", "cc-number")}
                  className="font-mono font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  <span>4111-1111-1111-1111</span>
                  <span className="text-[10px] text-gray-400">
                    {copiedKey === "cc-number" ? "✓ Đã chép" : "📋"}
                  </span>
                </button>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>CVC: <strong>123</strong></span>
                <span>Hạn dùng: <strong>Tương lai (12/28)</strong></span>
                <span>Tên: <strong>Bất kỳ</strong></span>
              </div>
            </div>

            <div className="text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700">Các Hotel ID khác: </span>
              <span className="font-mono">6519420 (GBP)</span> • <span className="font-mono">4372137 (EUR)</span> • <span className="font-mono">10485037 (USD)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="https://secure.booking.com/book.html?hotel_id=5868189&test=1"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition"
              >
                <span>Mở Form Đặt Phòng Booking.com (Live Test)</span>
                <span>↗</span>
              </a>
            </div>
          </div>

          {/* Agoda Demand / Certification Hub */}
          <div className="rounded-xl border border-cyan-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-bold text-cyan-900">
                <span>🔷</span> Agoda Certification Hub
              </span>
              <span className="text-xs font-semibold text-cyan-700">Supply / YCS Partner</span>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              VietSage vận hành ở vai trò <strong>Khách sạn / PMS (Supply Side)</strong> kết nối tới <strong>Agoda YCS</strong> thông qua Channex Hub.
            </p>

            {/* Agoda Test Cases Table */}
            <div className="overflow-x-auto rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-xs">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="pb-1">Tình huống kiểm thử</th>
                    <th className="pb-1">Hotel ID</th>
                    <th className="pb-1">Quốc gia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  <tr>
                    <td className="py-1">Phòng chung (Allotment)</td>
                    <td className="font-mono font-bold text-cyan-800">43775</td>
                    <td>Ấn Độ</td>
                  </tr>
                  <tr>
                    <td className="py-1">Trả tại KS (Pay at Hotel)</td>
                    <td className="font-mono font-bold text-cyan-800">1144275</td>
                    <td>Hoa Kỳ</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedChannel("Agoda");
                  setGuestName("Agoda Test Guest");
                  setTotalAmount(1_250_000);
                  setSimulationMode("NEW");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-cyan-800 transition"
              >
                <span>Điền Thông Số Agoda vào Form Giả Lập</span>
                <span>👇</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Simulation Panel (Grid 12 cols: 7 cols form + 5 cols live result) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form controls (7 cols) */}
        <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-sm lg:col-span-7 flex flex-col justify-between">
          <div>
            {/* Mode Switcher: status: new vs status: cancelled */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-700 font-extrabold">
                  1
                </span>
                Chọn Thao Tác Mô Phỏng OTA
              </h3>
            </div>

            {/* Mode tabs */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-100/90 p-1.5">
              <button
                type="button"
                onClick={() => setSimulationMode("NEW")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  simulationMode === "NEW"
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="text-base">🚀</span>
                <div className="text-left">
                  <div className="leading-tight">Bắn Đơn Mới</div>
                  <div className="text-[10px] font-normal text-blue-600">Chiếm phòng PMS & giảm ARI</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSimulationMode("CANCEL")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  simulationMode === "CANCEL"
                    ? "bg-white text-rose-700 shadow-sm ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="text-base">❌</span>
                <div className="text-left">
                  <div className="leading-tight">Mô Phỏng Hủy Đơn</div>
                  <div className="text-[10px] font-normal text-rose-600">
                    Trả phòng trống ({activeBookings.length} đơn có thể hủy)
                  </div>
                </div>
              </button>
            </div>

            {/* Mode A: NEW BOOKING */}
            {simulationMode === "NEW" && (
              <div className="mt-5 space-y-4">
                {/* Channel Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Kênh OTA Phát Sinh Đơn Đặt Phòng
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {POPULAR_CHANNELS.map((ch) => {
                      const isSelected = selectedChannel === ch.code;
                      return (
                        <button
                          key={ch.code}
                          type="button"
                          onClick={() => setSelectedChannel(ch.code)}
                          className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/90 text-blue-900 shadow-sm ring-1 ring-blue-600"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <span className="text-base">{ch.icon}</span>
                          <span className="truncate">{ch.code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Room Type Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Hạng Phòng Mapped (Đã Đồng Bộ Sang Channex)
                  </label>
                  <select
                    value={effectiveRoomType}
                    onChange={(e) => setSelectedRoomType(e.target.value)}
                    disabled={isLoadingMappings}
                    className="mt-1.5 block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {mappedRoomTypes.length > 0 ? (
                      mappedRoomTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Standard">Standard (Mặc định)</option>
                        <option value="Deluxe">Deluxe</option>
                        <option value="Suite">Suite</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Ngày Check-in
                    </label>
                    <input
                      type="date"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Ngày Check-out
                    </label>
                    <input
                      type="date"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Total Amount & Occupancy */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Tổng Tiền Thanh Toán (VND)
                    </label>
                    <input
                      type="number"
                      step="50000"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(Number(e.target.value))}
                      className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <span className="mt-1 block text-xs font-semibold text-blue-700">
                      {new Intl.NumberFormat("vi-VN", {
                        style: "currency",
                        currency: "VND",
                      }).format(totalAmount)}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Số Lượng Khách Lưu Trú
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={occupancy}
                      onChange={(e) => setOccupancy(Number(e.target.value))}
                      className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Guest Info */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3">
                  <span className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
                    👤 Thông tin khách đặt phòng giả lập
                  </span>
                  <div>
                    <label className="block text-xs text-gray-600">Họ và tên khách</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-gray-600">Email nhận xác nhận</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Số điện thoại liên hệ</label>
                      <input
                        type="text"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit button for NEW */}
                <button
                  type="button"
                  onClick={handleSimulate}
                  disabled={simulateBooking.isPending}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-5 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {simulateBooking.isPending ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Đang bắn đơn lên Channex & Ingest vào PMS...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">🚀</span>
                      <span>Bắn Đơn Đặt Phòng Mới ➔ Chiếm Phòng PMS</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mode B: CANCEL SIMULATION */}
            {simulationMode === "CANCEL" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-sm text-rose-950">
                    <span>❌</span>
                    <span>Mô Phỏng Sự Kiện Hủy Đơn Từ Sàn OTA</span>
                  </div>
                  <p className="leading-relaxed text-rose-800">
                    Khi khách hủy phòng trên sàn OTA (Booking.com, Agoda...), sàn sẽ gửi thông báo hủy đơn.
                    PMS sẽ tự động cập nhật đơn thành <strong>CANCELLED</strong> và lập tức trả phòng về trạng thái trống (0 booked) trên bảng ARI.
                  </p>
                </div>

                {activeBookings.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                        Chọn Đơn Đang Chiếm Phòng Để Mô Phỏng Hủy ({activeBookings.length} đơn active)
                      </label>
                      <select
                        value={selectedBookingToCancel?.bookingId ?? ""}
                        onChange={(e) => setCancelTargetBookingId(e.target.value)}
                        className="mt-1.5 block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-900 shadow-xs focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      >
                        {activeBookings.map((b) => (
                          <option key={b.bookingId} value={b.bookingId}>
                            [{b.otaName}] {b.otaReservationCode || b.reservationCode} • Phòng {b.roomNumber || "?"} • {b.guestName} • {new Intl.NumberFormat("vi-VN").format(b.amount || 0)}₫
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedBookingToCancel && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs space-y-3 shadow-xs">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="font-bold text-gray-800 flex items-center gap-1.5">
                            <span>📋</span>
                            <span>Chi tiết đơn sẽ gửi sự kiện hủy:</span>
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-[11px] text-emerald-800">
                            CONFIRMED
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-gray-600">
                          <div>
                            Kênh OTA: <strong className="text-gray-900">{selectedBookingToCancel.otaName}</strong>
                          </div>
                          <div>
                            Mã đơn sàn: <code className="font-mono text-blue-700 font-bold">{selectedBookingToCancel.otaReservationCode || selectedBookingToCancel.reservationCode}</code>
                          </div>
                          <div>
                            Khách hàng: <strong className="text-gray-900">{selectedBookingToCancel.guestName}</strong>
                          </div>
                          <div>
                            Thời gian: <strong className="text-gray-900">{selectedBookingToCancel.checkInDate} ➔ {selectedBookingToCancel.checkOutDate}</strong>
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-emerald-950 font-medium">
                          🔒 Phòng đang bị chiếm: <strong className="font-bold text-emerald-900">Phòng {selectedBookingToCancel.roomNumber || "Chờ chỉ định"}</strong> ({selectedBookingToCancel.roomType || "Hạng phòng"})
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-950 text-[11px]">
                          💡 Sau khi bấm &quot;Hủy đơn&quot;, sự kiện Realtime sẽ phát tới toàn bộ giao diện: Phòng {selectedBookingToCancel.roomNumber || ""} sẽ được giải phóng ngay lập tức!
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleCancelBooking(
                              selectedBookingToCancel.bookingId,
                              selectedBookingToCancel.otaReservationCode,
                              selectedBookingToCancel.otaName,
                              selectedBookingToCancel.roomNumber,
                            )
                          }
                          disabled={cancellingId === selectedBookingToCancel.bookingId || cancelBooking.isPending}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-5 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:from-rose-700 hover:to-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {cancellingId === selectedBookingToCancel.bookingId ? (
                            <>
                              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              <span>Đang phát sự kiện hủy đơn & giải phóng phòng...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-base">❌</span>
                              <span>Kích Hoạt Hủy Đơn OTA ➔ Trả Phòng {selectedBookingToCancel.roomNumber ? `Phòng ${selectedBookingToCancel.roomNumber}` : ""} Về Kho Trống</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 p-8 text-center space-y-3">
                    <span className="text-4xl text-gray-400">📭</span>
                    <h4 className="text-sm font-bold text-gray-700">Chưa Có Đơn Đặt Phòng Nào Đang Chiếm Phòng</h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                      Hiện tại không có đơn nào ở trạng thái CONFIRMED để mô phỏng hủy. Hãy chuyển sang chế độ &quot;Bắn Đơn Mới&quot; để tạo một đơn test trước!
                    </p>
                    <button
                      type="button"
                      onClick={() => setSimulationMode("NEW")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                    >
                      <span>🚀</span>
                      <span>Chuyển Sang Bắn Đơn Mới</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Môi trường: <strong className="text-gray-700">Channex Staging API</strong></span>
            <span>Đồng bộ: <strong className="text-emerald-700">Tự động (Realtime)</strong></span>
          </div>
        </div>

        {/* Live Ingestion & ARI Occupancy Panel (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Live Realtime ARI Occupancy Status Card */}
          <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white text-base shadow-xs">
                  📊
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-extrabold text-emerald-950">
                      Quỹ Phòng & Ô Trống Realtime
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      Live ARI
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Hạng: <strong className="font-bold text-gray-900">{targetRoomTypeForAri}</strong> • {liveDateFrom} ➔ {liveDateTo}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refetchLiveAri()}
                disabled={isFetchingLiveAri}
                className="shrink-0 rounded-lg border border-emerald-200 bg-white p-1.5 text-xs text-emerald-700 hover:bg-emerald-50 shadow-2xs transition disabled:opacity-50"
                title="Làm mới tình trạng ô phòng"
              >
                <span className={isFetchingLiveAri ? "inline-block animate-spin" : ""}>🔄</span>
              </button>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Total Physical Rooms */}
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Tổng Kho
                </div>
                <div className="mt-1 text-2xl font-black text-gray-800">
                  {isLoadingLiveAri ? "..." : liveStats.totalRooms}
                </div>
                <div className="text-[10px] text-gray-400">phòng vật lý</div>
              </div>

              {/* Booked / Occupying */}
              <div
                className={`rounded-xl border p-3 shadow-2xs transition-colors ${
                  liveStats.bookedRooms > 0
                    ? "border-amber-300 bg-amber-50/90 text-amber-950"
                    : "border-gray-200 bg-white text-gray-800"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Đang Chiếm
                </div>
                <div className="mt-1 text-2xl font-black text-amber-700">
                  {isLoadingLiveAri ? "..." : liveStats.bookedRooms}
                </div>
                <div className="text-[10px] font-semibold text-amber-600">
                  {liveStats.bookedRooms > 0 ? "🔒 Đã xếp phòng" : "0 đơn"}
                </div>
              </div>

              {/* Available Rooms */}
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Còn Trống
                </div>
                <div className="mt-1 text-2xl font-black text-emerald-700">
                  {isLoadingLiveAri ? "..." : liveStats.availableRooms}
                </div>
                <div className="text-[10px] font-semibold text-emerald-600">
                  {liveStats.availableRooms > 0 ? "🟢 Sẵn sàng bán" : "🔴 Hết phòng"}
                </div>
              </div>
            </div>

            {/* Daily breakdown list */}
            {currentRoomTypeAri && currentRoomTypeAri.days.length > 0 && (
              <div className="rounded-xl border border-emerald-100 bg-white/90 p-2.5 text-xs space-y-1.5">
                <div className="font-bold text-gray-700 text-[11px] flex items-center justify-between">
                  <span>Chi tiết theo từng đêm lưu trú:</span>
                  <span className="text-[10px] text-gray-400">Tự động cập nhật không cần F5</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-28 overflow-y-auto pr-1">
                  {currentRoomTypeAri.days.map((d) => {
                    const booked = Math.max(0, d.total - d.available);
                    return (
                      <div key={d.date} className="flex items-center justify-between py-1 text-[11px]">
                        <span className="font-mono text-gray-600 font-medium">{d.date}:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            Chiếm:{" "}
                            <strong className={booked > 0 ? "text-amber-600 font-bold" : "text-gray-700"}>
                              {booked}
                            </strong>
                          </span>
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Trống: {d.available}/{d.total}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {onSwitchTab && (
              <button
                type="button"
                onClick={() => onSwitchTab("ARI")}
                className="w-full rounded-xl border border-emerald-300 bg-white py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 shadow-2xs transition flex items-center justify-center gap-1.5"
              >
                <span>📊 Mở Bảng ARI 14 Ngày Chi Tiết</span>
                <span>➔</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
            <h3 className="flex items-center justify-between text-base font-bold text-gray-900">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 font-extrabold">
                  2
                </span>
                Kết Quả Ingestion Thực Tế
              </span>
              {lastResult && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Mới nhất
                </span>
              )}
            </h3>

            {lastResult ? (
              <div className="mt-4 space-y-4">
                {/* Status banner */}
                {lastResult.reservation?.status === "CANCELLED" ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-4 text-rose-950 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
                      <span className="text-base">🚫</span>
                      <span>ĐÃ MÔ PHỎNG HỦY ĐƠN TỪ SÀN OTA</span>
                    </div>
                    <div className="rounded-lg bg-white/80 p-2 text-xs font-bold text-rose-800">
                      🔓 ĐÃ GIẢI PHÓNG: Phòng {lastResult.reservation?.roomNumber || ""} về trạng thái trống trên bảng ARI & PMS!
                    </div>
                    <p className="text-[11px] text-rose-700">
                      Sự kiện <code>channel_booking.cancelled</code> đã kích hoạt realtime và cập nhật số phòng trống tự động.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-950 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                      <span className="text-base">✅</span>
                      <span>ĐÃ TIẾP NHẬN ĐƠN MỚI • ĐANG CHIẾM PHÒNG</span>
                    </div>
                    <div className="rounded-lg bg-white/80 p-2 text-xs font-bold text-emerald-800">
                      🔒 ĐANG CHIẾM Ô: Phòng {lastResult.reservation?.roomNumber || "Đã phân bổ"}
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Đơn đã được ghi nhận vào PMS. Bảng ARI đã tự động giảm 1 phòng trống cho khoảng thời gian này.
                    </p>
                  </div>
                )}

                {/* Details list */}
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-xs">
                  <div className="flex justify-between p-2.5">
                    <span className="font-medium text-gray-500">Kênh OTA phát sinh:</span>
                    <span className="font-bold text-gray-900">{lastResult.channelName}</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="font-medium text-gray-500">Mã đơn OTA:</span>
                    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono font-bold text-blue-700">
                      {lastResult.otaReservationCode}
                    </code>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="font-medium text-gray-500">Channex Booking ID:</span>
                    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-700">
                      {lastResult.channexBookingId.slice(0, 16)}...
                    </code>
                  </div>
                  {lastResult.reservation && (
                    <>
                      <div className="flex justify-between p-2.5">
                        <span className="font-medium text-gray-500">Mã đặt phòng PMS:</span>
                        <span className="font-bold text-emerald-700">
                          {lastResult.reservation.bookingCode}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 bg-gray-50/50">
                        <span className="font-bold text-gray-700">Phòng xếp tự động:</span>
                        <span className={`rounded px-2 py-0.5 font-bold text-white ${lastResult.reservation.status === "CANCELLED" ? "bg-gray-400 line-through" : "bg-emerald-600"}`}>
                          Phòng {lastResult.reservation.roomNumber || "Chờ chỉ định"}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span className="font-medium text-gray-500">Trạng thái đặt phòng:</span>
                        <span className={`font-bold ${lastResult.reservation.status === "CANCELLED" ? "text-rose-700" : "text-emerald-700"}`}>
                          {lastResult.reservation.status}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span className="font-medium text-gray-500">Thời gian lưu trú:</span>
                        <span className="font-semibold text-gray-900">
                          {lastResult.reservation.checkInDate} ➔ {lastResult.reservation.checkOutDate}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span className="font-medium text-gray-500">Tổng doanh thu PMS:</span>
                        <span className="font-bold text-emerald-700">
                          {new Intl.NumberFormat("vi-VN", {
                            style: "currency",
                            currency: "VND",
                          }).format(lastResult.reservation.totalAmount)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Cancel action button / status */}
                {lastResult.reservation?.status === "CANCELLED" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSimulationMode("NEW");
                      setLastResult(null);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-100 transition"
                  >
                    <span>🚀 Bắn Thử Đơn Mới Khác</span>
                  </button>
                ) : (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCancelBooking(
                          lastResult.channexBookingId,
                          lastResult.otaReservationCode,
                          lastResult.channelName,
                          lastResult.reservation?.roomNumber,
                        )
                      }
                      disabled={cancellingId === lastResult.channexBookingId || cancelBooking.isPending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-100 hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancellingId === lastResult.channexBookingId ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                          <span>Đang gửi lệnh hủy đơn & giải phóng phòng...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-base">❌</span>
                          <span>Hủy Đơn Đặt Phòng Này ➔ Trả Ô Phòng Ngay</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                <span className="text-4xl text-gray-300">📬</span>
                <p className="mt-3 text-sm font-semibold text-gray-600">
                  Chưa có kết quả bắn đơn gần nhất
                </p>
                <p className="mt-1 max-w-xs text-xs text-gray-400">
                  Chọn &quot;Bắn Đơn Mới&quot; bên trái để mô phỏng đặt phòng và quan sát luồng xếp phòng thời gian thực!
                </p>
              </div>
            )}
          </div>

          {/* Integration architecture notes */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 text-xs text-gray-600 space-y-2">
            <span className="font-bold text-gray-800 flex items-center gap-1.5">
              <span>💡</span> Chu trình kiểm thử Đặt & Hủy phòng OTA:
            </span>
            <p>
              <strong>1. Bắn đơn mới:</strong> Channex nhận đơn ➔ PMS tự động tìm phòng trống thực tế của hạng phòng và chuyển trạng thái sang CONFIRMED ➔ Bảng ARI giảm 1 phòng trống.
            </p>
            <p>
              <strong>2. Hủy đơn:</strong> Channex nhận lệnh hủy ➔ PMS chuyển đơn sang CANCELLED ➔ Phòng được trả về trạng thái trống ban đầu trên ARI và sơ đồ phòng PMS mà không cần F5.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Recent Simulated Bookings Table */}
      <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-700 font-extrabold">
                3
              </span>
              <span>Lịch Sử Đơn Đặt Phòng Thử Nghiệm & Thao Tác Hủy</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">
                {simulatedBookings.length} đơn
              </span>
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Danh sách các đơn đặt phòng OTA test đã tạo vào PMS. Bạn có thể nhấn <strong>&quot;Hủy đơn&quot;</strong> trên bất kỳ đơn nào để kiểm tra luồng Realtime giải phóng phòng tự động.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills */}
            <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-2.5 py-1 transition ${statusFilter === "ALL" ? "bg-white text-gray-900 shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"}`}
              >
                Tất cả ({simulatedBookings.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CONFIRMED")}
                className={`rounded-lg px-2.5 py-1 transition ${statusFilter === "CONFIRMED" ? "bg-white text-emerald-800 shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"}`}
              >
                🟢 Đang chiếm ({activeBookings.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CANCELLED")}
                className={`rounded-lg px-2.5 py-1 transition ${statusFilter === "CANCELLED" ? "bg-white text-rose-800 shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"}`}
              >
                ⚪ Đã hủy ({cancelledBookings.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => void refreshSimulatedBookings()}
              disabled={isLoadingSimulatedBookings}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-2xs hover:bg-gray-50 transition"
            >
              <span className={isLoadingSimulatedBookings ? "animate-spin" : ""}>🔄</span>
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Quick Search */}
        {simulatedBookings.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Tìm theo mã đơn, tên khách, số phòng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Xóa tìm
              </button>
            )}
          </div>
        )}

        {isLoadingSimulatedBookings ? (
          <div className="py-8 text-center text-xs text-gray-500">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="mt-2">Đang tải danh sách đơn đặt phòng...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">
            <span className="text-3xl">📭</span>
            <p className="mt-2 font-medium text-gray-600">Không tìm thấy đơn đặt phòng thử nghiệm nào.</p>
            <p className="mt-0.5 text-gray-400">Hãy dùng form bên trên để bắn đơn thử nghiệm mới.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="py-2.5 px-3">Kênh & Mã Đơn</th>
                  <th className="py-2.5 px-3">Khách Hàng</th>
                  <th className="py-2.5 px-3">Hạng / Phòng</th>
                  <th className="py-2.5 px-3">Ngày Lưu Trú</th>
                  <th className="py-2.5 px-3">Tổng Doanh Thu</th>
                  <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                  <th className="py-2.5 px-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBookings.map((bk) => {
                  const isCancelled = bk.status === "CANCELLED" || bk.status === "cancelled";
                  const channelInfo = POPULAR_CHANNELS.find(
                    (c) =>
                      c.code.toLowerCase().includes(bk.otaName.toLowerCase()) ||
                      bk.otaName.toLowerCase().includes(c.code.toLowerCase()),
                  );
                  return (
                    <tr
                      key={bk.bookingId}
                      className={`transition hover:bg-gray-50/80 ${
                        isCancelled ? "bg-gray-50/40 text-gray-400" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{channelInfo?.icon || "🌐"}</span>
                          <div>
                            <div className="font-bold text-gray-900">
                              {bk.otaName}
                            </div>
                            <code className="font-mono text-[11px] text-blue-700 font-semibold">
                              {bk.otaReservationCode || bk.reservationCode}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-gray-800">{bk.guestName}</div>
                        {bk.guestPhone && <div className="text-[11px] text-gray-400">{bk.guestPhone}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-gray-700">{bk.roomType || "Chưa xác định"}</div>
                        {bk.roomNumber ? (
                          <span
                            className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isCancelled
                                ? "bg-gray-200 text-gray-500 line-through"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isCancelled ? `🔓 Phòng ${bk.roomNumber} (Đã trả trống)` : `🔒 Phòng ${bk.roomNumber} (Đang chiếm)`}
                          </span>
                        ) : (
                          <span className="text-amber-600 text-[11px]">Chờ phân phòng</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-gray-600">
                        {bk.checkInDate && bk.checkOutDate ? (
                          <span>
                            {bk.checkInDate} ➔ {bk.checkOutDate}
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-900">
                        {bk.amount
                          ? new Intl.NumberFormat("vi-VN", {
                              style: "currency",
                              currency: "VND",
                            }).format(bk.amount)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 border border-gray-300">
                            <span>🚫</span>
                            <span>Đã hủy</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Đã xác nhận</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isCancelled ? (
                          <span className="text-[11px] text-emerald-700 font-semibold italic">
                            ✓ Đã trả ô phòng trống
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleCancelBooking(
                                bk.bookingId,
                                bk.otaReservationCode,
                                bk.otaName,
                                bk.roomNumber,
                              )
                            }
                            disabled={cancellingId === bk.bookingId}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-400 transition shadow-2xs disabled:opacity-50"
                          >
                            {cancellingId === bk.bookingId ? (
                              <span className="h-3 w-3 animate-spin rounded-full border border-rose-600 border-t-transparent" />
                            ) : (
                              <span>❌</span>
                            )}
                            <span>Hủy đơn</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
