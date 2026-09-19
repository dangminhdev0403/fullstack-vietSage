"use client";

import { useState } from "react";
import type { IntakePayloadV2 } from "../intake/intake-contract";
import { buildCccdPreviewModel } from "../utils/cccd-preview";
import { CccdPreview } from "./cccd-preview";
import { MobileCccdScan } from "./mobile-cccd-scan";

export function MobileCccdTestScanPanel({ hotelId }: { hotelId: string }) {
  const [payload, setPayload] = useState<IntakePayloadV2 | null>(null);

  const loadSamplePayload = () => {
    setPayload({
      schemaVersion: 2,
      transferId: "00000000-0000-4000-8000-000000000002",
      capturedAt: new Date().toISOString(),
      guest: {
        displayName: "TRẦN THỊ HƯƠNG",
        identityNumber: "034195009890",
        dateOfBirth: "1995-11-22",
        gender: "Nữ",
        nationality: "Việt Nam",
        race: "Kinh",
        residencePlace: "128 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
        identityIssueDate: "2022-04-18",
        identityExpiryDate: "2035-11-22",
      },
      verification: {
        chipAuthenticated: false,
        sodVerified: false,
      },
    });
  };

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
              <div className="rounded-2xl border border-emerald-200 bg-[#f8faf8] p-4 shadow-2xs">
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
            <div className="rounded-3xl border-2 border-dashed border-stone-200 bg-stone-50/50 p-6 sm:p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-2xs border border-stone-200 text-[#000080]">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
                </svg>
              </div>
              <p className="mt-3 text-base font-bold text-stone-800">
                Sẵn sàng giải mã mã QR từ camera điện thoại
              </p>
              <p className="mt-1 text-xs sm:text-sm text-stone-500 max-w-md mx-auto">
                📱 Mở điện thoại đã kết nối và quét bất kỳ thẻ CCCD nào để xem dữ liệu giải mã tức thì.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={loadSamplePayload}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50 hover:text-[#000080]"
                >
                  <svg className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>Mô phỏng dữ liệu thẻ mẫu</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
