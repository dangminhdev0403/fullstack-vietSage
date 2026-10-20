"use client";

import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export default function TichHopPage() {
  return (
    <MarketingShell locale="vi" showSceneRail={false} showSceneBackdrop={false}>
      <div className="bg-[#fbfbfc] text-slate-800 antialiased min-h-screen">
        {/* BEGIN: HeroIntroduction */}
        <section className="relative overflow-hidden pt-12 pb-8 border-b border-slate-100 bg-gradient-to-b from-amber-50/40 via-white to-[#fbfbfc]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/60 mb-3 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-800 whitespace-nowrap">
                HỆ SINH THÁI TÍCH HỢP VIETSAGE
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3 text-balance">
              Các đối tác tích hợp
            </h1>
            <p className="text-slate-600 text-sm sm:text-base lg:text-lg max-w-2xl font-normal leading-relaxed text-pretty">
              Kết nối với hơn <span className="font-bold text-slate-900">30+</span> đối tác công nghệ uy tín, bao phủ toàn bộ nhu cầu vận hành khách sạn.
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
                <p className="text-sm sm:text-base text-slate-600 mt-1 text-pretty">
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
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
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
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
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
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
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
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
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
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
                  Nền tảng du lịch phổ biến tại Đông Nam Á.
                </p>
              </div>

              {/* Expedia */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-amber-300 hover:bg-white rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group">
                <div className="h-9 flex items-center justify-center gap-1.5 mb-2">
                  <span className="text-xs bg-amber-400 text-blue-950 font-black px-1 rounded">Exp</span>
                  <span className="text-sm font-extrabold text-blue-950 tracking-tight">Expedia</span>
                </div>
                <p className="text-sm text-slate-600 text-center leading-snug text-pretty">
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
                <p className="text-sm sm:text-base text-slate-600 mt-1 text-pretty">
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
                    <div className="text-base font-bold text-slate-900">LocalMate Concierge</div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed text-pretty">
                    Trợ lý AI hỏi đáp tức thì đa ngôn ngữ, gợi ý ăn uống và địa điểm check-in chuẩn bản địa.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-amber-700 font-semibold">
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
                    <div className="text-base font-bold text-slate-900">Voice &amp; Chat AI Guest</div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed text-pretty">
                    Hỗ trợ đặt xe, dịch vụ phòng, tour trải nghiệm theo thời gian thực tiện lợi và nhanh chóng.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-blue-700 font-semibold">
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
                    <div className="text-base font-bold text-slate-900">Recommendation Engine</div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed text-pretty">
                    Cá nhân hoá hành trình du khách dựa trên sở thích, thói quen tiêu dùng và ngân sách du lịch.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-emerald-700 font-semibold">
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
                    <div className="text-base font-bold text-slate-900">Tích hợp đa kênh</div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed text-pretty">
                    Đồng bộ mượt mà Zalo OA, Web Widget, WhatsApp, Telegram và ứng dụng máy tính bảng phòng khách sạn.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-cyan-700 font-semibold">
                  <span className="whitespace-nowrap">Omnichannel sẵn sàng</span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </div>
          </section>

          {/* Category 3: Phần cứng & Thiết bị IoT */}
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
                <p className="text-sm sm:text-base text-slate-600 mt-1 text-pretty">
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
                <p className="text-sm text-slate-600 leading-relaxed text-pretty">
                  Giải pháp khóa thông minh cho khách sạn.
                </p>
              </div>

              {/* PHGLock */}
              <div className="bg-slate-50/70 border border-slate-100 hover:border-cyan-300 hover:bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div className="h-8 flex flex-col justify-center mb-2">
                  <span className="text-base font-extrabold text-[#0066b2] leading-none">PHGLock</span>
                  <span className="text-xs font-semibold text-cyan-700 mt-0.5">Smart Security</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed text-pretty">
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
                <p className="text-sm text-slate-600 leading-relaxed text-pretty">
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
                <p className="text-sm text-slate-600 leading-relaxed text-pretty">
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
                  <div className="w-12 h-12 rounded-2xl bg-white/95 p-1.5 shadow-md border border-amber-300/40 flex items-center justify-center shrink-0">
                    <Image
                      src="/images/vneid.png"
                      alt="Bộ Công an - VNeID & C06"
                      width={38}
                      height={38}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="inline-block px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    TÍNH NĂNG NỔI BẬT • BỘ CÔNG AN - VNeID &amp; C06
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-snug text-balance">
                  Tự động Khai báo lưu trú Công an
                </h2>

                <p className="text-emerald-100/90 text-sm sm:text-base lg:text-lg leading-relaxed text-pretty">
                  Sau mỗi lần check-in, hệ thống tự động gửi thông tin lưu trú đến cơ quan Công an theo quy định,{" "}
                  <span className="text-white font-semibold">nhanh chóng – chính xác – an toàn – giảm thiểu rủi ro.</span>
                </p>

                <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs sm:text-sm text-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Kết nối trực tiếp <strong>CSDL Quốc gia về Dân cư &amp; Định danh điện tử VNeID (Bộ Công an)</strong></span>
                </div>

                {/* 3 Value Props */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">✈</span>
                    <span className="text-xs sm:text-sm font-medium text-emerald-50">Tự động gửi sau mỗi check-in</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">✓</span>
                    <span className="text-xs sm:text-sm font-medium text-emerald-50">Đúng định dạng theo quy định CA</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                    <span className="text-amber-400 font-bold text-xs">🔒</span>
                    <span className="text-xs sm:text-sm font-medium text-emerald-50">An toàn, bảo mật dữ liệu khách hàng</span>
                  </div>
                </div>

                <div className="pt-3">
                  <Link
                    href="/contact?topic=kbtt-compliance"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#c59a50] hover:bg-amber-500 text-slate-900 font-bold text-sm sm:text-base shadow-lg shadow-amber-900/30 transition-all duration-200 group cursor-pointer whitespace-nowrap"
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
                  <div className="bg-white rounded-xl p-3 text-slate-800 shadow-md text-left w-36 sm:w-40 shrink-0 border border-slate-100">
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 mb-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Check-in thành công</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate">Nguyễn Văn An</div>
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
                    <span className="text-xs text-emerald-200 font-semibold mt-1 leading-tight max-w-[70px] whitespace-nowrap">
                      Mã hoá tự động
                    </span>
                  </div>

                  {/* Card 3: BCA VNeID */}
                  <div className="flex flex-col items-center justify-center bg-white/10 rounded-xl p-3 border border-white/20 w-36 sm:w-40 shrink-0 shadow-lg backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-2xl bg-white/95 p-1.5 shadow-md flex items-center justify-center border border-amber-300/40">
                      <Image
                        src="/images/vneid.png"
                        alt="Bộ Công an - VNeID & C06"
                        width={40}
                        height={40}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-sm font-bold text-white mt-1.5 leading-tight">Bộ Công an</div>
                    <div className="text-xs text-amber-300 font-semibold mt-0.5 whitespace-nowrap">Định danh VNeID</div>
                    <div className="text-xs text-emerald-200 mt-0.5 whitespace-nowrap">CSDL Dân cư</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: HighlightFeatureSection */}
      </div>
    </MarketingShell>
  );
}
