"use client";

import { useEffect, useState } from "react";
import { WorkstationConnectionPanel } from "./workstation-connection-panel";
import { MobileCccdConnectionPanel } from "./mobile-cccd-connection-panel";
import { useWorkstationScan } from "../hooks/use-workstation-scan";
import { useMobileCccdScan } from "../hooks/use-mobile-cccd-scan";

type DeviceConnectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  defaultTab?: "scanner" | "mobile";
};

export function DeviceConnectionModal({
  isOpen,
  onClose,
  hotelId,
  defaultTab = "scanner",
}: DeviceConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<"scanner" | "mobile">(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const { state: workstationState } = useWorkstationScan(hotelId);
  const { view: mobileView } = useMobileCccdScan({
    hotelId,
    targetContext: "",
    targetLabel: "",
    onCapture: () => {},
  });

  const workstationOnline = [
    "ready",
    "requested",
    "receiving",
    "received",
    "expired",
  ].includes(workstationState.phase);
  const mobileActive = mobileView?.phase === "active";

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-connection-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </span>
              <h2
                id="device-connection-modal-title"
                className="text-lg sm:text-xl font-bold text-slate-900 text-balance"
              >
                Thiết lập kết nối thiết bị quét CCCD
              </h2>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 text-pretty">
              Kết nối nhanh trạm quét chuyên dụng hoặc điện thoại ngay tại quầy lễ tân mà không làm gián đoạn lượt check-in.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs cursor-pointer"
              aria-label="Đóng cửa sổ"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-white px-5 pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
                activeTab === "scanner"
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <span className="whitespace-nowrap">Máy quét chuyên dụng HN-212</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  workstationOnline ? "bg-emerald-500" : "bg-amber-400"
                }`}
                title={workstationOnline ? "Đã kết nối" : "Ngoại tuyến"}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("mobile")}
              className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
                activeTab === "mobile"
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18h.01"
                />
              </svg>
              <span className="whitespace-nowrap">Điện thoại quét QR CCCD</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  mobileActive ? "bg-emerald-500" : "bg-slate-300"
                }`}
                title={mobileActive ? "Trực tuyến" : "Chưa kết nối"}
              />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
          {activeTab === "scanner" ? (
            <WorkstationConnectionPanel hotelId={hotelId} />
          ) : (
            <MobileCccdConnectionPanel hotelId={hotelId} />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-xs text-slate-500 text-pretty">
            Thiết bị kết nối thành công sẽ đồng bộ ngay lập tức vào ca trực check-in hiện tại.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl bg-blue-700 px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-blue-800 transition shadow-2xs cursor-pointer"
          >
            Hoàn tất & Quay lại check-in
          </button>
        </div>
      </div>
    </div>
  );
}
