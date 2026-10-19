"use client";

import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export default function TichHopPage() {
  return (
    <MarketingShell locale="vi" showSceneRail={false} showSceneBackdrop={false}>
      <div className="bg-[#fbfbfc] text-slate-800 antialiased min-h-screen">
        {/* BEGIN: HeroIntroduction */}
        <section className="relative overflow-hidden pt-12 pb-8 border-b border-slate-100 bg-gradient-to-b from-amber-50/40 via-white to-[#fbfbfc]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 mb-3 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-800 whitespace-nowrap">
                HỆ SINH THÁI TÍCH HỢP VIETSAGE
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3 text-balance">
              Các đối tác tích hợp
            </h1>
            <p className="text-slate-600 text-xs sm:text-base max-w-2xl font-normal leading-relaxed text-pretty">
              Kết nối với hơn <span className="font-bold text-slate-800">30+</span> đối tác công nghệ uy tín, bao phủ toàn bộ nhu cầu vận hành khách sạn.
            </p>
          </div>
        </section>
        {/* END: HeroIntroduction */}

        {/* BEGIN: PartnerEcosystemSections */}
        <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
          {/* Category 1: OTA & Booking */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            {/* Category Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                  Kênh OTA &amp; Booking
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Đồng bộ lịch phòng, quản lý giá và tối ưu doanh thu từ các kênh đặt phòng trực tuyến.
                </p>
              </div>
            </div>

            {/* Partner Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Booking.com */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-blue-200 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center mb-2">
                  <span className="text-base font-extrabold tracking-tight text-[#003580] group-hover:scale-105 transition-transform font-sans">
                    Booking<span className="text-sky-400">.com</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Kênh đặt phòng toàn cầu phổ biến nhất.
                </p>
              </div>

              {/* Agoda */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-red-200 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center space-x-1 mb-2">
                  <span className="text-lg font-black tracking-tight text-slate-800">agoda</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Nền tảng đặt phòng hàng đầu châu Á.
                </p>
              </div>

              {/* Airbnb */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-rose-200 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2 text-[#FF5A5F]">
                  <svg className="h-6 w-6" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                    <path d="M16 1c2 0 4 2 4 4.5 0 3.7-2 8.4-4 12.3-2-3.9-4-8.6-4-12.3C12 3 14 1 16 1zm0 2.2c-1 0-2 1.1-2 2.3 0 2.9 1.6 6.8 3.2 10.1 1.6-3.3 3.2-7.2 3.2-10.1 0-1.2-1-2.3-2-2.3zM16 19c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 13.8c-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8 5.8 2.6 5.8 5.8-2.6 5.8-5.8 5.8z" />
                  </svg>
                  <span className="text-base font-bold tracking-tight">airbnb</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Kết nối với cộng đồng khách du lịch toàn cầu.
                </p>
              </div>

              {/* Trip.com */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-blue-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center gap-1 mb-2">
                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-xs tracking-wider">
                    Trip
                  </span>
                  <span className="text-sm font-bold text-slate-800">.com</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Nền tảng du lịch hàng đầu khu vực châu Á.
                </p>
              </div>

              {/* Traveloka */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-sky-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2 text-sky-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                  <span className="text-sm font-black tracking-tight">traveloka</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Nền tảng du lịch phổ biến tại Đông Nam Á.
                </p>
              </div>

              {/* Expedia */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-amber-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="text-xs bg-amber-400 text-blue-950 font-black px-1 rounded">Exp</span>
                  <span className="text-sm font-extrabold text-blue-950 tracking-tight">Expedia</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Nền tảng du lịch toàn cầu với mạng lưới rộng lớn.
                </p>
              </div>
            </div>
          </section>

          {/* Category 2: AI LocalMate */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                    AI LocalMate - Trợ lý du lịch &amp; Trải nghiệm bản địa AI
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    Mới
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Giải pháp AI đồng hành thông minh, gợi ý tour tuyến, ẩm thực, văn hoá địa phương và chăm sóc khách lưu trú 24/7 tự động.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: LocalMate Concierge */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-amber-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center text-sm font-bold">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 18h18M12 4v4m-8 10a8 8 0 0 1 16 0" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-900">LocalMate Concierge</div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                    Trợ lý AI hỏi đáp tức thì đa ngôn ngữ, gợi ý ăn uống và địa điểm check-in chuẩn bản địa.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-amber-700 font-semibold">
                  <span className="whitespace-nowrap">Đa ngôn ngữ 24/7</span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>

              {/* Card 2: Voice & Chat AI Guest */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-blue-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-900">Voice &amp; Chat AI Guest</div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                    Hỗ trợ đặt xe, dịch vụ phòng, tour trải nghiệm theo thời gian thực tiện lợi và nhanh chóng.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-blue-700 font-semibold">
                  <span className="whitespace-nowrap">Tương tác giọng nói &amp; chat</span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>

              {/* Card 3: Recommendation Engine */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-emerald-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-900">Recommendation Engine</div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                    Cá nhân hoá hành trình du khách dựa trên sở thích, thói quen tiêu dùng và ngân sách du lịch.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-700 font-semibold">
                  <span className="whitespace-nowrap">Cá nhân hoá trải nghiệm</span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>

              {/* Card 4: Tích hợp đa kênh */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-cyan-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center text-sm font-bold">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-900">Tích hợp đa kênh</div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                    Đồng bộ mượt mà Zalo OA, Web Widget, WhatsApp, Telegram và ứng dụng máy tính bảng phòng khách sạn.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-cyan-700 font-semibold">
                  <span className="whitespace-nowrap">Omnichannel sẵn sàng</span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </div>
          </section>

          {/* Category 3: Hệ thống Quản lý PMS */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                  Hệ thống Quản lý PMS
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Kết nối với các hệ thống quản lý khách sạn phổ biến, giúp đồng bộ dữ liệu phòng, đặt phòng và vận hành.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c74634] text-white font-black text-xs">
                    ORCL
                  </span>
                  <span className="text-base font-extrabold text-slate-900">OPERA Cloud</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Hệ thống PMS hàng đầu toàn cầu.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0b6623] text-white font-black text-xs">
                    ik
                  </span>
                  <span className="text-base font-black text-[#0b6623]">INNKEEPER</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp quản lý khách sạn dễ sử dụng.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff6600] text-white font-black text-xs">
                    ez
                  </span>
                  <span className="text-lg font-black text-[#ff6600]">ezCloud</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Nền tảng quản lý khách sạn phổ biến tại Việt Nam.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <svg className="h-6 w-6 text-[#00a3e0]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                  </svg>
                  <span className="text-base font-black text-[#00a3e0]">Cloudbeds</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp PMS toàn diện cho khách sạn hiện đại.
                </p>
              </div>
            </div>
          </section>

          {/* Category 4: Dịch vụ vận hành & Thuế số */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                  Dịch vụ vận hành &amp; Thuế số
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Tích hợp các dịch vụ hỗ trợ vận hành khách sạn như quản lý phân phối, kênh đánh giá và hóa đơn điện tử.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[#d92d20] text-white font-black text-xs">
                    GG
                  </span>
                  <span className="text-sm font-black text-[#d92d20]">GO GLOBAL</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Quản lý đánh giá và uy tín thương hiệu.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[#ee0033] text-white font-black text-xs">
                    W
                  </span>
                  <span className="text-sm font-black text-[#ee0033]">Viettel Solutions</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp viễn thông &amp; chuyển đổi số.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[#005bac] text-white font-black text-xs">
                    VNPT
                  </span>
                  <span className="text-sm font-black text-[#005bac]">VNPT e-invoice</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp hóa đơn điện tử an toàn, chuẩn quy định.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[#4f46e5] text-white font-bold text-xs">
                    QS
                  </span>
                  <span className="text-base font-black text-[#4f46e5]">QikStay</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp check-in trực tuyến, tiết kiệm thời gian.
                </p>
              </div>
            </div>
          </section>

          {/* Category 5: Cổng Thanh toán & Ví điện tử */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                  Cổng Thanh toán &amp; Ví điện tử
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Hỗ trợ đa dạng phương thức thanh toán, giúp khách sạn tối ưu trải nghiệm và tăng tỷ lệ chuyển đổi.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <span className="text-base font-black text-[#005baa]">
                    VNPAY<span className="text-[#e31e24]">·QR</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Thanh toán QR phổ biến tại Việt Nam.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <span className="text-lg font-black text-[#a50064]">MoMo</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Ví điện tử được ưa chuộng nhất tại Việt Nam.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center mb-2">
                  <span className="text-xl font-black italic tracking-tighter text-[#1a1f71] font-sans">
                    VISA
                  </span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Thanh toán thẻ quốc tế an toàn, nhanh chóng.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200">
                <div className="h-9 flex items-center justify-center gap-2 mb-2">
                  <div className="flex -space-x-2">
                    <span className="h-5 w-5 rounded-full bg-[#eb001b] opacity-90" />
                    <span className="h-5 w-5 rounded-full bg-[#f79e1b] opacity-90" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 lowercase">mastercard</span>
                </div>
                <p className="text-xs text-slate-500 text-center leading-snug text-pretty">
                  Giải pháp thanh toán toàn cầu dành cho khách sạn.
                </p>
              </div>
            </div>
          </section>

          {/* Category 6: Phần cứng & Thiết bị IoT */}
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xl shadow-xs shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 9h6v6H9z" />
                  <path d="M15 3v6" />
                  <path d="M9 3v6" />
                  <path d="M15 15v6" />
                  <path d="M9 15v6" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                  Phần cứng &amp; Thiết bị IoT
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 text-pretty">
                  Kết nối với các thiết bị thông minh, nâng cao trải nghiệm khách và tối ưu vận hành.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* HÄFELE */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-red-200 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div className="h-8 flex items-center mb-2">
                  <span className="text-lg font-black tracking-wider text-[#d00010] font-sans">
                    HÄFELE
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                  Giải pháp khóa thông minh cho khách sạn.
                </p>
              </div>

              {/* PHGLock */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-cyan-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div className="h-8 flex flex-col justify-center mb-2">
                  <span className="text-base font-extrabold text-[#0066b2] leading-none">PHGLock</span>
                  <span className="text-xs font-semibold text-cyan-600 mt-0.5">Smart Security</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                  Thiết bị khóa điện tử hiện đại.
                </p>
              </div>

              {/* MIWA */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-emerald-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div className="h-8 flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded border border-emerald-600 flex items-center justify-center text-xs text-emerald-700 font-bold">
                    M
                  </div>
                  <span className="text-base font-black tracking-widest text-emerald-800">MIWA</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                  Giải pháp kiểm soát ra vào chuyên nghiệp.
                </p>
              </div>

              {/* ZKTeco */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-lime-400 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div className="h-8 flex items-center mb-2">
                  <span className="text-base font-black tracking-wide text-slate-800">
                    ZK<span className="text-lime-600">Teco</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed text-pretty">
                  Thiết bị kiểm soát an ninh thông minh.
                </p>
              </div>
            </div>
          </section>
        </main>
        {/* END: PartnerEcosystemSections */}

        {/* BEGIN: HighlightFeatureSection */}
        <section className="max-w-7xl mx-auto px-6 mb-12">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#03231e] via-[#053e34] to-[#042d26] text-white p-8 lg:p-12 shadow-xl border border-emerald-900/50">
            {/* Glow ambient effects */}
            <div className="absolute -top-24 -left-24 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left content column */}
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-800/80 border border-emerald-600/40 flex items-center justify-center text-emerald-300 shadow-inner">
                    <svg className="h-6 w-6 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    TÍNH NĂNG NỔI BẬT
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-snug text-balance">
                  Tự động Khai báo lưu trú Công an
                </h2>

                <p className="text-emerald-100/90 text-xs sm:text-base leading-relaxed text-pretty">
                  Sau mỗi lần check-in, hệ thống tự động gửi thông tin lưu trú đến cơ quan Công an theo quy định,{" "}
                  <span className="text-white font-semibold">nhanh chóng – chính xác – an toàn – giảm thiểu rủi ro.</span>
                </p>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Kết nối trực tiếp <strong>CSDL Quốc gia về Dân cư &amp; Định danh điện tử VNeID (Bộ Công an)</strong></span>
                </div>

                {/* 3 Value Props */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">✈</span>
                    <span className="text-xs font-medium text-emerald-50">Tự động gửi sau mỗi check-in</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">✓</span>
                    <span className="text-xs font-medium text-emerald-50">Đúng định dạng theo quy định CA</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">🔒</span>
                    <span className="text-xs font-medium text-emerald-50">An toàn, bảo mật dữ liệu khách hàng</span>
                  </div>
                </div>

                <div className="pt-3">
                  <Link
                    href="/contact?topic=kbtt-compliance"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c59a50] hover:bg-amber-500 text-slate-900 font-bold text-xs sm:text-sm shadow-lg shadow-amber-900/30 transition-all duration-200 group cursor-pointer whitespace-nowrap"
                  >
                    <span>Tìm hiểu chi tiết</span>
                    <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                </div>
              </div>

              {/* Right Flow Illustration */}
              <div className="lg:col-span-5 flex items-center justify-center">
                <div className="w-full max-w-md bg-white/10 p-5 rounded-2xl border border-white/15 backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 text-center">
                  {/* Card 1: Guest Check-in */}
                  <div className="bg-white rounded-xl p-3 text-slate-800 shadow-md text-left w-36 shrink-0 border border-slate-100">
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 mb-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Check-in thành công</span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">Nguyễn Văn An</div>
                    <div className="text-xs text-slate-500 font-mono truncate">079203xxxxxx</div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">P.104</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">Đã quét CCCD</span>
                    </div>
                  </div>

                  {/* Arrow pulse */}
                  <div className="flex flex-col items-center justify-center text-amber-300">
                    <div className="w-10 h-10 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-amber-300 text-xs shadow-md animate-pulse">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <span className="text-xs text-emerald-200 font-medium mt-1 leading-tight max-w-[70px] whitespace-nowrap">
                      Mã hoá gửi tự động
                    </span>
                  </div>

                  {/* Card 3: BCA VNeID */}
                  <div className="flex flex-col items-center justify-center bg-white/10 rounded-xl p-3 border border-white/20 w-36 shrink-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 p-0.5 shadow-lg">
                      <div className="w-full h-full rounded-full bg-red-700 flex flex-col items-center justify-center text-yellow-300 border-2 border-yellow-400">
                        <span className="text-xs leading-none">★</span>
                        <span className="text-xs font-black tracking-tighter text-yellow-300 mt-0.5">VNeID</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-white mt-1.5 leading-tight">Bộ Công an</div>
                    <div className="text-xs text-amber-300 font-semibold mt-0.5">Định danh VNeID</div>
                    <div className="text-xs text-emerald-200 mt-0.5">CSDL Quốc gia Dân cư</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: HighlightFeatureSection */}

        {/* BEGIN: BottomCTASection */}
        <section className="max-w-7xl mx-auto px-6 mb-16">
          <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-white border border-emerald-950 shadow-2xl bg-gradient-to-r from-[#03231e] via-[#053e34] to-[#042d26]">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Text & Action */}
              <div className="lg:col-span-7 space-y-4">
                <div className="text-xs uppercase tracking-widest font-extrabold text-amber-300 whitespace-nowrap">
                  ĐỒNG HÀNH CÙNG VIETSAGE
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight text-balance">
                  Cùng VietSage mở rộng giá trị cho ngành khách sạn Việt Nam.
                </h2>
                <p className="text-slate-300 text-xs sm:text-base leading-relaxed max-w-xl text-pretty">
                  Chúng tôi luôn chào đón các đối tác công nghệ cùng nhau xây dựng hệ sinh thái khách sạn hiện đại, hiệu quả và bền vững.
                </p>
                <div className="pt-2">
                  <Link
                    href="/contact?topic=partner-ecosystem"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#c59a50] hover:bg-amber-400 text-slate-900 font-bold text-xs sm:text-sm shadow-xl shadow-amber-900/40 transition duration-200 group cursor-pointer whitespace-nowrap"
                  >
                    <span>Liên hệ hợp tác</span>
                    <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                </div>
              </div>

              {/* Floating Nodes Graphic */}
              <div className="lg:col-span-5 relative flex items-center justify-center min-h-[220px]">
                {/* Hotel image */}
                <div className="relative w-64 h-40 sm:w-72 sm:h-44 rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/30">
                  <img
                    alt="Khách sạn đối tác VietSage"
                    className="w-full h-full object-cover"
                    src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
                  />
                  <div className="absolute inset-0 bg-[#053e34]/40 mix-blend-multiply" />
                </div>

                {/* Floating Orbit Nodes */}
                <div className="absolute -top-3 left-10 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg border-2 border-white/60">
                  <span className="text-xs">🛏</span>
                </div>
                <div className="absolute -top-1 right-10 w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg border-2 border-white/60">
                  <span className="text-xs">💳</span>
                </div>
                <div className="absolute -bottom-3 right-6 w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg border-2 border-white/60">
                  <span className="text-xs">🗄</span>
                </div>
                <div className="absolute bottom-2 left-6 w-9 h-9 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-lg border-2 border-white/60">
                  <span className="text-xs">💬</span>
                </div>
                <div className="absolute -bottom-4 left-24 w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg border-2 border-white/60">
                  <span className="text-xs">🔑</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: BottomCTASection */}
      </div>
    </MarketingShell>
  );
}
