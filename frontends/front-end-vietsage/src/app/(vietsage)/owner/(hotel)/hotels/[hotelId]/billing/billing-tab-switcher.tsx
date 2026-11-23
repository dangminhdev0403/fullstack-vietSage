"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";
import { formatMoney } from "@/features/billing/utils/money";
import { BillingFolioTableClient } from "./billing-folio-table-client";
import { BillingReceivablesTableClient } from "./billing-receivables-table-client";
import { HotelExpensesClient } from "./hotel-expenses-client";
import { OwnerSaasBillingClient } from "./owner-saas-billing-client";

export type MonthlyFinanceSummary = {
  totalRevenue: number;
  collectedRevenue: number;
  totalExpense: number;
  unpaidExpense: number;
  netProfit: number;
  profitMargin: number;
  currency: string;
};

type BillingTab = "folios" | "receivables" | "expenses" | "saas";
type BillingGroupId = "folios-receivables" | "expenses-saas";

type BillingSubTabOption = {
  id: BillingTab;
  label: string;
  icon: string;
};

type BillingGroupOption = {
  id: BillingGroupId;
  label: string;
  icon: string;
  defaultTab: BillingTab;
  subTabs: readonly BillingSubTabOption[];
};

const BILLING_GROUPS: readonly BillingGroupOption[] = [
  {
    id: "folios-receivables",
    label: "Hóa đơn & Công nợ",
    icon: "receipt_long",
    defaultTab: "folios",
    subTabs: [
      { id: "folios", label: "Hóa đơn lưu trú", icon: "receipt_long" },
      { id: "receivables", label: "Sổ công nợ phải thu", icon: "account_balance_wallet" },
    ],
  },
  {
    id: "expenses-saas",
    label: "Chi phí & Phí SaaS",
    icon: "payments",
    defaultTab: "expenses",
    subTabs: [
      { id: "expenses", label: "Chi phí vận hành", icon: "payments" },
      { id: "saas", label: "Đối soát Phí VietSage SaaS", icon: "analytics" },
    ],
  },
];

type BillingTabSwitcherProps = {
  hotelId: string;
  foliosPage: BillingPage<FolioListItem>;
  monthlyFinanceSummary?: MonthlyFinanceSummary | null;
};

function resolveBillingTab(raw: string | null | undefined): BillingTab {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "receivables" ||
    normalized === "expenses" ||
    normalized === "saas" ||
    normalized === "folios"
  ) {
    return normalized;
  }
  return "folios";
}

function resolveBillingGroup(tab: BillingTab): BillingGroupOption {
  const groupId: BillingGroupId =
    tab === "expenses" || tab === "saas" ? "expenses-saas" : "folios-receivables";
  return BILLING_GROUPS.find((group) => group.id === groupId) ?? BILLING_GROUPS[0];
}

