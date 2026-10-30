"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from "@tanstack/react-table";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  escapeHtml,
  formatAdjustReservationDatesConfirmHtml,
  formatCheckOutConfirmHtml,
  formatEarlyCheckInConfirmHtml,
  formatExtendStayConfirmHtml,
  formatRoomDirtyWarningHtml,
  formatRoomMoveConfirmHtml,
  formatRoomSwapConfirmHtml,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  SwalVietSage,
} from "@/libs/swal";
import {
  addDaysYmd,
  diffDaysYmd,
  getVietnamToday as getTodayInVietnam,
} from "@/libs/vietnam-temporal";
import type {
  HotelArrival,
  HotelOpsPage,
  HotelRoomSummary,
  RoomPlanBlock,
  RoomPlanRoom,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { roomPlanRepository } from "@/features/hotel-ops/repositories/room-plan-repository";
import { roomPlanResource } from "@/features/hotel-ops/resources/room-plan-resource";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { useRoomOrderStore } from "@/features/hotel-ops/store/room-order-store";
import { EditReservationModal } from "../edit-reservation-modal";

export type TapeChartViewMode = "week" | "biweek";

export interface ActiveBlockResize {
  block: RoomPlanBlock;
  direction: "start" | "end";
  currentGhostStartDay: string;
  currentGhostEndDay: string;
  nights: number;
  initialNights: number;
  diffNights: number;
  conflictWarning: string | null;
}

export interface DraftBookingSelection {
  roomId: string;
  roomNumber: string;
  room: RoomPlanRoom;
  rooms: RoomPlanRoom[];
  startDay: string;
  endDay: string;
  nights: number;
}

export interface ActiveDragRange {
  anchorRoom: RoomPlanRoom;
  anchorDay: string;
  currentRoom: RoomPlanRoom;
  currentDay: string;
}

export interface ActiveDraftAdjust {
  mode: "days" | "rooms" | "both" | "move";
  anchorRoom: RoomPlanRoom;
  anchorDay: string;
  initialRooms: RoomPlanRoom[];
  initialStartDay: string;
  initialEndDay: string;
  initialNights: number;
  startPos: { x: number; y: number };
}

export interface TapeChartViewProps {
  hotelId: string;
  rooms?: HotelRoomSummary[];
  arrivalsList?: HotelArrival[];
  businessDate?: string;
  initialStartDate?: string;
  initialViewMode?: TapeChartViewMode | "month";
  readOnly?: boolean;
  roleScope?: "owner" | "tenant" | "staff";
  canCheckInStay?: boolean;
  canManageRooms?: boolean;
  onOpenGroupCheckIn?: (groupCode: string) => void;
  onOpenCheckIn?: (room: HotelRoomSummary | RoomPlanRoom, initialDate?: string) => void;
  onCheckInReservation?: (reservation: RoomPlanBlock) => void | Promise<void>;
  onOpenQuickReservation?: (
    room?: HotelRoomSummary | RoomPlanRoom,
    initialDate?: string,
    initialEndDate?: string,
  ) => void;
  onOpenBulkReservation?: (
    selectedRooms: RoomPlanRoom[],
    initialDate: string,
    initialEndDate: string,
  ) => void;
  onCheckOutStay?: (stayId: string, roomNumber: string) => Promise<void>;
  onSelectRoom?: (room: HotelRoomSummary | RoomPlanRoom) => void;
  onToggleRoomBlocked?: (room: HotelRoomSummary | RoomPlanRoom) => Promise<void> | void;
  onProcessingRoomClick?: (room: HotelRoomSummary | RoomPlanRoom) => Promise<void> | void;
  onRefresh?: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onBusinessDateChange?: (date: string) => void;
}

// Channel badge colors (kept inline for tape-chart styling)

const CHANNEL_BADGES: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  "booking.com": {
    bg: "bg-[#003580]",
    text: "text-white",
    border: "border-blue-900",
    label: "Booking.com",
  },
  agoda: {
    bg: "bg-[#00a599]",
    text: "text-white",
    border: "border-teal-700",
    label: "Agoda",
  },
  airbnb: {
    bg: "bg-[#ff385c]",
    text: "text-white",
    border: "border-rose-700",
    label: "Airbnb",
  },
  traveloka: {
    bg: "bg-[#0194f3]",
    text: "text-white",
    border: "border-sky-700",
    label: "Traveloka",
  },
  "trực tiếp": {
    bg: "bg-[#123d2a]",
    text: "text-white",
    border: "border-emerald-800",
    label: "Trực tiếp",
  },
  direct: {
    bg: "bg-[#123d2a]",
    text: "text-white",
    border: "border-emerald-800",
    label: "Trực tiếp",
  },
  ota: {
    bg: "bg-[#4f46e5]",
    text: "text-white",
    border: "border-indigo-800",
    label: "OTA",
  },
};

function getChannelBadge(channel?: string | null): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  const key = (channel || "trực tiếp").trim().toLowerCase();
  if (key.includes("booking")) return CHANNEL_BADGES["booking.com"];
  if (key.includes("agoda")) return CHANNEL_BADGES["agoda"];
  if (key.includes("airbnb")) return CHANNEL_BADGES["airbnb"];
  if (key.includes("traveloka")) return CHANNEL_BADGES["traveloka"];
  if (
    key === "co" ||
    key.includes("corporate") ||
    key.includes("doanh nghiệp") ||
    key.includes("công ty")
  ) {
    return {
      bg: "bg-indigo-100",
      text: "text-indigo-800",
      border: "border-indigo-300",
      label:
        channel && channel.trim() !== "CO" && channel.trim() !== "CORPORATE"
          ? channel.trim()
          : "Doanh nghiệp (CO)",
    };
  }
  if (
    key === "ta" ||
    key.includes("travel_agency") ||
    key.includes("đại lý") ||
    key.includes("lữ hành")
  ) {
    return {
      bg: "bg-purple-100",
      text: "text-purple-800",
      border: "border-purple-300",
      label:
        channel && channel.trim() !== "TA" && channel.trim() !== "TRAVEL_AGENCY"
          ? channel.trim()
          : "Đại lý (TA)",
    };
  }
  if (key.includes("trực tiếp") || key.includes("direct")) return CHANNEL_BADGES["trực tiếp"];
  if (CHANNEL_BADGES[key]) return CHANNEL_BADGES[key];
  return {
    bg: "bg-slate-700",
    text: "text-white",
    border: "border-slate-800",
    label: channel ? channel.trim() : "Trực tiếp",
  };
}

function calculateNights(startDay: string, endDay: string): number {
  return Math.max(1, diffDaysYmd(startDay, endDay));
}

function formatDateNum(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length < 3) return ymd;
  return `${parts[2]}/${parts[1]}`;
}

