"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { useInventoryGrid } from "../hooks/use-channel-manager";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import { formatMoney } from "@/features/hotel-ops/utils/hotel-ops-display";

export interface RoomTimelineTapeChartProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
  canManage: boolean;
}

function getTodayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDayOfWeek(dateStr: string): {
  dow: string;
  dayNum: string;
  isWeekend: boolean;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = date.getDay();
  const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  return {
    dow: dayNames[dayIndex],
    dayNum: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    isWeekend,
  };
}

function isDateWithinRange(
  targetDateStr: string,
  startIso?: string | null,
  endIso?: string | null,
): boolean {
  if (!startIso) return false;
  const start = startIso.slice(0, 10);
  const end = endIso ? endIso.slice(0, 10) : start;
  if (start === end) {
    return targetDateStr === start;
  }
  return targetDateStr >= start && targetDateStr < end;
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return iso;
}

const DEFAULT_ROOM_CHUNK = 20;

export function RoomTimelineTapeChart({
  hotelId,
  roleScope = "owner",
  canManage,
}: RoomTimelineTapeChartProps) {
  const queryClient = useQueryClient();
  const todayStr = useMemo(() => getTodayInVietnam(), []);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [visibleDays, setVisibleDays] = useState<7 | 14 | 30>(14);

  const endDate = useMemo(
    () => addDays(startDate, visibleDays - 1),
    [startDate, visibleDays],
  );

  // Filter states
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFloor, setFilterFloor] = useState<string>("all");
  const [roomSearchQuery, setRoomSearchQuery] = useState<string>("");

  // MẶC ĐỊNH TẮT HẾT: expandedGroups rỗng nên ban đầu toàn bộ loại phòng đều thu gọn
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Giới hạn phòng hiển thị cho từng nhóm (chống nghẽn DOM khi 1 nhóm có 50 - 80 phòng)
  const [roomLimitPerGroup, setRoomLimitPerGroup] = useState<
    Record<string, number>
  >({});

  // 1. Query physical rooms
  const staffRoomsScope = useMemo(
    () => staffRoomsResource.bind({ hotelId }),
    [hotelId],
  );

  const {
    data: roomsPage,
    isLoading: isLoadingRooms,
    refetch: refetchRooms,
  } = useQuery({
    ...staffRoomsScope.queries.list.options({
      businessDate: startDate,
      limit: 100,
    }),
    enabled: Boolean(hotelId),
    staleTime: 5_000,
  });

  const physicalRooms = useMemo(() => roomsPage?.items ?? [], [roomsPage?.items]);

  // Extract distinct floors from physical rooms for floor filtering
  const availableFloors = useMemo(() => {
    const set = new Set<string>();
    for (const r of physicalRooms) {
      if (r.floor && r.floor.trim()) {
        set.add(r.floor.trim());
      }
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [physicalRooms]);

  // 2. Query aggregate ARI matrix for availability & rates
  const { gridData, isLoading: isLoadingGrid } = useInventoryGrid({
    hotelId,
    dateFrom: startDate,
    dateTo: endDate,
    roleScope,
  });

  // 3. Generate days header
  const daysHeader = useMemo(() => {
    const list = [];
    for (let dayOffset = 0; dayOffset < visibleDays; dayOffset++) {
      const dStr = addDays(startDate, dayOffset);
      const isPast = dStr < todayStr;
      list.push({
        dateStr: dStr,
        ...formatDayOfWeek(dStr),
        isToday: dStr === todayStr,
        isPast,
      });
    }
    return list;
  }, [startDate, visibleDays, todayStr]);

  // 4. Group physical rooms by RoomType, filtered by floor, type, and search query
  const roomTypeGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        roomTypeId: string;
        roomTypeName: string;
        rooms: HotelRoomSummary[];
        basePrice?: number | null;
      }
    >();

    // Seed from gridData roomTypes if available
    for (const rt of gridData?.roomTypes ?? []) {
      map.set(rt.roomTypeName, {
        roomTypeId: rt.roomTypeId,
        roomTypeName: rt.roomTypeName,
        rooms: [],
        basePrice: rt.basePrice,
      });
    }

    // Populate with physical rooms
    for (const r of physicalRooms) {
      if (filterFloor !== "all" && r.floor?.trim() !== filterFloor) {
        continue;
      }
      if (roomSearchQuery.trim()) {
        const q = roomSearchQuery.trim().toLowerCase();
        const num = (r.roomNumber || r.id).toLowerCase();
        if (!num.includes(q)) {
          continue;
        }
      }
      const typeName = r.type || "Tiêu chuẩn";
      const roomTypeId = r.roomTypeId || typeName;
      if (!map.has(typeName)) {
        map.set(typeName, {
          roomTypeId,
          roomTypeName: typeName,
          rooms: [],
          basePrice: typeof r.price === "number" ? r.price : null,
        });
      }
      map.get(typeName)!.rooms.push(r);
    }

    return Array.from(map.values())
      .filter((g) => {
        if (filterType !== "all" && g.roomTypeName !== filterType) return false;
        if (filterFloor !== "all" && g.rooms.length === 0) return false;
        if (roomSearchQuery.trim() && g.rooms.length === 0) return false;
        return true;
      })
      .sort((a, b) => a.roomTypeName.localeCompare(b.roomTypeName));
  }, [
    gridData?.roomTypes,
    physicalRooms,
    filterType,
    filterFloor,
    roomSearchQuery,
  ]);

  // Accordion toggle handlers
  const toggleExpandGroup = (roomTypeName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(roomTypeName)) {
        next.delete(roomTypeName);
      } else {
        next.add(roomTypeName);
      }
      return next;
    });
  };

  const isAllExpanded =
    roomTypeGroups.length > 0 &&
    roomTypeGroups.every((g) => expandedGroups.has(g.roomTypeName));

  const toggleAllExpand = () => {
    if (isAllExpanded) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(roomTypeGroups.map((g) => g.roomTypeName)));
    }
  };

  // Chunking handlers for large room types (> 20, 50, 80 rooms)
  const handleShowMoreRooms = (roomTypeName: string, step = 20) => {
    setRoomLimitPerGroup((prev) => ({
      ...prev,
      [roomTypeName]: (prev[roomTypeName] || DEFAULT_ROOM_CHUNK) + step,
    }));
  };

  const handleShowAllRooms = (roomTypeName: string, total: number) => {
    setRoomLimitPerGroup((prev) => ({
      ...prev,
      [roomTypeName]: total,
    }));
  };

  const handleResetRoomLimit = (roomTypeName: string) => {
    setRoomLimitPerGroup((prev) => ({
      ...prev,
      [roomTypeName]: DEFAULT_ROOM_CHUNK,
    }));
  };

  // Date navigation handlers
  const handlePrevRange = () => {
    setStartDate((prev) => addDays(prev, -visibleDays));
  };

  const handleNextRange = () => {
    setStartDate((prev) => addDays(prev, visibleDays));
  };

  const handleToday = () => {
    setStartDate(todayStr);
  };

  const isLoading = isLoadingRooms || isLoadingGrid;

  return (
    <div className="min-w-0 space-y-4">
      {/* Timeline Controls Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={handlePrevRange}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition cursor-pointer"
              title="Khoảng ngày trước"
            >
              <VsIcon name="chevron_left" className="text-lg" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs rounded-lg transition whitespace-nowrap cursor-pointer"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={handleNextRange}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition cursor-pointer"
              title="Khoảng ngày tiếp theo"
            >
              <VsIcon name="chevron_right" className="text-lg" />
            </button>
          </div>

          <span className="text-sm font-bold text-slate-800 whitespace-nowrap">
            {daysHeader[0]?.dayNum} – {daysHeader[daysHeader.length - 1]?.dayNum}
          </span>

          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              if (e.target.value) setStartDate(e.target.value);
            }}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs sm:text-sm text-slate-800 bg-white focus:border-purple-600 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Days range toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setVisibleDays(days)}
                className={`px-3 py-1 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  visibleDays === days
                    ? "bg-purple-700 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {days} ngày
              </button>
            ))}
          </div>

          {/* Floor filter */}
          {availableFloors.length > 0 && (
            <select
              value={filterFloor}
              onChange={(e) => setFilterFloor(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 bg-white cursor-pointer"
              title="Lọc theo tầng"
            >
              <option value="all">Tất cả các tầng</option>
              {availableFloors.map((fl) => (
                <option key={fl} value={fl}>
                  Tầng {fl}
                </option>
              ))}
            </select>
          )}

          {/* Room type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 bg-white cursor-pointer"
            title="Lọc theo loại phòng"
          >
            <option value="all">Tất cả loại phòng</option>
            {roomTypeGroups.map((g) => (
              <option key={g.roomTypeName} value={g.roomTypeName}>
                {g.roomTypeName} ({g.rooms.length} phòng)
              </option>
            ))}
          </select>

          {/* Quick Room Search */}
          <div className="relative">
            <VsIcon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"
            />
            <input
              type="text"
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              placeholder="Tìm số phòng..."
              className="pl-8 pr-6 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none w-28 sm:w-36 transition"
            />
            {roomSearchQuery && (
              <button
                type="button"
                onClick={() => setRoomSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <VsIcon name="close" className="text-xs" />
              </button>
            )}
          </div>

          {/* Collapse / Expand all toggle button */}
          <button
            type="button"
            onClick={toggleAllExpand}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer whitespace-nowrap shadow-2xs"
            title={
              isAllExpanded
                ? "Thu gọn tất cả để xem nhanh tổng quan"
                : "Mở rộng tất cả các loại phòng"
            }
          >
            <VsIcon
              name={isAllExpanded ? "unfold_less" : "unfold_more"}
              className="text-base text-purple-700"
            />
            <span>{isAllExpanded ? "Thu gọn tất cả" : "Mở rộng tất cả"}</span>
          </button>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-600 ring-2 ring-purple-200 inline-block shrink-0" />
            <strong className="text-purple-950 font-bold">Đặt trước</strong>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-200 inline-block shrink-0" />
            <strong className="text-emerald-950 font-bold">Đang ở</strong>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-600 ring-2 ring-sky-200 inline-block shrink-0" />
            <strong className="text-sky-950 font-bold">Đơn OTA</strong>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-rose-200 inline-block shrink-0" />
            <strong className="text-rose-950 font-bold">Quá hạn trả</strong>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500 ring-2 ring-slate-200 inline-block shrink-0" />
            <strong className="text-slate-800 font-bold">Khóa / Bảo trì</strong>
          </span>
        </div>
        <span className="text-slate-500 whitespace-nowrap">
          Click vào ô trống để xem phòng hoặc tạo đặt trước nhanh.
        </span>
      </div>

      {/* Tape Chart Table (Horizontal Scrollable) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full border-collapse text-left text-xs">
            {/* Header row: Dates */}
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 sticky top-0 z-20">
                <th className="w-48 min-w-[192px] max-w-[220px] p-3 font-bold text-slate-800 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 shadow-xs">
                  Phòng / Loại phòng
                </th>
                {daysHeader.map((d) => (
                  <th
                    key={d.dateStr}
                    className={`min-w-[70px] p-2 text-center border-r border-slate-200/80 ${
                      d.isToday
                        ? "bg-purple-50/80 text-purple-900 font-black"
                        : d.isWeekend
                          ? "bg-slate-100/70 text-slate-800 font-bold"
                          : "text-slate-700 font-semibold"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-wider text-slate-400">
                      {d.dow}
                    </span>
                    <span className="block text-xs font-bold mt-0.5">
                      {d.dayNum}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body: RoomType Groups & Physical Rooms */}
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={daysHeader.length + 1}
                    className="p-12 text-center text-slate-400"
                  >
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                    <span className="block mt-2 text-xs font-medium">
                      Đang tải sơ đồ kế hoạch phòng...
                    </span>
                  </td>
                </tr>
              ) : roomTypeGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={daysHeader.length + 1}
                    className="p-12 text-center text-slate-400"
                  >
                    Không có loại phòng nào phù hợp.
                  </td>
                </tr>
              ) : (
                roomTypeGroups.map((group) => {
                  const isGroupExpanded = roomSearchQuery.trim()
                    ? true
                    : expandedGroups.has(group.roomTypeName);

                  const roomLimit =
                    roomLimitPerGroup[group.roomTypeName] ?? DEFAULT_ROOM_CHUNK;
                  const visibleRooms = group.rooms.slice(0, roomLimit);
                  const hasMoreRooms = group.rooms.length > roomLimit;

                  return (
                    <React.Fragment key={group.roomTypeName}>
                      {/* Room Type Group Header Row (Click to Collapse/Expand) */}
                      <tr
                        onClick={() => toggleExpandGroup(group.roomTypeName)}
                        className="bg-purple-50/50 hover:bg-purple-100/60 border-t-2 border-purple-200/70 font-bold cursor-pointer transition select-none"
                        title={
                          isGroupExpanded
                            ? `Bấm để thu gọn danh sách phòng của ${group.roomTypeName}`
                            : `Bấm để mở rộng ${group.rooms.length} phòng của ${group.roomTypeName}`
                        }
                      >
                        <td className="p-2.5 border-r border-slate-200 bg-purple-50/90 hover:bg-purple-100/90 sticky left-0 z-10 shadow-xs">
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            <div className="min-w-0">
                              <span className="block text-slate-900 font-black text-xs truncate">
                                {group.roomTypeName}
                              </span>
                              <span className="block text-xs text-purple-700 font-medium whitespace-nowrap">
                                {group.rooms.length} phòng vật lý
                              </span>
                            </div>
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/80 text-purple-800 shadow-2xs shrink-0 transition-transform">
                              <VsIcon
                                name={isGroupExpanded ? "expand_less" : "expand_more"}
                                className="text-base"
                              />
                            </span>
                          </div>
                        </td>

                        {/* Day summary availability for this group */}
                        {daysHeader.map((d) => {
                          // Find matching ARI day if available
                          const gridRt = gridData?.roomTypes.find(
                            (rt) => rt.roomTypeName === group.roomTypeName,
                          );
                          const dayInfo = gridRt?.days.find(
                            (day) => day.date === d.dateStr,
                          );

                          return (
                            <td
                              key={d.dateStr}
                              className={`p-2 text-center border-r border-slate-200/80 text-xs ${
                                d.isToday ? "bg-purple-50/60" : ""
                              }`}
                            >
                              {dayInfo ? (
                                <div className="space-y-0.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded font-black text-xs ${
                                      dayInfo.available > 0
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-rose-100 text-rose-800"
                                    }`}
                                    title={`${dayInfo.available} phòng trống`}
                                  >
                                    {dayInfo.available}
                                  </span>
                                  {dayInfo.rate ? (
                                    <span className="block text-xs text-slate-500 font-medium">
                                      {Math.round(dayInfo.rate / 1000)}k
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Physical Rooms under this Group (Hidden when collapsed) */}
                      {isGroupExpanded &&
                        (group.rooms.length === 0 ? (
                          <tr>
                            <td
                              colSpan={daysHeader.length + 1}
                              className="p-3 text-center text-slate-400 italic bg-white"
                            >
                              Chưa có phòng vật lý nào phù hợp.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {visibleRooms.map((room) => (
                              <tr
                                key={room.id}
                                className="hover:bg-slate-50/70 transition group"
                              >
                                {/* Room Number & Floor Cell: Clean, NO redundant active green dot */}
                                <td className="px-3 py-2 border-r border-slate-200 bg-white group-hover:bg-slate-50 sticky left-0 z-10 shadow-xs">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="font-bold text-xs text-slate-900 whitespace-nowrap">
                                      P.{room.roomNumber || room.id}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                                      T.{room.floor || 1}
                                    </span>
                                  </div>
                                </td>

                                {/* Days Cells */}
                                {daysHeader.map((d) => {
                                  const isTodayDate = d.isToday;

                                  // Check active stay on this date
                                  const stay = room.activeStay;
                                  const isStayOverdue = Boolean(
                                    (stay as any)?.isOverdueCheckOut,
                                  );
                                  const isStayOnDate = stay
                                    ? isDateWithinRange(
                                        d.dateStr,
                                        stay.plannedCheckInAt || (isTodayDate ? d.dateStr : null),
                                        stay.plannedCheckOutAt,
                                      ) || (isTodayDate && !stay.checkedOutAt)
                                    : false;

                                  // Check upcoming / projected reservation on this date
                                  const res = room.upcomingReservation || room.projectedReservation;
                                  const isResOnDate = res
                                    ? isDateWithinRange(
                                        d.dateStr,
                                        res.plannedCheckInAt,
                                        res.plannedCheckOutAt,
                                      )
                                    : false;

                                  const isOta = Boolean(
                                    res &&
                                      (res.reservationCode?.startsWith("OTA") ||
                                        (res as any)?.channelName),
                                  );

                                  const isMaintenance =
                                    room.status === "MAINTENANCE" ||
                                    room.status === "BLOCKED";

                                  return (
                                    <td
                                      key={d.dateStr}
                                      className={`p-1 border-r border-slate-200/80 text-center relative ${
                                        isMaintenance
                                          ? "bg-slate-100/50"
                                          : isStayOnDate
                                            ? isStayOverdue
                                              ? "bg-rose-50/50"
                                              : "bg-emerald-50/50"
                                            : isResOnDate
                                              ? isOta
                                                ? "bg-sky-50/50"
                                                : "bg-purple-50/50"
                                              : d.isToday
                                                ? "bg-purple-50/25"
                                                : ""
                                      }`}
                                    >
                                      {isMaintenance ? (
                                        <div
                                          className="h-8 w-full flex items-center justify-center rounded-lg hover:bg-slate-200/60 transition cursor-default"
                                          title={`[Khóa / Bảo trì] P.${room.roomNumber || room.id}`}
                                        >
                                          <span className="h-3 w-3 rounded-full bg-slate-500 ring-2 ring-slate-200 inline-block shrink-0 shadow-2xs" />
                                        </div>
                                      ) : isStayOnDate ? (
                                        <div
                                          className={`h-8 w-full flex items-center justify-center rounded-lg transition cursor-pointer ${
                                            isStayOverdue ? "hover:bg-rose-100/80" : "hover:bg-emerald-100/80"
                                          }`}
                                          title={`[${isStayOverdue ? "Quá hạn trả" : "Đang ở"}] P.${room.roomNumber || room.id} • ${
                                            stay?.guestDisplayName || "Khách"
                                          } (${formatShortDate(stay?.plannedCheckInAt)} → ${formatShortDate(stay?.plannedCheckOutAt)})`}
                                        >
                                          <span
                                            className={`h-3 w-3 rounded-full inline-block shrink-0 shadow-2xs transition-transform hover:scale-125 ${
                                              isStayOverdue
                                                ? "bg-rose-600 ring-2 ring-rose-200"
                                                : "bg-emerald-600 ring-2 ring-emerald-200"
                                            }`}
                                          />
                                        </div>
                                      ) : isResOnDate ? (
                                        <div
                                          className={`h-8 w-full flex items-center justify-center rounded-lg transition cursor-pointer ${
                                            isOta ? "hover:bg-sky-100/80" : "hover:bg-purple-100/80"
                                          }`}
                                          title={`[${isOta ? "Đơn OTA" : "Đặt trước"}] P.${room.roomNumber || room.id} • ${
                                            res?.guestDisplayName || "Khách"
                                          } (${formatShortDate(res?.plannedCheckInAt)} → ${formatShortDate(res?.plannedCheckOutAt)})`}
                                        >
                                          <span
                                            className={`h-3 w-3 rounded-full inline-block shrink-0 shadow-2xs transition-transform hover:scale-125 ${
                                              isOta
                                                ? "bg-sky-600 ring-2 ring-sky-200"
                                                : "bg-purple-600 ring-2 ring-purple-200"
                                            }`}
                                          />
                                        </div>
                                      ) : (
                                        <div
                                          className="h-8 w-full flex items-center justify-center rounded-lg hover:bg-purple-50/60 transition cursor-pointer group/cell"
                                          title={`[Phòng trống] P.${room.roomNumber || room.id} • Ngày ${d.dayNum}`}
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full bg-slate-200/90 group-hover/cell:bg-purple-500 group-hover/cell:scale-150 transition-all inline-block shrink-0" />
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}

                            {/* Control row for large room count (> DEFAULT_ROOM_CHUNK) */}
                            {group.rooms.length > DEFAULT_ROOM_CHUNK && (
                              <tr className="bg-slate-50/90 border-t border-slate-200">
                                <td
                                  colSpan={daysHeader.length + 1}
                                  className="p-2.5 text-center bg-slate-50 sticky left-0 z-10 shadow-2xs"
                                >
                                  <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs">
                                    <span className="text-slate-600 font-semibold whitespace-nowrap">
                                      Đang hiển thị <strong>{visibleRooms.length}</strong> / {group.rooms.length} phòng ({group.roomTypeName})
                                    </span>
                                    {hasMoreRooms && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleShowMoreRooms(group.roomTypeName, 20);
                                          }}
                                          className="inline-flex items-center gap-1 font-bold text-purple-700 hover:text-purple-900 bg-white border border-purple-200 rounded-lg px-2.5 py-1 shadow-2xs hover:bg-purple-50 transition cursor-pointer whitespace-nowrap"
                                        >
                                          <VsIcon name="add" className="text-sm" />
                                          <span>Xem thêm 20 phòng</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleShowAllRooms(group.roomTypeName, group.rooms.length);
                                          }}
                                          className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs hover:bg-slate-100 transition cursor-pointer whitespace-nowrap"
                                        >
                                          <VsIcon name="list" className="text-sm" />
                                          <span>Xem tất cả ({group.rooms.length})</span>
                                        </button>
                                      </>
                                    )}
                                    {roomLimit > DEFAULT_ROOM_CHUNK && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResetRoomLimit(group.roomTypeName);
                                        }}
                                        className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer ml-1 whitespace-nowrap"
                                      >
                                        Thu gọn về {DEFAULT_ROOM_CHUNK} phòng ban đầu
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
