"use client";

import { useState, type ReactNode } from "react";

export function BillingTabSwitcher({
  folioComponent,
  saasComponent,
}: {
  hotelId?: string;
  folioComponent: ReactNode;
  saasComponent: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"folios" | "saas">("folios");

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("folios")}
            className={`border-b-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === "folios"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Hóa đơn Folio Khách
          </button>
          <button
            onClick={() => setActiveTab("saas")}
            className={`border-b-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === "saas"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Đối soát Phí VietSage SaaS
          </button>
        </nav>
      </div>

      {activeTab === "folios" ? folioComponent : saasComponent}
    </div>
  );
}
