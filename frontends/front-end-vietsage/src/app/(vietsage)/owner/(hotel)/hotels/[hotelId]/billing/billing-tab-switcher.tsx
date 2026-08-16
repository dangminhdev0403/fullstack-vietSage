"use client";

import { useState } from "react";
import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";
import { BillingFolioTableClient } from "./billing-folio-table-client";
import { OwnerSaasBillingClient } from "./owner-saas-billing-client";

type BillingTabSwitcherProps = {
  hotelId: string;
  foliosPage: BillingPage<FolioListItem>;
};

export function BillingTabSwitcher({ hotelId, foliosPage }: BillingTabSwitcherProps) {
  const [activeTab, setActiveTab] = useState<"folios" | "saas">("folios");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900/80 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("folios")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${
            activeTab === "folios"
              ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="text-base">📄</span>
          <span>Hóa đơn Folio Khách</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("saas")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${
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
      ) : (
        <OwnerSaasBillingClient hotelId={hotelId} />
      )}
    </div>
  );
}
