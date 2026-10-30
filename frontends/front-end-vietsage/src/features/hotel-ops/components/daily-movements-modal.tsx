"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { buildFrontDeskGroupSummaries } from "@/features/hotel-ops/utils/front-desk-groups";
import type {
  HotelArrival,
  HotelRoomSummary,
  HotelStaySummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";

export type DailyMovementsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  businessDate?: string | null;
  todayYmd: string;
  initialTab?: "arrivals" | "departures" | "groups";
  rooms: HotelRoomSummary[];
  arrivalsList: HotelArrival[];
  onRefreshData: () => Promise<void>;
  onCheckInArrival: (arrival: HotelArrival) => void | Promise<void>;
  onCheckInGroup?: (groupCode: string) => void;
  onOpenGroupDetail?: (groupCode: string) => void;
  onPrintGroupConfirmation?: (groupCode: string) => void;
  onCheckOutStay?: (room: HotelRoomSummary, stay: HotelStaySummary) => void | Promise<void>;
  onExtendStay?: (room: HotelRoomSummary) => void | Promise<void>;
  onOpenRoomDetail?: (room: HotelRoomSummary) => void;
  onOpenArrivalDetail?: (arrival: HotelArrival) => void;
  onPrintActiveStays?: () => void;
  canCheckInStay?: boolean;
  canCheckOutStay?: boolean;
  canManageReservations?: boolean;
  canViewBilling?: boolean;
  canCheckoutBilling?: boolean;
};

type MovementTab = "arrivals" | "departures" | "groups";
type ArrivalFilter = "all" | "unassigned" | "assigned" | "checked_in";
type DepartureFilter = "all" | "due_today" | "overdue" | "checked_out";
type GroupFilter = "all" | "ready" | "partial" | "completed";

const GROUPS_PER_PAGE = 10;

export type DepartureItem = {
  room: HotelRoomSummary;
  stay: HotelStaySummary;
  status: "DUE_TODAY" | "OVERDUE" | "CHECKED_OUT";
};