export function BillingTabSwitcher({
  hotelId,
  foliosPage,
  monthlyFinanceSummary,
}: BillingTabSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = resolveBillingTab(searchParams?.get("tab"));

  const [activeTab, setActiveTab] = useState<BillingTab>(urlTab);
  const [prevUrlTab, setPrevUrlTab] = useState<BillingTab>(urlTab);
  if (prevUrlTab !== urlTab) {
    setPrevUrlTab(urlTab);
    setActiveTab(urlTab);
  }

  const handleSelectTab = (nextTab: BillingTab) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const activeGroup = resolveBillingGroup(activeTab);
  const activeSubTabLabel =
    activeGroup.subTabs.find((subTab) => subTab.id === activeTab)?.label ?? activeGroup.label;

  return (
    <div className="space-y-6">
      {monthlyFinanceSummary ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Tổng hợp Thu · Chi · Lãi/Lỗ tháng này
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab !== "expenses" ? (
                <button
                  type="button"
                  onClick={() => handleSelectTab("expenses")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-bold text-slate-800 hover:bg-slate-200/80 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f] dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <VsIcon name="payments" className="text-base shrink-0" />
                  <span>Mở sổ chi phí</span>
                </button>
              ) : null}
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/reports?tab=pnl`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#25483f] px-3.5 py-2 text-sm font-bold text-white hover:bg-[#1c3831] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f] dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                <VsIcon name="trending_up" className="text-base shrink-0" />
                <span>Báo cáo Lãi/Lỗ (P&amp;L)</span>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50/90 p-3.5 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tổng doanh thu tháng
              </div>
              <div className="mt-1 text-lg font-black text-emerald-800 tabular-nums dark:text-emerald-400">
                {formatMoney(monthlyFinanceSummary.totalRevenue, monthlyFinanceSummary.currency)}
              </div>
              <div className="mt-0.5 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                Thực thu: {formatMoney(monthlyFinanceSummary.collectedRevenue, monthlyFinanceSummary.currency)}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/90 p-3.5 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tổng chi phí (gồm SaaS)
              </div>
              <div className="mt-1 text-lg font-black text-rose-700 tabular-nums dark:text-rose-400">
                {formatMoney(monthlyFinanceSummary.totalExpense, monthlyFinanceSummary.currency)}
              </div>
              <div className="mt-0.5 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                Chưa trả: {formatMoney(monthlyFinanceSummary.unpaidExpense, monthlyFinanceSummary.currency)}
              </div>
            </div>

            <div
              className={`rounded-xl p-3.5 ${
                monthlyFinanceSummary.netProfit >= 0
                  ? "bg-emerald-50/80 dark:bg-emerald-950/35"
                  : "bg-rose-50/80 dark:bg-rose-950/35"
              }`}
            >
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lợi nhuận ròng (Lãi/Lỗ)
              </div>
              <div
                className={`mt-1 text-lg font-black tabular-nums ${
                  monthlyFinanceSummary.netProfit >= 0
                    ? "text-emerald-800 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {monthlyFinanceSummary.netProfit >= 0 ? "+" : ""}
                {formatMoney(monthlyFinanceSummary.netProfit, monthlyFinanceSummary.currency)}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                Biên lợi nhuận: {monthlyFinanceSummary.profitMargin.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/90 p-3.5 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Dòng tiền mặt ước tính
              </div>
              <div className="mt-1 text-lg font-black text-slate-900 tabular-nums dark:text-white">
                {formatMoney(
                  monthlyFinanceSummary.collectedRevenue -
                    (monthlyFinanceSummary.totalExpense - monthlyFinanceSummary.unpaidExpense),
                  monthlyFinanceSummary.currency,
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Thực thu trừ thực chi
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        {/* Tier 1 (Mobile only): Primary group navigation mirroring desktop sidebar */}
        <div
          role="tablist"
          aria-label="Nhóm tài chính"
          className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-[#ece7dc]/90 p-1.5 dark:bg-slate-800/90 md:hidden"
        >
          {BILLING_GROUPS.map((group) => {
            const isGroupActive = group.id === activeGroup.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={isGroupActive}
                onClick={() => {
                  if (!isGroupActive) {
                    handleSelectTab(group.defaultTab);
                  }
                }}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f] ${
                  isGroupActive
                    ? "bg-[#25483f] text-white shadow-xs dark:bg-emerald-700 dark:text-white"
                    : "text-[#35463e] hover:bg-white/70 hover:text-[#17201b] dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                }`}
              >
                <VsIcon name={group.icon} className="text-lg shrink-0" />
                <span>{group.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tier 2 (Desktop & Mobile): Segmented sub-view switcher for active group */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label={activeGroup.label}
            className="inline-flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl bg-[#ece7dc]/80 p-1.5 dark:bg-slate-800/80"
          >
            {activeGroup.subTabs.map((subTab) => {
              const isSubActive = activeTab === subTab.id;
              return (
                <button
                  key={subTab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSubActive}
                  onClick={() => handleSelectTab(subTab.id)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f] ${
                    isSubActive
                      ? "bg-white text-[#25483f] shadow-xs dark:bg-slate-900 dark:text-emerald-400"
                      : "text-slate-700 hover:bg-white/60 hover:text-[#17201b] dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                  }`}
                >
                  <VsIcon
                    name={subTab.icon}
                    className={`text-lg shrink-0 ${
                      isSubActive
                        ? "text-[#25483f] dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  />
                  <span>{subTab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div role="tabpanel" aria-label={activeSubTabLabel}>
        {activeTab === "folios" ? (
          <BillingFolioTableClient hotelId={hotelId} foliosPage={foliosPage} />
        ) : activeTab === "receivables" ? (
          <BillingReceivablesTableClient hotelId={hotelId} />
        ) : activeTab === "expenses" ? (
          <HotelExpensesClient hotelId={hotelId} />
        ) : (
          <OwnerSaasBillingClient hotelId={hotelId} />
        )}
      </div>
    </div>
  );
}
