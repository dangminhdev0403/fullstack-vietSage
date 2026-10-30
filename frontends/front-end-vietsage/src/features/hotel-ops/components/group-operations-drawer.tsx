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
  escapeHtml,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";
import { BookingConfirmationModal } from "./booking-confirmation-modal";
import { GroupCheckInModal } from "./group-check-in-modal";

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
  roomStatus?: string | null;
  hasQr?: boolean;
  qrStatus?: string | null;
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
      const arrRoom = arr.room;
      const roomStatus = arrRoom?.status || arrRoom?.physicalStatus || null;
      const qrStatus = arrRoom?.qr?.status || arrRoom?.qrStatus || null;
      const hasQr = arrRoom?.qr
        ? arrRoom.qr.status !== "REVOKED"
        : arrRoom?.qrStatus
          ? arrRoom.qrStatus !== "REVOKED"
          : true;

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
        roomStatus,
        hasQr,
        qrStatus,
      });
    }
  }

  // Merge from fetched arrivals (authoritative endpoint)
  for (const item of fetchedArrivals) {
    const existing = map.get(item.id);
    const resolvedActiveStayId = item.activeStayId ?? existing?.activeStayId ?? undefined;
    const itemRoom = item.room;
    const roomStatus = itemRoom?.status || itemRoom?.physicalStatus || existing?.roomStatus || null;
    const qrStatus = itemRoom?.qr?.status || itemRoom?.qrStatus || existing?.qrStatus || null;
    const hasQr = itemRoom?.qr
      ? itemRoom.qr.status !== "REVOKED"
      : itemRoom?.qrStatus
        ? itemRoom.qrStatus !== "REVOKED"
        : existing?.hasQr ?? true;

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
      roomStatus,
      hasQr,
      qrStatus,
    });
  }

  // Fallback enrichment from rooms list in case activeStayId was not yet populated
  for (const room of rooms) {
    const qrStatus = room.qr?.status || room.qrStatus || null;
    const hasQr = room.qr
      ? room.qr.status !== "REVOKED"
      : room.qrStatus
        ? room.qrStatus !== "REVOKED"
        : true;

    for (const item of map.values()) {
      if (item.roomId === room.id || (room.roomNumber && item.roomNumber === room.roomNumber)) {
        item.roomId = room.id;
        item.roomNumber = room.roomNumber || item.roomNumber;
        item.floor = room.floor || item.floor;
        item.roomType = room.type || room.roomTypeName || item.roomType;
        item.roomStatus = room.status || room.physicalStatus || item.roomStatus;
        item.qrStatus = qrStatus ?? item.qrStatus;
        if (room.qr || room.qrStatus) {
          item.hasQr = hasQr;
        }
      }
    }

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
          item.roomStatus = room.status || room.physicalStatus || item.roomStatus;
          item.qrStatus = qrStatus ?? item.qrStatus;
          if (room.qr || room.qrStatus) {
            item.hasQr = hasQr;
          }
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
        existing.roomStatus = room.status || room.physicalStatus || existing.roomStatus;
        existing.qrStatus = qrStatus ?? existing.qrStatus;
        if (room.qr || room.qrStatus) {
          existing.hasQr = hasQr;
        }
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
          roomStatus: room.status || room.physicalStatus || null,
          qrStatus: qrStatus ?? null,
          hasQr,
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
  onSuccess?: () => void | Promise<void>;
};

function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "Chưa xác định";
  const d1 = formatDateOnly(from);
  const d2 = formatDateOnly(to);
  if (d1 === d2) return d1;
  return `${d1} → ${d2}`;
}

function calculateNights(from?: string | null, to?: string | null): number {
  if (!from || !to) return 1;
  const d1 = new Date(from).getTime();
  const d2 = new Date(to).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 <= d1) return 1;
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
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

function cleanGuestDisplayName(name?: string | null): string {
  if (!name) return "Khách đoàn";
  const cleaned = name.replace(/^OTA-[A-Za-z0-9._-]+-/i, "").trim();
  return cleaned || name;
}

