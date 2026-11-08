"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  CccdCheckInPanel,
  type CccdCheckInCapture,
} from "@/features/local-biometric/components/cccd-check-in-panel";
import { MobileCccdScan } from "@/features/local-biometric/components/mobile-cccd-scan";
import { DesktopDocumentOcrUpload } from "@/features/local-biometric/components/desktop-document-ocr-upload";
import {
  formatVnDateInput,
  toDisplayVnDate,
  toIsoDate,
} from "@/features/local-biometric/components/check-in-workspace";
import { matchBcaNationalityCode } from "@/features/local-biometric/utils/identity-document-ocr";
import {
  FRONTDESK_HN2N_CCCD_SCANNER,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";
import { kbttResource } from "@/features/kbtt/resources/kbtt-resource";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { checkInRecovery, formatFriendlyCheckInError, isEarlyCheckInError, isLateCheckInError } from "@/features/hotel-ops/utils/check-in-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { RoomCheckoutSettlementModal } from "./room-checkout-settlement-modal";
import type { HotelCheckInResult, HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";

const TECHNICAL_ERROR_PATTERN =
  /(\b[45]\d\d\b|internal server|failed to fetch|network|timeout|prisma|zod|invalid_|expected |undefined|null|stack|exception|\bat [\w.]+ \()/i;

function resolveFrontDeskCheckInReason(err: unknown): string {
  const friendly = formatFriendlyCheckInError(err).trim();
  if (!friendly || TECHNICAL_ERROR_PATTERN.test(friendly)) {
    return "Lỗi hệ thống khi nhận phòng. Vui lòng thử lại hoặc báo bộ phận kỹ thuật.";
  }
  return friendly;
}
import {
  buildGroupRoomItems,
  type BatchOperationResult,
  type GroupRoomItem,
} from "./group-operations-drawer";

async function checkInGroupRoom(
  hotelId: string,
  room: Pick<GroupRoomItem, "reservationId" | "roomNumber" | "plannedCheckInAt">,
  payload: Parameters<typeof staffRoomsRepository.checkInReservation>[2],
  guestName: string,
) {
  const checkIn = () => staffRoomsRepository.checkInReservation(hotelId, room.reservationId, payload);
  let result;
  try {
    result = await checkIn();
  } catch (error) {
    const early = isEarlyCheckInError(error);
    if (!early && !isLateCheckInError(error)) throw error;
    const confirmation = await showConfirmDialog({
      icon: "warning",
      title: early ? "Nhận phòng sớm?" : "Nhận phòng muộn?",
      text: `Phòng ${room.roomNumber} · ${guestName} · Ngày đến dự kiến: ${toDisplayVnDate(room.plannedCheckInAt?.slice(0, 10) || "")}.`,
      confirmText: early ? "Nhận phòng sớm" : "Nhận phòng muộn",
      cancelText: "Chưa nhận phòng",
    });
    if (!confirmation.isConfirmed) throw error;
    result = await staffRoomsRepository.checkInReservation(hotelId, room.reservationId, {
      ...payload,
      ...(early
        ? { allowEarlyCheckIn: true, confirmEarlyCheckIn: true }
        : { allowLateCheckIn: true, confirmLateCheckIn: true }),
    });
  }
  return result;
}

const cellInputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-2xs outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 placeholder:font-normal";
const cellSelectClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-2xs outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

function VnDateInput({
  id,
  value,
  onChange,
  className,
  placeholder = "ngày/tháng/năm",
  required,
}: {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const textVal = toDisplayVnDate(value);
  const dateInputRef = useRef<HTMLInputElement>(null);


  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatVnDateInput(e.target.value, textVal);
    const iso = toIsoDate(formatted);
    if (iso) {
      onChange(iso);
    } else if (!formatted.trim()) {
      onChange("");
    } else {
      onChange(formatted);
    }
  };

  const handleBlur = () => {
    const digitsOnly = textVal.replace(/\D/g, "");
    if (digitsOnly.length === 4 && Number(digitsOnly) >= 1900 && Number(digitsOnly) <= new Date().getFullYear()) {
      const year = Number(digitsOnly);
      const iso = `${year}-01-01`;
      onChange(iso);
      return;
    }
    const iso = toIsoDate(textVal);
    if (iso) {
      onChange(iso);
    } else if (!textVal.trim()) {
      onChange("");
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (iso) {
      onChange(iso);
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={10}
        required={required}
        value={textVal}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`${className || ""} pr-8`}
      />
      <input
        ref={dateInputRef}
        type="date"
        tabIndex={-1}
        value={toIsoDate(value)}
        onChange={handlePickerChange}
        className="sr-only"
        aria-hidden="true"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Chọn ngày từ lịch"
        onClick={() => {
          try {
            dateInputRef.current?.showPicker();
          } catch {
            dateInputRef.current?.focus();
          }
        }}
        className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors p-1"
      >
        <VsIcon name="calendar_today" className="text-sm" />
      </button>
    </div>
  );
}

export type GroupGuestItem = {
  fullName: string;
  phone?: string;
  identityNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  residencePlace?: string;
  isPrimary?: boolean;
};

export type GroupRoomCheckInState = {
  reservationId: string;
  reservationCode: string;
  roomId: string;
  roomNumber: string;
  roomType?: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  updatedAt?: string | null;
  guests: GroupGuestItem[];
  capturesByGuest: Record<number, CccdCheckInCapture>;
  activeGuestIndex: number;
};

export type GroupCheckInModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  groupCode: string;
  rooms?: GroupRoomItem[];
  initialArrivals?: import("@/features/hotel-ops/types/hotel-ops-contract").HotelArrival[];
  enabledFeatures?: readonly string[];
  onBatchResults?: (results: Record<string, BatchOperationResult>) => void;
  onSuccess?: () => void | Promise<void>;
};

export function GroupCheckInModal(props: GroupCheckInModalProps) {
  return props.isOpen ? <GroupCheckInForm key={`${props.hotelId}:${props.groupCode}`} {...props} /> : null;
}

function GroupCheckInForm({
  isOpen,
  onClose,
  hotelId,
  groupCode,
  rooms,
  initialArrivals = [],
  enabledFeatures = [],
  onBatchResults,
  onSuccess,
}: GroupCheckInModalProps) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const titleId = useId();
  const descId = useId();

  const isScannerEnabled = hasHotelFeature(enabledFeatures, FRONTDESK_HN2N_CCCD_SCANNER);
  const kbtt = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const nationalitiesQuery = useQuery({
    ...kbtt.queries.catalog.options({ kind: "NATIONALITY" }),
    enabled: isOpen,
  });
  const nationalities = nationalitiesQuery.data ?? [];

  const shouldFetchGroupArrivals = Boolean(isOpen && groupCode?.trim() && (!rooms || rooms.length === 0));
  const { data: fetchedArrivals = [], isLoading: isLoadingArrivals } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.groupArrivals.options(groupCode),
    enabled: shouldFetchGroupArrivals,
    staleTime: 5_000,
  });

  const availableRoomsQuery = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      status: "AVAILABLE",
      limit: 100,
    }),
    enabled: isOpen,
    staleTime: 10_000,
  });
  const availableRooms = availableRoomsQuery.data?.items ?? [];

  const allRoomsQuery = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      limit: 100,
    }),
    enabled: isOpen,
    staleTime: 5_000,
  });
  const allHotelRooms = allRoomsQuery.data?.items ?? [];

  // In-place settlement modal state for conflicting stays / unclosed folios
  const [settlementTarget, setSettlementTarget] = useState<{
    room: HotelRoomSummary;
    stay: NonNullable<HotelRoomSummary["activeStay"]>;
  } | null>(null);

  // Map of failed check-in errors per reservationId
  const [failedRoomMap, setFailedRoomMap] = useState<Record<string, string>>({});
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [isMarkingReady, setIsMarkingReady] = useState<boolean>(false);

  const effectiveRooms = useMemo(() => {
    if (rooms && rooms.length > 0) return rooms;
    if (!groupCode) return [];
    const built = buildGroupRoomItems({
      activeGroupCode: groupCode,
      initialArrivals,
      fetchedArrivals,
    });
    const ready = built.filter((r) => r.status === "ARRIVAL_READY" || r.status === "CONFIRMED");
    return ready.length > 0 ? ready : built;
  }, [rooms, groupCode, initialArrivals, fetchedArrivals]);

  // Separate active rooms with QR from unready/inactive rooms (OUT_OF_SERVICE, MAINTENANCE, BLOCKED, no QR)
  const { eligibleRooms, excludedRooms } = useMemo(() => {
    const list = effectiveRooms;
    const eligible: GroupRoomItem[] = [];
    const excluded: Array<{ room: GroupRoomItem; reason: string }> = [];

    for (const r of list) {
      if (!r.roomId) {
        excluded.push({ room: r, reason: "Chưa gán số phòng cụ thể" });
        continue;
      }
      const isInactive =
        r.roomStatus === "OUT_OF_SERVICE" ||
        r.roomStatus === "MAINTENANCE" ||
        r.roomStatus === "BLOCKED";

      const isMissingQr = r.hasQr === false || r.qrStatus === "REVOKED";

      if (isInactive) {
        const reasonText =
          r.roomStatus === "OUT_OF_SERVICE"
            ? "Phòng đang ngừng hoạt động"
            : r.roomStatus === "MAINTENANCE"
              ? "Phòng đang bảo trì"
              : "Phòng đang bị khóa";
        excluded.push({ room: r, reason: reasonText });
      } else if (isMissingQr) {
        excluded.push({ room: r, reason: "Phòng chưa có mã QR khả dụng" });
      } else {
        eligible.push(r);
      }
    }

    return { eligibleRooms: eligible, excludedRooms: excluded };
  }, [effectiveRooms]);

  const [activeRoomIndex, setActiveRoomIndex] = useState<number>(0);
  const [intakeMethod, setIntakeMethod] = useState<"scanner" | "mobile" | "upload">(() => {
    if (isScannerEnabled) return "scanner";
    return "upload";
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);

  // Quick Room Swap Modal State
  const [reassigningItem, setReassigningItem] = useState<GroupRoomItem | null>(null);
  const [targetSwapRoomId, setTargetSwapRoomId] = useState<string>("");
  const [isSwappingRoom, setIsSwappingRoom] = useState<boolean>(false);

  // Add Room to Group Modal State
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState<boolean>(false);
  const [selectedAddRoomIds, setSelectedAddRoomIds] = useState<Set<string>>(new Set());
  const [addRoomSearch, setAddRoomSearch] = useState<string>("");
  const [addRoomFloorFilter, setAddRoomFloorFilter] = useState<string>("all");
  const [addRoomTypeFilter, setAddRoomTypeFilter] = useState<string>("all");

  // Target room type info for the room currently being swapped (cùng loại, cùng hạng)
  const currentAssignedSwapRoom = reassigningItem?.roomId
    ? allHotelRooms.find((room) => room.id === reassigningItem.roomId) ?? null : null;

  const targetRoomTypeLabel = useMemo(() => {
    if (!reassigningItem) return "";
    return (
      reassigningItem.roomType ||
      currentAssignedSwapRoom?.roomTypeName ||
      currentAssignedSwapRoom?.type ||
      ""
    ).trim();
  }, [reassigningItem, currentAssignedSwapRoom]);

  const sameTypeAvailableRooms = useMemo(() => {
    if (!reassigningItem) return [];

    const targetTypeId = currentAssignedSwapRoom?.roomTypeId;
    const targetTypeNormalized = targetRoomTypeLabel.toLowerCase();

    return availableRooms.filter((candidate) => {
      // Exclude current room
      if (candidate.id === reassigningItem.roomId) return false;

      // 1. Direct roomTypeId match
      if (targetTypeId && candidate.roomTypeId && candidate.roomTypeId === targetTypeId) {
        return true;
      }

      // 2. Name / type comparison (case-insensitive)
      const candidateType = (candidate.type || "").trim().toLowerCase();
      const candidateTypeName = (candidate.roomTypeName || "").trim().toLowerCase();

      if (targetTypeNormalized) {
        if (candidateType && candidateType === targetTypeNormalized) return true;
        if (candidateTypeName && candidateTypeName === targetTypeNormalized) return true;
      }

      const assignedType = (currentAssignedSwapRoom?.type || "").trim().toLowerCase();
      if (assignedType) {
        if (candidateType && candidateType === assignedType) return true;
        if (candidateTypeName && candidateTypeName === assignedType) return true;
      }

      const assignedTypeName = (currentAssignedSwapRoom?.roomTypeName || "").trim().toLowerCase();
      if (assignedTypeName) {
        if (candidateType && candidateType === assignedTypeName) return true;
        if (candidateTypeName && candidateTypeName === assignedTypeName) return true;
      }

      // Fallback: If reservation has no room type info at all, allow all available rooms
      if (!targetTypeId && !targetTypeNormalized) {
        return true;
      }

      return false;
    });
  }, [reassigningItem, currentAssignedSwapRoom, targetRoomTypeLabel, availableRooms]);

  const differentTypeAvailableRooms = useMemo(() => {
    if (!reassigningItem) return [];
    const sameIds = new Set(sameTypeAvailableRooms.map((r) => r.id));
    return availableRooms.filter(
      (candidate) => candidate.id !== reassigningItem.roomId && !sameIds.has(candidate.id),
    );
  }, [reassigningItem, availableRooms, sameTypeAvailableRooms]);

  const [allowDifferentRoomType, setAllowDifferentRoomType] = useState<boolean>(false);

  useEffect(() => {
    if (reassigningItem) {
      if (sameTypeAvailableRooms.length === 0 && differentTypeAvailableRooms.length > 0) {
        setAllowDifferentRoomType(true);
      } else {
        setAllowDifferentRoomType(false);
      }
    }
  }, [reassigningItem, sameTypeAvailableRooms.length, differentTypeAvailableRooms.length]);

  const chosenSwapRoom = useMemo(() => {
    if (!targetSwapRoomId) return null;
    return availableRooms.find((r) => r.id === targetSwapRoomId) ?? null;
  }, [targetSwapRoomId, availableRooms]);

  const isExceptionSwap = useMemo(() => {
    if (!chosenSwapRoom) return false;
    return differentTypeAvailableRooms.some((r) => r.id === chosenSwapRoom.id);
  }, [chosenSwapRoom, differentTypeAvailableRooms]);

  // Initialize room states strictly from eligibleRooms (active rooms with QR only)
  const [roomsState, setRoomsState] = useState<GroupRoomCheckInState[]>(() => {
    return eligibleRooms.map((r) => ({
      reservationId: r.reservationId,
      reservationCode: r.reservationCode,
      roomId: r.roomId || "",
      roomNumber: r.roomNumber || r.reservationCode,
      roomType: r.roomType || undefined,
      plannedCheckInAt: r.plannedCheckInAt || "",
      plannedCheckOutAt: r.plannedCheckOutAt || "",
      updatedAt: r.updatedAt || null,
      guests: [
        {
          fullName: r.guestDisplayName || "",
          phone: r.guestPhone || "",
          identityNumber: "",
          dateOfBirth: "",
          gender: "Nam",
          nationality: "Việt Nam",
          residencePlace: "",
          isPrimary: true,
        },
      ],
      capturesByGuest: {},
      activeGuestIndex: 0,
    }));
  });

  const assignedRoomIdSet = useMemo(() => new Set(roomsState.map((r) => r.roomId)), [roomsState]);

  const candidateRoomsToAdd = useMemo(() => {
    return availableRooms.filter((r) => {
      if (assignedRoomIdSet.has(r.id)) return false;
      if (addRoomFloorFilter !== "all" && String(r.floor || "") !== addRoomFloorFilter) return false;
      const rType = r.type || r.roomTypeName || "";
      if (addRoomTypeFilter !== "all" && rType !== addRoomTypeFilter) return false;
      if (addRoomSearch.trim()) {
        const q = addRoomSearch.trim().toLowerCase();
        const matchNum = String(r.roomNumber).toLowerCase().includes(q);
        const matchType = rType.toLowerCase().includes(q);
        if (!matchNum && !matchType) return false;
      }
      return true;
    });
  }, [availableRooms, assignedRoomIdSet, addRoomFloorFilter, addRoomTypeFilter, addRoomSearch]);

  const addRoomFloors = useMemo(() => {
    const set = new Set<string>();
    for (const r of availableRooms) {
      if (r.floor) set.add(String(r.floor));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [availableRooms]);

  const addRoomTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of availableRooms) {
      const t = r.type || r.roomTypeName;
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [availableRooms]);

  const handleConfirmAddRooms = () => {
    if (selectedAddRoomIds.size === 0) return;
    const now = Date.now();
    let counter = 0;
    const defaultCheckIn = roomsState[0]?.plannedCheckInAt || new Date().toISOString();
    const defaultCheckOut =
      roomsState[0]?.plannedCheckOutAt ||
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const newItems: GroupRoomCheckInState[] = [];
    for (const roomId of selectedAddRoomIds) {
      const roomObj = availableRooms.find((r) => r.id === roomId);
      if (!roomObj) continue;
      counter++;
      newItems.push({
        reservationId: `walkin-${roomObj.id}-${now}-${counter}`,
        reservationCode: `WI-${roomObj.roomNumber}`,
        roomId: roomObj.id,
        roomNumber: String(roomObj.roomNumber),
        roomType: roomObj.type || roomObj.roomTypeName || undefined,
        plannedCheckInAt: defaultCheckIn,
        plannedCheckOutAt: defaultCheckOut,
        updatedAt: null,
        guests: [
          {
            fullName: "",
            phone: "",
            identityNumber: "",
            dateOfBirth: "",
            gender: "Nam",
            nationality: "Việt Nam",
            residencePlace: "",
            isPrimary: true,
          },
        ],
        capturesByGuest: {},
        activeGuestIndex: 0,
      });
    }

    const nextIndex = roomsState.length;
    setRoomsState((prev) => [...prev, ...newItems]);
    setActiveRoomIndex(nextIndex);
    setSelectedAddRoomIds(new Set());
    setIsAddRoomModalOpen(false);
  };

  const handleRemoveActiveRoom = async () => {
    if (!activeRoom || roomsState.length <= 1) return;
    const confirm = await showConfirmDialog({
      icon: "warning",
      title: `Bỏ phòng ${activeRoom.roomNumber}?`,
      text: "Phòng này sẽ được loại khỏi đợt nhận phòng đoàn hiện tại.",
      confirmText: "Xác nhận bỏ phòng",
      cancelText: "Giữ lại",
    });
    if (!confirm.isConfirmed) return;

    setRoomsState((prev) => prev.filter((_, idx) => idx !== activeRoomIndex));
    setActiveRoomIndex((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const roomSourceKey = eligibleRooms.map((room) => [room.reservationId, room.roomId, room.updatedAt].join(":" )).join("|");
  const [lastRoomSourceKey, setLastRoomSourceKey] = useState(roomSourceKey);
  if (lastRoomSourceKey !== roomSourceKey) {
    setLastRoomSourceKey(roomSourceKey);
    setRoomsState((previous) => {
      const walkinRooms = previous.filter((r) => r.reservationId.startsWith("walkin-"));
      const mapped = eligibleRooms.filter((room) => !completedIds.has(room.reservationId)).map((room) => {
        const draft = previous.find((item) => item.reservationId === room.reservationId);
        return {
          reservationId: room.reservationId, reservationCode: room.reservationCode,
          roomId: room.roomId || "", roomNumber: room.roomNumber || room.reservationCode,
          roomType: room.roomType || undefined, plannedCheckOutAt: room.plannedCheckOutAt || "",
          plannedCheckInAt: room.plannedCheckInAt || "",
          updatedAt: room.updatedAt || null,
          guests: draft?.guests ?? [{ fullName: room.guestDisplayName || "", phone: room.guestPhone || "", gender: "Nam", nationality: "Việt Nam", isPrimary: true }],
          capturesByGuest: draft?.capturesByGuest ?? {}, activeGuestIndex: draft?.activeGuestIndex ?? 0,
        };
      });
      return [...mapped, ...walkinRooms];
    });
    setActiveRoomIndex(0);
  }

  const handleConfirmRoomSwap = async () => {
    if (!reassigningItem || !targetSwapRoomId) {
      void showWarningAlert("Chưa chọn phòng", "Vui lòng chọn một phòng khả dụng từ danh sách.");
      return;
    }
    const chosenRoom = availableRooms.find((r) => r.id === targetSwapRoomId);
    const roomName = chosenRoom ? `Phòng ${chosenRoom.roomNumber}` : "Phòng đã chọn";

    setIsSwappingRoom(true);
    try {
      let updatedUpdatedAt = reassigningItem.updatedAt;
      if (!reassigningItem.reservationId.startsWith("walkin-")) {
        const assigned = await staffRoomsRepository.assignReservationRoom(hotelId, reassigningItem.reservationId, {
          roomId: targetSwapRoomId,
          expectedRoomId: reassigningItem.roomId,
          ...(reassigningItem.updatedAt ? { expectedUpdatedAt: reassigningItem.updatedAt } : {}),
        });
        updatedUpdatedAt = assigned.updatedAt;
      }

      // Instantly update room in local roomsState while preserving all guest data & captures
      setRoomsState((prev) =>
        prev.map((r) =>
          r.reservationId === reassigningItem.reservationId
            ? {
                ...r,
                roomId: targetSwapRoomId,
                roomNumber: chosenRoom?.roomNumber || r.roomNumber,
                roomType: chosenRoom?.type || chosenRoom?.roomTypeName || r.roomType,
                updatedAt: updatedUpdatedAt,
              }
            : r,
        ),
      );

      // Clear any previous failure reason for this reservation
      setFailedRoomMap((prev) => {
        const next = { ...prev };
        delete next[reassigningItem.reservationId];
        return next;
      });

      const isDiffType =
        chosenRoom &&
        targetRoomTypeLabel &&
        (chosenRoom.type || chosenRoom.roomTypeName) &&
        (chosenRoom.type || chosenRoom.roomTypeName)?.trim().toLowerCase() !==
          targetRoomTypeLabel.toLowerCase();

      await showSuccessAlert(
        isDiffType ? "Đổi phòng ngoại lệ thành công" : "Đổi phòng thành công",
        isDiffType
          ? `Đã chuyển sang ${roomName} (${chosenRoom?.type || chosenRoom?.roomTypeName || "Khác loại"}) cho khách ${reassigningItem.guestDisplayName} theo diện ngoại lệ.`
          : `Đã chuyển sang ${roomName} cho khách ${reassigningItem.guestDisplayName}.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await allRoomsQuery.refetch();
      await availableRoomsQuery.refetch();
      setReassigningItem(null);
      setAllowDifferentRoomType(false);
      setTargetSwapRoomId("");
      await onSuccess?.();
    } catch (err: unknown) {
      await showErrorAlert(
        "Không thể đổi phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi đổi phòng.",
      );
    } finally {
      setIsSwappingRoom(false);
    }
  };

  const handleConfirmRoomCleanReady = async (room: HotelRoomSummary) => {
    const confirm = await showConfirmDialog({
      icon: "question",
      title: `Phòng ${room.roomNumber} đã sạch?`,
      confirmText: "Xác nhận sạch",
      cancelText: "Hủy",
    });
    if (!confirm.isConfirmed) return;

    setIsMarkingReady(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/ready`,
        {
          method: "PATCH",
          body: { expectedUpdatedAt: room.updatedAt },
        },
      );
      await showSuccessAlert(
        "Phòng đã sẵn sàng",
        `Phòng ${room.roomNumber} đã sẵn sàng đón khách.`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await allRoomsQuery.refetch();
      await availableRoomsQuery.refetch();
      if (activeRoom?.reservationId) {
        setFailedRoomMap((prev) => {
          const next = { ...prev };
          delete next[activeRoom.reservationId];
          return next;
        });
      }
    } catch (err) {
      await showErrorAlert(
        "Không thể cập nhật",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi xác nhận phòng sạch.",
      );
    } finally {
      setIsMarkingReady(false);
    }
  };

  const getRoomConflict = useCallback(
    (item: { roomId: string; roomNumber: string; reservationCode?: string; reservationId?: string }) => {
      const hr = allHotelRooms.find(
        (r) => r.id === item.roomId || (r.roomNumber && r.roomNumber === item.roomNumber),
      );

      const failedReason = item.reservationId ? failedRoomMap[item.reservationId] : null;

      // An authorization failure must not suggest checkout or a room swap.
      if (failedReason && checkInRecovery(failedReason).action === "permission") {
        return { type: "CHECK_IN_FAILED" as const, reason: failedReason, stay: null, room: hr ?? null };
      }

      if (!hr) {
        if (failedReason) {
          return {
            type: "CHECK_IN_FAILED" as const,
            reason: failedReason,
            stay: null,
            room: null,
          };
        }
        return null;
      }

      // Conflicting active stay
      if (hr.activeStay && hr.activeStay.reservationCode !== item.reservationCode) {
        return {
          type: "CONFLICTING_STAY" as const,
          reason: `Phòng ${item.roomNumber} đang có khách ${hr.activeStay.guestDisplayName || "lưu trú trước"}. Kiểm tra hóa đơn và hoàn tất trả phòng hoặc đổi sang phòng khác.`,
          stay: hr.activeStay,
          room: hr,
        };
      }

      // Room is occupied without matching reservation code
      if (hr.status === "OCCUPIED" && hr.activeStay?.reservationCode !== item.reservationCode) {
        return {
          type: "OCCUPIED" as const,
          reason: `Phòng ${item.roomNumber} đang có khách. Cần hoàn tất trả phòng trước khi nhận khách mới.`,
          stay: hr.activeStay ?? null,
          room: hr,
        };
      }

      // Room is dirty / processing
      if (hr.status === "PROCESSING" || hr.status === "DIRTY") {
        return {
          type: "PROCESSING" as const,
          reason: `Phòng ${item.roomNumber} đang chờ dọn buồng. Chỉ xác nhận sẵn sàng sau khi đã kiểm tra phòng sạch.`,
          stay: null,
          room: hr,
        };
      }

      // Check failed submission
      if (failedReason) {
        return {
          type: "CHECK_IN_FAILED" as const,
          reason: failedReason,
          stay: hr.activeStay ?? null,
          room: hr,
        };
      }

      return null;
    },
    [allHotelRooms, failedRoomMap],
  );

  const activeRoom = roomsState[activeRoomIndex] || roomsState[0];

  const handleRefreshStatus = async () => {
    if (isRefreshing || isSubmitting) return;
    setIsRefreshing(true);
    setRefreshError("");
    try {
      const latest = await queryClient.fetchQuery({
        ...staffRoomsResource.bind({ hotelId }).queries.groupArrivals.options(groupCode),
        staleTime: 0,
      });
      const roomResult = await allRoomsQuery.refetch();
      if (roomResult.isError) throw roomResult.error;
      await availableRoomsQuery.refetch();
      setRoomsState((previous) => previous.map((draft) => {
        const current = latest.find((item) => item.id === draft.reservationId);
        if (!current) return draft;
        return { ...draft, roomId: current.roomId || draft.roomId,
          roomNumber: current.room?.roomNumber || draft.roomNumber,
          updatedAt: current.updatedAt, plannedCheckInAt: current.plannedCheckInAt || draft.plannedCheckInAt,
          plannedCheckOutAt: current.plannedCheckOutAt || draft.plannedCheckOutAt };
      }));
      // Keep unresolved errors visible; only the next successful attempt clears them.
    } catch (error) {
      setRefreshError(resolveFrontDeskCheckInReason(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const [isOpeningSettlement, setIsOpeningSettlement] = useState<boolean>(false);

  const handleOpenSettlement = async () => {
    if (!activeRoom) return;

    const targetRoom =
      activeRoomConflict?.room ||
      allHotelRooms.find(
        (r) => r.id === activeRoom.roomId || r.roomNumber === activeRoom.roomNumber,
      );

    if (!targetRoom) {
      void showWarningAlert("Không tìm thấy thông tin phòng", "Vui lòng chọn phòng cần xử lý.");
      return;
    }

    // 1. Direct active stay on room
    if (activeRoomConflict?.stay || targetRoom.activeStay) {
      setSettlementTarget({
        room: targetRoom,
        stay: (activeRoomConflict?.stay || targetRoom.activeStay)!,
      });
      return;
    }

    // 2. Room has no active stay (e.g. checked out previously or dangling open folio):
    // Search open folios for this room from billing
    setIsOpeningSettlement(true);
    try {
      const matchedFolio = await staffRoomsRepository.findOpenRoomFolio(hotelId, targetRoom.id);

      if (matchedFolio) {
        if (!matchedFolio.stay?.id && !matchedFolio.stayId) throw new Error("Missing stay context");
        const stayObj = {
          id: matchedFolio.stay?.id || matchedFolio.stayId || "",
          reservationCode: matchedFolio.stay?.reservationCode || "",
          guestDisplayName: matchedFolio.stay?.guestDisplayName || "Khách lưu trú trước",
          plannedCheckOutAt: matchedFolio.stay?.plannedCheckOutAt || "",
          nightlyRateSnapshot: matchedFolio.stay?.nightlyRateSnapshot != null ? Number(matchedFolio.stay.nightlyRateSnapshot) : 0,
          status: matchedFolio.stay?.status || "CHECKED_OUT",
        };
        setSettlementTarget({
          room: targetRoom,
          stay: stayObj,
        });
      } else {
        // No open folio exists, meaning the room is clean/ready or error can be cleared
        await showSuccessAlert(
          "Không có hóa đơn mở",
        `P.${targetRoom.roomNumber} · Kiểm tra lại trạng thái phòng.`,
        );
        if (activeRoom?.reservationId) {
          setFailedRoomMap((prev) => {
            const next = { ...prev };
            delete next[activeRoom.reservationId];
            return next;
          });
        }
        await invalidateHotelRealtimeQueries(queryClient, hotelId);
        await allRoomsQuery.refetch();
        await availableRoomsQuery.refetch();
      }
    } catch {
      await showErrorAlert("Không thể tải thông tin thanh toán", "Vui lòng thử lại hoặc mở Thu ngân để kiểm tra hồ sơ của phòng.");
    } finally {
      setIsOpeningSettlement(false);
    }
  };

  const handleOpenSwapModalForActiveRoom = () => {
    if (!activeRoom) return;
    const match = effectiveRooms.find((r) => r.reservationId === activeRoom.reservationId);
    const itemToSwap: GroupRoomItem = match
      ? {
          ...match,
          roomId: activeRoom.roomId || match.roomId,
          roomNumber: activeRoom.roomNumber || match.roomNumber,
          roomType: activeRoom.roomType || match.roomType || null,
          plannedCheckOutAt: activeRoom.plannedCheckOutAt || match.plannedCheckOutAt,
          updatedAt: activeRoom.updatedAt,
        }
      : {
          reservationId: activeRoom.reservationId,
          reservationCode: activeRoom.reservationCode,
          groupCode: groupCode,
          roomId: activeRoom.roomId,
          roomNumber: activeRoom.roomNumber,
          floor: null,
          roomType: activeRoom.roomType || null,
          guestDisplayName: activeRoom.guests[0]?.fullName || "Khách đoàn",
          guestPhone: null,
          plannedCheckInAt: activeRoom.plannedCheckInAt,
          plannedCheckOutAt: activeRoom.plannedCheckOutAt,
          rate: null,
          status: "CONFIRMED",
          stayId: null,
        };
    setReassigningItem(itemToSwap);
    setTargetSwapRoomId("");
  };

  // Helper to test if identity matches
  const isSameIdentity = (
    capture: CccdCheckInCapture,
    idNumber?: string,
    name?: string,
    dob?: string,
  ): boolean => {
    const capId = capture.guestIdentityNumber?.trim().toLowerCase();
    const tgtId = idNumber?.trim().toLowerCase();
    if (capId && tgtId && capId === tgtId) return true;

    const capName = capture.guestDisplayName?.trim().toLowerCase();
    const tgtName = name?.trim().toLowerCase();
    if (capName && tgtName && capName === tgtName) {
      if (capture.guestDateOfBirth && dob) {
        return capture.guestDateOfBirth === dob;
      }
      return true;
    }
    return false;
  };

  // Handle capture from scanner / mobile / ocr
  const handleCapture = useCallback(
    (nextCapture: CccdCheckInCapture | null) => {
      if (!nextCapture || !activeRoom) return;

      setRoomsState((prev) => {
        const next = [...prev];
        const room = { ...next[activeRoomIndex] };
        const guests = [...room.guests];

        const primaryGuest = guests[0];
        const matchesPrimary = isSameIdentity(
          nextCapture,
          primaryGuest?.identityNumber,
          primaryGuest?.fullName,
          primaryGuest?.dateOfBirth,
        );

        const occupantMatchIdx = guests.slice(1).findIndex((occ) =>
          isSameIdentity(nextCapture, occ.identityNumber, occ.fullName, occ.dateOfBirth),
        );

        let targetSlot = room.activeGuestIndex;
        const isPrimaryEmpty =
          !primaryGuest?.fullName?.trim() && !primaryGuest?.identityNumber?.trim();

        if (matchesPrimary) {
          targetSlot = 0;
        } else if (occupantMatchIdx !== -1) {
          targetSlot = occupantMatchIdx + 1;
        } else if (isPrimaryEmpty) {
          targetSlot = 0;
        } else {
          const blankIdx = guests.findIndex(
            (g, idx) => idx > 0 && !g.fullName?.trim() && !g.identityNumber?.trim(),
          );
          if (blankIdx !== -1) {
            targetSlot = blankIdx;
          } else {
            targetSlot = guests.length;
          }
        }

        while (guests.length <= targetSlot) {
          guests.push({
            fullName: "",
            phone: "",
            identityNumber: "",
            dateOfBirth: "",
            gender: "Nam",
            nationality: "Việt Nam",
            residencePlace: "",
            isPrimary: false,
          });
        }

        const existing = guests[targetSlot];
        guests[targetSlot] = {
          ...existing,
          fullName: nextCapture.guestDisplayName?.trim() || existing.fullName,
          identityNumber: nextCapture.guestIdentityNumber?.trim() || existing.identityNumber,
          dateOfBirth: nextCapture.guestDateOfBirth?.trim() || existing.dateOfBirth,
          gender: nextCapture.guestGender?.trim() || existing.gender,
          nationality: nextCapture.guestNationality?.trim() || existing.nationality,
          residencePlace: nextCapture.guestResidencePlace?.trim() || existing.residencePlace,
        };

        room.guests = guests;
        room.capturesByGuest = { ...room.capturesByGuest, [targetSlot]: nextCapture };
        next[activeRoomIndex] = room;
        return next;
      });
    },
    [activeRoomIndex, activeRoom],
  );

  const handleMultipleCaptures = useCallback(
    (captures: CccdCheckInCapture[]) => {
      for (const cap of captures) {
        handleCapture(cap);
      }
    },
    [handleCapture],
  );

  const handleGuestFieldChange = (
    guestIndex: number,
    field: keyof GroupGuestItem,
    value: string,
  ) => {
    setRoomsState((prev) => {
      const next = [...prev];
      const room = { ...next[activeRoomIndex] };
      const guests = [...room.guests];
      if (!guests[guestIndex]) return prev;

      guests[guestIndex] = {
        ...guests[guestIndex],
        [field]: value,
      };
      room.guests = guests;
      next[activeRoomIndex] = room;
      return next;
    });
  };

  const handleAddGuest = () => {
    setRoomsState((prev) => {
      const next = [...prev];
      const room = { ...next[activeRoomIndex] };
      room.guests = [
        ...room.guests,
        {
          fullName: "",
          phone: "",
          identityNumber: "",
          dateOfBirth: "",
          gender: "Nam",
          nationality: "Việt Nam",
          residencePlace: "",
          isPrimary: false,
        },
      ];
      room.activeGuestIndex = room.guests.length - 1;
      next[activeRoomIndex] = room;
      return next;
    });
  };

  const handleRemoveGuest = (guestIndex: number) => {
    if (guestIndex === 0) return; // Cannot delete primary guest
    setRoomsState((prev) => {
      const next = [...prev];
      const room = { ...next[activeRoomIndex] };
      room.guests = room.guests.filter((_, idx) => idx !== guestIndex);
      if (room.activeGuestIndex >= room.guests.length) {
        room.activeGuestIndex = Math.max(0, room.guests.length - 1);
      }
      next[activeRoomIndex] = room;
      return next;
    });
  };

  const handleSafeClose = useCallback(async () => {
    if (isSubmitting || isSwappingRoom || isMarkingReady || isRefreshing) return;
    const hasAnyCccd = roomsState.some((r) =>
      r.guests.some((g) => Boolean(g.identityNumber?.trim() || g.fullName.trim())),
    );
    if (hasAnyCccd) {
      const confirm = await showConfirmDialog({
        icon: "warning",
        title: "Thoát nhận phòng đoàn?",
        text: "Thông tin CCCD/hộ chiếu chưa được lưu.",
        confirmText: "Thoát",
        cancelText: "Nhập tiếp",
        reverseButtons: false,
      });
      if (!confirm.isConfirmed) return;
    }
    onClose();
  }, [isSubmitting, isSwappingRoom, isMarkingReady, isRefreshing, roomsState, onClose]);

  // Keyboard escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleSafeClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleSafeClose]);

  // Submit complete group check-in
  const handleSubmitGroupCheckIn = async () => {
    if (submitLock.current || isSubmitting || isRefreshing || isSwappingRoom || isMarkingReady) return;
    submitLock.current = true;
    try {
    // Validate: each room must have at least 1 guest with a name
    for (let i = 0; i < roomsState.length; i++) {
      const r = roomsState[i];
      const primary = r.guests[0];
      if (!primary || !primary.fullName.trim()) {
        setActiveRoomIndex(i);
        await showWarningAlert(
          "Thiếu họ tên khách",
          `Vui lòng nhập họ tên khách chính cho Phòng ${r.roomNumber}.`,
        );
        return;
      }
    }

    const totalGuestsCount = roomsState.reduce((sum, r) => sum + r.guests.length, 0);
    const roomsWithCccd = roomsState.filter((r) =>
      r.guests.some((g) => Boolean(g.identityNumber?.trim())),
    ).length;

    const confirm = await showConfirmDialog({
      icon: "question",
      title: "Nhận phòng đoàn?",
      details: [
        { label: "Đoàn", value: groupCode },
        { label: "Nhận phòng", value: `${roomsState.length} phòng · ${totalGuestsCount} khách` },
        { label: "Đã có CCCD", value: `${roomsWithCccd}/${roomsState.length} phòng` },
      ],
      confirmText: `Nhận phòng ${roomsState.length} phòng`,
      cancelText: "Kiểm tra lại",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsSubmitting(true);
    setSubmitProgress({ current: 0, total: roomsState.length });

    const newResults: Record<string, BatchOperationResult> = {};
    let successCount = 0;
    let failCount = 0;
    const failedRooms: Array<{ reservationId: string; reason: string }> = [];

    for (let i = 0; i < roomsState.length; i++) {
      const room = roomsState[i];
      setSubmitProgress({ current: i + 1, total: roomsState.length });

      const primary = room.guests[0];
      const extraOccupants = room.guests.slice(1).map((occ) => ({
        fullName: occ.fullName.trim(),
        phone: occ.phone?.trim() || undefined,
        identityNumber: occ.identityNumber?.trim() || undefined,
        dateOfBirth: toIsoDate(occ.dateOfBirth?.trim()) || undefined,
        gender: occ.gender?.trim() || undefined,
        nationality: occ.nationality?.trim() || undefined,
        residencePlace: occ.residencePlace?.trim() || undefined,
        isPrimary: false,
      }));

      if (room.reservationId.startsWith("walkin-")) {
        try {
          const stayRes = await requestInternalApiEnvelope<HotelCheckInResult>(
            `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/stays`,
            {
              method: "POST",
              body: {
                roomId: room.roomId,
                guestDisplayName: primary.fullName.trim(),
                guestPhone: primary.phone?.trim() || undefined,
                guestIdentityNumber: primary.identityNumber?.trim() || undefined,
                guestDateOfBirth: toIsoDate(primary.dateOfBirth?.trim()) || undefined,
                guestGender: primary.gender?.trim() || undefined,
                guestNationality: matchBcaNationalityCode(primary.nationality || "Việt Nam", nationalities),
                guestResidencePlace: primary.residencePlace?.trim() || undefined,
                plannedCheckInAt: new Date().toISOString(),
                plannedCheckOutAt: room.plannedCheckOutAt,
                groupCode: groupCode || undefined,
                groupLeadGuestName: roomsState[0]?.guests[0]?.fullName?.trim() || undefined,
                groupLeadGuestPhone: roomsState[0]?.guests[0]?.phone?.trim() || undefined,
                occupants: extraOccupants.length > 0 ? extraOccupants : undefined,
              },
            },
          );

          successCount++;
          newResults[room.reservationId] = {
            reservationId: room.reservationId,
            success: true,
            message: `Nhận phòng thành công${stayRes.data?.accessCode ? ` · Mã GuestOS: ${stayRes.data.accessCode}` : ""}`,
            action: "CHECK_IN",
            timestamp: Date.now(),
          };
          setCompletedIds((previous) => new Set([...previous, room.reservationId]));
        } catch (err: unknown) {
          failCount++;
          const friendlyMsg = resolveFrontDeskCheckInReason(err);
          failedRooms.push({ reservationId: room.reservationId, reason: friendlyMsg });

          newResults[room.reservationId] = {
            reservationId: room.reservationId,
            success: false,
            message: friendlyMsg,
            action: "CHECK_IN",
            timestamp: Date.now(),
          };
        }
      } else {
        const payload = {
          guestDisplayName: primary.fullName.trim(),
          guestPhone: primary.phone?.trim() || undefined,
          guestIdentityNumber: primary.identityNumber?.trim() || undefined,
          guestDateOfBirth: toIsoDate(primary.dateOfBirth?.trim()) || undefined,
          guestGender: primary.gender?.trim() || undefined,
          guestNationality: matchBcaNationalityCode(primary.nationality || "Việt Nam", nationalities),
          guestResidencePlace: primary.residencePlace?.trim() || undefined,
          plannedCheckOutAt: room.plannedCheckOutAt,
          occupants: extraOccupants.length > 0 ? extraOccupants : undefined,
          expectedRoomId: room.roomId?.trim() ? room.roomId.trim() : undefined,
          ...(room.updatedAt ? { expectedUpdatedAt: room.updatedAt } : {}),
        };

        try {
          const result = await checkInGroupRoom(hotelId, room, payload, primary.fullName.trim());

          successCount++;
          newResults[room.reservationId] = {
            reservationId: room.reservationId,
            success: true,
            message: `Nhận phòng thành công${result.accessCode ? ` · Mã GuestOS: ${result.accessCode}` : ""}`,
            action: "CHECK_IN",
            timestamp: Date.now(),
          };
          setCompletedIds((previous) => new Set([...previous, room.reservationId]));
        } catch (err: unknown) {
          failCount++;
          const friendlyMsg = resolveFrontDeskCheckInReason(err);
          failedRooms.push({ reservationId: room.reservationId, reason: friendlyMsg });

          newResults[room.reservationId] = {
            reservationId: room.reservationId,
            success: false,
            message: friendlyMsg,
            action: "CHECK_IN",
            timestamp: Date.now(),
          };
        }
      }
    }

    setIsSubmitting(false);
    setSubmitProgress(null);

    await invalidateHotelRealtimeQueries(queryClient, hotelId);
    await allRoomsQuery.refetch();
    await availableRoomsQuery.refetch();
    onBatchResults?.(newResults);

    if (failCount === 0) {
      await showSuccessAlert(
        "Đã nhận phòng đoàn",
        `${successCount} phòng · Đoàn #${groupCode}`,
        { timer: false },
      );
      await onSuccess?.();
      onClose();
    } else {
      const newFailedMap: Record<string, string> = {};
      for (const f of failedRooms) {
        newFailedMap[f.reservationId] = f.reason;
      }
      setFailedRoomMap(newFailedMap);

      const firstFailedIdx = roomsState.findIndex(
        (r) => newResults[r.reservationId]?.success === false,
      );
      if (firstFailedIdx >= 0) {
        setActiveRoomIndex(firstFailedIdx);
      }

      if (successCount > 0) {
        setRoomsState((prev) =>
          prev.filter((r) => newResults[r.reservationId]?.success !== true),
        );
        setActiveRoomIndex(0);
        await onSuccess?.();
      }
      // Giữ hộp thoại mở để lễ tân không bị mất thông tin khách/CCCD đã nhập, có thể kiểm tra hoặc thử lại
    }
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const activeRoomConflict = activeRoom ? getRoomConflict(activeRoom) : null;
  const recovery = activeRoomConflict ? checkInRecovery(activeRoomConflict.reason) : null;

  if (!isOpen) return null;

  if (isLoadingArrivals && roomsState.length === 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl border border-slate-200 space-y-4">
          <VsIcon name="refresh" className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <h3 id={titleId} className="text-base font-bold text-slate-900 text-balance">
            Đang tải danh sách phòng đoàn...
          </h3>
          <p className="text-xs text-slate-500 text-pretty">
            Đang đồng bộ dữ liệu đoàn #{groupCode} để chuẩn bị làm thủ tục check-in.
          </p>
        </div>
      </div>
    );
  }

  if (roomsState.length === 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl border border-slate-200 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mx-auto">
            <VsIcon name="warning" className="text-2xl" />
          </div>
          <h3 id={titleId} className="text-base font-bold text-slate-900 text-balance">
            Không có phòng chờ nhận
          </h3>
          <p className="text-xs text-slate-500 text-pretty">
            Không tìm thấy phòng nào có trạng thái chờ nhận thuộc đoàn #{groupCode}. Có thể đoàn đã được nhận phòng trước đó.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition cursor-pointer min-h-[44px]"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    );
  }

  const totalGuests = roomsState.reduce((sum, r) => sum + r.guests.length, 0);
  const activeGuest = activeRoom.guests[activeRoom.activeGuestIndex] || activeRoom.guests[0];
  const activeGuestLabel =
    activeRoom.activeGuestIndex === 0
      ? "Khách 1 (Chính)"
      : `Khách ${activeRoom.activeGuestIndex + 1}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <VsIcon name="badge" className="text-xl" />
            </div>
            <div>
              <h2
                id={titleId}
                className="text-base sm:text-lg font-bold text-slate-900 text-balance"
              >
                {roomsState.length === 1
                  ? `Check-in phòng ${activeRoom?.roomNumber || roomsState[0]?.roomNumber}${activeRoom?.roomType ? ` · ${activeRoom.roomType}` : ""}`
                  : `Check-in đoàn: #${groupCode}`}
              </h2>
              <p id={descId} className="text-xs text-slate-600 text-pretty">
                {roomsState.length === 1
                  ? "Xác thực căn cước / hộ chiếu khách lưu trú và hoàn tất nhận phòng"
                  : "Xác thực căn cước / hộ chiếu cho từng phòng trước khi hoàn tất nhận phòng"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            aria-label="Đóng cửa sổ"
            disabled={isSubmitting}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer disabled:opacity-50 min-h-[44px] min-w-[44px]"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </header>

        {/* TOP ROOM SELECTOR BAR */}
        <section className="border-b border-slate-200 bg-slate-100/70 px-6 py-2.5 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1 whitespace-nowrap">
              {roomsState.length > 1 ? "Phòng đoàn:" : "Phòng nhận:"}
            </span>
            {roomsState.map((r, idx) => {
              const isActive = idx === activeRoomIndex;
              const hasCccd = Boolean(r.guests[0]?.identityNumber?.trim());
              const conflict = getRoomConflict(r);
              const hasIssue = Boolean(conflict);

              return (
                <button
                  key={r.reservationId}
                  type="button"
                  onClick={() => setActiveRoomIndex(idx)}
                  disabled={isSubmitting || isRefreshing}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer min-h-[40px] ${
                    isActive
                      ? "bg-blue-700 text-white shadow-xs ring-2 ring-blue-300"
                      : hasIssue
                        ? "bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100/80"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      hasIssue
                        ? "bg-amber-500 animate-pulse"
                        : hasCccd
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                    }`}
                  />
                  <span>Phòng {r.roomNumber}</span>
                  {hasIssue && (
                    <span
                      className={`rounded-md px-1.5 py-0.2 text-xs font-black border ${
                        conflict?.type === "CONFLICTING_STAY" || conflict?.type === "OCCUPIED"
                          ? "bg-sky-100 text-sky-900 border-sky-300"
                          : conflict?.type === "PROCESSING"
                            ? "bg-amber-100 text-amber-950 border-amber-300"
                            : "bg-rose-100 text-rose-950 border-rose-300"
                      }`}
                    >
                      {conflict?.type === "PROCESSING" ? "Chờ dọn" : conflict?.type === "CONFLICTING_STAY" || conflict?.type === "OCCUPIED" ? "Đang có khách" : checkInRecovery(conflict?.reason || "").label}
                    </span>
                  )}
                  <span
                    className={`rounded-md px-1.5 py-0.2 text-xs ${
                      isActive
                        ? "bg-blue-800 text-blue-100"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.guests.length} khách
                  </span>
                </button>
              );
            })}

            {/* Nút + Thêm phòng */}
            <button
              type="button"
              onClick={() => {
                setSelectedAddRoomIds(new Set());
                setAddRoomSearch("");
                setAddRoomFloorFilter("all");
                setAddRoomTypeFilter("all");
                setIsAddRoomModalOpen(true);
              }}
              disabled={isSubmitting || isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-purple-400 bg-purple-50/80 px-3 py-1.5 text-xs font-bold text-purple-900 hover:bg-purple-100 hover:border-purple-600 transition cursor-pointer min-h-[40px] whitespace-nowrap shadow-2xs shrink-0"
              title="Bổ sung thêm phòng khả dụng vào đợt nhận phòng đoàn này"
            >
              <VsIcon name="add" className="text-base text-purple-700" />
              <span>+ Thêm phòng</span>
            </button>
          </div>
        </section>

        {/* MODAL MAIN CONTENT */}
        <main inert={isSubmitting} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {(completedIds.size > 0 || Object.keys(failedRoomMap).length > 0) && (
            <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-base text-slate-900">
              <p className="text-pretty">
                Đã nhận {completedIds.size} phòng · Còn {roomsState.length} phòng chưa nhận.
                {Object.keys(failedRoomMap).length > 0 && " Chọn phòng có lỗi để xử lý. Thông tin khách đã nhập vẫn được giữ."}
              </p>
              <button type="button" onClick={() => void handleRefreshStatus()} disabled={isRefreshing || isSubmitting}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-base font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50">
                {isRefreshing ? "Đang cập nhật..." : "Cập nhật trạng thái"}
              </button>
            </div>
          )}
          {refreshError && <p role="alert" className="text-base text-rose-800 text-pretty">Không cập nhật được: {refreshError}</p>}
          {excludedRooms.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <VsIcon name="warning" className="text-base text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <p className="font-bold text-pretty">
                    Có {excludedRooms.length} phòng trong đoàn chưa kích hoạt hoặc chưa có QR (đã ẩn khỏi tab nhận phòng để tránh lỗi):
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {excludedRooms.map(({ room, reason }) => (
                      <div
                        key={room.reservationId}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-2xs"
                      >
                        <span className="font-bold">Phòng {room.roomNumber || room.reservationCode}</span>
                        <span className="text-amber-700">({reason})</span>
                        <button
                          type="button"
                          onClick={() => {
                            setReassigningItem(room);
                            setTargetSwapRoomId("");
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer min-h-[28px]"
                        >
                          <VsIcon name="swap_horiz" className="text-xs" />
                          <span>Đổi phòng</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-amber-700 font-medium text-pretty pt-0.5">
                    💡 Lễ tân có thể bấm &quot;Đổi phòng&quot; để gán sang phòng khả dụng khác có sẵn mã QR trước khi nhận phòng.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!activeRoom ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 mb-4">
                <VsIcon name="group_add" className="text-3xl" />
              </div>
              <h3 className="text-base font-bold text-slate-800 text-balance mb-2">
                {roomsState.length === 0
                  ? `Đợt nhận phòng đoàn ${groupCode ? `(#${groupCode})` : ""}`
                  : "Không có phòng nào đủ điều kiện nhận phòng ngay"}
              </h3>
              <p className="text-xs text-slate-600 max-w-md text-pretty mb-6">
                {roomsState.length === 0
                  ? "Chưa có phòng nào trong đợt nhận phòng này. Vui lòng bấm '+ Thêm phòng' để chọn các phòng trống làm thủ tục check-in."
                  : "Tất cả các phòng trong đoàn hiện chưa kích hoạt hoặc chưa có mã QR khả dụng. Vui lòng đổi sang phòng khả dụng khác từ danh sách phía trên."}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAddRoomIds(new Set());
                    setAddRoomSearch("");
                    setAddRoomFloorFilter("all");
                    setAddRoomTypeFilter("all");
                    setIsAddRoomModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs transition cursor-pointer min-h-[44px]"
                >
                  <VsIcon name="add" className="text-base" />
                  <span>+ Thêm phòng ngay</span>
                </button>
                <button
                  type="button"
                  onClick={handleSafeClose}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[44px]"
                >
                  <VsIcon name="arrow_back" className="text-base" />
                  <span>Quay lại</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Room In-Place Resolution Banner */}
              {activeRoomConflict && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50/95 p-4 text-base shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <VsIcon name="warning" className="text-xl text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-amber-950 text-base text-balance">
                          Phòng {activeRoom.roomNumber} · {activeRoomConflict.type === "PROCESSING" ? "Chờ dọn buồng" : activeRoomConflict.type === "CONFLICTING_STAY" || activeRoomConflict.type === "OCCUPIED" ? "Đang có khách" : recovery?.label}
                        </p>
                        {activeRoomConflict.type === "CHECK_IN_FAILED" && <p className="text-amber-900 text-pretty">{recovery?.guidance}</p>}
                        <p className="text-amber-800 font-medium text-pretty">
                          {activeRoomConflict.reason}
                        </p>
                        {activeRoomConflict.stay && (
                          <p className="text-xs text-amber-900 font-semibold pt-0.5">
                            Lưu trú hiện tại: <span className="font-bold text-slate-900">{activeRoomConflict.stay.guestDisplayName}</span>
                            {activeRoomConflict.stay.plannedCheckOutAt
                              ? ` · Trả phòng dự kiến: ${toDisplayVnDate(activeRoomConflict.stay.plannedCheckOutAt)}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(activeRoomConflict.type === "CONFLICTING_STAY" || activeRoomConflict.type === "OCCUPIED" || recovery?.action === "settlement") && (
                        <button
                          type="button"
                          onClick={() => void handleOpenSettlement()}
                          disabled={isOpeningSettlement}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-base font-bold text-white shadow-xs hover:bg-emerald-800 transition cursor-pointer min-h-[44px] disabled:opacity-50 whitespace-nowrap"
                        >
                          <VsIcon
                            name={isOpeningSettlement ? "progress_activity" : "receipt_long"}
                            className={`text-base ${isOpeningSettlement ? "animate-spin" : ""}`}
                          />
                          <span>Rà soát hoá đơn</span>
                        </button>
                      )}
                      {activeRoomConflict.type === "PROCESSING" && activeRoomConflict.room && (
                        <button
                          type="button"
                          onClick={() => void handleConfirmRoomCleanReady(activeRoomConflict.room!)}
                          disabled={isMarkingReady}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-base font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer min-h-[44px] disabled:opacity-50 whitespace-nowrap"
                        >
                          <VsIcon name="check_circle" className="text-base" />
                          <span>Xác nhận phòng đã dọn sạch</span>
                        </button>
                      )}
                      {activeRoomConflict.type === "CHECK_IN_FAILED" && !["permission", "settlement", "swap"].includes(recovery?.action || "") && (
                        <button type="button" onClick={() => void handleRefreshStatus()} disabled={isRefreshing || isSubmitting}
                          className="min-h-11 rounded-xl border border-amber-400 bg-white px-3 text-base font-semibold text-amber-950 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50">
                          {isRefreshing ? "Đang cập nhật..." : "Cập nhật đặt phòng"}
                        </button>
                      )}
                      {(activeRoomConflict.type !== "CHECK_IN_FAILED" || recovery?.action === "settlement" || recovery?.action === "swap") && <button
                        type="button"
                        onClick={handleOpenSwapModalForActiveRoom}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[44px] whitespace-nowrap"
                      >
                        <VsIcon name="swap_horiz" className="text-base" />
                        <span>Đổi sang phòng khác</span>
                      </button>
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* Active Room Sub-banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-900 text-sm sm:text-base">
                    Phòng {activeRoom.roomNumber}
                  </span>
                  {activeRoom.roomType && (
                    <span className="text-xs font-semibold text-slate-600">
                      · Hạng {activeRoom.roomType}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 whitespace-nowrap">
                    <span>{activeRoom.guests.length} khách trong phòng</span>
                  </span>

                  {/* Nút Đổi phòng (Ngoại lệ) trực tiếp tại đây */}
                  <button
                    type="button"
                    onClick={handleOpenSwapModalForActiveRoom}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50/60 hover:bg-purple-100 hover:border-purple-400 px-3 py-1 text-xs font-bold text-purple-900 transition shadow-2xs cursor-pointer min-h-[32px] whitespace-nowrap"
                    title="Đổi sang phòng khác (hỗ trợ ngoại lệ chọn khác loại phòng)"
                  >
                    <VsIcon name="swap_horiz" className="text-sm text-purple-700" />
                    <span>Đổi phòng (Ngoại lệ)</span>
                  </button>

                  {/* Nút Bỏ phòng (khi đoàn có >= 2 phòng) */}
                  {roomsState.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveActiveRoom()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-600 px-2 py-1 text-xs font-semibold shadow-2xs transition cursor-pointer min-h-[30px] whitespace-nowrap"
                      title="Bỏ phòng này khỏi đợt nhận phòng đoàn"
                    >
                      <VsIcon name="delete" className="text-xs text-rose-500" />
                      <span>Bỏ phòng</span>
                    </button>
                  )}
                </div>

            {/* Quick Switch Slot Button */}
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap mr-1">
                Vị trí quét:
              </span>
              {activeRoom.guests.map((_, gIdx) => (
                <button
                  key={gIdx}
                  type="button"
                  onClick={() =>
                    setRoomsState((prev) => {
                      const next = [...prev];
                      next[activeRoomIndex] = {
                        ...next[activeRoomIndex],
                        activeGuestIndex: gIdx,
                      };
                      return next;
                    })
                  }
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer min-h-[32px] whitespace-nowrap ${
                    activeRoom.activeGuestIndex === gIdx
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {gIdx === 0 ? "Khách 1" : `Khách ${gIdx + 1}`}
                </button>
              ))}
              <button
                type="button"
                onClick={handleAddGuest}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-400 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 transition cursor-pointer min-h-[32px] whitespace-nowrap"
              >
                <VsIcon name="add" className="text-xs" />
                <span>Thêm khách</span>
              </button>
            </div>
          </div>

          {/* STAY CONTACT & CHECKOUT DATE BAR */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <VsIcon name="calendar_today" className="text-base" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block leading-tight">
                  Liên hệ & Hạn trả phòng
                </span>
                <span className="text-xs text-slate-500">
                  Thông tin lưu trú của Phòng {activeRoom.roomNumber}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* SĐT khách */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs">
                <span className="font-bold text-slate-600 uppercase tracking-wider text-xs whitespace-nowrap">SĐT:</span>
                <input
                  type="tel"
                  placeholder="09xx..."
                  value={activeRoom.guests[0]?.phone || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRoomsState((prev) => {
                      const next = [...prev];
                      const r = { ...next[activeRoomIndex] };
                      const guests = [...r.guests];
                      if (guests[0]) {
                        guests[0] = { ...guests[0], phone: val };
                      }
                      r.guests = guests;
                      next[activeRoomIndex] = r;
                      return next;
                    });
                  }}
                  className="w-28 sm:w-32 bg-transparent text-xs font-semibold text-slate-900 outline-none"
                />
              </div>

              {/* Hạn trả phòng */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs">
                <span className="font-bold text-slate-600 uppercase tracking-wider text-xs whitespace-nowrap">Hạn trả:</span>
                <input
                  type="datetime-local"
                  value={activeRoom.plannedCheckOutAt ? activeRoom.plannedCheckOutAt.slice(0, 16) : ""}
                  onChange={(e) => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : "";
                    setRoomsState((prev) => {
                      const next = [...prev];
                      next[activeRoomIndex] = {
                        ...next[activeRoomIndex],
                        plannedCheckOutAt: val,
                      };
                      return next;
                    });
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none cursor-pointer"
                />
              </div>

              {/* Nút áp dụng ngày trả phòng cho tất cả phòng nếu đoàn có > 1 phòng */}
              {roomsState.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentOut = activeRoom.plannedCheckOutAt;
                    if (!currentOut) return;
                    setRoomsState((prev) =>
                      prev.map((r) => ({ ...r, plannedCheckOutAt: currentOut })),
                    );
                    void showSuccessAlert(
                      "Đã áp dụng",
                      `Đã đồng bộ hạn trả phòng cho tất cả ${roomsState.length} phòng trong đoàn.`,
                    );
                  }}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded-lg transition cursor-pointer whitespace-nowrap"
                  title="Đồng bộ thời hạn trả phòng này cho tất cả các phòng trong đoàn"
                >
                  Áp dụng cho cả đoàn
                </button>
              )}
            </div>
          </section>

          {/* SCANNER TABS & WORKSPACE */}
          <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
                Công cụ nạp CCCD / Hộ chiếu cho {activeGuestLabel}:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIntakeMethod("scanner")}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] ${
                    intakeMethod === "scanner"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <VsIcon name="devices" className="text-sm" />
                  <span>Máy quét CCCD</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeMethod("mobile")}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] ${
                    intakeMethod === "mobile"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <VsIcon name="smartphone" className="text-sm" />
                  <span>Quét bằng điện thoại</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeMethod("upload")}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] ${
                    intakeMethod === "upload"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <VsIcon name="upload_file" className="text-sm" />
                  <span>Chọn file ảnh</span>
                </button>
              </div>
            </div>

            {/* Active tool display */}
            <div>
              {intakeMethod === "scanner" && (
                <CccdCheckInPanel
                  hotelId={hotelId}
                  onCapture={handleCapture}
                  activeGuestLabel={`Phòng ${activeRoom.roomNumber} · ${activeGuestLabel}`}
                  autoRequestScanKey={activeRoom.activeGuestIndex}
                />
              )}
              {intakeMethod === "mobile" && (
                <MobileCccdScan
                  hotelId={hotelId}
                  onCapture={handleCapture}
                  targetContext={`room_${activeRoom.roomId}`}
                  targetLabel={`Phòng ${activeRoom.roomNumber}`}
                  showSetupLink={false}
                />
              )}
              {intakeMethod === "upload" && (
                <DesktopDocumentOcrUpload
                  hotelId={hotelId}
                  onCaptures={handleMultipleCaptures}
                />
              )}
            </div>
          </section>

          {/* GUEST LIST TABLE FOR ACTIVE ROOM */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Danh sách khách Phòng {activeRoom.roomNumber} ({activeRoom.guests.length} khách)
              </h3>
              <button
                type="button"
                onClick={handleAddGuest}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-600 bg-white px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 transition cursor-pointer min-h-[36px]"
              >
                <VsIcon name="person_add" className="text-sm" />
                <span>+ Thêm khách ở cùng</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="w-10 px-3 py-2 text-center">#</th>
                    <th scope="col" className="px-3 py-2 min-w-[160px]">Họ và tên *</th>
                    <th scope="col" className="px-3 py-2 min-w-[140px]">Số CCCD / Hộ chiếu</th>
                    <th scope="col" className="px-3 py-2 min-w-[130px]">Quốc tịch</th>
                    <th scope="col" className="px-3 py-2 min-w-[140px]">Quê quán / Địa chỉ</th>
                    <th scope="col" className="px-3 py-2 min-w-[130px]">Ngày sinh</th>
                    <th scope="col" className="px-3 py-2 min-w-[90px]">Giới tính</th>
                    <th scope="col" className="w-12 px-3 py-2 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeRoom.guests.map((guest, gIdx) => {
                    const isPrimary = gIdx === 0;

                    return (
                      <tr
                        key={gIdx}
                        className={`transition-colors ${
                          activeRoom.activeGuestIndex === gIdx
                            ? "bg-blue-50/30"
                            : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td className="px-3 py-2 text-center text-xs font-bold text-slate-500">
                          {gIdx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            required={isPrimary}
                            value={guest.fullName}
                            placeholder={isPrimary ? "Họ và tên khách chính *" : "Họ và tên khách"}
                            onChange={(e) =>
                              handleGuestFieldChange(gIdx, "fullName", e.target.value)
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={guest.identityNumber || ""}
                            placeholder="Số CCCD / Hộ chiếu"
                            onChange={(e) =>
                              handleGuestFieldChange(gIdx, "identityNumber", e.target.value)
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={matchBcaNationalityCode(
                              guest.nationality || "Việt Nam",
                              nationalities,
                            )}
                            onChange={(e) =>
                              handleGuestFieldChange(gIdx, "nationality", e.target.value)
                            }
                            className={cellSelectClass}
                          >
                            <option value="">
                              {nationalitiesQuery.isPending
                                ? "Đang tải..."
                                : "Chọn quốc tịch"}
                            </option>
                            {nationalities.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.nameVi}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={guest.residencePlace || ""}
                            placeholder="Quê quán / Địa chỉ"
                            onChange={(e) =>
                              handleGuestFieldChange(gIdx, "residencePlace", e.target.value)
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <VnDateInput
                            value={guest.dateOfBirth || ""}
                            onChange={(val) =>
                              handleGuestFieldChange(gIdx, "dateOfBirth", val)
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={guest.gender || "Nam"}
                            onChange={(e) =>
                              handleGuestFieldChange(gIdx, "gender", e.target.value)
                            }
                            className={cellSelectClass}
                          >
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                            <option value="Khác">Khác</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          {isPrimary ? (
                            <span className="text-xs font-semibold text-slate-400">
                              Chính
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRemoveGuest(gIdx)}
                              aria-label={`Xóa khách ${gIdx + 1}`}
                              className="rounded-lg p-1 text-blue-700 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                            >
                              <VsIcon name="delete" className="text-base" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>

        {/* PROGRESS BAR IF SUBMITTING */}
        {isSubmitting && submitProgress && (
          <div className="border-t border-blue-200 bg-blue-50 px-6 py-2">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-1">
              <span>Đang nhận phòng & lưu hồ sơ khách lưu trú...</span>
              <span>
                {submitProgress.current} / {submitProgress.total} phòng
              </span>
            </div>
            <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-200"
                style={{
                  width: `${Math.round((submitProgress.current / submitProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* FOOTER */}
        <footer className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
            <span>
              Tổng cộng: <strong>{roomsState.length} phòng</strong> · <strong>{totalGuests} khách</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSafeClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              Hủy bỏ
            </button>

            {activeRoomIndex > 0 && (
              <button
                type="button"
                onClick={() => setActiveRoomIndex((curr) => curr - 1)}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[44px]"
              >
                ← Phòng trước
              </button>
            )}

            {activeRoomIndex < roomsState.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveRoomIndex((curr) => curr + 1)}
                disabled={isSubmitting}
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer min-h-[44px]"
              >
                Tiếp tục phòng {roomsState[activeRoomIndex + 1]?.roomNumber} →
              </button>
            )}

            <button
              type="button"
              onClick={handleSubmitGroupCheckIn}
              disabled={isSubmitting || isRefreshing || isSwappingRoom || isMarkingReady || roomsState.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <VsIcon name="login" className="text-base" />
              <span>
                {isSubmitting
                  ? "Đang xử lý..."
                  : roomsState.length === 1
                    ? `Hoàn tất nhận phòng ${roomsState[0]?.roomNumber}`
                    : `Nhận ${roomsState.length} phòng${completedIds.size > 0 ? " còn lại" : " trong đoàn"}`}
              </span>
            </button>
          </div>
        </footer>
      </div>

      {/* QUICK ROOM SWAP MODAL */}
      {reassigningItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="swap-room-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 id="swap-room-title" className="text-base font-bold text-slate-900 text-balance">
              Đổi phòng cho khách {reassigningItem.guestDisplayName}
            </h3>
            <p className="mt-1 text-xs text-slate-500 text-pretty">
              Mã đặt phòng: <span className="font-semibold text-slate-700">{reassigningItem.reservationCode}</span> · Phòng hiện tại:{" "}
              <span className="font-semibold text-slate-700">{reassigningItem.roomNumber || "Chưa gán"}</span>
              {targetRoomTypeLabel ? (
                <> · Hạng phòng: <span className="font-semibold text-blue-700">{targetRoomTypeLabel}</span></>
              ) : null}
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label htmlFor="swap-target-room" className="block text-xs font-bold text-slate-700">
                  {allowDifferentRoomType
                    ? "Chọn phòng khả dụng (Bao gồm ngoại lệ khác loại)"
                    : `Chọn phòng khả dụng cùng loại${targetRoomTypeLabel ? ` (${targetRoomTypeLabel})` : ""}`}
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-purple-700 hover:text-purple-900 select-none">
                  <input
                    type="checkbox"
                    checked={allowDifferentRoomType}
                    onChange={(e) => {
                      setAllowDifferentRoomType(e.target.checked);
                      if (!e.target.checked && isExceptionSwap) {
                        setTargetSwapRoomId("");
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span>Chọn loại phòng khác (Ngoại lệ)</span>
                </label>
              </div>

              <select
                id="swap-target-room"
                value={targetSwapRoomId}
                onChange={(e) => setTargetSwapRoomId(e.target.value)}
                className={cellSelectClass}
              >
                <option value="">-- Vui lòng chọn phòng trống --</option>
                {sameTypeAvailableRooms.length > 0 && (
                  <optgroup label={`Cùng loại phòng (${targetRoomTypeLabel || "Tiêu chuẩn"}) · ${sameTypeAvailableRooms.length} phòng`}>
                    {sameTypeAvailableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Phòng {room.roomNumber} ({room.type || room.roomTypeName || targetRoomTypeLabel || "Tiêu chuẩn"}) · Tầng {room.floor || "-"}
                      </option>
                    ))}
                  </optgroup>
                )}
                {allowDifferentRoomType && differentTypeAvailableRooms.length > 0 && (
                  <optgroup label={`Loại phòng khác (Ngoại lệ) · ${differentTypeAvailableRooms.length} phòng`}>
                    {differentTypeAvailableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Phòng {room.roomNumber} ({room.type || room.roomTypeName || "Khác loại"}) · Tầng {room.floor || "-"} [Ngoại lệ]
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {sameTypeAvailableRooms.length === 0 && !allowDifferentRoomType && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold text-pretty">
                    {targetRoomTypeLabel
                      ? `Hiện không có phòng trống nào cùng loại (${targetRoomTypeLabel}) sẵn sàng để đổi.`
                      : "Hiện không có phòng trống nào cùng loại sẵn sàng để đổi."}
                  </p>
                  {differentTypeAvailableRooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAllowDifferentRoomType(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer"
                    >
                      <VsIcon name="tune" className="text-sm" />
                      <span>Bật ngoại lệ để chọn loại phòng khác ({differentTypeAvailableRooms.length} phòng khả dụng)</span>
                    </button>
                  )}
                </div>
              )}

              {isExceptionSwap && chosenSwapRoom && (
                <div className="rounded-xl border border-purple-300 bg-purple-50/90 p-3 text-xs text-purple-950 flex items-start gap-2.5 animate-in fade-in">
                  <VsIcon name="info" className="text-base text-purple-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-balance">
                      Ngoại lệ chọn khác loại phòng: {targetRoomTypeLabel || "Gốc"} ➔ {chosenSwapRoom.type || chosenSwapRoom.roomTypeName || "Khác loại"}
                    </p>
                    <p className="text-purple-800 text-pretty">
                      Phòng {chosenSwapRoom.roomNumber} thuộc loại phòng khác với đặt trước ban đầu của khách đoàn.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setReassigningItem(null);
                  setAllowDifferentRoomType(false);
                  setTargetSwapRoomId("");
                }}
                disabled={isSwappingRoom}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[44px]"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmRoomSwap}
                disabled={isSwappingRoom || !targetSwapRoomId}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {isSwappingRoom && <VsIcon name="progress_activity" className="animate-spin text-base" />}
                <span>{isExceptionSwap ? "Xác nhận đổi ngoại lệ" : "Xác nhận đổi phòng"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-place Checkout & Settle Folio Modal */}
      {settlementTarget && (
        <RoomCheckoutSettlementModal
          isOpen={Boolean(settlementTarget)}
          onClose={() => setSettlementTarget(null)}
          hotelId={hotelId}
          room={settlementTarget.room}
          stay={settlementTarget.stay}
          onCheckoutSuccess={async () => {
            setSettlementTarget(null);
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            await allRoomsQuery.refetch();
            await availableRoomsQuery.refetch();
            if (activeRoom?.reservationId) {
              setFailedRoomMap((prev) => {
                const next = { ...prev };
                delete next[activeRoom.reservationId];
                return next;
              });
            }
          }}
        />
      )}

      {/* ADD ROOM TO GROUP MODAL */}
      {isAddRoomModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-room-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 id="add-room-title" className="text-base font-bold text-slate-900 text-balance">
                  Thêm phòng vào đợt nhận phòng đoàn
                </h3>
                <p className="text-xs text-slate-500 text-pretty mt-0.5">
                  Chọn các phòng trống khả dụng từ danh sách bên dưới để bổ sung vào đoàn
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddRoomModalOpen(false);
                  setSelectedAddRoomIds(new Set());
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer min-h-[36px] min-w-[36px]"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </div>

            {/* Filter controls */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[160px]">
                <VsIcon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder="Tìm số phòng, loại phòng..."
                  value={addRoomSearch}
                  onChange={(e) => setAddRoomSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                />
              </div>
              <select
                value={addRoomFloorFilter}
                onChange={(e) => setAddRoomFloorFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
              >
                <option value="all">Tất cả tầng</option>
                {addRoomFloors.map((f) => (
                  <option key={f} value={f}>
                    Tầng {f}
                  </option>
                ))}
              </select>
              <select
                value={addRoomTypeFilter}
                onChange={(e) => setAddRoomTypeFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
              >
                <option value="all">Tất cả loại phòng</option>
                {addRoomTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Room list */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[200px] max-h-[50vh]">
              {candidateRoomsToAdd.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs sm:text-sm">
                  Không tìm thấy phòng trống nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {candidateRoomsToAdd.map((room) => {
                    const isSelected = selectedAddRoomIds.has(room.id);
                    const roomTypeLabel = room.type || room.roomTypeName || "Tiêu chuẩn";
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => {
                          setSelectedAddRoomIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(room.id)) {
                              next.delete(room.id);
                            } else {
                              next.add(room.id);
                            }
                            return next;
                          });
                        }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-300 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-sm text-slate-900">
                            Phòng {room.roomNumber}
                          </span>
                          <span
                            className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs ${
                              isSelected
                                ? "bg-purple-600 border-purple-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <VsIcon name="check" className="text-xs" />}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <p className="font-semibold text-purple-900 truncate">{roomTypeLabel}</p>
                          <p>Tầng {room.floor || "-"} · Sẵn sàng</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 bg-slate-50/60">
              <span className="text-xs font-bold text-slate-700">
                Đã chọn: <strong className="text-purple-700">{selectedAddRoomIds.size} phòng</strong>
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddRoomModalOpen(false);
                    setSelectedAddRoomIds(new Set());
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[40px]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddRooms}
                  disabled={selectedAddRoomIds.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50 min-h-[40px]"
                >
                  <VsIcon name="add" className="text-base" />
                  <span>Xác nhận thêm {selectedAddRoomIds.size} phòng</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
