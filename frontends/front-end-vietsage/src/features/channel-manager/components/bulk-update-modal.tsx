"use client";

import { useState } from "react";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useBulkUpdateRestrictions } from "../hooks/use-channel-manager";
import type { RoomTypeInventory } from "../types/channel-manager.types";

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  roomTypes: RoomTypeInventory[];
  defaultDateFrom?: string;
  defaultDateTo?: string;
  roleScope?: "owner" | "admin";
}

const DAYS_OF_WEEK = [
  { value: 1, label: "T2", fullName: "Thứ Hai" },
  { value: 2, label: "T3", fullName: "Thứ Ba" },
  { value: 3, label: "T4", fullName: "Thứ Tư" },
  { value: 4, label: "T5", fullName: "Thứ Năm" },
  { value: 5, label: "T6", fullName: "Thứ Sáu" },
  { value: 6, label: "T7", fullName: "Thứ Bảy" },
  { value: 0, label: "CN", fullName: "Chủ Nhật" },
];

export function BulkUpdateModal({
  isOpen,
  onClose,
  hotelId,
  roomTypes,
  defaultDateFrom,
  defaultDateTo,
  roleScope = "owner",
}: BulkUpdateModalProps) {
  const { bulkUpdate, isBulkUpdating } = useBulkUpdateRestrictions({
    hotelId,
    roleScope,
  });

  const [dateFrom, setDateFrom] = useState(
    () => defaultDateFrom || new Date().toISOString().split("T")[0],
  );
  const [dateTo, setDateTo] = useState(
    () =>
      defaultDateTo ||
      new Date(Date.now() + 13 * 86400000).toISOString().split("T")[0],
  );

  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([
    1, 2, 3, 4, 5, 6, 0,
  ]);

  const [rate, setRate] = useState<string>("");
  const [minStay, setMinStay] = useState<string>("");
  const [stopSellAction, setStopSellAction] = useState<
    "keep" | "open" | "close"
  >("keep");

  if (!isOpen) return null;

  const toggleDay = (dayVal: number) => {
    if (selectedDays.includes(dayVal)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayVal));
    } else {
      setSelectedDays([...selectedDays, dayVal]);
    }
  };

  const setDaysPreset = (preset: "all" | "weekdays" | "weekends") => {
    if (preset === "all") {
      setSelectedDays([1, 2, 3, 4, 5, 6, 0]);
    } else if (preset === "weekdays") {
      setSelectedDays([1, 2, 3, 4, 5]);
    } else {
      setSelectedDays([6, 0]);
    }
  };

  const toggleRoomType = (rtId: string) => {
    if (selectedRoomTypes.includes(rtId)) {
      setSelectedRoomTypes(selectedRoomTypes.filter((id) => id !== rtId));
    } else {
      setSelectedRoomTypes([...selectedRoomTypes, rtId]);
    }
  };

  const selectAllRoomTypes = () => {
    if (selectedRoomTypes.length === roomTypes.length) {
      setSelectedRoomTypes([]);
    } else {
      setSelectedRoomTypes(roomTypes.map((rt) => rt.roomTypeId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dateFrom || !dateTo) {
      await showErrorAlert(
        "Thiếu thông tin",
        "Vui lòng chọn ngày bắt đầu và kết thúc.",
      );
      return;
    }

    if (new Date(dateFrom) > new Date(dateTo)) {
      await showErrorAlert(
        "Lỗi ngày tháng",
        "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      );
      return;
    }

    if (selectedDays.length === 0) {
      await showErrorAlert(
        "Thiếu thứ trong tuần",
        "Vui lòng chọn ít nhất một thứ trong tuần cần áp dụng.",
      );
      return;
    }

    const rateNum = rate ? Number(rate) : undefined;
    if (rate && (isNaN(Number(rate)) || Number(rate) < 0)) {
      await showErrorAlert(
        "Giá không hợp lệ",
        "Mức giá phải là một số nguyên dương hợp lệ.",
      );
      return;
    }

    const minStayNum = minStay ? Number(minStay) : undefined;
    if (minStay && (isNaN(Number(minStay)) || Number(minStay) < 1)) {
      await showErrorAlert(
        "Số đêm không hợp lệ",
        "Số đêm tối thiểu phải từ 1 trở lên.",
      );
      return;
    }

    if (
      rateNum === undefined &&
      minStayNum === undefined &&
      stopSellAction === "keep"
    ) {
      await showErrorAlert(
        "Chưa nhập thay đổi",
        "Vui lòng nhập ít nhất một giá trị cần cập nhật (Giá phòng, Số đêm tối thiểu hoặc Đóng bán).",
      );
      return;
    }

    const stopSellVal =
      stopSellAction === "close"
        ? true
        : stopSellAction === "open"
          ? false
          : undefined;

    try {
      const res = await bulkUpdate({
        roomTypeIds:
          selectedRoomTypes.length > 0
            ? selectedRoomTypes
            : roomTypes.map((roomType) => roomType.roomTypeId),
        dateFrom,
        dateTo,
        daysOfWeek: selectedDays,
        rate: rateNum,
        minStay: minStayNum,
        stopSell: stopSellVal,
      });

      await showSuccessAlert(
        "Cập nhật thành công",
        res.message || `Đã áp dụng cập nhật cho ${res.affectedCells} ô lịch.`,
      );
      onClose();
    } catch (err) {
      await showErrorAlert("Cập nhật thất bại", err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-900 to-[#1a352d] text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-emerald-300 font-bold">
                ⚡
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                Cập Nhật Bảng Giá Hàng Loạt
              </h2>
            </div>
            <p className="text-sm font-medium text-emerald-100/90 mt-1 pl-10">
              Đồng bộ giá, số đêm tối thiểu & trạng thái đóng bán đồng thời cho
              nhiều ngày
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng modal"
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {/* Room types selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-base font-bold text-slate-900">
                1. Hạng phòng áp dụng
              </label>
              <button
                type="button"
                onClick={selectAllRoomTypes}
                className="text-sm font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
              >
                {selectedRoomTypes.length === roomTypes.length
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả hạng phòng"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {roomTypes.map((rt) => {
                const isChecked = selectedRoomTypes.includes(rt.roomTypeId);
                return (
                  <button
                    key={rt.roomTypeId}
                    type="button"
                    onClick={() => toggleRoomType(rt.roomTypeId)}
                    className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                      isChecked
                        ? "bg-emerald-50/80 border-emerald-500 text-emerald-950 font-bold shadow-xs"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                    }`}
                  >
                    <div>
                      <div className="text-sm">{rt.roomTypeName}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        Mã: {rt.roomTypeCode} ({rt.totalRooms} phòng)
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                        isChecked
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isChecked && (
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedRoomTypes.length === 0 && (
              <p className="text-xs font-semibold text-slate-500 italic">
                * Chưa chọn hạng phòng nào (Mặc định áp dụng cho tất cả các hạng
                phòng)
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-base font-bold text-slate-900">
              2. Khoảng thời gian áp dụng
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-sm font-semibold text-slate-700 mb-1">
                  Từ ngày
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <div>
                <span className="block text-sm font-semibold text-slate-700 mb-1">
                  Đến ngày
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>
          </div>

          {/* Day of Week */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-base font-bold text-slate-900">
                3. Các ngày trong tuần
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDaysPreset("all")}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setDaysPreset("weekdays")}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  T2 - T6
                </button>
                <button
                  type="button"
                  onClick={() => setDaysPreset("weekends")}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors"
                >
                  T7 & CN
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2 pt-1">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = selectedDays.includes(day.value);
                const isWeekend = day.value === 6 || day.value === 0;
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`h-11 rounded-2xl flex flex-col items-center justify-center font-bold text-sm transition-all border ${
                      isSelected
                        ? isWeekend
                          ? "bg-amber-500 border-amber-600 text-white shadow-xs"
                          : "bg-emerald-700 border-emerald-800 text-white shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>{day.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* New values to apply */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <label className="text-base font-bold text-slate-900 block">
              4. Giá trị thiết lập mới
            </label>

            {/* Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">
                  Mức giá mới (VND / đêm)
                </span>
                {rate && Number(rate) > 0 && (
                  <span className="text-xs font-bold text-emerald-700">
                    {new Intl.NumberFormat("vi-VN").format(Number(rate))} ₫
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="10000"
                  placeholder="Để trống nếu không muốn đổi giá"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full h-11 pl-4 pr-12 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  VND
                </span>
              </div>
            </div>

            {/* Min stay */}
            <div>
              <span className="block text-sm font-semibold text-slate-700 mb-1">
                Số đêm lưu trú tối thiểu
              </span>
              <input
                type="number"
                min="1"
                placeholder="Để trống nếu không đổi (Mặc định 1 đêm)"
                value={minStay}
                onChange={(e) => setMinStay(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Stop Sell Options */}
            <div>
              <span className="block text-sm font-semibold text-slate-700 mb-2">
                Trạng thái đóng/mở bán
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStopSellAction("keep")}
                  className={`py-2.5 px-3 rounded-2xl border text-sm font-bold transition-all ${
                    stopSellAction === "keep"
                      ? "bg-slate-800 border-slate-900 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Giữ nguyên
                </button>
                <button
                  type="button"
                  onClick={() => setStopSellAction("open")}
                  className={`py-2.5 px-3 rounded-2xl border text-sm font-bold transition-all ${
                    stopSellAction === "open"
                      ? "bg-emerald-600 border-emerald-700 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  🟢 Mở bán
                </button>
                <button
                  type="button"
                  onClick={() => setStopSellAction("close")}
                  className={`py-2.5 px-3 rounded-2xl border text-sm font-bold transition-all ${
                    stopSellAction === "close"
                      ? "bg-rose-600 border-rose-700 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  ⛔ Đóng bán
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isBulkUpdating}
              className="h-11 px-6 rounded-full border border-slate-300 bg-white text-base font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isBulkUpdating}
              className="h-11 px-7 rounded-full bg-[#25483f] text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 hover:bg-[#1a352d] transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isBulkUpdating ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                  Đang xử lý...
                </>
              ) : (
                "Áp dụng cập nhật"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