function formatVnd(val?: number | string | null): string {
  if (val === null || val === undefined || val === "") return "0 ₫";
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTimeVi(value?: string | Date | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateVi(value?: string | Date | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toLocalDatetimeInput(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "";
    const offsetMs = 7 * 60 * 60 * 1000;
    const vnTime = new Date(d.getTime() + offsetMs);
    return vnTime.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function fromLocalDatetimeInput(localVal: string): string {
  if (!localVal) return "";
  const d = new Date(`${localVal}:00+07:00`);
  return d.toISOString();
}

export function DailyMovementsModal({
  isOpen,
  onClose,
  hotelId,
  businessDate,
  todayYmd,
  initialTab = "arrivals",
  rooms,
  arrivalsList,
  onRefreshData,
  onCheckInArrival,
  onCheckInGroup,
  onOpenGroupDetail,
  onPrintGroupConfirmation,
  onCheckOutStay,
  onExtendStay,
  onOpenRoomDetail,
  onOpenArrivalDetail,
  onPrintActiveStays,
  canCheckInStay = false,
  canCheckOutStay = false,
  canManageReservations = false,
  canViewBilling = false,
  canCheckoutBilling = false,
}: DailyMovementsModalProps) {
  const queryClient = useQueryClient();
  const titleId = useId();

  const [activeTab, setActiveTab] = useState<MovementTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [arrivalFilter, setArrivalFilter] = useState<ArrivalFilter>("all");
  const [departureFilter, setDepartureFilter] = useState<DepartureFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [groupPage, setGroupPage] = useState(1);
  const [isAutoCheckInAfterAssign, setIsAutoCheckInAfterAssign] = useState(false);

  // Sub-dialog states
  const [editingArrival, setEditingArrival] = useState<HotelArrival | null>(null);
  const [assigningArrival, setAssigningArrival] = useState<HotelArrival | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial tab when modal opens
  const [previousOpening, setPreviousOpening] = useState({ isOpen, initialTab });
  if (previousOpening.isOpen !== isOpen || previousOpening.initialTab !== initialTab) {
    setPreviousOpening({ isOpen, initialTab });
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchQuery("");
      setArrivalFilter("all");
      setDepartureFilter("all");
      setGroupFilter("all");
      setGroupPage(1);
      setIsAutoCheckInAfterAssign(false);
    }
  }

  // Keyboard escape: closes modal if on list
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingArrival && !assigningArrival && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, editingArrival, assigningArrival, isSubmitting, onClose]);

  const targetDateYmd = businessDate || todayYmd;

  // Filter Arrivals
  const targetArrivals = useMemo(() => {
    return arrivalsList.filter((arr) => {
      const arrYmd = arr.plannedCheckInAt ? arr.plannedCheckInAt.slice(0, 10) : "";
      return arrYmd === targetDateYmd;
    });
  }, [arrivalsList, targetDateYmd]);

  const filteredArrivals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return targetArrivals.filter((arr) => {
      if (arrivalFilter === "unassigned" && arr.roomId) return false;
      if (arrivalFilter === "assigned" && (!arr.roomId || arr.status === "CHECKED_IN")) return false;
      if (arrivalFilter === "checked_in" && arr.status !== "CHECKED_IN") return false;

      if (!q) return true;
      const guestName = (arr.guestDisplayName || "").toLowerCase();
      const phone = (arr.guestPhone || "").toLowerCase();
      const code = (arr.reservationCode || arr.id || "").toLowerCase();
      const roomNum = (arr.room?.roomNumber || "").toLowerCase();
      const groupCode = (arr.groupCode || "").toLowerCase();

      return (
        guestName.includes(q) ||
        phone.includes(q) ||
        code.includes(q) ||
        roomNum.includes(q) ||
        groupCode.includes(q)
      );
    });
  }, [targetArrivals, arrivalFilter, searchQuery]);

  // Filter Departures
  const targetDepartures = useMemo(() => {
    const list: DepartureItem[] = [];
    for (const room of rooms) {
      const stay = room.activeStay;
      if (!stay) continue;

      const outYmd = stay.plannedCheckOutAt ? stay.plannedCheckOutAt.slice(0, 10) : "";
      const actualOutYmd = stay.checkedOutAt ? stay.checkedOutAt.slice(0, 10) : "";

      if (stay.checkedOutAt && actualOutYmd === targetDateYmd) {
        list.push({ room, stay, status: "CHECKED_OUT" });
      } else if (!stay.checkedOutAt) {
        if (outYmd === targetDateYmd) {
          list.push({ room, stay, status: "DUE_TODAY" });
        } else if (outYmd && outYmd < targetDateYmd) {
          list.push({ room, stay, status: "OVERDUE" });
        }
      }
    }
    return list;
  }, [rooms, targetDateYmd]);

  const filteredDepartures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return targetDepartures.filter(({ room, stay, status }) => {
      if (departureFilter === "due_today" && status !== "DUE_TODAY") return false;
      if (departureFilter === "overdue" && status !== "OVERDUE") return false;
      if (departureFilter === "checked_out" && status !== "CHECKED_OUT") return false;

      if (!q) return true;
      const guestName = (stay.guestDisplayName || "").toLowerCase();
      const phone = (stay.guestPhone || "").toLowerCase();
      const roomNum = (room.roomNumber || "").toLowerCase();

      return guestName.includes(q) || phone.includes(q) || roomNum.includes(q);
    });
  }, [targetDepartures, departureFilter, searchQuery]);

  // Group summaries from pre-booked arrivals
  const groupSummaries = useMemo(() => buildFrontDeskGroupSummaries(arrivalsList), [arrivalsList]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groupSummaries.filter((g) => {
      const isCompleted = g.checkedInRooms === g.totalRooms;
      const isPartial = g.checkedInRooms > 0 && !isCompleted;
      const isReady = !isCompleted && g.checkedInRooms === 0 && g.arrivingRooms > 0;
      if (groupFilter === "ready" && !isReady) return false;
      if (groupFilter === "partial" && !isPartial) return false;
      if (groupFilter === "completed" && !isCompleted) return false;

      if (!q) return true;
      return (
        g.groupCode.toLowerCase().includes(q) ||
        g.leadGuestName.toLowerCase().includes(q) ||
        Boolean(g.leadGuestPhone?.toLowerCase().includes(q)) ||
        g.assignedRoomNumbers.some((num) => num.toLowerCase().includes(q))
      );
    });
  }, [groupSummaries, groupFilter, searchQuery]);


  const groupTotalPages = Math.max(1, Math.ceil(filteredGroups.length / GROUPS_PER_PAGE));
  const safeGroupPage = Math.min(groupPage, groupTotalPages);
  const groupStartIndex = (safeGroupPage - 1) * GROUPS_PER_PAGE;
  const pagedGroups = filteredGroups.slice(groupStartIndex, groupStartIndex + GROUPS_PER_PAGE);

  // Handle Quick Check-In
  const handleQuickCheckIn = useCallback(
    async (arrival: HotelArrival) => {
      if (!arrival.roomId) {
        setIsAutoCheckInAfterAssign(true);
        setAssigningArrival(arrival);
        return;
      }
      onCheckInArrival(arrival);
    },
    [onCheckInArrival],
  );

  // Handle Quick Check-Out Stay
  const handleQuickCheckOut = useCallback(
    async (room: HotelRoomSummary, stay: HotelStaySummary) => {
      if (!canCheckOutStay && !canCheckoutBilling) return;

      const res = await showConfirmDialog({
        title: `Trả phòng (Check-out) Phòng ${room.roomNumber || room.id}?`,
        html: `
          <div style="font-size:14px;color:#475569;text-align:left;line-height:1.6">
            <p><strong>Khách hàng:</strong> ${stay.guestDisplayName || "Chưa có tên"}</p>
            <p><strong>Thời gian nhận phòng:</strong> ${formatDateTimeVi(stay.checkedInAt)}</p>
            <p><strong>Dự kiến trả phòng:</strong> ${formatDateTimeVi(stay.plannedCheckOutAt)}</p>
            <p style="margin-top:12px;color:#0f172a;font-weight:600">
              Bạn có muốn trả phòng nhanh ngay bây giờ? Phòng sẽ chuyển sang trạng thái <strong>Chờ dọn dẹp</strong>.
            </p>
          </div>
        `,
        confirmText: "Xác nhận trả phòng",
        cancelText: "Hủy bỏ",
        confirmVariant: "danger",
      });

      if (!res.isConfirmed) return;

      setIsSubmitting(true);
      try {
        await staffRoomsRepository.checkOutStay(hotelId, stay.id, {
          nextRoomStatus: "PROCESSING",
        });
        await invalidateHotelRealtimeQueries(queryClient, hotelId);
        await onRefreshData();
        await showSuccessAlert(
          "Trả phòng thành công",
          `Phòng ${room.roomNumber || room.id} đã hoàn tất trả phòng và chuyển sang trạng thái chờ dọn.`,
        );
      } catch (err) {
        await showErrorAlert(
          "Không thể trả phòng",
          err instanceof Error ? err.message : "Đã có lỗi xảy ra khi thực hiện trả phòng.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [hotelId, queryClient, onRefreshData, canCheckOutStay, canCheckoutBilling],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !editingArrival && !assigningArrival) {
          onClose();
        }
      }}
    >
      <div className="relative my-auto flex flex-col w-full max-w-[96vw] 2xl:max-w-[1600px] xl:max-w-[1440px] max-h-[92vh] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-left">

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 sm:px-7 py-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    <VsIcon name="calendar_today" className="text-sm" />
                    <span>Ngày vận hành: {formatDateVi(targetDateYmd)}</span>
                  </span>
                  {businessDate && businessDate !== todayYmd ? (
                    <span className="rounded-lg bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                      Xem ngày chỉ định
                    </span>
                  ) : null}
                </div>
                <h2 id={titleId} className="vs-display mt-1 text-xl sm:text-2xl font-black text-slate-900 text-balance">
                  Danh sách khách đến / khách đi trong ngày
                </h2>
                <p className="text-xs text-slate-500 text-pretty">
                  Theo dõi và thực hiện nhận phòng (IN), trả phòng (OUT), gán/tráo phòng hoặc chỉnh sửa thông tin đặt phòng trực tiếp.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onPrintActiveStays ? (
                  <button
                    type="button"
                    onClick={onPrintActiveStays}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3.5 text-xs font-bold shadow-2xs transition cursor-pointer min-h-[40px] whitespace-nowrap"
                    title="In danh sách khách đang lưu trú tại khách sạn"
                  >
                    <VsIcon name="print" className="text-base text-slate-500" />
                    <span>In danh sách lưu trú</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Đóng hộp thoại"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>
            </div>

            {/* Tab Switcher & Filters */}
            <div className="border-b border-slate-200 bg-white px-5 sm:px-7 py-3 shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Tabs */}
              <div className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("arrivals")}
                  className={`inline-flex h-full items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                    activeTab === "arrivals"
                      ? "bg-white text-emerald-800 shadow-xs font-black border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <VsIcon name="login" className="text-base text-emerald-600" />
                  <span>Khách đến trong ngày</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-black">
                    {targetArrivals.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("departures")}
                  className={`inline-flex h-full items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                    activeTab === "departures"
                      ? "bg-white text-amber-900 shadow-xs font-black border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <VsIcon name="logout" className="text-base text-amber-600" />
                  <span>Khách đi trong ngày</span>
                  <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-black">
                    {targetDepartures.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("groups")}
                  className={`inline-flex h-full items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
                    activeTab === "groups"
                      ? "bg-white text-purple-900 shadow-xs font-black border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <VsIcon name="groups" className="text-base text-purple-600" />
                  <span>Đoàn khách</span>
                  <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-black">
                    {groupSummaries.length}
                  </span>
                </button>
              </div>

              {/* Search & Status Filters */}
              <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl md:justify-end">
                <div className="relative flex-1 min-w-[200px]">
                  <VsIcon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setGroupPage(1); }}
                    placeholder={
                      activeTab === "arrivals"
                        ? "Tìm tên khách, SĐT, số phòng, mã đặt..."
                        : activeTab === "groups"
                          ? "Tìm mã đoàn, trưởng đoàn, SĐT, số phòng..."
                          : "Tìm tên khách, số phòng, SĐT..."
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      <VsIcon name="close" className="text-sm" />
                    </button>
                  ) : null}
                </div>

                {activeTab === "arrivals" ? (
                  <select
                    value={arrivalFilter}
                    onChange={(e) => setArrivalFilter(e.target.value as ArrivalFilter)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs focus:border-sky-600 focus:outline-none"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="unassigned">Chưa gán phòng</option>
                    <option value="assigned">Đã gán phòng</option>
                    <option value="checked_in">Đã nhận phòng (IN)</option>
                  </select>
                ) : activeTab === "groups" ? (
                  <select
                    value={groupFilter}
                    onChange={(e) => { setGroupFilter(e.target.value as GroupFilter); setGroupPage(1); }}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs focus:border-sky-600 focus:outline-none"
                  >
                    <option value="all">Tất cả đoàn</option>
                    <option value="ready">Chờ nhận phòng</option>
                    <option value="partial">Đang nhận dở</option>
                    <option value="completed">Đã nhận đủ phòng</option>
                  </select>
                ) : (
                  <select
                    value={departureFilter}
                    onChange={(e) => setDepartureFilter(e.target.value as DepartureFilter)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs focus:border-sky-600 focus:outline-none"
                  >
                    <option value="all">Tất cả tình trạng</option>
                    <option value="due_today">Chờ trả phòng hôm nay</option>
                    <option value="overdue">Quá hạn trả phòng</option>
                    <option value="checked_out">Đã trả phòng (OUT)</option>
                  </select>
                )}
              </div>
            </div>

            {/* Content Body: Clean Tables with zero overflow */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6">
              {activeTab === "arrivals" ? (
                /* TAB 1: ARRIVALS TABLE */
                filteredArrivals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    <VsIcon name="login" className="text-4xl text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Không có khách đến trong ngày phù hợp</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kiểm tra lại bộ lọc tìm kiếm hoặc xem các ngày khác trên sơ đồ phòng.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-2xs bg-white">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th scope="col" className="px-5 py-3.5">Khách hàng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Phòng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Dự kiến nhận</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Dự kiến trả</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Giá phòng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Trạng thái</th>
                          <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredArrivals.map((arrival) => {
                          const isCheckedIn = arrival.status === "CHECKED_IN";
                          return (
                            <tr
                              key={arrival.id}
                              onClick={() => onOpenArrivalDetail?.(arrival)}
                              className="group transition-colors hover:bg-sky-50/70 cursor-pointer"
                              title="Nhấn vào hàng để xem chi tiết đầy đủ và thao tác"
                            >
                              {/* Khách hàng (gọn gàng, không nhồi nhét mã/đoàn rườm rà) */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="font-bold text-slate-900 text-sm group-hover:text-sky-800 transition-colors">
                                  {arrival.guestDisplayName}
                                </div>
                                {arrival.guestPhone ? (
                                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                                    {arrival.guestPhone}
                                  </div>
                                ) : null}
                              </td>

                              {/* Phòng */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                {arrival.room?.roomNumber ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-bold whitespace-nowrap">
                                    <VsIcon name="meeting_room" className="text-sm text-emerald-600" />
                                    <span>Phòng {arrival.room.roomNumber}</span>
                                    {arrival.room.type ? <span className="font-normal text-emerald-700">({arrival.room.type})</span> : null}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1 text-xs font-bold whitespace-nowrap">
                                    <VsIcon name="warning" className="text-sm text-amber-600" />
                                    <span>Chưa gán phòng</span>
                                  </span>
                                )}
                              </td>

                              {/* Dự kiến nhận */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-semibold text-slate-700">
                                {formatDateTimeVi(arrival.plannedCheckInAt)}
                              </td>

                              {/* Dự kiến trả */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-semibold text-slate-700">
                                {formatDateTimeVi(arrival.plannedCheckOutAt)}
                              </td>

                              {/* Giá */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-bold text-slate-900">
                                {formatVnd(arrival.rate || arrival.nightlyRateSnapshot)}
                              </td>

                              {/* Trạng thái */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                {isCheckedIn ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <VsIcon name="check" className="text-xs" />
                                    <span>Đã nhận phòng</span>
                                  </span>
                                ) : arrival.roomId ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <span>Sẵn sàng đón</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <span>Chờ xếp phòng</span>
                                  </span>
                                )}
                              </td>

                              {/* Thao tác: Giữ gọn gàng, xoá nút Sửa & icon Mắt, click row để xem chi tiết */}
                              <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  {!isCheckedIn && canCheckInStay ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleQuickCheckIn(arrival)}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                      title="Làm thủ tục nhận phòng (Check-in IN) nhanh"
                                    >
                                      <VsIcon name="login" className="text-sm" />
                                      <span>Nhận phòng</span>
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => onOpenArrivalDetail?.(arrival)}
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-800 px-2.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                    title="Xem chi tiết đầy đủ và thao tác"
                                  >
                                    <span>Chi tiết</span>
                                    <VsIcon name="chevron_right" className="text-sm text-slate-400" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : activeTab === "groups" ? (
                /* TAB 3: GROUPS TABLE */
                filteredGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    <VsIcon name="groups" className="text-4xl text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Không có đoàn khách phù hợp</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-2xs bg-white">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                            <th scope="col" className="px-5 py-3.5">Đoàn khách</th>
                            <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Số phòng</th>
                            <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Lịch trình</th>
                            <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Tình trạng</th>
                            <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagedGroups.map((group) => {
                            const isCompleted = group.checkedInRooms === group.totalRooms;
                            const isPartial = group.checkedInRooms > 0 && !isCompleted;
                            const canCheckInGroup = canCheckInStay && !isCompleted && group.arrivingRooms > 0;

                            return (
                              <tr
                                key={group.groupCode}
                                onClick={() => onOpenGroupDetail?.(group.groupCode)}
                                className="group transition-colors hover:bg-purple-50/50 cursor-pointer"
                                title="Nhấn vào hàng để xem chi tiết đoàn"
                              >
                                {/* Đoàn khách */}
                                <td className="px-5 py-3.5 align-middle">
                                  <div className="font-bold text-slate-900 text-sm group-hover:text-purple-900 transition-colors">
                                    {group.leadGuestName}
                                  </div>
                                  <span className="mt-0.5 inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-mono text-xs font-bold text-purple-700 whitespace-nowrap">
                                    #{group.groupCode}
                                  </span>
                                </td>

                                {/* Số phòng */}
                                <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                  <span className="text-sm font-bold text-slate-800">{group.totalRooms} phòng</span>
                                  {group.unassignedRoomCount > 0 ? (
                                    <span className="ml-2 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                                      {group.unassignedRoomCount} chưa gán
                                    </span>
                                  ) : null}
                                </td>

                                {/* Lịch trình */}
                                <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-semibold text-slate-700">
                                  {formatDateVi(group.earliestCheckInAt)} → {formatDateVi(group.latestCheckOutAt)}
                                </td>

                                {/* Tình trạng */}
                                <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                  {isCompleted ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                      Đã nhận đủ phòng
                                    </span>
                                  ) : isPartial ? (
                                    <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 border border-purple-200 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                      Đang nhận {group.checkedInRooms}/{group.totalRooms}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                      Chờ nhận phòng
                                    </span>
                                  )}
                                </td>

                                {/* Thao tác */}
                                <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    {canCheckInGroup && onCheckInGroup ? (
                                      <button
                                        type="button"
                                        onClick={() => onCheckInGroup(group.groupCode)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white px-3 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                      >
                                        <VsIcon name="badge" className="text-sm" />
                                        <span>Check-in đoàn</span>
                                      </button>
                                    ) : null}
                                    {onPrintGroupConfirmation ? (
                                      <button
                                        type="button"
                                        onClick={() => onPrintGroupConfirmation(group.groupCode)}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 px-2.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                        title="In xác nhận đoàn"
                                      >
                                        <VsIcon name="print" className="text-sm text-slate-500" />
                                        <span>In</span>
                                      </button>
                                    ) : null}
                                    {onOpenGroupDetail ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenGroupDetail(group.groupCode)}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-900 px-2.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                      >
                                        <span>Chi tiết</span>
                                        <VsIcon name="chevron_right" className="text-sm text-slate-400" />
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {groupTotalPages > 1 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600">
                          {groupStartIndex + 1}–{Math.min(groupStartIndex + GROUPS_PER_PAGE, filteredGroups.length)} / {filteredGroups.length} đoàn
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={safeGroupPage <= 1}
                            onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
                            aria-label="Trang trước"
                            className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                          >
                            <VsIcon name="chevron_left" className="text-sm" />
                          </button>
                          {Array.from({ length: groupTotalPages }, (_, idx) => idx + 1).map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setGroupPage(pageNum)}
                              className={`h-8 min-w-[32px] rounded-lg px-2 text-xs font-bold transition cursor-pointer ${
                                pageNum === safeGroupPage
                                  ? "bg-purple-700 text-white shadow-2xs"
                                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={safeGroupPage >= groupTotalPages}
                            onClick={() => setGroupPage((p) => Math.min(groupTotalPages, p + 1))}
                            aria-label="Trang sau"
                            className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                          >
                            <VsIcon name="chevron_right" className="text-sm" />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                /* TAB 2: DEPARTURES TABLE */
                filteredDepartures.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    <VsIcon name="logout" className="text-4xl text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Không có khách đi trong ngày phù hợp</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Không có phòng nào lên lịch trả phòng hoặc quá hạn vào ngày vận hành đã chọn.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-2xs bg-white">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th scope="col" className="px-5 py-3.5">Khách hàng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Phòng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Đã nhận phòng</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Dự kiến trả</th>
                          <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Tình trạng</th>
                          <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDepartures.map(({ room, stay, status }) => {
                          const isCheckedOut = status === "CHECKED_OUT" || Boolean(stay.checkedOutAt);
                          const isOverdue = status === "OVERDUE";

                          return (
                            <tr
                              key={stay.id}
                              onClick={() => onOpenRoomDetail?.({ ...room, activeStay: stay })}
                              className="group transition-colors hover:bg-amber-50/50 cursor-pointer"
                              title="Nhấn vào hàng để xem chi tiết đầy đủ và thao tác"
                            >
                              {/* Khách hàng */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="font-bold text-slate-900 text-sm group-hover:text-amber-900 transition-colors">
                                  {stay.guestDisplayName || "Khách lưu trú"}
                                </div>
                                {stay.guestPhone ? (
                                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                                    {stay.guestPhone}
                                  </div>
                                ) : null}
                              </td>

                              {/* Phòng */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 px-3 py-1 text-xs font-bold whitespace-nowrap">
                                  <VsIcon name="meeting_room" className="text-sm text-slate-600" />
                                  <span>Phòng {room.roomNumber || room.id}</span>
                                  {room.type ? <span className="font-normal text-slate-600">({room.type})</span> : null}
                                </span>
                              </td>

                              {/* Đã nhận phòng */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-semibold text-slate-700">
                                {formatDateTimeVi(stay.checkedInAt)}
                              </td>

                              {/* Dự kiến trả */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap text-xs font-semibold text-slate-700">
                                {formatDateTimeVi(stay.plannedCheckOutAt)}
                              </td>

                              {/* Tình trạng */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                {isCheckedOut ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <span>✓ Đã trả phòng</span>
                                  </span>
                                ) : isOverdue ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <VsIcon name="priority_high" className="text-xs" />
                                    <span>Quá hạn trả phòng</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-3 py-0.5 text-xs font-bold whitespace-nowrap">
                                    <VsIcon name="schedule" className="text-xs" />
                                    <span>Chờ trả phòng</span>
                                  </span>
                                )}
                              </td>

                              {/* Thao tác: Giữ gọn gàng, xoá nút Sửa & icon Mắt, click row để xem chi tiết */}
                              <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  {!isCheckedOut && (canCheckOutStay || canCheckoutBilling) ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleQuickCheckOut(room, stay)}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white px-3 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                      title="Thực hiện trả phòng (Check-out OUT) nhanh"
                                    >
                                      <VsIcon name="logout" className="text-sm" />
                                      <span>Trả phòng (OUT)</span>
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => onOpenRoomDetail?.({ ...room, activeStay: stay })}
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-900 px-2.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[32px]"
                                    title="Xem chi tiết đầy đủ và thao tác"
                                  >
                                    <span>Chi tiết</span>
                                    <VsIcon name="chevron_right" className="text-sm text-slate-400" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
      </div>

      {/* Sub-Modal: Sửa thông tin booking */}
      {editingArrival ? (
        <EditBookingSubModal
          arrival={editingArrival}
          hotelId={hotelId}
          onClose={() => setEditingArrival(null)}
          onSuccess={async () => {
            setEditingArrival(null);
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            await onRefreshData();
          }}
        />
      ) : null}

      {/* Sub-Modal: Gán phòng / Tráo phòng */}
      {assigningArrival ? (
        <AssignOrSwapRoomSubModal
          arrival={assigningArrival}
          hotelId={hotelId}
          rooms={rooms}
          otherArrivals={arrivalsList.filter((a) => a.id !== assigningArrival.id && a.status !== "CHECKED_IN")}
          onClose={() => {
            setIsAutoCheckInAfterAssign(false);
            setAssigningArrival(null);
          }}
          onSuccess={async (assignedRoomId) => {
            setAssigningArrival(null);
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            await onRefreshData();
            if (isAutoCheckInAfterAssign) {
              setIsAutoCheckInAfterAssign(false);
              const updated = arrivalsList.find((a) => a.id === assigningArrival.id);
              if (updated) {
                onCheckInArrival({ ...updated, roomId: assignedRoomId });
              }
            }
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

// ==========================================
// Sub-Modal: Chỉnh sửa thông tin đặt phòng
// ==========================================
function EditBookingSubModal({
  arrival,
  hotelId,
  onClose,
  onSuccess,
}: {
  arrival: HotelArrival;
  hotelId: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [guestName, setGuestName] = useState(arrival.guestDisplayName || "");
  const [guestPhone, setGuestPhone] = useState(arrival.guestPhone || "");
  const [checkInAt, setCheckInAt] = useState(() => toLocalDatetimeInput(arrival.plannedCheckInAt));
  const [checkOutAt, setCheckOutAt] = useState(() => toLocalDatetimeInput(arrival.plannedCheckOutAt));
  const [rate, setRate] = useState(String(arrival.rate || arrival.nightlyRateSnapshot || ""));
  const [notes, setNotes] = useState(arrival.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkInAt || !checkOutAt) {
      void showWarningAlert("Thiếu thời gian", "Vui lòng chọn thời gian nhận phòng và trả phòng.");
      return;
    }

    const checkInIso = fromLocalDatetimeInput(checkInAt);
    const checkOutIso = fromLocalDatetimeInput(checkOutAt);

    if (new Date(checkOutIso).getTime() <= new Date(checkInIso).getTime()) {
      void showWarningAlert("Thời gian không hợp lệ", "Thời gian trả phòng phải sau thời gian nhận phòng.");
      return;
    }

    setSaving(true);
    try {
      const parsedRate = rate.trim() ? Number(rate.replace(/\D/g, "")) : undefined;
      const payload = {
        startDate: checkInIso.slice(0, 10),
        endDate: checkOutIso.slice(0, 10),
        plannedCheckInAt: checkInIso,
        plannedCheckOutAt: checkOutIso,
        ...(parsedRate !== undefined && !Number.isNaN(parsedRate)
          ? { rate: parsedRate, nightlyRateSnapshot: parsedRate }
          : {}),
        expectedUpdatedAt: arrival.updatedAt || new Date().toISOString(),
      };

      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/dates`,
        {
          method: "PATCH",
          body: payload,
        },
      );

      await showSuccessAlert(
        "Cập nhật thành công",
        `Đã lưu các thay đổi cho đơn đặt phòng ${arrival.reservationCode || arrival.id}.`,
      );
      await onSuccess();
    } catch (err) {
      await showErrorAlert(
        "Không thể cập nhật",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu thay đổi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="vs-display text-lg font-bold text-slate-900 text-balance">
            Chỉnh sửa thông tin đặt phòng
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            disabled={saving}
          >
            <VsIcon name="close" className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Khách hàng
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-sky-600 focus:outline-none"
              disabled
              title="Tên người đại diện đặt phòng"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thời gian nhận phòng
              </label>
              <input
                type="datetime-local"
                value={checkInAt}
                onChange={(e) => setCheckInAt(e.target.value)}
                required
                className="h-10 w-full rounded-xl border border-slate-300 px-2.5 text-xs font-bold text-slate-800 focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thời gian trả phòng
              </label>
              <input
                type="datetime-local"
                value={checkOutAt}
                onChange={(e) => setCheckOutAt(e.target.value)}
                required
                className="h-10 w-full rounded-xl border border-slate-300 px-2.5 text-xs font-bold text-slate-800 focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Giá phòng mỗi đêm (VNĐ)
            </label>
            <input
              type="text"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="VD: 500000"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-5 text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              {saving ? <VsIcon name="refresh" className="animate-spin text-sm" /> : null}
              <span>{saving ? "Đang lưu..." : "Lưu thay đổi"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// Sub-Modal: Tráo phòng & Gán phòng
// ==========================================
function AssignOrSwapRoomSubModal({
  arrival,
  hotelId,
  rooms,
  otherArrivals,
  onClose,
  onSuccess,
}: {
  arrival: HotelArrival;
  hotelId: string;
  rooms: HotelRoomSummary[];
  otherArrivals: HotelArrival[];
  onClose: () => void;
  onSuccess: (roomId: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"ASSIGN" | "SWAP">("ASSIGN");
  const [selectedRoomId, setSelectedRoomId] = useState(arrival.roomId || "");
  const [selectedSwapArrivalId, setSelectedSwapArrivalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Available empty rooms
  const availableRooms = useMemo(() => {
    return rooms.filter((r) => {
      const isOccupied = Boolean(r.activeStay && !r.activeStay.checkedOutAt);
      if (isOccupied) return false;
      if (r.id === arrival.roomId) return true;
      const status = (r.physicalStatus || r.status || "").toLowerCase();
      return status === "available";
    });
  }, [rooms, arrival.roomId]);

  // Other arrivals that currently have assigned rooms
  const swappableArrivals = useMemo(() => {
    return otherArrivals.filter((a) => Boolean(a.roomId));
  }, [otherArrivals]);

  async function handleAssignSubmit() {
    if (!selectedRoomId) {
      void showWarningAlert("Chưa chọn phòng", "Vui lòng chọn phòng trống khả dụng từ danh sách.");
      return;
    }

    setSubmitting(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/room`,
        {
          method: "PUT",
          body: { roomId: selectedRoomId },
        },
      );
      await showSuccessAlert(
        "Gán phòng thành công",
        `Đã gán phòng cho khách ${arrival.guestDisplayName}.`,
      );
      await onSuccess(selectedRoomId);
    } catch (err) {
      await showErrorAlert(
        "Không thể gán phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gán phòng.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwapSubmit() {
    if (!selectedSwapArrivalId) {
      void showWarningAlert("Chưa chọn đối tượng tráo", "Vui lòng chọn đơn đặt phòng bạn muốn tráo đổi.");
      return;
    }

    const targetSwap = swappableArrivals.find((a) => a.id === selectedSwapArrivalId);
    if (!targetSwap || !targetSwap.roomId) {
      void showErrorAlert("Lỗi", "Không tìm thấy thông tin phòng của đơn được chọn.");
      return;
    }

    const currentRoomNum = arrival.room?.roomNumber || "phòng hiện tại";
    const targetRoomNum = targetSwap.room?.roomNumber || "phòng đối tác";

    const confirmRes = await showConfirmDialog({
      title: "Xác nhận tráo phòng giữa 2 khách",
      html: `
        <div style="font-size:14px;color:#334155;text-align:left;line-height:1.7">
          <p>• Khách <strong>${arrival.guestDisplayName}</strong> sẽ đổi sang <strong>Phòng ${targetRoomNum}</strong></p>
          <p>• Khách <strong>${targetSwap.guestDisplayName}</strong> sẽ nhận <strong>Phòng ${currentRoomNum}</strong></p>
          <p style="margin-top:10px;color:#b45309;font-weight:600">Bạn có chắc chắn muốn thực hiện thao tác tráo đổi này?</p>
        </div>
      `,
      confirmText: "Xác nhận tráo phòng",
      cancelText: "Hủy",
    });

    if (!confirmRes.isConfirmed) return;

    setSubmitting(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/placement`,
        {
          method: "PUT",
          body: {
            targetRoomId: targetSwap.roomId,
            swapWithReservationId: targetSwap.id,
            expectedUpdatedAt: arrival.updatedAt || new Date().toISOString(),
          },
        },
      );
      await showSuccessAlert(
        "Tráo phòng thành công",
        `Đã tráo đổi phòng giữa ${arrival.guestDisplayName} và ${targetSwap.guestDisplayName}.`,
      );
      await onSuccess(targetSwap.roomId);
    } catch (err) {
      await showErrorAlert(
        "Không thể tráo phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi tráo phòng.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="vs-display text-lg font-bold text-slate-900 text-balance">
              Phân bổ & Tráo phòng cho khách
            </h3>
            <p className="text-xs text-slate-500 text-pretty">
              Khách: <strong>{arrival.guestDisplayName}</strong> · Hiện tại:{" "}
              {arrival.room?.roomNumber ? `Phòng ${arrival.room.roomNumber}` : "Chưa gán phòng"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            disabled={submitting}
          >
            <VsIcon name="close" className="text-xl" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("ASSIGN")}
            className={`py-2 rounded-lg text-xs font-bold transition ${
              mode === "ASSIGN" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Gán vào phòng trống
          </button>
          <button
            type="button"
            onClick={() => setMode("SWAP")}
            disabled={!arrival.roomId || swappableArrivals.length === 0}
            className={`py-2 rounded-lg text-xs font-bold transition ${
              mode === "SWAP" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            } ${!arrival.roomId || swappableArrivals.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            title={
              !arrival.roomId
                ? "Cần có phòng trước khi thực hiện tráo đổi"
                : swappableArrivals.length === 0
                ? "Không có đơn đặt phòng nào khác để tráo"
                : "Tráo phòng với đơn đặt khác"
            }
          >
            Tráo phòng với khách khác
          </button>
        </div>

        {/* Content based on Mode */}
        <div className="mt-4 space-y-4">
          {mode === "ASSIGN" ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Chọn phòng trống từ danh sách:
              </label>
              {availableRooms.length === 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  Hiện tại không có phòng trống khả dụng nào. Vui lòng rà soát lại sơ đồ phòng hoặc chọn tráo phòng.
                </div>
              ) : (
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-sky-600 focus:outline-none"
                >
                  <option value="">-- Chọn phòng trống phù hợp --</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Phòng {r.roomNumber || r.id} ({r.type || "Tiêu chuẩn"}
                      {r.floor ? ` · Tầng ${r.floor}` : ""})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Chọn đơn đặt phòng muốn tráo đổi phòng:
              </label>
              <select
                value={selectedSwapArrivalId}
                onChange={(e) => setSelectedSwapArrivalId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-sky-600 focus:outline-none"
              >
                <option value="">-- Chọn đơn đặt để tráo phòng --</option>
                {swappableArrivals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Phòng {a.room?.roomNumber || a.roomId} ⇄ Khách {a.guestDisplayName} (Mã: {a.reservationCode || a.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={mode === "ASSIGN" ? handleAssignSubmit : handleSwapSubmit}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-5 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            {submitting ? <VsIcon name="refresh" className="animate-spin text-sm" /> : null}
            <span>
              {submitting
                ? "Đang xử lý..."
                : mode === "ASSIGN"
                ? "Xác nhận gán phòng"
                : "Xác nhận tráo phòng"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