function extractOtaSource(name?: string | null, groupCode?: string | null): string | null {
  if (groupCode && /^OTA-[A-Za-z0-9._-]+/i.test(groupCode)) {
    return groupCode.replace(/^OTA-/i, "");
  }
  const match = name?.match(/^OTA-([A-Za-z0-9._-]+)-/i);
  return match ? match[1] : null;
}

export function GroupOperationsDrawer({
  isOpen,
  onClose,
  hotelId,
  groupCode: initialGroupCode,
  initialArrivals = [],
  todayYmd: _propTodayYmd,
  canOperateArrivals = true,
  canCheckInStay = true,
  canCheckOutStay = true,
  triggerElementRef,
  onSuccess,
}: GroupOperationsDrawerProps) {
  const queryClient = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const [activeGroupCode, setActiveGroupCode] = useState<string>(initialGroupCode || "");
  const [searchInput, setSearchInput] = useState<string>(initialGroupCode || "");
  const [isSearchingManually, setIsSearchingManually] = useState<boolean>(!initialGroupCode);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "READY" | "IN_HOUSE" | "COMPLETED">("ALL");
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState<boolean>(false);

  // Batch operations & results
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resultsMap, setResultsMap] = useState<Record<string, BatchOperationResult>>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  // Group Check-in verification modal & API delegate
  const [isGroupCheckInOpen, setIsGroupCheckInOpen] = useState<boolean>(false);
  const [checkInTargetRooms, setCheckInTargetRooms] = useState<GroupRoomItem[]>([]);
  const executeCheckInReservation = staffRoomsRepository.checkInReservation;

  // Room Assignment sub-modal state
  const [assigningItem, setAssigningItem] = useState<GroupRoomItem | null>(null);
  const [targetRoomId, setTargetRoomId] = useState<string>("");
  const [isSubmittingRoom, setIsSubmittingRoom] = useState<boolean>(false);

  // Synchronize when initialGroupCode changes
  const [previousGroupCode, setPreviousGroupCode] = useState(initialGroupCode);
  if (previousGroupCode !== initialGroupCode) {
    setPreviousGroupCode(initialGroupCode);
    if (initialGroupCode) {
      setActiveGroupCode(initialGroupCode);
      setSearchInput(initialGroupCode);
      setIsSearchingManually(false);
    } else {
      setIsSearchingManually(true);
    }
  }

  // Keyboard accessibility and focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (assigningItem) {
          setAssigningItem(null);
          return;
        }
        onClose();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
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
  }, [isOpen, onClose, assigningItem]);

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

  // Query all rooms for physical status and room assignment options
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

  // Available vacant rooms for assignment
  const availableRooms = useMemo(() => {
    return (roomsPage?.items ?? []).filter(
      (r) => !r.activeStay && r.status !== "BLOCKED" && r.status !== "MAINTENANCE",
    );
  }, [roomsPage?.items]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = groupItems.length;
    let readyCheckIn = 0;
    let checkedIn = 0;
    let checkedOut = 0;
    let cancelled = 0;
    let unassigned = 0;
    let totalEstimatedAmount = 0;

    for (const item of groupItems) {
      if (item.status === "ARRIVAL_READY" || item.status === "CONFIRMED") {
        readyCheckIn++;
      } else if (item.status === "CHECKED_IN") {
        checkedIn++;
      } else if (item.status === "CHECKED_OUT") {
        checkedOut++;
      } else if (item.status === "CANCELLED") {
        cancelled++;
      }
      if (!item.roomId) {
        unassigned++;
      }
      const rateVal = Number(item.rate);
      if (Number.isFinite(rateVal)) {
        totalEstimatedAmount += rateVal;
      }
    }

    const leadGuestName = groupItems[0]?.guestDisplayName || "Chưa xác định";
    const leadGuestPhone = groupItems.find((i) => i.guestPhone)?.guestPhone || null;

    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;
    for (const item of groupItems) {
      if (item.plannedCheckInAt) {
        const d = new Date(item.plannedCheckInAt);
        if (!Number.isNaN(d.getTime())) {
          if (!earliestDate || d < earliestDate) earliestDate = d;
        }
      }
      if (item.plannedCheckOutAt) {
        const d = new Date(item.plannedCheckOutAt);
        if (!Number.isNaN(d.getTime())) {
          if (!latestDate || d > latestDate) latestDate = d;
        }
      }
    }

    const totalNights =
      earliestDate && latestDate && latestDate > earliestDate
        ? Math.max(1, Math.round((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

    return {
      total,
      readyCheckIn,
      checkedIn,
      checkedOut,
      cancelled,
      unassigned,
      leadGuestName,
      leadGuestPhone,
      totalEstimatedAmount,
      earliestFormatted: earliestDate ? formatDateOnly(earliestDate.toISOString()) : "—",
      latestFormatted: latestDate ? formatDateOnly(latestDate.toISOString()) : "—",
      totalNights,
    };
  }, [groupItems]);

  const cleanLeadName = cleanGuestDisplayName(stats.leadGuestName);
  const otaSource = extractOtaSource(stats.leadGuestName, activeGroupCode);

  // Filtered rows for the table
  const displayedItems = useMemo(() => {
    if (statusFilter === "READY") {
      return groupItems.filter(
        (i) => i.status === "ARRIVAL_READY" || i.status === "CONFIRMED",
      );
    }
    if (statusFilter === "IN_HOUSE") {
      return groupItems.filter((i) => i.status === "CHECKED_IN");
    }
    if (statusFilter === "COMPLETED") {
      return groupItems.filter(
        (i) => i.status === "CHECKED_OUT" || i.status === "CANCELLED" || i.status === "NO_SHOW",
      );
    }
    return groupItems;
  }, [groupItems, statusFilter]);

  // Selection actions
  const handleToggleRow = (resId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resId)) next.delete(resId);
      else next.add(resId);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === groupItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(groupItems.map((i) => i.reservationId)));
    }
  };

  const handleSelectCheckInReady = () => {
    const readyIds = groupItems
      .filter((i) => i.status === "ARRIVAL_READY" || i.status === "CONFIRMED")
      .map((i) => i.reservationId);
    setSelectedIds(new Set(readyIds));
  };

  const handleSelectCheckedIn = () => {
    const checkedInIds = groupItems
      .filter((i) => i.status === "CHECKED_IN")
      .map((i) => i.reservationId);
    setSelectedIds(new Set(checkedInIds));
  };

  // Perform Batch Check-in via Verification Modal
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

    // Open dedicated group check-in modal to verify CCCD/Passports
    setCheckInTargetRooms(targetItems);
    setIsGroupCheckInOpen(true);
  };

  // Perform Batch Check-out
  const handleBatchCheckOut = async () => {
    const targetItems = groupItems.filter(
      (item) => selectedIds.has(item.reservationId) && item.status === "CHECKED_IN",
    );

    if (targetItems.length === 0) {
      await showWarningAlert(
        "Chưa chọn phòng phù hợp",
        "Vui lòng chọn ít nhất một phòng đang ở để thực hiện trả phòng hàng loạt.",
      );
      return;
    }

    const missingStayItems = targetItems.filter((i) => !i.activeStayId && !i.stayId);
    if (missingStayItems.length > 0) {
      await showWarningAlert(
        "Thiếu thông tin lưu trú",
        `Có ${missingStayItems.length} phòng không tìm thấy mã lưu trú hợp lệ để trả phòng.`,
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
          <p>Bạn đang chuẩn bị trả phòng đồng thời cho <strong>${targetItems.length} phòng</strong> thuộc đoàn <strong>#${escapeHtml(activeGroupCode)}</strong>:</p>
          <div style="margin: 10px 0; padding: 10px; background-color: #f1f5f9; border-radius: 8px; font-weight: 600; color: #0f172a; max-height: 120px; overflow-y: auto;">
            ${escapeHtml(roomNames)}
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
      setProcessingProgress({ current: i + 1, total: targetItems.length });
      const targetStayId = item.activeStayId || item.stayId!;

      try {
        await staffRoomsRepository.checkOutStay(hotelId, targetStayId, {
          nextRoomStatus: "PROCESSING",
        });
        successCount++;
        item.status = "CHECKED_OUT";

        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: true,
          message: "Trả phòng thành công",
          action: "CHECK_OUT",
          timestamp: Date.now(),
        };
      } catch (err: unknown) {
        failCount++;
        const friendlyMsg = err instanceof Error ? err.message : "Thất bại khi trả phòng";
        newResults[item.reservationId] = {
          reservationId: item.reservationId,
          success: false,
          message: friendlyMsg,
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
    await onSuccess?.();

    if (failCount === 0) {
      await showSuccessAlert(
        "Hoàn tất trả phòng hàng loạt",
        `Đã trả phòng thành công cho ${successCount} phòng thuộc đoàn #${activeGroupCode}.`,
      );
    } else {
      await showWarningAlert(
        "Hoàn tất với một số lỗi",
        `Thành công: ${successCount} phòng, Thất bại: ${failCount} phòng. Bạn có thể xem chi tiết lỗi tại cột Kết quả thao tác.`,
      );
    }
  };

  // Individual Check-in Handler - Opens verification modal for the room
  const handleCheckInSingle = async (item: GroupRoomItem) => {
    if (!item.roomId) {
      await showWarningAlert(
        "Chưa gán phòng",
        `Phòng của khách ${item.guestDisplayName} chưa được gán số phòng cụ thể. Vui lòng bấm "Gán phòng" trước khi nhận phòng.`,
      );
      return;
    }

    // Open verification modal for this single room
    setCheckInTargetRooms([item]);
    setIsGroupCheckInOpen(true);
  };

  // Individual Check-out Handler
  const handleCheckOutSingle = async (item: GroupRoomItem) => {
    const targetStayId = item.activeStayId || item.stayId;
    if (!targetStayId) {
      await showWarningAlert(
        "Thiếu thông tin lưu trú",
        "Không tìm thấy mã lưu trú của phòng này. Vui lòng kiểm tra lại trên sơ đồ phòng.",
      );
      return;
    }

    const roomLabel = item.roomNumber ? `Phòng ${item.roomNumber}` : item.reservationCode;

    const confirm = await showConfirmDialog({
      icon: "warning",
      title: "Xác nhận trả phòng?",
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
          <p>Xác nhận trả phòng cho khách <strong>${escapeHtml(item.guestDisplayName)}</strong> (${escapeHtml(roomLabel)})?</p>
          <p style="color: #64748b; font-size: 12px; margin-top: 8px;">Phòng sau khi trả sẽ chuyển sang trạng thái chờ dọn dẹp để phục vụ lượt khách kế tiếp.</p>
        </div>
      `,
      confirmText: "Trả phòng",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setActionInProgressId(item.reservationId);
    try {
      await staffRoomsRepository.checkOutStay(hotelId, targetStayId, {
        nextRoomStatus: "PROCESSING",
      });

      await showSuccessAlert(
        "Trả phòng thành công",
        `Đã hoàn tất trả phòng cho ${roomLabel}. Phòng đã chuyển sang trạng thái chờ dọn dẹp.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchGroupArrivals();
      await onSuccess?.();
    } catch (err: unknown) {
      await showErrorAlert(
        "Không thể trả phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi làm thủ tục trả phòng.",
      );
    } finally {
      setActionInProgressId(null);
    }
  };

  // Open Room Assignment Sub-Dialog
  const handleOpenAssignModal = (item: GroupRoomItem) => {
    setAssigningItem(item);
    setTargetRoomId(item.roomId || "");
  };

  // Submit Room Assignment
  const handleConfirmRoomAssignment = async () => {
    if (!assigningItem || !targetRoomId) {
      await showWarningAlert("Chưa chọn phòng", "Vui lòng chọn một phòng khả dụng từ danh sách.");
      return;
    }

    const chosenRoom = availableRooms.find((r) => r.id === targetRoomId);
    const roomName = chosenRoom ? `Phòng ${chosenRoom.roomNumber}` : "Phòng đã chọn";

    setIsSubmittingRoom(true);
    try {
      await staffRoomsRepository.assignReservationRoom(hotelId, assigningItem.reservationId, {
        roomId: targetRoomId,
      });

      await showSuccessAlert(
        "Gán phòng thành công",
        `Đã gán ${roomName} cho khách ${assigningItem.guestDisplayName}.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchGroupArrivals();
      setAssigningItem(null);
      await onSuccess?.();
    } catch (err: unknown) {
      await showErrorAlert(
        "Không thể gán phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gán phòng cho khách.",
      );
    } finally {
      setIsSubmittingRoom(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = searchInput.trim();
    if (!cleanCode) return;
    setActiveGroupCode(cleanCode);
    setIsSearchingManually(false);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Horizontal Modal Container (Box Ngang) */}
      <div
        ref={modalRef}
        className="relative z-10 flex flex-col w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto"
      >
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs whitespace-nowrap"
              title="Quay lại danh sách"
            >
              <VsIcon name="arrow_back" className="text-base text-slate-600" />
              <span>Quay lại danh sách</span>
            </button>
            <div className="h-6 w-px bg-slate-300 shrink-0 hidden sm:block" />
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-2xs">
              <VsIcon name="groups" className="text-2xl" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-lg font-black text-slate-900 text-balance truncate">
                  {activeGroupCode ? `Chi tiết đoàn khách · #${activeGroupCode}` : "Chi tiết đoàn khách"}
                </h2>
                {otaSource ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 whitespace-nowrap">
                    Kênh {otaSource}
                  </span>
                ) : null}
              </div>
              <p id={descId} className="text-xs text-slate-500 font-medium text-pretty truncate">
                Danh sách phân bổ buồng phòng và quản lý nghiệp vụ đoàn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeGroupCode ? (
              <>
                <button
                  type="button"
                  onClick={() => void refetchGroupArrivals()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Tải lại dữ liệu đoàn"
                >
                  <VsIcon name="refresh" className={`text-base text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Đồng bộ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmationModalOpen(true)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-2 text-xs font-bold text-purple-800 transition cursor-pointer shadow-2xs whitespace-nowrap"
                  title="In bản xác nhận đặt phòng đoàn"
                >
                  <VsIcon name="print" className="text-base text-purple-700" />
                  <span className="hidden sm:inline">In xác nhận</span>
                </button>
              </>
            ) : null}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Quay lại danh sách"
              title="Quay lại danh sách"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer min-h-[40px]"
            >
              <VsIcon name="close" className="text-2xl" />
            </button>
          </div>
        </header>

        {/* Optional Manual Search Bar (only shown when no initialGroupCode or when user wants to change group) */}
        {isSearchingManually ? (
          <section className="px-6 py-3.5 border-b border-slate-200 bg-white shrink-0">
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
                  placeholder="Nhập mã đoàn (VD: OTA-Booking.com, GRP-01)..."
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
                  onClick={() => setIsSearchingManually(false)}
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[44px]"
                >
                  <span>Thu gọn</span>
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/50">
          {activeGroupCode ? (
            <>
              {/* Unified Group Overview Card (Thống nhất UI, loại bỏ trùng lặp) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Left: Lead Guest & Schedule */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-800 font-mono whitespace-nowrap">
                        #{activeGroupCode}
                      </span>
                      {otaSource ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 whitespace-nowrap">
                          OTA {otaSource}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          Đoàn khách
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-xl font-black text-slate-900 text-balance">
                        {cleanLeadName}
                      </h3>
                      {stats.leadGuestPhone ? (
                        <span className="text-xs font-semibold text-slate-500">
                          SĐT: {stats.leadGuestPhone}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-500">Lịch trình chung:</span>
                      <strong className="text-slate-800">
                        {stats.earliestFormatted} → {stats.latestFormatted}
                      </strong>
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700">
                        {stats.totalNights} đêm
                      </span>
                    </div>
                  </div>

                  {/* Right: Key Group Metrics */}
                  <div className="grid grid-cols-3 gap-3 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-5">
                    {/* Quy mô phòng */}
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Quy mô đoàn
                      </span>
                      <div className="text-xl font-black text-slate-900">
                        {stats.total} <span className="text-xs font-semibold text-slate-500">phòng</span>
                      </div>
                      <div className="text-xs">
                        {stats.unassigned > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {stats.unassigned} chưa gán
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Đã gán đủ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tiến độ đón */}
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Tiến độ lưu trú
                      </span>
                      <div className="text-xs font-bold text-slate-800 space-y-0.5">
                        <div className="text-emerald-700">{stats.readyCheckIn} chờ nhận</div>
                        <div className="text-sky-700">{stats.checkedIn} đang ở</div>
                      </div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">
                        {stats.checkedOut} đã trả
                      </div>
                    </div>

                    {/* Tạm tính */}
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Tổng tiền phòng
                      </span>
                      <div className="text-xl font-black text-amber-700 truncate">
                        {formatMoney(stats.totalEstimatedAmount)}
                      </div>
                      <div className="text-xs text-slate-500">Tạm tính toàn đoàn</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Streamlined Filter & Batch Operations Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs">
                {/* Left: Filter tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "ALL"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>Tất cả ({groupItems.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter("READY")}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "READY"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Chờ nhận ({stats.readyCheckIn})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter("IN_HOUSE")}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "IN_HOUSE"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    <span>Đang ở ({stats.checkedIn})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter("COMPLETED")}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "COMPLETED"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Đã trả ({stats.checkedOut + stats.cancelled})</span>
                  </button>
                </div>

                {/* Right: Batch operations (only relevant if multiple rooms or when selected) */}
                <div className="flex flex-wrap items-center gap-2">
                  {stats.total > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer whitespace-nowrap"
                      >
                        <span>{selectedIds.size === groupItems.length ? "Bỏ chọn" : "Chọn tất cả"}</span>
                      </button>

                      {stats.readyCheckIn > 0 ? (
                        <button
                          type="button"
                          onClick={handleSelectCheckInReady}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer whitespace-nowrap"
                        >
                          <span>Chọn chờ nhận ({stats.readyCheckIn})</span>
                        </button>
                      ) : null}

                      {stats.checkedIn > 0 ? (
                        <button
                          type="button"
                          onClick={handleSelectCheckedIn}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition cursor-pointer whitespace-nowrap"
                        >
                          <span>Chọn đang ở ({stats.checkedIn})</span>
                        </button>
                      ) : null}

                      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        Đã chọn: <strong className="text-purple-700">{selectedIds.size}</strong>/{groupItems.length}
                      </span>

                      {canCheckInStay && selectedIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleBatchCheckIn}
                          disabled={isProcessing}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          <VsIcon name="login" className="text-base" />
                          <span>Nhận phòng ({selectedIds.size})</span>
                        </button>
                      )}

                      {canCheckOutStay && selectedIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleBatchCheckOut}
                          disabled={isProcessing}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          <VsIcon name="logout" className="text-base" />
                          <span>Trả phòng ({selectedIds.size})</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                      Hiển thị <strong>{displayedItems.length}</strong> phòng
                    </span>
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
                  <table className="w-full min-w-[850px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <th scope="col" className="w-10 px-4 py-3 text-center">
                          <span className="sr-only">Chọn</span>
                        </th>
                        <th scope="col" className="px-4 py-3 whitespace-nowrap">
                          Phòng & Tiền phòng
                        </th>
                        <th scope="col" className="px-4 py-3 whitespace-nowrap">
                          Khách lưu trú
                        </th>
                        <th scope="col" className="px-4 py-3 whitespace-nowrap">
                          Trạng thái & Kết quả
                        </th>
                        <th scope="col" className="w-56 px-4 py-3 text-right whitespace-nowrap">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {isLoading && groupItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-sm font-medium text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <VsIcon name="refresh" className="h-6 w-6 animate-spin text-purple-600" />
                              <span>Đang tải thông tin chi tiết danh sách phòng...</span>
                            </div>
                          </td>
                        </tr>
                      ) : displayedItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-sm font-medium text-slate-500">
                            Không có phòng nào phù hợp với bộ lọc hiện tại.
                          </td>
                        </tr>
                      ) : (
                        displayedItems.map((item) => {
                          const isActingOnThis = actionInProgressId === item.reservationId;
                          const isSelected = selectedIds.has(item.reservationId);
                          const result = resultsMap[item.reservationId];

                          return (
                            <tr
                              key={item.reservationId}
                              className={`transition-colors ${isSelected ? "bg-purple-50/40" : "hover:bg-slate-50/70"}`}
                            >
                              {/* Checkbox */}
                              <td className="px-4 py-3.5 align-middle text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleRow(item.reservationId)}
                                  aria-label={`Chọn phòng ${item.roomNumber || item.reservationCode}`}
                                  className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                              </td>

                              {/* Phòng & Tiền phòng */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {item.roomNumber ? (
                                    <span className="font-bold text-slate-900 text-sm">
                                      Phòng {item.roomNumber}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 whitespace-nowrap">
                                      Chưa gán phòng
                                    </span>
                                  )}
                                  {item.roomType ? (
                                    <span className="text-xs font-medium text-slate-500">
                                      · {item.roomType}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 text-xs font-bold text-amber-700">
                                  {formatMoney(item.rate)}
                                </div>
                              </td>

                              {/* Khách lưu trú */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                                <div className="font-bold text-slate-900 text-sm">
                                  {cleanGuestDisplayName(item.guestDisplayName)}
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500 font-medium">
                                  <span className="font-mono text-purple-700 font-semibold">#{item.reservationCode}</span>
                                  {item.guestPhone ? <span> · {item.guestPhone}</span> : null}
                                </div>
                              </td>

                              {/* Trạng thái & Kết quả */}
                              <td className="px-4 py-3.5 align-middle whitespace-nowrap space-y-1">
                                <div>
                                  {(() => {
                                    switch (item.status) {
                                      case "CHECKED_IN":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800 whitespace-nowrap">
                                            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                            <span>Đang lưu trú</span>
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
                                      case "NO_SHOW":
                                        return (
                                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 whitespace-nowrap">
                                            <span>Vắng mặt</span>
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
                                </div>
                                {result ? (
                                  <div>
                                    {result.success ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                                        <VsIcon name="check_circle" className="text-xs text-emerald-600 shrink-0" />
                                        <span>{result.message}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-800 whitespace-nowrap">
                                        <VsIcon name="warning" className="text-xs text-rose-600 shrink-0" />
                                        <span>{result.message}</span>
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </td>

                              {/* Thao tác tương ứng với trạng thái */}
                              <td className="w-56 px-4 py-3.5 align-middle text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Thao tác cho phòng Chờ nhận / Đã xác nhận */}
                                  {(item.status === "ARRIVAL_READY" || item.status === "CONFIRMED") && (
                                    <>
                                      {item.roomId ? (
                                        <>
                                          {canCheckInStay && (
                                            <button
                                              type="button"
                                              disabled={isActingOnThis}
                                              onClick={() => void handleCheckInSingle(item)}
                                              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                              title={`Nhận phòng ${item.roomNumber}`}
                                            >
                                              <VsIcon name="login" className="text-base" />
                                              <span>Nhận phòng</span>
                                            </button>
                                          )}
                                          {canOperateArrivals && (
                                            <button
                                              type="button"
                                              disabled={isActingOnThis}
                                              onClick={() => handleOpenAssignModal(item)}
                                              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                              title="Đổi sang số phòng khác"
                                            >
                                              <VsIcon name="swap_horiz" className="text-base text-slate-500" />
                                              <span>Đổi phòng</span>
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        canOperateArrivals && (
                                          <button
                                            type="button"
                                            disabled={isActingOnThis}
                                            onClick={() => handleOpenAssignModal(item)}
                                            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                            title="Gán số phòng cụ thể cho khách này"
                                          >
                                            <VsIcon name="meeting_room" className="text-base" />
                                            <span>Gán phòng</span>
                                          </button>
                                        )
                                      )}
                                    </>
                                  )}

                                  {/* Thao tác cho phòng Đang lưu trú */}
                                  {item.status === "CHECKED_IN" && canCheckOutStay && (
                                    <button
                                      type="button"
                                      disabled={isActingOnThis}
                                      onClick={() => void handleCheckOutSingle(item)}
                                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                      title={`Làm thủ tục trả phòng ${item.roomNumber}`}
                                    >
                                      <VsIcon name="logout" className="text-base" />
                                      <span>Trả phòng</span>
                                    </button>
                                  )}

                                  {/* Đã trả phòng hoặc đã hủy */}
                                  {item.status === "CHECKED_OUT" && (
                                    <span className="text-xs font-medium text-slate-400">
                                      Đã hoàn tất
                                    </span>
                                  )}
                                  {item.status === "CANCELLED" && (
                                    <span className="text-xs font-medium text-rose-500">
                                      Đã hủy
                                    </span>
                                  )}
                                  {item.status === "NO_SHOW" && (
                                    <span className="text-xs font-medium text-slate-400">
                                      Vắng mặt
                                    </span>
                                  )}
                                </div>
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
                Chưa chọn đoàn khách
              </h3>
              <p className="text-xs text-slate-500 text-pretty leading-relaxed">
                Vui lòng nhập mã đoàn vào ô tìm kiếm ở trên hoặc mở trực tiếp từ danh sách Quản lý đoàn để xem chi tiết và thực hiện thao tác.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
          >
            <VsIcon name="arrow_back" className="text-base text-slate-600" />
            <span>Quay lại</span>
          </button>
          <div className="text-xs font-medium text-slate-500">
            Nhấn phím <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 font-mono text-xs">Esc</kbd> hoặc nút &quot;Quay lại&quot; để trở về danh sách
          </div>
        </footer>
      </div>

      {/* Room Assignment Sub-Modal (Centered Horizontal Modal Box Ngang) */}
      {assigningItem ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <VsIcon name="meeting_room" className="text-xl" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {assigningItem.roomId ? "Đổi số phòng" : "Gán phòng cho khách"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Khách: {assigningItem.guestDisplayName} · #{assigningItem.reservationCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningItem(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="assign-room-select"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Chọn phòng trống khả dụng:
                </label>
                {availableRooms.length === 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                    Hiện không có phòng nào ở trạng thái trống khả dụng. Vui lòng kiểm tra lại trên sơ đồ phòng.
                  </div>
                ) : (
                  <select
                    id="assign-room-select"
                    value={targetRoomId}
                    onChange={(e) => setTargetRoomId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="">-- Vui lòng chọn phòng trống --</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Phòng {r.roomNumber} · {r.type || "Tiêu chuẩn"} {r.floor ? `(Tầng ${r.floor})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {assigningItem.roomType ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  <p>
                    <strong>Hạng phòng đăng ký:</strong> {assigningItem.roomType}
                  </p>
                  <p>
                    <strong>Lịch trình:</strong> {formatDateRange(assigningItem.plannedCheckInAt, assigningItem.plannedCheckOutAt)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={isSubmittingRoom}
                onClick={() => setAssigningItem(null)}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSubmittingRoom || !targetRoomId}
                onClick={() => void handleConfirmRoomAssignment()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <VsIcon name="check" className="text-base" />
                <span>{isSubmittingRoom ? "Đang xử lý..." : "Xác nhận gán phòng"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Booking Confirmation Print Modal */}
      {activeGroupCode && (
        <BookingConfirmationModal
          isOpen={isConfirmationModalOpen}
          onClose={() => setIsConfirmationModalOpen(false)}
          hotelId={hotelId}
          groupCode={activeGroupCode}
          mode="group"
        />
      )}

      {/* Dedicated Group Check-in with CCCD/Passport Verification */}
      {isGroupCheckInOpen && activeGroupCode && (
        <GroupCheckInModal
          isOpen={isGroupCheckInOpen}
          onClose={() => {
            setIsGroupCheckInOpen(false);
            setCheckInTargetRooms([]);
          }}
          hotelId={hotelId}
          groupCode={activeGroupCode}
          rooms={checkInTargetRooms}
          onBatchResults={(batchRes) => {
            setResultsMap((prev) => ({ ...prev, ...batchRes }));
          }}
          onSuccess={async () => {
            void refetchGroupArrivals();
            await onSuccess?.();
          }}
        />
      )}
    </div>
  );
}

export const GroupDetailModal = GroupOperationsDrawer;
