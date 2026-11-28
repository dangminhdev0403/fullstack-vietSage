"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { HttpError } from "@/core/http/http-error";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useUpsertRevenueTarget } from "@/features/hotel-reports/hooks/use-revenue-book";
import {
  ReportsGroupSegmentedBar,
  ReportsPrimaryMobileNav,
  buildReportTabHref,
  type ReportClientTab,
} from "@/features/hotel-reports/components/reports-navigation-bars";
import type {
  DailyRevenueItem,
  ExpenseCategoryBreakdownItem,
  GetHotelReportsQuery,
  HotelReportsData,
  MonthlyRevenueItem,
  NationalityAnalyticsItem,
  QuarterlyRevenueSummaryItem,
  SourceRevenueItem,
  StaffRevenueItem,
} from "@/features/hotel-reports/types/hotel-reports-contract";

type HotelReportsWorkspaceClientProps = {
  initialReports: HotelReportsData;
  hotelId: string;
};

type ReportSubTab = ReportClientTab;

const SUB_TABS: Array<{
  id: ReportSubTab;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Chỉ số vận hành",
    icon: "dashboard",
    description: "Chỉ số doanh thu, ADR, công suất phòng OCC và RevPAR.",
  },
  {
    id: "pnl",
    label: "Báo cáo lãi lỗ",
    icon: "monitoring",
    description: "Doanh thu, chi phí vận hành, phí SaaS và lãi/lỗ ròng theo kỳ.",
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
    description: "Phân bổ doanh thu OTA và trực tiếp.",
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

function formatVnd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactVnd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount === 0) return "0 ₫";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")} tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${Math.round(abs)} ₫`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function ChangePercentBadge({
  value,
  compareTitle,
}: {
  value?: number | null;
  compareTitle?: string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-slate-400">—</span>;
  }
  const isPositive = value >= 0;
  return (
    <span
      title={compareTitle}
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tabular-nums whitespace-nowrap ${
        isPositive
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
      }`}
    >
      {formatSignedPercent(value)}
    </span>
  );
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
  hotelId,
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
  const [prevResolvedTab, setPrevResolvedTab] = useState<ReportSubTab>(resolvedInitialTab);
  if (prevResolvedTab !== resolvedInitialTab) {
    setPrevResolvedTab(resolvedInitialTab);
    setActiveTab(resolvedInitialTab);
  }
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
  const navFrom = customFrom || initialFromPlain || undefined;
  const navTo = customTo || initialToPlain || undefined;
  const activeTabMeta = SUB_TABS.find((t) => t.id === activeTab) ?? SUB_TABS[0];
  const isRevenueGroupSubTab =
    activeTab === "daily" || activeTab === "monthly" || activeTab === "staff";

  return (
    <div className="space-y-6">
      {/* Clean Printable Report Header */}
      <div className="hidden border-b-2 border-slate-900 pb-4 print:block">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {reports.hotelName}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 text-balance">
              Báo cáo &amp; Phân tích vận hành — {activeTabMeta.label}
            </h1>
          </div>
          <p className="text-sm font-semibold text-slate-800 tabular-nums">
            Kỳ báo cáo: {formattedStart} – {formattedEnd}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-4 border-t border-slate-200 pt-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-600">
              Tổng doanh thu
            </dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {formatVnd(summary.totalRevenue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-600">
              Lợi nhuận ròng
            </dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {formatVnd(summary.netProfit ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-600">
              Công suất OCC
            </dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {formatPercent(summary.occupancyRate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-600">
              Giá bán bình quân (ADR)
            </dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {formatVnd(summary.adr)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Workspace Header */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 print:hidden dark:border-slate-800 dark:bg-slate-900">
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {pathname.startsWith("/owner") && (
                <Link
                  href={`/owner/hotels/${encodeURIComponent(hotelId)}/billing?tab=expenses`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <VsIcon name="account_balance_wallet" className="text-lg" />
                  Chi phí vận hành
                </Link>
              )}
              {!isRevenueGroupSubTab && (
                <Link
                  href={buildReportTabHref(pathname, "book", navFrom, navTo)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <VsIcon name="receipt_long" className="text-lg" />
                  Sổ doanh thu
                </Link>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 print:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <VsIcon name="print" className="text-lg" />
                In / Xuất PDF
              </button>
            </div>
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
                className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Lọc theo ngày
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Shared 2-Tier Reports Navigation */}
      <ReportsPrimaryMobileNav
        activeTab={activeTab}
        pathname={pathname}
        from={navFrom}
        to={navTo}
        onSelectClientTab={handleTabChange}
      />
      <ReportsGroupSegmentedBar
        activeTab={activeTab}
        pathname={pathname}
        from={navFrom}
        to={navTo}
        onSelectClientTab={handleTabChange}
      />

      {activeTab === "overview" && (
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

      )}

      {/* In-Place Sub-Tab Panels */}
      <div className={isPending ? "opacity-60 transition-opacity duration-200" : ""}>
        {activeTab === "overview" && <OverviewPanel reports={reports} />}
        {activeTab === "pnl" && (
          <PnlReportPanel reports={reports} hotelId={hotelId} pathname={pathname} />
        )}
        {activeTab === "daily" && <DailyRevenuePanel reports={reports} />}
        {activeTab === "monthly" && (
          <MonthlyRevenuePanel
            reports={reports}
            hotelId={hotelId}
            pathname={pathname}
            onTargetSaved={() => router.refresh()}
          />
        )}
        {activeTab === "sources" && <SourceRevenuePanel reports={reports} />}
        {activeTab === "staff" && <StaffRevenuePanel reports={reports} />}
        {activeTab === "demographics" && <DemographicsPanel reports={reports} />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1A. P&L & Cashflow Panel
// ----------------------------------------------------------------------
function PnlReportPanel({
  reports,
  hotelId,
  pathname,
}: {
  reports: HotelReportsData;
  hotelId: string;
  pathname: string;
}) {
  const { summary, revenueByMonth } = reports;
  const expenseCategories: ExpenseCategoryBreakdownItem[] =
    reports.expenseByCategory ?? [];
  const receivables = reports.receivablesSummary;
  const bookingPayments = reports.bookingPaymentsSummary;
  const isOwnerSpace = pathname.startsWith("/owner");
  const billingHref = `/owner/hotels/${encodeURIComponent(hotelId)}/billing`;

  const manualRevenue = summary.manualRevenue ?? 0;
  const folioRevenue =
    summary.roomRevenue + summary.serviceRevenue + summary.otherRevenue;
  const collectedRevenue = summary.collectedRevenue ?? 0;
  const uncollectedRevenue = summary.uncollectedRevenue ?? 0;
  const operatingExpense = summary.operatingExpense ?? 0;
  const paidOperatingExpense = summary.paidOperatingExpense ?? 0;
  const unpaidOperatingExpense = summary.unpaidOperatingExpense ?? 0;
  const saasFeeExpense = summary.saasFeeExpense ?? 0;
  const totalExpense = summary.totalExpense ?? 0;
  const netProfit = summary.netProfit ?? 0;
  const profitMargin = summary.profitMargin ?? 0;
  const expenseRatio = summary.expenseRatio ?? 0;
  const netCashFlow = summary.netCashFlow ?? 0;

  const maxMonthlyMetric = Math.max(
    1,
    ...revenueByMonth.map((m) =>
      Math.max(m.totalRevenue, m.expense ?? 0, Math.abs(m.netProfit ?? 0)),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Structured P&L Statement */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
                Báo cáo Kết quả Kinh doanh (Lãi / Lỗ)
              </h2>
              <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
                Tổng hợp doanh thu phát sinh, chi phí vận hành và phí phần mềm trong kỳ đã chọn.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                netProfit >= 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
              }`}
            >
              Biên lợi nhuận: {profitMargin.toFixed(1)}%
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="py-2.5 text-left">
                    Chỉ tiêu tài chính
                  </th>
                  <th scope="col" className="py-2.5 text-right whitespace-nowrap">
                    Giá trị (₫)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-300">
                    Doanh thu lưu trú &amp; dịch vụ (Hóa đơn phòng)
                  </td>
                  <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap dark:text-white">
                    {formatVnd(folioRevenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 pl-4 text-xs text-slate-500 dark:text-slate-400">
                    Tiền phòng: {formatVnd(summary.roomRevenue)} · Dịch vụ:{" "}
                    {formatVnd(summary.serviceRevenue)} · Phụ thu:{" "}
                    {formatVnd(summary.otherRevenue)}
                  </td>
                  <td className="py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap dark:text-slate-400">
                    —
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-300">
                    Thu nhập bổ sung (Sổ doanh thu)
                  </td>
                  <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap dark:text-white">
                    {formatVnd(manualRevenue)}
                  </td>
                </tr>
                <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                  <td className="py-3 px-2 font-bold text-emerald-900 dark:text-emerald-200">
                    1. Tổng doanh thu phát sinh
                  </td>
                  <td className="py-3 px-2 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-300">
                    {formatVnd(summary.totalRevenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-300">
                    Chi phí vận hành khách sạn
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Đã chi trả {formatVnd(paidOperatingExpense)} · Chưa thanh toán{" "}
                      {formatVnd(unpaidOperatingExpense)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-semibold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                    {operatingExpense > 0 ? `-${formatVnd(operatingExpense)}` : formatVnd(0)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-300">
                    Phí phần mềm VietSage SaaS
                  </td>
                  <td className="py-2.5 text-right font-semibold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                    {saasFeeExpense > 0 ? `-${formatVnd(saasFeeExpense)}` : formatVnd(0)}
                  </td>
                </tr>
                <tr className="bg-rose-50/50 dark:bg-rose-950/20">
                  <td className="py-3 px-2 font-bold text-rose-900 dark:text-rose-200">
                    2. Tổng chi phí ({expenseRatio.toFixed(1)}% doanh thu)
                  </td>
                  <td className="py-3 px-2 text-right font-extrabold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-300">
                    {totalExpense > 0 ? `-${formatVnd(totalExpense)}` : formatVnd(0)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr
                  className={`border-t-2 ${
                    netProfit >= 0
                      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-rose-200 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/40"
                  }`}
                >
                  <td className="py-3.5 px-2 text-base font-extrabold text-slate-900 dark:text-white">
                    3. Lợi nhuận ròng (Lãi / Lỗ = 1 - 2)
                  </td>
                  <td
                    className={`py-3.5 px-2 text-right text-base font-black tabular-nums whitespace-nowrap ${
                      netProfit >= 0
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {formatVnd(netProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Cash Flow & Payables/Receivables Card */}
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
              Thực thu, Thực chi &amp; Công nợ
            </h2>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Theo dõi tiền mặt và chuyển khoản đã thực nhận so với nghĩa vụ chi trả.
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div>
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Thực thu trong kỳ
                  </p>
                  {bookingPayments && bookingPayments.depositCount > 0 && (
                    <p className="mt-0.5 text-xs text-emerald-700 text-pretty dark:text-emerald-400">
                      Gồm {bookingPayments.depositCount} giao dịch đặt phòng (
                      {formatVnd(bookingPayments.totalReceived)})
                    </p>
                  )}
                </div>
                <span className="text-base font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-300">
                  {formatVnd(collectedRevenue)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đã thực chi vận hành
                </span>
                <span className="text-base font-bold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                  {formatVnd(paidOperatingExpense)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Dòng tiền ròng (Thực thu - Thực chi)
                  </p>
                </div>
                <span
                  className={`text-lg font-black tabular-nums whitespace-nowrap ${
                    netCashFlow >= 0
                      ? "text-slate-900 dark:text-white"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {formatVnd(netCashFlow)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                    Khách chưa thanh toán
                  </p>
                  <p className="mt-1 text-base font-extrabold text-amber-800 tabular-nums dark:text-amber-300">
                    {formatVnd(uncollectedRevenue)}
                  </p>
                  {receivables && (
                    <p className="mt-1 text-xs text-amber-700 text-pretty dark:text-amber-400">
                      Công nợ mở: {formatVnd(receivables.totalOutstanding)} (
                      {receivables.openCount} hồ sơ)
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-rose-200/80 bg-rose-50/60 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/20">
                  <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">
                    Chi phí chờ thanh toán
                  </p>
                  <p className="mt-1 text-base font-extrabold text-rose-700 tabular-nums dark:text-rose-300">
                    {formatVnd(unpaidOperatingExpense)}
                  </p>
                  <p className="mt-1 text-xs text-rose-700 text-pretty dark:text-rose-400">
                    Khoản chi đã ghi nhận nhưng chưa trả hết.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {isOwnerSpace && (
              <>
                <Link
                  href={`${billingHref}?tab=expenses`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap dark:bg-emerald-600"
                >
                  <VsIcon name="add_card" className="text-base" />
                  Ghi nhận / quản lý chi phí
                </Link>
                <Link
                  href={`${billingHref}?tab=receivables`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Sổ công nợ phải thu
                </Link>
              </>
            )}
            <Link
              href={`${pathname}?tab=book`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Mở Sổ doanh thu
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Expense Category Breakdown */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
                Cơ cấu chi phí theo nhóm
              </h2>
              <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
                Phân bổ các khoản chi vận hành và phí SaaS trong kỳ.
              </p>
            </div>
            {isOwnerSpace && (
              <Link
                href={`${billingHref}?tab=expenses`}
                className="text-xs font-bold text-emerald-700 hover:underline whitespace-nowrap dark:text-emerald-400"
              >
                Chi tiết →
              </Link>
            )}
          </div>

          {expenseCategories.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-sm font-medium text-slate-600 text-pretty dark:text-slate-400">
                Chưa có khoản chi phí vận hành hay phí SaaS phát sinh trong kỳ này.
              </p>
              {isOwnerSpace && (
                <Link
                  href={`${billingHref}?tab=expenses`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  Thêm khoản chi đầu tiên
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {expenseCategories.map((cat) => (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {cat.categoryLabel}
                      </span>
                      <span className="ml-2 text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                        {cat.count} khoản · {cat.sharePercent.toFixed(1)}%
                      </span>
                    </div>
                    <span className="font-bold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                      {formatVnd(cat.amount)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, cat.sharePercent))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    <span>Đã trả: {formatVnd(cat.paidAmount)}</span>
                    <span>Còn nợ: {formatVnd(cat.unpaidAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 12-Month Thu / Chi / P&L Comparison */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
                Đối chiếu Thu · Chi · Lãi/Lỗ 12 tháng
              </h2>
              <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
                So sánh tổng doanh thu (xanh) với tổng chi phí (đỏ) từng tháng gần nhất.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                Doanh thu
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-rose-700 dark:text-rose-400">
                <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" />
                Tổng chi
              </span>
            </div>
          </div>

          <div className="mt-6 flex h-60 items-end gap-2.5 overflow-x-auto pb-2 pt-10">
            {revenueByMonth.map((m) => {
              const revHeight =
                m.totalRevenue > 0
                  ? Math.max(8, Math.round((m.totalRevenue / maxMonthlyMetric) * 100))
                  : 3;
              const exp = m.expense ?? 0;
              const expHeight =
                exp > 0
                  ? Math.max(8, Math.round((exp / maxMonthlyMetric) * 100))
                  : 3;
              const profit = m.netProfit ?? m.totalRevenue - exp;

              return (
                <div
                  key={m.month}
                  className="group relative flex h-full min-w-[60px] flex-1 flex-col items-center justify-end"
                >
                  <div className="pointer-events-none absolute -top-12 z-20 hidden rounded-xl bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                    <p className="font-bold">{m.monthLabel}</p>
                    <p className="mt-0.5 tabular-nums">Thu: {formatVnd(m.totalRevenue)}</p>
                    <p className="tabular-nums">Chi: {formatVnd(exp)}</p>
                    <p className="font-bold tabular-nums">
                      Lãi/Lỗ: {formatVnd(profit)}
                    </p>
                  </div>

                  <span
                    className={`mb-1.5 text-xs font-bold tabular-nums whitespace-nowrap ${
                      profit > 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : profit < 0
                          ? "text-rose-700 dark:text-rose-400"
                          : "text-slate-400"
                    }`}
                  >
                    {profit !== 0 ? formatCompactVnd(profit) : "0"}
                  </span>

                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div
                      className={`w-1/2 max-w-[18px] rounded-t-md transition-all ${
                        m.totalRevenue > 0
                          ? "bg-emerald-600 group-hover:bg-emerald-500"
                          : "bg-slate-200 dark:bg-slate-800"
                      }`}
                      style={{ height: `${revHeight}%` }}
                    />
                    <div
                      className={`w-1/2 max-w-[18px] rounded-t-md transition-all ${
                        exp > 0
                          ? "bg-rose-500 group-hover:bg-rose-400"
                          : "bg-slate-200 dark:bg-slate-800"
                      }`}
                      style={{ height: `${expHeight}%` }}
                    />
                  </div>

                  <span className="mt-2 text-xs font-semibold text-slate-700 whitespace-nowrap dark:text-slate-300">
                    {m.monthLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
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

      {/* On-Books Pacing & Advance Commitments Card */}
      <section className="rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/50 via-white to-emerald-50/30 p-6 shadow-sm dark:border-teal-900/60 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/30">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                <VsIcon name="book_online" className="text-base" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
                Tiến độ Đã bán trên sổ (On-Books vs Thực tế)
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Theo dõi sức bán tổng thể kết hợp giữa lượt lưu trú thực tế đã phát sinh và các đơn đặt phòng trước trong tương lai chưa nhận phòng.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-teal-800 dark:border-teal-800 dark:bg-slate-800 dark:text-teal-300">
            <span>
              Quỹ phòng: {summary.totalRooms} phòng (
              {(summary.totalAvailableRoomNights ?? summary.availableRoomNights) != null
                ? `${summary.totalAvailableRoomNights ?? summary.availableRoomNights} đêm`
                : "Chưa xác định theo phòng"}
              )
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Thực tế lưu trú */}
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1. Thực tế đã lưu trú
            </span>
            <p className="mt-2 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
              {formatVnd(summary.roomRevenue)}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <div className="flex justify-between">
                <span>Đêm phòng đã bán:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{summary.totalRoomNights} đêm</span>
              </div>
              <div className="flex justify-between">
                <span>Công suất thực tế (OCC):</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatPercent(summary.occupancyRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Giá bán bình quân (ADR):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formatVnd(summary.adr)}</span>
              </div>
            </div>
          </div>

          {/* 2. Đặt trước trên sổ */}
          <div className="rounded-xl border border-teal-200/80 bg-white/90 p-4 dark:border-teal-800/60 dark:bg-slate-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              2. Đặt trước tương lai (On-Books)
            </span>
            <p className="mt-2 text-xl font-extrabold text-teal-700 tabular-nums dark:text-teal-400">
              {formatVnd(summary.projectedRoomRevenue ?? 0)}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <div className="flex justify-between">
                <span>Đêm phòng tương lai:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{summary.projectedRoomNights ?? 0} đêm</span>
              </div>
              <div className="flex justify-between">
                <span>Tỷ lệ lấp đầy thêm:</span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {summary.onBooksOccupancyRate != null && summary.occupancyRate != null
                    ? `+${formatPercent(Math.max(0, summary.onBooksOccupancyRate - summary.occupancyRate))}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Trạng thái:</span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">Chờ nhận phòng</span>
              </div>
            </div>
          </div>

          {/* 3. Tổng trên sổ (On-Books Total) */}
          <div className="rounded-xl border border-emerald-200/80 bg-white/90 p-4 dark:border-emerald-800/60 dark:bg-slate-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              3. Tổng tiền phòng trên sổ
            </span>
            <p className="mt-2 text-xl font-extrabold text-emerald-800 tabular-nums dark:text-emerald-300">
              {formatVnd(summary.onBooksRoomRevenue ?? summary.onBooksRevenue ?? (summary.roomRevenue + (summary.projectedRoomRevenue ?? 0)))}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <div className="flex justify-between">
                <span>Tổng đêm phòng trên sổ:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {summary.onBooksRoomNights ?? summary.onBooksRooms ?? (summary.totalRoomNights + (summary.projectedRoomNights ?? 0))} đêm
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tổng công suất trên sổ:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatPercent(summary.onBooksOccupancyRate ?? summary.occupancyRate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ADR bình quân trên sổ:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatVnd(summary.onBooksAdr ?? summary.adr)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Tiến độ lấp đầy (Pacing Bar) */}
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              4. Tiến độ lấp đầy quỹ phòng
            </span>
            <p className="mt-2 text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">
              {formatPercent(summary.onBooksOccupancyRate ?? summary.occupancyRate)}
            </p>
            <div className="mt-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 flex">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, summary.occupancyRate ?? 0)}%` }}
                  title={`Thực tế: ${formatPercent(summary.occupancyRate)}`}
                />
                <div
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100 - Math.min(100, summary.occupancyRate ?? 0),
                      Math.max(
                        0,
                        (summary.onBooksOccupancyRate ?? summary.occupancyRate ?? 0) -
                          (summary.occupancyRate ?? 0),
                      ),
                    )}%`,
                  }}
                  title={`Đặt trước: +${formatPercent(
                    summary.onBooksOccupancyRate != null && summary.occupancyRate != null
                      ? Math.max(0, summary.onBooksOccupancyRate - summary.occupancyRate)
                      : null,
                  )}`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" /> Thực tế
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-500 inline-block" /> Đặt trước
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Còn trống:{" "}
                  {(summary.totalAvailableRoomNights ?? summary.availableRoomNights) != null
                    ? Math.max(
                        0,
                        (summary.totalAvailableRoomNights ?? summary.availableRoomNights ?? 0) -
                          (summary.onBooksRoomNights ?? summary.onBooksRooms ?? summary.totalRoomNights),
                      )
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

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
  const [chartMode, setChartMode] = useState<"revenue" | "pnl" | "occupancy" | "onbooks">("revenue");
  const [onlyActiveDays, setOnlyActiveDays] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);

  const maxDayRevenue = Math.max(...revenueByDay.map((d) => d.totalRevenue), 1);
  const maxDayAbsPnl = Math.max(...revenueByDay.map((d) => Math.abs(d.netProfit ?? 0)), 1);
  const maxDayOcc = Math.max(...revenueByDay.map((d) => d.occupancyRate ?? 0), 10);
  const maxDayOnBooks = Math.max(
    ...revenueByDay.map((d) => d.onBooksRevenue ?? d.totalRevenue),
    1,
  );

  const filteredDays = useMemo(() => {
    if (!onlyActiveDays) return revenueByDay;
    return revenueByDay.filter(
      (d) => d.totalRevenue > 0 || (d.expense ?? 0) > 0 || d.roomsOccupied > 0,
    );
  }, [revenueByDay, onlyActiveDays]);

  const totals = useMemo(() => {
    let roomRev = 0;
    let serviceRev = 0;
    let totalRev = 0;
    let expenseSum = 0;
    let netProfitSum = 0;
    let roomsOccSum = 0;
    let occSum = 0;
    let occKnownCount = 0;
    for (const d of filteredDays) {
      roomRev += d.roomRevenue;
      serviceRev += d.serviceRevenue;
      totalRev += d.totalRevenue;
      const dayExpense = d.expense ?? 0;
      expenseSum += dayExpense;
      netProfitSum += d.netProfit ?? d.totalRevenue - dayExpense;
      roomsOccSum += d.roomsOccupied;
      if (d.occupancyRate != null) {
        occSum += d.occupancyRate;
        occKnownCount += 1;
      }
    }
    const avgAdr = roomsOccSum > 0 ? Math.round(roomRev / roomsOccSum) : 0;
    const avgOcc = occKnownCount > 0 ? occSum / occKnownCount : null;
    return {
      roomRev,
      serviceRev,
      totalRev,
      expenseSum,
      netProfitSum,
      roomsOccSum,
      avgAdr,
      avgOcc,
    };
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
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 whitespace-nowrap dark:text-white">
                {formatVietnameseDate(item.date, {
                  includeWeekday: true,
                  timeZone,
                })}
              </span>
              {item.isFuture && (
                <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs font-bold text-teal-800 whitespace-nowrap dark:bg-teal-950 dark:text-teal-300">
                  Đặt trước
                </span>
              )}
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
          const item = row.original;
          const count = item.roomsOccupied;
          const onBooks = item.onBooksRooms ?? count;
          return (
            <div className="text-right whitespace-nowrap tabular-nums">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {count > 0 ? (
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
                    {count} phòng
                  </span>
                ) : (
                  <span className="text-slate-400">0 phòng</span>
                )}
              </span>
              {onBooks > count && (
                <span className="block text-xs font-semibold text-teal-700 dark:text-teal-400">
                  (Trên sổ: {onBooks})
                </span>
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
        id: "expense",
        accessorFn: (row) => row.expense ?? 0,
        header: ({ column }) => (
          <SortHeaderButton
            label="Chi phí"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const val = row.original.expense ?? 0;
          return (
            <div
              className={`text-right font-semibold whitespace-nowrap tabular-nums ${
                val > 0
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-slate-400"
              }`}
            >
              {formatVnd(val)}
            </div>
          );
        },
      },
      {
        id: "netProfit",
        accessorFn: (row) =>
          row.netProfit ?? row.totalRevenue - (row.expense ?? 0),
        header: ({ column }) => (
          <SortHeaderButton
            label="Lãi / Lỗ ròng"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const val =
            row.original.netProfit ??
            row.original.totalRevenue - (row.original.expense ?? 0);
          return (
            <div
              className={`text-right font-bold whitespace-nowrap tabular-nums ${
                val > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : val < 0
                    ? "text-rose-700 dark:text-rose-400"
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
          const occNum = occ ?? 0;
          return (
            <div className="text-right whitespace-nowrap tabular-nums">
              <span
                className={`inline-block rounded-md px-2.5 py-1 text-sm font-bold whitespace-nowrap ${
                  occ == null
                    ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    : occNum >= 50
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : occNum > 0
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
              onClick={() => setChartMode("pnl")}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all whitespace-nowrap ${
                chartMode === "pnl"
                  ? "bg-white text-blue-800 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Lãi / Lỗ (₫)
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
            <button
              type="button"
              onClick={() => setChartMode("onbooks")}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all whitespace-nowrap ${
                chartMode === "onbooks"
                  ? "bg-white text-teal-800 shadow-sm dark:bg-slate-900 dark:text-teal-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Trên sổ (On-books)
            </button>
          </div>
        </div>

        <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2 pt-8">
          {revenueByDay.map((day) => {
            const dayExpense = day.expense ?? 0;
            const dayNetProfit = day.netProfit ?? day.totalRevenue - dayExpense;
            const isRevenueMode = chartMode === "revenue";
            const isPnlMode = chartMode === "pnl";
            const isOnBooksMode = chartMode === "onbooks";
            const rawVal = isRevenueMode
              ? day.totalRevenue
              : isPnlMode
                ? dayNetProfit
                : isOnBooksMode
                  ? (day.onBooksRevenue ?? day.totalRevenue)
                  : (day.occupancyRate ?? 0);
            const maxVal = isRevenueMode
              ? maxDayRevenue
              : isPnlMode
                ? maxDayAbsPnl
                : isOnBooksMode
                  ? maxDayOnBooks
                  : maxDayOcc;
            const absVal = Math.abs(rawVal);
            const heightPercent =
              absVal > 0 ? Math.max(12, Math.round((absVal / maxVal) * 100)) : 3;
            const topLabel = isRevenueMode
              ? day.totalRevenue > 0
                ? formatCompactVnd(day.totalRevenue)
                : "0"
              : isPnlMode
                ? dayNetProfit !== 0
                  ? formatCompactVnd(dayNetProfit)
                  : "0"
                : isOnBooksMode
                  ? (day.onBooksRevenue ?? day.totalRevenue) > 0
                    ? formatCompactVnd(day.onBooksRevenue ?? day.totalRevenue)
                    : "0"
                  : day.occupancyRate != null
                    ? `${Math.round(day.occupancyRate)}%`
                    : "—";

            const barColorClass =
              absVal === 0
                ? "bg-slate-200 dark:bg-slate-800"
                : isRevenueMode
                  ? "bg-emerald-600 group-hover:bg-emerald-500"
                  : isPnlMode
                    ? dayNetProfit >= 0
                      ? "bg-emerald-600 group-hover:bg-emerald-500"
                      : "bg-rose-500 group-hover:bg-rose-400"
                    : isOnBooksMode
                      ? day.isFuture
                        ? "bg-teal-600 group-hover:bg-teal-500"
                        : "bg-emerald-700 group-hover:bg-emerald-600"
                      : "bg-purple-600 group-hover:bg-purple-500";

            return (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[44px]"
              >
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-16 z-20 hidden rounded-xl bg-slate-900 px-3 py-1.5 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">
                    {formatVietnameseDate(day.date, {
                      includeWeekday: true,
                      timeZone,
                    })}
                  </p>
                  {isOnBooksMode ? (
                    <p className="mt-0.5 tabular-nums">
                      {day.isFuture ? "Tương lai: " : "Thực tế: "}
                      {formatVnd(day.totalRevenue)} · Đặt trước: {formatVnd(day.projectedRevenue ?? 0)} · Tổng: {formatVnd(day.onBooksRevenue ?? day.totalRevenue)}
                    </p>
                  ) : (
                    <p className="mt-0.5 tabular-nums">
                      Thu {formatVnd(day.totalRevenue)} · Chi {formatVnd(dayExpense)} · Lãi/Lỗ{" "}
                      {formatVnd(dayNetProfit)}
                    </p>
                  )}
                </div>

                {/* Top Value Label matching Bar Height */}
                <span
                  className={`mb-1.5 text-xs font-bold tabular-nums whitespace-nowrap ${
                    isPnlMode && dayNetProfit < 0
                      ? "text-rose-700 dark:text-rose-400"
                      : absVal > 0
                        ? "text-slate-800 dark:text-slate-200"
                        : "text-slate-400"
                  }`}
                >
                  {topLabel}
                </span>

                {/* Bar */}
                <div
                  className={`w-full rounded-t-lg transition-all duration-200 ${barColorClass}`}
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
                Chỉ hiện ngày có phát sinh ({revenueByDay.filter((d) => d.totalRevenue > 0 || (d.expense ?? 0) > 0 || d.roomsOccupied > 0).length} ngày)
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
                  <td className="px-4 py-3.5 text-right font-bold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                    {formatVnd(totals.expenseSum)}
                  </td>
                  <td
                    className={`px-4 py-3.5 text-right font-extrabold tabular-nums whitespace-nowrap ${
                      totals.netProfitSum >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {formatVnd(totals.netProfitSum)}
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
// 3. Monthly Revenue Panel (with @tanstack/react-table, MoM/YoY, Targets & Quarterly Strip)
// ----------------------------------------------------------------------
function MonthlyRevenuePanel({
  reports,
  hotelId,
  pathname,
  onTargetSaved,
}: {
  reports: HotelReportsData;
  hotelId: string;
  pathname: string;
  onTargetSaved: () => void;
}) {
  const { revenueByMonth } = reports;
  const quarterlySummary: QuarterlyRevenueSummaryItem[] =
    reports.quarterlySummary ?? [];
  const canManageTargets =
    reports.canManageTargets ?? pathname.startsWith("/owner");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "month", desc: true },
  ]);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);

  const maxMonthRev = Math.max(...revenueByMonth.map((m) => m.totalRevenue), 1);

  const totals = useMemo(() => {
    let roomRev = 0;
    let serviceRev = 0;
    let totalRev = 0;
    let expenseSum = 0;
    let netProfitSum = 0;
    let bookings = 0;
    let roomsSold = 0;
    let occSum = 0;
    let occKnownCount = 0;
    let targetSum = 0;
    let actualOnTargetedMonths = 0;
    for (const m of revenueByMonth) {
      roomRev += m.roomRevenue;
      serviceRev += m.serviceRevenue;
      totalRev += m.totalRevenue;
      const monthExpense = m.expense ?? 0;
      expenseSum += monthExpense;
      netProfitSum += m.netProfit ?? m.totalRevenue - monthExpense;
      bookings += m.bookingCount;
      roomsSold += m.roomsSold;
      if (m.averageOccupancy != null) {
        occSum += m.averageOccupancy;
        occKnownCount += 1;
      }
      if (m.targetRevenue != null && m.targetRevenue > 0) {
        targetSum += m.targetRevenue;
        actualOnTargetedMonths += m.totalRevenue;
      }
    }
    const avgOcc = occKnownCount > 0 ? occSum / occKnownCount : null;
    const avgAdr = roomsSold > 0 ? Math.round(roomRev / roomsSold) : 0;
    const targetAchievementPct =
      targetSum > 0 ? (actualOnTargetedMonths / targetSum) * 100 : null;
    return {
      roomRev,
      serviceRev,
      totalRev,
      expenseSum,
      netProfitSum,
      bookings,
      roomsSold,
      avgOcc,
      avgAdr,
      targetSum,
      targetAchievementPct,
    };
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
        id: "momChangePercent",
        accessorFn: (row) => row.momChangePercent ?? undefined,
        sortUndefined: "last",
        header: ({ column }) => (
          <SortHeaderButton
            label="So tháng trước"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right whitespace-nowrap">
            <ChangePercentBadge
              value={row.original.momChangePercent}
              compareTitle={
                row.original.previousMonthRevenue != null
                  ? `Tháng trước: ${formatVnd(row.original.previousMonthRevenue)}`
                  : undefined
              }
            />
          </div>
        ),
      },
      {
        id: "yoyChangePercent",
        accessorFn: (row) => row.yoyChangePercent ?? undefined,
        sortUndefined: "last",
        header: ({ column }) => (
          <SortHeaderButton
            label="Cùng kỳ năm trước"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-right whitespace-nowrap">
            <ChangePercentBadge
              value={row.original.yoyChangePercent}
              compareTitle={
                row.original.previousYearRevenue != null
                  ? `Cùng kỳ năm trước: ${formatVnd(row.original.previousYearRevenue)}`
                  : undefined
              }
            />
          </div>
        ),
      },
      {
        id: "targetRevenue",
        accessorFn: (row) =>
          row.targetAchievementPercent ??
          (row.targetRevenue != null && row.targetRevenue > 0
            ? (row.totalRevenue / row.targetRevenue) * 100
            : undefined),
        sortUndefined: "last",
        header: ({ column }) => (
          <SortHeaderButton
            label="Mục tiêu & Tiến độ"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const target = row.original.targetRevenue;
          if (target == null || target <= 0) {
            return (
              <div className="text-right text-sm text-slate-400 whitespace-nowrap">
                Chưa đặt
              </div>
            );
          }
          const pct =
            row.original.targetAchievementPercent ??
            (row.original.totalRevenue / target) * 100;
          const barWidth = Math.min(100, Math.max(0, pct));
          const achieved = pct >= 100;
          return (
            <div
              className="min-w-[164px] space-y-1 text-right tabular-nums"
              title={`Mục tiêu: ${formatVnd(target)} · Đạt ${formatPercent(pct)}`}
            >
              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {formatCompactVnd(target)}
                </span>
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
                    achieved
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : pct >= 75
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {formatPercent(pct)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    achieved
                      ? "bg-emerald-600"
                      : pct >= 75
                        ? "bg-blue-600"
                        : "bg-amber-500"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: "expense",
        accessorFn: (row) => row.expense ?? 0,
        header: ({ column }) => (
          <SortHeaderButton
            label="Chi phí"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const val = row.original.expense ?? 0;
          return (
            <div
              className={`text-right font-semibold tabular-nums whitespace-nowrap ${
                val > 0
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-slate-400"
              }`}
            >
              {formatVnd(val)}
            </div>
          );
        },
      },
      {
        id: "netProfit",
        accessorFn: (row) =>
          row.netProfit ?? row.totalRevenue - (row.expense ?? 0),
        header: ({ column }) => (
          <SortHeaderButton
            label="Lãi / Lỗ ròng"
            align="right"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const val =
            row.original.netProfit ??
            row.original.totalRevenue - (row.original.expense ?? 0);
          return (
            <div
              className={`text-right font-bold tabular-nums whitespace-nowrap ${
                val > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : val < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-slate-400"
              }`}
            >
              {formatVnd(val)}
            </div>
          );
        },
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
                <div className="pointer-events-none absolute -top-20 z-20 hidden rounded-xl bg-slate-900 px-3 py-1.5 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">{m.monthLabel}</p>
                  <p className="mt-0.5 tabular-nums">
                    Thu {formatVnd(m.totalRevenue)} · Chi {formatVnd(m.expense ?? 0)} · Lãi/Lỗ{" "}
                    {formatVnd(m.netProfit ?? m.totalRevenue - (m.expense ?? 0))}
                  </p>
                  {m.targetRevenue != null && m.targetRevenue > 0 && (
                    <p className="mt-0.5 tabular-nums">
                      Mục tiêu {formatVnd(m.targetRevenue)} (
                      {formatPercent(
                        m.targetAchievementPercent ??
                          (m.totalRevenue / m.targetRevenue) * 100,
                      )}
                      )
                    </p>
                  )}
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

      {/* Quarterly Progress Summary Strip */}
      {quarterlySummary.length > 0 && (
        <section
          aria-label="Tiến độ doanh thu theo quý"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 text-balance dark:text-white">
              Tiến độ theo Quý
            </h2>
            <p className="text-sm text-slate-600 text-pretty dark:text-slate-400">
              Tổng hợp thực đạt so với mục tiêu doanh thu và lợi nhuận từng quý.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quarterlySummary.map((item) => {
              const hasTarget =
                item.targetRevenue != null && item.targetRevenue > 0;
              const pct =
                item.achievementPercent ??
                (hasTarget
                  ? (item.actualRevenue / item.targetRevenue!) * 100
                  : null);
              const barWidth =
                pct != null ? Math.min(100, Math.max(0, pct)) : 0;
              const achieved = pct != null && pct >= 100;

              return (
                <article
                  key={item.quarter}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.label}
                    </span>
                    {pct != null ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${
                          achieved
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : pct >= 75
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {formatPercent(pct)}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap dark:text-slate-400">
                        {item.monthsIncluded} tháng
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xl font-black tracking-tight text-slate-900 tabular-nums dark:text-white">
                    {formatVnd(item.actualRevenue)}
                  </p>
                  {hasTarget && (
                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          achieved
                            ? "bg-emerald-600"
                            : (pct ?? 0) >= 75
                              ? "bg-blue-600"
                              : "bg-amber-500"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                    <span>
                      {hasTarget
                        ? `Mục tiêu: ${formatCompactVnd(item.targetRevenue!)}`
                        : "Chưa đặt mục tiêu"}
                    </span>
                    <span
                      className={
                        item.netProfit >= 0
                          ? "font-semibold text-emerald-700 dark:text-emerald-400"
                          : "font-semibold text-rose-700 dark:text-rose-400"
                      }
                    >
                      Lãi/Lỗ: {formatCompactVnd(item.netProfit)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Monthly Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200/90 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
              Bảng tổng hợp doanh thu 12 tháng qua
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Đối chiếu biến động MoM, cùng kỳ năm trước (YoY) và tiến độ hoàn thành mục tiêu tháng.
            </p>
          </div>
          {canManageTargets && (
            <button
              type="button"
              disabled={revenueByMonth.length === 0}
              onClick={() => setIsTargetModalOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 print:hidden dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <VsIcon name="edit" className="text-lg" />
              Đặt mục tiêu tháng
            </button>
          )}
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
                <td className="px-4 py-3.5 text-right text-slate-400 whitespace-nowrap">
                  —
                </td>
                <td className="px-4 py-3.5 text-right text-slate-400 whitespace-nowrap">
                  —
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                  {totals.targetSum > 0 ? (
                    <span>
                      {formatCompactVnd(totals.targetSum)}
                      {totals.targetAchievementPct != null
                        ? ` (${formatPercent(totals.targetAchievementPct)})`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-rose-700 tabular-nums whitespace-nowrap dark:text-rose-400">
                  {formatVnd(totals.expenseSum)}
                </td>
                <td
                  className={`px-4 py-3.5 text-right font-extrabold tabular-nums whitespace-nowrap ${
                    totals.netProfitSum >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {formatVnd(totals.netProfitSum)}
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

      {isTargetModalOpen && revenueByMonth.length > 0 && (
        <MonthlyRevenueTargetModal
          hotelId={hotelId}
          months={revenueByMonth}
          onClose={() => setIsTargetModalOpen(false)}
          onSaved={onTargetSaved}
        />
      )}
    </div>
  );
}

function MonthlyRevenueTargetModal({
  hotelId,
  months,
  onClose,
  onSaved,
}: {
  hotelId: string;
  months: MonthlyRevenueItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const monthSelectId = useId();
  const amountInputId = useId();
  const upsertTargetMutation = useUpsertRevenueTarget(hotelId);

  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => b.month.localeCompare(a.month)),
    [months],
  );

  const defaultMonth = sortedMonths[0];
  const [selectedMonth, setSelectedMonth] = useState<string>(
    defaultMonth?.month ?? "",
  );
  const [amountInput, setAmountInput] = useState<string>(
    defaultMonth?.targetRevenue != null && defaultMonth.targetRevenue > 0
      ? String(defaultMonth.targetRevenue)
      : "",
  );
  const [validationError, setValidationError] = useState<string>("");

  const currentMonthItem = useMemo(
    () => sortedMonths.find((item) => item.month === selectedMonth) ?? sortedMonths[0],
    [sortedMonths, selectedMonth],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !upsertTargetMutation.isPending) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, upsertTargetMutation.isPending]);

  function handleSelectMonth(nextMonth: string) {
    setSelectedMonth(nextMonth);
    setValidationError("");
    const found = sortedMonths.find((item) => item.month === nextMonth);
    setAmountInput(
      found?.targetRevenue != null && found.targetRevenue > 0
        ? String(found.targetRevenue)
        : "",
    );
  }

  const parsedPreviewAmount = useMemo(() => {
    const trimmed = amountInput.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }, [amountInput]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (upsertTargetMutation.isPending) return;

    const trimmed = amountInput.trim();
    const numericValue = trimmed === "" ? Number.NaN : Number(trimmed);
    if (!selectedMonth) {
      setValidationError("Vui lòng chọn tháng áp dụng mục tiêu.");
      return;
    }
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setValidationError("Số tiền mục tiêu phải là số không âm (nhập 0 để xóa mục tiêu).");
      return;
    }

    setValidationError("");
    try {
      await upsertTargetMutation.upsertTarget({
        month: selectedMonth,
        targetAmount: Math.round(numericValue),
      });
      const label = currentMonthItem?.monthLabel ?? selectedMonth;
      const rounded = Math.round(numericValue);
      onClose();
      onSaved();
      if (rounded === 0) {
        await showSuccessAlert(
          "Đã xóa mục tiêu tháng",
          `Đã gỡ mục tiêu doanh thu cho ${label}.`,
        );
      } else {
        await showSuccessAlert(
          "Đã lưu mục tiêu doanh thu",
          `${label}: ${formatVnd(rounded)}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof HttpError && error.status >= 500
          ? "Không thể lưu mục tiêu tháng. Vui lòng thử lại sau."
          : error;
      await showErrorAlert("Không thể lưu mục tiêu tháng", message);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs print:hidden"
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          !upsertTargetMutation.isPending
        ) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h3
              id={titleId}
              className="text-xl font-bold text-slate-900 text-balance dark:text-white"
            >
              Đặt mục tiêu doanh thu tháng
            </h3>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Chọn tháng và nhập mức doanh thu mục tiêu (VND). Nhập 0 để xóa mục tiêu.
            </p>
          </div>
          <button
            type="button"
            disabled={upsertTargetMutation.isPending}
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <VsIcon name="close" className="text-xl" />
          </button>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 p-6">
          <div className="space-y-1.5">
            <label
              htmlFor={monthSelectId}
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Tháng áp dụng
            </label>
            <select
              id={monthSelectId}
              value={selectedMonth}
              disabled={upsertTargetMutation.isPending}
              onChange={(event) => handleSelectMonth(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-medium text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {sortedMonths.map((item) => (
                <option key={item.month} value={item.month}>
                  {item.monthLabel}
                  {item.targetRevenue != null && item.targetRevenue > 0
                    ? ` (Mục tiêu hiện tại: ${formatCompactVnd(item.targetRevenue)})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {currentMonthItem && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Doanh thu thực đạt
                </dt>
                <dd className="mt-1 font-bold text-slate-900 tabular-nums dark:text-white">
                  {formatVnd(currentMonthItem.totalRevenue)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Mục tiêu hiện tại
                </dt>
                <dd className="mt-1 font-bold text-emerald-800 tabular-nums dark:text-emerald-400">
                  {currentMonthItem.targetRevenue != null &&
                  currentMonthItem.targetRevenue > 0
                    ? formatVnd(currentMonthItem.targetRevenue)
                    : "Chưa đặt"}
                </dd>
              </div>
            </dl>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor={amountInputId}
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Số tiền mục tiêu (VND)
            </label>
            <input
              id={amountInputId}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              required
              disabled={upsertTargetMutation.isPending}
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setValidationError("");
              }}
              placeholder="Ví dụ: 150000000"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-semibold text-slate-900 tabular-nums focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <p className="text-xs text-slate-600 text-pretty dark:text-slate-400">
              {parsedPreviewAmount === null
                ? "Nhập số tiền mục tiêu bằng VND, hoặc nhập 0 để xóa mục tiêu tháng."
                : parsedPreviewAmount === 0
                  ? "Giá trị 0 sẽ xóa mục tiêu doanh thu của tháng đã chọn."
                  : `Hiển thị: ${formatVnd(Math.round(parsedPreviewAmount))}`}
            </p>
          </div>

          {validationError && (
            <p role="alert" className="text-sm font-semibold text-rose-700 text-pretty dark:text-rose-400">
              {validationError}
            </p>
          )}

          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              disabled={upsertTargetMutation.isPending}
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={upsertTargetMutation.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-800 px-5 py-2 text-base font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {upsertTargetMutation.isPending ? "Đang lưu…" : "Lưu mục tiêu"}
            </button>
          </footer>
        </form>
      </div>
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
      {/* Visual Channel Distribution Bars */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
          Phân bổ doanh thu theo kênh phân phối
        </h2>
        <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
          Biểu đồ tỷ trọng thị phần và doanh thu phòng giữa các kênh OTA, đại lý và đặt phòng trực tiếp.
        </p>

        {/* Stacked Percentage Bar */}
        <div className="mt-5">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {revenueBySource.map((s, idx) => {
              const colors = [
                "bg-emerald-600",
                "bg-blue-600",
                "bg-purple-600",
                "bg-amber-500",
                "bg-teal-600",
                "bg-indigo-600",
              ];
              const colorClass = colors[idx % colors.length];
              return (
                <div
                  key={s.sourceKey}
                  className={`h-full ${colorClass} transition-all duration-300`}
                  style={{ width: `${Math.max(1, s.sharePercent)}%` }}
                  title={`${s.sourceName}: ${formatPercent(s.sharePercent)} (${formatVnd(s.totalRevenue)})`}
                />
              );
            })}
          </div>

          {/* Channel Legend & Mini Cards */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {revenueBySource.map((s, idx) => {
              const borderColors = [
                "border-emerald-200 dark:border-emerald-900/60",
                "border-blue-200 dark:border-blue-900/60",
                "border-purple-200 dark:border-purple-900/60",
                "border-amber-200 dark:border-amber-900/60",
                "border-teal-200 dark:border-teal-900/60",
                "border-indigo-200 dark:border-indigo-900/60",
              ];
              const dotColors = [
                "bg-emerald-600",
                "bg-blue-600",
                "bg-purple-600",
                "bg-amber-500",
                "bg-teal-600",
                "bg-indigo-600",
              ];
              return (
                <div
                  key={s.sourceKey}
                  className={`rounded-xl border ${borderColors[idx % borderColors.length]} bg-slate-50/60 p-3.5 dark:bg-slate-800/40`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className={`h-2.5 w-2.5 rounded-full ${dotColors[idx % dotColors.length]} shrink-0`} />
                      <span className="text-sm font-bold text-slate-900 truncate dark:text-white">
                        {s.sourceName}
                      </span>
                    </div>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs whitespace-nowrap dark:bg-slate-700 dark:text-slate-200">
                      {formatPercent(s.sharePercent)}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-extrabold text-slate-900 tabular-nums dark:text-white">
                    {formatVnd(s.totalRevenue)}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-600 tabular-nums dark:text-slate-400">
                    <span>{s.bookingCount} đơn đặt ({s.roomNights ?? s.bookingCount} đêm)</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-400">ADR: {formatVnd(s.adr)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

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

      {reports.marketDimensions && (
        <MarketDimensionsSection dimensions={reports.marketDimensions} />
      )}
    </div>
  );
}

const MARKET_DIMENSION_TABS = [
  { key: "nationality", label: "Quốc tịch" },
  { key: "roomType", label: "Loại phòng" },
  { key: "room", label: "Từng phòng" },
  { key: "partner", label: "Đối tác" },
  { key: "owner", label: "Nhân viên" },
] as const;

function MarketDimensionsSection({
  dimensions,
}: {
  dimensions: NonNullable<HotelReportsData["marketDimensions"]>;
}) {
  const [activeDim, setActiveDim] =
    useState<(typeof MARKET_DIMENSION_TABS)[number]["key"]>("nationality");
  const rows = dimensions[activeDim] ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          actualRevenue: acc.actualRevenue + row.actualRevenue,
          projectedRevenue: acc.projectedRevenue + row.projectedRevenue,
          actualNights: acc.actualNights + row.actualNights,
          projectedNights: acc.projectedNights + row.projectedNights,
          bookingCount: acc.bookingCount + row.bookingCount,
          guestCount: acc.guestCount + row.guestCount,
        }),
        {
          actualRevenue: 0,
          projectedRevenue: 0,
          actualNights: 0,
          projectedNights: 0,
          bookingCount: 0,
          guestCount: 0,
        },
      ),
    [rows],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200/90 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl text-balance dark:text-white">
            Phân tích doanh thu theo chiều thị trường
          </h2>
          <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
            Tách riêng doanh thu thực tế đã ghi nhận và doanh thu dự kiến đặt trước theo từng chiều đối soát.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
          {MARKET_DIMENSION_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveDim(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeDim === tab.key
                  ? "bg-white text-emerald-800 shadow-2xs dark:bg-slate-900 dark:text-emerald-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/90 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Nhóm phân tích</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Lượt đặt</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Khách</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Đêm thực tế</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Đêm dự kiến</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Doanh thu thực tế</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Dự kiến đặt trước</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  Chưa có dữ liệu trong kỳ cho chiều phân tích này.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap dark:text-white">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {row.bookingCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {row.guestCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {row.actualNights}
                  </td>
                  <td className="px-4 py-3 text-right text-teal-700 tabular-nums whitespace-nowrap dark:text-teal-400">
                    {row.projectedNights}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                    {formatVnd(row.actualRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-teal-700 tabular-nums whitespace-nowrap dark:text-teal-400">
                    {formatVnd(row.projectedRevenue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
              <tr>
                <td className="px-4 py-3 whitespace-nowrap">Tổng cộng cùng kỳ</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{totals.bookingCount}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{totals.guestCount}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{totals.actualNights}</td>
                <td className="px-4 py-3 text-right text-teal-700 tabular-nums whitespace-nowrap dark:text-teal-400">{totals.projectedNights}</td>
                <td className="px-4 py-3 text-right font-extrabold text-emerald-800 tabular-nums whitespace-nowrap dark:text-emerald-400">
                  {formatVnd(totals.actualRevenue)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-teal-700 tabular-nums whitespace-nowrap dark:text-teal-400">
                  {formatVnd(totals.projectedRevenue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
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
