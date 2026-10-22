"use client";

import { useId, useTransition, useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type {
  HotelReportsData,
  GetHotelReportsQuery,
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
  { key: "14d", label: "14 ngày qua" },
  { key: "30d", label: "30 ngày qua" },
  { key: "90d", label: "90 ngày qua" },
  { key: "this_month", label: "Tháng này" },
  { key: "last_month", label: "Tháng trước" },
  { key: "this_year", label: "Năm nay" },
];

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function HotelReportsWorkspaceClient({
  initialReports,
  hotelId,
}: HotelReportsWorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const tabParam = searchParams.get("tab") as ReportSubTab | null;
  const activeTab: ReportSubTab =
    tabParam && SUB_TABS.some((t) => t.id === tabParam)
      ? tabParam
      : "overview";

  const currentRange =
    (searchParams.get("range") as GetHotelReportsQuery["range"]) ||
    initialReports.range ||
    "30d";

  const [reports, setReports] = useState<HotelReportsData>(initialReports);
  const rangeSelectId = useId();

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  function handleTabChange(tab: ReportSubTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const newUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
    startTransition(() => {
      router.replace(newUrl, { scroll: false });
    });
  }

  function handleRangeChange(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    const newUrl = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.push(newUrl);
    });
  }

  const { summary } = reports;

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Báo cáo &amp; Phân tích dữ liệu thực tế
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl text-balance dark:text-white">
            Trung tâm báo cáo &amp; thống kê khách sạn
          </h1>
          <p className="mt-1 text-xs text-slate-600 md:text-sm text-pretty dark:text-slate-400">
            Dữ liệu tổng hợp từ hóa đơn folio, thanh toán thực thu, công suất phòng và hồ sơ lưu trú thực tế.
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={rangeSelectId} className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Kỳ báo cáo:
          </label>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-800 dark:bg-slate-900">
            {RANGE_OPTIONS.map((opt) => {
              const active = currentRange === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleRangeChange(opt.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                    active
                      ? "bg-white font-bold text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* KPI Headline Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Tổng doanh thu thực thu
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <VsIcon name="payments" className="text-lg" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {formatVnd(summary.totalRevenue)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Tiền phòng: {formatVnd(summary.roomRevenue)}</span>
            <span>Dịch vụ: {formatVnd(summary.serviceRevenue)}</span>
          </div>
        </article>

        {/* ADR (Average Daily Rate) */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Giá bán bình quân (ADR)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <VsIcon name="trending_up" className="text-lg" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-blue-700 dark:text-blue-400">
            {formatVnd(summary.adr)}
          </p>
          <p className="mt-2 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Doanh thu bình quân mỗi đêm phòng bán được trong kỳ.
          </p>
        </article>

        {/* OCC (Occupancy Rate) */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Công suất phòng (OCC)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <VsIcon name="bed" className="text-lg" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700 dark:text-purple-400">
            {formatPercent(summary.occupancyRate)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Hiện tại: {formatPercent(summary.currentOccupancyRate)}</span>
            <span>Đang ở: {summary.occupiedRoomsNow}/{summary.totalRooms} phòng</span>
          </div>
        </article>

        {/* RevPAR */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Doanh thu mỗi phòng (RevPAR)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <VsIcon name="hotel" className="text-lg" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-400">
            {formatVnd(summary.revpar)}
          </p>
          <p className="mt-2 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Doanh thu phòng chia trên toàn bộ số phòng sẵn có.
          </p>
        </article>
      </section>

      {/* Sub-Tabs Navigation */}
      <nav aria-label="Các danh mục báo cáo chi tiết" className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900/80">
        {SUB_TABS.map((subTab) => {
          const isActive = activeTab === subTab.id;
          return (
            <button
              key={subTab.id}
              type="button"
              onClick={() => handleTabChange(subTab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? "bg-white text-emerald-800 shadow-sm dark:bg-slate-800 dark:text-emerald-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <VsIcon name={subTab.icon} className="text-sm" />
              <span>{subTab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* In-Place Sub-Tab Panels */}
      {activeTab === "overview" && (
        <OverviewPanel reports={reports} />
      )}

      {activeTab === "daily" && (
        <DailyRevenuePanel reports={reports} />
      )}

      {activeTab === "monthly" && (
        <MonthlyRevenuePanel reports={reports} />
      )}

      {activeTab === "sources" && (
        <SourceRevenuePanel reports={reports} />
      )}

      {activeTab === "staff" && (
        <StaffRevenuePanel reports={reports} />
      )}

      {activeTab === "demographics" && (
        <DemographicsPanel reports={reports} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Overview Panel
// ----------------------------------------------------------------------
function OverviewPanel({ reports }: { reports: HotelReportsData }) {
  const { summary, paymentMethods, revenueBySource } = reports;
  const totalBilled = summary.roomRevenue + summary.serviceRevenue + summary.otherRevenue || summary.totalRevenue || 1;

  const roomPct = Math.round((summary.roomRevenue / totalBilled) * 100);
  const servicePct = Math.round((summary.serviceRevenue / totalBilled) * 100);
  const otherPct = Math.max(0, 100 - roomPct - servicePct);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenue Structure Breakdown */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
            Cơ cấu doanh thu phát sinh
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Phân bổ giữa tiền phòng, dịch vụ bổ sung và các khoản phụ thu.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Tiền phòng ({roomPct}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatVnd(summary.roomRevenue)}</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${roomPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Dịch vụ &amp; F&amp;B ({servicePct}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatVnd(summary.serviceRevenue)}</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${servicePct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Phụ thu &amp; Điều chỉnh ({otherPct}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatVnd(summary.otherRevenue)}</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${otherPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-slate-600 dark:text-slate-400">Lượt lưu trú</p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{summary.totalStays}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400">Số khách đến</p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{summary.totalGuests}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400">Đêm phòng bán</p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{summary.totalRoomNights}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Payment Methods Distribution */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
            Phương thức thanh toán đã đối soát
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Dòng tiền thực thu từ khách lưu trú phân bổ theo phương thức.
          </p>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {paymentMethods.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-600 dark:text-slate-400">
                Chưa có giao dịch thanh toán thành công trong kỳ này.
              </p>
            ) : (
              paymentMethods.map((pm) => (
                <div key={pm.method} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <VsIcon name="credit_card" className="text-xs" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{pm.methodName}</p>
                      <p className="text-slate-600 dark:text-slate-400">{pm.count} giao dịch</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 dark:text-white">{formatVnd(pm.amount)}</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatPercent(pm.percentage)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Channel Summary Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
          Tỷ trọng nguồn khách &amp; Kênh bán
        </h2>
        <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
          So sánh hiệu quả giữa các kênh OTA và kênh đặt trực tiếp.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {revenueBySource.map((s) => (
            <div
              key={s.sourceKey}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {s.sourceName}
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 whitespace-nowrap">
                  {formatPercent(s.sharePercent)}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                {formatVnd(s.totalRevenue)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>{s.bookingCount} đặt phòng</span>
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
// 2. Daily Revenue Panel
// ----------------------------------------------------------------------
function DailyRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByDay } = reports;
  const maxDayRevenue = Math.max(...revenueByDay.map((d) => d.totalRevenue), 1);

  return (
    <div className="space-y-6">
      {/* Visual Chart Bars */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
          Biểu đồ doanh thu &amp; công suất phòng từng ngày
        </h2>
        <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
          Quan sát xu hướng doanh thu phát sinh và tỷ lệ lấp đầy theo từng ngày trong kỳ.
        </p>

        <div className="mt-6 flex h-48 items-end gap-1.5 overflow-x-auto pb-2 pt-6">
          {revenueByDay.map((day) => {
            const heightPercent = Math.max(8, Math.round((day.totalRevenue / maxDayRevenue) * 100));
            return (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[32px]"
              >
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-12 z-20 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">{day.date}</p>
                  <p>{formatVnd(day.totalRevenue)} (OCC {formatPercent(day.occupancyRate)})</p>
                </div>

                {/* OCC Indicator Pill */}
                <span className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {Math.round(day.occupancyRate)}%
                </span>

                {/* Revenue Bar */}
                <div
                  className="w-full rounded-t-md bg-emerald-600 transition-all duration-200 group-hover:bg-emerald-500"
                  style={{ height: `${heightPercent}%` }}
                />

                {/* Date Label */}
                <span className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {day.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Daily Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 text-balance dark:text-white">
            Bảng chi tiết doanh thu theo ngày
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Ngày</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tiền phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tiền dịch vụ</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tổng doanh thu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Phòng ở</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Giá ADR</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Công suất OCC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {revenueByDay.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-600 dark:text-slate-400">
                    Không có dữ liệu trong khoảng thời gian đã chọn.
                  </td>
                </tr>
              ) : (
                revenueByDay.map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {day.date} ({day.dayLabel})
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatVnd(day.roomRevenue)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatVnd(day.serviceRevenue)}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatVnd(day.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {day.roomsOccupied} phòng
                    </td>
                    <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">
                      {formatVnd(day.adr)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                        {formatPercent(day.occupancyRate)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. Monthly Revenue Panel
// ----------------------------------------------------------------------
function MonthlyRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByMonth } = reports;
  const maxMonthRev = Math.max(...revenueByMonth.map((m) => m.totalRevenue), 1);

  return (
    <div className="space-y-6">
      {/* Monthly Chart */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
          Xu hướng doanh thu theo tháng (12 tháng gần nhất)
        </h2>
        <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
          Theo dõi chu kỳ kinh doanh và hiệu quả mùa vụ của khách sạn.
        </p>

        <div className="mt-6 flex h-48 items-end gap-2 overflow-x-auto pb-2 pt-6">
          {revenueByMonth.map((m) => {
            const h = Math.max(8, Math.round((m.totalRevenue / maxMonthRev) * 100));
            return (
              <div
                key={m.month}
                className="group relative flex flex-1 flex-col items-center justify-end h-full min-w-[48px]"
              >
                <div className="pointer-events-none absolute -top-12 z-20 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-center text-xs text-white shadow-lg group-hover:block whitespace-nowrap dark:bg-white dark:text-slate-900">
                  <p className="font-bold">{m.monthLabel}</p>
                  <p>{formatVnd(m.totalRevenue)} (OCC {formatPercent(m.averageOccupancy)})</p>
                </div>

                <div
                  className="w-full rounded-t-md bg-blue-600 transition-all duration-200 group-hover:bg-blue-500"
                  style={{ height: `${h}%` }}
                />

                <span className="mt-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {m.monthLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Monthly Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 text-balance dark:text-white">
            Bảng tổng hợp doanh thu 12 tháng qua
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tháng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tiền phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tiền dịch vụ</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tổng doanh thu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Lượt đặt</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Đêm bán</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">OCC bình quân</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">ADR bình quân</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {revenueByMonth.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                    {m.monthLabel}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {formatVnd(m.roomRevenue)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {formatVnd(m.serviceRevenue)}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatVnd(m.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {m.bookingCount} lượt
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {m.roomsSold} đêm
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      {formatPercent(m.averageOccupancy)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">
                    {formatVnd(m.adr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. Source Revenue Panel
// ----------------------------------------------------------------------
function SourceRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueBySource } = reports;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
            Hiệu quả doanh thu theo kênh đặt phòng &amp; OTA
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Chi tiết số lượng phòng, doanh thu và giá bán bình quân (ADR) của từng kênh bán hàng.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Kênh đặt phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Phân loại</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Số lượt đặt</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Số lượng khách</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tổng doanh thu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tỷ trọng (%)</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Giá ADR kênh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {revenueBySource.map((s) => (
                <tr key={s.sourceKey} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {s.sourceName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        s.sourceType === "OTA"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : s.sourceType === "DIRECT"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {s.sourceType === "OTA" ? "Kênh OTA" : s.sourceType === "DIRECT" ? "Trực tiếp" : "Tại quầy"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {s.bookingCount} đặt phòng
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {s.guestCount} khách
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatVnd(s.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {formatPercent(s.sharePercent)}
                  </td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">
                    {formatVnd(s.adr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 5. Staff Revenue Panel
// ----------------------------------------------------------------------
function StaffRevenuePanel({ reports }: { reports: HotelReportsData }) {
  const { revenueByStaff } = reports;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
            Doanh thu thực thu &amp; giao dịch theo nhân viên
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Theo dõi chi tiết số tiền đã thu qua thu ngân lễ tân và phương thức thanh toán từng ca làm việc.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Nhân viên / Thu ngân</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Vai trò</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tổng tiền đã thu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Số giao dịch</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tiền mặt</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Chuyển khoản</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Thẻ POS</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Lượt tiếp nhận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {revenueByStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-600 dark:text-slate-400">
                    Chưa có giao dịch thanh toán nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                revenueByStaff.map((staff) => (
                  <tr key={staff.staffId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {staff.staffName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {staff.role}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {formatVnd(staff.collectedAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {staff.transactionCount} lần
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatVnd(staff.cashAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatVnd(staff.bankTransferAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatVnd(staff.cardAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {staff.staysHandled} lượt
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// 6. Demographics Panel
// ----------------------------------------------------------------------
function DemographicsPanel({ reports }: { reports: HotelReportsData }) {
  const { guestAnalytics } = reports;
  const { nationalities, genderDistribution, domesticVsInternational } = guestAnalytics;

  return (
    <div className="space-y-6">
      {/* Ratio Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Domestic vs International */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 text-balance dark:text-white">
            Cơ cấu khách nội địa vs quốc tế
          </h2>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-slate-600 dark:text-slate-400">Khách Việt Nam</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {domesticVsInternational.domestic} ({formatPercent(domesticVsInternational.domesticPercentage)})
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-600 dark:text-slate-400">Khách Quốc tế</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                {domesticVsInternational.international} ({formatPercent(domesticVsInternational.internationalPercentage)})
              </p>
            </div>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${domesticVsInternational.domesticPercentage}%` }}
            />
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${domesticVsInternational.internationalPercentage}%` }}
            />
          </div>
        </section>

        {/* Gender Breakdown */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 text-balance dark:text-white">
            Phân bổ giới tính khách lưu trú
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-blue-50/70 p-3 dark:bg-blue-950/30">
              <p className="text-blue-800 dark:text-blue-300 font-semibold">Nam</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{genderDistribution.male}</p>
            </div>
            <div className="rounded-xl bg-pink-50/70 p-3 dark:bg-pink-950/30">
              <p className="text-pink-800 dark:text-pink-300 font-semibold">Nữ</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{genderDistribution.female}</p>
            </div>
            <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-800/40">
              <p className="text-slate-600 dark:text-slate-400 font-semibold">Chưa rõ</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{genderDistribution.unspecified + genderDistribution.other}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Nationality Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 text-balance dark:text-white">
            Bảng phân bổ quốc tịch khách lưu trú
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 text-pretty dark:text-slate-400">
            Dữ liệu trích xuất từ CCCD/Hộ chiếu trong hồ sơ nhận phòng và khai báo tạm trú.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Quốc tịch</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Số lượng khách</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tỷ lệ (%)</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tổng đêm phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Thời gian lưu trú bình quân</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {nationalities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600 dark:text-slate-400">
                    Chưa có thông tin quốc tịch nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                nationalities.map((item) => (
                  <tr key={item.nationality} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {item.nationality}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {item.guestCount} khách
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatPercent(item.percentage)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {item.totalRoomNights} đêm
                    </td>
                    <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">
                      {item.averageStayNights.toFixed(1)} đêm/lượt
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
