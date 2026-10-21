"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  SwalVietSage,
} from "@/libs/swal";
import type {
  HotelArrival,
  HotelRoomSummary,
  RoomPlanBlock,
  RoomPlanRoom,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { roomPlanRepository } from "@/features/hotel-ops/repositories/room-plan-repository";
import { roomPlanResource } from "@/features/hotel-ops/resources/room-plan-resource";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { useRoomOrderStore } from "@/features/hotel-ops/store/room-order-store";

export type TapeChartViewMode = "week" | "month";

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

interface TapeChartViewProps {
  hotelId: string;
  rooms?: HotelRoomSummary[];
  arrivalsList?: HotelArrival[];
  businessDate?: string;
  onOpenCheckIn?: (room: HotelRoomSummary | RoomPlanRoom, initialDate?: string) => void;
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
  onRefresh?: () => void;
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
  if (key.includes("trực tiếp") || key.includes("direct")) return CHANNEL_BADGES["trực tiếp"];
  if (CHANNEL_BADGES[key]) return CHANNEL_BADGES[key];
  return {
    bg: "bg-slate-700",
    text: "text-white",
    border: "border-slate-800",
    label: channel ? channel.trim() : "Trực tiếp",
  };
}

function getTodayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, "0");
  const nextD = String(date.getDate()).padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

function parseYmdDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function calculateNights(startDay: string, endDay: string): number {
  const start = parseYmdDate(startDay).getTime();
  const end = parseYmdDate(endDay).getTime();
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
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
  roomBlocks: RoomPlanBlock[];
  dragOverCellKey: string | null;
  handleDragOverCell: (e: React.DragEvent, cellKey: string) => void;
  handleDragLeaveCell: (cellKey: string) => void;
  handleDropOnRoom: (e: React.DragEvent, room: RoomPlanRoom) => void;
  handleDragStart: (e: React.DragEvent, block: RoomPlanBlock) => void;
  setSelectedBlock: (block: RoomPlanBlock) => void;
  onOpenCheckIn?: (room: RoomPlanRoom, ymd: string) => void;
  draftSelection: DraftBookingSelection | null;
  isDraggingRange: boolean;
  onStartDragRange: (room: RoomPlanRoom, ymd: string) => void;
  onHoverDragDay: (room: RoomPlanRoom, ymd: string) => void;
  onAdjustDraftDays: (delta: number) => void;
  onConfirmDraft: (draft: DraftBookingSelection) => void;
  onCancelDraft: () => void;
  activeBlockResize?: ActiveBlockResize | null;
  onStartBlockResize?: (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => void;
}

function DraggableRoomRow({
  room,
  daysList,
  todayYmd = getTodayInVietnam(),
  roomBlocks,
  dragOverCellKey,
  handleDragOverCell,
  handleDragLeaveCell,
  handleDropOnRoom,
  handleDragStart,
  setSelectedBlock,
  onOpenCheckIn,
  draftSelection,
  isDraggingRange,
  onStartDragRange,
  onHoverDragDay,
  onAdjustDraftDays,
  onConfirmDraft,
  onCancelDraft,
  activeBlockResize,
  onStartBlockResize,
}: DraggableRoomRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 25 : undefined,
  };

  const isOccupiedToday = roomBlocks.some(
    (b) => b.kind === "STAY" && b.startDate <= todayYmd && b.endDate > todayYmd,
  );

  const isHardVetoRoom =
    room.status === "MAINTENANCE" ||
    room.status === "BLOCKED" ||
    room.status === "OUT_OF_SERVICE";
  const isProcessing =
    room.status === "DIRTY" ||
    room.status === "CLEANING" ||
    room.status === "INSPECTION";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragOver={(e) => handleDragOverCell(e, room.id)}
      onDragLeave={() => handleDragLeaveCell(room.id)}
      onDrop={(e) => void handleDropOnRoom(e, room)}
      className={`group flex border-b border-slate-100 hover:bg-slate-50/60 transition min-h-[46px] select-none relative w-full ${
        dragOverCellKey === room.id
          ? "bg-emerald-50 ring-2 ring-emerald-500 ring-inset"
          : isHardVetoRoom
            ? "bg-slate-200/80 hover:bg-slate-200"
            : isProcessing
              ? "bg-amber-100/70 hover:bg-amber-100/90"
              : ""
      }`}
    >
      {/* Left Room Info Column */}
      <div
        {...attributes}
        {...listeners}
        className={`sticky left-0 z-10 w-48 min-w-[192px] max-w-[192px] shrink-0 border-r border-slate-200 px-3 py-2 flex items-center justify-between shadow-xs cursor-grab active:cursor-grabbing ${
          isHardVetoRoom
            ? "bg-slate-200/90 group-hover:bg-slate-200"
            : isProcessing
              ? "bg-amber-100/90 group-hover:bg-amber-100"
              : "bg-white group-hover:bg-slate-50"
        }`}
        title="Kéo thả để đổi thứ tự phòng"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-black text-sm text-slate-900 truncate">
            P.{room.roomNumber}
          </span>
          {isHardVetoRoom && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-300 text-slate-900 whitespace-nowrap">
              Khóa
            </span>
          )}
          {isProcessing && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-950 whitespace-nowrap">
              Chờ dọn
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
      <div className="relative flex flex-1 min-w-0">
        {/* Day Cell Grid Lines */}
        {daysList.map((day) => {
          const isCellOccupied = roomBlocks.some(
            (b) => b.startDate <= day.ymd && b.endDate > day.ymd,
          );
          const isRoomInDraft = Boolean(
            draftSelection && draftSelection.rooms.some((r) => r.id === room.id),
          );
          const isDraftCell = Boolean(
            isRoomInDraft &&
              draftSelection &&
              day.ymd >= draftSelection.startDay &&
              day.ymd < draftSelection.endDay,
          );

          return (
            <div
              key={day.ymd}
              data-cell-day="true"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (isCellOccupied || isHardVetoRoom) return;
                e.preventDefault();
                e.stopPropagation();
                onStartDragRange(room, day.ymd);
              }}
              onMouseEnter={() => {
                if (isDraggingRange) {
                  onHoverDragDay(room, day.ymd);
                }
              }}
              className={`flex-1 min-w-[100px] border-r border-slate-100 relative group/cell select-none transition-colors ${
                isDraftCell
                  ? "bg-purple-100/60 ring-1 ring-inset ring-purple-300"
                  : isHardVetoRoom
                    ? "bg-slate-200/75 cursor-not-allowed"
                    : isProcessing
                      ? "bg-amber-100/60"
                      : day.isToday
                        ? "bg-sky-50/30"
                        : ""
              } ${!isCellOccupied && !isHardVetoRoom ? "cursor-pointer hover:bg-purple-50/50" : ""}`}
            >
              {!isCellOccupied && !isDraftCell && !isDraggingRange && !isHardVetoRoom && (
                <div
                  className="absolute inset-1 hidden group-hover/cell:flex items-center justify-center rounded-lg border border-dashed border-purple-400 bg-purple-50/80 text-purple-700 text-xs font-bold shadow-2xs hover:bg-purple-100 transition z-10 pointer-events-none"
                  title={`Click hoặc kéo để đặt trước P.${room.roomNumber} từ ${day.dateNum}`}
                >
                  <span className="flex items-center gap-0.5">
                    <span className="text-sm leading-none">+</span>
                    <span className="text-xs uppercase font-bold tracking-tight">Đặt trước</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Draft Booking Overlay on Secondary / Group Member Rooms */}
        {draftSelection &&
          draftSelection.roomId !== room.id &&
          draftSelection.rooms.some((r) => r.id === room.id) &&
          (() => {
            const startIndex = daysList.findIndex((d) => d.ymd >= draftSelection.startDay);
            const endIndex = daysList.findIndex((d) => d.ymd >= draftSelection.endDay);

            if (
              draftSelection.endDay < daysList[0].ymd ||
              draftSelection.startDay > daysList[daysList.length - 1].ymd
            ) {
              return null;
            }

            const leftPct =
              startIndex === -1 ? 0 : (startIndex / daysList.length) * 100;
            const widthPct =
              endIndex === -1
                ? 100 - leftPct
                : Math.max(
                    (1 / daysList.length) * 100,
                    (Math.max(1, endIndex - Math.max(0, startIndex)) /
                      daysList.length) *
                      100,
                  );

            return (
              <div
                key="draft-group-member-bar"
                style={{
                  left: `calc(${leftPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                  top: "6px",
                  bottom: "6px",
                }}
                className="absolute z-10 flex items-center justify-center px-2 rounded-lg border border-dashed border-purple-400 bg-purple-600/25 text-purple-900 text-xs font-bold pointer-events-none shadow-2xs backdrop-blur-[1px]"
              >
                <span className="truncate whitespace-nowrap">✓ P.{room.roomNumber} (Trong đoàn)</span>
              </div>
            );
          })()}

        {/* Active Draft Booking Range Control Bar (on Primary Anchor Room) */}
        {draftSelection && draftSelection.roomId === room.id && (() => {
          const startIndex = daysList.findIndex((d) => d.ymd >= draftSelection.startDay);
          const endIndex = daysList.findIndex((d) => d.ymd >= draftSelection.endDay);

          if (
            draftSelection.endDay < daysList[0].ymd ||
            draftSelection.startDay > daysList[daysList.length - 1].ymd
          ) {
            return null;
          }

          const leftPct =
            startIndex === -1 ? 0 : (startIndex / daysList.length) * 100;
          const widthPct =
            endIndex === -1
              ? 100 - leftPct
              : Math.max(
                  (1 / daysList.length) * 100,
                  (Math.max(1, endIndex - Math.max(0, startIndex)) /
                    daysList.length) *
                    100,
                );

          const isGroup = draftSelection.rooms.length > 1;

          return (
            <div
              key="draft-booking-bar"
              data-draft-interactive="true"
              style={{
                left: `calc(${leftPct}% + 4px)`,
                width: `calc(${widthPct}% - 8px)`,
                top: "5px",
                bottom: "5px",
              }}
              className={`absolute z-20 flex items-center justify-between px-2.5 rounded-lg border-2 border-dashed border-purple-300 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white shadow-lg ring-2 ring-purple-400/50 select-none animate-in fade-in zoom-in-95 duration-150 ${
                isDraggingRange ? "pointer-events-none" : "pointer-events-auto"
              }`}
            >
              {/* Left label / nights & group summary */}
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                <VsIcon
                  name={isGroup ? "group_add" : "bookmark_add"}
                  className="text-sm shrink-0 text-amber-300"
                />
                <span className="text-xs font-black truncate whitespace-nowrap">
                  {isGroup ? `Đoàn: ${draftSelection.rooms.length} phòng` : `Đặt trước`}: {draftSelection.nights} đêm
                </span>
              </div>

              {/* Quick Stepper, Guest Count & Confirm buttons */}
              <div className="flex items-center gap-1 shrink-0">
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

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmDraft(draftSelection);
                  }}
                  className="ml-1 px-2.5 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer whitespace-nowrap transition"
                  title={
                    isGroup
                      ? "Xác nhận đặt trước cho cả đoàn (1 người đại diện)"
                      : "Xác nhận tạo đặt trước"
                  }
                >
                  <VsIcon name="check" className="text-xs" />
                  <span>{isGroup ? `Đặt ${draftSelection.rooms.length} phòng` : "Đặt trước"}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDraft();
                  }}
                  className="size-5 rounded flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 cursor-pointer ml-0.5"
                  title="Hủy chọn"
                >
                  ✕
                </button>
              </div>

              {/* Floating Tooltip Header above the bar for clear date readability */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/95 text-white px-2.5 py-0.5 rounded-full text-xs font-bold shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none">
                <span className="text-amber-300">
                  {isGroup
                    ? `${draftSelection.rooms.length} phòng (${draftSelection.rooms.map((r) => `P.${r.roomNumber}`).join(", ")})`
                    : `P.${room.roomNumber}`}
                </span>
                <span>•</span>
                <span>
                  {formatDateNum(draftSelection.startDay)} ➔ {formatDateNum(draftSelection.endDay)}
                </span>
                <span className="text-purple-300">({draftSelection.nights} đêm)</span>
              </div>
            </div>
          );
        })()}

        {/* Active Block Resize Ghost Overlay */}
        {activeBlockResize &&
          activeBlockResize.block.roomId === room.id &&
          (() => {
            const ghostStartIndex = daysList.findIndex(
              (d) => d.ymd >= activeBlockResize.currentGhostStartDay,
            );
            const ghostEndIndex = daysList.findIndex(
              (d) => d.ymd >= activeBlockResize.currentGhostEndDay,
            );
            if (
              activeBlockResize.currentGhostEndDay < daysList[0].ymd ||
              activeBlockResize.currentGhostStartDay > daysList[daysList.length - 1].ymd
            ) {
              return null;
            }

            const ghostLeftPct =
              ghostStartIndex === -1 ? 0 : (ghostStartIndex / daysList.length) * 100;
            const ghostWidthPct =
              ghostEndIndex === -1
                ? 100 - ghostLeftPct
                : Math.max(
                    (1 / daysList.length) * 100,
                    (Math.max(1, ghostEndIndex - Math.max(0, ghostStartIndex)) /
                      daysList.length) *
                      100,
                  );

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
                className={`absolute z-30 flex items-center justify-between px-2.5 rounded-lg border-2 border-dashed shadow-md select-none pointer-events-none transition-all ${
                  isGhostOverdue
                    ? "border-rose-500 bg-rose-500/25 text-rose-950 ring-2 ring-rose-400/40"
                    : isGhostStay
                      ? "border-emerald-500 bg-emerald-500/25 text-emerald-950 ring-2 ring-emerald-400/40"
                      : "border-purple-500 bg-purple-500/25 text-purple-950 ring-2 ring-purple-400/40"
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
          const startIndex = daysList.findIndex((d) => d.ymd >= b.startDate);
          const endIndex = daysList.findIndex((d) => d.ymd >= b.endDate);

          if (
            b.endDate < daysList[0].ymd ||
            b.startDate > daysList[daysList.length - 1].ymd
          ) {
            return null;
          }

          const leftPct =
            startIndex === -1 ? 0 : (startIndex / daysList.length) * 100;
          const widthPct =
            endIndex === -1
              ? 100 - leftPct
              : Math.max(
                  (1 / daysList.length) * 100,
                  (Math.max(1, endIndex - Math.max(0, startIndex)) /
                    daysList.length) *
                    100,
                );

          const channelKey = (b.channel || b.source || "trực tiếp").toLowerCase().trim();
          const isDirect =
            channelKey === "trực tiếp" ||
            channelKey === "direct" ||
            channelKey === "direct booking";
          const channelBadge = getChannelBadge(b.channel || b.source);

          const isOverdue = b.status === "OVERDUE";
          const isStay = b.kind === "STAY";
          const canResizeRight = isStay || isOverdue || b.kind === "RESERVATION";
          const canResizeLeft = b.kind === "RESERVATION";

          // Màu thanh theo trạng thái: Đang ở (xanh lá), Đặt trước (tím), Quá hạn (đỏ)
          const barBg = isOverdue
            ? "bg-rose-600 hover:bg-rose-700 border-rose-800 text-white"
            : isStay
              ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white"
              : "bg-purple-600 hover:bg-purple-700 border-purple-800 text-white";

          return (
            <button
              key={b.id}
              type="button"
              draggable={b.movable}
              onDragStart={(e) => handleDragStart(e, b)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBlock(b);
              }}
              style={{
                left: `calc(${leftPct}% + 4px)`,
                width: `calc(${widthPct}% - 8px)`,
                top: "5px",
                bottom: "5px",
              }}
              className={`absolute z-10 flex items-center gap-1.5 px-2.5 rounded-lg border shadow-xs transition-all text-xs font-bold overflow-hidden select-none relative ${barBg} ${
                b.movable
                  ? "cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-purple-300"
                  : "cursor-pointer"
              }`}
              title={`${b.guestName}${b.guestCount && b.guestCount > 1 ? ` (${b.guestCount} khách)` : ""}${!isDirect ? ` • ${channelBadge.label}` : ""}${
                b.movable ? " • Kéo thả để đổi phòng" : ""
              }${canResizeRight ? " • Kéo mép phải để gia hạn lưu trú" : ""}`}
            >
              {/* Left Edge Resize Handle (Đổi ngày nhận phòng cho Đặt trước) */}
              {canResizeLeft && onStartBlockResize && (
                <div
                  role="slider"
                  aria-label="Kéo mép trái để điều chỉnh ngày nhận phòng"
                  title="Kéo mép trái để đổi ngày nhận phòng"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onStartBlockResize(b, "start", e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlock(b);
                  }}
                  className="absolute left-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize z-20 group/lhandle flex items-center justify-start pl-0.5 hover:bg-black/25 transition rounded-l-lg"
                >
                  <div className="w-0.5 h-3 rounded-full bg-white/60 group-hover/lhandle:bg-white transition-all shadow-xs" />
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

              {/* Right Edge Resize Handle (Gia hạn lưu trú hoặc đổi ngày trả phòng) */}
              {canResizeRight && onStartBlockResize && (
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
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onStartBlockResize(b, "end", e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlock(b);
                  }}
                  className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3 cursor-col-resize z-20 group/rhandle flex items-center justify-end pr-0.5 hover:bg-black/25 transition rounded-r-lg"
                >
                  <div className="w-1 h-3 rounded-full bg-white/60 group-hover/rhandle:bg-white transition-all shadow-xs" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  blocksByRoomId: Map<string, RoomPlanBlock[]>;
  dragOverCellKey: string | null;
  handleDragOverCell: (e: React.DragEvent, cellKey: string) => void;
  handleDragLeaveCell: (cellKey: string) => void;
  handleDropOnRoom: (e: React.DragEvent, room: RoomPlanRoom) => void;
  handleDragStart: (e: React.DragEvent, block: RoomPlanBlock) => void;
  setSelectedBlock: (block: RoomPlanBlock) => void;
  onOpenCheckIn?: (room: RoomPlanRoom, ymd: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  draftSelection: DraftBookingSelection | null;
  isDraggingRange: boolean;
  onStartDragRange: (room: RoomPlanRoom, ymd: string) => void;
  onHoverDragDay: (room: RoomPlanRoom, ymd: string) => void;
  onAdjustDraftDays: (delta: number) => void;
  onConfirmDraft: (draft: DraftBookingSelection) => void;
  onCancelDraft: () => void;
  activeBlockResize?: ActiveBlockResize | null;
  onStartBlockResize?: (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => void;
}

function CategoryRoomTable({
  cat,
  catRooms,
  daysList,
  todayYmd = getTodayInVietnam(),
  blocksByRoomId,
  dragOverCellKey,
  handleDragOverCell,
  handleDragLeaveCell,
  handleDropOnRoom,
  handleDragStart,
  setSelectedBlock,
  onOpenCheckIn,
  isCollapsed,
  onToggleCollapse,
  draftSelection,
  isDraggingRange,
  onStartDragRange,
  onHoverDragDay,
  onAdjustDraftDays,
  onConfirmDraft,
  onCancelDraft,
  activeBlockResize,
  onStartBlockResize,
}: CategoryRoomTableProps) {
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

  const occupiedTodayCount = useMemo(() => {
    return catRooms.reduce((acc, room) => {
      const blocks = blocksByRoomId.get(room.id) || [];
      const isOccupied = blocks.some(
        (b) => b.startDate <= todayYmd && b.endDate > todayYmd,
      );
      return acc + (isOccupied ? 1 : 0);
    }, 0);
  }, [catRooms, blocksByRoomId, todayYmd]);

  const occupancyRatio = catRooms.length > 0 ? occupiedTodayCount / catRooms.length : 0;

  const catPrice = useMemo(() => {
    return catRooms.find((r) => typeof r.price === "number" && r.price > 0)?.price ?? null;
  }, [catRooms]);

  return (
    <div className="border-b-2 border-slate-200 w-full">
      {/* Category Header Row */}
      <div className="flex bg-slate-100/90 border-b border-slate-200 py-2 font-bold text-xs sticky top-[41px] z-20 w-full">
        <div className="sticky left-0 z-20 w-48 min-w-[192px] max-w-[192px] shrink-0 bg-slate-100/90 px-3 flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleCollapse}
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

          {/* Subtitle and Mini Progress Bar matching Stitch */}
          <div className="mt-1 pl-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>
                {occupiedTodayCount}/{catRooms.length} phòng đang sử dụng
              </span>
            </div>
            <div className="w-full bg-slate-200/90 rounded-full h-1 mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  occupancyRatio >= 1
                    ? "bg-rose-500"
                    : occupancyRatio > 0
                      ? "bg-emerald-600"
                      : "bg-transparent"
                }`}
                style={{ width: `${Math.min(100, Math.round(occupancyRatio * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-w-0 cursor-pointer" onClick={onToggleCollapse}>
          {daysList.map((day) => {
            const occupiedCount = catRooms.reduce((acc, room) => {
              const blocks = blocksByRoomId.get(room.id) || [];
              const isOccupied = blocks.some(
                (b) => b.startDate <= day.ymd && b.endDate > day.ymd,
              );
              return acc + (isOccupied ? 1 : 0);
            }, 0);
            const avail = Math.max(0, catRooms.length - occupiedCount);
            const isSoldOut = avail === 0 && catRooms.length > 0;

            return (
              <div
                key={day.ymd}
                className={`flex-1 min-w-[100px] border-r border-slate-200/60 px-1 py-1 text-center text-xs flex flex-col justify-center items-center ${
                  day.isToday ? "bg-sky-50/50" : ""
                }`}
              >
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
              roomBlocks={blocksByRoomId.get(row.original.id) || []}
              dragOverCellKey={dragOverCellKey}
              handleDragOverCell={handleDragOverCell}
              handleDragLeaveCell={handleDragLeaveCell}
              handleDropOnRoom={handleDropOnRoom}
              handleDragStart={handleDragStart}
              setSelectedBlock={setSelectedBlock}
              onOpenCheckIn={onOpenCheckIn}
              draftSelection={draftSelection}
              isDraggingRange={isDraggingRange}
              onStartDragRange={onStartDragRange}
              onHoverDragDay={onHoverDragDay}
              onAdjustDraftDays={onAdjustDraftDays}
              onConfirmDraft={onConfirmDraft}
              onCancelDraft={onCancelDraft}
              activeBlockResize={activeBlockResize}
              onStartBlockResize={onStartBlockResize}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

export function TapeChartView({
  hotelId,
  rooms: propRooms = [],
  businessDate,
  onOpenCheckIn,
  onOpenQuickReservation,
  onOpenBulkReservation,
  onCheckOutStay,
  onRefresh,
}: TapeChartViewProps) {
  const queryClient = useQueryClient();
  const drawerTitleId = useId();
  const todayYmd = useMemo(() => getTodayInVietnam(), []);
  const initialBaseDate = businessDate || todayYmd;

  const [startDate, setStartDate] = useState<string>(initialBaseDate);
  const [viewMode, setViewMode] = useState<TapeChartViewMode>("week");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedFloor, setSelectedFloor] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Slide-over Drawer Selected Block & Active Tab
  const [selectedBlock, setSelectedBlock] = useState<RoomPlanBlock | null>(null);
  const [drawerTab, setDrawerTab] = useState<"info" | "services" | "history">("info");
  const [detailViewMode, setDetailViewMode] = useState<"modal" | "bottom" | "side">("modal");

  const handleSelectBlock = useCallback((block: RoomPlanBlock | null) => {
    setSelectedBlock(block);
    setDrawerTab("info");
  }, []);

  // Placement Modal state (accessible fallback for Move/Swap)
  const [placementModalOpen, setPlacementModalOpen] = useState(false);
  const [placementSourceBlock, setPlacementSourceBlock] = useState<RoomPlanBlock | null>(null);
  const [placementTargetRoomId, setPlacementTargetRoomId] = useState<string>("");
  const [placementTargetSwapResId, setPlacementTargetSwapResId] = useState<string>("");

  // Drag over drop target highlighting
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);

  // Compute number of days based on view mode (Week = 7, Month = 30)
  const numDays = viewMode === "week" ? 7 : 30;
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vietsage", "room-plan"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "staff-rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-rooms"] }),
      ]);
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
  }, [planData?.rooms, propRooms]);

  // Authoritative blocks from planData with resilient normalization
  const allBlocks: RoomPlanBlock[] = useMemo(() => {
    if (!planData?.blocks) return [];
    return (planData.blocks as any[]).map((raw) => {
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
        (raw.source === "OTA" ? "OTA" : "Trực tiếp");

      const nightlyRate =
        raw.nightlyRate ??
        (raw.nightlyRateSnapshot ? Number(raw.nightlyRateSnapshot) : null);

      const roomNumber =
        raw.roomNumber ||
        allRooms.find((r) => r.id === raw.roomId)?.roomNumber ||
        "";

      const roomTypeName =
        raw.roomTypeName ||
        allRooms.find((r) => r.id === raw.roomId)?.roomTypeName ||
        null;

      return {
        id: String(raw.id),
        kind: (raw.kind as "RESERVATION" | "STAY") || "RESERVATION",
        reservationId: raw.reservationId ?? null,
        guestStayId: raw.guestStayId ?? raw.stayId ?? null,
        reservationCode: raw.reservationCode ?? null,
        guestName,
        guestCount: raw.guestCount ?? null,
        phone: raw.phone ?? raw.guestPhone ?? null,
        source: raw.source ?? null,
        channel,
        status: String(raw.status || "CONFIRMED"),
        roomId: String(raw.roomId),
        roomNumber,
        roomTypeId: raw.roomTypeId ?? null,
        roomTypeName,
        startDate,
        endDate,
        nights: diffNights,
        nightlyRate,
        movable: Boolean(raw.movable),
        expectedUpdatedAt:
          raw.expectedUpdatedAt || raw.updatedAt || new Date().toISOString(),
        notes: raw.notes || null,
      };
    });
  }, [planData?.blocks, allRooms]);

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

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return allRooms.filter((r) => {
      if (selectedCategory !== "all" && (r.roomTypeName || "") !== selectedCategory) {
        return false;
      }
      if (selectedFloor !== "all" && String(r.floor || "") !== selectedFloor) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesRoom = r.roomNumber.toLowerCase().includes(query);
        const matchesType = (r.roomTypeName || "").toLowerCase().includes(query);
        if (!matchesRoom && !matchesType) return false;
      }
      return true;
    });
  }, [allRooms, selectedCategory, selectedFloor, searchQuery]);

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

  // Navigation handlers
  const handlePrevWeek = () => setStartDate((prev) => addDaysYmd(prev, -7));
  const handleNextWeek = () => setStartDate((prev) => addDaysYmd(prev, 7));
  const handleGoToday = () => setStartDate(todayYmd);

  // Check-out action from Drawer
  const handleDrawerCheckOut = async () => {
    if (!selectedBlock || !selectedBlock.guestStayId || !onCheckOutStay) return;
    const res = await showConfirmDialog({
      title: `Trả phòng P.${selectedBlock.roomNumber}?`,
      text: `Xác nhận khách ${selectedBlock.guestName} đã hoàn tất thủ tục trả phòng và thanh toán.`,
      confirmText: "Đồng ý trả phòng",
      cancelText: "Hủy",
    });

    if (res.isConfirmed) {
      await onCheckOutStay(selectedBlock.guestStayId, selectedBlock.roomNumber);
      setSelectedBlock(null);
      void refetchPlan();
    }
  };

  // Open placement modal for accessible button
  const handleOpenPlacementModal = (block: RoomPlanBlock) => {
    setPlacementSourceBlock(block);
    setPlacementTargetRoomId("");
    setPlacementTargetSwapResId("");
    setPlacementModalOpen(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, block: RoomPlanBlock) => {
    if (!block.movable || !block.reservationId) {
      e.preventDefault();
      return;
    }

    const payload: DraggedReservationPayload = {
      blockId: block.id,
      reservationId: block.reservationId,
      fromRoomId: block.roomId,
      fromRoomNumber: block.roomNumber,
      roomTypeId: block.roomTypeId,
      roomTypeName: block.roomTypeName,
      guestName: block.guestName,
      startDate: block.startDate,
      endDate: block.endDate,
      expectedUpdatedAt: block.expectedUpdatedAt,
    };

    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverCell = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCellKey !== cellKey) {
      setDragOverCellKey(cellKey);
    }
  };

  const handleDragLeaveCell = (cellKey: string) => {
    if (dragOverCellKey === cellKey) {
      setDragOverCellKey(null);
    }
  };

  const handleDropOnRoom = async (e: React.DragEvent, targetRoom: RoomPlanRoom) => {
    e.preventDefault();
    setDragOverCellKey(null);

    const rawData = e.dataTransfer.getData("application/json");
    if (!rawData) return;

    let payload: DraggedReservationPayload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (payload.fromRoomId === targetRoom.id) return;

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
      if (conflictBlock.movable && conflictBlock.reservationId) {
        // Offer swap
        const swapRes = await showConfirmDialog({
          title: "Tráo đổi phòng giữa 2 đơn?",
          text: `Phòng ${targetRoom.roomNumber} đang có đơn của khách "${conflictBlock.guestName}". Bạn có muốn TRÁO phòng giữa khách "${payload.guestName}" (P.${payload.fromRoomNumber}) và "${conflictBlock.guestName}" (P.${targetRoom.roomNumber}) không? Ngày và giá của từng đơn sẽ được giữ nguyên.`,
          confirmText: "Đồng ý tráo phòng (SWAP)",
          cancelText: "Hủy",
        });

        if (swapRes.isConfirmed) {
          placementMutation.mutate({
            reservationId: payload.reservationId,
            targetRoomId: targetRoom.id,
            mode: "SWAP",
            expectedUpdatedAt: payload.expectedUpdatedAt,
            swapWithReservationId: conflictBlock.reservationId,
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
      targetRoom.status === "DIRTY" ||
      targetRoom.status === "CLEANING" ||
      targetRoom.status === "INSPECTION";

    const moveRes = await showConfirmDialog({
      title: isDirtyOrCleaning
        ? `Xếp vào phòng đang chờ dọn (P.${targetRoom.roomNumber})?`
        : `Chuyển đơn sang phòng ${targetRoom.roomNumber}?`,
      text: isDirtyOrCleaning
        ? `Lưu ý: Phòng ${targetRoom.roomNumber} đang ở trạng thái chờ dọn dẹp. Vui lòng kiểm tra với bộ phận buồng phòng trước khi khách nhận phòng.\n\nXác nhận chuyển đơn của khách "${payload.guestName}" từ P.${payload.fromRoomNumber} sang P.${targetRoom.roomNumber} (${payload.startDate} -> ${payload.endDate})?`
        : `Xác nhận chuyển đơn của khách "${payload.guestName}" từ P.${payload.fromRoomNumber} sang P.${targetRoom.roomNumber} (${payload.startDate} -> ${payload.endDate})?`,
      confirmText: isDirtyOrCleaning ? "Vẫn chuyển phòng" : "Đồng ý chuyển",
      cancelText: "Hủy",
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

  // Global mouseup to finalize range drag
  useEffect(() => {
    if (!activeDragRange) return;
    const handleGlobalMouseUp = () => {
      setActiveDragRange(null);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [activeDragRange]);

  // Press Escape to cancel draft selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraftSelection(null);
        setActiveDragRange(null);
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
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-draft-interactive="true"]')) return;
      if (target?.closest?.('[data-cell-day="true"]')) return;
      setDraftSelection(null);
      setActiveDragRange(null);
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
    (room: RoomPlanRoom, ymd: string) => {
      const blocks = blocksByRoomId.get(room.id) || [];
      const isOccupied = blocks.some((b) => b.startDate <= ymd && b.endDate > ymd);
      if (isOccupied) return;

      const nextDay = addDaysYmd(ymd, 1);
      setActiveDragRange({
        anchorRoom: room,
        anchorDay: ymd,
        currentRoom: room,
        currentDay: ymd,
      });
      setDraftSelection({
        roomId: room.id,
        roomNumber: room.roomNumber,
        room,
        rooms: [room],
        startDay: ymd,
        endDay: nextDay,
        nights: 1,
      });
    },
    [blocksByRoomId],
  );

  const handleHoverDragDay = useCallback(
    (room: RoomPlanRoom, targetYmd: string) => {
      if (!activeDragRange) return;

      const anchorDay = activeDragRange.anchorDay;
      const anchorRoom = activeDragRange.anchorRoom;

      // 1. Horizontal date range calculation
      let start = anchorDay;
      let end = addDaysYmd(targetYmd, 1);

      if (targetYmd < anchorDay) {
        start = targetYmd;
        end = addDaysYmd(anchorDay, 1);
      }

      // Check collision on the anchor room
      const anchorBlocks = blocksByRoomId.get(anchorRoom.id) || [];
      if (targetYmd >= anchorDay) {
        const collidingBlock = anchorBlocks
          .filter((b) => b.startDate >= anchorDay && b.startDate < end)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        if (collidingBlock) {
          end = collidingBlock.startDate;
        }
      } else {
        const collidingBlock = anchorBlocks
          .filter((b) => b.endDate > start && b.endDate <= anchorDay)
          .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
        if (collidingBlock) {
          start = collidingBlock.endDate;
        }
      }

      if (end <= start) {
        end = addDaysYmd(start, 1);
      }

      const nights = calculateNights(start, end);

      // 2. Vertical room range calculation across orderedFilteredRooms
      const anchorIdx = orderedFilteredRooms.findIndex((r) => r.id === anchorRoom.id);
      const currentIdx = orderedFilteredRooms.findIndex((r) => r.id === room.id);

      let selectedRooms: RoomPlanRoom[] = [anchorRoom];

      if (anchorIdx !== -1 && currentIdx !== -1) {
        const minIdx = Math.min(anchorIdx, currentIdx);
        const maxIdx = Math.max(anchorIdx, currentIdx);
        const candidateRooms = orderedFilteredRooms
          .slice(minIdx, maxIdx + 1)
          .filter((cand) => {
            const cat = cand.roomTypeName || "Hạng phòng khác";
            return !collapsedCategories[cat];
          });

        // Filter out rooms that have collisions during [start, end)
        selectedRooms = candidateRooms.filter((candRoom) => {
          if (candRoom.id === anchorRoom.id) return true;
          const rBlocks = blocksByRoomId.get(candRoom.id) || [];
          const isColliding = rBlocks.some(
            (b) => b.startDate < end && b.endDate > start,
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
              currentRoom: room,
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
    [activeDragRange, blocksByRoomId, orderedFilteredRooms, collapsedCategories],
  );

  const handleAdjustDraftDays = useCallback(
    (delta: number) => {
      if (!draftSelection) return;
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
    (draft: DraftBookingSelection) => {
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
    [onOpenBulkReservation, onOpenQuickReservation, onOpenCheckIn, todayYmd],
  );

  const handleCancelDraft = useCallback(() => {
    setDraftSelection(null);
    setActiveDragRange(null);
  }, []);

  // ── Active Booking Resize Engine (Kéo dài gia hạn lưu trú & đổi ngày đặt phòng) ──
  const [activeBlockResize, setActiveBlockResize] = useState<ActiveBlockResize | null>(null);
  const activeBlockResizeRef = useRef<ActiveBlockResize | null>(null);
  activeBlockResizeRef.current = activeBlockResize;
  const isBlockResizingMovedRef = useRef<boolean>(false);

  // Extend stay mutation
  const extendStayMutation = useMutation({
    mutationFn: (vars: {
      stayId: string;
      plannedCheckOutAt: string;
      newEndDate: string;
    }) => roomPlanRepository.extendStay(hotelId, vars.stayId, vars.plannedCheckOutAt),
    onSuccess: async (_, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vietsage", "room-plan"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "staff-rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-rooms"] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vietsage", "room-plan"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "staff-rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-rooms"] }),
      ]);
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

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.('[data-cell-day="true"]') as HTMLElement | null;
      const targetDay = cell?.getAttribute("data-day-ymd");
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
        const minEnd = addDaysYmd(block.startDate, 1);
        if (candidateEnd < minEnd) {
          candidateEnd = minEnd;
        }

        // Clamp at next block's startDate on the same room
        const nextBlocks = otherBlocks
          .filter((b) => b.startDate >= block.startDate)
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
        const maxStart = addDaysYmd(block.endDate, -1);
        if (candidateStart > maxStart) {
          candidateStart = maxStart;
        }

        // Clamp at previous block's endDate on the same room
        const prevBlocks = otherBlocks
          .filter((b) => b.endDate <= block.endDate)
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
        setActiveBlockResize({
          ...current,
          currentGhostStartDay: newStart,
          currentGhostEndDay: newEnd,
          nights,
          diffNights,
          conflictWarning: warning,
        });
      }
    },
    [blocksByRoomId],
  );

  const handleGlobalBlockResizeMouseUp = useCallback(async () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handlePointerMoveBlockResize as EventListener);
    window.removeEventListener("mouseup", handleGlobalBlockResizeMouseUp as EventListener);

    const resizeData = activeBlockResizeRef.current;
    setActiveBlockResize(null);
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
        html: `
          <div class="space-y-3 pt-1 text-left">
            <div class="rounded-xl bg-slate-50 border border-slate-200/90 p-3 space-y-2">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Khách lưu trú</span>
                <strong class="text-slate-900 text-sm font-bold truncate max-w-[180px]">${escapeHtml(block.guestName)}</strong>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Hạn trả phòng</span>
                <div class="flex items-center gap-1.5 font-bold">
                  <span class="line-through text-slate-400">${block.endDate}</span>
                  <span class="text-emerald-600">➔</span>
                  <span class="text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md">${currentGhostEndDay}</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Số đêm gia hạn</span>
                <span class="font-bold text-slate-900 text-sm">+${diffNights} đêm (Tổng: ${nights} đêm)</span>
              </div>
              ${
                rate > 0 && diffNights > 0
                  ? `
                <div class="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                  <span class="font-bold text-slate-700">Tiền phòng phát sinh</span>
                  <span class="font-black text-emerald-800 text-sm">${formatVnd(additionalCost)}</span>
                </div>
              `
                  : ""
              }
            </div>
            <p class="text-xs text-slate-500 text-pretty">
              Hệ thống sẽ cập nhật trạng thái phòng thành Đang ở bình thường và ghi nhận số đêm lưu trú mới.
            </p>
          </div>
        `,
        confirmText: "Đồng ý gia hạn",
        cancelText: "Hủy",
      });

      if (confirmRes.isConfirmed) {
        extendStayMutation.mutate({
          stayId,
          plannedCheckOutAt: `${currentGhostEndDay}T12:00:00.000Z`,
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
        html: `
          <div class="space-y-3 pt-1 text-left">
            <div class="rounded-xl bg-slate-50 border border-slate-200/90 p-3 space-y-2">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Khách hàng</span>
                <strong class="text-slate-900 text-sm font-bold truncate max-w-[180px]">${escapeHtml(block.guestName)}</strong>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Ngày nhận phòng</span>
                <div class="flex items-center gap-1.5 font-bold">
                  ${
                    currentGhostStartDay !== block.startDate
                      ? `<span class="line-through text-slate-400">${block.startDate}</span>
                         <span class="text-purple-600">➔</span>
                         <span class="text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-md">${currentGhostStartDay}</span>`
                      : `<span class="text-slate-800">${block.startDate}</span>`
                  }
                </div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Ngày trả phòng</span>
                <div class="flex items-center gap-1.5 font-bold">
                  ${
                    currentGhostEndDay !== block.endDate
                      ? `<span class="line-through text-slate-400">${block.endDate}</span>
                         <span class="text-purple-600">➔</span>
                         <span class="text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-md">${currentGhostEndDay}</span>`
                      : `<span class="text-slate-800">${block.endDate}</span>`
                  }
                </div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Tổng số đêm</span>
                <span class="font-bold text-slate-900 text-sm">${nights} đêm (${diffNights >= 0 ? `+${diffNights}` : diffNights} đêm)</span>
              </div>
            </div>
            <p class="text-xs text-slate-500 text-pretty">
              Hệ thống sẽ cập nhật ngày nhận/trả phòng và đồng bộ trực tiếp lên sơ đồ buồng phòng.
            </p>
          </div>
        `,
        confirmText: "Xác nhận đổi ngày",
        cancelText: "Hủy",
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
  }, [handlePointerMoveBlockResize, extendStayMutation, updateReservationDatesMutation]);

  const handleStartBlockResize = useCallback(
    (block: RoomPlanBlock, direction: "start" | "end", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      isBlockResizingMovedRef.current = false;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const initialNights = block.nights;
      setActiveBlockResize({
        block,
        direction,
        currentGhostStartDay: block.startDate,
        currentGhostEndDay: block.endDate,
        nights: initialNights,
        initialNights,
        diffNights: 0,
        conflictWarning: null,
      });

      window.addEventListener("mousemove", handlePointerMoveBlockResize as EventListener);
      window.addEventListener("mouseup", handleGlobalBlockResizeMouseUp as EventListener);
    },
    [handlePointerMoveBlockResize, handleGlobalBlockResizeMouseUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handlePointerMoveBlockResize as EventListener);
      window.removeEventListener("mouseup", handleGlobalBlockResizeMouseUp as EventListener);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [handlePointerMoveBlockResize, handleGlobalBlockResizeMouseUp]);

  return (
    <div className="space-y-4">
      {/* ── Top Control & Filter Bar ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-4 shadow-xs">
        {/* Left: Timeline Navigation & Date Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer"
              title="Tuần trước"
              aria-label="Tuần trước"
            >
              <VsIcon name="chevron_left" className="text-lg" />
            </button>
            <button
              type="button"
              onClick={handleGoToday}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg transition cursor-pointer"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer"
              title="Tuần kế tiếp"
              aria-label="Tuần kế tiếp"
            >
              <VsIcon name="chevron_right" className="text-lg" />
            </button>
          </div>

          {hasCustomOrder && (
            <button
              type="button"
              onClick={() => resetRoomOrder(hotelId)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shadow-2xs"
              title="Khôi phục thứ tự phòng mặc định"
            >
              <VsIcon name="restart_alt" className="text-sm" />
              <span>Đặt lại thứ tự</span>
            </button>
          )}

          <div className="flex items-center gap-2 pl-2">
            <span className="text-xs sm:text-sm font-black text-slate-800">
              {dateRangeDisplay}
            </span>
            {isPlanFetching && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold animate-pulse">
                <span className="size-1.5 rounded-full bg-emerald-600" />
                Đang đồng bộ...
              </span>
            )}
          </div>
        </div>

        {/* Right: View Mode & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Week / Month Toggle */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === "week"
                  ? "bg-white text-slate-900 shadow-2xs font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                viewMode === "month"
                  ? "bg-white text-slate-900 shadow-2xs font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 ngày
            </button>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 cursor-pointer"
            >
              <option value="all">Tất cả hạng phòng</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Floor Filter */}
          {floors.length > 0 && (
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 cursor-pointer"
            >
              <option value="all">Tất cả tầng</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  Tầng {f}
                </option>
              ))}
            </select>
          )}

          {/* Quick Search */}
          <div className="relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm số phòng..."
              className="w-32 sm:w-40 rounded-xl border border-slate-200 bg-slate-50 pl-7 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-400"
            />
          </div>

          {onOpenQuickReservation && (
            <button
              type="button"
              onClick={() => onOpenQuickReservation()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-3 py-1.5 text-xs shadow-xs transition cursor-pointer"
            >
              <VsIcon name="add" className="text-sm" />
              <span>Đặt phòng nhanh</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Legend Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 px-2 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-emerald-600 border border-emerald-800" />
          <span>Đang ở (Stay)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-purple-600 border border-purple-800" />
          <span>Đặt trước (Movable)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-rose-500 border border-rose-700" />
          <span>Quá hạn trả</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-slate-400 border border-slate-600" />
          <span>Bảo trì / Khóa</span>
        </span>
        <span className="ml-auto text-slate-500 text-pretty">
          💡 Click hoặc kéo chuột ngang để chọn số đêm, kéo dọc để chọn nhiều phòng (đặt đoàn). Kéo thả thanh màu tím để đổi phòng.
        </span>
      </div>

      {/* ── Main Gantt / Tape Chart Grid Container ────────────────── */}
      <div className="relative rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {/* Main Grid View - Giữ trọn 100% chiều rộng, hỗ trợ cuộn dọc cố định tiêu đề */}
        <div className="overflow-x-auto min-w-0 max-h-[calc(100vh-210px)] overflow-y-auto">
          <div className="min-w-[800px] w-full">
            {/* Header Dates Row */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 sticky top-0 z-30 shadow-xs w-full">
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
                {daysList.map((day) => (
                  <div
                    key={day.ymd}
                    className={`flex-1 min-w-[100px] border-r border-slate-200/60 px-1 py-1.5 text-center transition ${
                      day.isToday
                        ? "bg-sky-100/60 text-sky-950 font-black ring-1 ring-inset ring-sky-300"
                        : day.isWeekend
                          ? "bg-amber-100/70 text-amber-950 font-bold"
                          : "text-slate-700"
                    }`}
                  >
                    <div
                      className={`text-xs uppercase tracking-tight ${
                        day.isToday
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
                        day.isToday
                          ? "text-sky-950"
                          : day.isWeekend
                            ? "text-amber-950"
                            : "text-slate-800"
                      }`}
                    >
                      {day.dateNum}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Categories & Rows with TanStack Table + DndKit */}
            <DndContext
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
                  blocksByRoomId={blocksByRoomId}
                  dragOverCellKey={dragOverCellKey}
                  handleDragOverCell={handleDragOverCell}
                  handleDragLeaveCell={handleDragLeaveCell}
                  handleDropOnRoom={handleDropOnRoom}
                  handleDragStart={handleDragStart}
                  setSelectedBlock={handleSelectBlock}
                  onOpenCheckIn={onOpenCheckIn}
                  isCollapsed={Boolean(collapsedCategories[categoryName])}
                  onToggleCollapse={() => toggleCategory(categoryName)}
                  draftSelection={draftSelection}
                  isDraggingRange={Boolean(activeDragRange)}
                  onStartDragRange={handleStartDragRange}
                  onHoverDragDay={handleHoverDragDay}
                  onAdjustDraftDays={handleAdjustDraftDays}
                  onConfirmDraft={handleConfirmDraft}
                  onCancelDraft={handleCancelDraft}
                  activeBlockResize={activeBlockResize}
                  onStartBlockResize={handleStartBlockResize}
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

      {/* ── Detail View: Modal (Giữa) / Bottom Sheet (Đáy) / Side Sheet (Phải) ──────── */}
      {selectedBlock && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={drawerTitleId}
          className={`fixed inset-0 z-50 ${
            detailViewMode === "modal"
              ? "flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
              : detailViewMode === "bottom"
                ? "flex items-end justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4"
                : "flex justify-end bg-black/30 backdrop-blur-xs"
          }`}
          onClick={() => setSelectedBlock(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-200 ${
              detailViewMode === "modal"
                ? "w-full max-w-2xl rounded-2xl max-h-[85vh] animate-in fade-in zoom-in-95"
                : detailViewMode === "bottom"
                  ? "w-full max-w-4xl rounded-t-2xl sm:rounded-2xl max-h-[70vh] animate-in slide-in-from-bottom"
                  : "w-80 md:w-96 h-full border-l animate-in slide-in-from-right"
            }`}
          >
            {/* Header with View Mode Switcher & Close */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 shrink-0 bg-slate-50/60">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <h3
                    id={drawerTitleId}
                    className="font-black text-base text-slate-900 truncate"
                  >
                    Phòng {selectedBlock.roomNumber}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black whitespace-nowrap ${
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
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-0.5 truncate">
                  {selectedBlock.roomTypeName || "Hạng phòng tiêu chuẩn"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* View Mode Switcher (Hướng xem khi click) */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailViewMode("modal")}
                    className={`px-2 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                      detailViewMode === "modal"
                        ? "bg-emerald-800 text-white shadow-2xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Xem dạng hộp thoại giữa màn hình (Không chèn ép bảng)"
                  >
                    <VsIcon name="crop_landscape" className="text-sm" />
                    <span className="hidden sm:inline">Giữa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailViewMode("bottom")}
                    className={`px-2 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                      detailViewMode === "bottom"
                        ? "bg-emerald-800 text-white shadow-2xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Xem dạng thanh ngang ở đáy"
                  >
                    <VsIcon name="vertical_align_bottom" className="text-sm" />
                    <span className="hidden sm:inline">Đáy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailViewMode("side")}
                    className={`px-2 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                      detailViewMode === "side"
                        ? "bg-emerald-800 text-white shadow-2xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Xem dạng thanh bên phải (Overlay nổi)"
                  >
                    <VsIcon name="dock_to_right" className="text-sm" />
                    <span className="hidden sm:inline">Phải</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBlock(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  title="Đóng chi tiết"
                  aria-label="Đóng"
                >
                  <VsIcon name="close" className="text-lg" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 pt-2 gap-4 text-xs font-bold text-slate-600 shrink-0">
              <button
                type="button"
                onClick={() => setDrawerTab("info")}
                className={`pb-2 border-b-2 transition cursor-pointer ${
                  drawerTab === "info"
                    ? "border-emerald-800 text-emerald-900 font-black"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Thông tin
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("services")}
                className={`pb-2 border-b-2 transition cursor-pointer ${
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
                className={`pb-2 border-b-2 transition cursor-pointer ${
                  drawerTab === "history"
                    ? "border-emerald-800 text-emerald-900 font-black"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Lịch sử
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {drawerTab === "info" && (
                <div
                  className={
                    detailViewMode !== "side"
                      ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                      : "space-y-4"
                  }
                >
                  {/* Left Column / Card: Guest profile & Channel */}
                  <div className="space-y-3">
                    {/* Guest Profile Card */}
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#123d2a] text-sm font-black text-white">
                          {selectedBlock.guestName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-sm text-slate-900 truncate">
                            {selectedBlock.guestName}
                          </p>
                          <p className="text-xs text-slate-500 font-medium">
                            {selectedBlock.guestCount
                              ? `${selectedBlock.guestCount} khách`
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-200/60 font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          <VsIcon name="phone" className="text-sm text-slate-400" />
                          <span>{selectedBlock.phone || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Booking identifier & channel */}
                    <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase">
                          Mã đặt phòng
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-black text-[#123d2a] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            {selectedBlock.reservationCode || "—"}
                          </span>
                          {selectedBlock.reservationCode && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(
                                  selectedBlock.reservationCode || "",
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                              title="Sao chép mã đặt phòng"
                            >
                              <VsIcon name="content_copy" className="text-xs" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="font-medium text-slate-600">Kênh đặt</span>
                        <span className="font-bold text-slate-900">
                          {getChannelBadge(selectedBlock.channel || selectedBlock.source).label}
                        </span>
                      </div>

                      {selectedBlock.notes && (
                        <div className="pt-2 border-t border-slate-100">
                          <span className="font-medium text-slate-500 block mb-0.5">Ghi chú:</span>
                          <p className="font-normal text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 text-pretty">
                            {selectedBlock.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column / Card: Dates, Nights, Rate & Status */}
                  <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="font-medium text-slate-500">Ngày nhận phòng</p>
                          <p className="font-black text-slate-900 text-sm">
                            {selectedBlock.startDate}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-slate-500">Ngày trả phòng</p>
                            {selectedBlock.endDate === todayYmd && (
                              <span className="rounded bg-amber-100 px-1 text-xs font-bold text-amber-900 whitespace-nowrap">
                                Hôm nay
                              </span>
                            )}
                          </div>
                          <p className="font-black text-slate-900 text-sm">
                            {selectedBlock.endDate}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-medium text-slate-600">Số đêm lưu trú</span>
                        <span className="font-black text-slate-900 text-sm">
                          {selectedBlock.nights} đêm
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-bold text-slate-800">Tổng tiền phòng</span>
                        <span className="font-black text-base text-[#123d2a]">
                          {formatVnd(
                            selectedBlock.nightlyRate
                              ? selectedBlock.nightlyRate * selectedBlock.nights
                              : null,
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-600">Trạng thái thanh toán</span>
                        <span
                          className={`font-bold whitespace-nowrap ${
                            selectedBlock.kind === "STAY"
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }`}
                        >
                          {selectedBlock.kind === "STAY"
                            ? "• Đã xác nhận lưu trú"
                            : "• Chờ thanh toán"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "services" && (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <VsIcon name="room_service" className="text-4xl text-slate-300 mx-auto" />
                  <p className="font-bold text-xs text-slate-700">Chưa có dịch vụ phát sinh</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto text-pretty">
                    Các dịch vụ giặt là, ăn uống, minibar phát sinh của phòng sẽ hiển thị tại đây.
                  </p>
                </div>
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
            <div className="border-t border-slate-100 p-4 flex flex-wrap items-center justify-end gap-2 bg-slate-50/70 shrink-0">
              {/* Accessible Move/Swap button */}
              {selectedBlock.movable && (
                <button
                  type="button"
                  onClick={() => handleOpenPlacementModal(selectedBlock)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold px-4 py-2 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
                >
                  <VsIcon name="swap_horiz" className="text-base" />
                  <span>Chuyển / Đổi phòng</span>
                </button>
              )}

              {selectedBlock.guestStayId && onCheckOutStay && (
                <button
                  type="button"
                  onClick={handleDrawerCheckOut}
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold px-4 py-2 text-xs shadow-xs transition active:scale-[0.98] cursor-pointer"
                >
                  <VsIcon name="logout" className="text-base" />
                  <span>Trả phòng (Check-out)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
              >
                <span>Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Accessible Placement Modal (Move / Swap Fallback) ─────── */}
      {placementModalOpen && placementSourceBlock && (
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
                      <p className="text-xs mt-0.5">Thao tác: Di chuyển phòng (MOVE).</p>
                    </div>
                  );
                }

                if (conflict.movable && conflict.reservationId) {
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 space-y-1.5">
                      <p className="font-bold">⚠️ Phòng đích đang có đơn của khách: {conflict.guestName}</p>
                      <p className="text-xs">
                        Đơn này có thể tráo đổi (SWAP). Nếu tiếp tục, khách {placementSourceBlock.guestName} sẽ chuyển sang phòng đích, và khách {conflict.guestName} sẽ chuyển về P.{placementSourceBlock.roomNumber}.
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
                    return Boolean(conflict && (!conflict.movable || !conflict.reservationId));
                  })()
                }
                onClick={() => {
                  const targetBlocks = blocksByRoomId.get(placementTargetRoomId) || [];
                  const conflict = targetBlocks.find(
                    (b) =>
                      b.startDate < placementSourceBlock.endDate &&
                      b.endDate > placementSourceBlock.startDate,
                  );

                  if (conflict && conflict.reservationId) {
                    placementMutation.mutate({
                      reservationId: placementSourceBlock.reservationId!,
                      targetRoomId: placementTargetRoomId,
                      mode: "SWAP",
                      expectedUpdatedAt: placementSourceBlock.expectedUpdatedAt,
                      swapWithReservationId: conflict.reservationId,
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
