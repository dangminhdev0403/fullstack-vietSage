"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useMobileCccdScan } from "../hooks/use-mobile-cccd-scan";

const button = "min-h-11 rounded-xl border border-blue-300 bg-white px-4 py-2 text-base font-bold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50";
const ignoreCapture = () => {};

export function MobileCccdConnectionPanel({ hotelId }: { hotelId: string }) {
  const { view, code, busy, error, create, approve, revoke } = useMobileCccdScan({
    hotelId,
    targetContext: "",
    targetLabel: "",
    onCapture: ignoreCapture,
  });
  const [copied, setCopied] = useState(false);
  const origin = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const mobileUrl = code ? `${origin}/cccd-mobile#${code}` : "";

  const copyUrl = () => {
    if (!mobileUrl) return;
    navigator.clipboard.writeText(mobileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <section
      className="flex h-full flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-xs"
      aria-live="polite"
    >
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#000080]/10 text-[#000080]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#00003c]">
                Kết nối điện thoại quét CCCD
              </h2>
              <p className="mt-1 text-sm sm:text-base text-stone-500">
                Thiết lập phiên quét di động cho ca trực lễ tân.
              </p>
            </div>
          </div>
          <div>
            {view?.phase === "active" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-emerald-800">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Trực tuyến
              </span>
            ) : view?.phase === "pending" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-amber-800">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                Chờ đối chiếu
              </span>
            ) : view?.phase === "pairing" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-blue-800">
                Đang ghép nối
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-stone-600">
                Chưa kết nối
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col justify-center py-6">
          {!view || (view.phase === "pairing" && !code) ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center py-4 space-y-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-[#000080]">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <div className="max-w-md space-y-2">
                <p className="text-lg sm:text-xl font-bold text-stone-900">
                  Sẵn sàng kết nối điện thoại nhân viên
                </p>
                <p className="text-sm sm:text-base text-stone-600">
                  Bấm tạo mã để hiển thị QR. Dùng camera điện thoại quét để bắt đầu.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void create()}
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#000080] px-8 py-4 text-base sm:text-lg font-bold text-white shadow-md transition-all hover:bg-[#000060] active:scale-[0.98] disabled:opacity-50"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <span>Tạo QR kết nối điện thoại</span>
                </button>
              </div>
            </div>
          ) : null}

          {view?.phase === "pairing" && code ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center py-2 space-y-5">
              <div className="relative inline-block rounded-3xl border-2 border-[#fed65b] bg-white p-4 shadow-md">
                <div className="absolute -left-1.5 -top-1.5 h-4 w-4 border-l-2 border-t-2 border-[#735c00]" />
                <div className="absolute -right-1.5 -top-1.5 h-4 w-4 border-r-2 border-t-2 border-[#735c00]" />
                <div className="absolute -bottom-1.5 -left-1.5 h-4 w-4 border-b-2 border-l-2 border-[#735c00]" />
                <div className="absolute -bottom-1.5 -right-1.5 h-4 w-4 border-b-2 border-r-2 border-[#735c00]" />
                <QRCodeSVG value={mobileUrl} size={210} className="rounded-2xl" aria-label="QR kết nối điện thoại, có hiệu lực hai phút" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-base sm:text-lg font-bold text-stone-900">
                  Dùng camera điện thoại quét mã QR trên
                </p>
                <p className="text-xs sm:text-sm text-stone-500">
                  Mã có hiệu lực trong 2 phút.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm sm:text-base font-semibold text-stone-800 shadow-2xs transition-colors hover:bg-stone-50"
                >
                  <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copied ? "Đã sao chép liên kết" : "Sao chép liên kết"}</span>
                </button>
              </div>
            </div>
          ) : null}

          {view?.phase === "pending" ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center py-2 space-y-6">
              <div>
                <p className="text-base sm:text-lg font-bold text-stone-800">
                  Đối chiếu mã trên điện thoại:
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 sm:gap-3.5">
                {view.comparisonCode.split("").map((digit, i) => (
                  <span
                    key={i}
                    className="flex h-16 w-12 sm:h-20 sm:w-16 items-center justify-center rounded-2xl border-2 border-amber-400 bg-white font-mono text-3xl sm:text-4xl font-black text-[#000080] shadow-sm"
                  >
                    {digit}
                  </span>
                ))}
              </div>
              <p className="text-xs sm:text-sm font-medium text-stone-500 max-w-sm">
                Xác nhận đúng 6 chữ số hiển thị trên điện thoại lễ tân.
              </p>
              <div className="w-full max-w-md pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void approve()}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#166534] px-8 py-4 text-base sm:text-lg font-bold text-white shadow-md transition-all hover:bg-[#14532d] active:scale-[0.98] disabled:opacity-50"
                >
                  <svg className="h-6 w-6 text-[#fed65b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Mã trùng — Cho phép kết nối</span>
                </button>
              </div>
            </div>
          ) : null}

          {view?.phase === "active" ? (
            <div className="flex flex-1 flex-col justify-center space-y-6 py-2">
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-emerald-950">
                    Điện thoại đã kết nối · hết ca lúc {new Date(view.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="mt-0.5 text-sm sm:text-base text-emerald-800">
                    Sẵn sàng nhận dữ liệu quét mã QR Căn cước công dân.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={`/hotels/${hotelId}/rooms`}
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-[#000080] px-6 py-3 text-sm sm:text-base font-bold text-white shadow-2xs transition-colors hover:bg-[#000060]"
                >
                  <span>Đi tới Phòng & check-in</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke()}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm sm:text-base font-semibold text-stone-700 shadow-2xs transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  Ngắt điện thoại
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
