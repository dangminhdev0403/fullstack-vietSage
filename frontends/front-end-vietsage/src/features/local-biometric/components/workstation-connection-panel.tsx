"use client";

import { useState } from "react";
import { SwalVietSage } from "@/libs/swal";
import { useWorkstationScan } from "../hooks/use-workstation-scan";

export function WorkstationConnectionPanel({ hotelId }: { hotelId: string }) {
  const { state, pairCode, createPairing, disconnect } = useWorkstationScan(hotelId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const online = ["ready", "requested", "receiving", "received", "expired"].includes(state.phase);

  const handleCreatePairing = async () => {
    setIsGenerating(true);
    try {
      await createPairing();
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = () => {
    if (!pairCode) return;
    navigator.clipboard.writeText(pairCode).then(() => {
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
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#000080]/10 text-[#000080]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#00003c]">
                Kết nối máy quét CCCD
              </h2>
              <p className="mt-1 text-sm sm:text-base text-stone-500">
                {online ? "Máy quét tại quầy đang sẵn sàng." : "Tạo mã một lần, sau đó nhập mã tại trạm HN-212."}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {online ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-emerald-800">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Đã kết nối
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-amber-900">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                Ngoại tuyến
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col justify-center py-6">
          {!online ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center py-4 space-y-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-[#000080]">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <div className="max-w-md space-y-2">
                <p className="text-lg sm:text-xl font-bold text-stone-900">
                  Trạm đọc chuyên dụng HN-212
                </p>
                <p className="text-sm sm:text-base text-stone-600">
                  Cắm cáp USB vào máy tính quầy lễ tân, khởi động daemon sau đó bấm tạo mã ghép nối một lần.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleCreatePairing}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-sm sm:text-base font-bold text-white shadow-sm transition-all hover:bg-[#000060] active:scale-[0.98] disabled:opacity-60"
                >
                  {isGenerating ? (
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : pairCode ? (
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  <span>{isGenerating ? "Đang tạo mã..." : pairCode ? "Tạo lại mã" : "Tạo mã ghép nối"}</span>
                </button>
              </div>

              {pairCode ? (
                <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50/70 p-4 sm:p-5 text-center shadow-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Mã ghép nối một lần</p>
                  <p className="mt-1 text-xs text-amber-800">Nhập mã này vào màn hình cảm ứng hoặc giao diện cấu hình HN-212:</p>
                  <div className="mt-3.5 flex items-center justify-center gap-2">
                    <div className="min-w-0 flex-1">
                      <code
                        onClick={copyCode}
                        title="Nhấn để sao chép mã"
                        className={`block w-full cursor-pointer rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-[#000080] shadow-2xs transition-colors hover:border-amber-400 whitespace-nowrap overflow-x-auto select-all text-center tracking-tight ${
                          pairCode.length <= 8
                            ? "text-xl sm:text-2xl font-bold tracking-widest"
                            : "text-xs sm:text-[13px] font-bold"
                        }`}
                      >
                        {pairCode}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={copyCode}
                      className="inline-flex min-h-9 sm:min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-2xs transition-all hover:bg-stone-50 active:scale-[0.98]"
                      title="Sao chép mã ghép nối"
                    >
                      {copied ? (
                        <>
                          <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-emerald-700">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center space-y-6 py-2">
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-emerald-950">
                    Máy quét HN-212 đã kết nối và đang trực tuyến
                  </p>
                  <p className="mt-0.5 text-sm sm:text-base text-emerald-800">
                    Sẵn sàng đọc chip NFC và mã QR Căn cước công dân trực tiếp tại quầy.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await SwalVietSage.fire({
                      title: "Hủy kết nối máy quét?",
                      text: "Dữ liệu thiết bị và dữ liệu đã quét không bị xóa. Bạn có thể kết nối lại sau.",
                      icon: "warning",
                      showCancelButton: true,
                      confirmButtonText: "Hủy kết nối",
                      cancelButtonText: "Hủy bỏ",
                      reverseButtons: false,
                    });
                    if (!result.isConfirmed) return;
                    setActionError(null);
                    try {
                      await disconnect();
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : "Không thể hủy kết nối máy quét");
                    }
                  }}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm sm:text-base font-semibold text-stone-700 shadow-2xs transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span>Hủy kết nối</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {actionError ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-800">
            {actionError}
          </p>
        ) : null}
      </div>
    </section>
  );
}