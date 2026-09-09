"use client";

import Image from "next/image";
import { MobileCccdCapture } from "@/features/local-biometric/components/mobile-cccd-capture";
import { useMobilePhone } from "@/features/local-biometric/hooks/use-mobile-phone";

if (typeof window !== "undefined") {
  (window as unknown as { zaloJSV2: unknown }).zaloJSV2 =
    (window as unknown as { zaloJSV2: unknown }).zaloJSV2 || {};
}

export default function CccdMobilePage() {
  const { view, ready, error, send, disconnect } = useMobilePhone();

  const comparisonDigits = view?.comparisonCode ? view.comparisonCode.replace(/\s+/g, "").split("") : [];

  return (
    <main className="min-h-dvh bg-[#f8f7f4] text-stone-900 pb-12 font-sans antialiased">
      {/* 1. Header with Authentic VietSage Logo */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-white/95 px-4 py-3 backdrop-blur-md shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white p-0.5 shadow-2xs">
            <Image
              src="/brand/vietsage-logo.jpg"
              alt="VietSage"
              width={44}
              height={44}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight text-[#00003c]">
              VietSage
            </span>
            <span className="block text-xs font-bold text-[#166534]">
              Quét giấy tờ di động
            </span>
          </div>
        </div>

        {/* Live Status Pill */}
        <div>
          {view?.phase === "active" ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              <span>Đã kết nối</span>
            </span>
          ) : view?.phase === "pending" ? (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Chờ xác nhận</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-600">
              <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
              <span>Chưa kết nối</span>
            </span>
          )}
        </div>
      </header>

      {/* 2. Main Content */}
      <div className="mx-auto max-w-md px-4 pt-5 space-y-4">
        {/* State: Initializing */}
        {!ready && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-xs">
            <svg className="h-6 w-6 animate-spin text-[#000080]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-base font-semibold text-stone-700">Đang khởi tạo kết nối…</span>
          </div>
        )}

        {/* State: Unconnected / No Session */}
        {ready && !view && (
          <section className="rounded-2xl border border-stone-200 bg-white p-7 text-center shadow-sm space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl shadow-2xs">
              📱
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#00003c]">Kết nối với máy lễ tân</h2>
              <p className="text-base text-stone-600 leading-relaxed">
                Dùng điện thoại này quét mã QR hiển thị tại mục <strong>&quot;Máy quét CCCD&quot;</strong> hoặc khi <strong>Check-in phòng</strong> trên máy tính lễ tân để bắt đầu ca trực.
              </p>
            </div>
          </section>
        )}

        {/* State: Pending Comparison Code */}
        {view?.phase === "pending" && (
          <section className="rounded-2xl border-2 border-amber-300 bg-white p-6 shadow-md text-center space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-[#00003c]">
                Mã đối chiếu kết nối
              </h2>
              <p className="text-base text-stone-600 mt-1">
                Đọc 6 số này cho nhân viên lễ tân:
              </p>
            </div>

            {/* PIN Digits Display */}
            <div className="flex justify-center gap-2.5 py-1">
              {comparisonDigits.length > 0 ? (
                comparisonDigits.map((digit, idx) => (
                  <span
                    key={idx}
                    className="flex h-16 w-12 items-center justify-center rounded-2xl border-2 border-amber-300 bg-amber-50 font-mono text-3xl font-black text-[#00003c] shadow-xs"
                  >
                    {digit}
                  </span>
                ))
              ) : (
                <span className="font-mono text-3xl font-black tracking-widest text-[#00003c]">
                  {view.comparisonCode}
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-base font-semibold text-amber-900 bg-amber-50/80 rounded-xl p-3.5 border border-amber-200">
              <svg className="h-5 w-5 animate-spin text-amber-700" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Chờ lễ tân bấm &quot;Xác nhận kết nối&quot;…</span>
            </div>

            <p className="text-sm text-stone-500">
              Khách sạn: <strong className="text-stone-800">{view.hotelLabel}</strong>
            </p>
          </section>
        )}

        {/* State: Active Shift Overview Strip */}
        {view?.phase === "active" && (
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-2xs">
            <div>
              <p className="text-base font-extrabold text-[#00003c]">{view.hotelLabel}</p>
              <p className="text-sm font-medium text-stone-600">
                Lễ tân: <strong className="text-stone-800">{view.operatorLabel}</strong>
              </p>
            </div>

            <div>
              {view.deskOnline ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800 border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Online</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800 border border-amber-200">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>Tạm vắng</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-xs">
            <svg className="h-5 w-5 shrink-0 text-red-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {/* Active Shift Targets & Scanner Execution */}
        {view?.phase === "active" && (
          <div className="space-y-4">
            {/* Last scan receipt acknowledgement */}
            {view.receipt?.status === "acknowledged" && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-900 shadow-2xs">
                <svg className="h-5 w-5 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Máy lễ tân đã lưu thông tin khách trước thành công.</span>
              </div>
            )}

            {/* Target Card or Standby */}
            {!view.deskOnline ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center space-y-2">
                <p className="text-base font-bold text-amber-900">Máy lễ tân đang ở chế độ chờ</p>
                <p className="text-sm text-amber-800 leading-relaxed">
                  Lễ tân chưa mở lượt nhận phòng nào. Phiên kết nối trên điện thoại vẫn được giữ.
                </p>
              </div>
            ) : view.target ? (
              <section className="rounded-2xl border-[3px] border-[#000080] bg-white shadow-md overflow-hidden space-y-0">
                {/* Target Room Header */}
                <div className="bg-[#000080] px-5 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-200">
                      ĐANG CHECK-IN CHO
                    </p>
                  </div>
                  <p className="text-2xl font-black text-white">
                    {view.target.label}
                  </p>
                </div>

                {/* Sub-component: Scanner or Status */}
                <div className="p-5 space-y-4">
                  {view.target.status === "waiting" ? (
                    <MobileCccdCapture
                      key={view.target.requestId}
                      requestId={view.target.requestId}
                      expiresAt={view.target.expiresAt}
                      send={send}
                    />
                  ) : view.target.status === "received" ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 text-center space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 animate-pulse">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </div>
                      <p className="text-base font-bold text-blue-950">Đã gửi dữ liệu</p>
                      <p className="text-sm text-blue-800">
                        Đang chờ nhân viên lễ tân bấm nhận trên màn hình máy tính.
                      </p>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-stone-500 py-3">
                      Chờ máy lễ tân chọn khách tiếp theo…
                    </p>
                  )}
                </div>
              </section>
            ) : (
              <div className="rounded-2xl border-[3px] border-emerald-400 bg-white p-6 text-center space-y-4 shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl shadow-2xs">
                  ⚡
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-sm font-bold text-emerald-800 border border-emerald-300">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    </span>
                    <span>ACTIVE — ĐÃ KẾT NỐI</span>
                  </div>
                  <h3 className="text-xl font-black text-[#00003c]">Sẵn sàng tiếp nhận lượt quét</h3>
                  <p className="text-sm text-stone-600 leading-relaxed max-w-xs mx-auto">
                    Để chụp CCCD / Hộ chiếu cho phòng:
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-3.5 text-left text-xs sm:text-sm text-stone-700 space-y-2 border border-stone-200">
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">1</span>
                    <span>Trên máy tính lễ tân, mở hộp thoại <strong>Check-in phòng</strong> bất kỳ.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">2</span>
                    <span>Bấm chọn <strong>&quot;Quét bằng điện thoại&quot;</strong> tại vị trí khách cần quét.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800 text-xs">✓</span>
                    <span>Màn hình điện thoại này sẽ <strong>tự động mở máy ảnh chụp ngay</strong>.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Disconnect Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void disconnect()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:bg-red-100"
              >
                <span>Ngắt kết nối điện thoại</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


