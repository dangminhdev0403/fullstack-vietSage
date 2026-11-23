"use client";

import Link from "next/link";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export type ReportWorkspaceTab =
  | "overview"
  | "pnl"
  | "book"
  | "daily"
  | "monthly"
  | "sources"
  | "staff"
  | "demographics";

export type ReportClientTab = Exclude<ReportWorkspaceTab, "book">;

export type ReportsNavigationProps = {
  activeTab: ReportWorkspaceTab;
  pathname: string;
  from?: string;
  to?: string;
  onSelectClientTab?: (tab: ReportClientTab) => void;
};

const REVENUE_GROUP_TABS: ReadonlyArray<ReportWorkspaceTab> = [
  "book",
  "daily",
  "monthly",
  "staff",
];

const MARKET_GROUP_TABS: ReadonlyArray<ReportWorkspaceTab> = [
  "sources",
  "demographics",
];

const PRIMARY_MOBILE_GROUPS: ReadonlyArray<{
  target: ReportWorkspaceTab;
  label: string;
  icon: string;
  matches: ReadonlyArray<ReportWorkspaceTab>;
}> = [
  {
    target: "overview",
    label: "Tổng quan & KPIs",
    icon: "dashboard",
    matches: ["overview"],
  },
  {
    target: "pnl",
    label: "Kết quả KD & Lãi lỗ",
    icon: "trending_up",
    matches: ["pnl"],
  },
  {
    target: "book",
    label: "Sổ doanh thu",
    icon: "receipt_long",
    matches: REVENUE_GROUP_TABS,
  },
  {
    target: "sources",
    label: "Kênh & Thị trường",
    icon: "hub",
    matches: MARKET_GROUP_TABS,
  },
];

const REVENUE_SEGMENTS: ReadonlyArray<{
  id: ReportWorkspaceTab;
  label: string;
  icon: string;
}> = [
  { id: "book", label: "Chi tiết bút toán", icon: "receipt_long" },
  { id: "daily", label: "Theo ngày", icon: "calendar_today" },
  { id: "monthly", label: "Theo tháng", icon: "table_chart" },
  { id: "staff", label: "Thu ngân & NV", icon: "badge" },
];

const MARKET_SEGMENTS: ReadonlyArray<{
  id: ReportWorkspaceTab;
  label: string;
  icon: string;
}> = [
  { id: "sources", label: "Kênh đặt phòng", icon: "hub" },
  { id: "demographics", label: "Nguồn khách & Quốc tịch", icon: "globe" },
];

export function buildReportTabHref(
  pathname: string,
  tab: ReportWorkspaceTab,
  from?: string,
  to?: string,
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `${pathname}?${params.toString()}`;
}

export function ReportsPrimaryMobileNav({
  activeTab,
  pathname,
  from,
  to,
  onSelectClientTab,
}: ReportsNavigationProps) {
  return (
    <nav
      aria-label="Danh mục báo cáo chính"
      className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/90 bg-slate-100/90 p-1.5 md:hidden print:hidden dark:border-slate-800 dark:bg-slate-900/80"
    >
      {PRIMARY_MOBILE_GROUPS.map((group) => {
        const isGroupActive = group.matches.includes(activeTab);
        const className = `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
          isGroupActive
            ? "bg-white text-emerald-900 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-emerald-300 dark:ring-slate-700"
            : "text-slate-700 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
        }`;

        if (activeTab === group.target) {
          return (
            <button
              key={group.target}
              type="button"
              aria-current="page"
              className={className}
            >
              <VsIcon name={group.icon} className="text-lg" />
              <span>{group.label}</span>
            </button>
          );
        }

        if (
          group.target === "book" ||
          activeTab === "book" ||
          !onSelectClientTab
        ) {
          return (
            <Link
              key={group.target}
              href={buildReportTabHref(pathname, group.target, from, to)}
              aria-current={isGroupActive ? "page" : undefined}
              className={className}
            >
              <VsIcon name={group.icon} className="text-lg" />
              <span>{group.label}</span>
            </Link>
          );
        }

        const targetTab: ReportClientTab = group.target;
        return (
          <button
            key={group.target}
            type="button"
            aria-current={isGroupActive ? "page" : undefined}
            onClick={() => onSelectClientTab(targetTab)}
            className={className}
          >
            <VsIcon name={group.icon} className="text-lg" />
            <span>{group.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function ReportsGroupSegmentedBar({
  activeTab,
  pathname,
  from,
  to,
  onSelectClientTab,
}: ReportsNavigationProps) {
  const isRevenueGroup = REVENUE_GROUP_TABS.includes(activeTab);
  const isMarketGroup = MARKET_GROUP_TABS.includes(activeTab);

  if (!isRevenueGroup && !isMarketGroup) {
    return null;
  }

  const segments = isRevenueGroup ? REVENUE_SEGMENTS : MARKET_SEGMENTS;
  const ariaLabel = isRevenueGroup
    ? "Chế độ xem sổ doanh thu và đối soát"
    : "Chế độ xem kênh đặt phòng và thị trường khách";

  return (
    <nav aria-label={ariaLabel} className="print:hidden">
      <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/90 bg-slate-100/90 p-1.5 dark:border-slate-800 dark:bg-slate-900/80">
        {segments.map((segment) => {
          const isActive = activeTab === segment.id;
          const className = `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
            isActive
              ? "bg-emerald-800 text-white shadow-xs dark:bg-emerald-600"
              : "text-slate-700 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          }`;

          if (isActive) {
            return (
              <button
                key={segment.id}
                type="button"
                aria-current="page"
                className={className}
              >
                <VsIcon name={segment.icon} className="text-lg" />
                <span>{segment.label}</span>
              </button>
            );
          }

          if (
            segment.id === "book" ||
            activeTab === "book" ||
            !onSelectClientTab
          ) {
            return (
              <Link
                key={segment.id}
                href={buildReportTabHref(pathname, segment.id, from, to)}
                className={className}
              >
                <VsIcon name={segment.icon} className="text-lg" />
                <span>{segment.label}</span>
              </Link>
            );
          }

          const targetTab: ReportClientTab = segment.id;
          return (
            <button
              key={segment.id}
              type="button"
              onClick={() => onSelectClientTab(targetTab)}
              className={className}
            >
              <VsIcon name={segment.icon} className="text-lg" />
              <span>{segment.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
