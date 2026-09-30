"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { showErrorAlert, SwalVietSage } from "@/libs/swal";
import { channelManagerRepository } from "../api/channel-manager.repository";
import {
  useInventoryGrid,
  useUpdateAvailability,
  useUpdateRestrictions,
} from "../hooks/use-channel-manager";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import type { DayInventory } from "../types/channel-manager.types";
import { BulkUpdateModal } from "./bulk-update-modal";

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

export function InventoryGrid({ hotelId, roleScope = "owner" }: InventoryGridProps) {
  // Calendar Window: 14 days
  const [startDate, setStartDate] = useState<string>(() =>
    formatDate(new Date()),
  );
  const endDate = useMemo(() => addDays(startDate, 13), [startDate]);

  const { gridData, isLoading, isFetching, isError, error, refetch } =
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

  // Bulk update modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Expanded room types
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(
    new Set(),
  );

  const [isPushingAri, setIsPushingAri] = useState(false);

  const handleManualPushToOta = async () => {
    try {
      setIsPushingAri(true);
      await channelManagerRepository.pushChannexAri(
        hotelId,
        { startDate, endDate },
        roleScope,
      );
      void SwalVietSage.fire({
        icon: "success",
        title: "Đã đồng bộ sang OTA",
        text: "Toàn bộ giá phòng và trạng thái đóng/mở bán trên bảng đã được đẩy sang Booking.com thành công!",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (err: unknown) {
      showErrorAlert("Đồng bộ OTA thất bại", err);
    } finally {
      setIsPushingAri(false);
    }
  };

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
    setEditingValue(initialVal === null ? "" : String(initialVal));
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

    const numVal = Number(editingValue);
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
          `Đã lưu giá ${roomType.roomTypeCode} (${date}): ${formatCurrencyCompact(numVal)}`,
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
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật đóng/mở bán";
      toast.error(msg, { id: `stopsell-err-${rtId}-${day.date}` });
    } finally {
      setSavingCellKey(null);
    }
  };

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
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50/90 px-3 py-2 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="font-extrabold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Tự động lưu PMS
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">Đổi là lưu ngay</span>
          </div>

          {isFetching && !isLoading && (
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Đang đồng bộ...
            </span>
          )}

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Làm mới ma trận giá & phòng trống"
            className="h-10 sm:h-11 px-3.5 sm:px-4 rounded-2xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={isFetching ? "animate-spin" : ""}>🔄</span>
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => void handleManualPushToOta()}
            disabled={isPushingAri || isFetching}
            title="Đẩy ngay toàn bộ giá và phòng trống trên bảng sang Booking.com qua Channex"
            className="h-10 sm:h-11 px-4 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={isPushingAri ? "animate-spin" : ""}>☁️</span>
            <span>{isPushingAri ? "Đang đẩy..." : "Đồng bộ sang OTA"}</span>
          </button>

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
        ) : isError ? (
          <div className="p-12 text-center space-y-3 bg-rose-50">
            <h3 className="text-lg font-extrabold text-rose-900">
              Không thể tải dữ liệu phòng & giá
            </h3>
            <p className="text-sm font-medium text-rose-700">
              {error instanceof Error
                ? error.message
                : "Yêu cầu tới backend thất bại"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="h-10 px-5 rounded-full bg-rose-800 text-white text-sm font-bold"
            >
              Thử lại
            </button>
          </div>
        ) : roomTypes.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <h3 className="text-lg font-extrabold text-slate-900">
              DB chưa có hạng phòng để hiển thị
            </h3>
            <p className="text-sm font-medium text-slate-500">
              Hãy tạo phòng thật, nhập hạng phòng và giá trong quản lý phòng.
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
                      <div className="text-sm font-black mt-0.5">
                        {d.dayNum}
                      </div>
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
                                onClick={() =>
                                  toggleRoomTypeCollapse(rt.roomTypeId)
                                }
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
                                  {rt.basePrice === null
                                    ? "Chưa có giá"
                                    : formatCurrencyFull(rt.basePrice)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Content rows (if not collapsed) */}
                      {!isCollapsed && (
                        <>
                          {/* 1. Room Availability Row */}
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-slate-800">
                                  Phòng trống
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  Kho phòng
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const isSoldOut = day.available === 0;
                              const isEditing =
                                editingCellKey ===
                                `${rt.roomTypeId}_${day.date}_available`;
                              const isSaving =
                                savingCellKey ===
                                `${rt.roomTypeId}_${day.date}_available`;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-2 text-center border-r border-slate-200 align-middle transition-colors ${
                                    isSaving ? "bg-emerald-50/70 animate-pulse" : ""
                                  }`}
                                  onDoubleClick={() =>
                                    startEditing(
                                      rt.roomTypeId,
                                      day.date,
                                      "available",
                                      day.available,
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
                                      onChange={(e) =>
                                        setEditingValue(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          void commitEditing(
                                            rt.roomTypeId,
                                            day.date,
                                            "available",
                                            day.available,
                                          );
                                        } else if (e.key === "Escape") {
                                          cancelEditing();
                                        }
                                      }}
                                      onBlur={() =>
                                        void commitEditing(
                                          rt.roomTypeId,
                                          day.date,
                                          "available",
                                          day.available,
                                        )
                                      }
                                      className="w-14 h-8 text-center text-sm font-black rounded-lg border-2 border-emerald-600 bg-white shadow-xs focus:outline-none"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() =>
                                        startEditing(
                                          rt.roomTypeId,
                                          day.date,
                                          "available",
                                          day.available,
                                        )
                                      }
                                      title="Nhấn để sửa tồn kho (tự động lưu)"
                                      className={`w-full py-1 px-1.5 rounded-xl text-center font-extrabold text-sm transition-all border cursor-pointer ${
                                        isSoldOut
                                          ? "bg-rose-100 text-rose-800 border-rose-200 font-black"
                                          : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                      }`}
                                    >
                                      {isSaving ? (
                                        <span className="text-xs font-bold text-emerald-700">
                                          Lưu...
                                        </span>
                                      ) : (
                                        <>
                                          {day.available}
                                          <span className="text-[10px] font-normal text-slate-500 ml-0.5">
                                            /{rt.totalRooms}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 2. Room Rate Row */}
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-emerald-950">
                                  Giá phòng
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  VND/đêm
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const isEditing =
                                editingCellKey ===
                                `${rt.roomTypeId}_${day.date}_rate`;
                              const isSaving =
                                savingCellKey ===
                                `${rt.roomTypeId}_${day.date}_rate`;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-1.5 text-center border-r border-slate-200 align-middle transition-colors ${
                                    isSaving ? "bg-emerald-50/70 animate-pulse" : ""
                                  }`}
                                  onDoubleClick={() =>
                                    startEditing(
                                      rt.roomTypeId,
                                      day.date,
                                      "rate",
                                      day.rate,
                                    )
                                  }
                                >
                                  {isEditing ? (
                                    <div className="relative inline-block w-full">
                                      <input
                                        ref={inputRef}
                                        type="number"
                                        step="10000"
                                        value={editingValue}
                                        onChange={(e) =>
                                          setEditingValue(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            void commitEditing(
                                              rt.roomTypeId,
                                              day.date,
                                              "rate",
                                              day.rate,
                                            );
                                          } else if (e.key === "Escape") {
                                            cancelEditing();
                                          }
                                        }}
                                        onBlur={() =>
                                          void commitEditing(
                                            rt.roomTypeId,
                                            day.date,
                                            "rate",
                                            day.rate,
                                          )
                                        }
                                        className="w-full h-8 px-1 text-center text-xs font-black rounded-lg border-2 border-emerald-600 bg-white shadow-xs focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() =>
                                        startEditing(
                                          rt.roomTypeId,
                                          day.date,
                                          "rate",
                                          day.rate,
                                        )
                                      }
                                      title={
                                        day.rate === null
                                          ? "Chưa có giá trong DB - Nhấp để nhập (tự động lưu)"
                                          : `Giá: ${formatCurrencyFull(day.rate)} - Nhấp để sửa (tự động lưu)`
                                      }
                                      className="w-full py-1.5 px-1 rounded-xl text-center font-bold text-xs transition-all border cursor-pointer bg-white text-slate-800 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50"
                                    >
                                      {isSaving ? (
                                        <span className="text-xs font-bold text-emerald-700">
                                          Lưu...
                                        </span>
                                      ) : day.rate === null ? (
                                        "Chưa có giá"
                                      ) : (
                                        formatCurrencyCompact(day.rate)
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 3. Stop Sell Row */}
                          <tr className="border-b-2 border-slate-200/80 hover:bg-slate-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white p-3 font-bold text-slate-800 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                              <div className="flex items-center justify-between pl-7">
                                <span className="text-sm font-extrabold text-slate-800">
                                  Đóng bán
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  Tạm dừng
                                </span>
                              </div>
                            </td>
                            {rt.days.map((day) => {
                              const isSaving =
                                savingCellKey ===
                                `${rt.roomTypeId}_${day.date}_stopsell`;

                              return (
                                <td
                                  key={day.date}
                                  className={`p-1.5 text-center border-r border-slate-200 align-middle transition-colors ${
                                    isSaving ? "bg-emerald-50/70 animate-pulse" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() =>
                                      void toggleStopSell(rt.roomTypeId, day)
                                    }
                                    title={
                                      day.stopSell
                                        ? "Đang đóng bán - Nhấp để mở bán (tự động lưu)"
                                        : "Đang mở bán - Nhấp để đóng bán (tự động lưu)"
                                    }
                                    className={`w-full py-1 px-1 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                                      day.stopSell
                                        ? "bg-rose-600 text-white border-rose-700 shadow-2xs"
                                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-800"
                                    }`}
                                  >
                                    {isSaving ? "..." : day.stopSell ? "⛔ Đóng" : "Mở"}
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
        roleScope={roleScope}
      />
    </div>
  );
}

function ReactFragmentWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
