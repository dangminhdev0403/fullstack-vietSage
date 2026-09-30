"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  useInventoryGrid,
  useUpdateAvailability,
  useUpdateRestrictions,
} from "../hooks/use-channel-manager";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import type { DayInventory } from "../types/channel-manager.types";
import { BulkUpdateModal } from "./bulk-update-modal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

interface InventoryGridProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
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

function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

function formatNumberWithDots(val: number | string): string {
  const digits = String(val).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function parseFormattedNumber(val: string): number {
  const cleaned = String(val).replace(/\D/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}

export function InventoryGrid({ hotelId, roleScope = "owner" }: InventoryGridProps) {
  const [startDate, setStartDate] = useState<string>(() =>
    formatDate(new Date()),
  );
  const [visibleDays, setVisibleDays] = useState<7 | 14>(7);
  const endDate = useMemo(
    () => addDays(startDate, visibleDays - 1),
    [startDate, visibleDays],
  );

  const { gridData, isLoading, isFetching, isError, refetch } =
    useInventoryGrid({
      hotelId,
      dateFrom: startDate,
      dateTo: endDate,
      roleScope,
    });

  // Listen for realtime booking creation and cancellation to update ARI cells immediately
  useOwnerRequestRealtime(
    hotelId,
    useMemo(
      () => ({
        onChannelBookingCreated: () => {
          void refetch();
        },
        onChannelBookingCancelled: () => {
          void refetch();
        },
      }),
      [refetch],
    ),
    { enabled: Boolean(hotelId), showConnectionToasts: false },
  );

  const { updateRestrictions, isUpdating: isUpdatingRestrictions } =
    useUpdateRestrictions({ hotelId, roleScope });
  const { updateAvailability, isUpdating: isUpdatingAvailability } =
    useUpdateAvailability({ hotelId, roleScope });

  // Active inline editing cell: `${roomTypeId}_${date}_${field}`
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Active cell being saved: `${roomTypeId}_${date}_${field}`
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const isSavingChanges =
    savingCellKey !== null || isUpdatingRestrictions || isUpdatingAvailability;

  // Bulk update modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Expanded room types
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(
    new Set(),
  );



  useEffect(() => {
    if (editingCellKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCellKey]);

  const handlePrevWeek = () => {
    setStartDate((prev) => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setStartDate((prev) => addDays(prev, 7));
  };

  const handleGoToday = () => {
    setStartDate(formatDate(new Date()));
  };

  const toggleRoomTypeCollapse = (rtId: string) => {
    setCollapsedRoomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(rtId)) {
        next.delete(rtId);
      } else {
        next.add(rtId);
      }
      return next;
    });
  };

  const roomTypes = gridData?.roomTypes ?? [];

  // Inline edit start
  const startEditing = (
    rtId: string,
    date: string,
    field: "rate" | "available",
    initialVal: number | null,
  ) => {
    const key = `${rtId}_${date}_${field}`;
    setEditingCellKey(key);
    if (field === "rate") {
      setEditingValue(initialVal === null ? "" : formatNumberWithDots(initialVal));
    } else {
      setEditingValue(initialVal === null ? "" : String(initialVal));
    }
  };

  // Inline edit commit (auto-save directly to PMS database)
  const commitEditing = async (
    rtId: string,
    date: string,
    field: "rate" | "available",
    currentVal: number | null,
  ) => {
    if (!editingCellKey) return;

    if (field === "rate" && editingValue.trim() === "") {
      setEditingCellKey(null);
      return;
    }

    const numVal =
      field === "rate"
        ? parseFormattedNumber(editingValue)
        : Number(editingValue);

    if (isNaN(numVal) || numVal < 0) {
      setEditingCellKey(null);
      return;
    }

    // Do not call API if value was unchanged
    if (currentVal !== null && numVal === currentVal) {
      setEditingCellKey(null);
      return;
    }

    const roomType = roomTypes.find((item) => item.roomTypeId === rtId);
    const day = roomType?.days.find((item) => item.date === date);
    if (!roomType || !day) {
      setEditingCellKey(null);
      return;
    }

    const cellKey = `${rtId}_${date}_${field}`;
    setSavingCellKey(cellKey);
    setEditingCellKey(null);

    try {
      if (field === "available") {
        await updateAvailability([
          {
            roomTypeId: rtId,
            date,
            available: numVal,
            totalRooms: roomType.totalRooms,
          },
        ]);
        toast.success(
          `Đã lưu tồn kho ${roomType.roomTypeCode} (${date}): ${numVal} phòng`,
          { id: `avail-${rtId}-${date}`, duration: 2000 },
        );
      } else if (field === "rate") {
        await updateRestrictions([
          {
            roomTypeId: rtId,
            date,
            rate: numVal,
            stopSell: day.stopSell,
            minStay: day.minStay,
          },
        ]);
        toast.success(
          `Đã lưu giá ${roomType.roomTypeCode} (${date}): ${formatCurrencyFull(numVal)}`,
          { id: `rate-${rtId}-${date}`, duration: 2000 },
        );
      }
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi lưu dữ liệu";
      toast.error(msg, { id: `err-${rtId}-${date}` });
    } finally {
      setSavingCellKey(null);
    }
  };

  // Inline edit cancel
  const cancelEditing = () => {
    setEditingCellKey(null);
    setEditingValue("");
  };

  // Toggle Stop Sell (auto-save directly)
  const toggleStopSell = async (rtId: string, day: DayInventory) => {
    if (isSavingChanges || isFetching) return;
    const roomType = roomTypes.find((item) => item.roomTypeId === rtId);
    if (!roomType) return;

    const cellKey = `${rtId}_${day.date}_stopsell`;
    setSavingCellKey(cellKey);

    const newStopSell = !day.stopSell;
    const effectiveRate = day.rate ?? roomType.basePrice;

    if (effectiveRate === null && newStopSell === false) {
      toast.error(
        `Hạng phòng ${roomType.roomTypeCode} chưa có giá gốc, không thể mở bán.`,
        { id: `stopsell-err-${rtId}-${day.date}` },
      );
      setSavingCellKey(null);
      return;
    }

    try {
      await updateRestrictions([
        {
          roomTypeId: rtId,
          date: day.date,
          rate: effectiveRate ?? 0,
          stopSell: newStopSell,
          minStay: day.minStay,
        },
      ]);
      toast.success(
        newStopSell
          ? `Đã đóng bán ${roomType.roomTypeCode} (${day.date})`
          : `Đã mở bán ${roomType.roomTypeCode} (${day.date})`,
        { id: `stopsell-${rtId}-${day.date}`, duration: 2000 },
      );
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật đóng/mở bán";
      toast.error(msg, { id: `stopsell-err-${rtId}-${day.date}` });
    } finally {
      setSavingCellKey(null);
    }
  };

  const daysHeader = useMemo(() => {
    const list = [];
    for (let dayOffset = 0; dayOffset < visibleDays; dayOffset++) {
      const dStr = addDays(startDate, dayOffset);
      list.push({
        dateStr: dStr,
        ...formatDayOfWeek(dStr),
        isToday: dStr === formatDate(new Date()),
      });
    }
    return list;
  }, [startDate, visibleDays]);

  return (
    <div className="min-w-0 space-y-4 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-emerald-700 [&_button]:disabled:cursor-not-allowed [&_button]:disabled:opacity-50">
      {/* Control Header Card */}
      <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
        {/* Row 1: Title, Realtime Save State, and Bulk Action */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Lịch phòng & Giá bán
              </h2>
              {isSavingChanges ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Đang lưu thay đổi...
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Khoảng thời gian: <strong className="font-semibold text-slate-800">{startDate.split("-").reverse().join("/")}</strong> đến <strong className="font-semibold text-slate-800">{endDate.split("-").reverse().join("/")}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            disabled={isSavingChanges || isLoading || isError || roomTypes.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            <VsIcon name="tune" className="text-base" />
            <span>Cập nhật hàng loạt</span>
          </button>
        </div>

        {/* Row 2: Date Navigation, Pickers & View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Week Controls */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handlePrevWeek}
                aria-label="7 ngày trước"
                title="7 ngày trước"
                disabled={isSavingChanges}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer disabled:opacity-50"
              >
                <VsIcon name="chevron_left" className="text-lg" />
              </button>
              <button
                type="button"
                onClick={handleGoToday}
                disabled={isSavingChanges}
                className="h-9 px-3 text-xs font-bold text-slate-700 hover:bg-white hover:text-slate-900 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                aria-label="7 ngày tới"
                title="7 ngày tới"
                disabled={isSavingChanges}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer disabled:opacity-50"
              >
                <VsIcon name="chevron_right" className="text-lg" />
              </button>
            </div>

            {/* Custom Date Input */}
            <div className="flex items-center gap-1.5 pl-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Từ:</span>
              <input
                type="date"
                value={startDate}
                disabled={isSavingChanges}
                onChange={(event) => {
                  if (event.target.value) setStartDate(event.target.value);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-600/30 transition cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 7 / 14 Days Toggle */}
            <div role="group" aria-label="Số ngày hiển thị" className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-0.5 shadow-2xs">
              {([7, 14] as const).map((dayCount) => (
                <button
                  key={dayCount}
                  type="button"
                  aria-pressed={visibleDays === dayCount}
                  disabled={isSavingChanges}
                  onClick={() => setVisibleDays(dayCount)}
                  className={`h-9 px-3.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    visibleDays === dayCount
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {dayCount} ngày
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching || isSavingChanges}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <VsIcon
                name="refresh"
                className={`text-sm ${isFetching ? "animate-spin text-emerald-700" : ""}`}
              />
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Guide & Status Line */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">💡 Thao tác nhanh:</span>
          <span>Nhấp trực tiếp vào ô số phòng hoặc giá để sửa (tự động lưu).</span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Mở bán
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-rose-700">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Đóng bán
            </span>
          </div>
        </div>
        <p className="sm:hidden text-slate-400">Vuốt ngang bảng để xem các ngày tiếp theo.</p>
      </div>

      {/* Grid Table Container */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {isLoading ? (
          <div role="status" className="flex min-h-80 items-center justify-center p-6 text-sm font-semibold text-slate-600">
            <VsIcon name="refresh" className="mr-2 animate-spin text-emerald-700 text-lg" />
            Đang tải phòng và giá {visibleDays} ngày…
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 bg-rose-50 p-6 text-center sm:p-12">
            <h3 className="text-lg font-bold text-rose-900">Không thể tải phòng và giá</h3>
            <p className="text-sm text-rose-800">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="min-h-10 rounded-xl bg-rose-800 px-5 text-sm font-bold text-white hover:bg-rose-900 cursor-pointer shadow-xs"
            >
              Thử lại
            </button>
          </div>
        ) : roomTypes.length === 0 ? (
          <div className="space-y-2 p-6 text-center sm:p-12">
            <h3 className="text-lg font-bold text-slate-900">Chưa có hạng phòng nào</h3>
            <p className="text-sm text-slate-500">Thêm hạng phòng tại mục Quản lý phòng để bắt đầu vận hành.</p>
          </div>
        ) : (
          <div
            role="region"
            aria-label="Lịch phòng và giá theo ngày"
            tabIndex={0}
            className="overflow-x-auto custom-scrollbar focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700"
          >
            <table className="w-full border-collapse text-left text-sm tabular-nums">
              <caption className="sr-only">
                Lịch phòng trống, giá mỗi đêm và trạng thái bán trong {visibleDays} ngày.
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-44 min-w-[176px] sm:w-56 sm:min-w-[224px] border-r border-slate-300 bg-slate-100 p-3.5 font-black text-slate-900 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]"
                  >
                    Hạng phòng
                  </th>
                  {daysHeader.map((day) => (
                    <th
                      key={day.dateStr}
                      scope="col"
                      aria-current={day.isToday ? "date" : undefined}
                      className={`min-w-[140px] border-r border-slate-200 px-3 py-2.5 text-center font-semibold last:border-r-0 ${
                        day.isToday
                          ? "border-b-2 border-b-emerald-700 bg-emerald-100/90 text-emerald-950"
                          : day.isWeekend
                            ? "border-b border-slate-300 bg-amber-100/40 text-amber-950"
                            : "border-b border-slate-300 bg-slate-100/70 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {day.isToday ? (
                          <span className="inline-block rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            Hôm nay
                          </span>
                        ) : (
                          <span className={`text-xs uppercase tracking-wider ${
                            day.isWeekend ? "font-bold text-amber-900" : "font-semibold text-slate-600"
                          }`}>
                            {day.dow}
                          </span>
                        )}
                      </div>
                      <div className={`mt-0.5 text-sm ${
                        day.isToday
                          ? "font-black text-emerald-950"
                          : day.isWeekend
                            ? "font-extrabold text-amber-950"
                            : "font-black text-slate-900"
                      }`}>
                        {day.dayNum}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {roomTypes.map((rt) => {
                const isCollapsed = collapsedRoomTypes.has(rt.roomTypeId);

                return (
                  <tbody key={rt.roomTypeId}>
                    {/* Room Type Group Header Banner */}
                    <tr className="border-y border-slate-300 bg-slate-100 hover:bg-slate-200/70 transition-colors">
                      <th scope="rowgroup" colSpan={visibleDays + 1} className="p-0 text-left">
                        <div className="sticky left-0 flex w-fit max-w-[calc(100vw-4rem)] flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 sm:max-w-none">
                          <button
                            type="button"
                            onClick={() => toggleRoomTypeCollapse(rt.roomTypeId)}
                            aria-expanded={!isCollapsed}
                            aria-label={(isCollapsed ? "Hiện chi tiết " : "Thu gọn ") + rt.roomTypeName}
                            className="flex min-h-9 items-center gap-1.5 rounded-lg text-left text-sm font-extrabold text-slate-950 hover:text-emerald-800 transition cursor-pointer"
                          >
                            <VsIcon
                              name={isCollapsed ? "expand_more" : "expand_less"}
                              className="text-base text-slate-600"
                            />
                            <span>{rt.roomTypeName}</span>
                          </button>
                          <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs">
                            {rt.totalRooms} phòng
                          </span>
                          <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
                            Giá gốc: {rt.basePrice === null ? "Chưa có" : formatCurrencyFull(rt.basePrice)}
                          </span>
                          {rt.roomTypeCode !== rt.roomTypeName && (
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{rt.roomTypeCode}
                            </span>
                          )}
                        </div>
                      </th>
                    </tr>

                    {!isCollapsed && (
                      <>
                        {/* 1. Available Rooms Row */}
                        <tr className="border-b border-slate-200 bg-white hover:bg-emerald-50/20 transition-colors">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-r border-slate-300 bg-white p-3 text-sm font-bold text-slate-800 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]"
                          >
                            <div className="flex items-center gap-2 pl-4">
                              <span className="h-2 w-2 rounded-full bg-emerald-600" />
                              <span>Phòng trống</span>
                            </div>
                          </th>
                          {rt.days.map((day) => {
                            const cellKey = rt.roomTypeId + "_" + day.date + "_available";
                            const isEditing = editingCellKey === cellKey;
                            const isSaving = savingCellKey === cellKey;
                            const value = day.available;

                            return (
                              <td key={day.date} className="border-r border-slate-200 px-2 py-1.5 text-center last:border-r-0">
                                {isEditing ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={editingValue}
                                    onChange={(event) =>
                                      setEditingValue(event.target.value.replace(/\D/g, ""))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        void commitEditing(rt.roomTypeId, day.date, "available", value);
                                      } else if (event.key === "Escape") {
                                        cancelEditing();
                                      }
                                    }}
                                    onBlur={() => void commitEditing(rt.roomTypeId, day.date, "available", value)}
                                    className="h-10 w-full min-w-0 rounded-xl border-2 border-emerald-600 bg-white text-center text-sm font-black text-slate-950 shadow-sm outline-none focus:ring-2 focus:ring-emerald-300"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isSavingChanges || isFetching}
                                    onClick={() => startEditing(rt.roomTypeId, day.date, "available", value)}
                                    title="Nhấp để sửa số phòng trống (tự động lưu)"
                                    className={`group relative min-h-10 w-full whitespace-nowrap rounded-xl px-2 py-1.5 text-sm font-bold transition-all border cursor-pointer ${
                                      isSaving
                                        ? "bg-emerald-50 text-emerald-800 animate-pulse border-emerald-300"
                                        : value === 0
                                          ? "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                                          : "bg-white text-slate-900 border-slate-200/90 hover:bg-emerald-50/70 hover:border-emerald-500 hover:text-emerald-950 hover:shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                                    }`}
                                  >
                                    {isSaving ? (
                                      <span className="text-xs font-semibold">Đang lưu...</span>
                                    ) : value === 0 ? (
                                      <span className="inline-flex items-center gap-1 font-black text-xs text-rose-700">
                                        <span>⛔</span> Hết phòng (0)
                                      </span>
                                    ) : (
                                      <span className="flex items-center justify-center gap-1">
                                        <span className="text-slate-950 font-black text-base">{value}</span>
                                        <span className="text-xs font-semibold text-slate-500">/ {rt.totalRooms}</span>
                                      </span>
                                    )}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* 2. Rates Row */}
                        <tr className="border-b border-slate-200 bg-slate-50/60 hover:bg-blue-50/20 transition-colors">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-r border-slate-300 bg-slate-50 p-3 text-sm font-bold text-slate-800 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]"
                          >
                            <div className="flex items-center gap-2 pl-4">
                              <span className="h-2 w-2 rounded-full bg-blue-600" />
                              <span>Giá / đêm</span>
                            </div>
                          </th>
                          {rt.days.map((day) => {
                            const cellKey = rt.roomTypeId + "_" + day.date + "_rate";
                            const isEditing = editingCellKey === cellKey;
                            const isSaving = savingCellKey === cellKey;
                            const value = day.rate;

                            return (
                              <td key={day.date} className="border-r border-slate-200 px-2 py-1.5 text-center last:border-r-0">
                                {isEditing ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={editingValue}
                                    placeholder="0"
                                    onChange={(event) =>
                                      setEditingValue(formatNumberWithDots(event.target.value))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        void commitEditing(rt.roomTypeId, day.date, "rate", value);
                                      } else if (event.key === "Escape") {
                                        cancelEditing();
                                      }
                                    }}
                                    onBlur={() => void commitEditing(rt.roomTypeId, day.date, "rate", value)}
                                    className="h-10 w-full min-w-0 rounded-xl border-2 border-indigo-600 bg-white text-center text-sm font-black text-indigo-950 shadow-sm outline-none focus:ring-2 focus:ring-indigo-300"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isSavingChanges || isFetching}
                                    onClick={() => startEditing(rt.roomTypeId, day.date, "rate", value)}
                                    title="Nhấp để sửa giá bán (tự động lưu)"
                                    className={`group relative min-h-10 w-full whitespace-nowrap rounded-xl px-2 py-1.5 text-sm font-bold transition-all border cursor-pointer ${
                                      isSaving
                                        ? "bg-emerald-50 text-emerald-800 animate-pulse border-emerald-300"
                                        : value === null
                                          ? "bg-slate-50/60 text-slate-400 border-dashed border-slate-300 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-900 hover:shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                                          : "bg-white text-indigo-950 border-slate-200/90 hover:bg-indigo-50/80 hover:border-indigo-500 hover:text-indigo-950 hover:shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                                    }`}
                                  >
                                    {isSaving ? (
                                      <span className="text-xs font-semibold">Đang lưu...</span>
                                    ) : value === null ? (
                                      <span className="text-xs italic font-semibold">Chưa đặt giá</span>
                                    ) : (
                                      <span className="font-black text-indigo-950 tracking-tight text-sm">
                                        {formatCurrencyFull(value)}
                                      </span>
                                    )}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* 3. Stop Sell Status Row */}
                        <tr className="border-b-2 border-slate-300 bg-white hover:bg-slate-50/50 transition-colors">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-r border-slate-300 bg-white p-3 text-sm font-bold text-slate-800 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]"
                          >
                            <div className="flex items-center gap-2 pl-4">
                              <span className="h-2 w-2 rounded-full bg-amber-600" />
                              <span>Trạng thái bán</span>
                            </div>
                          </th>
                          {rt.days.map((day) => {
                            const isSaving = savingCellKey === rt.roomTypeId + "_" + day.date + "_stopsell";

                            return (
                              <td
                                key={day.date}
                                className={`border-r border-slate-200 px-2 py-2 text-center last:border-r-0 ${
                                  day.stopSell ? "bg-rose-50/50" : ""
                                }`}
                              >
                                <div className={`mb-1.5 whitespace-nowrap text-xs font-bold inline-flex items-center gap-1 ${
                                  day.stopSell ? "text-rose-700" : "text-emerald-700"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${day.stopSell ? "bg-rose-600" : "bg-emerald-600"}`} />
                                  <span>{day.stopSell ? "Đang đóng bán" : "Đang mở bán"}</span>
                                </div>
                                <button
                                  type="button"
                                  disabled={isSavingChanges || isFetching}
                                  aria-busy={isSaving}
                                  aria-label={(day.stopSell ? "Mở bán " : "Đóng bán ") + rt.roomTypeName + ", ngày " + formatDayOfWeek(day.date).dayNum}
                                  onClick={() => void toggleStopSell(rt.roomTypeId, day)}
                                  title={day.stopSell ? "Đang đóng bán - Nhấp để mở bán" : "Đang mở bán - Nhấp để đóng bán"}
                                  className={`inline-flex min-h-8 w-full items-center justify-center rounded-lg px-2 text-xs font-bold transition-all shadow-2xs cursor-pointer border hover:scale-[1.02] active:scale-[0.98] ${
                                    isSaving
                                      ? "bg-slate-100 text-slate-500 border-slate-200 animate-pulse"
                                      : day.stopSell
                                        ? "border-emerald-600 bg-emerald-800 text-white hover:bg-emerald-900 shadow-xs"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-900"
                                  }`}
                                >
                                  {isSaving ? "Đang lưu…" : day.stopSell ? "Mở bán" : "Đóng bán"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </div>

      {isBulkModalOpen && (
        <BulkUpdateModal
          isOpen={isBulkModalOpen}
          onClose={() => {
            setIsBulkModalOpen(false);
            void refetch();
          }}
          hotelId={hotelId}
          roomTypes={roomTypes}
          defaultDateFrom={startDate}
          defaultDateTo={endDate}
          roleScope={roleScope}
        />
      )}
    </div>
  );
}
