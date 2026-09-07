"use client";

import { useState } from "react";
import type { IntakePayloadV2 } from "../intake/intake-contract";
import { buildCccdPreviewModel } from "../utils/cccd-preview";
import { CccdPreview } from "./cccd-preview";
import { MobileCccdScan } from "./mobile-cccd-scan";

export function MobileCccdTestScanPanel({ hotelId }: { hotelId: string }) {
  const [payload, setPayload] = useState<IntakePayloadV2 | null>(null);

  return (
    <section className="flex h-full flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-xs">
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#735c00]/10 text-[#735c00]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#00003c]">
                Test quét QR CCCD
              </h2>
              <p className="mt-1 text-sm sm:text-base text-stone-500">
                Kết quả chỉ hiển thị tạm thời, không tạo check-in.
              </p>
            </div>
          </div>
          <span className="shrink-0 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-amber-800">
            Thử nghiệm
          </span>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col justify-between py-6 space-y-6">
          <MobileCccdScan
            hotelId={hotelId}
            targetContext="biometric-test"
            targetLabel="Test quét QR CCCD"
            showSetupLink={false}
            onCapture={(capture) => setPayload(capture?.payload ?? null)}
          />

          {payload ? (
            <div className="space-y-4 pt-2">
              <div className="rounded-2xl border border-emerald-200 bg-[#f8faf8] p-4">
                <CccdPreview model={buildCccdPreviewModel(payload)} />
              </div>
              <button
                type="button"
                onClick={() => setPayload(null)}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm sm:text-base font-bold text-stone-700 shadow-2xs transition-colors hover:bg-stone-50"
              >
                <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Xóa kết quả test</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-6 sm:p-8 text-center">
              <p className="text-sm sm:text-base font-medium text-stone-600">
                📱 Mở điện thoại đã kết nối và quét bất kỳ thẻ CCCD nào để xem dữ liệu giải mã tức thì.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
