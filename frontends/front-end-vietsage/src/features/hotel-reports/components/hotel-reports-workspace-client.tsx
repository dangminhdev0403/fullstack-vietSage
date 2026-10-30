"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type {
  DailyRevenueItem,
  GetHotelReportsQuery,
  HotelReportsData,
  MonthlyRevenueItem,
  NationalityAnalyticsItem,
  SourceRevenueItem,
  StaffRevenueItem,
} from "@/features/hotel-reports/types/hotel-reports-contract";

type HotelReportsWorkspaceClientProps = {
  initialReports: HotelReportsData;
  hotelId: string;
};

type ReportSubTab =
  | "overview"
  | "daily"
  | "monthly"
  | "sources"
  | "staff"
  | "demographics";

const SUB_TABS: Array<{
  id: ReportSubTab;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Tổng quan & KPIs",
    icon: "dashboard",
    description: "Chỉ số doanh thu, ADR, công suất phòng OCC và RevPAR.",
  },
  {
    id: "daily",
    label: "Doanh thu theo ngày",
    icon: "calendar_today",
    description: "Chi tiết dòng tiền, tiền phòng, dịch vụ và OCC theo từng ngày.",
  },
  {
    id: "monthly",
    label: "Doanh thu theo tháng",
    icon: "calendar_month",
    description: "Xu hướng doanh thu và hiệu suất lấp đầy 12 tháng qua.",
  },
  {
    id: "sources",
    label: "Kênh đặt phòng",
    icon: "hub",
    description: "Phân bổ doanh thu OTA (Booking, Agoda, Airbnb) và trực tiếp.",
  },
  {
    id: "staff",
    label: "Thu ngân & Nhân viên",
    icon: "badge",
    description: "Doanh thu thực thu, phương thức thanh toán và lượt xử lý theo nhân viên.",
  },
  {
    id: "demographics",
    label: "Nguồn khách & Quốc tịch",
    icon: "public",
    description: "Phân tích cơ cấu quốc tịch, thời gian lưu trú và nhân khẩu học.",
  },
];

const RANGE_OPTIONS: Array<{
  key: NonNullable<GetHotelReportsQuery["range"]>;
  label: string;
}> = [
  { key: "7d", label: "7 ngày qua" },
  { key: "this_month", label: "Tháng này" },
  { key: "last_month", label: "Tháng trước" },
  { key: "this_year", label: "Năm nay" },
];

const WEEKDAY_VI: Record<number, string> = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  7: "CN",
};

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactVnd(amount: number): string {
  if (amount <= 0) return "0 ₫";
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")} tr`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}k`;
  }
  return `${amount} ₫`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toPlainDateSafe(rawDate: string, timeZone = "Asia/Ho_Chi_Minh"): Temporal.PlainDate | null {
  if (!rawDate) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
      return Temporal.PlainDate.from(rawDate.trim());
    }
    const instant = Temporal.Instant.from(rawDate);
    return instant.toZonedDateTimeISO(timeZone).toPlainDate();
  } catch {
    try {
      return Temporal.PlainDate.from(rawDate.slice(0, 10));
    } catch {
      return null;
    }
  }
}

function formatVietnameseDate(
  rawDate: string,
  options?: { includeWeekday?: boolean; timeZone?: string },
): string {
  const pd = toPlainDateSafe(rawDate, options?.timeZone);
  if (!pd) return rawDate;
  const dd = String(pd.day).padStart(2, "0");
  const mm = String(pd.month).padStart(2, "0");
  const base = `${dd}/${mm}/${pd.year}`;
  if (options?.includeWeekday) {
    const weekday = WEEKDAY_VI[pd.dayOfWeek] || "";
    return weekday ? `${weekday}, ${base}` : base;
  }
  return base;
}

