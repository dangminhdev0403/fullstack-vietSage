"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CccdCheckInCapture } from "./cccd-check-in-panel";
import { useMobileCccdScan } from "../hooks/use-mobile-cccd-scan";

type Props = { hotelId: string; onCapture: (capture: CccdCheckInCapture | null) => void; targetContext: string; targetLabel: string; showSetupLink?: boolean };

export function MobileCccdScan(props: Props) {
  const { view, busy, error, rescan } = useMobileCccdScan(props);
  const pathname = usePathname();
  const setupHref = pathname.startsWith("/owner/")
    ? `/owner/hotels/${props.hotelId}/biometric`
    : `/hotels/${props.hotelId}/biometric`;

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200/90 bg-stone-50/70 p-5 sm:p-6" aria-label="Điện thoại quét CCCD">
      {view?.phase === "active" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-600" />
              </span>
              <p className="text-lg sm:text-xl font-bold text-stone-900">Điện thoại quét QR CCCD</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-100/90 px-3.5 py-1 text-xs sm:text-sm font-bold text-emerald-800">
              Điện thoại đã kết nối
            </span>
          </div>

          <p className="text-sm sm:text-base text-stone-600">
            Đích nhận: <strong className="font-semibold text-stone-900">{props.targetLabel}</strong>. Điện thoại chỉ được gửi vào lượt đang mở.
          </p>

          <div className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white p-4 text-sm sm:text-base font-semibold text-stone-800 shadow-2xs">
            <span className="text-lg">
              {view.target?.status === "acknowledged" ? "✅" : view.target?.status === "received" ? "⏳" : "📱"}
            </span>
            <p role="status" className="flex-1">
              {view.target?.status === "acknowledged"
                ? "Đã nhận vào bản nháp check-in."
                : view.target?.status === "received"
                  ? "Đang nhận và xác nhận dữ liệu…"
                  : view.target
                    ? "Chờ điện thoại quét căn cước."
                    : "Đang mở lượt nhận cho khách này."}
            </p>
          </div>

          <button
            type="button"
            disabled={busy || view.target?.status === "received"}
            onClick={() => void rescan()}
            className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm sm:text-base font-bold text-stone-800 shadow-2xs transition-all hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Quét lại vị trí này</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-lg sm:text-xl font-bold text-stone-900">Điện thoại quét QR CCCD</p>
            <span className="rounded-full border border-stone-200 bg-stone-100 px-3.5 py-1 text-xs sm:text-sm font-semibold text-stone-600">
              Chưa kết nối
            </span>
          </div>
          <p className="text-sm sm:text-base text-stone-600">Kết nối điện thoại trước tại mục Máy quét CCCD.</p>
          {props.showSetupLink === false ? null : (
            <Link
              href={setupHref}
              className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-[#000080] px-5 py-2.5 text-sm sm:text-base font-bold text-white shadow-2xs transition-colors hover:bg-[#000060]"
            >
              <span>Mở cấu hình kết nối</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
