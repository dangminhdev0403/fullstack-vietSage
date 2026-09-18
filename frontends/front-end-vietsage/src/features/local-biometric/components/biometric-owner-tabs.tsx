"use client";

import { useState } from "react";
import { WorkstationConnectionPanel } from "./workstation-connection-panel";
import { WorkstationTestScanPanel } from "./workstation-test-scan-panel";
import { MobileCccdConnectionPanel } from "./mobile-cccd-connection-panel";
import { MobileCccdTestScanPanel } from "./mobile-cccd-test-scan-panel";

export function BiometricOwnerTabs({ hotelId }: { hotelId: string }) {
  const [activeTab, setActiveTab] = useState<"scanner" | "mobile">("scanner");

  return (
    <div className="space-y-6">
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab("scanner")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
            activeTab === "scanner"
              ? "border-[#000080] text-[#000080]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <span>Máy quét chuyên dụng (HN-212)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("mobile")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
            activeTab === "mobile"
              ? "border-[#000080] text-[#000080]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
          </svg>
          <span>Điện thoại quét QR CCCD</span>
        </button>
      </div>

      {activeTab === "scanner" ? (
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <WorkstationConnectionPanel hotelId={hotelId} />
          <WorkstationTestScanPanel hotelId={hotelId} />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <MobileCccdConnectionPanel hotelId={hotelId} />
          <MobileCccdTestScanPanel hotelId={hotelId} />
        </div>
      )}
    </div>
  );
}
