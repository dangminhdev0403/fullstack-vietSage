"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import {
  useInventoryGrid,
  useUpdateAvailability,
  useUpdateRestrictions,
} from "../hooks/use-channel-manager";
import type {
  AvailabilityUpdateItem,
  DayInventory,
  RestrictionUpdateItem,
} from "../types/channel-manager.types";
import { BulkUpdateModal } from "./bulk-update-modal";

interface InventoryGridProps {
  hotelId: string;
}

interface CellPendingState {
  rate?: number;
  available?: number;
  stopSell?: boolean;
  minStay?: number;
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

function formatDayOfWeek(dateStr: string): { dow: string; dayNum: string; isWeekend: boolean } {
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

function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const mil = amount / 1_000_000;
    return `${mil.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `${k.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}K`;
  }
  return `${amount.toLocaleString("vi-VN")}₫`;
}

function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

export function InventoryGrid({ hotelId }: InventoryGridProps) {
  // Calendar Window: 14 days
  const [startDate, setStartDate] = useState<string>(() => formatDate(new Date()));
  const endDate = useMemo(() => addDays(startDate, 13), [startDate]);

  const { gridData, isLoading, isFetching, refetch } = useInventoryGrid({
    hotelId,
    dateFrom: startDate,
    dateTo: endDate,
  });

  const { updateRestrictions, isUpdating: isUpdatingRestrictions } =
    useUpdateRestrictions({ hotelId });
  const { updateAvailability, isUpdating: isUpdatingAvailability } =
    useUpdateAvailability({ hotelId });

  // Pending unsaved changes: Map<`${roomTypeId}_${date}`, CellPendingState>
  const [pendingChanges, setPendingChanges] = useState<Map<string, CellPendingState>>(
    new Map(),
  );

  // Active inline editing cell: `${roomTypeId}_${date}_${field}`
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Bulk update modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Expanded room types
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(new Set());

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

  // Helper to get effective day values (server + pending)
  const getEffectiveDay = (rtId: string, day: DayInventory): DayInventory => {
    const key = `${rtId}_${day.date}`;
    const pending = pendingChanges.get(key);
    if (!pending) return day;

    return {
      ...day,
      rate: pending.rate !== undefined ? pending.rate : day.rate,
      available: pending.available !== undefined ? pending.available : day.available,
      stopSell: pending.stopSell !== undefined ? pending.stopSell : day.stopSell,
      minStay: pending.minStay !== undefined ? pending.minStay : day.minStay,
    };
  };

  // Inline edit start
  const startEditing = (rtId: string, date: string, field: "rate" | "available", initialVal: number) => {
    const key = `${rtId}_${date}_${field}`;
    setEditingCellKey(key);
    setEditingValue(String(initialVal));
  };

  // Inline edit commit
  const commitEditing = (rtId: string, date: string, field: "rate" | "available") => {
    if (!editingCellKey) return;

    const numVal = Number(editingValue);
    if (isNaN(numVal) || numVal < 0) {
      setEditingCellKey(null);
      return;
    }

    const cellKey = `${rtId}_${date}`;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const current = next.get(cellKey) || {};

      if (field === "rate") {
        current.rate = numVal;
      } else if (field === "available") {
        current.available = numVal;
        if (numVal === 0) {
          current.stopSell = true;
        }
      }

      next.set(cellKey, current);
      return next;
    });

    setEditingCellKey(null);
  };

  // Inline edit cancel
  const cancelEditing = () => {
    setEditingCellKey(null);
    setEditingValue("");
  };

  // Toggle Stop Sell
  const toggleStopSell = (rtId: string, day: DayInventory) => {
    const effective = getEffectiveDay(rtId, day);
    const newStopSell = !effective.stopSell;

    const cellKey = `${rtId}_${day.date}`;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const current = next.get(cellKey) || {};
      current.stopSell = newStopSell;
      next.set(cellKey, current);
      return next;
    });
  };

  // Reset all pending changes
  const handleResetChanges = async () => {
    const confirmed = await showConfirmDialog({
      title: "Hủy các thay đổi?",
      text: "Tất cả các giá trị chỉnh sửa chưa lưu sẽ bị xóa và quay về dữ liệu hiện tại.",
      confirmText: "Đồng ý hủy",
      cancelText: "Tiếp tục chỉnh sửa",
      icon: "warning",
    });

    if (confirmed.isConfirmed) {
      setPendingChanges(new Map());
    }
  };

  // Save all pending changes
  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) return;

    const restrictionItems: RestrictionUpdateItem[] = [];
    const availabilityItems: AvailabilityUpdateItem[] = [];

    for (const [cellKey, changes] of pendingChanges.entries()) {
      const [roomTypeId, date] = cellKey.split("_");

      if (
        changes.rate !== undefined ||
        changes.stopSell !== undefined ||
        changes.minStay !== undefined
      ) {
        restrictionItems.push({
          roomTypeId,
          date,
          rate: changes.rate,
          stopSell: changes.stopSell,
          minStay: changes.minStay,
        });
      }

      if (changes.available !== undefined) {
        availabilityItems.push({
          roomTypeId,
          date,
          available: changes.available,
        });
      }
    }

    try {
      if (restrictionItems.length > 0) {
        await updateRestrictions(restrictionItems);
      }
      if (availabilityItems.length > 0) {
        await updateAvailability(availabilityItems);
      }

      setPendingChanges(new Map());
      await showSuccessAlert(
        "Lưu thay đổi thành công",
        `Đã lưu cập nhật bảng giá và kho phòng thành công cho ${pendingChanges.size} ngày/phòng.`,
      );
      void refetch();
    } catch (err) {
      await showErrorAlert("Lưu thay đổi thất bại", err);
    }
  };

  const roomTypes = gridData?.roomTypes ?? [];
  const daysHeader = useMemo(() => {
    const list = [];
    for (let i = 0; i < 14; i++) {
      const dStr = addDays(startDate, i);
      list.push({
        dateStr: dStr,
        ...formatDayOfWeek(dStr),
        isToday: dStr === formatDate(new Date()),
      });
    }
    return list;
  }, [startDate]);

  const totalPendingCount = pendingChanges.size;
  const isSaving = isUpdatingRestrictions || isUpdatingAvailability;

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Date Navigation */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={handlePrevWeek}
              title="7 ngày trước"
              className="px-3 py-1.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>◀</span>
              <span className="hidden sm:inline">Tuần trước</span>
            </button>
            <button
              type="button"
              onClick={handleGoToday}
              className="px-3.5 py-1.5 rounded-xl text-sm font-extrabold text-emerald-900 bg-white shadow-xs border border-emerald-200/50 hover:bg-emerald-50 transition-all cursor-pointer"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              title="7 ngày tới"
              className="px-3 py-1.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <span className="hidden sm:inline">Tuần tới</span>
              <span>▶</span>
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600 hidden lg:inline">
              Từ ngày:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                if (e.target.value) setStartDate(e.target.value);
              }}
              className="h-10 px-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            />
            <span className="text-xs font-semibold text-slate-500 hidden xl:inline">
              ({startDate} → {endDate})
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isFetching && !isLoading && (
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Đang đồng bộ...
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="h-10 sm:h-11 px-5 rounded-2xl bg-gradient-to-r from-emerald-800 to-[#1a352d] text-white text-sm sm:text-base font-extrabold shadow-md shadow-emerald-950/15 hover:shadow-lg hover:from-emerald-900 hover:to-emerald-950 transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>⚡</span>
            <span>Cập nhật hàng loạt</span>
          </button>
        </div>
      </div>

      {/* Main Grid Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-base font-bold text-slate-700">
              Đang tải ma trận kho phòng & bảng giá 14 ngày...
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm select-none">
              {/* Header: Dates */}
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-800">
                  <th className="sticky left-0 z-20 bg-slate-100 min-w-[220px] max-w-[240px] p-3.5 text-sm font-extrabold text-slate-900 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-between">
                      <span>Hạng phòng & Chỉ số</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                        14 ngày
                      </span>
                    </div>
                  </th>
                  {daysHeader.map((d) => (
                    <th
                      key={d.dateStr}
                      className={`min-w-[84px] p-2 text-center border-r border-slate-200 transition-colors ${
                        d.isToday
                          ? "bg-emerald-50/90 text-emerald-950 font-black border-b-2 border-b-emerald-600"
                          : d.isWeekend
                          ? "bg-amber-50/60 text-amber-950 font-bold"
                          : "text-slate-700"
                      }`}
                    >
                      <div className="text-xs uppercase tracking-wider font-extrabold opacity-80">
                        {d.dow}
                      </div>
                      <div className="text-sm font-black mt-0.5">{d.dayNum}</div>
                      {d.isToday && (
                        <div className="mt-0.5 inline-block text-[9px] font-bold px-1.5 rounded-full bg-emerald-600 text-white">
                          Hôm nay
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {roomTypes.map((rt) => {
                  const isCollapsed = collapsedRoomTypes.has(rt.roomTypeId);

                  return (
                    <ReactFragmentWrapper key={rt.roomTypeId}>
                      {/* Room Type Header Bar */}
                      <tr className="bg-gradient-to-r from-slate-100/90 via-slate-50 to-white border-y-2 border-slate-200/80">
                        <td
                          colSpan={15}
                          className="sticky left-0 z-10 p-3 sm:px-4 text-left"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => toggleRoomTypeCollapse(rt.roomTypeId)}
                                className="w-7 h-7 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                              >
                                {isCollapsed ? "＋" : "－"}
                              </button>
                              <div>
                                <span className="text-base font-extrabold text-slate-900">
                                  {rt.roomTypeName}
                                </span>
                                <span className="ml-2 px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 font-mono text-xs font-bold">
                                  {rt.roomTypeCode}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 pr-2">
                              <span>
                                Tổng quỹ:{" "}
                                <strong className="text-slate-900 font-extrabold text-sm">
                                  {rt.totalRooms}
                                </strong>{" "}
                                phòng
                              </span>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline">
                                Giá gốc:{" "}
                                <strong className="text-emerald-800 font-extrabold text-sm">
                                  {formatCurrencyFull(rt.basePrice)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Content rows (if not collapsed) */}
                      {!isCollapsed && (
                        <>
                          {/* 1. AVL (Availability) Row */}
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-slate-800">
                                  AVL (Phòng trống)
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  Kho
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const eff = getEffectiveDay(rt.roomTypeId, day);
                              const isSoldOut = eff.available === 0;
                              const isCellPending =
                                pendingChanges.get(`${rt.roomTypeId}_${day.date}`)
                                  ?.available !== undefined;
                              const isEditing =
                                editingCellKey === `${rt.roomTypeId}_${day.date}_available`;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-2 text-center border-r border-slate-200 align-middle ${
                                    isCellPending ? "bg-amber-50/70" : ""
                                  }`}
                                  onDoubleClick={() =>
                                    startEditing(
                                      rt.roomTypeId,
                                      day.date,
                                      "available",
                                      eff.available,
                                    )
                                  }
                                >
                                  {isEditing ? (
                                    <input
                                      ref={inputRef}
                                      type="number"
                                      min="0"
                                      max={rt.totalRooms}
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          commitEditing(rt.roomTypeId, day.date, "available");
                                        } else if (e.key === "Escape") {
                                          cancelEditing();
                                        }
                                      }}
                                      onBlur={() =>
                                        commitEditing(rt.roomTypeId, day.date, "available")
                                      }
                                      className="w-14 h-8 text-center text-sm font-black rounded-lg border-2 border-emerald-600 bg-white shadow-xs focus:outline-none"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        startEditing(
                                          rt.roomTypeId,
                                          day.date,
                                          "available",
                                          eff.available,
                                        )
                                      }
                                      title="Nhấn hoặc đúp chuột để chỉnh sửa tồn kho"
                                      className={`w-full py-1 px-1.5 rounded-xl text-center font-extrabold text-sm transition-all border cursor-pointer ${
                                        isSoldOut
                                          ? "bg-rose-100 text-rose-800 border-rose-200 font-black"
                                          : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                      } ${isCellPending ? "ring-2 ring-amber-400" : ""}`}
                                    >
                                      {eff.available}
                                      <span className="text-[10px] font-normal text-slate-500 ml-0.5">
                                        /{rt.totalRooms}
                                      </span>
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 2. RATE (Giá phòng) Row */}
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-emerald-950">
                                  RATE (Giá VND)
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Giá
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const eff = getEffectiveDay(rt.roomTypeId, day);
                              const isCellPending =
                                pendingChanges.get(`${rt.roomTypeId}_${day.date}`)?.rate !==
                                undefined;
                              const isEditing =
                                editingCellKey === `${rt.roomTypeId}_${day.date}_rate`;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-1.5 text-center border-r border-slate-200 align-middle ${
                                    isCellPending ? "bg-amber-50/80" : ""
                                  }`}
                                  onDoubleClick={() =>
                                    startEditing(rt.roomTypeId, day.date, "rate", eff.rate)
                                  }
                                >
                                  {isEditing ? (
                                    <div className="relative inline-block w-full">
                                      <input
                                        ref={inputRef}
                                        type="number"
                                        step="10000"
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            commitEditing(rt.roomTypeId, day.date, "rate");
                                          } else if (e.key === "Escape") {
                                            cancelEditing();
                                          }
                                        }}
                                        onBlur={() =>
                                          commitEditing(rt.roomTypeId, day.date, "rate")
                                        }
                                        className="w-full h-8 px-1 text-center text-xs font-black rounded-lg border-2 border-emerald-600 bg-white shadow-xs focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        startEditing(rt.roomTypeId, day.date, "rate", eff.rate)
                                      }
                                      title={`Giá: ${formatCurrencyFull(eff.rate)} - Nhấp để sửa`}
                                      className={`w-full py-1.5 px-1 rounded-xl text-center font-bold text-xs transition-all border cursor-pointer ${
                                        isCellPending
                                          ? "bg-amber-100 text-amber-950 border-amber-300 ring-2 ring-amber-400 font-extrabold"
                                          : "bg-white text-slate-800 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50"
                                      }`}
                                    >
                                      {formatCurrencyCompact(eff.rate)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 3. STOP SELL (Đóng bán nhanh) Row */}
                          <tr className="border-b-2 border-slate-200/80 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-slate-800">
                                  STOP SELL (Đóng bán)
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  Khóa
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const eff = getEffectiveDay(rt.roomTypeId, day);
                              const isCellPending =
                                pendingChanges.get(`${rt.roomTypeId}_${day.date}`)
                                  ?.stopSell !== undefined;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-1.5 text-center border-r border-slate-200 align-middle ${
                                    isCellPending ? "bg-amber-50/70" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleStopSell(rt.roomTypeId, day)}
                                    title={
                                      eff.stopSell
                                        ? "Đang đóng bán - Nhấp để mở bán"
                                        : "Đang mở bán - Nhấp để đóng bán"
                                    }
                                    className={`w-full py-1 px-1 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                                      eff.stopSell
                                        ? "bg-rose-600 text-white border-rose-700 shadow-2xs"
                                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-800"
                                    } ${isCellPending ? "ring-2 ring-amber-400" : ""}`}
                                  >
                                    {eff.stopSell ? "⛔ Đóng" : "Mở"}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        </>
                      )}
                    </ReactFragmentWrapper>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Bar for Unsaved Changes */}
      {totalPendingCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white px-6 py-3.5 rounded-full shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-4 animate-bounce-short">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
            <span className="text-sm font-extrabold text-slate-100">
              Có <strong className="text-amber-300 font-black">{totalPendingCount}</strong> thay
              đổi chưa lưu
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700"></div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleResetChanges}
              className="px-4 py-2 rounded-full border border-slate-600 bg-slate-800 text-xs sm:text-sm font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              Hủy thay đổi
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveChanges}
              className="px-5 py-2 rounded-full bg-emerald-600 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-emerald-900/50 hover:bg-emerald-500 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Đang lưu...
                </>
              ) : (
                "Lưu thay đổi (Save)"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Update Modal */}
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
      />
    </div>
  );
}

function ReactFragmentWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
