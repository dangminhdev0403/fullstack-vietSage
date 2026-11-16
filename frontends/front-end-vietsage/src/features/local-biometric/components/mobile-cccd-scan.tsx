"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CccdCheckInCapture } from "./cccd-check-in-panel";
import { useMobileCccdScan } from "../hooks/use-mobile-cccd-scan";
import { DeviceConnectionModal } from "./device-connection-modal";

type Props = {
  hotelId: string;
  onCapture: (capture: CccdCheckInCapture | null) => void;
  targetContext: string;
  targetLabel: string;
  showSetupLink?: boolean;
  onOpenSetup?: () => void;
};

export function MobileCccdScan(props: Props) {
  const { view, busy, error, rescan } = useMobileCccdScan(props);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const handleOpenSetup = props.onOpenSetup ?? (() => setInternalModalOpen(true));
  const pathname = usePathname();
  const setupHref = pathname.startsWith("/owner/")
    ? `/owner/hotels/${props.hotelId}/biometric`
    : `/hotels/${props.hotelId}/biometric`;

  return (
    <section className="rounded-xl border border-stone-200/90 bg-stone-50/70 px-3 py-2 sm:px-4 sm:py-2.5" aria-label="Điện thoại quét CCCD">
      {view?.phase === "active" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            <span className="text-sm sm:text-base font-bold text-stone-900">Điện thoại quét QR CCCD</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-100/90 px-2 py-0.5 text-xs font-bold text-emerald-800">
              Đã kết nối
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-stone-700">
              {view.target?.status === "acknowledged" ? "✅ Đã nhận vào check-in" : view.target?.status === "received" ? "⏳ Đang nhận…" : view.target?.status === "document" ? "⏳ Đang OCR hộ chiếu…" : "📱 Chờ quét"}
            </span>
            <p role="status" className="sr-only">
              {view.target?.status === "acknowledged"
                ? "Đã nhận vào bản nháp check-in."
                : view.target?.status === "received" || view.target?.status === "document"
                  ? "Đang nhận và xác nhận dữ liệu…"
                  : view.target
                    ? "Chờ điện thoại quét căn cước."
                    : "Đang mở lượt nhận cho khách này."}
            </p>
            <button
              type="button"
              disabled={busy || view.target?.status === "received" || view.target?.status === "document"}
              onClick={() => void rescan()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs sm:text-sm font-bold text-stone-800 shadow-2xs hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Quét lại vị trí này</span>
            </button>
            <button
              type="button"
              onClick={handleOpenSetup}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-2xs cursor-pointer"
              title="Quản lý kết nối điện thoại hoặc ngắt kết nối"
            >
              <span>Cấu hình</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold text-stone-900">Điện thoại quét QR CCCD</span>
            <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
              Chưa kết nối
            </span>
            <span className="text-xs sm:text-sm text-stone-600">Kết nối điện thoại trước tại mục Máy quét CCCD.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenSetup}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#000080] px-3.5 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-[#000060] transition cursor-pointer"
            >
              <span>Kết nối điện thoại</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {props.showSetupLink ? (
              <Link
                href={setupHref}
                className="hidden sm:inline-flex h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                <span>Mở cấu hình</span>
              </Link>
            ) : null}
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs sm:text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}
      {internalModalOpen ? (
        <DeviceConnectionModal
          isOpen={internalModalOpen}
          onClose={() => setInternalModalOpen(false)}
          hotelId={props.hotelId}
          defaultTab="mobile"
        />
      ) : null}
    </section>
  );
}
