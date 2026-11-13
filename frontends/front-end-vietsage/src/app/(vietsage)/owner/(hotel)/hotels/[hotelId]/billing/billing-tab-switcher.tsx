"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";
import Link from "next/link";
import { BillingFolioTableClient } from "./billing-folio-table-client";
import { OwnerSaasBillingClient } from "./owner-saas-billing-client";
import { BillingReceivablesTableClient } from "./billing-receivables-table-client";
import { HotelExpensesClient } from "./hotel-expenses-client";
import { formatMoney } from "@/features/billing/utils/money";

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

type BillingTabSwitcherProps = {
  hotelId: string;
  foliosPage: BillingPage<FolioListItem>;
  monthlyFinanceSummary?: MonthlyFinanceSummary | null;
};

function resolveBillingTab(raw: string | null | undefined): BillingTab {
  if (raw === "receivables" || raw === "expenses" || raw === "saas" || raw === "folios") {
    return raw;
  }
  return "folios";
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

  return (
    <div className="space-y-6">
      {monthlyFinanceSummary ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm md:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Tổng hợp Thu · Chi · Lãi/Lỗ tháng này
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectTab("expenses")}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Mở sổ chi phí
              </button>
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/reports?tab=pnl`}
                className="inline-flex items-center rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                Báo cáo Lãi/Lỗ (P&amp;L)
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tổng doanh thu tháng
              </div>
              <div className="mt-1 text-lg font-black text-emerald-800 tabular-nums dark:text-emerald-400">
                {formatMoney(monthlyFinanceSummary.totalRevenue, monthlyFinanceSummary.currency)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                Thực thu: {formatMoney(monthlyFinanceSummary.collectedRevenue, monthlyFinanceSummary.currency)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tổng chi phí (gồm SaaS)
              </div>
              <div className="mt-1 text-lg font-black text-rose-700 tabular-nums dark:text-rose-400">
                {formatMoney(monthlyFinanceSummary.totalExpense, monthlyFinanceSummary.currency)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                Chưa trả: {formatMoney(monthlyFinanceSummary.unpaidExpense, monthlyFinanceSummary.currency)}
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                monthlyFinanceSummary.netProfit >= 0
                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                  : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/30"
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

            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
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
              <div className="mt-0.5 text-xs text-slate-500">Thực thu trừ thực chi</div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900/80 w-fit md:hidden">
        <button
          type="button"
          onClick={() => handleSelectTab("folios")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
            activeTab === "folios"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="text-base">📄</span>
          <span>Hóa đơn lưu trú</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab("receivables")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
            activeTab === "receivables"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="text-base">💳</span>
          <span>Sổ Công nợ Phải thu</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab("expenses")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
            activeTab === "expenses"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="text-base">🧾</span>
          <span>Chi phí vận hành</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab("saas")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
            activeTab === "saas"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="text-base">📊</span>
          <span>Đối soát Phí VietSage SaaS</span>
        </button>
      </div>

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
  );
}