function SortHeaderButton({
  label,
  sorted,
  onClick,
  align = "left",
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right" | "center";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 font-bold uppercase tracking-wider text-slate-700 hover:text-emerald-800 transition-colors whitespace-nowrap dark:text-slate-300 dark:hover:text-emerald-300 ${
        align === "right"
          ? "justify-end text-right"
          : align === "center"
            ? "justify-center text-center"
            : "justify-start text-left"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-slate-400">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}

export function HotelReportsWorkspaceClient({
  initialReports,
}: HotelReportsWorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialTabParam = searchParams.get("tab") as ReportSubTab | null;
  const resolvedInitialTab: ReportSubTab =
    initialTabParam && SUB_TABS.some((t) => t.id === initialTabParam)
      ? initialTabParam
      : "overview";

  const [activeTab, setActiveTab] = useState<ReportSubTab>(resolvedInitialTab);
  const reports = initialReports;

  const fromInputId = useId();
  const toInputId = useId();

  const currentRange =
    (searchParams.get("range") as GetHotelReportsQuery["range"]) ||
    initialReports.range ||
    "this_month";

  const initialFromPlain =
    toPlainDateSafe(
      searchParams.get("from") || initialReports.startDate,
      initialReports.timeZone,
    )?.toString() || "";
  const initialToPlain =
    toPlainDateSafe(
      searchParams.get("to") || initialReports.endDate,
      initialReports.timeZone,
    )?.toString() || "";

  const [customFrom, setCustomFrom] = useState<string>(initialFromPlain);
  const [customTo, setCustomTo] = useState<string>(initialToPlain);

  const [previousReports, setPreviousReports] = useState(initialReports);
  if (previousReports !== initialReports) {
    setPreviousReports(initialReports);
    const nextFrom =
      toPlainDateSafe(
        initialReports.startDate,
        initialReports.timeZone,
      )?.toString() || "";
    const nextTo =
      toPlainDateSafe(
        initialReports.endDate,
        initialReports.timeZone,
      )?.toString() || "";
    if (nextFrom) setCustomFrom(nextFrom);
    if (nextTo) setCustomTo(nextTo);
  }

  function handleTabChange(tab: ReportSubTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const newUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }

  function handleRangeChange(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    params.delete("from");
    params.delete("to");
    params.set("tab", activeTab);
    const newUrl = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.replace(newUrl, { scroll: false });
    });
  }

  function handleApplyCustomDates(e: React.FormEvent) {
    e.preventDefault();
    if (!customFrom || !customTo || customFrom > customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", customFrom);
    params.set("to", customTo);
    params.set("tab", activeTab);
    const newUrl = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.replace(newUrl, { scroll: false });
    });
  }

  const { summary } = reports;
  const formattedStart = formatVietnameseDate(reports.startDate, {
    timeZone: reports.timeZone,
  });
  const formattedEnd = formatVietnameseDate(reports.endDate, {
    timeZone: reports.timeZone,
  });

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800 whitespace-nowrap dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span>Kỳ báo cáo: {formattedStart} – {formattedEnd}</span>
              {isPending && (
                <span className="ml-1 text-emerald-700 animate-pulse">
                  • Đang cập nhật...
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl text-balance dark:text-white">
              Báo cáo &amp; Phân tích vận hành — {reports.hotelName}
            </h1>
          </div>

          {/* Date Range Controls */}
          <div className="flex flex-col gap-3 sm:items-end">
            <div
              role="group"
              aria-label="Chọn nhanh kỳ báo cáo"
              className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/90 p-1.5 dark:border-slate-800 dark:bg-slate-800/80"
            >
              {RANGE_OPTIONS.map((opt) => {
                const active =
                  reports.range !== "custom" &&
                  (currentRange === opt.key || (currentRange === "30d" && opt.key === "this_month"));
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRangeChange(opt.key)}
                    className={`rounded-lg px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                      active
                        ? "bg-emerald-800 font-bold text-white shadow-sm dark:bg-emerald-600"
                        : "text-slate-700 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Filter */}
            <form
              onSubmit={handleApplyCustomDates}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <label
                htmlFor={fromInputId}
                className="font-semibold text-slate-700 whitespace-nowrap dark:text-slate-300"
              >
                Từ ngày:
              </label>
              <input
                id={fromInputId}
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <label
                htmlFor={toInputId}
                className="font-semibold text-slate-700 whitespace-nowrap dark:text-slate-300"
              >
                Đến:
              </label>
              <input
                id={toInputId}
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={isPending || !customFrom || !customTo || customFrom > customTo}
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                Lọc theo ngày
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* KPI Headline Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Revenue */}
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Tổng doanh thu trong kỳ
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <VsIcon name="payments" className="text-xl" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-3xl tabular-nums dark:text-white">
            {formatVnd(summary.totalRevenue)}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-600 tabular-nums dark:border-slate-800 dark:text-slate-400">
            <span>Tiền phòng: <strong className="text-slate-900 dark:text-slate-200">{formatVnd(summary.roomRevenue)}</strong></span>
            <span>Dịch vụ: <strong className="text-slate-900 dark:text-slate-200">{formatVnd(summary.serviceRevenue)}</strong></span>
          </div>
        </article>

        {/* ADR (Average Daily Rate) */}
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Giá bán bình quân (ADR)
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <VsIcon name="trending_up" className="text-xl" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-blue-700 md:text-3xl tabular-nums dark:text-blue-400">
            {formatVnd(summary.adr)}
          </p>
          <p className="mt-3 border-t border-slate-100 pt-2.5 text-sm text-slate-600 text-pretty dark:border-slate-800 dark:text-slate-400">
            Bình quân trên <strong className="text-slate-900 dark:text-slate-200">{summary.totalRoomNights} đêm phòng</strong> đã sử dụng.
          </p>
        </article>

        {/* OCC (Occupancy Rate) */}
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Công suất phòng (OCC)
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <VsIcon name="bed" className="text-xl" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-purple-700 md:text-3xl tabular-nums dark:text-purple-400">
            {formatPercent(summary.occupancyRate)}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-600 tabular-nums dark:border-slate-800 dark:text-slate-400">
            <span>Hiện tại: <strong className="text-purple-700 dark:text-purple-300">{formatPercent(summary.currentOccupancyRate)}</strong></span>
            <span>Đang ở: <strong className="text-slate-900 dark:text-slate-200">{summary.occupiedRoomsNow}/{summary.totalRooms} phòng</strong></span>
          </div>
        </article>

        {/* RevPAR */}
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Doanh thu mỗi phòng (RevPAR)
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <VsIcon name="hotel" className="text-xl" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-amber-700 md:text-3xl tabular-nums dark:text-amber-400">
            {formatVnd(summary.revpar)}
          </p>
          <p className="mt-3 border-t border-slate-100 pt-2.5 text-sm text-slate-600 text-pretty dark:border-slate-800 dark:text-slate-400">
            Tính trên tổng quỹ <strong className="text-slate-900 dark:text-slate-200">{summary.totalRooms} phòng</strong> kinh doanh.
          </p>
        </article>
      </section>

      {/* Sub-Tabs Navigation */}
      <nav
        aria-label="Các danh mục báo cáo chi tiết"
        className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-slate-100/90 p-2 dark:border-slate-800 dark:bg-slate-900/80"
      >
        {SUB_TABS.map((subTab) => {
          const isActive = activeTab === subTab.id;
          return (
            <button
              key={subTab.id}
              type="button"
              onClick={() => handleTabChange(subTab.id)}
              className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm md:text-base font-bold transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? "bg-white text-emerald-900 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-emerald-300 dark:ring-slate-700"
                  : "text-slate-700 hover:bg-white/60 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <VsIcon name={subTab.icon} className="text-lg" />
              <span>{subTab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* In-Place Sub-Tab Panels */}
      <div className={isPending ? "opacity-60 transition-opacity duration-200" : ""}>
        {activeTab === "overview" && <OverviewPanel reports={reports} />}
        {activeTab === "daily" && <DailyRevenuePanel reports={reports} />}
        {activeTab === "monthly" && <MonthlyRevenuePanel reports={reports} />}
        {activeTab === "sources" && <SourceRevenuePanel reports={reports} />}
        {activeTab === "staff" && <StaffRevenuePanel reports={reports} />}
        {activeTab === "demographics" && <DemographicsPanel reports={reports} />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Overview Panel
// ----------------------------------------------------------------------
function OverviewPanel({ reports }: { reports: HotelReportsData }) {
  const { summary, paymentMethods, revenueBySource } = reports;
  const totalBilled =
    summary.roomRevenue + summary.serviceRevenue + Math.max(0, summary.otherRevenue) ||
    summary.totalRevenue ||
    1;

  const roomPct = Math.min(100, Math.round((summary.roomRevenue / totalBilled) * 100));
  const servicePct = Math.min(
    100 - roomPct,
    Math.round((summary.serviceRevenue / totalBilled) * 100),
  );
  const otherPct = Math.max(0, 100 - roomPct - servicePct);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Structure Breakdown */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Cơ cấu doanh thu phát sinh trong kỳ
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Tỷ trọng thực tế giữa tiền phòng lưu trú, dịch vụ bổ sung và các khoản phụ thu.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm md:text-base tabular-nums">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Tiền phòng ({roomPct}%)
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatVnd(summary.roomRevenue)}
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${roomPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm md:text-base tabular-nums">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Dịch vụ &amp; F&amp;B ({servicePct}%)
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatVnd(summary.serviceRevenue)}
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${servicePct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm md:text-base tabular-nums">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Phụ thu &amp; Điều chỉnh ({otherPct}%)
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatVnd(summary.otherRevenue)}
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${otherPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Lượt lưu trú
                </p>
                <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                  {summary.totalStays}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Tổng khách lưu trú
                </p>
                <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                  {summary.totalGuests}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Đêm phòng sử dụng
                </p>
                <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                  {summary.totalRoomNights}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Payment Methods Distribution */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Phương thức thanh toán đã đối soát
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Dòng tiền thực thu từ các giao dịch thanh toán thành công phân bổ theo phương thức.
          </p>

          <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
            {paymentMethods.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">
                Chưa có giao dịch thanh toán thành công trong kỳ này.
              </p>
            ) : (
              paymentMethods.map((pm) => (
                <div
                  key={pm.method}
                  className="flex items-center justify-between py-3.5 text-sm md:text-base tabular-nums"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <VsIcon name="credit_card" className="text-lg" />
                    </span>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {pm.methodName}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {pm.count} giao dịch
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-900 dark:text-white">
                      {formatVnd(pm.amount)}
                    </p>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {formatPercent(pm.percentage)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Channel Summary Card */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
          Tỷ trọng nguồn khách &amp; Kênh bán phòng
        </h2>
        <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
          So sánh nhanh hiệu quả doanh thu và giá bán bình quân (ADR) giữa các kênh OTA và đặt trực tiếp.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {revenueBySource.map((s) => (
            <div
              key={s.sourceKey}
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 truncate dark:text-white">
                  {s.sourceName}
                </span>
                <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap dark:bg-emerald-950 dark:text-emerald-300">
                  {formatPercent(s.sharePercent)}
                </span>
              </div>
              <p className="mt-2.5 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                {formatVnd(s.totalRevenue)}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600 tabular-nums dark:text-slate-400">
                <span>{s.bookingCount} lượt đặt</span>
                <span>ADR: {formatVnd(s.adr)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. Daily Revenue Panel (with @tanstack/react-table, sorting, filter, pagination & chart metric switcher)
// ----------------------------------------------------------------------
function DailyRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByDay, timeZone } = reports;
  const [chartMode, setChartMode] = useState<"revenue" | "occupancy">("revenue");
  const [onlyActiveDays, setOnlyActiveDays] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);

  const maxDayRevenue = Math.max(...revenueByDay.map((d) => d.totalRevenue), 1);
  const maxDayOcc = Math.max(...revenueByDay.map((d) => d.occupancyRate), 10);

  const filteredDays = useMemo(() => {
    if (!onlyActiveDays) return revenueByDay;
    return revenueByDay.filter(
      (d) => d.totalRevenue > 0 || d.roomsOccupied > 0,
    );
  }, [revenueByDay, onlyActiveDays]);

  const totals = useMemo(() => {
    let roomRev = 0;
    let serviceRev = 0;
    let totalRev = 0;
    let roomsOccSum = 0;
    let occSum = 0;
    for (const d of filteredDays) {
      roomRev += d.roomRevenue;
      serviceRev += d.serviceRevenue;
      totalRev += d.totalRevenue;
      roomsOccSum += d.roomsOccupied;
      occSum += d.occupancyRate;
    }
    const count = Math.max(1, filteredDays.length);
    const avgAdr = roomsOccSum > 0 ? Math.round(roomRev / roomsOccSum) : 0;
    const avgOcc = occSum / count;
    return { roomRev, serviceRev, totalRev, roomsOccSum, avgAdr, avgOcc };
  }, [filteredDays]);

  const columns = useMemo<ColumnDef<DailyRevenueItem>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => (
          <SortHeaderButton
            label="Ngày (UTC+7)"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
              {formatVietnameseDate(item.date, {
                includeWeekday: true,
                timeZone,
              })}
            </div>
          );
        },
      },
      {
        accessorKey: "roomsOccupied",
        header: ({ column }) => (
          <SortHeaderButton
            label="Phòng ở"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const count = row.original.roomsOccupied;
          return (
            <div className="text-right font-semibold text-slate-800 whitespace-nowrap tabular-nums dark:text-slate-200">
              {count > 0 ? (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
                  {count} phòng
                </span>
              ) : (
                <span className="text-slate-400">0 phòng</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "roomRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tiền phòng"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 whitespace-nowrap tabular-nums dark:text-slate-200">
            {formatVnd(row.original.roomRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "serviceRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tiền dịch vụ"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 whitespace-nowrap tabular-nums dark:text-slate-200">
            {formatVnd(row.original.serviceRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "totalRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tổng doanh thu"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const val = row.original.totalRevenue;
          return (
            <div
              className={`text-right font-extrabold whitespace-nowrap tabular-nums ${
                val > 0
                  ? "text-emerald-800 dark:text-emerald-400"
                  : "text-slate-400"
              }`}
            >
              {formatVnd(val)}
            </div>
          );
        },
      },
      {
        accessorKey: "adr",
        header: ({ column }) => (
          <SortHeaderButton
            label="Giá ADR"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-blue-700 whitespace-nowrap tabular-nums dark:text-blue-400">
            {formatVnd(row.original.adr)}
          </div>
        ),
      },
      {
        accessorKey: "occupancyRate",
        header: ({ column }) => (
          <SortHeaderButton
            label="Công suất OCC"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const occ = row.original.occupancyRate;
          return (
            <div className="text-right whitespace-nowrap tabular-nums">
              <span
                className={`inline-block rounded-md px-2.5 py-1 text-sm font-bold whitespace-nowrap ${
                  occ >= 50
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : occ > 0
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {formatPercent(occ)}
              </span>
            </div>
          );
        },
      },
    ],
    [timeZone],
  );

  const table = useReactTable({
    data: filteredDays,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: {
      pagination: { pageSize: 15 },
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Visual Chart Bars with Mode Switcher */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
              Biểu đồ biến động doanh thu &amp; công suất phòng từng ngày
            </h2>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Chiều cao cột phản ánh đúng chỉ số đang chọn bên phải để dễ dàng phát hiện ngày cao điểm hoặc thấp điểm.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setChartMode("revenue")}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all whitespace-nowrap ${
                chartMode === "revenue"
                  ? "bg-white text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Theo Doanh thu (₫)
            </button>
            <button
              type="button"
              onClick={() => setChartMode("occupancy")}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all whitespace-nowrap ${
                chartMode === "occupancy"
                  ? "bg-white text-purple-800 shadow-sm dark:bg-slate-900 dark:text-purple-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Theo Công suất (OCC %)
            </button>
          </div>
        </div>

        <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2 pt-8">
          {revenueByDay.map((day) => {
            const isRevenueMode = chartMode === "revenue";
            const rawVal = isRevenueMode ? day.totalRevenue : day.occupancyRate;
            const maxVal = isRevenueMode ? maxDayRevenue : maxDayOcc;
            const heightPercent =
              rawVal > 0 ? Math.max(12, Math.round((rawVal / maxVal) * 100)) : 3;
            const topLabel = isRevenueMode
              ? day.totalRevenue > 0
                ? formatCompactVnd(day.totalRevenue)
                : "0"
              : `${Math.round(day.occupancyRate)}%`;

            return (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[44px]"
              >
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-14 z-20 hidden rounded-xl bg-slate-900 px-3 py-1.5 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">
                    {formatVietnameseDate(day.date, {
                      includeWeekday: true,
                      timeZone,
                    })}
                  </p>
                  <p className="mt-0.5">
                    {formatVnd(day.totalRevenue)} • {day.roomsOccupied} phòng ({formatPercent(day.occupancyRate)})
                  </p>
                </div>

                {/* Top Value Label matching Bar Height */}
                <span
                  className={`mb-1.5 text-xs font-bold tabular-nums whitespace-nowrap ${
                    rawVal > 0
                      ? "text-slate-800 dark:text-slate-200"
                      : "text-slate-400"
                  }`}
                >
                  {topLabel}
                </span>

                {/* Bar */}
                <div
                  className={`w-full rounded-t-lg transition-all duration-200 ${
                    rawVal > 0
                      ? isRevenueMode
                        ? "bg-emerald-600 group-hover:bg-emerald-500"
                        : "bg-purple-600 group-hover:bg-purple-500"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />

                {/* Date Label (guaranteed synced with date via Temporal) */}
                <span className="mt-2 text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                  {day.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Daily Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200/90 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
              Bảng đối soát chi tiết doanh thu theo ngày
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Bấm vào tiêu đề cột bất kỳ để sắp xếp tăng/giảm. Mặc định hiển thị ngày mới nhất lên đầu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={onlyActiveDays}
                onChange={(e) => setOnlyActiveDays(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span className="whitespace-nowrap">
                Chỉ hiện ngày có phát sinh ({revenueByDay.filter((d) => d.totalRevenue > 0 || d.roomsOccupied > 0).length} ngày)
              </span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs md:text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-base text-slate-600 dark:text-slate-400"
                  >
                    Không có ngày nào phát sinh dữ liệu trong bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-emerald-50/40 transition-colors dark:hover:bg-slate-800/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {filteredDays.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
                <tr>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    Tổng cộng / Bình quân ({filteredDays.length} ngày)
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {totals.roomsOccSum} đêm phòng
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.roomRev)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.serviceRev)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                    {formatVnd(totals.totalRev)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
                    TB: {formatVnd(totals.avgAdr)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    TB: {formatPercent(totals.avgOcc)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Controls */}
        {table.getPageCount() > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-5 py-3.5 text-sm dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400">
              Trang{" "}
              <strong className="text-slate-900 dark:text-white">
                {table.getState().pagination.pageIndex + 1}
              </strong>{" "}
              / {table.getPageCount()} ({filteredDays.length} dòng)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang trước
              </button>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang tiếp
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. Monthly Revenue Panel (with @tanstack/react-table & tfoot)
// ----------------------------------------------------------------------
function MonthlyRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByMonth } = reports;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "month", desc: true },
  ]);

  const maxMonthRev = Math.max(...revenueByMonth.map((m) => m.totalRevenue), 1);

  const totals = useMemo(() => {
    let roomRev = 0;
    let serviceRev = 0;
    let totalRev = 0;
    let bookings = 0;
    let roomsSold = 0;
    let occSum = 0;
    for (const m of revenueByMonth) {
      roomRev += m.roomRevenue;
      serviceRev += m.serviceRevenue;
      totalRev += m.totalRevenue;
      bookings += m.bookingCount;
      roomsSold += m.roomsSold;
      occSum += m.averageOccupancy;
    }
    const avgOcc = occSum / Math.max(1, revenueByMonth.length);
    const avgAdr = roomsSold > 0 ? Math.round(roomRev / roomsSold) : 0;
    return { roomRev, serviceRev, totalRev, bookings, roomsSold, avgOcc, avgAdr };
  }, [revenueByMonth]);

  const columns = useMemo<ColumnDef<MonthlyRevenueItem>[]>(
    () => [
      {
        accessorKey: "month",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tháng"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
            {row.original.monthLabel}
          </span>
        ),
      },
      {
        accessorKey: "bookingCount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Lượt lưu trú"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.bookingCount} lượt
          </div>
        ),
      },
      {
        accessorKey: "roomsSold",
        header: ({ column }) => (
          <SortHeaderButton
            label="Đêm phòng bán"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.roomsSold} đêm
          </div>
        ),
      },
      {
        accessorKey: "roomRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tiền phòng"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.roomRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "serviceRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tiền dịch vụ"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.serviceRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "totalRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tổng doanh thu"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
            {formatVnd(row.original.totalRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "averageOccupancy",
        header: ({ column }) => (
          <SortHeaderButton
            label="OCC bình quân"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right whitespace-nowrap tabular-nums">
            <span className="inline-block rounded-md bg-purple-100 px-2.5 py-1 text-sm font-bold text-purple-800 whitespace-nowrap dark:bg-purple-950 dark:text-purple-300">
              {formatPercent(row.original.averageOccupancy)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "adr",
        header: ({ column }) => (
          <SortHeaderButton
            label="ADR bình quân"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
            {formatVnd(row.original.adr)}
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: revenueByMonth,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Monthly Chart */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
          Xu hướng doanh thu theo tháng (12 tháng gần nhất)
        </h2>
        <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
          Theo dõi chu kỳ kinh doanh và hiệu quả khai thác phòng xuyên suốt 12 tháng gần nhất.
        </p>

        <div className="mt-6 flex h-56 items-end gap-3 overflow-x-auto pb-2 pt-8">
          {revenueByMonth.map((m) => {
            const h =
              m.totalRevenue > 0
                ? Math.max(12, Math.round((m.totalRevenue / maxMonthRev) * 100))
                : 3;
            return (
              <div
                key={m.month}
                className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[64px]"
              >
                <div className="pointer-events-none absolute -top-14 z-20 hidden rounded-xl bg-slate-900 px-3 py-1.5 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">{m.monthLabel}</p>
                  <p className="mt-0.5">
                    {formatVnd(m.totalRevenue)} • {m.roomsSold} đêm (OCC {formatPercent(m.averageOccupancy)})
                  </p>
                </div>

                <span className="mb-1.5 text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                  {m.totalRevenue > 0 ? formatCompactVnd(m.totalRevenue) : "0"}
                </span>

                <div
                  className={`w-full rounded-t-lg transition-all duration-200 ${
                    m.totalRevenue > 0
                      ? "bg-blue-600 group-hover:bg-blue-500"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                  style={{ height: `${h}%` }}
                />

                <span className="mt-2 text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {m.monthLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Monthly Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/90 p-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Bảng tổng hợp doanh thu 12 tháng qua
          </h2>
          <p className="mt-0.5 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Mặc định hiển thị tháng gần nhất ở trên cùng để thuận tiện kiểm tra.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs md:text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-emerald-50/40 transition-colors dark:hover:bg-slate-800/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3.5 whitespace-nowrap">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
              <tr>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  Tổng 12 tháng
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {totals.bookings} lượt
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {totals.roomsSold} đêm
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {formatVnd(totals.roomRev)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {formatVnd(totals.serviceRev)}
                </td>
                <td className="px-4 py-3.5 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                  {formatVnd(totals.totalRev)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  TB: {formatPercent(totals.avgOcc)}
                </td>
                <td className="px-4 py-3.5 text-right text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
                  TB: {formatVnd(totals.avgAdr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. Source Revenue Panel (with @tanstack/react-table & tfoot)
// ----------------------------------------------------------------------
function SourceRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueBySource } = reports;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "totalRevenue", desc: true },
  ]);

  const totals = useMemo(() => {
    let bookings = 0;
    let guests = 0;
    let revenue = 0;
    for (const s of revenueBySource) {
      bookings += s.bookingCount;
      guests += s.guestCount;
      revenue += s.totalRevenue;
    }
    return { bookings, guests, revenue };
  }, [revenueBySource]);

  const columns = useMemo<ColumnDef<SourceRevenueItem>[]>(
    () => [
      {
        accessorKey: "sourceName",
        header: ({ column }) => (
          <SortHeaderButton
            label="Kênh đặt phòng"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
            {row.original.sourceName}
          </span>
        ),
      },
      {
        accessorKey: "sourceType",
        header: "Phân loại",
        cell: ({ row }) => {
          const t = row.original.sourceType;
          return (
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs md:text-sm font-bold whitespace-nowrap ${
                t === "OTA"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  : t === "DIRECT"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {t === "OTA" ? "Kênh OTA" : t === "DIRECT" ? "Trực tiếp" : "Khách vãng lai"}
            </span>
          );
        },
      },
      {
        accessorKey: "bookingCount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Số lượt đặt"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.bookingCount} đặt phòng
          </div>
        ),
      },
      {
        accessorKey: "guestCount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Số lượng khách"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.guestCount} khách
          </div>
        ),
      },
      {
        accessorKey: "totalRevenue",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tổng doanh thu"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
            {formatVnd(row.original.totalRevenue)}
          </div>
        ),
      },
      {
        accessorKey: "sharePercent",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tỷ trọng (%)"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap dark:text-emerald-400">
            {formatPercent(row.original.sharePercent)}
          </div>
        ),
      },
      {
        accessorKey: "adr",
        header: ({ column }) => (
          <SortHeaderButton
            label="Giá ADR kênh"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
            {formatVnd(row.original.adr)}
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: revenueBySource,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/90 p-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Hiệu quả doanh thu theo kênh đặt phòng &amp; OTA
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Chi tiết số lượng đặt phòng, tổng doanh thu và giá bán bình quân mỗi đêm (ADR) của từng kênh phân phối.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs md:text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-emerald-50/40 transition-colors dark:hover:bg-slate-800/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3.5 whitespace-nowrap">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
              <tr>
                <td className="px-4 py-3.5 whitespace-nowrap" colSpan={2}>
                  Tổng cộng tất cả kênh
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {totals.bookings} đặt phòng
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {totals.guests} khách
                </td>
                <td className="px-4 py-3.5 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                  {formatVnd(totals.revenue)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  100.0%
                </td>
                <td className="px-4 py-3.5 text-right text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
                  TB: {formatVnd(reports.summary.adr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 5. Staff Revenue Panel (with @tanstack/react-table, otherAmount column & tfoot)
// ----------------------------------------------------------------------
function StaffRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByStaff } = reports;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "collectedAmount", desc: true },
  ]);

  const totals = useMemo(() => {
    let collected = 0;
    let txCount = 0;
    let cash = 0;
    let bank = 0;
    let card = 0;
    let other = 0;
    let stays = 0;
    for (const s of revenueByStaff) {
      collected += s.collectedAmount;
      txCount += s.transactionCount;
      cash += s.cashAmount;
      bank += s.bankTransferAmount;
      card += s.cardAmount;
      other += s.otherAmount;
      stays += s.staysHandled;
    }
    return { collected, txCount, cash, bank, card, other, stays };
  }, [revenueByStaff]);

  const columns = useMemo<ColumnDef<StaffRevenueItem>[]>(
    () => [
      {
        accessorKey: "staffName",
        header: ({ column }) => (
          <SortHeaderButton
            label="Nhân viên / Thu ngân"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
            {row.original.staffName}
          </span>
        ),
      },
      {
        accessorKey: "role",
        header: "Vai trò",
        cell: ({ row }) => (
          <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-xs md:text-sm font-semibold text-slate-700 whitespace-nowrap dark:bg-slate-800 dark:text-slate-300">
            {row.original.role}
          </span>
        ),
      },
      {
        accessorKey: "collectedAmount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tổng tiền đã thu"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
            {formatVnd(row.original.collectedAmount)}
          </div>
        ),
      },
      {
        accessorKey: "transactionCount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Số giao dịch"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.transactionCount} lần
          </div>
        ),
      },
      {
        accessorKey: "cashAmount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tiền mặt"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.cashAmount)}
          </div>
        ),
      },
      {
        accessorKey: "bankTransferAmount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Chuyển khoản"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.bankTransferAmount)}
          </div>
        ),
      },
      {
        accessorKey: "cardAmount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Thẻ POS"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.cardAmount)}
          </div>
        ),
      },
      {
        accessorKey: "otherAmount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Ví / Cổng khác"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {formatVnd(row.original.otherAmount)}
          </div>
        ),
      },
      {
        accessorKey: "staysHandled",
        header: ({ column }) => (
          <SortHeaderButton
            label="Lượt xử lý phòng"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.staysHandled} lượt
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: revenueByStaff,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/90 p-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Doanh thu thực thu &amp; giao dịch theo nhân viên
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Đối soát số tiền thực thu qua từng thu ngân lễ tân, phân tách đầy đủ theo tiền mặt, chuyển khoản, thẻ POS và cổng thanh toán điện tử.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs md:text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-base text-slate-600 dark:text-slate-400"
                  >
                    Chưa có giao dịch thanh toán nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-emerald-50/40 transition-colors dark:hover:bg-slate-800/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {revenueByStaff.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
                <tr>
                  <td className="px-4 py-3.5 whitespace-nowrap" colSpan={2}>
                    Tổng cộng ({revenueByStaff.length} nhân sự)
                  </td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                    {formatVnd(totals.collected)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {totals.txCount} lần
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.cash)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.bank)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.card)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {formatVnd(totals.other)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {totals.stays} lượt
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 6. Demographics Panel (with @tanstack/react-table & tfoot)
// ----------------------------------------------------------------------
function DemographicsPanel({ reports }: { reports: HotelReportsData }) {
  const { guestAnalytics } = reports;
  const { nationalities, genderDistribution, domesticVsInternational } =
    guestAnalytics;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "guestCount", desc: true },
  ]);

  const totals = useMemo(() => {
    let guests = 0;
    let nights = 0;
    for (const n of nationalities) {
      guests += n.guestCount;
      nights += n.totalRoomNights;
    }
    const avgStay = guests > 0 ? nights / guests : 0;
    return { guests, nights, avgStay };
  }, [nationalities]);

  const columns = useMemo<ColumnDef<NationalityAnalyticsItem>[]>(
    () => [
      {
        accessorKey: "nationality",
        header: ({ column }) => (
          <SortHeaderButton
            label="Quốc tịch"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
            {row.original.nationality}
          </span>
        ),
      },
      {
        accessorKey: "guestCount",
        header: ({ column }) => (
          <SortHeaderButton
            label="Số lượng khách"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.guestCount} khách
          </div>
        ),
      },
      {
        accessorKey: "percentage",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tỷ lệ (%)"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap dark:text-emerald-400">
            {formatPercent(row.original.percentage)}
          </div>
        ),
      },
      {
        accessorKey: "totalRoomNights",
        header: ({ column }) => (
          <SortHeaderButton
            label="Tổng đêm lưu trú"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
            {row.original.totalRoomNights} đêm
          </div>
        ),
      },
      {
        accessorKey: "averageStayNights",
        header: ({ column }) => (
          <SortHeaderButton
            label="Lưu trú bình quân"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-bold text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
            {row.original.averageStayNights.toFixed(1)} đêm/khách
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: nationalities,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Ratio Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Domestic vs International */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Cơ cấu khách nội địa &amp; khách quốc tế
          </h2>
          <div className="mt-4 flex items-center justify-between text-sm md:text-base tabular-nums">
            <div>
              <p className="font-semibold text-slate-600 dark:text-slate-400">
                Khách Việt Nam
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
                {domesticVsInternational.domestic} khách ({formatPercent(domesticVsInternational.domesticPercentage)})
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-600 dark:text-slate-400">
                Khách Quốc tế
              </p>
              <p className="mt-1 text-2xl font-extrabold text-blue-700 dark:text-blue-400">
                {domesticVsInternational.international} khách ({formatPercent(domesticVsInternational.internationalPercentage)})
              </p>
            </div>
          </div>
          <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${domesticVsInternational.domesticPercentage}%` }}
            />
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${domesticVsInternational.internationalPercentage}%`,
              }}
            />
          </div>
        </section>

        {/* Gender Breakdown */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Phân bổ giới tính khách lưu trú
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-blue-50/80 p-4 dark:bg-blue-950/30">
              <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                Nam
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                {genderDistribution.male}
              </p>
            </div>
            <div className="rounded-xl bg-pink-50/80 p-4 dark:bg-pink-950/30">
              <p className="text-sm font-bold text-pink-800 dark:text-pink-300">
                Nữ
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                {genderDistribution.female}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100/80 p-4 dark:bg-slate-800/50">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Chưa xác định
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums dark:text-white">
                {genderDistribution.unspecified + genderDistribution.other}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Nationality Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/90 p-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Bảng phân bổ quốc tịch &amp; thời gian lưu trú thực tế
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Tổng hợp từ hồ sơ CCCD/Hộ chiếu của khách nhận phòng và khai báo lưu trú trong kỳ.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs md:text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-base text-slate-600 dark:text-slate-400"
                  >
                    Chưa có thông tin quốc tịch nào được ghi nhận trong kỳ.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-emerald-50/40 transition-colors dark:hover:bg-slate-800/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {nationalities.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
                <tr>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    Tổng cộng ({nationalities.length} quốc tịch)
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {totals.guests} khách
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    100.0%
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                    {totals.nights} đêm
                  </td>
                  <td className="px-4 py-3.5 text-right text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
                    TB: {totals.avgStay.toFixed(1)} đêm/khách
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
