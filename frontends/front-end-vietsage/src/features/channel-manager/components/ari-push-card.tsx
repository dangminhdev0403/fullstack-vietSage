"use client";

import { useId, useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex } from "../hooks/use-channel-manager";

interface AriPushCardProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
}

interface LastSyncInfo {
  timestamp: string;
  message: string;
  matched: boolean;
  dateRange: string;
}

function todayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, "0");
  const nextD = String(date.getDate()).padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

const PRESET_OPTIONS = [
  { id: "today", label: "Hôm nay", days: 0 },
  { id: "7d", label: "7 ngày tới", days: 6 },
  { id: "14d", label: "14 ngày (theo bảng)", days: 13 },
  { id: "30d", label: "30 ngày tới", days: 29 },
] as const;

export function AriPushCard({
  hotelId,
  roleScope = "owner",
}: AriPushCardProps) {
  const { pushAri } = useChannex(hotelId, roleScope, {
    loadMappings: false,
    loadConfig: false,
    loadSimulatedBookings: false,
  });

  const startDateInputId = useId();
  const endDateInputId = useId();

  const today = useMemo(() => todayInVietnam(), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>("today");
  const [lastSync, setLastSync] = useState<LastSyncInfo | null>(null);

  const handleSelectPreset = (presetId: string, days: number) => {
    setActivePreset(presetId);
    setStartDate(today);
    if (days === 0) {
      setEndDate("");
    } else {
      setEndDate(addDaysToDateString(today, days));
    }
  };

  const handlePush = async () => {
    if (!startDate) {
      await showErrorAlert(
        "Thiếu ngày bắt đầu",
        "Vui lòng chọn ngày bắt đầu đồng bộ.",
      );
      return;
    }
    if (endDate && endDate < startDate) {
      await showErrorAlert(
        "Khoảng ngày không hợp lệ",
        "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
      );
      return;
    }

    try {
      const result = await pushAri.mutateAsync({
        startDate,
        endDate: endDate || undefined,
      });

      const readbackMatched =
        Boolean(result.readbackVerified?.availabilityMatch) &&
        Boolean(result.readbackVerified?.restrictionsMatch);

      const range =
        result.startDate && result.endDate
          ? `${result.startDate} → ${result.endDate}`
          : result.startDate || startDate;

      const summary = `Đã gửi ${result.availabilityPushedCount ?? 0} dải phòng trống và ${result.restrictionsPushedCount ?? 0} dải giá (${range}).`;
      const conversionNote = result.rateConversionApplied
        ? ` Giá đã quy đổi ${result.sourceCurrency} → ${result.targetCurrency} bằng tỷ giá staging đã cấu hình.`
        : "";

      const nowStr = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date());

      setLastSync({
        timestamp: nowStr,
        message: summary,
        matched: readbackMatched,
        dateRange: range,
      });

      if (!readbackMatched) {
        await showErrorAlert(
          "Đã gửi nhưng đối soát chưa khớp",
          `${summary}${conversionNote} Dữ liệu đọc lại từ Channex chưa khớp hoàn toàn. Vui lòng kiểm tra lại kết nối hoặc chạy kiểm tra trong Sandbox.`,
        );
        return;
      }

      await showSuccessAlert(
        "Đồng bộ OTA thành công",
        `${summary}${conversionNote} Dữ liệu đọc lại từ Channex đã khớp hoàn toàn.`,
      );
    } catch (error: unknown) {
      await showErrorAlert("Không thể đồng bộ giá và quỹ phòng", error);
    }
  };

  return (
    <section
      id="ari-push-section"
      data-ui="ari-push-card"
      className="rounded-2xl border border-[#e5ddcd] bg-gradient-to-b from-[#fffdfa] to-[#faf6ed] p-5 shadow-[0_4px_20px_rgba(23,32,27,0.03)] sm:p-6"
    >
      {/* Top Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-800 shadow-2xs">
              <VsIcon name="sync_alt" className="text-xs" />
              Đồng bộ lên OTA
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a6760]">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Channex Gateway Ready
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-[#17201b] sm:text-2xl">
            Gửi giá và quỹ phòng đã lưu sang Channex
          </h2>
          <p className="mt-1 text-sm text-[#5a6760]">
            Phân phối tức thời dữ liệu phòng trống & biểu giá từ PMS tới các
            kênh Booking.com, Agoda, Traveloka, Airbnb.
          </p>
        </div>
      </div>

      {/* Workflow Pre-condition Notice */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-950 sm:text-sm">
        <VsIcon
          name="info"
          className="mt-0.5 shrink-0 text-base text-amber-700"
        />
        <p>
          <strong>Lưu ý quan trọng:</strong> Nếu bạn vừa chỉnh sửa giá hoặc quỹ
          phòng trong bảng lịch bên dưới, vui lòng nhấn nút{" "}
          <strong>Lưu thay đổi</strong> trước. Thao tác đồng bộ sẽ đọc dữ liệu
          đã lưu trong hệ thống để đẩy sang OTA.
        </p>
      </div>

      {/* Controls Container */}
      <div className="mt-5 space-y-3 rounded-xl border border-[#ebdcc8]/80 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
        {/* Quick Date Range Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#5a6760]">
            Khoảng ngày nhanh:
          </span>
          {PRESET_OPTIONS.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id, preset.days)}
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "border border-[#dcd3c1] bg-white text-[#3d4942] hover:border-emerald-600/40 hover:bg-[#f6f2e8]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Inputs & Action Button Row */}
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          {/* Start Date */}
          <div>
            <label
              htmlFor={startDateInputId}
              className="block text-xs font-bold uppercase tracking-wider text-[#3d4942]"
            >
              Từ ngày
            </label>
            <div className="relative mt-1.5 flex items-center">
              <span className="pointer-events-none absolute left-3 text-[#735c00]">
                <VsIcon name="calendar_today" className="text-base" />
              </span>
              <input
                id={startDateInputId}
                type="date"
                value={startDate}
                min={today}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setActivePreset(null);
                }}
                className="h-11 w-full rounded-xl border border-[#dcd3c1] bg-white pl-9 pr-3 text-sm font-semibold text-[#17201b] transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor={endDateInputId}
                className="block text-xs font-bold uppercase tracking-wider text-[#3d4942]"
              >
                Đến ngày{" "}
                <span className="font-normal lowercase text-[#6a786f]">
                  (tùy chọn)
                </span>
              </label>
              {endDate && (
                <button
                  type="button"
                  onClick={() => {
                    setEndDate("");
                    setActivePreset("today");
                  }}
                  className="text-xs font-semibold text-emerald-800 hover:underline"
                >
                  Chỉ 1 ngày
                </button>
              )}
            </div>
            <div className="relative mt-1.5 flex items-center">
              <span className="pointer-events-none absolute left-3 text-[#735c00]">
                <VsIcon name="calendar_today" className="text-base" />
              </span>
              <input
                id={endDateInputId}
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setActivePreset(null);
                }}
                className="h-11 w-full rounded-xl border border-[#dcd3c1] bg-white pl-9 pr-3 text-sm font-semibold text-[#17201b] transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={handlePush}
              disabled={pushAri.isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <VsIcon
                name={pushAri.isPending ? "refresh" : "sync_alt"}
                className={`text-lg ${pushAri.isPending ? "animate-spin" : ""}`}
              />
              <span>
                {pushAri.isPending
                  ? "Đang gửi sang Channex..."
                  : "Đồng bộ lên OTA"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Last Sync Audit Banner */}
      {lastSync && (
        <div
          className={`mt-4 flex flex-col gap-2 rounded-xl border p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm ${
            lastSync.matched
              ? "border-emerald-300 bg-emerald-50/90 text-emerald-950"
              : "border-amber-300 bg-amber-50/90 text-amber-950"
          }`}
        >
          <div className="flex items-center gap-2">
            <VsIcon
              name={lastSync.matched ? "check_circle" : "info"}
              className={`text-lg shrink-0 ${
                lastSync.matched ? "text-emerald-700" : "text-amber-700"
              }`}
            />
            <span>
              <strong>
                {lastSync.matched
                  ? "Đồng bộ thành công:"
                  : "Cảnh báo đối soát:"}
              </strong>{" "}
              {lastSync.message}
            </span>
          </div>
          <span className="shrink-0 font-medium text-[#5a6760]">
            Lúc {lastSync.timestamp}
          </span>
        </div>
      )}
    </section>
  );
}
