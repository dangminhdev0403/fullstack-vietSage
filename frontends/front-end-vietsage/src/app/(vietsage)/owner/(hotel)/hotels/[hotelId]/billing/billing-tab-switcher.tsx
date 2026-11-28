"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";
import { BillingFolioTableClient } from "./billing-folio-table-client";
import { BillingReceivablesTableClient } from "./billing-receivables-table-client";
import { HotelExpensesClient } from "./hotel-expenses-client";
import { OwnerSaasBillingClient } from "./owner-saas-billing-client";
import { DailyCashMovementsClient } from "@/features/billing/components/daily-cash-movements-client";

type BillingTab = "cashbook" | "folios" | "receivables" | "expenses" | "saas";
type BillingGroupId = "cash-flow" | "folios-receivables" | "expenses-saas";

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
    id: "cash-flow",
    label: "Thu chi & Dòng tiền",
    icon: "account_balance",
    defaultTab: "cashbook",
    subTabs: [
      { id: "cashbook", label: "Sổ thu chi thực tế", icon: "account_balance" },
    ],
  },
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
};

function resolveBillingTab(raw: string | null | undefined): BillingTab {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "cashbook" ||
    normalized === "cash-movements" ||
    normalized === "cash_movements" ||
    normalized === "cashflow"
  ) {
    return "cashbook";
  }
  if (
    normalized === "receivables" ||
    normalized === "expenses" ||
    normalized === "saas" ||
    normalized === "folios"
  ) {
    return normalized as BillingTab;
  }
  return "folios";
}

function resolveBillingGroup(tab: BillingTab): BillingGroupOption {
  let groupId: BillingGroupId = "folios-receivables";
  if (tab === "cashbook") groupId = "cash-flow";
  else if (tab === "expenses" || tab === "saas") groupId = "expenses-saas";
  return BILLING_GROUPS.find((group) => group.id === groupId) ?? BILLING_GROUPS[0];
}

export function BillingTabSwitcher({
  hotelId,
  foliosPage,
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
        {activeTab === "cashbook" ? (
          <DailyCashMovementsClient hotelId={hotelId} />
        ) : activeTab === "folios" ? (
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