function formatVnd(val?: number | null): string {
  if (typeof val !== "number" || !Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("vi-VN").format(val) + " ₫";
}

type DraggedReservationPayload = {
  blockId: string;
  reservationId: string;
  fromRoomId: string;
  fromRoomNumber: string;
  roomTypeId: string | null;
  roomTypeName: string | null;
  guestName: string;
  startDate: string;
  endDate: string;
  expectedUpdatedAt: string;
};

interface DraggableRoomRowProps {
  room: RoomPlanRoom;
  daysList: Array<{
    ymd: string;
    dayLabel: string;
    dateNum: string;
    isToday: boolean;
    isWeekend: boolean;
  }>;
  todayYmd?: string;
  readOnly?: boolean;
  roomBlocks: RoomPlanBlock[];
  occupiedRoomDaySet: Set<string>;
  dragOverCellKey: string | null;
  dragOverDayYmd?: string | null;
  handleDragOverCell: (e: React.DragEvent, cellKey: string, dayYmd?: string) => void;
  handleDragLeaveCell: (cellKey: string) => void;
  handleDropOnRoom: (e: React.DragEvent, room: RoomPlanRoom) => void;
  handleDragStart: (e: React.DragEvent, block: RoomPlanBlock) => void;
  setSelectedBlock: (block: RoomPlanBlock) => void;
  onOpenCheckIn?: (room: RoomPlanRoom, ymd: string) => void;
  onSelectRoom?: (room: RoomPlanRoom) => void;
  onToggleRoomBlocked?: (room: RoomPlanRoom) => Promise<void> | void;
  onProcessingRoomClick?: (room: RoomPlanRoom) => Promise<void> | void;
  draftSelection: DraftBookingSelection | null;
  isDraggingRange: boolean;
  activeDragRange?: ActiveDragRange | null;
  draggedBlock?: DraggedReservationPayload | null;
  handleDragEnd?: () => void;
  onStartDragRange: (room: RoomPlanRoom, ymd: string, clientX?: number, clientY?: number) => void;
  onHoverDragDay: (room: RoomPlanRoom, ymd: string, clientY?: number) => void;
  onAdjustDraftDays: (delta: number) => void;
  onConfirmDraft: (draft: DraftBookingSelection) => void;
  onCancelDraft: () => void;
  activeBlockResize?: ActiveBlockResize | null;
  onStartBlockResize?: (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => void;
  onStartDraftAdjust?: (
    mode: "days" | "rooms" | "both" | "move",
    e: React.MouseEvent,
  ) => void;
  onFocusOverdueRoom?: (room: RoomPlanRoom) => void;
}

const EMPTY_BLOCKS: RoomPlanBlock[] = [];

const DraggableRoomRow = memo(function DraggableRoomRow({
  room,
  daysList,
  todayYmd = getTodayInVietnam(),
  readOnly = false,
  roomBlocks,
  occupiedRoomDaySet,
  dragOverCellKey,
  dragOverDayYmd,
  handleDragOverCell,
  handleDragLeaveCell,
  handleDropOnRoom,
  handleDragStart,
  setSelectedBlock,
  onOpenCheckIn,
  onSelectRoom,
  onToggleRoomBlocked,
  onProcessingRoomClick,
  draftSelection,
  isDraggingRange,
  activeDragRange,
  draggedBlock,
  handleDragEnd,
  onStartDragRange,
  onHoverDragDay,
  onAdjustDraftDays,
  onConfirmDraft,
  onCancelDraft,
  activeBlockResize,
  onStartBlockResize,
  onStartDraftAdjust,
  onFocusOverdueRoom,
}: DraggableRoomRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.id, disabled: readOnly });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 25 : undefined,
  };

  const isOccupiedToday = roomBlocks.some(
    (b) => b.kind === "STAY" && b.startDate <= todayYmd && b.endDate > todayYmd,
  );
  const isOverdueRoom =
    room.status === "OVERDUE" ||
    room.physicalStatus === "OVERDUE" ||
    Boolean(room.statusConflictCode?.toUpperCase().includes("OVERDUE")) ||
    roomBlocks.some((b) => b.status === "OVERDUE");

  const isHardVetoRoom =
    room.status === "BLOCKED" ||
    room.status === "MAINTENANCE" ||
    room.status === "OUT_OF_SERVICE";
  const isProcessing =
    room.status === "PROCESSING" ||
    room.status === "DIRTY" ||
    room.status === "CLEANING" ||
    room.status === "INSPECTION";

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-room-row="true"
      data-room-id={room.id}
      onDragOver={(e) => {
        if (readOnly || isHardVetoRoom) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "none";
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const cell = (e.target as HTMLElement | null)?.closest?.('[data-cell-day="true"]');
        const dayYmd = cell?.getAttribute?.("data-day-ymd") || undefined;
        handleDragOverCell(e, room.id, dayYmd);
      }}
      onDrop={(e) => {
        if (readOnly || isHardVetoRoom) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        void handleDropOnRoom(e, room);
      }}
      className={`group flex border-b border-slate-100 hover:bg-slate-50/60 transition min-h-[46px] select-none relative w-full ${
        !readOnly && dragOverCellKey === room.id && !isHardVetoRoom
          ? "bg-emerald-50/20 ring-1 ring-emerald-400/40"
          : isHardVetoRoom
            ? "bg-slate-200/80 hover:bg-slate-200"
            : isProcessing
              ? "bg-amber-100/70 hover:bg-amber-100/90"
              : ""
      }`}
    >
      {/* Left Room Info Column */}
      <div
        {...(!readOnly ? attributes : {})}
        {...(!readOnly ? listeners : {})}
        className={`sticky left-0 z-10 w-48 min-w-[192px] max-w-[192px] shrink-0 border-r border-slate-200 px-3 py-2 flex items-center justify-between shadow-xs ${
          !readOnly ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isHardVetoRoom
            ? "bg-slate-200/90 group-hover:bg-slate-200"
            : isProcessing
              ? "bg-amber-100/90 group-hover:bg-amber-100"
              : "bg-white group-hover:bg-slate-50"
        }`}
        title={!readOnly ? "Kéo thả để đổi thứ tự phòng" : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {onSelectRoom ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRoom(room);
              }}
              className="font-black text-sm text-slate-900 truncate hover:text-emerald-700 transition-colors text-left cursor-pointer"
              title="Nhấn để xem chi tiết phòng"
            >
              P.{room.roomNumber}
            </button>
          ) : (
            <span className="font-black text-sm text-slate-900 truncate">
              P.{room.roomNumber}
            </span>
          )}
          {isHardVetoRoom && (
            onToggleRoomBlocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onToggleRoomBlocked(room);
                }}
                className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-300 hover:bg-slate-400 text-slate-900 whitespace-nowrap transition cursor-pointer"
                title="Nhấn để mở khóa phòng"
              >
                Khóa
              </button>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-300 text-slate-900 whitespace-nowrap">
                Khóa
              </span>
            )
          )}
          {isProcessing && (
            onProcessingRoomClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onProcessingRoomClick(room);
                }}
                className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 whitespace-nowrap transition cursor-pointer"
                title="Nhấn để xác nhận phòng sạch / dọn dẹp"
              >
                Chờ dọn
              </button>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 whitespace-nowrap">
                Chờ dọn
              </span>
            )
          )}
          {isOverdueRoom && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocusOverdueRoom?.(room);
              }}
              className="px-1.5 py-0.5 rounded text-xs font-bold bg-rose-200 hover:bg-rose-300 text-rose-900 border border-rose-300 whitespace-nowrap transition cursor-pointer"
              title="Nhấp để chuyển tới đơn quá hạn của phòng này"
            >
              Quá hạn
            </button>
          )}
          {room.status === "RESERVED" && !isOccupiedToday && !isHardVetoRoom && !isProcessing && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 whitespace-nowrap">
              Đã đặt
            </span>
          )}
          {isOccupiedToday && !isHardVetoRoom && !isProcessing && (
            <span
              className="size-2 rounded-full bg-emerald-500 shrink-0"
              title="Đang có khách lưu trú"
            />
          )}
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase shrink-0 whitespace-nowrap">
          T.{room.floor || 1}
        </span>
      </div>

      {/* Timeline Day Grid with Floating Bookings */}
      <div className="relative flex flex-1 min-w-0 overflow-x-clip">
        {/* Day Cell Grid Lines */}
        {daysList.map((day) => {
          const isCellOccupied = occupiedRoomDaySet.has(`${room.id}:${day.ymd}`);
          const isPastDay = day.ymd < todayYmd;

          const isRoomInDraft = Boolean(
            (draftSelection && draftSelection.rooms.some((r) => r.id === room.id)) ||
              (!draftSelection &&
                activeDragRange &&
                activeDragRange.anchorRoom.id === room.id),
          );

          const effectiveStartDay =
            draftSelection?.startDay ??
            (activeDragRange && activeDragRange.anchorRoom.id === room.id
              ? activeDragRange.anchorDay < activeDragRange.currentDay
                ? activeDragRange.anchorDay
                : activeDragRange.currentDay
              : null);

          const effectiveEndDay =
            draftSelection?.endDay ??
            (activeDragRange && activeDragRange.anchorRoom.id === room.id
              ? addDaysYmd(
                  activeDragRange.anchorDay < activeDragRange.currentDay
                    ? activeDragRange.currentDay
                    : activeDragRange.anchorDay,
                  1,
                )
              : null);

          const isFirstRoomInDraft =
            !draftSelection || draftSelection.rooms[0]?.id === room.id;
          const isLastRoomInDraft =
            !draftSelection ||
            draftSelection.rooms[draftSelection.rooms.length - 1]?.id === room.id;

          const isDraftCell = Boolean(
            !isHardVetoRoom &&
              !isPastDay &&
              isRoomInDraft &&
              effectiveStartDay &&
              effectiveEndDay &&
              day.ymd >= effectiveStartDay &&
              day.ymd < effectiveEndDay,
          );

          const isRoomDndTarget = Boolean(
            !readOnly &&
              !isHardVetoRoom &&
              draggedBlock &&
              dragOverCellKey === room.id,
          );
          const isDndCell = Boolean(
            isRoomDndTarget &&
              draggedBlock &&
              day.ymd >= draggedBlock.startDate &&
              day.ymd < draggedBlock.endDate,
          );
          const isDndConflict = isDndCell && isCellOccupied;

          // Check if cursor is directly hovering over this cell during drag-and-drop
          const isCursorHoveredCell = Boolean(
            !readOnly &&
              !isHardVetoRoom &&
              dragOverCellKey === room.id &&
              dragOverDayYmd === day.ymd,
          );

          const isDraftStart = Boolean(
            effectiveStartDay && day.ymd === effectiveStartDay,
          );
          const isDraftEnd = Boolean(
            effectiveEndDay && addDaysYmd(day.ymd, 1) === effectiveEndDay,
          );

          const isDndStart = Boolean(
            draggedBlock && day.ymd === draggedBlock.startDate,
          );
          const isDndEnd = Boolean(
            draggedBlock && addDaysYmd(day.ymd, 1) === draggedBlock.endDate,
          );

          // Compute frame borders for draft selection (hiện khung rõ ràng ở các ô được kéo vào)
          const draftBorderClasses = isDraftCell
            ? `${isFirstRoomInDraft ? "border-t-2 border-emerald-500" : "border-t border-dashed border-emerald-300/40"} ${
                isLastRoomInDraft ? "border-b-2 border-emerald-500" : "border-b border-dashed border-emerald-300/40"
              } ${isDraftStart ? "border-l-2 border-emerald-500" : ""} ${
                isDraftEnd ? "border-r-2 border-emerald-500" : "border-r border-dashed border-emerald-300/80"
              } bg-emerald-50/80 ${
                isFirstRoomInDraft && isDraftStart ? "rounded-tl-md" : ""
              } ${
                isFirstRoomInDraft && isDraftEnd ? "rounded-tr-md" : ""
              } ${
                isLastRoomInDraft && isDraftStart ? "rounded-bl-md" : ""
              } ${
                isLastRoomInDraft && isDraftEnd ? "rounded-br-md" : ""
              }`
            : "";

          // Compute frame borders for dnd target (kéo thả block đổi phòng)
          const dndBorderClasses = isDndCell
            ? `${isDndConflict ? "border-t-2 border-b-2 border-rose-500 bg-rose-100/75" : "border-t-2 border-b-2 border-emerald-500 bg-emerald-100/75"} ${
                isDndStart
                  ? isDndConflict
                    ? "border-l-2 border-rose-500 rounded-l-md"
                    : "border-l-2 border-emerald-500 rounded-l-md"
                  : ""
              } ${
                isDndEnd
                  ? isDndConflict
                    ? "border-r-2 border-rose-500 rounded-r-md"
                    : "border-r-2 border-emerald-500 rounded-r-md"
                  : isDndConflict
                    ? "border-r border-dashed border-rose-300/80"
                    : "border-r border-dashed border-emerald-300/80"
              }`
            : "";

          return (
            <div
              key={day.ymd}
              data-cell-day="true"
              data-day-ymd={day.ymd}
              onMouseDown={(e) => {
                if (readOnly) return;
                if (e.button !== 0) return;
                if (isCellOccupied || isHardVetoRoom || isPastDay) return;
                e.preventDefault();
                e.stopPropagation();
                onStartDragRange(room, day.ymd, e.clientX, e.clientY);
              }}
              onMouseEnter={(e) => {
                if (!readOnly && isDraggingRange && !isHardVetoRoom && !isPastDay) {
                  onHoverDragDay(room, day.ymd, e.clientY);
                }
              }}
              className={`flex-1 min-w-[100px] relative group/cell select-none transition-colors ${
                isCursorHoveredCell
                  ? "ring-2 ring-inset ring-emerald-600 bg-emerald-100/90 shadow-sm z-20 rounded-md border-r border-emerald-400"
                  : isDraftCell
                    ? draftBorderClasses
                    : isDndCell
                      ? dndBorderClasses
                      : `border-r ${
                          dragOverCellKey === room.id
                            ? "border-slate-300/80 bg-slate-50/50"
                            : "border-slate-100"
                        } ${
                          isHardVetoRoom
                            ? "bg-slate-200/75 cursor-not-allowed"
                            : isProcessing
                              ? "bg-amber-100/60"
                              : day.isToday
                                ? "bg-sky-50/30"
                                : isPastDay
                                  ? "bg-slate-100/40 cursor-default"
                                  : ""
                        }`
              } ${!readOnly && !isCellOccupied && !isHardVetoRoom && !isPastDay ? "cursor-pointer hover:bg-slate-100/50" : ""}`}
            >
              {/* Active cursor hovered cell badge during drag and drop */}
              {isCursorHoveredCell && !isDndConflict && (
                <div className="absolute inset-x-1 top-1 flex items-center justify-center pointer-events-none z-20">
                  <span className="px-1.5 py-0.5 rounded text-xs font-black bg-emerald-600 text-white shadow-xs border border-emerald-500 whitespace-nowrap">
                    ↓ {day.dateNum}
                  </span>
                </div>
              )}

              {/* DND drop target date badge */}
              {isDndCell && !isCursorHoveredCell && (
                <div className="absolute inset-x-1 top-1 flex items-center justify-center pointer-events-none z-10">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-black shadow-2xs border whitespace-nowrap ${
                      isDndConflict
                        ? "bg-rose-50 text-rose-900 border-rose-300"
                        : "bg-emerald-50 text-emerald-900 border-emerald-300"
                    }`}
                  >
                    {isDndConflict ? "⚠️ Trùng lịch" : day.dateNum}
                  </span>
                </div>
              )}

              {!readOnly && !isCellOccupied && !isDraftCell && !isDndCell && !isDraggingRange && !isHardVetoRoom && !isPastDay && (
                <div
                  className="absolute inset-1 hidden group-hover/cell:flex items-center justify-center rounded border border-dashed border-slate-300 bg-white/95 text-slate-700 text-xs font-semibold shadow-2xs transition z-10 pointer-events-none"
                  title={`Click hoặc kéo để giữ phòng P.${room.roomNumber} từ ${day.dateNum}`}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    <span className="text-sm leading-none text-slate-500">+</span>
                    <span className="text-xs uppercase font-bold tracking-tight">Giữ phòng</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Draft Booking Overlay on Secondary / Group Member Rooms */}
        {!readOnly &&
          draftSelection &&
          !isHardVetoRoom &&
          draftSelection.roomId !== room.id &&
          draftSelection.rooms.some((r) => r.id === room.id) &&
          (() => {
            if (
              draftSelection.endDay <= daysList[0].ymd ||
              draftSelection.startDay > daysList[daysList.length - 1].ymd
            ) {
              return null;
            }

            const isSpilloverFromPast = draftSelection.startDay < daysList[0].ymd;
            const isSpilloverToNext = draftSelection.endDay > daysList[daysList.length - 1].ymd;

            const startIndex = isSpilloverFromPast
              ? 0
              : daysList.findIndex((d) => d.ymd >= draftSelection.startDay);
            const endIndex = isSpilloverToNext
              ? -1
              : daysList.findIndex((d) => d.ymd >= draftSelection.endDay);

            const leftPct =
              startIndex === -1 || isSpilloverFromPast ? 0 : (startIndex / daysList.length) * 100;
            const rawWidthPct =
              endIndex === -1 || isSpilloverToNext
                ? ((daysList.length - Math.max(0, startIndex)) / daysList.length) * 100
                : Math.max(
                    (1 / daysList.length) * 100,
                    (Math.max(1, endIndex - Math.max(0, startIndex)) /
                      daysList.length) *
                      100,
                  );
            const widthPct = Math.min(rawWidthPct, Math.max(0, 100 - leftPct));

            const groupRoomIndex = draftSelection.rooms.findIndex((r) => r.id === room.id);
            const isFirstInGroup = groupRoomIndex === 0;
            const isLastInGroup = groupRoomIndex === draftSelection.rooms.length - 1;

            return (
              <div
                key="draft-group-member-bar"
                data-draft-interactive="true"
                style={{
                  left: `calc(${leftPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                  top: isFirstInGroup ? "4px" : "0px",
                  bottom: isLastInGroup ? "4px" : "-1px",
                }}
                className={`absolute z-10 flex items-center justify-between px-2 bg-purple-50/80 text-purple-900 font-bold text-xs select-none backdrop-blur-[1px] ${
                  isFirstInGroup
                    ? "rounded-t-md rounded-b-none border-t-2 border-l-2 border-r-2 border-purple-600 border-b border-purple-200/80"
                    : isLastInGroup
                      ? "rounded-b-md rounded-t-none border-b-2 border-l-2 border-r-2 border-purple-600 border-t-0"
                      : "rounded-none border-l-2 border-r-2 border-purple-600 border-b border-purple-200/80 border-t-0"
                }`}
              >
                <span className="truncate whitespace-nowrap inline-flex items-center font-semibold text-purple-950 text-xs">
                  <span>P.{room.roomNumber}</span>
                </span>

                {/* Right Edge Handle to Adjust Days on Member Rooms */}
                {!readOnly && !isDraggingRange && onStartDraftAdjust && (
                  <div
                    role="slider"
                    aria-label="Kéo mép phải để điều chỉnh ngày"
                    title="Ấn giữ & kéo để điều chỉnh ngày lưu trú"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onStartDraftAdjust("days", e);
                    }}
                    className="absolute right-0 top-0 bottom-0 w-3.5 hover:w-4.5 cursor-col-resize z-20 pointer-events-auto flex items-center justify-end pr-0.5 hover:bg-purple-600/20 active:bg-purple-600/30 transition touch-none group/rhandle shadow-xs"
                  >
                    <div className="w-1 h-3.5 rounded-full bg-purple-500/70 group-hover/rhandle:bg-purple-700 transition shadow-xs" />
                  </div>
                )}

                {/* Bottom Edge Handle to Add/Remove Rooms on the Last Room in Group */}
                {!readOnly && isLastInGroup && !isDraggingRange && onStartDraftAdjust && (
                  <div
                    role="slider"
                    aria-label="Kéo mép dưới để thêm hoặc bớt phòng"
                    title="Ấn giữ & kéo để thêm hoặc bớt phòng vào đoàn"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onStartDraftAdjust("rooms", e);
                    }}
                    className="absolute -bottom-1 left-0 right-0 h-3.5 hover:h-4.5 cursor-row-resize z-30 pointer-events-auto flex items-center justify-center hover:bg-purple-600/30 active:bg-purple-600/50 transition touch-none group/bhandle"
                  >
                    <div className="h-1 w-10 rounded-full bg-purple-600/80 group-hover/bhandle:bg-purple-900 transition shadow-xs" />
                  </div>
                )}

                {/* Bottom-Right Corner Handle to Adjust Both Days & Rooms */}
                {!readOnly && isLastInGroup && !isDraggingRange && onStartDraftAdjust && (
                  <div
                    role="slider"
                    aria-label="Kéo góc để điều chỉnh cả ngày và phòng"
                    title="Ấn giữ & kéo để điều chỉnh cả ngày & số phòng"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onStartDraftAdjust("both", e);
                    }}
                    className="absolute -bottom-1 -right-1 size-5 cursor-nwse-resize z-40 pointer-events-auto flex items-center justify-center rounded bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white shadow-md border border-white/80 transition touch-none"
                  >
                    <svg viewBox="0 0 10 10" className="size-2.5 text-white/90" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="8" y1="2" x2="2" y2="8" />
                      <line x1="8" y1="5" x2="5" y2="8" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })()}

        {/* Active Draft Booking Range Control Bar (on Primary Anchor Room) */}
        {!readOnly && draftSelection && draftSelection.roomId === room.id && (() => {
          if (
            draftSelection.endDay <= daysList[0].ymd ||
            draftSelection.startDay > daysList[daysList.length - 1].ymd
          ) {
            return null;
          }

          const isSpilloverFromPast = draftSelection.startDay < daysList[0].ymd;
          const isSpilloverToNext = draftSelection.endDay > daysList[daysList.length - 1].ymd;

          const startIndex = isSpilloverFromPast
            ? 0
            : daysList.findIndex((d) => d.ymd >= draftSelection.startDay);
          const endIndex = isSpilloverToNext
            ? -1
            : daysList.findIndex((d) => d.ymd >= draftSelection.endDay);

          const leftPct =
            startIndex === -1 || isSpilloverFromPast ? 0 : (startIndex / daysList.length) * 100;
          const rawWidthPct =
            endIndex === -1 || isSpilloverToNext
              ? ((daysList.length - Math.max(0, startIndex)) / daysList.length) * 100
              : Math.max(
                  (1 / daysList.length) * 100,
                  (Math.max(1, endIndex - Math.max(0, startIndex)) /
                    daysList.length) *
                    100,
                );
          const widthPct = Math.min(rawWidthPct, Math.max(0, 100 - leftPct));

          const isGroup = draftSelection.rooms.length > 1;
          const groupRoomIndex = draftSelection.rooms.findIndex((r) => r.id === room.id);
          const isFirstInGroup = !isGroup || groupRoomIndex === 0;
          const isLastInGroup = !isGroup || groupRoomIndex === draftSelection.rooms.length - 1;

          return (
            <div
              key="draft-booking-bar"
              data-draft-interactive="true"
              style={{
                left: `calc(${leftPct}% + 4px)`,
                width: `calc(${widthPct}% - 8px)`,
                top: !isGroup ? "5px" : isFirstInGroup ? "4px" : "0px",
                bottom: !isGroup ? "5px" : isLastInGroup ? "4px" : "-1px",
              }}
              className={`absolute z-20 flex items-center justify-between px-2 select-none animate-in fade-in zoom-in-95 duration-150 ${
                isDraggingRange
                  ? "bg-emerald-600/20 border-2 border-emerald-500 text-emerald-950 backdrop-blur-[1px] shadow-xs pointer-events-none"
                  : "bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white pointer-events-auto shadow-md"
              } ${
                !isGroup
                  ? "rounded-md"
                  : isFirstInGroup
                    ? "rounded-t-md rounded-b-none border-t-2 border-l-2 border-r-2"
                    : isLastInGroup
                      ? "rounded-b-md rounded-t-none border-b-2 border-l-2 border-r-2"
                      : "rounded-none border-l-2 border-r-2"
              }`}
            >
              {/* Left label / nights & group summary */}
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                {!readOnly && !isDraggingRange && onStartDraftAdjust && (
                  <div
                    role="button"
                    aria-label="Ấn giữ để di chuyển vùng đặt phòng"
                    title="Ấn giữ & kéo để di chuyển vùng đặt"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onStartDraftAdjust("move", e);
                    }}
                    className="p-1 -ml-1 rounded hover:bg-white/20 active:bg-white/30 cursor-grab active:cursor-grabbing text-white/70 hover:text-white transition flex items-center justify-center shrink-0 touch-none"
                  >
                    <svg viewBox="0 0 6 10" className="w-1.5 h-3" fill="currentColor">
                      <circle cx="1.5" cy="2" r="1"/>
                      <circle cx="4.5" cy="2" r="1"/>
                      <circle cx="1.5" cy="5" r="1"/>
                      <circle cx="4.5" cy="5" r="1"/>
                      <circle cx="1.5" cy="8" r="1"/>
                      <circle cx="4.5" cy="8" r="1"/>
                    </svg>
                  </div>
                )}
                <span className={`text-xs font-black truncate whitespace-nowrap ${isDraggingRange ? "text-emerald-950" : "text-white"} ${draftSelection.nights <= 1 ? "hidden sm:inline" : ""}`}>
                  {isGroup ? `Đoàn: ${draftSelection.rooms.length} phòng` : isDraggingRange ? "Đang chọn vùng" : "Đặt trước"}: {draftSelection.nights} đêm
                </span>
              </div>

              {/* Quick Stepper, Guest Count & Confirm buttons (chỉ hiện khi đã chọn xong khoảng ngày) */}
              {!isDraggingRange && (
                <div className="flex items-center gap-1 shrink-0 pr-3.5 z-20">
                  {draftSelection.nights > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjustDraftDays(-1);
                        }}
                        disabled={draftSelection.nights <= 1}
                        className="size-5 rounded flex items-center justify-center bg-white/20 hover:bg-white/30 text-white font-bold text-xs disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title="Giảm 1 đêm"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjustDraftDays(1);
                        }}
                        className="size-5 rounded flex items-center justify-center bg-white/20 hover:bg-white/30 text-white font-bold text-xs cursor-pointer"
                        title="Kéo dài thêm 1 đêm"
                      >
                        +
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onConfirmDraft(draftSelection);
                    }}
                    className={`ml-1 px-2.5 py-0.5 rounded-md text-white text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer whitespace-nowrap transition ${
                      isProcessing
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-emerald-500 hover:bg-emerald-600"
                    }`}
                    title={
                      isProcessing
                        ? "Cần xác nhận dọn phòng trước khi đặt"
                        : isGroup
                          ? "Xác nhận đặt trước cho cả đoàn (1 người đại diện)"
                          : "Xác nhận tạo đặt trước"
                    }
                  >
                    <VsIcon name={isProcessing ? "cleaning_services" : "check"} className="text-xs" />
                    <span>{isProcessing ? "Dọn phòng & Đặt" : isGroup ? `Đặt ${draftSelection.rooms.length} phòng` : "Đặt ngay"}</span>
                  </button>
                </div>
              )}

              {/* Right Edge Handle to Adjust Days on Primary Bar */}
              {!readOnly && !isDraggingRange && onStartDraftAdjust && (
                <div
                  role="slider"
                  aria-label="Kéo mép phải để điều chỉnh ngày"
                  title="Ấn giữ & kéo để điều chỉnh ngày lưu trú"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onStartDraftAdjust("days", e);
                  }}
                  className="absolute right-0 top-0 bottom-0 w-3.5 hover:w-4.5 cursor-col-resize z-30 flex items-center justify-end pr-0.5 hover:bg-white/20 active:bg-white/30 transition rounded-r-md touch-none group/rhandle shadow-xs"
                >
                  <div className="w-1 h-3.5 rounded-full bg-white/80 group-hover/rhandle:bg-white transition shadow-xs" />
                </div>
              )}

              {/* Bottom Edge Handle for Single Room (or if Anchor is last room in group) */}
              {!readOnly && isLastInGroup && !isDraggingRange && onStartDraftAdjust && (
                <div
                  role="slider"
                  aria-label="Kéo mép dưới để thêm hoặc bớt phòng"
                  title="Ấn giữ & kéo để thêm hoặc bớt phòng"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onStartDraftAdjust("rooms", e);
                  }}
                  className="absolute -bottom-1 left-0 right-0 h-3.5 hover:h-4.5 cursor-row-resize z-30 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition touch-none group/bhandle"
                >
                  <div className="h-1 w-10 rounded-full bg-white/80 group-hover/bhandle:bg-white transition shadow-xs" />
                </div>
              )}

              {/* Bottom-Right Corner Handle for Single Room (or if Anchor is last room) */}
              {!readOnly && isLastInGroup && !isDraggingRange && onStartDraftAdjust && (
                <div
                  role="slider"
                  aria-label="Kéo góc để điều chỉnh cả ngày và phòng"
                  title="Ấn giữ & kéo để điều chỉnh cả ngày & phòng"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onStartDraftAdjust("both", e);
                  }}
                  className="absolute -bottom-1 -right-1 size-5 cursor-nwse-resize z-40 flex items-center justify-center rounded bg-purple-800 hover:bg-purple-900 active:bg-indigo-950 text-white shadow-md border border-white/80 transition touch-none"
                >
                  <svg viewBox="0 0 10 10" className="size-2.5 text-white/90" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="8" y1="2" x2="2" y2="8" />
                    <line x1="8" y1="5" x2="5" y2="8" />
                  </svg>
                </div>
              )}

              {/* Floating Tooltip Header above the bar for clear date readability */}
              <div className={`absolute ${!isGroup || isFirstInGroup ? "-top-8" : "-bottom-8"} left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-slate-900/95 text-white pl-2.5 pr-1.5 py-1 rounded-full text-xs font-bold shadow-xl border border-slate-700 whitespace-nowrap pointer-events-auto max-w-sm sm:max-w-md`}>
                <span className="text-amber-300 shrink-0">
                  {isGroup
                    ? draftSelection.rooms.length <= 3
                      ? `Đoàn ${draftSelection.rooms.length} phòng (${draftSelection.rooms.map((r) => `P.${r.roomNumber}`).join(", ")})`
                      : `Đoàn ${draftSelection.rooms.length} phòng`
                    : `P.${room.roomNumber}`}
                </span>
                <span className="text-slate-400">•</span>
                <span className="shrink-0">
                  {formatDateNum(draftSelection.startDay)} ➔ {formatDateNum(draftSelection.endDay)}
                </span>
                <span className="text-purple-300 shrink-0">({draftSelection.nights} đêm)</span>
                {isProcessing && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-black text-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                    <VsIcon name="cleaning_services" className="text-xs" />
                    Cần dọn phòng
                  </span>
                )}
                {!isDraggingRange && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelDraft();
                    }}
                    className="ml-1 size-5 rounded-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-black flex items-center justify-center cursor-pointer shadow-xs transition hover:scale-110 active:scale-95 shrink-0"
                    title="Hủy vùng chọn"
                    aria-label="Hủy vùng chọn"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Active Block Resize Ghost Overlay */}
        {!readOnly &&
          activeBlockResize &&
          activeBlockResize.block.roomId === room.id &&
          (() => {
            if (
              activeBlockResize.currentGhostEndDay <= daysList[0].ymd ||
              activeBlockResize.currentGhostStartDay > daysList[daysList.length - 1].ymd
            ) {
              return null;
            }

            const isSpilloverFromPast = activeBlockResize.currentGhostStartDay < daysList[0].ymd;
            const isSpilloverToNext = activeBlockResize.currentGhostEndDay > daysList[daysList.length - 1].ymd;

            const ghostStartIndex = isSpilloverFromPast
              ? 0
              : daysList.findIndex(
                  (d) => d.ymd >= activeBlockResize.currentGhostStartDay,
                );
            const ghostEndIndex = isSpilloverToNext
              ? -1
              : daysList.findIndex(
                  (d) => d.ymd >= activeBlockResize.currentGhostEndDay,
                );

            const ghostLeftPct =
              ghostStartIndex === -1 || isSpilloverFromPast
                ? 0
                : (ghostStartIndex / daysList.length) * 100;
            const rawGhostWidthPct =
              ghostEndIndex === -1 || isSpilloverToNext
                ? ((daysList.length - Math.max(0, ghostStartIndex)) / daysList.length) * 100
                : Math.max(
                    (1 / daysList.length) * 100,
                    (Math.max(1, ghostEndIndex - Math.max(0, ghostStartIndex)) /
                      daysList.length) *
                      100,
                  );
            const ghostWidthPct = Math.min(rawGhostWidthPct, Math.max(0, 100 - ghostLeftPct));

            const isGhostOverdue = activeBlockResize.block.status === "OVERDUE";
            const isGhostStay = activeBlockResize.block.kind === "STAY";

            return (
              <div
                key="ghost-resize-preview"
                style={{
                  left: `calc(${ghostLeftPct}% + 4px)`,
                  width: `calc(${ghostWidthPct}% - 8px)`,
                  top: "4px",
                  bottom: "4px",
                }}
                className={`absolute z-30 flex items-center justify-between px-2.5 rounded-md border-2 border-dashed shadow-md select-none pointer-events-none transition-all ${
                  isGhostOverdue
                    ? "border-rose-400 bg-rose-600 text-white ring-2 ring-rose-400/40"
                    : isGhostStay
                      ? "border-emerald-400 bg-emerald-600 text-white ring-2 ring-emerald-400/40"
                      : "border-purple-300 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white ring-2 ring-purple-400/40"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-xs whitespace-nowrap bg-white/95 text-slate-900 px-1.5 py-0.5 rounded shadow-2xs">
                    {activeBlockResize.diffNights > 0
                      ? `+${activeBlockResize.diffNights} đêm`
                      : activeBlockResize.diffNights < 0
                        ? `${activeBlockResize.diffNights} đêm`
                        : `${activeBlockResize.nights} đêm`}
                  </span>
                  <span className="text-xs font-bold whitespace-nowrap text-white hidden sm:inline drop-shadow">
                    {activeBlockResize.direction === "end"
                      ? `Đến ${activeBlockResize.currentGhostEndDay}`
                      : `Từ ${activeBlockResize.currentGhostStartDay}`}
                  </span>
                </div>
                {activeBlockResize.conflictWarning && (
                  <span className="text-xs font-bold text-rose-800 bg-white/95 px-1.5 py-0.5 rounded shadow-2xs whitespace-nowrap truncate max-w-[200px]">
                    ⚠️ {activeBlockResize.conflictWarning}
                  </span>
                )}
              </div>
            );
          })()}

        {/* Booking Bars Overlay */}
        {roomBlocks.map((b) => {
          // If a block is overdue and guest hasn't checked out yet, its effective physical presence
          // stretches to today so it's not hidden if scheduled checkout was in the past
          const effectiveEndDate =
            b.status === "OVERDUE" && b.endDate <= todayYmd
              ? addDaysYmd(todayYmd, 1)
              : b.endDate;

          if (
            effectiveEndDate <= daysList[0].ymd ||
            b.startDate > daysList[daysList.length - 1].ymd
          ) {
            return null;
          }

          const isSpilloverFromPast = b.startDate < daysList[0].ymd;
          const isSpilloverToNext = effectiveEndDate > daysList[daysList.length - 1].ymd;

          const startIndex = isSpilloverFromPast
            ? 0
            : daysList.findIndex((d) => d.ymd >= b.startDate);

          const endIndex = isSpilloverToNext
            ? -1
            : daysList.findIndex((d) => d.ymd >= effectiveEndDate);

          const leftPct =
            startIndex === -1 || isSpilloverFromPast
              ? 0
              : (startIndex / daysList.length) * 100;

          // Clamped strictly to visible week so multi-week stays never spill out of the grid
          const rawWidthPct =
            endIndex === -1 || isSpilloverToNext
              ? ((daysList.length - Math.max(0, startIndex)) / daysList.length) * 100
              : Math.max(
                  (1 / daysList.length) * 100,
                  (Math.max(1, endIndex - Math.max(0, startIndex)) /
                    daysList.length) *
                    100,
                );

          const widthPct = Math.min(rawWidthPct, Math.max(0, 100 - leftPct));

          const channelKey = (b.channel || b.source || "trực tiếp").toLowerCase().trim();
          const isDirect =
            channelKey === "trực tiếp" ||
            channelKey === "direct" ||
            channelKey === "direct booking";
          const channelBadge = getChannelBadge(b.channel || b.source);

          const isOverdue = b.status === "OVERDUE";
          const isStay = b.kind === "STAY";
          const canResizeRight = isStay || isOverdue || b.kind === "RESERVATION";
          const canResizeLeft = b.kind === "RESERVATION" && b.startDate >= todayYmd;

          // Màu thanh theo trạng thái: Đang ở (xanh lá), Đặt trước (tím), Quá hạn (đỏ)
          const barBg = isOverdue
            ? "bg-rose-600 hover:bg-rose-700 border-rose-800 text-white"
            : isStay
              ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white"
              : "bg-purple-600 hover:bg-purple-700 border-purple-800 text-white";

          const isBeingResized = Boolean(activeBlockResize && activeBlockResize.block.id === b.id);

          return (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              data-block-id={b.id}
              data-block-room-id={b.roomId}
              data-block-status={b.status}
              data-is-overdue={isOverdue ? "true" : undefined}
              draggable={!readOnly && b.movable && !isBeingResized}
              onDragStart={(e) => {
                if (readOnly) {
                  e.preventDefault();
                  return;
                }
                handleDragStart(e, b);
              }}
              onDragEnd={() => {
                handleDragEnd?.();
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBlock(b);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setSelectedBlock(b);
                }
              }}
              style={{
                left: `calc(${leftPct}% + 4px)`,
                width: `calc(${widthPct}% - 8px)`,
                top: "5px",
                bottom: "5px",
              }}
              className={`absolute z-10 flex items-center gap-1.5 px-2 rounded-md border shadow-xs transition-all text-xs font-bold overflow-hidden select-none ${barBg} ${
                isBeingResized
                  ? "invisible pointer-events-none"
                  : isDraggingRange
                    ? "pointer-events-none"
                    : !readOnly && b.movable
                      ? "cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-purple-300"
                      : "cursor-pointer hover:ring-2 hover:ring-slate-300"
              }`}
              title={`${b.guestName}${b.guestCount && b.guestCount > 1 ? ` (${b.guestCount} khách)` : ""}${b.groupCode ? ` • Khách đoàn #${b.groupCode}` : ""}${!isDirect ? ` • ${channelBadge.label}` : ""}${
                isSpilloverToNext ? " • Kéo dài sang tuần sau (bấm '>' để xem tiếp)" : ""
              }${
                isSpilloverFromPast ? " • Bắt đầu từ tuần trước (bấm '<' để xem)" : ""
              }${!readOnly && b.movable ? " • Kéo thả để đổi phòng" : ""}${!readOnly && canResizeRight && !isSpilloverToNext ? " • Kéo mép phải để gia hạn lưu trú" : b.groupCode && b.kind === "RESERVATION" ? " • Nhấp để kích hoạt nhận phòng cho cả đoàn" : " • Nhấp để xem thông tin chi tiết"}`}
            >
              {/* Spillover from previous week indicator */}
              {isSpilloverFromPast && (
                <span
                  className="text-amber-200 text-xs shrink-0 font-bold select-none"
                  title="Bắt đầu từ tuần trước (bấm '<' để xem)"
                >
                  ⬅
                </span>
              )}

              {/* Left Edge Resize Handle (Đổi ngày nhận phòng cho Đặt trước - chỉ khi bắt đầu trong tuần này) */}
              {!readOnly && canResizeLeft && !isSpilloverFromPast && onStartBlockResize && (
                <div
                  role="slider"
                  aria-label="Kéo mép trái để điều chỉnh ngày nhận phòng"
                  title="Kéo mép trái để đổi ngày nhận phòng"
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onStartBlockResize(b, "start", e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="absolute left-0 top-0 bottom-0 w-3 hover:w-3.5 cursor-col-resize z-20 group/lhandle flex items-center justify-start pl-0.5 hover:bg-black/30 transition rounded-l-md touch-none"
                >
                  <div className="w-1 h-3.5 rounded-full bg-white/70 group-hover/lhandle:bg-white transition-all shadow-xs" />
                </div>
              )}

              {/* Chỉ hiển thị badge kênh nếu là đơn OTA (Booking.com, Agoda, Airbnb,...). Bỏ tag Trực tiếp to đùng */}
              {!isDirect && (
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-black uppercase tracking-wider shrink-0 whitespace-nowrap ${channelBadge.bg} ${channelBadge.text}`}
                >
                  {channelBadge.label}
                </span>
              )}
              <span className="truncate font-black whitespace-nowrap text-left flex-1 min-w-0">
                {b.guestName.replace(/^OTA[-_ ]?[A-Za-z0-9]+[-_ ]?:?[-_ ]?/i, "").trim() || b.guestName}
              </span>

              {/* Spillover to next week indicator */}
              {isSpilloverToNext && (
                <span
                  className="text-amber-200 text-xs shrink-0 font-black ml-auto pl-1 select-none"
                  title="Còn tiếp sang tuần sau (bấm '>' để xem tiếp)"
                >
                  ➔
                </span>
              )}

              {/* Right Edge Resize Handle (Gia hạn lưu trú hoặc đổi ngày trả phòng - chỉ khi kết thúc trong tuần này) */}
              {!readOnly && canResizeRight && !isSpilloverToNext && onStartBlockResize && (
                <div
                  role="slider"
                  aria-label="Kéo mép phải để gia hạn lưu trú hoặc điều chỉnh ngày trả phòng"
                  title={
                    isOverdue
                      ? "Kéo mép phải để gia hạn lưu trú cho khách quá hạn"
                      : isStay
                        ? "Kéo mép phải để gia hạn thời gian lưu trú"
                        : "Kéo mép phải để đổi ngày trả phòng"
                  }
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onStartBlockResize(b, "end", e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="absolute right-0 top-0 bottom-0 w-3 hover:w-3.5 cursor-col-resize z-20 group/rhandle flex items-center justify-end pr-0.5 hover:bg-black/30 transition rounded-r-md touch-none"
                >
                  <div className="w-1 h-3.5 rounded-full bg-white/70 group-hover/rhandle:bg-white transition-all shadow-xs" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface CategoryRoomTableProps {
  cat: string;
  catRooms: RoomPlanRoom[];
  daysList: Array<{
    ymd: string;
    dayLabel: string;
    dateNum: string;
    isToday: boolean;
    isWeekend: boolean;
  }>;
  todayYmd?: string;
  readOnly?: boolean;
  blocksByRoomId: Map<string, RoomPlanBlock[]>;
  occupiedRoomDaySet: Set<string>;
  dragOverCellKey: string | null;
  dragOverDayYmd?: string | null;
  handleDragOverCell: (e: React.DragEvent, cellKey: string, dayYmd?: string) => void;
  handleDragLeaveCell: (cellKey: string) => void;
  handleDropOnRoom: (e: React.DragEvent, room: RoomPlanRoom) => void;
  handleDragStart: (e: React.DragEvent, block: RoomPlanBlock) => void;
  setSelectedBlock: (block: RoomPlanBlock) => void;
  onOpenCheckIn?: (room: RoomPlanRoom, ymd: string) => void;
  onSelectRoom?: (room: RoomPlanRoom) => void;
  onToggleRoomBlocked?: (room: RoomPlanRoom) => Promise<void> | void;
  onProcessingRoomClick?: (room: RoomPlanRoom) => Promise<void> | void;
  isCollapsed: boolean;
  onToggleCollapse: (cat: string) => void;
  draftSelection: DraftBookingSelection | null;
  isDraggingRange: boolean;
  activeDragRange?: ActiveDragRange | null;
  draggedBlock?: DraggedReservationPayload | null;
  handleDragEnd?: () => void;
  onStartDragRange: (room: RoomPlanRoom, ymd: string, clientX?: number, clientY?: number) => void;
  onHoverDragDay: (room: RoomPlanRoom, ymd: string, clientY?: number) => void;
  onAdjustDraftDays: (delta: number) => void;
  onConfirmDraft: (draft: DraftBookingSelection) => void;
  onCancelDraft: () => void;
  activeBlockResize?: ActiveBlockResize | null;
  onStartBlockResize?: (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => void;
  onStartDraftAdjust?: (
    mode: "days" | "rooms" | "both" | "move",
    e: React.MouseEvent,
  ) => void;
  onFocusOverdueRoom?: (room: RoomPlanRoom) => void;
}

const CategoryRoomTable = memo(function CategoryRoomTable({
  cat,
  catRooms,
  daysList,
  todayYmd = getTodayInVietnam(),
  readOnly = false,
  blocksByRoomId,
  occupiedRoomDaySet,
  dragOverCellKey,
  dragOverDayYmd,
  handleDragOverCell,
  handleDragLeaveCell,
  handleDropOnRoom,
  handleDragStart,
  setSelectedBlock,
  onOpenCheckIn,
  onSelectRoom,
  onToggleRoomBlocked,
  onProcessingRoomClick,
  isCollapsed,
  onToggleCollapse,
  draftSelection,
  isDraggingRange,
  activeDragRange,
  draggedBlock,
  handleDragEnd,
  onStartDragRange,
  onHoverDragDay,
  onAdjustDraftDays,
  onConfirmDraft,
  onCancelDraft,
  activeBlockResize,
  onStartBlockResize,
  onStartDraftAdjust,
  onFocusOverdueRoom,
}: CategoryRoomTableProps) {
  const handleToggleCollapseClick = useCallback(() => {
    onToggleCollapse(cat);
  }, [onToggleCollapse, cat]);
  // TanStack table instance for headless table model
  const columns = useMemo<ColumnDef<RoomPlanRoom>[]>(
    () => [
      {
        id: "roomInfo",
        header: "Phòng",
      },
      {
        id: "timeline",
        header: "Lịch phòng",
      },
    ],
    [],
  );

  const table = useReactTable({
    data: catRooms,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const catRoomIds = useMemo(() => catRooms.map((r) => r.id), [catRooms]);

  const catPrice = useMemo(() => {
    return catRooms.find((r) => typeof r.price === "number" && r.price > 0)?.price ?? null;
  }, [catRooms]);

  return (
    <div className="border-b-2 border-slate-200 w-full">
      {/* Category Header Row */}
      <div className="flex bg-slate-100/90 border-b border-slate-200 py-1.5 font-bold text-xs sticky top-[41px] z-20 w-full items-center">
        <div className="sticky left-0 z-20 w-48 min-w-[192px] max-w-[192px] shrink-0 bg-slate-100/90 px-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleCollapseClick}
            className="flex items-center gap-1.5 min-w-0 text-left hover:text-emerald-800 transition cursor-pointer group flex-1 mr-2"
            title={
              isCollapsed
                ? `Hiện danh sách ${catRooms.length} phòng`
                : `Ẩn danh sách ${catRooms.length} phòng`
            }
          >
            <VsIcon
              name={isCollapsed ? "chevron_right" : "chevron_down"}
              className="text-xs text-slate-500 group-hover:text-emerald-700 shrink-0 transition-transform"
            />
            <span className="font-black text-slate-800 group-hover:text-emerald-900 uppercase tracking-wider truncate">
              {cat}
            </span>
          </button>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-700 whitespace-nowrap shrink-0">
            {catRooms.length}
          </span>
        </div>

        <div className="flex flex-1 min-w-0 cursor-pointer" onClick={handleToggleCollapseClick}>
          {daysList.map((day) => {
            const occupiedCount = catRooms.reduce(
              (acc, room) => acc + (occupiedRoomDaySet.has(`${room.id}:${day.ymd}`) ? 1 : 0),
              0,
            );
            const avail = Math.max(0, catRooms.length - occupiedCount);
            const isSoldOut = avail === 0 && catRooms.length > 0;
            const occPercent = catRooms.length > 0 ? Math.round((occupiedCount / catRooms.length) * 100) : 0;

            return (
              <div
                key={day.ymd}
                className={`flex-1 min-w-[100px] border-r border-slate-200/60 px-1 py-1 text-center text-xs flex flex-col justify-center items-center ${
                  day.isToday ? "bg-sky-50/50" : ""
                }`}
                title={`Hạng ${cat} ngày ${day.dateNum}: ${occupiedCount}/${catRooms.length} có khách (${occPercent}%), còn ${avail} phòng trống`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-black whitespace-nowrap ${
                      isSoldOut
                        ? "bg-rose-100 text-rose-800"
                        : avail < 2
                          ? "bg-amber-100 text-amber-900"
                          : "text-slate-700"
                    }`}
                  >
                    {avail} trống
                  </span>
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">
                    ({occPercent}%)
                  </span>
                </div>
                {catPrice !== null && (
                  <span className="text-xs text-slate-400 font-semibold mt-0.5 whitespace-nowrap">
                    {formatVnd(catPrice)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows managed by @dnd-kit SortableContext and @tanstack/react-table */}
      {!isCollapsed && (
        <SortableContext
          items={catRoomIds}
          strategy={verticalListSortingStrategy}
        >
          {table.getRowModel().rows.map((row) => (
            <DraggableRoomRow
              key={row.original.id}
              room={row.original}
              daysList={daysList}
              todayYmd={todayYmd}
              readOnly={readOnly}
              roomBlocks={blocksByRoomId.get(row.original.id) || EMPTY_BLOCKS}
              occupiedRoomDaySet={occupiedRoomDaySet}
              dragOverCellKey={dragOverCellKey}
              dragOverDayYmd={dragOverDayYmd}
              handleDragOverCell={handleDragOverCell}
              handleDragLeaveCell={handleDragLeaveCell}
              handleDropOnRoom={handleDropOnRoom}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              setSelectedBlock={setSelectedBlock}
              onOpenCheckIn={onOpenCheckIn}
              onSelectRoom={onSelectRoom}
              onToggleRoomBlocked={onToggleRoomBlocked}
              onProcessingRoomClick={onProcessingRoomClick}
              onFocusOverdueRoom={onFocusOverdueRoom}
              draftSelection={draftSelection}
              isDraggingRange={isDraggingRange}
              activeDragRange={activeDragRange}
              draggedBlock={draggedBlock}
              onStartDragRange={onStartDragRange}
              onHoverDragDay={onHoverDragDay}
              onAdjustDraftDays={onAdjustDraftDays}
              onConfirmDraft={onConfirmDraft}
              onCancelDraft={onCancelDraft}
              activeBlockResize={activeBlockResize}
              onStartBlockResize={onStartBlockResize}
              onStartDraftAdjust={onStartDraftAdjust}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
});

export function TapeChartView({
  hotelId,
  rooms: propRooms = [],
  arrivalsList = [],
  businessDate,
  onBusinessDateChange,
  initialStartDate,
  initialViewMode,
  readOnly,
  roleScope,
  canCheckInStay = true,
  canManageRooms = true,
  onOpenGroupCheckIn,
  onOpenCheckIn,
  onCheckInReservation,
  onOpenQuickReservation,
  onOpenBulkReservation,
  onCheckOutStay,
  onSelectRoom,
  onToggleRoomBlocked,
  onProcessingRoomClick,
  onRefresh,
  searchQuery: propSearchQuery,
  onSearchQueryChange,
}: TapeChartViewProps) {
  const isReadOnly = Boolean(
    readOnly ?? (roleScope === "tenant" || roleScope === "owner"),
  );
  const queryClient = useQueryClient();
  const drawerTitleId = useId();
  const todayYmd = useMemo(() => getTodayInVietnam(), []);
  const initialBaseDate = businessDate || todayYmd;

  const [startDate, setStartDate] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const urlDate = sp.get("startDate");
      if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
        return urlDate;
      }
    }
    if (initialStartDate && /^\d{4}-\d{2}-\d{2}$/.test(initialStartDate)) {
      return initialStartDate;
    }
    return initialBaseDate;
  });

  const [viewMode, setViewMode] = useState<TapeChartViewMode>(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const urlMode = sp.get("viewMode");
      if (urlMode === "biweek" || urlMode === "week") {
        return urlMode;
      }
    }
    if (initialViewMode === "biweek" || initialViewMode === "week") {
      return initialViewMode;
    }
    return "week";
  });

  const syncUrlParams = useCallback(
    (newDate: string, newMode: TapeChartViewMode) => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (
        url.searchParams.get("view") !== "tape-chart" &&
        url.searchParams.get("tab") !== "room-plan"
      ) {
        url.searchParams.set("view", "tape-chart");
      }
      url.searchParams.set("startDate", newDate);
      if (newMode !== "week") {
        url.searchParams.set("viewMode", newMode);
      } else {
        url.searchParams.delete("viewMode");
      }
      window.history.replaceState(null, "", url.toString());
    },
    [],
  );

  useEffect(() => {
    syncUrlParams(startDate, viewMode);
  }, [startDate, viewMode, syncUrlParams]);

  // Synchronize timeline startDate when parent operational businessDate changes
  useEffect(() => {
    if (businessDate && /^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      setStartDate((prev) => (prev !== businessDate ? businessDate : prev));
    }
  }, [businessDate]);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedFloor, setSelectedFloor] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    "all" | "available_today" | "occupied_today" | "cleaning" | "overdue"
  >("all");
  const [internalSearchQuery, setInternalSearchQuery] = useState<string>("");
  const searchQuery =
    propSearchQuery !== undefined ? propSearchQuery : internalSearchQuery;
  const setSearchQuery = useCallback(
    (updater: string | ((prev: string) => string)) => {
      const next =
        typeof updater === "function" ? updater(searchQuery) : updater;
      if (propSearchQuery === undefined) {
        setInternalSearchQuery(next);
      }
      onSearchQueryChange?.(next);
    },
    [onSearchQueryChange, propSearchQuery, searchQuery],
  );

  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedFloor !== "all" ||
    selectedStatusFilter !== "all" ||
    searchQuery.trim().length > 0;

  const handleResetAllFilters = useCallback(() => {
    setSelectedCategory("all");
    setSelectedFloor("all");
    setSelectedStatusFilter("all");
    setSearchQuery("");
  }, []);

  // Slide-over Drawer Selected Block & Active Tab
  const [selectedBlock, setSelectedBlock] = useState<RoomPlanBlock | null>(null);
  const [drawerTab, setDrawerTab] = useState<"info" | "services" | "history">("info");
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSelectBlock = useCallback(
    (block: RoomPlanBlock | null) => {
      setSelectedBlock(block);
      setDrawerTab("info");
    },
    [],
  );

  // Placement Modal state (accessible fallback for Move/Swap)
  const [placementModalOpen, setPlacementModalOpen] = useState(false);
  const [placementSourceBlock, setPlacementSourceBlock] = useState<RoomPlanBlock | null>(null);
  const [placementTargetRoomId, setPlacementTargetRoomId] = useState<string>("");
  const [placementTargetSwapResId, setPlacementTargetSwapResId] = useState<string>("");
  const [isEditReservationOpen, setIsEditReservationOpen] = useState(false);

  // Drag over drop target highlighting
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [dragOverDayYmd, setDragOverDayYmd] = useState<string | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<DraggedReservationPayload | null>(null);

  // Compute number of days based on view mode (Week = 7, Biweek = 14)
  const numDays = viewMode === "week" ? 7 : 14;
  const endDate = useMemo(() => addDaysYmd(startDate, numDays - 1), [startDate, numDays]);

  // Query Room Plan from backend
  const roomPlanScope = useMemo(() => roomPlanResource.bind({ hotelId }), [hotelId]);
  const staffRoomsScope = useMemo(() => staffRoomsResource.bind({ hotelId }), [hotelId]);

  const {
    data: planData,
    isLoading: isPlanLoading,
    isFetching: isPlanFetching,
    refetch: refetchPlan,
  } = useQuery({
    ...roomPlanScope.queries.plan.options({
      from: startDate,
      to: endDate,
    }),
    enabled: Boolean(hotelId),
    staleTime: 10_000,
  });

  // Mutation for updating placement
  const placementMutation = useMutation({
    mutationFn: (vars: {
      reservationId: string;
      targetRoomId: string;
      mode?: "MOVE" | "SWAP";
      expectedUpdatedAt: string;
      swapWithReservationId?: string;
      swapExpectedUpdatedAt?: string;
    }) =>
      roomPlanRepository.updatePlacement(hotelId, vars.reservationId, {
        targetRoomId: vars.targetRoomId,
        expectedUpdatedAt: vars.expectedUpdatedAt,
        swapWithReservationId: vars.swapWithReservationId,
        swapExpectedUpdatedAt: vars.swapExpectedUpdatedAt,
      }),
    onSuccess: async () => {
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchPlan();
      setPlacementModalOpen(false);
      setPlacementSourceBlock(null);
      setSelectedBlock(null);
      if (onRefresh) onRefresh();
      await showSuccessAlert(
        "Chuyển phòng thành công",
        "Hệ thống đã cập nhật vị trí xếp phòng và đồng bộ dữ liệu.",
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Không thể chuyển phòng. Vui lòng thử lại.";
      void showErrorAlert("Lỗi chuyển phòng", msg);
    },
  });

  const [activeDraftAdjust, setActiveDraftAdjust] = useState<ActiveDraftAdjust | null>(null);
  const [activeBlockResize, setActiveBlockResize] = useState<ActiveBlockResize | null>(null);
  // Rooms source: authoritative from planData.rooms, fallback to propRooms
  const allRooms: RoomPlanRoom[] = useMemo(() => {
    if (planData?.rooms && planData.rooms.length > 0) {
      return planData.rooms;
    }
    return propRooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber || r.id,
      floor: r.floor ? String(r.floor) : null,
      roomTypeId: r.roomTypeId || null,
      roomTypeName: r.type || null,
      status: r.status || "AVAILABLE",
      price: typeof r.price === "number" ? r.price : null,
    }));
  }, [planData, propRooms]);

  const roomById = useMemo(
    () => new Map(allRooms.map((r) => [r.id, r])),
    [allRooms],
  );

  // Authoritative blocks from planData with resilient normalization
  const allBlocks: RoomPlanBlock[] = useMemo(() => {
    if (!planData?.blocks) return [];
    return planData.blocks.map((raw) => {
      const startIso = raw.startDate || raw.startAt || "";
      const endIso = raw.endDate || raw.endAt || "";
      const startDate = startIso ? startIso.slice(0, 10) : "";
      const endDate = endIso ? endIso.slice(0, 10) : "";
      const startMs = new Date(startIso).getTime();
      const endMs = new Date(endIso).getTime();
      const diffNights =
        !isNaN(startMs) && !isNaN(endMs)
          ? Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)))
          : (raw.nights ?? 1);

      const guestName =
        raw.guestName ||
        raw.guestDisplayName ||
        "Khách lưu trú";

      const channel =
        raw.channel ||
        raw.channelName ||
        (raw.source === "OTA"
          ? "OTA"
          : raw.source === "CO"
            ? "Doanh nghiệp (CO)"
            : raw.source === "TA"
              ? "Đại lý (TA)"
              : "Trực tiếp");

      const matchedRoom = roomById.get(String(raw.roomId));
      const roomPriceFallback =
        matchedRoom?.price ?? matchedRoom?.basePrice ?? matchedRoom?.roomType?.basePrice ??
        null;

      const nightlyRate =
        raw.nightlyRate ??
        (raw.nightlyRateSnapshot ? Number(raw.nightlyRateSnapshot) : null) ??
        (roomPriceFallback ? Number(roomPriceFallback) : null);

      const roomSubtotal =
        typeof raw.roomSubtotal === "number"
          ? raw.roomSubtotal
          : (nightlyRate ? nightlyRate * diffNights : null);

      const roomNumber =
        raw.roomNumber ||
        matchedRoom?.roomNumber ||
        "";

      const roomTypeName =
        raw.roomTypeName ||
        matchedRoom?.roomTypeName ||
        null;

      const serviceSubtotal = typeof raw.serviceSubtotal === "number" ? raw.serviceSubtotal : null;
      const totalAmount =
        typeof raw.totalAmount === "number" && raw.totalAmount > 0
          ? raw.totalAmount
          : (roomSubtotal != null ? roomSubtotal + (serviceSubtotal ?? 0) : null);

      return {
        id: String(raw.id),
        kind: (raw.kind as "RESERVATION" | "STAY") || "RESERVATION",
        reservationId: raw.reservationId ?? null,
        guestStayId: raw.guestStayId ?? raw.stayId ?? null,
        reservationCode: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        guestName,
        guestDisplayName: raw.guestDisplayName || guestName,
        guestCount: raw.guestCount ?? null,
        phone: raw.phone ?? raw.guestPhone ?? null,
        source: raw.source ?? null,
        channel,
        channelName: raw.channelName || raw.channel || null,
        sourceCategory: raw.sourceCategory || null,
        sourcePartnerId: raw.sourcePartnerId || null,
        sourcePartnerName: raw.sourcePartnerName || null,
        bookingOwnerUserId: raw.bookingOwnerUserId || null,
        bookingOwnerName: raw.bookingOwnerName || null,
        status: String(raw.status || "CONFIRMED"),
        roomId: String(raw.roomId),
        roomNumber,
        roomTypeId: raw.roomTypeId ?? null,
        roomTypeName,
        startDate,
        endDate,
        startAt: raw.startAt || startIso,
        endAt: raw.endAt || endIso,
        nights: diffNights,
        nightlyRate,
        roomSubtotal,
        serviceSubtotal,
        totalAmount,
        services: Array.isArray(raw.services) ? raw.services : [],
        movable: Boolean(
          raw.movable !== undefined
            ? (raw.movable || (raw.status !== "CHECKED_OUT" && raw.status !== "CANCELLED"))
            : (raw.status !== "CHECKED_OUT" && raw.status !== "CANCELLED")
        ),
        expectedUpdatedAt:
          raw.expectedUpdatedAt || raw.updatedAt || new Date().toISOString(),
        notes: raw.notes || null,
      };
    });
  }, [planData, roomById]);

  // Auto-adjust timeline startDate and parent businessDate when filtering by booking/reservation/group code
  const lastAutoAdjustedCodeRef = useRef<string>("");

  useEffect(() => {
    const rawQ = searchQuery.trim();
    if (!rawQ || rawQ.length < 3) {
      lastAutoAdjustedCodeRef.current = "";
      return;
    }

    const cleanQ = rawQ.replace(/^#/, "").trim().toLowerCase();
    if (lastAutoAdjustedCodeRef.current === cleanQ) return;

    // Fast check: is this query likely a booking or group code?
    const isCode =
      /^(vsh|rsv|grp|group|book)/i.test(cleanQ) ||
      /^[a-z0-9]+[_-][a-z0-9_-]+$/i.test(cleanQ) ||
      allBlocks.some(
        (b) =>
          (b.reservationCode && b.reservationCode.toLowerCase() === cleanQ) ||
          (b.groupCode && b.groupCode.toLowerCase() === cleanQ),
      ) ||
      propRooms.some((r) => {
        const proj = r.projectedReservation;
        const upc = r.upcomingReservation;
        const stayRes = (r.activeStay as any)?.reservation;
        return (
          (proj?.reservationCode && proj.reservationCode.toLowerCase() === cleanQ) ||
          ((proj as any)?.groupCode && String((proj as any).groupCode).toLowerCase() === cleanQ) ||
          (upc?.reservationCode && upc.reservationCode.toLowerCase() === cleanQ) ||
          ((upc as any)?.groupCode && String((upc as any).groupCode).toLowerCase() === cleanQ) ||
          (stayRes?.reservationCode && String(stayRes.reservationCode).toLowerCase() === cleanQ) ||
          (stayRes?.groupCode && String(stayRes.groupCode).toLowerCase() === cleanQ)
        );
      }) ||
      arrivalsList.some(
        (a) =>
          (a.reservationCode && a.reservationCode.toLowerCase() === cleanQ) ||
          (a.groupCode && a.groupCode.toLowerCase() === cleanQ),
      );

    if (!isCode) return;

    // 1. Check in allBlocks
    const blockMatch = allBlocks.find((b) => {
      const resCode = (b.reservationCode || "").toLowerCase();
      const grpCode = (b.groupCode || "").toLowerCase();
      return (
        resCode === cleanQ ||
        grpCode === cleanQ ||
        (cleanQ.length >= 4 && (resCode.includes(cleanQ) || grpCode.includes(cleanQ)))
      );
    });

    if (blockMatch?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(blockMatch.startDate)) {
      lastAutoAdjustedCodeRef.current = cleanQ;
      const targetDate = blockMatch.startDate;
      if (targetDate !== startDate) {
        setStartDate(targetDate);
      }
      onBusinessDateChange?.(targetDate);
      return;
    }

    // 2. Check in propRooms (from room search)
    for (const r of propRooms) {
      const proj = r.projectedReservation;
      if (proj) {
        const resCode = (proj.reservationCode || "").toLowerCase();
        const grpCode = ((proj as any)?.groupCode ? String((proj as any).groupCode) : "").toLowerCase();
        if (
          resCode === cleanQ ||
          grpCode === cleanQ ||
          (cleanQ.length >= 4 && (resCode.includes(cleanQ) || grpCode.includes(cleanQ)))
        ) {
          const rawDate = proj.plannedCheckInAt ? String(proj.plannedCheckInAt).slice(0, 10) : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            lastAutoAdjustedCodeRef.current = cleanQ;
            if (rawDate !== startDate) setStartDate(rawDate);
            onBusinessDateChange?.(rawDate);
            return;
          }
        }
      }
      const upc = r.upcomingReservation;
      if (upc) {
        const resCode = (upc.reservationCode || "").toLowerCase();
        const grpCode = ((upc as any)?.groupCode ? String((upc as any).groupCode) : "").toLowerCase();
        if (
          resCode === cleanQ ||
          grpCode === cleanQ ||
          (cleanQ.length >= 4 && (resCode.includes(cleanQ) || grpCode.includes(cleanQ)))
        ) {
          const rawDate = upc.plannedCheckInAt ? String(upc.plannedCheckInAt).slice(0, 10) : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            lastAutoAdjustedCodeRef.current = cleanQ;
            if (rawDate !== startDate) setStartDate(rawDate);
            onBusinessDateChange?.(rawDate);
            return;
          }
        }
      }
      const stayRes = (r.activeStay as any)?.reservation;
      if (stayRes) {
        const resCode = (stayRes.reservationCode ? String(stayRes.reservationCode) : "").toLowerCase();
        const grpCode = (stayRes.groupCode ? String(stayRes.groupCode) : "").toLowerCase();
        if (
          resCode === cleanQ ||
          grpCode === cleanQ ||
          (cleanQ.length >= 4 && (resCode.includes(cleanQ) || grpCode.includes(cleanQ)))
        ) {
          const rawDate = stayRes.plannedCheckInAt ? String(stayRes.plannedCheckInAt).slice(0, 10) : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            lastAutoAdjustedCodeRef.current = cleanQ;
            if (rawDate !== startDate) setStartDate(rawDate);
            onBusinessDateChange?.(rawDate);
            return;
          }
        }
      }
    }

    // 3. Check in arrivalsList
    const arrMatch = arrivalsList.find((a) => {
      const resCode = (a.reservationCode || "").toLowerCase();
      const grpCode = (a.groupCode || "").toLowerCase();
      return (
        resCode === cleanQ ||
        grpCode === cleanQ ||
        (cleanQ.length >= 4 && (resCode.includes(cleanQ) || grpCode.includes(cleanQ)))
      );
    });
    if (arrMatch?.plannedCheckInAt) {
      const rawDate = String(arrMatch.plannedCheckInAt).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        lastAutoAdjustedCodeRef.current = cleanQ;
        if (rawDate !== startDate) setStartDate(rawDate);
        onBusinessDateChange?.(rawDate);
        return;
      }
    }

    // 4. Async lookup fallback for future codes outside loaded lists
    if (cleanQ.length >= 4 && hotelId) {
      let cancelled = false;
      const timer = setTimeout(async () => {
        try {
          if (/group/i.test(cleanQ) || cleanQ.startsWith("grp")) {
            const groupData = await staffRoomsRepository.getGroupDetails(hotelId, cleanQ);
            if (cancelled) return;
            const target =
              groupData?.checkInDate ||
              groupData?.plannedCheckInAt ||
              groupData?.rooms?.[0]?.plannedCheckInAt;
            if (target) {
              const ymd = String(target).slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
                lastAutoAdjustedCodeRef.current = cleanQ;
                setStartDate((prev) => (prev !== ymd ? ymd : prev));
                onBusinessDateChange?.(ymd);
                return;
              }
            }
          }
        } catch {
          // not found as group, proceed to arrivals
        }

        try {
          const res = await requestInternalApiEnvelope<HotelOpsPage<HotelArrival>>(
            `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/arrivals?q=${encodeURIComponent(cleanQ)}&limit=1`,
            { method: "GET" },
          );
          if (cancelled) return;
          const item = res.data?.items?.[0];
          if (item?.plannedCheckInAt) {
            const ymd = String(item.plannedCheckInAt).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
              lastAutoAdjustedCodeRef.current = cleanQ;
              setStartDate((prev) => (prev !== ymd ? ymd : prev));
              onBusinessDateChange?.(ymd);
            }
          }
        } catch {
          // silent fallback
        }
      }, 400);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [
    searchQuery,
    allBlocks,
    propRooms,
    arrivalsList,
    hotelId,
    startDate,
    onBusinessDateChange,
  ]);

  // Generate days timeline list
  const daysList = useMemo(() => {
    const days: Array<{
      ymd: string;
      dayLabel: string;
      dateNum: string;
      isToday: boolean;
      isWeekend: boolean;
    }> = [];

    const dayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

    for (let i = 0; i < numDays; i++) {
      const ymd = addDaysYmd(startDate, i);
      const [y, m, d] = ymd.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dow = dateObj.getDay();

      days.push({
        ymd,
        dayLabel: dayLabels[dow],
        dateNum: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
        isToday: ymd === todayYmd,
        isWeekend: dow === 0 || dow === 6,
      });
    }

    return days;
  }, [startDate, numDays, todayYmd]);

  // Date range formatted display
  const dateRangeDisplay = useMemo(() => {
    if (!daysList.length) return "";
    const first = daysList[0].dateNum;
    const last = daysList[daysList.length - 1].dateNum;
    const year = startDate.slice(0, 4);
    return `${first} – ${last}/${year}`;
  }, [daysList, startDate]);

  // Filter categories and floors
  const categories = useMemo(() => {
    const set = new Set<string>();
    allRooms.forEach((r) => {
      if (r.roomTypeName) set.add(r.roomTypeName.trim());
    });
    return Array.from(set).sort();
  }, [allRooms]);

  const floors = useMemo(() => {
    const set = new Set<string>();
    allRooms.forEach((r) => {
      if (r.floor) set.add(String(r.floor).trim());
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [allRooms]);

  // Map blocks by roomId
  const blocksByRoomId = useMemo(() => {
    const map = new Map<string, RoomPlanBlock[]>();
    allBlocks.forEach((b) => {
      if (!map.has(b.roomId)) {
        map.set(b.roomId, []);
      }
      map.get(b.roomId)!.push(b);
    });
    return map;
  }, [allBlocks]);

  const occupiedRoomDaySet = useMemo(() => {
    const set = new Set<string>();
    for (const b of allBlocks) {
      if (b.status === "CANCELLED") continue;
      for (const day of daysList) {
        if (b.startDate <= day.ymd && b.endDate > day.ymd) {
          set.add(`${b.roomId}:${day.ymd}`);
        }
      }
    }
    return set;
  }, [allBlocks, daysList]);

  // Count overdue rooms across all rooms for emergency alert banner & status filter
  const overdueRooms = useMemo(() => {
    return allRooms.filter((r) => {
      const roomBlocks = blocksByRoomId.get(r.id) || [];
      return (
        r.status === "OVERDUE" ||
        r.physicalStatus === "OVERDUE" ||
        Boolean(r.statusConflictCode?.toUpperCase().includes("OVERDUE")) ||
        roomBlocks.some((b) => b.status === "OVERDUE")
      );
    });
  }, [allRooms, blocksByRoomId]);

  const overdueRoomIdSet = useMemo(
    () => new Set(overdueRooms.map((r) => r.id)),
    [overdueRooms],
  );

  // Room status counts for quick-filter pills
  const roomStatusCounts = useMemo(() => {
    let availableToday = 0;
    let occupiedToday = 0;
    let cleaning = 0;

    allRooms.forEach((r) => {
      const isCleaning =
        r.status === "PROCESSING" ||
        r.status === "DIRTY" ||
        r.status === "CLEANING" ||
        r.status === "INSPECTION";
      const isLocked =
        r.status === "MAINTENANCE" ||
        r.status === "BLOCKED" ||
        r.status === "OUT_OF_SERVICE";
      const roomBlocks = blocksByRoomId.get(r.id) || [];
      const hasActiveBlockToday = roomBlocks.some(
        (b) =>
          b.startDate <= todayYmd &&
          b.endDate > todayYmd &&
          b.status !== "CANCELLED",
      );

      if (isCleaning) {
        cleaning += 1;
      }
      if (hasActiveBlockToday || r.status === "OCCUPIED") {
        occupiedToday += 1;
      } else if (!isCleaning && !isLocked) {
        availableToday += 1;
      }
    });

    return {
      all: allRooms.length,
      availableToday,
      occupiedToday,
      cleaning,
      overdue: overdueRooms.length,
    };
  }, [allRooms, blocksByRoomId, todayYmd, overdueRooms.length]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return allRooms.filter((r) => {
      if (selectedCategory !== "all" && (r.roomTypeName || "") !== selectedCategory) {
        return false;
      }
      if (selectedFloor !== "all" && String(r.floor || "") !== selectedFloor) {
        return false;
      }

      if (selectedStatusFilter !== "all") {
        const isCleaning =
          r.status === "PROCESSING" ||
          r.status === "DIRTY" ||
          r.status === "CLEANING" ||
          r.status === "INSPECTION";
        const isLocked =
          r.status === "MAINTENANCE" ||
          r.status === "BLOCKED" ||
          r.status === "OUT_OF_SERVICE";
        const roomBlocks = blocksByRoomId.get(r.id) || [];
        const hasActiveBlockToday = roomBlocks.some(
          (b) =>
            b.startDate <= todayYmd &&
            b.endDate > todayYmd &&
            b.status !== "CANCELLED",
        );

        if (selectedStatusFilter === "available_today") {
          if (hasActiveBlockToday || r.status === "OCCUPIED" || isCleaning || isLocked) {
            return false;
          }
        } else if (selectedStatusFilter === "occupied_today") {
          if (!hasActiveBlockToday && r.status !== "OCCUPIED") {
            return false;
          }
        } else if (selectedStatusFilter === "cleaning") {
          if (!isCleaning) {
            return false;
          }
        } else if (selectedStatusFilter === "overdue") {
          if (!overdueRoomIdSet.has(r.id)) {
            return false;
          }
        }
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const cleanQueryRoom = query.replace(/^(p\.|p|phòng\s*)/i, "").trim();
        const matchesRoom =
          r.roomNumber.toLowerCase().includes(query) ||
          (cleanQueryRoom.length > 0 && r.roomNumber.toLowerCase().includes(cleanQueryRoom));
        const matchesType = (r.roomTypeName || "").toLowerCase().includes(query);
        const roomBlocks = blocksByRoomId.get(r.id) || [];
        const matchesGuest = roomBlocks.some(
          (b) =>
            (b.guestName || "").toLowerCase().includes(query) ||
            (b.guestDisplayName || "").toLowerCase().includes(query) ||
            (b.reservationCode || "").toLowerCase().includes(query) ||
            (b.groupCode || "").toLowerCase().includes(query) ||
            (b.channel || "").toLowerCase().includes(query) ||
            (b.channelName || "").toLowerCase().includes(query) ||
            (b.source || "").toLowerCase().includes(query) ||
            (b.phone || "").toLowerCase().includes(query) ||
            (b.notes || "").toLowerCase().includes(query),
        );
        const propRoom = propRooms.find((pr) => pr.id === r.id);
        const matchesProp = Boolean(
          propRoom && (
            (propRoom.projectedReservation?.reservationCode && propRoom.projectedReservation.reservationCode.toLowerCase().includes(query)) ||
            ((propRoom.projectedReservation as any)?.groupCode && String((propRoom.projectedReservation as any).groupCode).toLowerCase().includes(query)) ||
            (propRoom.upcomingReservation?.reservationCode && propRoom.upcomingReservation.reservationCode.toLowerCase().includes(query)) ||
            ((propRoom.upcomingReservation as any)?.groupCode && String((propRoom.upcomingReservation as any).groupCode).toLowerCase().includes(query)) ||
            ((propRoom.activeStay as any)?.reservation?.reservationCode && String((propRoom.activeStay as any).reservation.reservationCode).toLowerCase().includes(query)) ||
            ((propRoom.activeStay as any)?.reservation?.groupCode && String((propRoom.activeStay as any).reservation.groupCode).toLowerCase().includes(query))
          )
        );
        if (!matchesRoom && !matchesType && !matchesGuest && !matchesProp) return false;
      }
      return true;
    });
  }, [
    allRooms,
    selectedCategory,
    selectedFloor,
    selectedStatusFilter,
    searchQuery,
    blocksByRoomId,
    propRooms,
    todayYmd,
    overdueRoomIdSet,
  ]);

  // Custom room order via Zustand store
  const customOrder = useRoomOrderStore((s) => s.roomOrderMap[hotelId]);
  const setRoomOrder = useRoomOrderStore((s) => s.setRoomOrder);
  const resetRoomOrder = useRoomOrderStore((s) => s.resetRoomOrder);
  const hasCustomOrder = Boolean(customOrder && customOrder.length > 0);

  // Ordered filtered rooms based on customOrder if present
  const orderedFilteredRooms = useMemo(() => {
    if (!customOrder || customOrder.length === 0) return filteredRooms;
    const orderMap = new Map<string, number>();
    customOrder.forEach((id, idx) => orderMap.set(id, idx));

    return [...filteredRooms].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 99999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 99999;
      return idxA - idxB;
    });
  }, [filteredRooms, customOrder]);

  // Group rooms by category
  const roomsByCategory = useMemo(() => {
    const map = new Map<string, RoomPlanRoom[]>();
    orderedFilteredRooms.forEach((r) => {
      const cat = r.roomTypeName || "Hạng phòng khác";
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(r);
    });
    return Array.from(map.entries());
  }, [orderedFilteredRooms]);

  // Collapsed state for category room lists (expand / collapse)
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});

  const toggleCategory = useCallback((categoryName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }));
  }, []);

  const allCollapsed = useMemo(() => {
    return (
      roomsByCategory.length > 0 &&
      roomsByCategory.every(([cat]) => Boolean(collapsedCategories[cat]))
    );
  }, [roomsByCategory, collapsedCategories]);

  const toggleAllCategories = useCallback(() => {
    if (allCollapsed) {
      setCollapsedCategories({});
    } else {
      const next: Record<string, boolean> = {};
      roomsByCategory.forEach(([cat]) => {
        next[cat] = true;
      });
      setCollapsedCategories(next);
    }
  }, [allCollapsed, roomsByCategory]);

  // Dnd-kit sensors with distance constraint so click actions on cells/buttons are never blocked
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const handleRowDragEnd = (event: DragEndEvent) => {
    if (isReadOnly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = orderedFilteredRooms.map((r) => r.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(currentIds, oldIndex, newIndex);
      setRoomOrder(hotelId, newOrder);
    }
  };

  // Pending target for smooth overdue navigation across date changes
  const [pendingOverdueTarget, setPendingOverdueTarget] = useState<{
    roomId: string;
    blockId?: string;
    dayYmd: string;
    timestamp: number;
  } | null>(null);

  // Cycling index for overdue room navigation
  const [overdueFocusIndex, setOverdueFocusIndex] = useState(0);

  const focusOverdueRoom = useCallback(
    (targetRoom: RoomPlanRoom) => {
      // 1. Uncollapse category if collapsed
      const cat = targetRoom.roomTypeName || "Hạng phòng khác";
      setCollapsedCategories((prev) => {
        if (!prev[cat]) return prev;
        return { ...prev, [cat]: false };
      });

      // 2. Clear filters if this room is filtered out
      if (searchQuery.trim()) setSearchQuery("");
      if (selectedCategory !== "all" && (targetRoom.roomTypeName || "") !== selectedCategory) {
        setSelectedCategory("all");
      }
      if (selectedFloor !== "all" && String(targetRoom.floor || "") !== selectedFloor) {
        setSelectedFloor("all");
      }
      if (selectedStatusFilter !== "all" && selectedStatusFilter !== "overdue") {
        setSelectedStatusFilter("all");
      }

      // 3. Find overdue block or date
      const roomBlocks = blocksByRoomId.get(targetRoom.id) || [];
      const overdueBlock = roomBlocks.find(
        (b) =>
          b.status === "OVERDUE" ||
          (b.kind === "STAY" && b.status !== "CHECKED_OUT" && b.endDate <= todayYmd),
      );

      let targetDate = todayYmd;
      let blockStartDate: string | null = null;

      if (overdueBlock) {
        targetDate = overdueBlock.endDate <= todayYmd ? overdueBlock.endDate : todayYmd;
        blockStartDate = overdueBlock.startDate;
      } else if (targetRoom.activeStay?.plannedCheckOutAt) {
        targetDate = String(targetRoom.activeStay.plannedCheckOutAt).slice(0, 10);
        if (targetRoom.activeStay.plannedCheckInAt) {
          blockStartDate = String(targetRoom.activeStay.plannedCheckInAt).slice(0, 10);
        }
      }

      // Check if targetDate is currently visible in daysList
      const isTargetDateVisible = daysList.some((d) => d.ymd === targetDate);

      let targetStartDate = startDate;
      if (!isTargetDateVisible) {
        if (blockStartDate) {
          const nights = calculateNights(blockStartDate, targetDate);
          if (nights >= 0 && nights < numDays - 1) {
            targetStartDate = blockStartDate;
          } else {
            targetStartDate = addDaysYmd(targetDate, -2);
          }
        } else {
          targetStartDate = addDaysYmd(targetDate, -1);
        }
      }

      // 4. Set pending focus target
      setPendingOverdueTarget({
        roomId: targetRoom.id,
        blockId: overdueBlock?.id,
        dayYmd: targetDate,
        timestamp: Date.now(),
      });

      // 5. Shift startDate if needed
      if (targetStartDate !== startDate) {
        setStartDate(targetStartDate);
      }
    },
    [
      blocksByRoomId,
      todayYmd,
      daysList,
      numDays,
      startDate,
      searchQuery,
      selectedCategory,
      selectedFloor,
      selectedStatusFilter,
    ],
  );

  const handleNextOverdue = useCallback(() => {
    if (overdueRooms.length === 0) return;
    const targetIndex = overdueFocusIndex % overdueRooms.length;
    setOverdueFocusIndex((prev) => (prev + 1) % overdueRooms.length);
    const room = overdueRooms[targetIndex];
    if (room) {
      focusOverdueRoom(room);
    }
  }, [overdueRooms, overdueFocusIndex, focusOverdueRoom]);

  useEffect(() => {
    if (!pendingOverdueTarget) return;
    const { roomId, blockId, dayYmd, timestamp } = pendingOverdueTarget;



    const timer = setTimeout(() => {
      if (Date.now() - timestamp > 4000) {
        setPendingOverdueTarget(null);
        return;
      }
      let blockEl: HTMLElement | null = null;
      if (blockId) {
        blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      }

      const rowEl = document.querySelector(`[data-room-id="${roomId}"]`) as HTMLElement | null;
      const cellEl =
        rowEl && dayYmd
          ? (rowEl.querySelector(`[data-day-ymd="${dayYmd}"]`) as HTMLElement | null)
          : null;

      const targetEl = blockEl || cellEl || rowEl;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

        if (blockEl) {
          blockEl.classList.add(
            "ring-4",
            "ring-rose-500",
            "ring-offset-2",
            "animate-pulse",
            "z-30",
            "shadow-xl",
          );
          setTimeout(() => {
            blockEl?.classList.remove(
              "ring-4",
              "ring-rose-500",
              "ring-offset-2",
              "animate-pulse",
              "z-30",
              "shadow-xl",
            );
          }, 3500);
        } else if (cellEl) {
          cellEl.classList.add("ring-2", "ring-rose-500", "bg-rose-100/90", "z-20");
          setTimeout(() => {
            cellEl?.classList.remove("ring-2", "ring-rose-500", "bg-rose-100/90", "z-20");
          }, 3500);
        }

        if (rowEl) {
          rowEl.classList.add("bg-rose-50/80", "transition-colors");
          setTimeout(() => {
            rowEl?.classList.remove("bg-rose-50/80");
          }, 3500);
        }

        setPendingOverdueTarget(null);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [pendingOverdueTarget, startDate, isPlanFetching, daysList]);

  // Date picker ref and trigger handler to allow clicking to jump to any date
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleOpenDatePicker = useCallback(() => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === "function") {
        try {
          dateInputRef.current.showPicker();
          return;
        } catch {
          // Fallback if browser security denies showPicker
        }
      }
      dateInputRef.current.focus();
    }
  }, []);

  // Room occupancy stats (Công suất phòng toàn khách sạn theo từng ngày và trung bình cả kỳ)
  const periodOccupancyStats = useMemo(() => {
    const roomsToCount = orderedFilteredRooms.length > 0 ? orderedFilteredRooms : allRooms;
    const totalRooms = roomsToCount.length;
    if (totalRooms === 0 || daysList.length === 0) {
      return { daily: [], avgPercent: 0, todayPercent: 0, todayOccupied: 0, totalRooms: 0 };
    }

    let totalOccupiedSum = 0;
    let todayOccupied = 0;
    let todayPercent = 0;

    const daily = daysList.map((day) => {
      const occupied = roomsToCount.reduce(
        (acc, room) => acc + (occupiedRoomDaySet.has(`${room.id}:${day.ymd}`) ? 1 : 0),
        0,
      );

      const percent = Math.round((occupied / totalRooms) * 100);
      totalOccupiedSum += occupied;

      if (day.isToday) {
        todayOccupied = occupied;
        todayPercent = percent;
      }

      return {
        ymd: day.ymd,
        dayLabel: day.dayLabel,
        dateNum: day.dateNum,
        isToday: day.isToday,
        occupied,
        available: Math.max(0, totalRooms - occupied),
        percent,
      };
    });

    const avgPercent = Math.round(totalOccupiedSum / (totalRooms * daysList.length) * 100);

    return { daily, avgPercent, todayPercent, todayOccupied, totalRooms };
  }, [allRooms, orderedFilteredRooms, occupiedRoomDaySet, daysList]);

  // Navigation handlers with 1-day overlap as requested by user
  // When viewMode is week (7 days), stepping is 6 days so the last day of the previous view
  // (e.g. 20/10) becomes the first day of the next view, maintaining continuity.
  const stepDays = Math.max(1, numDays - 1);
  const handlePrevStep = useCallback(() => setStartDate((prev) => addDaysYmd(prev, -stepDays)), [stepDays]);
  const handleNextStep = useCallback(() => setStartDate((prev) => addDaysYmd(prev, stepDays)), [stepDays]);
  const handlePrevDay = useCallback(() => setStartDate((prev) => addDaysYmd(prev, -1)), []);
  const handleNextDay = useCallback(() => setStartDate((prev) => addDaysYmd(prev, 1)), []);
  const handleGoToday = useCallback(() => setStartDate(todayYmd), [todayYmd]);

  // Keyboard navigation shortcuts (ArrowLeft / ArrowRight to step days, 'T' for today, 'W' for week/biweek)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedBlock || placementModalOpen) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevStep();
        } else {
          handlePrevDay();
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) {
          handleNextStep();
        } else {
          handleNextDay();
        }
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleGoToday();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setViewMode((v) => (v === "week" ? "biweek" : "week"));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedBlock,
    placementModalOpen,
    handlePrevStep,
    handleNextStep,
    handlePrevDay,
    handleNextDay,
    handleGoToday,
  ]);

  // Check-out action from Drawer -> redirects to Billing / Folio page to process
  const handleDrawerCheckOut = async () => {
    if (!selectedBlock || !selectedBlock.guestStayId || !onCheckOutStay) return;
    const stayId = selectedBlock.guestStayId;
    const roomNumber = selectedBlock.roomNumber;
    setSelectedBlock(null);
    await onCheckOutStay(stayId, roomNumber);
    await invalidateHotelRealtimeQueries(queryClient, hotelId);
    void refetchPlan();
  };

  // Check-in action from Modal for pre-booked reservation
  const handleDrawerCheckIn = async () => {
    if (!selectedBlock) return;

    if (selectedBlock.startDate > todayYmd) {
      const confirmEarly = await showConfirmDialog({
        icon: "warning",
        title: "Xác nhận nhận phòng sớm?",
        html: formatEarlyCheckInConfirmHtml({
          guestName: selectedBlock.guestName,
          roomNumber: selectedBlock.roomNumber,
          scheduledDate: selectedBlock.startDate,
          actualDate: todayYmd,
          isEarly: true,
        }),
        confirmText: "Xác nhận nhận phòng sớm",
        cancelText: "Hủy bỏ",
      });
      if (!confirmEarly.isConfirmed) return;
    }

    const currentBlock = selectedBlock;
    setSelectedBlock(null);

    if (onCheckInReservation) {
      await onCheckInReservation(currentBlock);
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchPlan();
    } else if (onOpenCheckIn) {
      const targetRoom = allRooms.find((r) => r.id === currentBlock.roomId);
      if (targetRoom) {
        onOpenCheckIn(targetRoom, currentBlock.startDate);
      }
    }
  };

  // Open placement modal for accessible button
  const handleOpenPlacementModal = (block: RoomPlanBlock) => {
    if (isReadOnly) return;
    setPlacementSourceBlock(block);
    setPlacementTargetRoomId("");
    setPlacementTargetSwapResId("");
    setPlacementModalOpen(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, block: RoomPlanBlock) => {
    if (isReadOnly) {
      e.preventDefault();
      return;
    }
    setActiveDragRange(null);
    setDraftSelection(null);
    setActiveBlockResize(null);

    const effectiveResId = block.reservationId || block.guestStayId || block.id;
    if (!block.movable || !effectiveResId) {
      e.preventDefault();
      return;
    }

    const payload: DraggedReservationPayload = {
      blockId: block.id,
      reservationId: effectiveResId,
      fromRoomId: block.roomId,
      fromRoomNumber: block.roomNumber,
      roomTypeId: block.roomTypeId,
      roomTypeName: block.roomTypeName,
      guestName: block.guestName,
      startDate: block.startDate,
      endDate: block.endDate,
      expectedUpdatedAt: block.expectedUpdatedAt,
    };

    setDraggedBlock(payload);

    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const lastDragOverRef = useRef<{ roomId: string; dayYmd?: string }>({ roomId: "" });
  const dragOverRafRef = useRef<number | null>(null);

  const handleDragEnd = useCallback(() => {
    if (dragOverRafRef.current !== null) {
      cancelAnimationFrame(dragOverRafRef.current);
      dragOverRafRef.current = null;
    }
    lastDragOverRef.current = { roomId: "" };
    setDraggedBlock(null);
    setDragOverCellKey(null);
    setDragOverDayYmd(null);
  }, []);

  const handleDragOverCell = useCallback((e: React.DragEvent, cellKey: string, dayYmd?: string) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (
      lastDragOverRef.current.roomId === cellKey &&
      lastDragOverRef.current.dayYmd === dayYmd
    ) {
      return;
    }

    lastDragOverRef.current = { roomId: cellKey, dayYmd };

    if (dragOverRafRef.current !== null) {
      cancelAnimationFrame(dragOverRafRef.current);
    }
    dragOverRafRef.current = requestAnimationFrame(() => {
      setDragOverCellKey(cellKey);
      setDragOverDayYmd(dayYmd ?? null);
    });
  }, [isReadOnly]);

  const handleDragLeaveCell = useCallback((_cellKey: string) => {
    // No-op to avoid state flickering when moving across cell boundaries within a room
  }, []);

  const handleDropOnRoom = async (e: React.DragEvent, targetRoom: RoomPlanRoom) => {
    if (isReadOnly) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (dragOverRafRef.current !== null) {
      cancelAnimationFrame(dragOverRafRef.current);
      dragOverRafRef.current = null;
    }
    lastDragOverRef.current = { roomId: "" };
    setDragOverCellKey(null);
    setDragOverDayYmd(null);
    setDraggedBlock(null);

    const rawData =
      e.dataTransfer.getData("application/json") ||
      e.dataTransfer.getData("text/plain");
    if (!rawData) return;

    let payload: DraggedReservationPayload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (payload.fromRoomId === targetRoom.id) return;

    // Không cho phép di chuyển hoặc đổi phòng cho đơn đã kết thúc trong quá khứ
    if (payload.endDate <= todayYmd) {
      void showErrorAlert(
        "Đơn đặt phòng trong quá khứ",
        "Không thể di chuyển hoặc đổi phòng cho các đơn lưu trú đã kết thúc trong quá khứ.",
      );
      return;
    }

    // Check if target room is locked/maintenance
    const isTargetLocked =
      targetRoom.status === "MAINTENANCE" ||
      targetRoom.status === "BLOCKED" ||
      targetRoom.status === "OUT_OF_SERVICE";
    if (isTargetLocked) {
      void showErrorAlert(
        "Phòng đang bị khóa / bảo trì",
        `Phòng ${targetRoom.roomNumber} đang ở trạng thái khóa hoặc bảo trì, không thể xếp phòng cho khách.`,
      );
      return;
    }

    // Check same room type
    const sourceTypeId = payload.roomTypeId;
    const targetTypeId = targetRoom.roomTypeId;
    if (sourceTypeId && targetTypeId && sourceTypeId !== targetTypeId) {
      void showErrorAlert(
        "Không thể chuyển phòng khác loại",
        `Đơn đặt phòng chỉ có thể chuyển giữa các phòng cùng loại (${payload.roomTypeName || "Hạng phòng"}).`,
      );
      return;
    }

    // Check if target room has conflict in that range
    const targetRoomBlocks = blocksByRoomId.get(targetRoom.id) || [];
    const conflictBlock = targetRoomBlocks.find(
      (b) => b.startDate < payload.endDate && b.endDate > payload.startDate,
    );

    if (conflictBlock) {
      const conflictResId = conflictBlock.reservationId || conflictBlock.guestStayId || conflictBlock.id;
      if (conflictBlock.movable && conflictResId) {
        // Offer swap
        const swapRes = await showConfirmDialog({
          title: "Xác nhận tráo đổi phòng?",
          html: formatRoomSwapConfirmHtml({
            sourceGuest: payload.guestName,
            sourceRoom: payload.fromRoomNumber,
            sourceDates: `${payload.startDate} ➔ ${payload.endDate}`,
            sourceRoomType: payload.roomTypeName,
            targetGuest: conflictBlock.guestName,
            targetRoom: targetRoom.roomNumber,
            targetDates: `${conflictBlock.startDate} ➔ ${conflictBlock.endDate}`,
            targetRoomType: conflictBlock.roomTypeName,
          }),
          confirmText: "Xác nhận tráo phòng",
          cancelText: "Hủy bỏ",
        });

        if (swapRes.isConfirmed) {
          placementMutation.mutate({
            reservationId: payload.reservationId,
            targetRoomId: targetRoom.id,
            mode: "SWAP",
            expectedUpdatedAt: payload.expectedUpdatedAt,
            swapWithReservationId: conflictResId,
            swapExpectedUpdatedAt: conflictBlock.expectedUpdatedAt,
          });
        }
      } else {
        void showErrorAlert(
          "Phòng đang có khách lưu trú",
          `Phòng ${targetRoom.roomNumber} đang có lượt lưu trú trùng khoảng thời gian không thể di dời.`,
        );
      }
      return;
    }

    // Simple Move with dirty room warning
    const isDirtyOrCleaning =
      targetRoom.status === "PROCESSING" ||
      targetRoom.status === "DIRTY" ||
      targetRoom.status === "CLEANING" ||
      targetRoom.status === "INSPECTION";

    const dirtyStatusLabels: Record<string, string> = {
      PROCESSING: "chờ dọn dẹp",
      DIRTY: "chưa dọn",
      CLEANING: "đang dọn dẹp",
      INSPECTION: "chờ kiểm tra",
    };

    const moveRes = await showConfirmDialog({
      title: isDirtyOrCleaning
        ? `Xếp vào phòng đang chờ dọn (P.${targetRoom.roomNumber})?`
        : `Chuyển đơn sang phòng ${targetRoom.roomNumber}?`,
      html: formatRoomMoveConfirmHtml({
        guestName: payload.guestName,
        fromRoom: payload.fromRoomNumber,
        toRoom: targetRoom.roomNumber,
        startDate: payload.startDate,
        endDate: payload.endDate,
        roomTypeName: payload.roomTypeName || targetRoom.roomTypeName,
        isDirtyOrCleaning,
        dirtyStatusLabel: dirtyStatusLabels[targetRoom.status] || "chờ dọn dẹp",
      }),
      confirmText: isDirtyOrCleaning ? "Vẫn chuyển phòng" : "Xác nhận chuyển",
      cancelText: "Hủy bỏ",
    });

    if (moveRes.isConfirmed) {
      placementMutation.mutate({
        reservationId: payload.reservationId,
        targetRoomId: targetRoom.id,
        mode: "MOVE",
        expectedUpdatedAt: payload.expectedUpdatedAt,
      });
    }
  };

  // Compatible rooms for placement modal
  const compatibleRoomsForPlacement = useMemo(() => {
    if (!placementSourceBlock) return [];
    return allRooms.filter((r) => {
      if (r.id === placementSourceBlock.roomId) return false;
      if (
        placementSourceBlock.roomTypeId &&
        r.roomTypeId &&
        placementSourceBlock.roomTypeId !== r.roomTypeId
      ) {
        return false;
      }
      return true;
    });
  }, [placementSourceBlock, allRooms]);

  // ── Draft Reservation State (Click / Drag horizontally to select dates, vertically to select multiple rooms) ──
  const [draftSelection, setDraftSelection] = useState<DraftBookingSelection | null>(null);
  const [activeDragRange, setActiveDragRange] = useState<ActiveDragRange | null>(null);
  const dragEndedAtRef = useRef<number>(0);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const clickAnchorRef = useRef<{ room: RoomPlanRoom; ymd: string } | null>(null);

  // Active highlight date range from range drag, draft selection, or dragged reservation block
  const activeHighlightedDateRange = useMemo<{
    startDay: string;
    endDay: string;
  } | null>(() => {
    if (draftSelection) {
      return {
        startDay: draftSelection.startDay,
        endDay: draftSelection.endDay,
      };
    }
    if (activeDragRange) {
      const start =
        activeDragRange.anchorDay < activeDragRange.currentDay
          ? activeDragRange.anchorDay
          : activeDragRange.currentDay;
      const endCandidate =
        activeDragRange.anchorDay < activeDragRange.currentDay
          ? activeDragRange.currentDay
          : activeDragRange.anchorDay;
      return {
        startDay: start,
        endDay: addDaysYmd(endCandidate, 1),
      };
    }
    if (draggedBlock && dragOverCellKey) {
      return {
        startDay: draggedBlock.startDate,
        endDay: draggedBlock.endDate,
      };
    }
    return null;
  }, [draftSelection, activeDragRange, draggedBlock, dragOverCellKey]);

  const onOpenQuickReservationRef = useRef(onOpenQuickReservation);
  useEffect(() => {
    onOpenQuickReservationRef.current = onOpenQuickReservation;
  }, [onOpenQuickReservation]);

  const onOpenCheckInRef = useRef(onOpenCheckIn);
  useEffect(() => {
    onOpenCheckInRef.current = onOpenCheckIn;
  }, [onOpenCheckIn]);

  // Global mouseup to finalize range drag or trigger quick reservation on click
  useEffect(() => {
    if (isReadOnly || !activeDragRange) return;
    const handleGlobalMouseUp = async () => {
      dragEndedAtRef.current = Date.now();
      const wasDrag = hasDraggedRef.current;
      const clicked = clickAnchorRef.current;

      setActiveDragRange(null);
      clickAnchorRef.current = null;
      dragStartPosRef.current = null;
      hasDraggedRef.current = false;

      // Nếu chỉ là một cú click đơn (không kéo giữ)
      if (!wasDrag && clicked) {
        setDraftSelection(null);

        // Yêu cầu xác nhận / cảnh báo nếu phòng đang ở trạng thái Chờ dọn
        const isDirty =
          clicked.room.status === "PROCESSING" ||
          clicked.room.status === "DIRTY" ||
          clicked.room.status === "CLEANING" ||
          clicked.room.status === "INSPECTION";

        if (isDirty) {
          const confirm = await showConfirmDialog({
            title: "Xác nhận dọn phòng trước khi đặt",
            html: formatRoomDirtyWarningHtml({
              roomNames: `Phòng P.${clicked.room.roomNumber}`,
            }),
            confirmText: "Xác nhận dọn & Tiếp tục đặt",
            cancelText: "Hủy bỏ",
          });
          if (!confirm.isConfirmed) return;
        }

        const nextDay = addDaysYmd(clicked.ymd, 1);
        if (onOpenQuickReservationRef.current) {
          onOpenQuickReservationRef.current(clicked.room, clicked.ymd, nextDay);
        } else if (onOpenCheckInRef.current && clicked.ymd === todayYmd) {
          onOpenCheckInRef.current(clicked.room, clicked.ymd);
        } else {
          // Fallback nếu không có hàm mở modal
          setDraftSelection({
            roomId: clicked.room.id,
            roomNumber: clicked.room.roomNumber,
            room: clicked.room,
            rooms: [clicked.room],
            startDay: clicked.ymd,
            endDay: nextDay,
            nights: 1,
          });
        }
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [activeDragRange, todayYmd, isReadOnly]);

  // Press Escape to cancel draft selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraftSelection(null);
        setActiveDragRange(null);
        setActiveDraftAdjust(null);
        setDraggedBlock(null);
        setDragOverCellKey(null);
        setDragOverDayYmd(null);
        clickAnchorRef.current = null;
        dragStartPosRef.current = null;
        hasDraggedRef.current = false;
        setActiveBlockResize(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Global click-outside to cancel draft selection cleanly when clicking outside the chart
  useEffect(() => {
    if (!draftSelection) return;
    const handleDocumentClick = (e: MouseEvent) => {
      // Ignore click synthesized immediately upon drag release (< 300ms)
      if (Date.now() - dragEndedAtRef.current < 300) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-tape-chart-container="true"]')) return;
      setDraftSelection(null);
      setActiveDragRange(null);
      setActiveDraftAdjust(null);
      clickAnchorRef.current = null;
      dragStartPosRef.current = null;
      hasDraggedRef.current = false;
    };
    const timer = setTimeout(() => {
      window.addEventListener("click", handleDocumentClick);
    }, 60);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleDocumentClick);
    };
  }, [draftSelection]);

  const handleStartDragRange = useCallback(
    (room: RoomPlanRoom, ymd: string, clientX?: number, clientY?: number) => {
      if (isReadOnly) return;
      // Clear block resize mode if any
      setActiveBlockResize(null);

      // Không cho phép bắt đầu giữ phòng từ các ngày trong quá khứ
      if (ymd < todayYmd) return;

      const isHardVeto =
        room.status === "MAINTENANCE" ||
        room.status === "BLOCKED" ||
        room.status === "OUT_OF_SERVICE";
      if (isHardVeto) return;

      const blocks = blocksByRoomId.get(room.id) || [];
      const isOccupied = blocks.some((b) => b.startDate <= ymd && b.endDate > ymd);
      if (isOccupied) return;

      // Xóa draft selection cũ nếu có
      setDraftSelection(null);

      dragStartPosRef.current =
        typeof clientX === "number" && typeof clientY === "number"
          ? { x: clientX, y: clientY }
          : null;
      hasDraggedRef.current = false;
      clickAnchorRef.current = { room, ymd };

      setActiveDragRange({
        anchorRoom: room,
        anchorDay: ymd,
        currentRoom: room,
        currentDay: ymd,
      });
    },
    [blocksByRoomId, todayYmd, isReadOnly],
  );

  const handleHoverDragDay = useCallback(
    (targetRoom: RoomPlanRoom, targetYmd: string, clientY?: number) => {
      if (isReadOnly || !activeDragRange) return;

      const anchorDay = activeDragRange.anchorDay;
      const anchorRoom = activeDragRange.anchorRoom;

      // Không cho phép bắt đầu hoặc giữ phòng đang bị khóa / bảo trì
      const isAnchorLocked =
        anchorRoom.status === "MAINTENANCE" ||
        anchorRoom.status === "BLOCKED" ||
        anchorRoom.status === "OUT_OF_SERVICE";
      if (isAnchorLocked) return;

      // 1. Kiểm tra ngưỡng kéo dọc thông minh (Smart Vertical Intent Threshold)
      // Nếu con trỏ chuột di chuyển dọc < 32px so với vị trí mousedown ban đầu,
      // khóa cứng phòng về anchorRoom để rung tay khi kéo ngang không bao giờ dính phòng khác.
      let effectiveRoom = targetRoom;
      if (dragStartPosRef.current && typeof clientY === "number") {
        const dy = Math.abs(clientY - dragStartPosRef.current.y);
        if (dy < 32) {
          effectiveRoom = anchorRoom;
        }
      }

      // Không cho phép chọn vào phòng đích nếu phòng đích bị khóa/bảo trì
      const isTargetLocked =
        effectiveRoom.status === "MAINTENANCE" ||
        effectiveRoom.status === "BLOCKED" ||
        effectiveRoom.status === "OUT_OF_SERVICE";
      if (isTargetLocked) {
        effectiveRoom = anchorRoom;
      }

      // Nếu đã kéo và con trỏ vẫn ở chính phòng & ngày hiện tại: bỏ qua để tránh render lặp
      if (
        hasDraggedRef.current &&
        activeDragRange.currentRoom.id === effectiveRoom.id &&
        activeDragRange.currentDay === targetYmd
      ) {
        return;
      }

      // Nếu vẫn ở chính ô bắt đầu và chưa từng kéo ra ngoài: bỏ qua
      if (
        effectiveRoom.id === anchorRoom.id &&
        targetYmd === anchorDay &&
        !hasDraggedRef.current
      ) {
        return;
      }

      // Xác nhận chuyển sang chế độ kéo nhiều ngày / nhiều phòng
      hasDraggedRef.current = true;

      // Không cho phép kéo lùi về các ngày trong quá khứ trước hôm nay
      const effectiveTargetYmd = targetYmd < todayYmd ? todayYmd : targetYmd;

      // 2. Horizontal date range calculation (bắt đầu tối thiểu từ todayYmd)
      let start = anchorDay;
      let end = addDaysYmd(effectiveTargetYmd, 1);

      if (effectiveTargetYmd < anchorDay) {
        start = effectiveTargetYmd;
        end = addDaysYmd(anchorDay, 1);
      }

      if (start < todayYmd) {
        start = todayYmd;
      }

      // Check collision on the anchor room
      const anchorBlocks = blocksByRoomId.get(anchorRoom.id) || [];
      if (targetYmd >= anchorDay) {
        const collidingBlock = anchorBlocks
          .filter((b) => b.startDate >= anchorDay && b.startDate < end && b.status !== "CANCELLED")
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        if (collidingBlock) {
          end = collidingBlock.startDate;
        }
      } else {
        const collidingBlock = anchorBlocks
          .filter((b) => b.endDate > start && b.endDate <= anchorDay && b.status !== "CANCELLED")
          .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
        if (collidingBlock) {
          start = collidingBlock.endDate;
        }
      }

      if (end <= start) {
        end = addDaysYmd(start, 1);
      }

      const nights = calculateNights(start, end);

      // 3. Vertical room range calculation (Khóa cứng phạm vi cùng hạng phòng - Category Lock)
      const anchorCat = anchorRoom.roomTypeName || "Hạng phòng khác";
      const catRooms = roomsByCategory.find(([c]) => c === anchorCat)?.[1] || [anchorRoom];
      const anchorIdx = catRooms.findIndex((r) => r.id === anchorRoom.id);
      let targetIdx = catRooms.findIndex((r) => r.id === effectiveRoom.id);

      let selectedRooms: RoomPlanRoom[] = [anchorRoom];

      if (anchorIdx !== -1) {
        if (targetIdx === -1) {
          // Con trỏ di chuyển ra ngoài hạng phòng: xác định xem đang ở trên hay ở dưới
          const anchorOverallIdx = orderedFilteredRooms.findIndex((r) => r.id === anchorRoom.id);
          const targetOverallIdx = orderedFilteredRooms.findIndex((r) => r.id === effectiveRoom.id);
          if (targetOverallIdx !== -1 && anchorOverallIdx !== -1) {
            if (targetOverallIdx > anchorOverallIdx) {
              // Ở bên dưới -> giới hạn tối đa đến phòng cuối cùng của hạng phòng này
              targetIdx = catRooms.length - 1;
            } else {
              // Ở bên trên -> giới hạn tối đa đến phòng đầu tiên của hạng phòng này
              targetIdx = 0;
            }
          } else {
            targetIdx = anchorIdx;
          }
        }

        const minIdx = Math.min(anchorIdx, targetIdx);
        const maxIdx = Math.max(anchorIdx, targetIdx);
        const candidateRooms = catRooms.slice(minIdx, maxIdx + 1);

        // Lọc bỏ phòng bảo trì hoặc bị trùng lịch đặt trong khoảng [start, end)
        selectedRooms = candidateRooms.filter((candRoom) => {
          const isCandLocked =
            candRoom.status === "MAINTENANCE" ||
            candRoom.status === "BLOCKED" ||
            candRoom.status === "OUT_OF_SERVICE";
          if (isCandLocked) return false;

          if (candRoom.id === anchorRoom.id) return true;
          const rBlocks = blocksByRoomId.get(candRoom.id) || [];
          const isColliding = rBlocks.some(
            (b) => b.startDate < end && b.endDate > start && b.status !== "CANCELLED",
          );
          return !isColliding;
        });

        if (selectedRooms.length === 0) {
          selectedRooms = [anchorRoom];
        }
      }

      setActiveDragRange((prev) =>
        prev
          ? {
              ...prev,
              currentRoom: effectiveRoom,
              currentDay: targetYmd,
            }
          : null,
      );

      setDraftSelection({
        roomId: anchorRoom.id,
        roomNumber: anchorRoom.roomNumber,
        room: anchorRoom,
        rooms: selectedRooms,
        startDay: start,
        endDay: end,
        nights,
      });
    },
    [
      activeDragRange,
      blocksByRoomId,
      roomsByCategory,
      orderedFilteredRooms,
      todayYmd,
      isReadOnly,
    ],
  );

  // Global pointermove for active range drag across horizontal (days) and vertical (rooms)
  useEffect(() => {
    if (isReadOnly || !activeDragRange) return;

    let rangeRafId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const handlePointerMoveRange = (e: MouseEvent | PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (rangeRafId !== null) return;

      rangeRafId = requestAnimationFrame(() => {
        rangeRafId = null;

        // Chỉ kích hoạt chế độ kéo nếu con trỏ chuột di chuyển đáng kể (> 8px)
        if (dragStartPosRef.current && !hasDraggedRef.current) {
          const dx = Math.abs(lastClientX - dragStartPosRef.current.x);
          const dy = Math.abs(lastClientY - dragStartPosRef.current.y);
          if (dx < 8 && dy < 8) {
            return;
          }
        }

        const elements = document.elementsFromPoint(lastClientX, lastClientY);
        const cell = elements.find((el) => el.getAttribute?.("data-cell-day") === "true") as HTMLElement | undefined;
        const targetDay = cell?.getAttribute("data-day-ymd");

        const rowEl = elements.find((el) => el.getAttribute?.("data-room-row") === "true") as HTMLElement | undefined;
        const targetRoomId = rowEl?.getAttribute("data-room-id");

        if (targetDay) {
          let targetRoom = activeDragRange.anchorRoom;
          if (targetRoomId) {
            const foundRoom = orderedFilteredRooms.find((r) => r.id === targetRoomId);
            if (foundRoom) {
              targetRoom = foundRoom;
            }
          }
          handleHoverDragDay(targetRoom, targetDay, lastClientY);
        }
      });
    };

    window.addEventListener("mousemove", handlePointerMoveRange);
    return () => {
      if (rangeRafId !== null) {
        cancelAnimationFrame(rangeRafId);
      }
      window.removeEventListener("mousemove", handlePointerMoveRange);
    };
  }, [activeDragRange, handleHoverDragDay, orderedFilteredRooms, isReadOnly]);

  const handleAdjustDraftDays = useCallback(
    (delta: number) => {
      if (isReadOnly || !draftSelection) return;
      if (delta < 0) {
        if (draftSelection.nights <= 1) return;
        const newEnd = addDaysYmd(draftSelection.endDay, -1);
        const nights = calculateNights(draftSelection.startDay, newEnd);
        setDraftSelection({
          ...draftSelection,
          endDay: newEnd,
          nights,
        });
      } else {
        const candidateEnd = addDaysYmd(draftSelection.endDay, 1);
        const conflictRoom = draftSelection.rooms.find((r) => {
          const blocks = blocksByRoomId.get(r.id) || [];
          return blocks.some(
            (b) => b.startDate <= draftSelection.endDay && b.endDate > draftSelection.endDay,
          );
        });

        if (conflictRoom) {
          void showErrorAlert(
            "Không thể kéo dài thêm",
            `Phòng P.${conflictRoom.roomNumber} đã có lượt đặt trước hoặc đang có khách lưu trú vào ngày tiếp theo.`,
          );
          return;
        }

        const nights = calculateNights(draftSelection.startDay, candidateEnd);
        setDraftSelection({
          ...draftSelection,
          endDay: candidateEnd,
          nights,
        });
      }
    },
    [draftSelection, blocksByRoomId],
  );

  const handleConfirmDraft = useCallback(
    async (draft: DraftBookingSelection) => {
      if (isReadOnly) return;
      // Yêu cầu xác nhận / cảnh báo dọn phòng trước khi đặt nếu phòng đang chờ dọn
      const dirtyRooms = draft.rooms.filter(
        (r) =>
          r.status === "PROCESSING" ||
          r.status === "DIRTY" ||
          r.status === "CLEANING" ||
          r.status === "INSPECTION",
      );

      if (dirtyRooms.length > 0) {
        const confirm = await showConfirmDialog({
          title: "Xác nhận dọn phòng trước khi đặt",
          html: formatRoomDirtyWarningHtml({
            roomNames: dirtyRooms.map((r) => `P.${r.roomNumber}`),
          }),
          confirmText: "Xác nhận dọn & Tiếp tục đặt",
          cancelText: "Hủy bỏ",
        });
        if (!confirm.isConfirmed) return;
      }

      if (draft.rooms.length > 1 && onOpenBulkReservation) {
        onOpenBulkReservation(draft.rooms, draft.startDay, draft.endDay);
      } else if (onOpenQuickReservation) {
        onOpenQuickReservation(draft.room, draft.startDay, draft.endDay);
      } else if (onOpenCheckIn && draft.startDay === todayYmd) {
        onOpenCheckIn(draft.room, draft.startDay);
      } else {
        void showSuccessAlert(
          "Đã chọn khoảng lưu trú",
          draft.rooms.length > 1
            ? `Đã chọn đoàn ${draft.rooms.length} phòng (${draft.rooms.map((r) => `P.${r.roomNumber}`).join(", ")}) từ ${draft.startDay} đến ${draft.endDay} (${draft.nights} đêm).`
            : `Phòng P.${draft.roomNumber} từ ${draft.startDay} đến ${draft.endDay} (${draft.nights} đêm).`,
        );
      }
      setDraftSelection(null);
    },
    [onOpenBulkReservation, onOpenQuickReservation, onOpenCheckIn, todayYmd, isReadOnly],
  );

  const handleCancelDraft = useCallback(() => {
    setDraftSelection(null);
    setActiveDragRange(null);
    setActiveDraftAdjust(null);
    clickAnchorRef.current = null;
    dragStartPosRef.current = null;
    hasDraggedRef.current = false;
  }, []);

  // ── Active Draft Booking Adjust Engine (Kéo dài/thu ngắn ngày, thêm/bớt phòng, hoặc di chuyển sau khi thả) ──
  const activeDraftAdjustRef = useRef<ActiveDraftAdjust | null>(null);
  useEffect(() => {
    activeDraftAdjustRef.current = activeDraftAdjust;
  }, [activeDraftAdjust]);

  const handleStartDraftAdjust = useCallback(
    (mode: "days" | "rooms" | "both" | "move", e: React.MouseEvent) => {
      if (isReadOnly || !draftSelection) return;
      e.preventDefault();
      e.stopPropagation();

      const initialAdjust: ActiveDraftAdjust = {
        mode,
        anchorRoom: draftSelection.room,
        anchorDay: draftSelection.startDay,
        initialRooms: draftSelection.rooms,
        initialStartDay: draftSelection.startDay,
        initialEndDay: draftSelection.endDay,
        initialNights: draftSelection.nights,
        startPos: { x: e.clientX, y: e.clientY },
      };

      activeDraftAdjustRef.current = initialAdjust;
      setActiveDraftAdjust(initialAdjust);

      document.body.style.cursor =
        mode === "days"
          ? "col-resize"
          : mode === "rooms"
            ? "row-resize"
            : mode === "both"
              ? "nwse-resize"
              : "grabbing";
      document.body.style.userSelect = "none";
    },
    [draftSelection, isReadOnly],
  );

  useEffect(() => {
    if (isReadOnly || !activeDraftAdjust) return;

    let adjustRafId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const handlePointerMoveAdjust = (e: MouseEvent | PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (adjustRafId !== null) return;

      adjustRafId = requestAnimationFrame(() => {
        adjustRafId = null;
        const currentAdjust = activeDraftAdjustRef.current;
        if (!currentAdjust) return;

        const elements = document.elementsFromPoint(lastClientX, lastClientY);
        const cell = elements.find((el) => el.getAttribute?.("data-cell-day") === "true") as HTMLElement | undefined;
        const targetDay = cell?.getAttribute("data-day-ymd");

        const rowEl = elements.find((el) => el.getAttribute?.("data-room-row") === "true") as HTMLElement | undefined;
        const targetRoomId = rowEl?.getAttribute("data-room-id");

        const targetRoom = targetRoomId ? orderedFilteredRooms.find((r) => r.id === targetRoomId) : undefined;

        setDraftSelection((prev) => {
          if (!prev) return null;
          let nextRooms = prev.rooms;
          let nextStart = prev.startDay;
          let nextEnd = prev.endDay;

          // 1. Adjusting Days (horizontal drag)
          if ((currentAdjust.mode === "days" || currentAdjust.mode === "both") && targetDay) {
            const effectiveTargetDay = targetDay < todayYmd ? todayYmd : targetDay;
            let candidateEnd = addDaysYmd(effectiveTargetDay, 1);
            if (candidateEnd <= currentAdjust.initialStartDay) {
              candidateEnd = addDaysYmd(currentAdjust.initialStartDay, 1);
            }

            // Check collision against all current selected rooms
            for (const r of nextRooms) {
              const rBlocks = blocksByRoomId.get(r.id) || [];
              const colliding = rBlocks
                .filter((b) => b.startDate >= currentAdjust.initialStartDay && b.startDate < candidateEnd)
                .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
              if (colliding && colliding.startDate < candidateEnd) {
                candidateEnd = colliding.startDate;
              }
            }

            if (candidateEnd <= currentAdjust.initialStartDay) {
              candidateEnd = addDaysYmd(currentAdjust.initialStartDay, 1);
            }
            nextStart = currentAdjust.initialStartDay;
            nextEnd = candidateEnd;
          }

          // 2. Adjusting Rooms (vertical drag strictly scoped to anchor room's category)
          if ((currentAdjust.mode === "rooms" || currentAdjust.mode === "both") && targetRoom) {
            const anchorCat = currentAdjust.anchorRoom.roomTypeName || "Hạng phòng khác";
            const catRooms = roomsByCategory.find(([c]) => c === anchorCat)?.[1] || [currentAdjust.anchorRoom];
            const anchorIdx = catRooms.findIndex((r) => r.id === currentAdjust.anchorRoom.id);
            let targetIdx = catRooms.findIndex((r) => r.id === targetRoom.id);

            if (anchorIdx !== -1) {
              if (targetIdx === -1) {
                targetIdx = anchorIdx;
              }

              const minIdx = Math.min(anchorIdx, targetIdx);
              const maxIdx = Math.max(anchorIdx, targetIdx);

              const candidateRooms = catRooms
                .slice(minIdx, maxIdx + 1)
                .filter((cand) => {
                  const isCandLocked =
                    cand.status === "MAINTENANCE" ||
                    cand.status === "BLOCKED" ||
                    cand.status === "OUT_OF_SERVICE";
                  if (isCandLocked) return false;
                  if (cand.id === currentAdjust.anchorRoom.id) return true;
                  const rBlocks = blocksByRoomId.get(cand.id) || [];
                  return !rBlocks.some((b) => b.startDate < nextEnd && b.endDate > nextStart);
                });

              if (candidateRooms.length > 0) {
                nextRooms = candidateRooms;
              }
            }
          }

          // 3. Move Entire Selection (translation within same category)
          if (currentAdjust.mode === "move" && targetDay && targetRoom) {
            const anchorCat = currentAdjust.anchorRoom.roomTypeName || "Hạng phòng khác";
            const catRooms = roomsByCategory.find(([c]) => c === anchorCat)?.[1] || [currentAdjust.anchorRoom];
            const effectiveTargetDay = targetDay < todayYmd ? todayYmd : targetDay;
            const newStart = effectiveTargetDay;
            const newEnd = addDaysYmd(newStart, currentAdjust.initialNights);

            const targetRoomIdx = catRooms.findIndex((r) => r.id === targetRoom.id);
            if (targetRoomIdx !== -1) {
              const roomCount = currentAdjust.initialRooms.length;
              const shiftedCandidates = catRooms
                .slice(targetRoomIdx, targetRoomIdx + roomCount)
                .filter((cand) => {
                  const isCandLocked =
                    cand.status === "MAINTENANCE" ||
                    cand.status === "BLOCKED" ||
                    cand.status === "OUT_OF_SERVICE";
                  if (isCandLocked) return false;
                  const rBlocks = blocksByRoomId.get(cand.id) || [];
                  return !rBlocks.some((b) => b.startDate < newEnd && b.endDate > newStart);
                });

              if (shiftedCandidates.length === roomCount) {
                nextRooms = shiftedCandidates;
                nextStart = newStart;
                nextEnd = newEnd;
              }
            }
          }

          const nights = calculateNights(nextStart, nextEnd);
          return {
            ...prev,
            roomId: nextRooms[0]?.id ?? prev.roomId,
            roomNumber: nextRooms[0]?.roomNumber ?? prev.roomNumber,
            room: nextRooms[0] ?? prev.room,
            rooms: nextRooms,
            startDay: nextStart,
            endDay: nextEnd,
            nights,
          };
        });
      });
    };

    const handlePointerUpAdjust = () => {
      activeDraftAdjustRef.current = null;
      setActiveDraftAdjust(null);
      dragEndedAtRef.current = Date.now();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handlePointerMoveAdjust);
    window.addEventListener("mouseup", handlePointerUpAdjust);

    return () => {
      if (adjustRafId !== null) {
        cancelAnimationFrame(adjustRafId);
      }
      window.removeEventListener("mousemove", handlePointerMoveAdjust);
      window.removeEventListener("mouseup", handlePointerUpAdjust);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [
    activeDraftAdjust,
    todayYmd,
    orderedFilteredRooms,
    roomsByCategory,
    blocksByRoomId,
    collapsedCategories,
    isReadOnly,
  ]);

  // ── Active Booking Resize Engine (Kéo dài gia hạn lưu trú & đổi ngày đặt phòng) ──
  const activeBlockResizeRef = useRef<ActiveBlockResize | null>(null);
  useEffect(() => {
    activeBlockResizeRef.current = activeBlockResize;
  }, [activeBlockResize]);
  const isBlockResizingMovedRef = useRef<boolean>(false);

  // Extend stay mutation
  const extendStayMutation = useMutation({
    mutationFn: (vars: {
      stayId: string;
      plannedCheckOutAt: string;
      newEndDate: string;
    }) => roomPlanRepository.extendStay(hotelId, vars.stayId, vars.plannedCheckOutAt),
    onSuccess: async (_, vars) => {
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchPlan();
      if (onRefresh) onRefresh();
      await showSuccessAlert(
        "Gia hạn lưu trú thành công",
        `Đã gia hạn lưu trú đến ngày ${vars.newEndDate}.`,
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Không thể gia hạn lưu trú. Vui lòng thử lại.";
      void showErrorAlert("Lỗi gia hạn", msg);
    },
  });

  // Update reservation dates mutation
  const updateReservationDatesMutation = useMutation({
    mutationFn: (vars: {
      reservationId: string;
      startDate: string;
      endDate: string;
      expectedUpdatedAt: string;
    }) =>
      roomPlanRepository.updateReservationDates(hotelId, vars.reservationId, {
        startDate: vars.startDate,
        endDate: vars.endDate,
        expectedUpdatedAt: vars.expectedUpdatedAt,
      }),
    onSuccess: async (_, vars) => {
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetchPlan();
      if (onRefresh) onRefresh();
      await showSuccessAlert(
        "Cập nhật ngày thành công",
        `Đã điều chỉnh lịch đặt phòng từ ${vars.startDate} đến ${vars.endDate}.`,
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Không thể đổi ngày đặt phòng. Vui lòng thử lại.";
      void showErrorAlert("Lỗi đổi ngày", msg);
    },
  });

  const handlePointerMoveBlockResize = useCallback(
    (e: MouseEvent | PointerEvent) => {
      const current = activeBlockResizeRef.current;
      if (!current) return;
      isBlockResizingMovedRef.current = true;

      // Penetrate overlays using elementsFromPoint to reliably find underlying day cell
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const cell = elements.find((el) => el.getAttribute?.("data-cell-day") === "true") as HTMLElement | undefined;
      let targetDay = cell?.getAttribute("data-day-ymd");

      // Robust fallback: if cursor is above/below the row or past edges, match column by e.clientX
      if (!targetDay) {
        const headerCells = Array.from(
          document.querySelectorAll<HTMLElement>('[data-header-day="true"]'),
        );
        if (headerCells.length > 0) {
          const firstRect = headerCells[0].getBoundingClientRect();
          const lastRect = headerCells[headerCells.length - 1].getBoundingClientRect();
          if (e.clientX <= firstRect.left) {
            targetDay = headerCells[0].getAttribute("data-day-ymd") || undefined;
          } else if (e.clientX >= lastRect.right) {
            targetDay = headerCells[headerCells.length - 1].getAttribute("data-day-ymd") || undefined;
          } else {
            const matched = headerCells.find((el) => {
              const r = el.getBoundingClientRect();
              return e.clientX >= r.left && e.clientX <= r.right;
            });
            targetDay = matched?.getAttribute("data-day-ymd") || undefined;
          }
        }
      }

      if (!targetDay) return;

      const block = current.block;
      const direction = current.direction;
      const otherBlocks = (blocksByRoomId.get(block.roomId) || []).filter(
        (b) => b.id !== block.id,
      );

      let newStart = current.currentGhostStartDay;
      let newEnd = current.currentGhostEndDay;
      let warning: string | null = null;

      if (direction === "end") {
        let candidateEnd = addDaysYmd(targetDay, 1);
        // Không cho phép co về quá khứ; chỉ cho phép kéo dài ra các ngày tương lai
        const minEnd =
          block.endDate > addDaysYmd(todayYmd, 1)
            ? block.endDate
            : addDaysYmd(todayYmd, 1);
        if (candidateEnd < minEnd) {
          candidateEnd = minEnd;
        }

        // Clamp at next block's startDate on the same room (chỉ xét các đơn bắt đầu từ hoặc sau block.endDate)
        const nextBlocks = otherBlocks
          .filter((b) => b.startDate >= block.endDate)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        if (nextBlocks.length > 0) {
          const firstNext = nextBlocks[0];
          if (candidateEnd > firstNext.startDate) {
            candidateEnd = firstNext.startDate;
            warning = `Chạm đơn của ${firstNext.guestName} từ ${firstNext.startDate}`;
          }
        }

        newEnd = candidateEnd;
      } else if (direction === "start") {
        let candidateStart = targetDay;
        // Không cho phép dời ngày nhận phòng về trước hôm nay
        if (candidateStart < todayYmd) {
          candidateStart = todayYmd;
          warning = "Không thể dời ngày nhận phòng về trước hôm nay";
        }
        const maxStart = addDaysYmd(block.endDate, -1);
        if (candidateStart > maxStart) {
          candidateStart = maxStart;
        }

        // Clamp at previous block's endDate on the same room
        const prevBlocks = otherBlocks
          .filter((b) => b.endDate <= block.startDate)
          .sort((a, b) => b.endDate.localeCompare(a.endDate));

        if (prevBlocks.length > 0) {
          const firstPrev = prevBlocks[0];
          if (candidateStart < firstPrev.endDate) {
            candidateStart = firstPrev.endDate;
            warning = `Chạm đơn của ${firstPrev.guestName} đến ${firstPrev.endDate}`;
          }
        }

        newStart = candidateStart;
      }

      const nights = calculateNights(newStart, newEnd);
      const diffNights = nights - current.initialNights;

      if (
        newStart !== current.currentGhostStartDay ||
        newEnd !== current.currentGhostEndDay ||
        warning !== current.conflictWarning
      ) {
        const updated: ActiveBlockResize = {
          ...current,
          currentGhostStartDay: newStart,
          currentGhostEndDay: newEnd,
          nights,
          diffNights,
          conflictWarning: warning,
        };
        activeBlockResizeRef.current = updated;
        setActiveBlockResize(updated);
      }
    },
    [blocksByRoomId, todayYmd],
  );

  const handleGlobalBlockResizeMouseUp = useCallback(async () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    const resizeData = activeBlockResizeRef.current;
    setActiveBlockResize(null);
    activeBlockResizeRef.current = null;
    if (!resizeData || !isBlockResizingMovedRef.current) return;

    const { block, direction, currentGhostStartDay, currentGhostEndDay, nights, diffNights } = resizeData;

    // Check if dates actually changed
    const hasChanged =
      (direction === "end" && currentGhostEndDay !== block.endDate) ||
      (direction === "start" && currentGhostStartDay !== block.startDate);

    if (!hasChanged) return;

    // Handle Stay / Overdue: Extend Stay
    if (block.kind === "STAY" || block.status === "OVERDUE") {
      const stayId = block.guestStayId || block.reservationId;
      if (!stayId) return;

      const rate = block.nightlyRate || 0;
      const additionalCost = diffNights > 0 ? rate * diffNights : 0;

      const confirmRes = await showConfirmDialog({
        title: `Gia hạn lưu trú P.${block.roomNumber}?`,
        icon: "question",
        html: formatExtendStayConfirmHtml({
          roomNumber: block.roomNumber,
          guestName: block.guestName,
          oldEndDate: block.endDate,
          newEndDate: currentGhostEndDay,
          diffNights,
          totalNights: nights,
          nightlyRate: rate,
          additionalCost,
        }),
        confirmText: "Xác nhận gia hạn",
        cancelText: "Hủy bỏ",
      });

      if (confirmRes.isConfirmed) {
        extendStayMutation.mutate({
          stayId,
          plannedCheckOutAt: `${currentGhostEndDay}T12:00:00+07:00`,
          newEndDate: currentGhostEndDay,
        });
      }
      return;
    }

    // Handle Reservation: Adjust Dates
    if (block.kind === "RESERVATION" && block.reservationId) {
      const confirmRes = await showConfirmDialog({
        title: `Điều chỉnh ngày đặt phòng P.${block.roomNumber}?`,
        icon: "question",
        html: formatAdjustReservationDatesConfirmHtml({
          roomNumber: block.roomNumber,
          guestName: block.guestName,
          oldStartDate: block.startDate,
          newStartDate: currentGhostStartDay,
          oldEndDate: block.endDate,
          newEndDate: currentGhostEndDay,
          totalNights: nights,
          diffNights,
        }),
        confirmText: "Xác nhận đổi ngày",
        cancelText: "Hủy bỏ",
      });

      if (confirmRes.isConfirmed) {
        updateReservationDatesMutation.mutate({
          reservationId: block.reservationId,
          startDate: currentGhostStartDay,
          endDate: currentGhostEndDay,
          expectedUpdatedAt: block.expectedUpdatedAt,
        });
      }
    }
  }, [extendStayMutation, updateReservationDatesMutation]);

  const onPointerMoveBlockResizeRef = useRef(handlePointerMoveBlockResize);
  useEffect(() => {
    onPointerMoveBlockResizeRef.current = handlePointerMoveBlockResize;
  }, [handlePointerMoveBlockResize]);

  const onGlobalBlockResizeMouseUpRef = useRef(handleGlobalBlockResizeMouseUp);
  useEffect(() => {
    onGlobalBlockResizeMouseUpRef.current = handleGlobalBlockResizeMouseUp;
  }, [handleGlobalBlockResizeMouseUp]);

  // Active Block Resize event listener management (Stable single-point attachment)
  useEffect(() => {
    if (!activeBlockResize) return;

    const onMove = (e: MouseEvent) => {
      onPointerMoveBlockResizeRef.current(e);
    };
    const onUp = () => {
      void onGlobalBlockResizeMouseUpRef.current();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [Boolean(activeBlockResize)]);

  const handleStartBlockResize = useCallback(
    (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => {
      if (isReadOnly) return;
      e.preventDefault();
      e.stopPropagation();

      // Clear draft selection so it doesn't linger or collide
      setDraftSelection(null);
      setActiveDragRange(null);

      isBlockResizingMovedRef.current = false;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const initialNights = block.nights;
      const initialResize: ActiveBlockResize = {
        block,
        direction,
        currentGhostStartDay: block.startDate,
        currentGhostEndDay: block.endDate,
        nights: initialNights,
        initialNights,
        diffNights: 0,
        conflictWarning: null,
      };
      activeBlockResizeRef.current = initialResize;
      setActiveBlockResize(initialResize);
    },
    [isReadOnly],
  );

  return (
    <div className="space-y-3" data-tape-chart-container="true">
      {/* ── Top Control & Smart Filter Bar ──────────────────────────── */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {/* Tier 1: Unified Timeline Navigation, Period Span, Live KPIs & Primary CTA */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-slate-100">
          {/* Left: Unified Timeline Pod + View Span Switch */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Unified Date Stepper & Calendar Picker Pod */}
            <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handlePrevStep}
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer whitespace-nowrap"
                title="Lùi kỳ trước (giữ 1 ngày gối đầu • Shift + ←)"
                aria-label="Lùi kỳ trước"
              >
                <VsIcon name="chevron_left" className="text-base" />
              </button>

              <button
                type="button"
                onClick={handlePrevDay}
                className="hidden sm:inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer whitespace-nowrap"
                title="Lùi 1 ngày (Phím ←)"
              >
                <VsIcon name="arrow_back" className="text-xs" />
                <span>1 ngày</span>
              </button>

              <span className="h-4 w-px bg-slate-200/90 mx-0.5" />

              <button
                type="button"
                onClick={handleGoToday}
                className={`inline-flex h-8 items-center px-2.5 text-xs font-bold rounded-md transition cursor-pointer whitespace-nowrap ${
                  startDate === todayYmd
                    ? "bg-emerald-800 text-white shadow-2xs font-black"
                    : "text-slate-700 hover:text-slate-900 hover:bg-white hover:shadow-2xs"
                }`}
                title="Về ngày hôm nay (Phím T)"
              >
                Hôm nay
              </button>

              <span className="h-4 w-px bg-slate-200/90 mx-0.5" />

              {/* Date Range Display & Jump Picker */}
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={handleOpenDatePicker}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white hover:bg-emerald-50/50 border border-slate-200/80 hover:border-emerald-600/60 px-2.5 text-xs font-bold text-slate-800 shadow-2xs transition cursor-pointer group whitespace-nowrap"
                  title="Nhấp để chọn ngày bắt đầu xem trên sơ đồ phòng"
                >
                  <VsIcon
                    name="calendar_today"
                    className="text-sm text-emerald-800 group-hover:scale-105 transition-transform"
                  />
                  <span>{dateRangeDisplay}</span>
                  <VsIcon
                    name="expand_more"
                    className="text-sm text-slate-400 group-hover:text-emerald-800 transition-colors"
                  />
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    if (e.target.value) setStartDate(e.target.value);
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                  tabIndex={-1}
                  aria-label="Chọn ngày bắt đầu xem"
                />
              </div>

              <span className="h-4 w-px bg-slate-200/90 mx-0.5" />

              <button
                type="button"
                onClick={handleNextDay}
                className="hidden sm:inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer whitespace-nowrap"
                title="Tiến 1 ngày (Phím →)"
              >
                <span>1 ngày</span>
                <VsIcon name="arrow_forward" className="text-xs" />
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer whitespace-nowrap"
                title="Tiến kỳ sau (giữ 1 ngày gối đầu • Shift + →)"
                aria-label="Tiến kỳ sau"
              >
                <VsIcon name="chevron_right" className="text-base" />
              </button>
            </div>

            {/* Week / Biweek Segmented Toggle */}
            <div
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
              role="group"
              aria-label="Khung ngày hiển thị"
            >
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={`inline-flex h-8 items-center px-3 text-xs rounded-md transition cursor-pointer whitespace-nowrap ${
                  viewMode === "week"
                    ? "bg-white text-emerald-950 shadow-2xs ring-1 ring-slate-200/80 font-black"
                    : "font-bold text-slate-600 hover:text-slate-900"
                }`}
              >
                7 ngày
              </button>
              <button
                type="button"
                onClick={() => setViewMode("biweek")}
                className={`inline-flex h-8 items-center px-3 text-xs rounded-md transition cursor-pointer whitespace-nowrap ${
                  viewMode === "biweek"
                    ? "bg-white text-emerald-950 shadow-2xs ring-1 ring-slate-200/80 font-black"
                    : "font-bold text-slate-600 hover:text-slate-900"
                }`}
              >
                14 ngày
              </button>
            </div>

            {isPlanFetching && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-xs text-emerald-800 font-semibold whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-emerald-600 animate-ping" />
                <span>Đang đồng bộ...</span>
              </span>
            )}
          </div>

          {/* Right: Operational KPIs & Primary Quick Reservation CTA */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* Period Occupancy Summary Pill */}
            {periodOccupancyStats.totalRooms > 0 && (
              <div
                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-xs font-bold bg-emerald-50/90 text-emerald-900 border border-emerald-200/90 whitespace-nowrap"
                title={`Công suất trung bình cả kỳ (${numDays} ngày): ${periodOccupancyStats.avgPercent}% • Hôm nay: ${periodOccupancyStats.todayPercent}% (${periodOccupancyStats.todayOccupied}/${periodOccupancyStats.totalRooms} phòng)`}
              >
                <VsIcon name="trending_up" className="text-sm text-emerald-700" />
                <span>
                  Công suất TB:{" "}
                  <strong className="font-black text-emerald-950">
                    {periodOccupancyStats.avgPercent}%
                  </strong>
                </span>
                <span className="text-emerald-300">•</span>
                <span className="text-emerald-800 font-semibold">
                  {periodOccupancyStats.todayOccupied}/{periodOccupancyStats.totalRooms} hôm nay
                </span>
              </div>
            )}

            {/* Overdue Rooms Interactive Alert Pill */}
            {overdueRooms.length > 0 && (
              <button
                type="button"
                onClick={handleNextOverdue}
                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-xs font-black border transition cursor-pointer whitespace-nowrap bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200 shadow-2xs"
                title={`Click để chuyển và cuộn tới phòng quá hạn (${(overdueFocusIndex % overdueRooms.length) + 1}/${overdueRooms.length})`}
              >
                <span className="size-2 rounded-full bg-rose-600 animate-pulse shrink-0" />
                <span>{overdueRooms.length} phòng quá hạn</span>
                {overdueRooms.length > 1 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-950 text-xs font-bold whitespace-nowrap">
                    {(overdueFocusIndex % overdueRooms.length) + 1}/{overdueRooms.length}
                  </span>
                )}
              </button>
            )}

            {/* Primary CTA: Group Check-in / Operations */}
            {!isReadOnly && onOpenGroupCheckIn && (
              <button
                type="button"
                onClick={() => onOpenGroupCheckIn("")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold px-3 text-xs shadow-2xs transition cursor-pointer whitespace-nowrap"
                title="Quản lý và nhận phòng nhanh theo đoàn"
              >
                <VsIcon name="groups" className="text-base text-purple-700" />
                <span>Check-in đoàn</span>
              </button>
            )}

            {/* Primary CTA: Quick Reservation */}
            {!isReadOnly && onOpenQuickReservation && (
              <button
                type="button"
                onClick={() => onOpenQuickReservation()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold px-3.5 text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
              >
                <VsIcon name="add" className="text-sm" />
                <span>Đặt phòng nhanh</span>
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Smart Filter Bar (Search, Room Type, Floor, Quick Status Pills & View Actions) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 bg-slate-50/60">
          {/* Left: Search, Dropdowns & Quick Status Pills */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Smart Search Input */}
            <div className="relative w-full sm:w-56">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm số phòng, tên khách, mã đặt / đoàn..."
                className={`h-8 w-full rounded-lg border pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 transition ${
                  searchQuery.trim()
                    ? "border-emerald-600 bg-emerald-50/40 font-semibold"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              />
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                  title="Xóa từ khóa tìm kiếm"
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <VsIcon name="close" className="text-xs" />
                </button>
              )}
            </div>

            {/* Category Filter Dropdown */}
            {categories.length > 0 && (
              <div className="relative inline-flex items-center">
                <VsIcon
                  name="bed"
                  className={`pointer-events-none absolute left-2.5 text-sm ${
                    selectedCategory !== "all" ? "text-emerald-800" : "text-slate-400"
                  }`}
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Lọc theo hạng phòng"
                  className={`h-8 appearance-none rounded-lg border pl-8 pr-7 text-xs transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                    selectedCategory !== "all"
                      ? "border-emerald-600 bg-emerald-50/70 font-bold text-emerald-950"
                      : "border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <option value="all">Tất cả hạng phòng ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <VsIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 text-sm text-slate-400"
                />
              </div>
            )}

            {/* Floor Filter Dropdown */}
            {floors.length > 0 && (
              <div className="relative inline-flex items-center">
                <VsIcon
                  name="apartment"
                  className={`pointer-events-none absolute left-2.5 text-sm ${
                    selectedFloor !== "all" ? "text-emerald-800" : "text-slate-400"
                  }`}
                />
                <select
                  value={selectedFloor}
                  onChange={(e) => setSelectedFloor(e.target.value)}
                  aria-label="Lọc theo tầng"
                  className={`h-8 appearance-none rounded-lg border pl-8 pr-7 text-xs transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                    selectedFloor !== "all"
                      ? "border-emerald-600 bg-emerald-50/70 font-bold text-emerald-950"
                      : "border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <option value="all">Tất cả tầng ({floors.length})</option>
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      Tầng {f}
                    </option>
                  ))}
                </select>
                <VsIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 text-sm text-slate-400"
                />
              </div>
            )}

            <span className="hidden md:inline-block h-4 w-px bg-slate-200 mx-0.5" />

            {/* Quick Room Status Filter Pills */}
            <div
              className="inline-flex flex-wrap items-center gap-1"
              role="group"
              aria-label="Lọc nhanh trạng thái phòng hôm nay"
            >
              <button
                type="button"
                onClick={() => setSelectedStatusFilter("all")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap border ${
                  selectedStatusFilter === "all"
                    ? "bg-slate-800 text-white border-slate-800 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <span>Tất cả</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-black leading-none whitespace-nowrap ${
                    selectedStatusFilter === "all"
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {roomStatusCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setSelectedStatusFilter((prev) =>
                    prev === "available_today" ? "all" : "available_today",
                  )
                }
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap border ${
                  selectedStatusFilter === "available_today"
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-900"
                }`}
                title="Lọc các phòng đang trống hôm nay"
              >
                <span
                  className={`size-2 rounded-full ${
                    selectedStatusFilter === "available_today"
                      ? "bg-white"
                      : "bg-emerald-500"
                  }`}
                />
                <span>Trống hôm nay</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-black leading-none whitespace-nowrap ${
                    selectedStatusFilter === "available_today"
                      ? "bg-white/20 text-white"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {roomStatusCounts.availableToday}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setSelectedStatusFilter((prev) =>
                    prev === "occupied_today" ? "all" : "occupied_today",
                  )
                }
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap border ${
                  selectedStatusFilter === "occupied_today"
                    ? "bg-sky-700 text-white border-sky-700 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-900"
                }`}
                title="Lọc các phòng có khách lưu trú hoặc đặt phòng hôm nay"
              >
                <span
                  className={`size-2 rounded-full ${
                    selectedStatusFilter === "occupied_today" ? "bg-white" : "bg-sky-500"
                  }`}
                />
                <span>Có khách hôm nay</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-black leading-none whitespace-nowrap ${
                    selectedStatusFilter === "occupied_today"
                      ? "bg-white/20 text-white"
                      : "bg-sky-50 text-sky-800"
                  }`}
                >
                  {roomStatusCounts.occupiedToday}
                </span>
              </button>

              {roomStatusCounts.cleaning > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedStatusFilter((prev) =>
                      prev === "cleaning" ? "all" : "cleaning",
                    )
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap border ${
                    selectedStatusFilter === "cleaning"
                      ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-900"
                  }`}
                  title="Lọc các phòng đang chờ dọn dẹp"
                >
                  <span
                    className={`size-2 rounded-full ${
                      selectedStatusFilter === "cleaning" ? "bg-white" : "bg-amber-500"
                    }`}
                  />
                  <span>Chờ dọn</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-black leading-none whitespace-nowrap ${
                      selectedStatusFilter === "cleaning"
                        ? "bg-white/20 text-white"
                        : "bg-amber-50 text-amber-900"
                    }`}
                  >
                    {roomStatusCounts.cleaning}
                  </span>
                </button>
              )}
            </div>

            {/* Active Filter Reset & Filtered Result Summary */}
            {hasActiveFilters && (
              <div className="inline-flex items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-900 bg-emerald-100/80 px-2 py-1 rounded-md whitespace-nowrap">
                  Hiển thị {filteredRooms.length}/{allRooms.length} phòng
                </span>
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2.5 text-xs font-bold text-rose-800 transition cursor-pointer whitespace-nowrap"
                  title="Xóa toàn bộ điều kiện lọc"
                >
                  <VsIcon name="filter_alt_off" className="text-xs" />
                  <span>Xóa lọc</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: View Utilities (Collapse All, Reset Custom Order) */}
          <div className="flex items-center gap-1.5 ml-auto">
            {hasCustomOrder && (
              <button
                type="button"
                onClick={() => resetRoomOrder(hotelId)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                title="Khôi phục thứ tự phòng mặc định"
              >
                <VsIcon name="restart_alt" className="text-sm" />
                <span>Đặt lại thứ tự</span>
              </button>
            )}

            {roomsByCategory.length > 1 && (
              <button
                type="button"
                onClick={toggleAllCategories}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 px-2.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                title={
                  allCollapsed
                    ? "Mở rộng tất cả hạng phòng"
                    : "Thu gọn tất cả hạng phòng"
                }
              >
                <VsIcon
                  name={allCollapsed ? "expand_more" : "expand_less"}
                  className="text-sm text-slate-500"
                />
                <span>{allCollapsed ? "Mở rộng nhóm" : "Thu gọn nhóm"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Legend & Shortcut Strip ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs font-semibold text-slate-600">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-3 rounded bg-emerald-600 border border-emerald-800" />
            <span>Đang ở</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-3 rounded bg-purple-600 border border-purple-800" />
            <span>Đặt trước (Kéo để đổi phòng)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-3 rounded bg-rose-500 border border-rose-700" />
            <span>Quá hạn trả</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-3 rounded bg-amber-200 border border-amber-400" />
            <span>Chờ dọn phòng</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-3 rounded bg-slate-400 border border-slate-600" />
            <span>Bảo trì / Khóa</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto text-slate-500">
          <span className="text-pretty">
            {isReadOnly
              ? "Nhấp vào thanh đặt phòng để xem chi tiết."
              : "Kéo ngang chọn số đêm, kéo dọc chọn nhiều phòng (đặt đoàn)."}
          </span>
          <span
            className="hidden xl:inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80 whitespace-nowrap"
            title="Phím tắt: [← / →] Trượt 1 ngày • [Shift + ← / →] Trượt kỳ • [T] Hôm nay • [W] Đổi khung 7/14 ngày"
          >
            <strong className="font-bold text-slate-700">Phím tắt:</strong>
            <span>←/→ trượt ngày · T hôm nay · W khung ngày</span>
          </span>
        </div>
      </div>

      {/* ── Main Gantt / Tape Chart Grid Container ────────────────── */}
      <div
        data-tape-chart-container="true"
        className="relative rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden"
      >
        {/* Main Grid View - Giữ trọn 100% chiều rộng, hỗ trợ cuộn dọc cố định tiêu đề */}
        <div className="overflow-x-auto min-w-0 max-h-[calc(100vh-210px)] overflow-y-auto">
          <div className="min-w-[800px] w-full">
            {/* Sticky Header: Dates Row + Occupancy Row */}
            <div className="sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-xs w-full">
              {/* Header Dates Row */}
              <div className="flex border-b border-slate-200/80 text-xs font-bold text-slate-700 w-full">
                {/* Room Column Header */}
                <div className="sticky left-0 z-40 w-48 min-w-[192px] max-w-[192px] shrink-0 border-r border-slate-200 bg-slate-100/95 px-3 py-2 flex items-center justify-between shadow-xs">
                  <button
                    type="button"
                    onClick={toggleAllCategories}
                    className="flex items-center gap-1.5 uppercase tracking-wider text-slate-600 hover:text-slate-900 text-xs font-bold transition cursor-pointer"
                    title={
                      allCollapsed
                        ? "Mở rộng tất cả danh sách phòng"
                        : "Thu gọn tất cả danh sách phòng"
                    }
                  >
                    <VsIcon
                      name={allCollapsed ? "chevron_right" : "chevron_down"}
                      className="text-xs text-slate-500 shrink-0"
                    />
                    <span>Phòng ({filteredRooms.length})</span>
                  </button>
                  <span className="text-xs text-slate-400">Tầng</span>
                </div>

                {/* Day Header Cells */}
                <div className="flex flex-1 min-w-0">
                  {daysList.map((day) => {
                    const isDayInActiveSelection = Boolean(
                      (activeHighlightedDateRange &&
                        day.ymd >= activeHighlightedDateRange.startDay &&
                        day.ymd < activeHighlightedDateRange.endDay) ||
                      (dragOverCellKey && dragOverDayYmd === day.ymd),
                    );

                    return (
                      <div
                        key={day.ymd}
                        data-header-day="true"
                        data-day-ymd={day.ymd}
                        className={`flex-1 min-w-[100px] border-r border-slate-200/60 px-1 py-1.5 text-center transition ${
                          isDayInActiveSelection
                            ? "bg-emerald-100/90 text-emerald-950 font-black ring-2 ring-inset ring-emerald-500 shadow-xs border-b-2 border-emerald-600"
                            : day.isToday
                              ? "bg-sky-100/60 text-sky-950 font-black ring-1 ring-inset ring-sky-300"
                              : day.isWeekend
                                ? "bg-amber-100/70 text-amber-950 font-bold"
                                : "text-slate-700"
                        }`}
                      >
                        <div
                          className={`text-xs uppercase tracking-tight ${
                            isDayInActiveSelection
                              ? "text-emerald-800 font-black"
                              : day.isToday
                                ? "text-sky-800 font-bold"
                                : day.isWeekend
                                  ? "text-amber-800 font-bold"
                                  : "text-slate-500"
                          }`}
                        >
                          {day.dayLabel}
                        </div>
                        <div
                          className={`text-xs font-bold ${
                            isDayInActiveSelection
                              ? "text-emerald-950 font-black"
                              : day.isToday
                                ? "text-sky-950"
                                : day.isWeekend
                                  ? "text-amber-950"
                                  : "text-slate-800"
                          }`}
                        >
                          {day.dateNum}
                        </div>
                        {isDayInActiveSelection && (
                          <div className="flex justify-center mt-0.5">
                            <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Occupancy Summary Row (Hàng Công suất phòng) */}
              <div className="flex bg-slate-50/95 text-xs font-bold text-slate-700 w-full">
                {/* Sticky Left: Title & Average */}
                <div className="sticky left-0 z-40 w-48 min-w-[192px] max-w-[192px] shrink-0 border-r border-slate-200 bg-emerald-50/95 px-3 py-1.5 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-950">
                    <VsIcon name="trending_up" className="text-sm text-emerald-700 shrink-0" />
                    <span>Công suất phòng</span>
                  </div>
                  <span
                    className="rounded-full bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 text-xs font-black text-emerald-800 whitespace-nowrap"
                    title={`Công suất trung bình cả kỳ: ${periodOccupancyStats.avgPercent}%`}
                  >
                    TB {periodOccupancyStats.avgPercent}%
                  </span>
                </div>

                {/* Day Cells: Occupancy % and Count */}
                <div className="flex flex-1 min-w-0">
                  {periodOccupancyStats.daily.map((stat) => (
                    <div
                      key={`occ-${stat.ymd}`}
                      className={`flex-1 min-w-[100px] border-r border-slate-200/60 px-1 py-1 text-center flex flex-col justify-center items-center transition ${
                        stat.isToday
                          ? "bg-sky-50/90 text-sky-950 font-black"
                          : "bg-slate-50/60 text-slate-700"
                      }`}
                      title={`Ngày ${stat.dateNum}: Công suất ${stat.percent}% (${stat.occupied}/${periodOccupancyStats.totalRooms} phòng có khách, ${stat.available} phòng trống)`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-black whitespace-nowrap ${
                            stat.percent >= 80
                              ? "bg-rose-100 text-rose-800"
                              : stat.percent >= 50
                                ? "bg-emerald-100 text-emerald-800 font-bold"
                                : "text-slate-700 font-bold"
                          }`}
                        >
                          {stat.percent}%
                        </span>
                        <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">
                          ({stat.occupied}/{periodOccupancyStats.totalRooms})
                        </span>
                      </div>
                      <div className="w-full max-w-[56px] h-1 bg-slate-200 rounded-full mt-0.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            stat.percent >= 80
                              ? "bg-rose-500"
                              : stat.percent >= 50
                                ? "bg-emerald-600"
                                : "bg-sky-500"
                          }`}
                          style={{ width: `${Math.min(100, stat.percent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Room Categories & Rows with TanStack Table + DndKit */}
            <DndContext
              id={`tape-chart-dnd-${hotelId || "main"}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRowDragEnd}
            >
              {roomsByCategory.map(([categoryName, catRooms]) => (
                <CategoryRoomTable
                  key={categoryName}
                  cat={categoryName}
                  catRooms={catRooms}
                  daysList={daysList}
                  todayYmd={todayYmd}
                  readOnly={isReadOnly}
                  blocksByRoomId={blocksByRoomId}
                  occupiedRoomDaySet={occupiedRoomDaySet}
                  dragOverCellKey={dragOverCellKey}
                  dragOverDayYmd={dragOverDayYmd}
                  handleDragOverCell={handleDragOverCell}
                  handleDragLeaveCell={handleDragLeaveCell}
                  handleDropOnRoom={handleDropOnRoom}
                  handleDragStart={handleDragStart}
                  handleDragEnd={handleDragEnd}
                  setSelectedBlock={handleSelectBlock}
                  onOpenCheckIn={onOpenCheckIn}
                  onSelectRoom={onSelectRoom}
                  onToggleRoomBlocked={onToggleRoomBlocked}
                  onProcessingRoomClick={onProcessingRoomClick}
                  onFocusOverdueRoom={focusOverdueRoom}
                  isCollapsed={Boolean(collapsedCategories[categoryName])}
                  onToggleCollapse={toggleCategory}
                  draftSelection={draftSelection}
                  isDraggingRange={Boolean(activeDragRange) || Boolean(activeDraftAdjust)}
                  activeDragRange={activeDragRange}
                  draggedBlock={draggedBlock}
                  onStartDragRange={handleStartDragRange}
                  onHoverDragDay={handleHoverDragDay}
                  onAdjustDraftDays={handleAdjustDraftDays}
                  onConfirmDraft={handleConfirmDraft}
                  onCancelDraft={handleCancelDraft}
                  activeBlockResize={activeBlockResize}
                  onStartBlockResize={isReadOnly ? undefined : handleStartBlockResize}
                  onStartDraftAdjust={isReadOnly ? undefined : handleStartDraftAdjust}
                />
              ))}
            </DndContext>

            {roomsByCategory.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <VsIcon
                  name="meeting_room"
                  className="text-4xl text-slate-300 mb-2 inline-block"
                />
                <p className="font-bold text-sm text-slate-600">
                  Không tìm thấy phòng phù hợp
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Vui lòng thử đổi bộ lọc hoặc từ khóa tìm kiếm.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail View: Modal hiển thị chi tiết trung tâm ──────── */}
      {selectedBlock && selectedBlock.kind !== "RESERVATION" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={drawerTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6"
          onClick={() => setSelectedBlock(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white shadow-2xl border border-slate-200/90 rounded-2xl flex flex-col overflow-hidden w-full max-w-4xl max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header with Room & Status badges, without mode switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6 shrink-0 bg-slate-50/70">
              <div className="min-w-0 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id={drawerTitleId}
                    className="font-black text-lg text-slate-900 truncate text-balance"
                  >
                    Phòng {selectedBlock.roomNumber}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black whitespace-nowrap shadow-2xs ${
                      selectedBlock.status === "OVERDUE"
                        ? "bg-rose-100 text-rose-800"
                        : selectedBlock.kind === "STAY"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-purple-100 text-purple-900"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        selectedBlock.status === "OVERDUE"
                          ? "bg-rose-600"
                          : selectedBlock.kind === "STAY"
                            ? "bg-emerald-600"
                            : "bg-purple-600"
                      }`}
                    />
                    {selectedBlock.status === "OVERDUE"
                      ? "Quá hạn"
                      : selectedBlock.kind === "STAY"
                        ? "Đang ở"
                        : "Đặt trước"}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200/70 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    {selectedBlock.roomTypeName || "Hạng phòng tiêu chuẩn"}
                  </span>
                  {selectedBlock.groupCode && (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-purple-900 bg-purple-100 border border-purple-300 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      <VsIcon name="groups" className="text-xs text-purple-700" />
                      <span>Đoàn #{selectedBlock.groupCode}</span>
                    </span>
                  )}
                  {isReadOnly && (
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      Chế độ xem
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(selectedBlock.kind as string) === "RESERVATION" && !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setIsEditReservationOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
                    title="Chỉnh sửa thông tin đặt phòng"
                  >
                    <VsIcon name="edit" className="text-sm text-amber-700" />
                    <span>Chỉnh sửa</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBlock(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition cursor-pointer"
                  title="Đóng chi tiết"
                  aria-label="Đóng"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 sm:px-6 pt-2 gap-6 text-xs font-bold text-slate-600 shrink-0">
              <button
                type="button"
                onClick={() => setDrawerTab("info")}
                className={`pb-2.5 border-b-2 transition cursor-pointer ${
                  drawerTab === "info"
                    ? "border-emerald-800 text-emerald-900 font-black"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Thông tin chi tiết
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("services")}
                className={`pb-2.5 border-b-2 transition cursor-pointer ${
                  drawerTab === "services"
                    ? "border-emerald-800 text-emerald-900 font-black"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Dịch vụ
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("history")}
                className={`pb-2.5 border-b-2 transition cursor-pointer ${
                  drawerTab === "history"
                    ? "border-emerald-800 text-emerald-900 font-black"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Lịch sử
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {drawerTab === "info" && (
                <div className="space-y-4">
                  {/* Khối hợp nhất: Mã đặt phòng, Kênh & Thông tin Khách hàng (Trung 1 box thay vì chia 2) */}
                  <div className="rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-50/50 via-slate-50/40 to-white p-4 sm:p-5 shadow-2xs space-y-4">
                    {/* Dòng 1: Mã đặt phòng & Kênh & Nhận phòng hôm nay */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Mã đặt phòng
                        </span>
                        <div className="flex items-center gap-1.5 bg-white border border-emerald-300/80 px-2.5 py-1 rounded-lg shadow-2xs">
                          <span className="font-mono text-xs font-black text-[#123d2a]">
                            {selectedBlock.reservationCode || "—"}
                          </span>
                          {selectedBlock.reservationCode && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(selectedBlock.reservationCode || "");
                                setCopiedCode(true);
                                setTimeout(() => setCopiedCode(false), 2000);
                              }}
                              className="p-0.5 text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                              title="Sao chép mã đặt phòng"
                            >
                              <VsIcon
                                name={copiedCode ? "check" : "content_copy"}
                                className={`text-xs ${copiedCode ? "text-emerald-600 font-bold" : ""}`}
                              />
                            </button>
                          )}
                        </div>
                        {copiedCode && (
                          <span className="text-xs font-bold text-emerald-700 animate-in fade-in">
                            Đã sao chép!
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500">Kênh:</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black whitespace-nowrap shadow-2xs ${
                            getChannelBadge(selectedBlock.channel || selectedBlock.source).bg
                          } ${getChannelBadge(selectedBlock.channel || selectedBlock.source).text}`}
                        >
                          {getChannelBadge(selectedBlock.channel || selectedBlock.source).label}
                        </span>

                        {selectedBlock.sourcePartnerName && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 shadow-2xs whitespace-nowrap">
                            <VsIcon name="business" className="text-xs" />
                            {selectedBlock.sourcePartnerName}
                          </span>
                        )}

                        {selectedBlock.bookingOwnerName && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs whitespace-nowrap">
                            <VsIcon name="badge" className="text-xs" />
                            Phụ trách: {selectedBlock.bookingOwnerName}
                          </span>
                        )}

                        {selectedBlock.startDate === todayYmd && (selectedBlock.kind as string) === "RESERVATION" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs whitespace-nowrap">
                            <span className="size-1.5 rounded-full bg-amber-600 animate-pulse" />
                            Nhận hôm nay
                          </span>
                        )}
                      </div>

                      {selectedBlock.groupCode && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-purple-50/80 border border-purple-200 text-purple-950 text-xs">
                          <div className="flex items-center gap-2 font-bold">
                            <VsIcon name="groups" className="text-base text-purple-700" />
                            <span>Đơn thuộc đoàn: <span className="font-mono text-purple-900 font-black">#{selectedBlock.groupCode}</span></span>
                          </div>
                          {onOpenGroupCheckIn && (
                            <button
                              type="button"
                              onClick={() => {
                                const code = selectedBlock.groupCode!;
                                setSelectedBlock(null);
                                onOpenGroupCheckIn(code);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              <VsIcon name="groups" className="text-xs" />
                              <span>{(selectedBlock.kind as string) === "RESERVATION" ? "Mở Check-in đoàn" : "Quản lý đoàn"}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Dòng 2: Hồ sơ Khách hàng & Phòng gán trong cùng 1 khối */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#123d2a] text-sm font-black text-white shadow-xs">
                          {selectedBlock.guestName ? selectedBlock.guestName.slice(0, 2).toUpperCase() : "VS"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-base text-slate-900 truncate text-balance">
                              {selectedBlock.guestName}
                            </h4>
                            <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200/90 px-2 py-0.5 rounded-md whitespace-nowrap">
                              {selectedBlock.guestCount ? `${selectedBlock.guestCount} khách` : "1 khách"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs font-semibold text-slate-600">
                            {selectedBlock.phone ? (
                              <a
                                href={`tel:${selectedBlock.phone}`}
                                className="flex items-center gap-1.5 hover:text-emerald-700 transition"
                                title="Gọi cho khách"
                              >
                                <VsIcon name="phone" className="text-xs text-slate-400" />
                                <span>{selectedBlock.phone}</span>
                              </a>
                            ) : (
                              <span className="flex items-center gap-1.5 text-slate-400">
                                <VsIcon name="phone" className="text-xs text-slate-300" />
                                <span>Chưa có SĐT</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-left sm:text-right text-xs shrink-0">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">
                          Phòng xếp
                        </span>
                        <p className="font-black text-base text-slate-900">
                          Phòng {selectedBlock.roomNumber}
                        </p>
                        <p className="font-medium text-slate-500">
                          {selectedBlock.roomTypeName || "Hạng tiêu chuẩn"}
                        </p>
                      </div>
                    </div>

                    {/* Ghi chú khách (nằm gọn gàng trong cùng 1 box) */}
                    {selectedBlock.notes && (
                      <div className="pt-2 border-t border-slate-200/60 flex items-start gap-2 text-xs">
                        <VsIcon name="notes" className="text-sm text-slate-400 shrink-0 mt-0.5" />
                        <div className="flex-1 bg-slate-50 border border-slate-200/70 rounded-xl p-2.5">
                          <span className="font-bold text-slate-700">Ghi chú lưu trú: </span>
                          <span className="text-slate-600 text-pretty">{selectedBlock.notes}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hai cột thông số: Lịch trình & Tài chính */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Khối Lịch trình lưu trú */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <VsIcon name="calendar_today" className="text-sm text-emerald-800" />
                        <span>Lịch trình lưu trú</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-slate-500">Ngày nhận phòng</span>
                          <p className="font-black text-sm text-slate-900">{selectedBlock.startDate}</p>
                          <p className="text-xs font-medium text-slate-500">14:00</p>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">Ngày trả phòng</span>
                            {selectedBlock.endDate === todayYmd && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-xs font-bold text-amber-900 whitespace-nowrap">
                                Hôm nay
                              </span>
                            )}
                          </div>
                          <p className="font-black text-sm text-slate-900">{selectedBlock.endDate}</p>
                          <p className="text-xs font-medium text-slate-500">12:00</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">Tổng thời gian:</span>
                        <span className="font-black text-slate-900">{selectedBlock.nights} đêm lưu trú</span>
                      </div>
                    </div>

                    {/* Khối Tài chính & Thanh toán */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <VsIcon name="payments" className="text-sm text-emerald-800" />
                        <span>Tài chính & Thanh toán</span>
                      </h5>

                      <div className="space-y-2 pt-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-600">Đơn giá phòng TB:</span>
                          <span className="font-bold text-slate-800">
                            {formatVnd(
                              selectedBlock.roomSubtotal && selectedBlock.nights
                                ? Math.round(selectedBlock.roomSubtotal / selectedBlock.nights)
                                : selectedBlock.nightlyRate,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="font-bold text-slate-800">Tổng tiền phòng ({selectedBlock.nights} đêm):</span>
                          <span className="font-black text-base text-[#123d2a]">
                            {formatVnd(
                              selectedBlock.roomSubtotal ??
                                (selectedBlock.nightlyRate ? selectedBlock.nightlyRate * selectedBlock.nights : null),
                            )}
                          </span>
                        </div>
                        {selectedBlock.serviceSubtotal && selectedBlock.serviceSubtotal > 0 ? (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="font-medium text-slate-600">Dịch vụ đặt trước:</span>
                            <span className="font-bold text-slate-800">
                              {formatVnd(selectedBlock.serviceSubtotal)}
                            </span>
                          </div>
                        ) : null}
                        {selectedBlock.totalAmount && selectedBlock.serviceSubtotal && selectedBlock.serviceSubtotal > 0 ? (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="font-black text-slate-900">Tổng cộng thanh toán:</span>
                            <span className="font-black text-base text-blue-900">
                              {formatVnd(selectedBlock.totalAmount)}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="font-medium text-slate-600">Trạng thái:</span>
                          <span
                            className={`font-black whitespace-nowrap ${
                              selectedBlock.kind === "STAY" ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {selectedBlock.kind === "STAY" ? "• Đã nhận phòng / Đang ở" : "• Chờ làm thủ tục nhận phòng"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "services" && (
                selectedBlock.services && selectedBlock.services.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <VsIcon name="room_service" className="text-sm text-emerald-800" />
                        <span>Dịch vụ đặt trước ({selectedBlock.services.length} mục)</span>
                      </span>
                      <span className="text-xs font-bold text-emerald-800">
                        {formatVnd(selectedBlock.serviceSubtotal)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
                      {selectedBlock.services.map((s, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50/70">
                          <div>
                            <p className="font-bold text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-500">
                              {s.quantity} × {formatVnd(s.unitPrice)}
                            </p>
                          </div>
                          <span className="font-black text-slate-900">{formatVnd(s.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <VsIcon name="room_service" className="text-4xl text-slate-300 mx-auto" />
                    <p className="font-bold text-xs text-slate-700">Chưa có dịch vụ phát sinh</p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto text-pretty">
                      Các dịch vụ giặt là, ăn uống, minibar phát sinh của phòng sẽ hiển thị tại đây.
                    </p>
                  </div>
                )
              )}

              {drawerTab === "history" && (
                <div className="space-y-3 p-1">
                  <div className="flex items-start gap-2.5">
                    <span className="size-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-slate-800">Tạo đặt phòng</p>
                      <p className="text-xs text-slate-400">
                        Cập nhật: {selectedBlock.expectedUpdatedAt.slice(0, 10)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="size-2 rounded-full bg-sky-600 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-slate-800">
                        Nhận phòng: {selectedBlock.startDate}
                      </p>
                      <p className="text-xs text-slate-400">
                        Phòng {selectedBlock.roomNumber} ({selectedBlock.roomTypeName || "Tiêu chuẩn"})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="size-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-slate-800">
                        Trả phòng dự kiến: {selectedBlock.endDate}
                      </p>
                      <p className="text-xs text-slate-400">{selectedBlock.nights} đêm lưu trú</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-slate-100 p-4 sm:px-6 flex flex-wrap items-center justify-end gap-2.5 bg-slate-50/70 shrink-0">
              {/* Nút Nhận phòng cho phòng Đặt trước */}
              {!isReadOnly && (selectedBlock.kind as string) === "RESERVATION" && (canCheckInStay ?? true) && (
                selectedBlock.groupCode && onOpenGroupCheckIn ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const code = selectedBlock.groupCode!;
                        setSelectedBlock(null);
                        onOpenGroupCheckIn(code);
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black px-5 py-2.5 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                    >
                      <VsIcon name="groups" className="text-base" />
                      <span>Check-in cho đoàn</span>
                    </button>
                    {(onCheckInReservation || onOpenCheckIn) && (
                      <button
                        type="button"
                        onClick={() => void handleDrawerCheckIn()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold px-4 py-2.5 text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                      >
                        <span>Chỉ nhận phòng này (P.{selectedBlock.roomNumber})</span>
                      </button>
                    )}
                  </>
                ) : (onCheckInReservation || onOpenCheckIn) ? (
                  <button
                    type="button"
                    onClick={() => void handleDrawerCheckIn()}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black px-5 py-2.5 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
                  >
                    <VsIcon name="login" className="text-base" />
                    <span>Nhận phòng (Check-in)</span>
                  </button>
                ) : null
              )}

              {/* Nút Quản lý đoàn nếu đang lưu trú thuộc đoàn */}
              {!isReadOnly && selectedBlock.kind === "STAY" && selectedBlock.groupCode && onOpenGroupCheckIn && (
                <button
                  type="button"
                  onClick={() => {
                    const code = selectedBlock.groupCode!;
                    setSelectedBlock(null);
                    onOpenGroupCheckIn(code);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold px-4 py-2.5 text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                >
                  <VsIcon name="groups" className="text-base text-purple-700" />
                  <span>Quản lý đoàn</span>
                </button>
              )}

              {!isReadOnly && (selectedBlock.kind as string) === "RESERVATION" && (
                <button
                  type="button"
                  onClick={() => setIsEditReservationOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold px-4 py-2.5 text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                >
                  <VsIcon name="edit" className="text-base text-amber-700" />
                  <span>Sửa thông tin</span>
                </button>
              )}

              {/* Accessible Move/Swap button */}
              {!isReadOnly && selectedBlock.movable && (
                <button
                  type="button"
                  onClick={() => handleOpenPlacementModal(selectedBlock)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold px-4 py-2.5 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
                >
                  <VsIcon name="swap_horiz" className="text-base" />
                  <span>Chuyển / Đổi phòng</span>
                </button>
              )}

              {!isReadOnly && selectedBlock.guestStayId && onCheckOutStay && (
                <button
                  type="button"
                  onClick={handleDrawerCheckOut}
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold px-4 py-2.5 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
                >
                  <VsIcon name="payments" className="text-base" />
                  <span>Trả phòng (Check-out)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
              >
                <span>Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Reservation Modal (Sửa ngay khi click, không qua box con) ── */}
      {selectedBlock && selectedBlock.kind === "RESERVATION" && (
        <EditReservationModal
          isOpen={Boolean(selectedBlock && selectedBlock.kind === "RESERVATION")}
          onClose={() => setSelectedBlock(null)}
          hotelId={hotelId}
          reservation={{
            id: selectedBlock.reservationId || selectedBlock.id.replace(/^res-/, ""),
            reservationCode: selectedBlock.reservationCode,
            guestDisplayName: selectedBlock.guestName,
            guestPhone: selectedBlock.phone,
            guestCount: selectedBlock.guestCount,
            notes: selectedBlock.notes,
            roomId: selectedBlock.roomId,
            roomNumber: selectedBlock.roomNumber,
            roomTypeName: selectedBlock.roomTypeName,
            plannedCheckInAt: selectedBlock.startAt || `${selectedBlock.startDate}T14:00:00+07:00`,
            plannedCheckOutAt: selectedBlock.endAt || `${selectedBlock.endDate}T12:00:00+07:00`,
            nightlyRateSnapshot: selectedBlock.nightlyRate,
            roomSubtotal: selectedBlock.roomSubtotal,
            totalAmount: selectedBlock.totalAmount,
            expectedUpdatedAt: selectedBlock.expectedUpdatedAt,
            status: selectedBlock.status,
            channel: selectedBlock.channel,
            source: selectedBlock.source,
            sourcePartnerName: selectedBlock.sourcePartnerName,
            groupCode: selectedBlock.groupCode,
          }}
          availableRooms={allRooms.map((r) => ({
            id: r.id,
            roomNumber: r.roomNumber,
            type: r.roomTypeName,
            status: r.status,
            price: r.price,
          }))}
          canCheckIn={!isReadOnly && Boolean(selectedBlock.canCheckIn || selectedBlock.status === "CONFIRMED" || selectedBlock.status === "PENDING")}
          onCheckIn={handleDrawerCheckIn}
          onOpenGroupOperations={onOpenGroupCheckIn}
          onSelectReservation={(nextRes) => {
            const matchedBlock = allBlocks.find(
              (b: RoomPlanBlock) =>
                b.kind === "RESERVATION" &&
                (b.reservationId === nextRes.id ||
                  b.id.replace(/^res-/, "") === nextRes.id ||
                  (nextRes.reservationCode && b.reservationCode === nextRes.reservationCode)),
            );
            if (matchedBlock) {
              setSelectedBlock(matchedBlock);
            }
          }}
          onSuccess={async () => {
            setSelectedBlock(null);
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
          }}
        />
      )}

      {/* ── Accessible Placement Modal (Move / Swap Fallback) ─────── */}
      {!isReadOnly && placementModalOpen && placementSourceBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Chuyển phòng: {placementSourceBlock.guestName}
                </h3>
                <p className="text-xs text-slate-500">
                  Phòng hiện tại: P.{placementSourceBlock.roomNumber} ({placementSourceBlock.roomTypeName || "Hạng phòng"}) • {placementSourceBlock.startDate} đến {placementSourceBlock.endDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlacementModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-700">
                Chọn phòng đích (cùng hạng phòng):
              </label>
              <select
                value={placementTargetRoomId}
                onChange={(e) => {
                  setPlacementTargetRoomId(e.target.value);
                  setPlacementTargetSwapResId("");
                }}
                className="w-full rounded-xl border border-slate-300 p-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/30"
              >
                <option value="">-- Chọn phòng đích --</option>
                {compatibleRoomsForPlacement.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    P.{rm.roomNumber} (Tầng {rm.floor || 1})
                  </option>
                ))}
              </select>

              {placementTargetRoomId && (() => {
                const targetBlocks = blocksByRoomId.get(placementTargetRoomId) || [];
                const conflict = targetBlocks.find(
                  (b) =>
                    b.startDate < placementSourceBlock.endDate &&
                    b.endDate > placementSourceBlock.startDate,
                );

                if (!conflict) {
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                      <p className="font-bold">✓ Phòng đích hoàn toàn trống trong khoảng thời gian này.</p>
                      <p className="text-xs mt-0.5">Thao tác: Di chuyển phòng sang phòng trống.</p>
                    </div>
                  );
                }

                const conflictSwapId = conflict
                  ? conflict.reservationId || conflict.guestStayId || conflict.id
                  : null;

                if (conflict.movable && conflictSwapId) {
                  const targetRoomObj = allRooms.find((r) => r.id === placementTargetRoomId);
                  const targetRoomNumber = targetRoomObj?.roomNumber || "";
                  return (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-purple-950 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                        <span>⚠️ Tráo đổi phòng giữa 2 đơn</span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 whitespace-nowrap">
                          2 chiều
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-white border border-purple-100 space-y-1">
                          <span className="text-slate-500 font-medium">Đơn 1:</span>
                          <p className="font-bold text-slate-900 truncate">{placementSourceBlock.guestName}</p>
                          <p className="text-emerald-700 font-bold">
                            P.{placementSourceBlock.roomNumber} ➔ P.{targetRoomNumber}
                          </p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-purple-100 space-y-1">
                          <span className="text-purple-700 font-medium">Đơn 2:</span>
                          <p className="font-bold text-slate-900 truncate">{conflict.guestName}</p>
                          <p className="text-purple-700 font-bold">
                            P.{targetRoomNumber} ➔ P.{placementSourceBlock.roomNumber}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600">
                        Ngày nhận/trả phòng và giá tiền của từng đơn được bảo lưu nguyên vẹn.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
                    <p className="font-bold">❌ Phòng đích đang có khách lưu trú không thể di dời.</p>
                    <p className="text-xs mt-0.5">Vui lòng chọn một phòng khác.</p>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPlacementModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={
                  !placementTargetRoomId ||
                  placementMutation.isPending ||
                  (() => {
                    const targetBlocks = blocksByRoomId.get(placementTargetRoomId) || [];
                    const conflict = targetBlocks.find(
                      (b) =>
                        b.startDate < placementSourceBlock.endDate &&
                        b.endDate > placementSourceBlock.startDate,
                    );
                    const conflictSwapId = conflict ? (conflict.reservationId || conflict.guestStayId || conflict.id) : null;
                    return Boolean(conflict && (!conflict.movable || !conflictSwapId));
                  })()
                }
                onClick={() => {
                  const targetBlocks = blocksByRoomId.get(placementTargetRoomId) || [];
                  const conflict = targetBlocks.find(
                    (b) =>
                      b.startDate < placementSourceBlock.endDate &&
                      b.endDate > placementSourceBlock.startDate,
                  );
                  const conflictSwapId = conflict ? (conflict.reservationId || conflict.guestStayId || conflict.id) : null;

                  if (conflict && conflictSwapId) {
                    placementMutation.mutate({
                      reservationId: placementSourceBlock.reservationId!,
                      targetRoomId: placementTargetRoomId,
                      mode: "SWAP",
                      expectedUpdatedAt: placementSourceBlock.expectedUpdatedAt,
                      swapWithReservationId: conflictSwapId,
                      swapExpectedUpdatedAt: conflict.expectedUpdatedAt,
                    });
                  } else {
                    placementMutation.mutate({
                      reservationId: placementSourceBlock.reservationId!,
                      targetRoomId: placementTargetRoomId,
                      mode: "MOVE",
                      expectedUpdatedAt: placementSourceBlock.expectedUpdatedAt,
                    });
                  }
                }}
                className="rounded-xl bg-purple-700 px-5 py-2 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50 cursor-pointer"
              >
                {placementMutation.isPending ? "Đang xử lý..." : "Xác nhận chuyển"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
