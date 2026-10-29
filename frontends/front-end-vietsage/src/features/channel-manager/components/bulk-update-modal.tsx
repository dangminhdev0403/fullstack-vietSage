"use client";

import { useMemo, useState } from "react";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";
import { useBulkUpdateRestrictions } from "../hooks/use-channel-manager";
import type {
  BulkRateAdjustment,
  RoomTypeInventory,
} from "../types/channel-manager.types";
import { formatChannexBlockersExplanation } from "../types/channel-manager.types";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

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

function getTodayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + " ₫";
}

function countMatchingDays(
  dateFrom: string,
  dateTo: string,
  selectedDays: number[],
): number {
  if (!dateFrom || !dateTo || dateFrom > dateTo || selectedDays.length === 0) {
    return 0;
  }
  let count = 0;
  const current = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  while (current <= end) {
    const dow = current.getDay();
    if (selectedDays.includes(dow)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

interface RoomCurrentPriceInfo {
  basePrice: number | null;
  minRate: number | null;
  maxRate: number | null;
  avgRate: number | null;
  isRange: boolean;
}

function getRoomCurrentPrice(
  rt: RoomTypeInventory,
  dateFrom: string,
  dateTo: string,
  selectedDays: number[],
): RoomCurrentPriceInfo {
  const basePrice =
    rt.basePrice !== null && rt.basePrice !== undefined && Number(rt.basePrice) > 0
      ? Number(rt.basePrice)
      : null;

  const matchingDayRates = (rt.days ?? [])
    .filter((d) => {
      if (dateFrom && d.date < dateFrom) return false;
      if (dateTo && d.date > dateTo) return false;
      if (selectedDays && selectedDays.length > 0) {
        const [y, m, day] = d.date.split("-").map(Number);
        const dow = new Date(y, m - 1, day).getDay();
        if (!selectedDays.includes(dow)) return false;
      }
      return true;
    })
    .map((d) =>
      d.rate !== null && d.rate !== undefined && Number(d.rate) > 0
        ? Number(d.rate)
        : basePrice,
    )
    .filter((r): r is number => r !== null && r !== undefined && r > 0);

  if (matchingDayRates.length > 0) {
    const minRate = Math.min(...matchingDayRates);
    const maxRate = Math.max(...matchingDayRates);
    const avgRate = Math.round(
      matchingDayRates.reduce((acc, curr) => acc + curr, 0) /
        matchingDayRates.length,
    );
    return {
      basePrice,
      minRate,
      maxRate,
      avgRate,
      isRange: minRate !== maxRate,
    };
  }

  return {
    basePrice,
    minRate: basePrice,
    maxRate: basePrice,
    avgRate: basePrice,
    isRange: false,
  };
}

function calculateNewRate(
  currentRate: number,
  rateMode: "SET" | "INCREASE" | "DECREASE",
  rateInput: string,
  adjustmentKind: "FIXED" | "PERCENT",
  adjustmentValue: string,
): number {
  if (rateMode === "SET") {
    if (rateInput.trim() === "") return currentRate;
    const parsed = Number(rateInput);
    return !Number.isNaN(parsed) && parsed > 0 ? parsed : currentRate;
  }

  if (adjustmentValue.trim() === "") return currentRate;
  const adj = Number(adjustmentValue);
  if (Number.isNaN(adj) || adj <= 0) return currentRate;

  if (rateMode === "INCREASE") {
    if (adjustmentKind === "FIXED") {
      return currentRate + adj;
    }
    return Math.round(currentRate * (1 + adj / 100));
  }

  if (rateMode === "DECREASE") {
    if (adjustmentKind === "FIXED") {
      return Math.max(0, currentRate - adj);
    }
    return Math.max(0, Math.round(currentRate * (1 - adj / 100)));
  }

  return currentRate;
}

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

  const todayStr = getTodayInVietnam();
  const [dateFrom, setDateFrom] = useState(() =>
    defaultDateFrom && defaultDateFrom >= todayStr ? defaultDateFrom : todayStr,
  );
  const [dateTo, setDateTo] = useState(() =>
    defaultDateTo && defaultDateTo >= todayStr
      ? defaultDateTo
      : defaultDateTo || todayStr,
  );

  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([
    1, 2, 3, 4, 5, 6, 0,
  ]);

  type RateMode = "SET" | "INCREASE" | "DECREASE";
  type AdjustmentKind = BulkRateAdjustment["kind"];

  const [rateMode, setRateMode] = useState<RateMode>("SET");
  const [rate, setRate] = useState<string>("");
  const [adjustmentKind, setAdjustmentKind] =
    useState<AdjustmentKind>("FIXED");
  const [adjustmentValue, setAdjustmentValue] = useState<string>("");
  const [minStay, setMinStay] = useState<string>("");
  const [stopSellAction, setStopSellAction] = useState<
    "keep" | "open" | "close"
  >("keep");

  const isRoomTypeBlocked = (rt: RoomTypeInventory): boolean => {
    return (rt.channexMappingBlockers?.length ?? 0) > 0;
  };
  const eligibleRoomTypes = roomTypes.filter((rt) => !isRoomTypeBlocked(rt));
  const eligibleIds = eligibleRoomTypes.map((rt) => rt.roomTypeId);
  const areAllEligibleSelected =
    eligibleIds.length > 0 &&
    eligibleIds.every((id) => selectedRoomTypes.includes(id));

  // Tính số ngày và giá hiện tại cho từng hạng phòng
  const matchingDaysCount = useMemo(
    () => countMatchingDays(dateFrom, dateTo, selectedDays),
    [dateFrom, dateTo, selectedDays],
  );

  const roomPriceMap = useMemo(() => {
    const map = new Map<string, RoomCurrentPriceInfo>();
    for (const rt of roomTypes) {
      map.set(
        rt.roomTypeId,
        getRoomCurrentPrice(rt, dateFrom, dateTo, selectedDays),
      );
    }
    return map;
  }, [roomTypes, dateFrom, dateTo, selectedDays]);

  // Dự toán giá mới và dòng tiền cho các hạng phòng được chọn
  const selectedRoomTypePreviews = useMemo(() => {
    return selectedRoomTypes
      .map((id) => roomTypes.find((r) => r.roomTypeId === id))
      .filter((r): r is RoomTypeInventory => Boolean(r && !isRoomTypeBlocked(r)))
      .map((rt) => {
        const priceInfo = roomPriceMap.get(rt.roomTypeId) ?? {
          basePrice: null,
          minRate: null,
          maxRate: null,
          avgRate: null,
          isRange: false,
        };

        const currentRate = priceInfo.avgRate ?? priceInfo.basePrice ?? 0;
        const newRate =
          currentRate > 0
            ? calculateNewRate(
                currentRate,
                rateMode,
                rate,
                adjustmentKind,
                adjustmentValue,
              )
            : rateMode === "SET" && Number(rate) > 0
              ? Number(rate)
              : 0;

        const rateDiff = newRate - currentRate;
        const percentDiff =
          currentRate > 0 ? Math.round((rateDiff / currentRate) * 100) : 0;

        const maxCashflowOld = currentRate * rt.totalRooms;
        const maxCashflowNew = newRate * rt.totalRooms;
        const cashflowDiff = maxCashflowNew - maxCashflowOld;

        return {
          roomTypeId: rt.roomTypeId,
          roomTypeName: rt.roomTypeName,
          roomTypeCode: rt.roomTypeCode,
          totalRooms: rt.totalRooms,
          priceInfo,
          currentRate,
          newRate,
          rateDiff,
          percentDiff,
          maxCashflowOld,
          maxCashflowNew,
          cashflowDiff,
        };
      });
  }, [
    selectedRoomTypes,
    roomTypes,
    roomPriceMap,
    rateMode,
    rate,
    adjustmentKind,
    adjustmentValue,
  ]);

  const totalRoomsSelected = useMemo(
    () => selectedRoomTypePreviews.reduce((acc, p) => acc + p.totalRooms, 0),
    [selectedRoomTypePreviews],
  );

  const totalCurrentCashflowPerNight = useMemo(
    () => selectedRoomTypePreviews.reduce((acc, p) => acc + p.maxCashflowOld, 0),
    [selectedRoomTypePreviews],
  );

  const totalNewCashflowPerNight = useMemo(
    () => selectedRoomTypePreviews.reduce((acc, p) => acc + p.maxCashflowNew, 0),
    [selectedRoomTypePreviews],
  );

  const totalCashflowDiffPerNight =
    totalNewCashflowPerNight - totalCurrentCashflowPerNight;
  const totalCycleCashflow = totalNewCashflowPerNight * matchingDaysCount;

  const hasRateChange =
    (rateMode === "SET" && rate.trim() !== "" && Number(rate) > 0) ||
    (rateMode !== "SET" &&
      adjustmentValue.trim() !== "" &&
      Number(adjustmentValue) > 0);

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
    const target = roomTypes.find((r) => r.roomTypeId === rtId);
    if (!target || isRoomTypeBlocked(target)) return;
    if (selectedRoomTypes.includes(rtId)) {
      setSelectedRoomTypes(selectedRoomTypes.filter((id) => id !== rtId));
    } else {
      setSelectedRoomTypes([...selectedRoomTypes, rtId]);
    }
  };

  const selectAllRoomTypes = () => {
    if (eligibleIds.length === 0) return;
    if (areAllEligibleSelected) {
      setSelectedRoomTypes(
        selectedRoomTypes.filter((id) => !eligibleIds.includes(id)),
      );
    } else {
      setSelectedRoomTypes(
        Array.from(new Set([...selectedRoomTypes, ...eligibleIds])),
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRoomTypes.length === 0) {
      await showErrorAlert(
        "Chưa chọn hạng phòng",
        "Vui lòng chọn ít nhất một hạng phòng để cập nhật.",
      );
      return;
    }

    const validRoomTypeIds = selectedRoomTypes.filter((id) =>
      eligibleIds.includes(id),
    );
    if (validRoomTypeIds.length === 0) {
      await showErrorAlert(
        "Hạng phòng không hợp lệ",
        "Các hạng phòng đã chọn chưa liên kết OTA và không thể cập nhật.",
      );
      return;
    }

    if (!dateFrom || !dateTo) {
      await showErrorAlert(
        "Thiếu thông tin",
        "Vui lòng chọn ngày bắt đầu và kết thúc.",
      );
      return;
    }

    if (dateTo < todayStr) {
      await showErrorAlert(
        "Khoảng ngày không hợp lệ",
        "Không thể cập nhật cho những ngày đã qua trong quá khứ.",
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

    let rateNum: number | undefined = undefined;
    let adjustmentPayload: BulkRateAdjustment | undefined = undefined;

    if (rateMode === "SET") {
      if (rate.trim() !== "") {
        const parsed = Number(rate);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
          await showErrorAlert(
            "Giá không hợp lệ",
            "Mức giá phải là một số nguyên dương hợp lệ.",
          );
          return;
        }
        rateNum = parsed;
      }
    } else {
      if (adjustmentValue.trim() !== "") {
        const parsed = Number(adjustmentValue);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
          await showErrorAlert(
            "Giá trị điều chỉnh không hợp lệ",
            "Giá trị điều chỉnh phải là một số dương lớn hơn 0.",
          );
          return;
        }
        if (
          adjustmentKind === "PERCENT" &&
          parsed > 100 &&
          rateMode === "DECREASE"
        ) {
          await showErrorAlert(
            "Giá trị điều chỉnh không hợp lệ",
            "Tỷ lệ giảm giá không được vượt quá 100%.",
          );
          return;
        }
        adjustmentPayload = {
          direction: rateMode,
          kind: adjustmentKind,
          value: parsed,
        };
      }
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
      adjustmentPayload === undefined &&
      minStayNum === undefined &&
      stopSellAction === "keep"
    ) {
      await showErrorAlert(
        "Chưa nhập thay đổi",
        "Vui lòng thay đổi giá phòng, số đêm tối thiểu hoặc trạng thái bán.",
      );
      return;
    }

    const stopSellVal =
      stopSellAction === "close"
        ? true
        : stopSellAction === "open"
          ? false
          : undefined;

    const rateSummaryText =
      rateMode === "SET" && rateNum !== undefined
        ? `Đặt giá cố định ${formatVnd(rateNum)}/đêm`
        : adjustmentPayload !== undefined
          ? `${rateMode === "INCREASE" ? "Tăng" : "Giảm"} ${
              adjustmentKind === "FIXED"
                ? formatVnd(adjustmentPayload.value)
                : `${adjustmentPayload.value}%`
            } từ giá hiện có`
          : "Giữ nguyên giá phòng";

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận cập nhật hàng loạt",
      text: `Áp dụng cho ${validRoomTypeIds.length} hạng phòng (${totalRoomsSelected} phòng) từ ${dateFrom} đến ${dateTo} (${matchingDaysCount} ngày áp dụng). ${rateSummaryText}. Dòng tiền tối đa dự kiến: ${formatVnd(totalNewCashflowPerNight)}/đêm.`,
      confirmText: "Cập nhật ngay",
      cancelText: "Hủy bỏ",
      icon: "warning",
    });

    if (!confirmResult.isConfirmed) {
      return;
    }

    try {
      const res = await bulkUpdate({
        roomTypeIds: validRoomTypeIds,
        dateFrom,
        dateTo,
        daysOfWeek: selectedDays,
        ...(rateNum !== undefined ? { rate: rateNum } : {}),
        ...(adjustmentPayload !== undefined
          ? { adjustment: adjustmentPayload }
          : {}),
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
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-900 to-[#1a352d] text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-emerald-300 font-bold">
                ⚡
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-white text-balance">
                Cập Nhật Bảng Giá Hàng Loạt
              </h2>
            </div>
            <p className="text-sm font-medium text-emerald-100/90 mt-1 pl-10 text-pretty">
              Đồng bộ giá, kiểm soát dòng tiền, số đêm tối thiểu & trạng thái đóng bán đồng thời
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
                disabled={eligibleIds.length === 0}
                onClick={selectAllRoomTypes}
                className="text-sm font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
              >
                {areAllEligibleSelected
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả hạng phòng hợp lệ"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {roomTypes.map((rt) => {
                const blocked = isRoomTypeBlocked(rt);
                const isChecked =
                  !blocked && selectedRoomTypes.includes(rt.roomTypeId);
                const blockers = rt.channexMappingBlockers ?? [];
                const explanation = blocked
                  ? formatChannexBlockersExplanation(blockers)
                  : "";
                const priceInfo = roomPriceMap.get(rt.roomTypeId);
                const priceDisplay =
                  priceInfo?.avgRate !== null &&
                  priceInfo?.avgRate !== undefined &&
                  priceInfo.avgRate > 0
                    ? formatVnd(priceInfo.avgRate)
                    : "Chưa có giá";

                if (blocked) {
                  return (
                    <div
                      key={rt.roomTypeId}
                      aria-disabled={true}
                      tabIndex={-1}
                      title={`Chưa liên kết OTA: ${explanation}`}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed select-none pointer-events-none"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-600">
                          {rt.roomTypeName}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Mã: {rt.roomTypeCode} ({rt.totalRooms} phòng) • Giá: {priceDisplay}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100/90 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                          <VsIcon
                            name="link_off"
                            className="text-xs text-amber-700"
                          />
                          <span>Chưa liên kết OTA ({explanation})</span>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center border border-slate-200 bg-slate-100 text-slate-400">
                        <VsIcon name="block" className="text-xs" />
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={rt.roomTypeId}
                    type="button"
                    onClick={() => toggleRoomType(rt.roomTypeId)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isChecked
                        ? "bg-emerald-50/80 border-emerald-500 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-400/30"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {rt.roomTypeName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Mã: {rt.roomTypeCode} ({rt.totalRooms} phòng)
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">Giá hiện có:</span>
                        <span className="font-extrabold text-emerald-800">
                          {priceDisplay}
                        </span>
                        {priceInfo?.isRange && (
                          <span className="text-slate-400 text-xs font-normal">
                            ({formatVnd(priceInfo.minRate ?? 0)} - {formatVnd(priceInfo.maxRate ?? 0)})
                          </span>
                        )}
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
              <p className="text-xs font-semibold text-rose-600 italic">
                * Vui lòng chọn ít nhất một hạng phòng hợp lệ để áp dụng.
              </p>
            )}
            {eligibleIds.length === 0 && (
              <p className="text-xs font-semibold text-amber-700">
                Tất cả hạng phòng đều chưa liên kết OTA. Không thể thực hiện cập
                nhật hàng loạt.
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
                  min={todayStr}
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
                  min={dateFrom || todayStr}
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
              <div className="flex items-center gap-2">
                <label className="text-base font-bold text-slate-900">
                  3. Các ngày trong tuần
                </label>
                <span className="text-xs font-semibold text-slate-500">
                  ({matchingDaysCount} ngày được chọn)
                </span>
              </div>
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
          <div className="space-y-5 pt-3 border-t border-slate-100">
            <label className="text-base font-bold text-slate-900 block text-balance">
              4. Giá trị thiết lập mới & Kiểm soát dòng tiền
            </label>

            {/* Rate Mode Control */}
            <fieldset disabled={isBulkUpdating} className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">
                Lựa chọn phương thức điều chỉnh giá
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-emerald-700 [&_button]:disabled:opacity-50">
                <button
                  type="button"
                  aria-pressed={rateMode === "SET"}
                  onClick={() => setRateMode("SET")}
                  className={
                    "min-h-12 rounded-2xl border px-3.5 py-2.5 text-left transition-all " +
                    (rateMode === "SET"
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-md shadow-emerald-700/20"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  <div className="text-sm font-extrabold flex items-center gap-1.5">
                    <span>🎯</span>
                    <span>Cài giá mới cố định</span>
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      rateMode === "SET" ? "text-emerald-100" : "text-slate-500"
                    }`}
                  >
                    Áp dụng chung 1 mức giá cụ thể
                  </div>
                </button>
                <button
                  type="button"
                  aria-pressed={rateMode === "INCREASE"}
                  onClick={() => setRateMode("INCREASE")}
                  className={
                    "min-h-12 rounded-2xl border px-3.5 py-2.5 text-left transition-all " +
                    (rateMode === "INCREASE"
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-md shadow-emerald-700/20"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  <div className="text-sm font-extrabold flex items-center gap-1.5">
                    <span>📈</span>
                    <span>Tăng từ giá hiện có</span>
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      rateMode === "INCREASE" ? "text-emerald-100" : "text-slate-500"
                    }`}
                  >
                    Cộng thêm số tiền hoặc %
                  </div>
                </button>
                <button
                  type="button"
                  aria-pressed={rateMode === "DECREASE"}
                  onClick={() => setRateMode("DECREASE")}
                  className={
                    "min-h-12 rounded-2xl border px-3.5 py-2.5 text-left transition-all " +
                    (rateMode === "DECREASE"
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-md shadow-emerald-700/20"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  <div className="text-sm font-extrabold flex items-center gap-1.5">
                    <span>📉</span>
                    <span>Giảm từ giá hiện có</span>
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      rateMode === "DECREASE" ? "text-emerald-100" : "text-slate-500"
                    }`}
                  >
                    Trừ bớt số tiền hoặc %
                  </div>
                </button>
              </div>
            </fieldset>

            {/* Absolute Rate Input */}
            {rateMode === "SET" && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="bulk-rate-input"
                    className="text-sm font-bold text-slate-800"
                  >
                    Mức giá mới cố định (VND / đêm)
                  </label>
                  {rate && Number(rate) > 0 && (
                    <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                      {formatVnd(Number(rate))}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="bulk-rate-input"
                    type="number"
                    step="10000"
                    placeholder="Để trống nếu không muốn đổi giá"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full h-11 pl-4 pr-14 rounded-2xl border border-slate-300 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    VND
                  </span>
                </div>
                <p className="text-xs text-slate-500 text-pretty">
                  Mức giá cố định này sẽ ghi đè giá bán của tất cả các hạng phòng và ngày được chọn.
                </p>
              </div>
            )}

            {/* Relative Adjustment Controls */}
            {rateMode !== "SET" && (
              <div className="space-y-3.5 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40">
                <div>
                  <span className="block text-sm font-bold text-slate-800 mb-1.5">
                    Hình thức {rateMode === "INCREASE" ? "tăng giá" : "giảm giá"}
                  </span>
                  <div className="grid grid-cols-2 gap-2.5 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-emerald-700 [&_button]:disabled:opacity-50">
                    <button
                      type="button"
                      aria-pressed={adjustmentKind === "FIXED"}
                      onClick={() => setAdjustmentKind("FIXED")}
                      className={
                        "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all " +
                        (adjustmentKind === "FIXED"
                          ? "border-emerald-700 bg-emerald-700 text-white shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                      }
                    >
                      💰 Số tiền cố định (VND)
                    </button>
                    <button
                      type="button"
                      aria-pressed={adjustmentKind === "PERCENT"}
                      onClick={() => setAdjustmentKind("PERCENT")}
                      className={
                        "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all " +
                        (adjustmentKind === "PERCENT"
                          ? "border-emerald-700 bg-emerald-700 text-white shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                      }
                    >
                      📊 Phần trăm (%) từ giá hiện có
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="bulk-adjustment-input"
                      className="text-sm font-bold text-slate-800"
                    >
                      Mức {rateMode === "INCREASE" ? "tăng thêm" : "giảm bớt"}{" "}
                      {adjustmentKind === "FIXED" ? "(VND / đêm)" : "(%)"}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="bulk-adjustment-input"
                      type="number"
                      step={adjustmentKind === "FIXED" ? "10000" : "1"}
                      min="1"
                      max={
                        adjustmentKind === "PERCENT" && rateMode === "DECREASE"
                          ? "100"
                          : undefined
                      }
                      placeholder={
                        adjustmentKind === "FIXED"
                          ? "Ví dụ: 50.000 (để trống nếu không đổi)"
                          : "Ví dụ: 10 (để trống nếu không đổi)"
                      }
                      value={adjustmentValue}
                      onChange={(e) => setAdjustmentValue(e.target.value)}
                      className="w-full h-11 pl-4 pr-16 rounded-2xl border border-slate-300 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                      {adjustmentKind === "FIXED" ? "VND" : "%"}
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-slate-500 mr-1">
                    Gợi ý nhanh:
                  </span>
                  {adjustmentKind === "FIXED" ? (
                    <>
                      {[20000, 50000, 100000, 200000, 500000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdjustmentValue(amt.toString())}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          {rateMode === "INCREASE" ? "+" : "-"}
                          {formatVnd(amt)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {[5, 10, 15, 20, 30].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setAdjustmentValue(pct.toString())}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          {rateMode === "INCREASE" ? "+" : "-"}
                          {pct}%
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* BẢNG ĐỐI SOÁT GIÁ MỚI & KIỂM SOÁT DÒNG TIỀN */}
            {selectedRoomTypes.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-700 text-white text-xs font-bold">
                      ₫
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 text-balance">
                        Đối soát giá mới & Kiểm soát dòng tiền
                      </h4>
                      <p className="text-xs text-slate-500 text-pretty">
                        Dự toán giá sau điều chỉnh và dòng tiền tiềm năng ({matchingDaysCount} ngày áp dụng)
                      </p>
                    </div>
                  </div>
                  {hasRateChange && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                      {rateMode === "SET"
                        ? `Cài giá mới: ${formatVnd(Number(rate))}`
                        : rateMode === "INCREASE"
                          ? `Tăng +${
                              adjustmentKind === "FIXED"
                                ? formatVnd(Number(adjustmentValue))
                                : `${adjustmentValue}%`
                            }`
                          : `Giảm -${
                              adjustmentKind === "FIXED"
                                ? formatVnd(Number(adjustmentValue))
                                : `${adjustmentValue}%`
                            }`}
                    </span>
                  )}
                </div>

                {/* Table of selected rooms */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold">
                        <th className="py-2.5 px-3 whitespace-nowrap">Hạng phòng</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">
                          Giá hiện có
                        </th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">
                          Điều chỉnh
                        </th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">
                          Giá mới áp dụng
                        </th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">
                          Dòng tiền tối đa / đêm
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRoomTypePreviews.map((item) => {
                        const isModified = item.rateDiff !== 0;
                        const isIncrease = item.rateDiff > 0;

                        return (
                          <tr
                            key={item.roomTypeId}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">
                                {item.roomTypeName}
                              </div>
                              <div className="text-slate-500 text-xs">
                                {item.totalRooms} phòng
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-600 whitespace-nowrap">
                              {item.currentRate > 0
                                ? formatVnd(item.currentRate)
                                : "Chưa có"}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {isModified ? (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs whitespace-nowrap ${
                                    isIncrease
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {isIncrease ? "+" : ""}
                                  {formatVnd(item.rateDiff)} ({item.percentDiff > 0 ? "+" : ""}
                                  {item.percentDiff}%)
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">
                                  Giữ nguyên
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-emerald-800 text-sm whitespace-nowrap">
                              {item.newRate > 0 ? formatVnd(item.newRate) : "Chưa có"}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                {formatVnd(item.maxCashflowNew)}
                              </div>
                              {item.cashflowDiff !== 0 && (
                                <div
                                  className={`text-xs font-semibold ${
                                    item.cashflowDiff > 0
                                      ? "text-emerald-700"
                                      : "text-rose-600"
                                  }`}
                                >
                                  {item.cashflowDiff > 0 ? "+" : ""}
                                  {formatVnd(item.cashflowDiff)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Cashflow Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                    <span className="block text-slate-500 text-xs font-medium">
                      Tổng phòng áp dụng
                    </span>
                    <span className="text-base font-extrabold text-slate-900">
                      {totalRoomsSelected} phòng
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-emerald-200 shadow-2xs">
                    <span className="block text-slate-500 text-xs font-medium">
                      Dòng tiền tối đa / đêm
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-extrabold text-emerald-800">
                        {formatVnd(totalNewCashflowPerNight)}
                      </span>
                      {totalCashflowDiffPerNight !== 0 && (
                        <span
                          className={`text-xs font-bold ${
                            totalCashflowDiffPerNight > 0
                              ? "text-emerald-700"
                              : "text-rose-600"
                          }`}
                        >
                          ({totalCashflowDiffPerNight > 0 ? "+" : ""}
                          {formatVnd(totalCashflowDiffPerNight)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-teal-200 shadow-2xs">
                    <span className="block text-slate-500 text-xs font-medium">
                      Dòng tiền chu kỳ ({matchingDaysCount} ngày)
                    </span>
                    <span className="text-base font-extrabold text-teal-900">
                      {formatVnd(totalCycleCashflow)}
                    </span>
                  </div>
                </div>
              </div>
            )}

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

            <fieldset disabled={isBulkUpdating}>
              <legend className="mb-2 text-base font-semibold text-slate-700">
                Trạng thái bán
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-emerald-700 [&_button]:disabled:opacity-50">
                <button
                  type="button"
                  aria-pressed={stopSellAction === "keep"}
                  onClick={() => setStopSellAction("keep")}
                  className={
                    "min-h-11 rounded-lg border px-3 py-2 text-base font-semibold " +
                    (stopSellAction === "keep"
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  Giữ nguyên
                </button>
                <button
                  type="button"
                  aria-pressed={stopSellAction === "open"}
                  onClick={() => setStopSellAction("open")}
                  className={
                    "min-h-11 rounded-lg border px-3 py-2 text-base font-semibold " +
                    (stopSellAction === "open"
                      ? "border-emerald-800 bg-emerald-800 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  Mở bán
                </button>
                <button
                  type="button"
                  aria-pressed={stopSellAction === "close"}
                  onClick={() => setStopSellAction("close")}
                  className={
                    "min-h-11 rounded-lg border px-3 py-2 text-base font-semibold " +
                    (stopSellAction === "close"
                      ? "border-rose-800 bg-rose-800 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  Đóng bán
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Chỉ áp dụng cho hạng phòng và ngày đã chọn khi bấm Áp dụng cập
                nhật.
              </p>
            </fieldset>
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
