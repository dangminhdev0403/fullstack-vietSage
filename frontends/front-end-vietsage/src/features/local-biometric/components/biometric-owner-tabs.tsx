"use client";

import { useState } from "react";
import { WorkstationConnectionPanel } from "./workstation-connection-panel";
import { WorkstationTestScanPanel } from "./workstation-test-scan-panel";
import { MobileCccdConnectionPanel } from "./mobile-cccd-connection-panel";
import { MobileCccdTestScanPanel } from "./mobile-cccd-test-scan-panel";
import { BiometricCommandStats } from "./biometric-command-stats";
import { BiometricRecentTestLog, type TestScanRecord } from "./biometric-recent-test-log";
import { BiometricTroubleshooting } from "./biometric-troubleshooting";
import { useWorkstationScan } from "../hooks/use-workstation-scan";
import { useMobileCccdScan } from "../hooks/use-mobile-cccd-scan";

export function BiometricOwnerTabs({ hotelId }: { hotelId: string }) {
  const [activeTab, setActiveTab] = useState<"scanner" | "mobile">("scanner");

  const { state: workstationState } = useWorkstationScan(hotelId);
  const { view: mobileView } = useMobileCccdScan({
    hotelId,
    targetContext: "",
    targetLabel: "",
    onCapture: () => {},
  });

  const workstationOnline = ["ready", "requested", "receiving", "received", "expired"].includes(workstationState.phase);
  const mobilePhase = mobileView?.phase ?? "idle";

  return (
    <div className="space-y-8">
      {/* Shift Command Stats */}
      <BiometricCommandStats
        workstationOnline={workstationOnline}
        mobilePhase={mobilePhase}
      />

      {/* Main Tab Controller */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#00003c]">Phương thức tiếp nhận căn cước</h2>
          <p className="mt-0.5 text-xs sm:text-sm text-stone-500">
            Lựa chọn thiết bị chuyên dụng hoặc camera điện thoại để thực hiện quét đối chiếu.
          </p>
        </div>

        <div className="inline-flex rounded-2xl bg-stone-100 p-1.5 border border-stone-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              activeTab === "scanner"
                ? "bg-white text-[#000080] shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>Máy quét chuyên dụng (HN-212)</span>
            <span className={`h-2 w-2 rounded-full ${workstationOnline ? "bg-emerald-500" : "bg-stone-300"}`} />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("mobile")}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              activeTab === "mobile"
                ? "bg-white text-[#000080] shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
            </svg>
            <span>Điện thoại quét QR CCCD</span>
            <span className={`h-2 w-2 rounded-full ${mobilePhase === "active" ? "bg-emerald-500" : "bg-stone-300"}`} />
          </button>
        </div>
      </div>

      {/* Main Split Workbench: Left (Device) + Right (Test Studio) */}
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

      {/* Lower Section: Shift Log + Troubleshooting Hub */}
      <div className="space-y-8 pt-4">
        <BiometricRecentTestLog />
        <BiometricTroubleshooting />
      </div>
    </div>
  );
}
