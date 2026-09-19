"use client";

import React from "react";

type Props = {
  workstationOnline: boolean;
  mobilePhase: string;
};

export function BiometricCommandStats({ workstationOnline, mobilePhase }: Props) {
  const isMobileActive = mobilePhase === "active";

  return (
    <section aria-label="Chỉ số trạm sinh trắc học" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Stat 1: HN-212 Scanner */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-2xs transition-all hover:border-stone-300">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          workstationOnline ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
        }`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Đầu đọc HN-212</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${workstationOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
            <p className="text-base font-bold text-[#00003c]">
              {workstationOnline ? "Sẵn sàng nhận thẻ" : "Chờ ghép nối"}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">USB 3.0 · Daemon :8080</p>
        </div>
      </div>

      {/* Stat 2: Mobile Scanner */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-2xs transition-all hover:border-stone-300">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          isMobileActive ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-[#000080]"
        }`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Quét qua di động</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isMobileActive ? "bg-emerald-500 animate-pulse" : "bg-stone-300"}`} />
            <p className="text-base font-bold text-[#00003c]">
              {isMobileActive ? "Thiết bị trực tuyến" : "Chưa kết nối"}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">QR CCCD · WebRTC Relay</p>
        </div>
      </div>

      {/* Stat 3: Performance Speed */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-2xs transition-all hover:border-stone-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#735c00]">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Tốc độ giải mã</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-black text-[#00003c]">~0.8s</span>
            <span className="text-xs font-semibold text-emerald-600">Chuẩn ICAO</span>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">Tỉ lệ đọc chuẩn 99.8%</p>
        </div>
      </div>

      {/* Stat 4: Security & Privacy */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-2xs transition-all hover:border-stone-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Chế độ Test Quét</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base font-bold text-[#00003c]">Cục bộ (RAM)</span>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">Không lưu DB · Tự hủy</p>
        </div>
      </div>
    </section>
  );
}
