"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  staffRoomsRepository,
  type HotelArrivalReservationItem,
} from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  HotelArrival,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { formatFriendlyCheckInError } from "@/features/hotel-ops/utils/check-in-error";
import {
  showConfirmDialog,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";

export type GroupRoomItem = {
  reservationId: string;
  reservationCode: string;
  groupCode: string;
  roomId: string | null;
  roomNumber: string | null;
  floor: string | null;
  roomType: string | null;
  guestDisplayName: string;
  guestPhone: string | null;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  rate: number | string | null;
  status: "CONFIRMED" | "ARRIVAL_READY" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
  stayId: string | null;
  activeStayId?: string | null;
  updatedAt?: string | null;
};

export type GroupRoomEntry = GroupRoomItem;

export function buildGroupRoomItems(params: {
  activeGroupCode: string;
  initialArrivals?: HotelArrivalReservationItem[];
  fetchedArrivals?: HotelArrivalReservationItem[];
  rooms?: HotelRoomSummary[];
}): GroupRoomItem[] {
  const {
    activeGroupCode,
    initialArrivals = [],
    fetchedArrivals = [],
    rooms = [],
  } = params;

  if (!activeGroupCode.trim()) return [];

  const map = new Map<string, GroupRoomItem>();

  // Seed from initialArrivals matching groupCode
  for (const arr of initialArrivals) {
    if (arr.groupCode?.trim().toUpperCase() === activeGroupCode.trim().toUpperCase()) {
      const initialActiveStayId = arr.activeStayId ?? undefined;
      map.set(arr.id, {
        reservationId: arr.id,
        reservationCode: arr.reservationCode,
        groupCode: arr.groupCode,
        roomId: arr.assignedRoomId || arr.roomId || null,
        roomNumber: arr.assignedRoomNumber || arr.room?.roomNumber || null,
        floor: null,
        roomType: arr.roomTypeName || arr.room?.type || null,
        guestDisplayName: arr.guestDisplayName,
        guestPhone: arr.guestPhone || null,
        plannedCheckInAt: arr.plannedCheckInAt,
        plannedCheckOutAt: arr.plannedCheckOutAt,
        rate: arr.ratePerNight ?? arr.rate ?? arr.nightlyRateSnapshot ?? null,
        status: arr.status,
        stayId: initialActiveStayId ?? null,
        activeStayId: initialActiveStayId,
        updatedAt: arr.updatedAt || null,
      });
    }
  }

  // Merge from fetched arrivals (from authoritative group details endpoint)
  for (const item of fetchedArrivals) {
    const existing = map.get(item.id);
    const resolvedActiveStayId = item.activeStayId ?? existing?.activeStayId ?? undefined;
    map.set(item.id, {
      reservationId: item.id,
      reservationCode: item.reservationCode,
      groupCode: item.groupCode || activeGroupCode,
      roomId: item.assignedRoomId || item.roomId || existing?.roomId || null,
      roomNumber:
        item.assignedRoomNumber || item.room?.roomNumber || existing?.roomNumber || null,
      floor: existing?.floor || null,
      roomType: item.roomTypeName || item.room?.type || existing?.roomType || null,
      guestDisplayName: item.guestDisplayName || existing?.guestDisplayName || "Khách đoàn",
      guestPhone: item.guestPhone || existing?.guestPhone || null,
      plannedCheckInAt: item.plannedCheckInAt || existing?.plannedCheckInAt || "",
      plannedCheckOutAt: item.plannedCheckOutAt || existing?.plannedCheckOutAt || "",
      rate: item.ratePerNight ?? item.rate ?? item.nightlyRateSnapshot ?? existing?.rate ?? null,
      status: item.status,
      stayId: resolvedActiveStayId ?? existing?.stayId ?? null,
      activeStayId: item.activeStayId ?? existing?.activeStayId ?? undefined,
      updatedAt: item.updatedAt || existing?.updatedAt || null,
    });
  }

  // Fallback enrichment from roomsPage in case activeStayId was not yet populated
  for (const room of rooms) {
    if (room.activeStay?.reservationCode) {
      for (const item of map.values()) {
        if (item.reservationCode === room.activeStay.reservationCode) {
          item.status = "CHECKED_IN";
          item.stayId = item.stayId || room.activeStay.id;
          item.activeStayId = item.activeStayId ?? room.activeStay.id;
          item.roomId = room.id;
          item.roomNumber = room.roomNumber || item.roomNumber;
          item.floor = room.floor || item.floor;
          item.roomType = room.type || room.roomTypeName || item.roomType;
        }
      }
    }

    if (
      room.projectedReservation?.groupCode?.trim().toUpperCase() ===
      activeGroupCode.trim().toUpperCase()
    ) {
      const resId = room.projectedReservation.id;
      const existing = map.get(resId);
      if (existing) {
        existing.roomId = room.id;
        existing.roomNumber = room.roomNumber || existing.roomNumber;
        existing.floor = room.floor || existing.floor;
        existing.roomType = room.type || room.roomTypeName || existing.roomType;
      } else {
        map.set(resId, {
          reservationId: resId,
          reservationCode: room.projectedReservation.reservationCode,
          groupCode: activeGroupCode,
          roomId: room.id,
          roomNumber: room.roomNumber || null,
          floor: room.floor || null,
          roomType: room.type || room.roomTypeName || null,
          guestDisplayName: room.projectedReservation.guestDisplayName,
          guestPhone: room.projectedReservation.guestPhone || null,
          plannedCheckInAt: room.projectedReservation.plannedCheckInAt,
          plannedCheckOutAt: room.projectedReservation.plannedCheckOutAt,
          rate: room.projectedReservation.nightlyRateSnapshot || null,
          status:
            (room.projectedReservation.status as GroupRoomItem["status"]) ||
            "CONFIRMED",
          stayId: null,
          activeStayId: undefined,
          updatedAt: room.projectedReservation.updatedAt || null,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const roomA = a.roomNumber || "ZZZ";
    const roomB = b.roomNumber || "ZZZ";
    return roomA.localeCompare(roomB, undefined, { numeric: true });
  });
}

export type BatchOperationResult = {
  reservationId: string;
  success: boolean;
  message: string;
  action: "CHECK_IN" | "CHECK_OUT";
  timestamp: number;
};

export type GroupOperationsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  groupCode?: string | null;
  initialArrivals?: HotelArrival[];
  todayYmd?: string;
  canOperateArrivals?: boolean;
  canCheckInStay?: boolean;
  canCheckOutStay?: boolean;
  triggerElementRef?: React.RefObject<HTMLElement | null>;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Giá linh hoạt";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function GroupOperationsDrawer({
  isOpen,
  onClose,
  hotelId,
  groupCode: initialGroupCode,
  initialArrivals = [],
  todayYmd: propTodayYmd,
  canOperateArrivals = true,
  canCheckInStay = true,
  canCheckOutStay = true,
  triggerElementRef,
}: GroupOperationsDrawerProps) {
  const queryClient = useQueryClient();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const [activeGroupCode, setActiveGroupCode] = useState<string>(initialGroupCode || "");
  const [searchInput, setSearchInput] = useState<string>(initialGroupCode || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resultsMap, setResultsMap] = useState<Record<string, BatchOperationResult>>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  // Synchronize when initialGroupCode changes
  useEffect(() => {
    if (initialGroupCode) {
      setActiveGroupCode(initialGroupCode);
      setSearchInput(initialGroupCode);
      setSelectedIds(new Set());
      setResultsMap({});
    }
  }, [initialGroupCode]);

  // Keyboard accessibility and focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Initial focus on open and return focus on close
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
    const triggerEl = triggerElementRef?.current;
    return () => {
      triggerEl?.focus();
    };
  }, [isOpen, triggerElementRef]);

  // Query arrivals matching the active groupCode
  const {
    data: fetchedArrivals = [],
    isLoading: isLoadingArrivals,
    refetch: refetchGroupArrivals,
  } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.groupArrivals.options(activeGroupCode),
    enabled: Boolean(isOpen && activeGroupCode.trim()),
    staleTime: 10_000,
  });

  // Query all rooms to match with active stays & current physical room numbers
  const { data: roomsPage, isLoading: isLoadingRooms } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      limit: 100,
    }),
    enabled: Boolean(isOpen),
    staleTime: 15_000,
  });

  // Consolidate group room items from arrivals & rooms
  const groupItems: GroupRoomItem[] = useMemo(
    () =>
      buildGroupRoomItems({
        activeGroupCode,
        initialArrivals,
        fetchedArrivals,
        rooms: roomsPage?.items || [],
      }),
    [activeGroupCode, initialArrivals, fetchedArrivals, roomsPage?.items],
  );

  // Aggregate stats
  const stats = useMemo(() => {
    const total = groupItems.length;
    let readyCheckIn = 0;
    let checkedIn = 0;
    let checkedOut = 0;
    let unassigned = 0;

    for (const item of groupItems) {
      if (item.status === "ARRIVAL_READY" || item.status === "CONFIRMED") {
        readyCheckIn++;
      } else if (item.status === "CHECKED_IN") {
        checkedIn++;
      } else if (item.status === "CHECKED_OUT") {
        checkedOut++;
      }
      if (!item.roomId) {
        unassigned++;
      }
    }

    const leadGuestName = groupItems[0]?.guestDisplayName || "Chưa xác định";
    const leadGuestPhone = groupItems.find((i) => i.guestPhone)?.guestPhone || null;

    return {
      total,
      readyCheckIn,
      checkedIn,
      checkedOut,
      unassigned,
      leadGuestName,
      leadGuestPhone,
    };
  }, [groupItems]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === groupItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(groupItems.map((item) => item.reservationId)));
    }
  };

  const handleSelectCheckInReady = () => {
    const ids = new Set<string>();
    for (const item of groupItems) {
      if ((item.status === "ARRIVAL_READY" || item.status === "CONFIRMED") && Boolean(item.roomId)) {
        ids.add(item.reservationId);
      }
    }
    setSelectedIds(ids);
  };

  const handleSelectCheckedIn = () => {
    const ids = new Set<string>();
    for (const item of groupItems) {
      if (item.status === "CHECKED_IN" && Boolean(item.activeStayId || item.stayId)) {
        ids.add(item.reservationId);
      }
    }
    setSelectedIds(ids);
  };

  const handleToggleRow = (reservationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reservationId)) {
        next.delete(reservationId);
      } else {
        next.add(reservationId);
      }
      return next;
    });
  };

  // Perform Batch Check-in
  const handleBatchCheckIn = async () => {
    const targetItems = groupItems.filter(
      (item) =>
        selectedIds.has(item.reservationId) &&
        (item.status === "ARRIVAL_READY" || item.status === "CONFIRMED"),
    );

    if (targetItems.length === 0) {
      await showWarningAlert(
        "Chưa chọn phòng phù hợp",
        "Vui lòng chọn ít nhất một phòng có trạng thái chờ nhận phòng để thực hiện nhận phòng hàng loạt.",
      );
      return;
    }

    const unassignedItems = targetItems.filter((i) => !i.roomId);
    if (unassignedItems.length > 0) {
      await showWarningAlert(
        "Có phòng chưa phân bổ",
        `Có ${unassignedItems.length} phòng trong danh sách chọn chưa được gán số phòng cụ thể. Vui lòng gán phòng trước khi làm thủ tục nhận phòng.`,
      );
      return;
    }

    const roomNames = targetItems
      .map((i) => (i.roomNumber ? `Phòng ${i.roomNumber}` : i.reservationCode))
      .join(", ");

    const confirm = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận nhận phòng hàng loạt?",
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
          <p>Bạn đang chuẩn bị nhận phòng đồng thời cho <strong>${targetItems.length} phòng</strong> thuộc đoàn <strong>#${activeGroupCode}</strong>:</p>
          <div style="margin: 10px 0; padding: 10px; background-color: #f1f5f9; border-radius: 8px; font-weight: 600; color: #0f172a; max-height: 120px; overflow-y: auto;">
            ${roomNames}
          </div>
          <p style="color: #64748b; font-size: 13px;">Hệ thống sẽ kích hoạt lưu trú và cấp mã truy cập số GuestOS cho từng phòng.</p>
        </div>
      `,
      confirmText: `Nhận phòng ${targetItems.length} phòng`,
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: targetItems.length });

    let successCount = 0;
    let failCount = 0;
    const newResults: Record<string, BatchOperationResult> = { ...resultsMap };

    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];
      setProcessingProgress({ current: i + 1, total: targetItems.length });

      try {
        const result = await staffRoomsRepository.checkInReservation(
          hotelId,
          item.reservationId,
          {
            guestDisplayName: item.guestDisplayName,
            ...(item.guestPhone ? { guestPhone: item.guestPhone } : {}),
            expectedRoomId: item.roomId,
            allowEarlyCheckIn: true,
            confirmEarlyCheckIn: true,
            allowLateCheckIn: true,
            confirmLateCheckIn: true,
          },
        );

        successCount++;
        item.status = "CHECKED_IN";
        item.stayId = result.stayId;
        item.activeStayId = result.stayId;

        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: true,
          message: `Nhận phòng thành công${result.accessCode ? ` · Mã GuestOS: ${result.accessCode}` : ""}`,
          action: "CHECK_IN",
          timestamp: Date.now(),
        };
      } catch (err: unknown) {
        failCount++;
        const friendlyMsg = formatFriendlyCheckInError(err) || (err instanceof Error ? err.message : "Thất bại khi nhận phòng");

        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: false,
          message: friendlyMsg,
          action: "CHECK_IN",
          timestamp: Date.now(),
        };
      }
    }

    setResultsMap(newResults);
    setIsProcessing(false);
    setProcessingProgress(null);

    await invalidateHotelRealtimeQueries(queryClient, hotelId);
    void refetchGroupArrivals();

    if (failCount === 0) {
      await showSuccessAlert(
        "Nhận phòng hàng loạt thành công",
        `Đã hoàn tất nhận phòng thành công cho toàn bộ ${successCount} phòng đã chọn thuộc đoàn #${activeGroupCode}.`,
      );
    } else {
      await showWarningAlert(
        "Hoàn tất thao tác hàng loạt",
        `Đã xử lý xong: ${successCount} phòng thành công, ${failCount} phòng gặp sự cố. Bạn có thể xem nguyên nhân lỗi chi tiết ngay trong danh sách phòng bên dưới.`,
      );
    }
  };

  // Perform Batch Check-out
  const handleBatchCheckOut = async () => {
    const targetItems = groupItems.filter(
      (item) => selectedIds.has(item.reservationId) && item.status === "CHECKED_IN",
    );

    if (targetItems.length === 0) {
      await showWarningAlert(
        "Chưa chọn phòng phù hợp",
        "Vui lòng chọn ít nhất một phòng đang lưu trú để thực hiện trả phòng hàng loạt.",
      );
      return;
    }

    const missingStayItems = targetItems.filter((i) => !(i.activeStayId || i.stayId));
    if (missingStayItems.length > 0) {
      await showWarningAlert(
        "Thiếu thông tin lưu trú",
        `Có ${missingStayItems.length} phòng chưa đồng bộ mã lưu trú. Vui lòng kiểm tra lại trạng thái phòng trên sơ đồ.`,
      );
      return;
    }

    const roomNames = targetItems
      .map((i) => (i.roomNumber ? `Phòng ${i.roomNumber}` : i.reservationCode))
      .join(", ");

    const confirm = await showConfirmDialog({
      icon: "warning",
      title: "Xác nhận trả phòng hàng loạt?",
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
          <p>Bạn đang chuẩn bị trả phòng đồng thời cho <strong>${targetItems.length} phòng</strong> thuộc đoàn <strong>#${activeGroupCode}</strong>:</p>
          <div style="margin: 10px 0; padding: 10px; background-color: #f1f5f9; border-radius: 8px; font-weight: 600; color: #0f172a; max-height: 120px; overflow-y: auto;">
            ${roomNames}
          </div>
          <p style="color: #64748b; font-size: 13px;">Các phòng sau khi trả sẽ chuyển sang trạng thái chờ dọn dẹp để phục vụ lượt khách kế tiếp.</p>
        </div>
      `,
      confirmText: `Trả phòng ${targetItems.length} phòng`,
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: targetItems.length });

    let successCount = 0;
    let failCount = 0;
    const newResults: Record<string, BatchOperationResult> = { ...resultsMap };

    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];
      const targetStayId = item.activeStayId || item.stayId;
      if (!targetStayId) continue;

      setProcessingProgress({ current: i + 1, total: targetItems.length });

      try {
        await staffRoomsRepository.checkOutStay(hotelId, targetStayId, {
          nextRoomStatus: "PROCESSING",
        });

        successCount++;
        item.status = "CHECKED_OUT";

        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: true,
          message: "Trả phòng thành công, phòng chuyển sang chờ dọn",
          action: "CHECK_OUT",
          timestamp: Date.now(),
        };
      } catch (err: unknown) {
        failCount++;
        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: false,
          message: err instanceof Error ? err.message : "Thất bại khi trả phòng",
          action: "CHECK_OUT",
          timestamp: Date.now(),
        };
      }
    }

    setResultsMap(newResults);
    setIsProcessing(false);
    setProcessingProgress(null);

    await invalidateHotelRealtimeQueries(queryClient, hotelId);
    void refetchGroupArrivals();

    if (failCount === 0) {
      await showSuccessAlert(
        "Trả phòng hàng loạt thành công",
        `Đã hoàn tất trả phòng thành công cho toàn bộ ${successCount} phòng đã chọn thuộc đoàn #${activeGroupCode}.`,
      );
    } else {
      await showWarningAlert(
        "Hoàn tất thao tác hàng loạt",
        `Đã xử lý xong: ${successCount} phòng trả thành công, ${failCount} phòng gặp sự cố. Vui lòng kiểm tra hóa đơn hoặc công nợ của phòng bị lỗi.`,
      );
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = searchInput.trim();
    if (!cleanCode) return;
    setActiveGroupCode(cleanCode);
    setSelectedIds(new Set());
    setResultsMap({});
  };

  if (!isOpen) {
    return null;
  }

  const isLoading = isLoadingArrivals || isLoadingRooms;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-4 sm:pl-10 pointer-events-none">
        <div
          ref={drawerRef}
          className="w-screen max-w-5xl bg-white shadow-2xl flex flex-col pointer-events-auto border-l border-slate-200"
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-2xs">
                <VsIcon name="groups" className="text-2xl" />
              </div>
              <div>
                <h2 id={titleId} className="text-lg font-black text-slate-900 text-balance">
                  Quản lý & Thao tác theo đoàn
                </h2>
                <p id={descId} className="text-xs text-slate-500 font-medium text-pretty">
                  Xem chi tiết phòng, nhận phòng hoặc trả phòng hàng loạt cho khách đoàn
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Đóng quản lý đoàn"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer min-h-[44px]"
            >
              <VsIcon name="close" className="text-2xl" />
            </button>
          </header>

          {/* Search bar & Group Selector */}
          <section className="p-5 border-b border-slate-200 bg-white shrink-0">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <VsIcon
                  name="search"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Nhập mã đoàn (VD: VSH_GROUP_0001, GRP-01)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!searchInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-2xs hover:bg-purple-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <VsIcon name="search" className="text-base" />
                <span>Tra cứu đoàn</span>
              </button>
              {activeGroupCode ? (
                <button
                  type="button"
                  onClick={() => {
                    void refetchGroupArrivals();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs min-h-[44px]"
                  title="Tải lại dữ liệu đoàn"
                >
                  <VsIcon name="refresh" className="text-base text-slate-500" />
                  <span>Đồng bộ</span>
                </button>
              ) : null}
            </form>
          </section>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/50">
            {activeGroupCode ? (
              <>
                {/* Group Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {/* Card 1: Mã & Tên đoàn */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      Mã đoàn
                    </span>
                    <div className="mt-1 font-mono text-base font-black text-purple-700 truncate">
                      #{activeGroupCode}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-600 truncate">
                      {stats.leadGuestName}
                    </div>
                  </div>

                  {/* Card 2: Tổng số phòng */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      Quy mô đoàn
                    </span>
                    <div className="mt-1 text-2xl font-black text-slate-900">
                      {stats.total}{" "}
                      <span className="text-xs font-semibold text-slate-500">phòng</span>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      {stats.leadGuestPhone ? `ĐT: ${stats.leadGuestPhone}` : "Không có SĐT"}
                    </div>
                  </div>

                  {/* Card 3: Sẵn sàng nhận phòng */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 whitespace-nowrap">
                      Chờ nhận phòng
                    </span>
                    <div className="mt-1 text-2xl font-black text-emerald-700">
                      {stats.readyCheckIn}{" "}
                      <span className="text-xs font-semibold text-emerald-800">phòng</span>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-emerald-700">
                      {stats.unassigned > 0 ? `(${stats.unassigned} chưa gán phòng)` : "Đã gán đủ phòng"}
                    </div>
                  </div>

                  {/* Card 4: Đang lưu trú */}
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-2xs">
                    <span className="text-xs font-semibold uppercase tracking-wider text-sky-800 whitespace-nowrap">
                      Đang lưu trú
                    </span>
                    <div className="mt-1 text-2xl font-black text-sky-700">
                      {stats.checkedIn}{" "}
                      <span className="text-xs font-semibold text-sky-800">phòng</span>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-sky-700">
                      Đã trả: {stats.checkedOut} phòng
                    </div>
                  </div>
                </div>

                {/* Batch Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  {/* Selection controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer min-h-[36px]"
                    >
                      <VsIcon
                        name={selectedIds.size === groupItems.length && groupItems.length > 0 ? "check_circle" : "radio_button_unchecked"}
                        className="text-base text-slate-500"
                      />
                      <span>
                        {selectedIds.size === groupItems.length && groupItems.length > 0
                          ? "Bỏ chọn tất cả"
                          : "Chọn tất cả"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectCheckInReady}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer min-h-[36px]"
                    >
                      <span>Chọn phòng chờ nhận ({stats.readyCheckIn})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectCheckedIn}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition cursor-pointer min-h-[36px]"
                    >
                      <span>Chọn phòng đang ở ({stats.checkedIn})</span>
                    </button>

                    <span className="text-xs font-bold text-slate-500 ml-1 whitespace-nowrap">
                      Đã chọn: <span className="text-purple-700 font-black">{selectedIds.size}</span>/{groupItems.length}
                    </span>
                  </div>

                  {/* Batch Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {canCheckInStay && (
                      <button
                        type="button"
                        onClick={handleBatchCheckIn}
                        disabled={isProcessing || selectedIds.size === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                      >
                        <VsIcon name="login" className="text-base" />
                        <span>Nhận phòng hàng loạt</span>
                      </button>
                    )}

                    {canCheckOutStay && (
                      <button
                        type="button"
                        onClick={handleBatchCheckOut}
                        disabled={isProcessing || selectedIds.size === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                      >
                        <VsIcon name="logout" className="text-base" />
                        <span>Trả phòng hàng loạt</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar during batch operations */}
                {isProcessing && processingProgress && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                      <span>Đang thực hiện thao tác hàng loạt...</span>
                      <span>
                        {processingProgress.current} / {processingProgress.total} phòng
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-200"
                        style={{
                          width: `${Math.round((processingProgress.current / processingProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Detailed Room Table */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th scope="col" className="w-10 px-4 py-3 text-center">
                            <span className="sr-only">Chọn</span>
                          </th>
                          <th scope="col" className="px-4 py-3 whitespace-nowrap">Phòng & Hạng phòng</th>
                          <th scope="col" className="px-4 py-3">Khách lưu trú</th>
                          <th scope="col" className="px-4 py-3 whitespace-nowrap">Lịch trình</th>
                          <th scope="col" className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                          <th scope="col" className="px-4 py-3 whitespace-nowrap">Kết quả thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {isLoading && groupItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                              Đang tải dữ liệu danh sách phòng của đoàn...
                            </td>
                          </tr>
                        ) : groupItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                              Không tìm thấy phòng nào thuộc mã đoàn #{activeGroupCode}. Bạn vui lòng kiểm tra lại mã đoàn.
                            </td>
                          </tr>
                        ) : (
                          groupItems.map((item) => {
                            const isSelected = selectedIds.has(item.reservationId);
                            const result = resultsMap[item.reservationId];

                            return (
                              <tr
                                key={item.reservationId}
                                className={`transition-colors hover:bg-slate-50/80 ${
                                  isSelected ? "bg-purple-50/40" : ""
                                }`}
                              >
                                {/* Checkbox */}
                                <td className="px-4 py-3 align-middle text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleRow(item.reservationId)}
                                    aria-label={`Chọn phòng ${item.roomNumber || item.reservationCode}`}
                                    className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                  />
                                </td>

                                {/* Phòng & Hạng phòng */}
                                <td className="px-4 py-3 align-middle whitespace-nowrap">
                                  {item.roomNumber ? (
                                    <div className="font-bold text-slate-900 text-sm">
                                      Phòng {item.roomNumber}
                                      {item.floor ? (
                                        <span className="text-xs font-normal text-slate-500 ml-1">
                                          (Tầng {item.floor})
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                      Chưa gán phòng
                                    </span>
                                  )}
                                  <div className="text-xs font-medium text-slate-500 mt-0.5">
                                    {item.roomType || "Tiêu chuẩn"} · {formatMoney(item.rate)}
                                  </div>
                                </td>

                                {/* Khách lưu trú */}
                                <td className="px-4 py-3 align-middle">
                                  <div className="font-bold text-slate-900 text-sm">
                                    {item.guestDisplayName}
                                  </div>
                                  <div className="text-xs text-slate-500 font-medium">
                                    <span className="font-mono text-blue-700">#{item.reservationCode}</span>
                                    {item.guestPhone ? <span> · {item.guestPhone}</span> : null}
                                  </div>
                                </td>

                                {/* Lịch trình */}
                                <td className="px-4 py-3 align-middle whitespace-nowrap text-xs text-slate-700 font-medium">
                                  <div>Nhận: {formatDateTime(item.plannedCheckInAt)}</div>
                                  <div>Trả: {formatDateTime(item.plannedCheckOutAt)}</div>
                                </td>

                                {/* Trạng thái */}
                                <td className="px-4 py-3 align-middle whitespace-nowrap">
                                  {(() => {
                                    switch (item.status) {
                                      case "CHECKED_IN":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                            <span>Đang ở</span>
                                          </span>
                                        );
                                      case "CHECKED_OUT":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                            <span>Đã trả phòng</span>
                                          </span>
                                        );
                                      case "ARRIVAL_READY":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span>Sẵn sàng nhận</span>
                                          </span>
                                        );
                                      case "CONFIRMED":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-800 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                            <span>Đã xác nhận</span>
                                          </span>
                                        );
                                      case "CANCELLED":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                            <span>Đã hủy</span>
                                          </span>
                                        );
                                      default:
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                                            <span>{item.status}</span>
                                          </span>
                                        );
                                    }
                                  })()}
                                </td>

                                {/* Kết quả thao tác */}
                                <td className="px-4 py-3 align-middle text-xs">
                                  {result ? (
                                    result.success ? (
                                      <div className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                                        <VsIcon name="check_circle" className="text-base text-emerald-600 shrink-0" />
                                        <span className="truncate max-w-[200px]" title={result.message}>
                                          {result.message}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 text-rose-700 font-bold">
                                        <VsIcon name="warning" className="text-base text-rose-600 shrink-0" />
                                        <span className="truncate max-w-[200px]" title={result.message}>
                                          {result.message}
                                        </span>
                                      </div>
                                    )
                                  ) : (
                                    <span className="text-slate-400 font-medium">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              /* Empty state when no group code is specified */
              <div className="mx-auto max-w-md py-16 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                  <VsIcon name="groups" className="text-3xl" />
                </div>
                <h3 className="text-base font-bold text-slate-900 text-balance">
                  Chưa nhập mã đoàn lưu trú
                </h3>
                <p className="text-xs text-slate-500 text-pretty leading-relaxed">
                  Vui lòng nhập mã đoàn vào thanh tìm kiếm ở trên hoặc mở từ một đặt phòng thuộc đoàn để quản lý và thực hiện các thao tác hàng loạt.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
