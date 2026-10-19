import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

function HotelIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 22v-6.57a2 2 0 0 1 4 0V22" />
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12h12" />
      <path d="M6 8h12" />
      <path d="M6 16h12" />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function PlayIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function CheckCircleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function PieChartIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

function TrendUpIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function WalletIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function ClockIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SmileIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function ShieldCheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function UserCheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  );
}

function PoliceShieldIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
      <path d="m12 8 1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2-1.5-1.5 2-.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MonitorIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function RefreshSyncIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SmartphoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function QuoteIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
    </svg>
  );
}

export default function GiaiPhapPage() {
  return (
    <MarketingShell locale="vi" showSceneRail={false} showSceneBackdrop={false}>
      {/* BEGIN: HeroSection */}
      <section className="relative pt-8 pb-12 overflow-hidden bg-gradient-to-b from-slate-50/80 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Column Content */}
            <div className="lg:col-span-6 space-y-5">
              {/* Category Tag */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/90 text-xs font-bold uppercase tracking-wider whitespace-nowrap shadow-xs">
                <HotelIcon className="w-3.5 h-3.5 text-amber-700" />
                <span>Giải pháp quản lý khách sạn toàn diện</span>
              </div>

              {/* Main Heading */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight text-balance">
                Vận hành tinh gọn.<br />
                <span className="text-emerald-900">Trải nghiệm vượt trội.</span>
              </h1>

              {/* Description */}
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal text-pretty max-w-xl">
                Bộ giải pháp VietSage giúp bạn số hóa toàn bộ hoạt động từ đặt phòng, check-in, vận hành, trải nghiệm khách hàng đến báo cáo doanh thu trên một nền tảng đồng bộ.
              </p>

              {/* Buttons Action Group */}
              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <a
                  href="#solutions"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                >
                  <span>Khám phá giải pháp</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </a>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-200 shadow-xs transition-all whitespace-nowrap"
                >
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">
                    <PlayIcon className="w-2.5 h-2.5 ml-0.5" />
                  </span>
                  <span>Xem demo trực tiếp</span>
                </Link>
              </div>

              {/* Trust Points */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 sm:gap-8 text-xs sm:text-sm font-semibold text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="whitespace-nowrap">Triển khai nhanh</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="whitespace-nowrap">Dễ sử dụng</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="whitespace-nowrap">Đồng hành lâu dài</span>
                </div>
              </div>
            </div>

            {/* Right Column Visual Graphic */}
            <div className="lg:col-span-6 relative">
              <div className="relative mx-auto max-w-lg lg:max-w-none">
                {/* Background Ambient Glow */}
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none" />

                {/* Main Hero Presentation Mockup Image */}
                <div className="relative rounded-2xl overflow-hidden shadow-xl border border-slate-200/60 bg-white">
                  <img
                    alt="Không gian khách sạn sang trọng và quản lý thông minh"
                    className="w-full h-[340px] sm:h-[380px] object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBx4LlQjfp3C0a0T1HEFlF1dGxf2pcL3_dDYJbAA8Q0Dsi8VMY3FAQ7ygnhrcDymOPLnUx9sf5Y6WSf70cOlVRHIW6JEyQQ-VYBeBcDx5s_P073p185EkxrJaFlaUjMBG60_R4GcRMuomyu7fuzgrcSuH19V94y3ERpYmIs8lGbCRgCPAi7sER2WkCn7GAPnnOuFoVSzQ5EpCyvecFTHjaGcrLp-HNbxfZOuVeEmhEPYFjvR4BREQbusw"
                  />
                  {/* Mockup Overlay Dashboard Screen Preview */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent flex flex-col justify-end p-5 text-white">
                    <div className="bg-white/95 backdrop-blur-md rounded-xl p-3.5 text-slate-800 shadow-xl border border-white/60">
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
                            Bảng điều khiển trực tiếp
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Hôm nay, 14:30</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2.5">
                        <div>
                          <div className="text-xs font-medium text-slate-500">Phòng đang có khách</div>
                          <div className="text-lg font-black text-slate-800 mt-0.5">
                            85/100{" "}
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1 whitespace-nowrap">
                              85%
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Doanh thu phòng (ngày)</div>
                          <div className="text-lg font-black text-emerald-900 mt-0.5">48,750,000₫</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Metric Badge 1: Occupancy */}
                <div className="absolute -top-4 -left-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-100 hidden sm:flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg font-bold shrink-0">
                    <PieChartIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Tỷ lệ lấp phòng</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-black text-slate-800">85%</span>
                      <span className="text-xs font-bold text-emerald-600 flex items-center whitespace-nowrap">
                        <TrendUpIcon className="w-3.5 h-3.5 mr-0.5" /> 12%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Floating Metric Badge 2: Revenue */}
                <div className="absolute -bottom-4 -right-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-100 hidden sm:flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold shrink-0">
                    <WalletIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Doanh thu hôm nay</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-black text-slate-800">48,750,000₫</span>
                      <span className="text-xs font-bold text-emerald-600 flex items-center whitespace-nowrap">
                        <TrendUpIcon className="w-3.5 h-3.5 mr-0.5" /> 18%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: HeroSection */}

      {/* BEGIN: ValuePropsBar */}
      <section className="py-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Prop 1 */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50/60 border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="w-11 h-11 min-w-[44px] rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shadow-xs shrink-0">
                <TrendUpIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight text-balance">Tăng doanh thu</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug text-pretty">Tối ưu kênh bán &amp; giá phòng thông minh</p>
              </div>
            </div>

            {/* Prop 2 */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50/60 border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="w-11 h-11 min-w-[44px] rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg shadow-xs shrink-0">
                <ClockIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight text-balance">Tiết kiệm thời gian</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug text-pretty">Tự động hóa hơn 70% quy trình lễ tân</p>
              </div>
            </div>

            {/* Prop 3 */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50/60 border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="w-11 h-11 min-w-[44px] rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg shadow-xs shrink-0">
                <SmileIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight text-balance">Nâng cao trải nghiệm</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug text-pretty">Dịch vụ cá nhân hóa qua E-Concierge</p>
              </div>
            </div>

            {/* Prop 4 */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50/60 border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="w-11 h-11 min-w-[44px] rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-lg shadow-xs shrink-0">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight text-balance">Tuân thủ pháp lý</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug text-pretty">Tự động khai báo lưu trú CA chuẩn xác</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: ValuePropsBar */}

      {/* BEGIN: PoliceReportingFeature */}
      <section className="py-14 bg-[#fafcfb]" id="police-reporting">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Text Details */}
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/90 text-xs font-bold uppercase tracking-wider whitespace-nowrap shadow-xs">
                <span>Tính năng nổi bật</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight text-balance">
                Tự động khai báo lưu trú Công an sau mỗi lần check-in
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed text-pretty">
                VietSage tự động gửi dữ liệu lưu trú của khách đến cơ quan Công an theo chuẩn quy định, giảm tải triệt để khâu nhập liệu thủ công và đảm bảo tuân thủ pháp lý 100%.
              </p>

              {/* Feature Checkpoints */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs shrink-0 font-bold">
                    ✓
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 text-pretty">
                    Tự động gửi thông tin ngay sau khi hoàn tất check-in
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs shrink-0 font-bold">
                    ✓
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 text-pretty">
                    Đúng định dạng theo chuẩn của Cơ quan Công an &amp; VNeID
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs shrink-0 font-bold">
                    ✓
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 text-pretty">
                    An toàn, bảo mật dữ liệu khách hàng theo chuẩn mã hóa SSL
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#9e6328] hover:bg-[#85511e] text-white font-semibold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap"
                >
                  <span>Tìm hiểu chi tiết</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right Workflow Interactive Illustration */}
            <div className="lg:col-span-7 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/80 shadow-sm">
              {/* Flow Diagram Steps */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center items-center pb-6 border-b border-slate-100">
                {/* Step 1 */}
                <div className="flex flex-col items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-white text-emerald-900 shadow-xs flex items-center justify-center text-lg mb-1.5 shrink-0">
                    <UserCheckIcon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 text-balance">Khách check-in</span>
                  <span className="text-xs text-slate-400 mt-0.5">Quét CCCD / Hộ chiếu</span>
                </div>

                {/* Connecting Arrow */}
                <div className="flex flex-col items-center px-1">
                  <div className="w-full flex items-center justify-center text-emerald-600 text-sm">
                    <ArrowRightIcon className="w-5 h-5 hidden sm:inline" />
                    <ArrowRightIcon className="w-4 h-4 sm:hidden" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 mt-1 text-center whitespace-nowrap">
                    Tự động gửi thông tin
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex flex-col items-center p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-900 text-amber-400 shadow-xs flex items-center justify-center text-lg mb-1.5 shrink-0">
                    <PoliceShieldIcon className="w-5 h-5 text-amber-300" />
                  </div>
                  <span className="text-xs font-bold text-emerald-950 text-balance">Công an tiếp nhận</span>
                  <span className="text-xs text-emerald-700 mt-0.5">Đồng bộ tức thì</span>
                </div>
              </div>

              {/* Detailed Card & Real World Scene Preview */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center">
                {/* Success Notification Card */}
                <div className="sm:col-span-7 bg-emerald-900 text-white rounded-xl p-4 shadow-md relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2.5 text-emerald-300">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span className="text-xs font-bold tracking-wide uppercase whitespace-nowrap">
                      Check-in thành công
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-sm text-white">Nguyễn Văn An</div>
                    <div className="text-emerald-200/90 font-mono text-xs">CCCD: 0792030048xx</div>
                    <div className="text-emerald-200/90 text-xs">Phòng 101 • 2 khách • 3 đêm</div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-emerald-800/80 flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Đã gửi khai báo lưu trú
                    </span>
                    <span className="font-mono text-emerald-400 whitespace-nowrap">14:32 | 01/06/2024</span>
                  </div>
                </div>

                {/* Mini Scene Hotel Illustration */}
                <div className="sm:col-span-5 h-full min-h-[120px] rounded-xl overflow-hidden relative border border-slate-100">
                  <img
                    alt="Khách sạn vận hành hiệu quả"
                    className="w-full h-full object-cover min-h-[120px]"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAoc8WcnMOWQJ1rUshtjv4Fisj0q9RCk1an8b3nYpJmrMFDGMYKQs0b1PzEI3iJ9iGKIvKN56rSxHi1XNW9cBHTndruW58vZxCb0rkpL3pIkpYJdCdRWffSZ3lWyRB85WWC4VIMS2EO7P9jyB8SryA96l_5yjAAnkbZncAqgenMLQyeo13zePCuocXPjrJQ9b30TqtaeAVdWWuuvjktR4FcGV5B6M6MjLbY1YdNFsaV2UU4ny5RyUmU7g"
                  />
                  <div className="absolute inset-0 bg-emerald-950/20" />
                  <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-white/90 backdrop-blur-md rounded text-xs font-semibold text-slate-700 text-center whitespace-nowrap">
                    Bảo mật dữ liệu 256-bit SSL
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: PoliceReportingFeature */}

      {/* BEGIN: MainSolutionsSection */}
      <section className="py-14 bg-slate-50/60" id="solutions">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="space-y-2 mb-10 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/90 text-xs font-bold uppercase tracking-wider whitespace-nowrap shadow-xs">
              <span>Các giải pháp chính</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight text-balance">
              Giải pháp cốt lõi phù hợp cho mọi mô hình khách sạn
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm max-w-2xl leading-relaxed text-pretty">
              Linh hoạt tùy chỉnh theo quy mô từ khách sạn boutique đến chuỗi lưu trú, dễ dàng nâng cấp và mở rộng theo đà phát triển kinh doanh.
            </p>
          </div>

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: PMS */}
            <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col group">
              <div className="h-40 overflow-hidden relative">
                <img
                  alt="PMS Quản lý khách sạn"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBXPljD1FfIbkUmizkj7OBf02PKot2faM8Smo3KWuQOp6ILQUuwbWMzfTqmLPufPhapuxKaxqX6KmAg7U_Rb5Oq1YEvk5A5oVC5Vo3K8bV5KteIa2Oh0VRbxHeg1-KZtjzjQdUPeVIjoc13Iys362aJZ3bhonRWrQUdNeVdMjSqNN4Ph1hZRZcoq_jDjjAiZv92rHMAzoQ6dcx5ZFUjcI6-8CVlLDRaw41orWlDrLVxXOfzMtz8RvdMLA"
                />
                <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-white/95 text-emerald-900 flex items-center justify-center text-xs shadow-xs">
                  <MonitorIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-slate-900 leading-tight text-balance">PMS</h3>
                <p className="text-xs font-semibold text-emerald-800 mb-2 leading-tight">Quản lý khách sạn</p>
                <p className="text-xs text-slate-600 line-clamp-3 mb-3 leading-relaxed flex-1 text-pretty">
                  Quản lý đặt phòng, lễ tân, buồng phòng, dịch vụ và dòng tiền tập trung trên giao diện trực quan, dễ thao tác.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 hover:text-emerald-700 transition-colors pt-2 border-t border-slate-100 whitespace-nowrap"
                >
                  <span>Tìm hiểu thêm</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 2: Channel Manager */}
            <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col group">
              <div className="h-40 overflow-hidden relative">
                <img
                  alt="Channel Manager quản lý kênh bán OTA"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4FH8lsWShCJXH4QaJgrcmAsHn2C_8w4FZWNXNjZSkAhWLk40dBUbIYR4Vz1RxP_UmuiWAASRTWk_dRFXizKnioPMhj6mby0RZQqFtdTPvhSuciTH_87WsXkMll1LGyPvq60E6hSSpoEZeadBrww43JxutWTaB8p8c43S4dOQ2cZ7zi1htMLnhb-vi9t0LGrjTAKqrzBy2TrzMq7Fy2bSSpblmO4fThhv-o0aKrMsuXacbWc82sq-g_Q"
                />
                <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-white/95 text-emerald-900 flex items-center justify-center text-xs shadow-xs">
                  <RefreshSyncIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-slate-900 leading-tight text-balance">Channel Manager</h3>
                <p className="text-xs font-semibold text-emerald-800 mb-2 leading-tight">Quản lý kênh bán</p>
                <p className="text-xs text-slate-600 line-clamp-3 mb-3 leading-relaxed flex-1 text-pretty">
                  Đồng bộ tồn phòng, giá bán tức thì từ các kênh OTA quốc tế và nội địa, loại bỏ hoàn toàn nguy cơ overbooking.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 hover:text-emerald-700 transition-colors pt-2 border-t border-slate-100 whitespace-nowrap"
                >
                  <span>Tìm hiểu thêm</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 3: E-Concierge */}
            <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col group">
              <div className="h-40 overflow-hidden relative">
                <img
                  alt="E-Concierge trải nghiệm khách số hóa"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBXw6lHcsubHomP5dfqOmkRcWaZRepKHgn4AfZxwRT4V2x3wwO-wfbLuL6hnqRhr3MeXTPx0jFlPqlASFCyprqdMzSNL5EYVv2SlZRkldIkBeN7Rj9phjz6zYZGJGmGEZF1QN_C4jjFnxYwrB9ZuDVV8QVnYL7cC8szd-Mkajsxr2BJr7Gj5uoDZdDzl9UIbBtuVbyfDgp8ZB2fV_xnjnFQaH-Pfe_ixTj2dNZx2vJPEDc8ZeZH-yfpNA"
                />
                <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-white/95 text-emerald-900 flex items-center justify-center text-xs shadow-xs">
                  <SmartphoneIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-slate-900 leading-tight text-balance">E-Concierge</h3>
                <p className="text-xs font-semibold text-emerald-800 mb-2 leading-tight">Số hóa trải nghiệm khách</p>
                <p className="text-xs text-slate-600 line-clamp-3 mb-3 leading-relaxed flex-1 text-pretty">
                  Cung cấp tiện ích check-in online không chạm, yêu cầu dịch vụ phòng và gọi món tiện lợi ngay trên điện thoại của khách.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 hover:text-emerald-700 transition-colors pt-2 border-t border-slate-100 whitespace-nowrap"
                >
                  <span>Tìm hiểu thêm</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 4: Báo cáo & Doanh thu */}
            <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col group">
              <div className="h-40 overflow-hidden relative">
                <img
                  alt="Báo cáo phân tích doanh thu khách sạn"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAKc8HGcWtFz_OhMNW-CeX-1HLO7_PAOyICgxRZ4NGrwOp5nC0sbngoW_FHMOI6wXRuZ0172jphyK9ZEEgB6jSpLD6UQhSKVxc--kA6NRZhxqGGVRg_x_zwrBm_B0vfBlZxvC-3VNqTWgBi0bLs-qxqLTYaa_reHTHNkTGlR49YCfwuZWT_UqEDvPrqB8lnwgiixp7zYSG266o5Dw1qmtZqvxXFILgg34bXWM2Kqfx2Nzz9ZpeoNvJw4A"
                />
                <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-white/95 text-emerald-900 flex items-center justify-center text-xs shadow-xs">
                  <PieChartIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-slate-900 leading-tight text-balance">Báo cáo &amp; Doanh thu</h3>
                <p className="text-xs font-semibold text-emerald-800 mb-2 leading-tight">Ra quyết định thông minh</p>
                <p className="text-xs text-slate-600 line-clamp-3 mb-3 leading-relaxed flex-1 text-pretty">
                  Theo dõi hiệu suất kinh doanh qua chỉ số RevPAR, ADR và công suất phòng thời gian thực, hỗ trợ ra quyết định giá chính xác.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 hover:text-emerald-700 transition-colors pt-2 border-t border-slate-100 whitespace-nowrap"
                >
                  <span>Tìm hiểu thêm</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: MainSolutionsSection */}

      {/* BEGIN: SocialProofSection */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Image and floating hotel trust card */}
            <div className="lg:col-span-5 relative">
              <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200">
                <img
                  alt="Khách sạn tin dùng giải pháp VietSage"
                  className="w-full h-[300px] sm:h-[340px] object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfbyjUTi9SuPO6G5NmV-dkR10gHBBGXMY0pK7W6M3u2fi6e0KLxsL20B5Xon09DJYsNuo1apY8EN6N42H6UrE6HBeYjOtUCw9QV4L9vat1xrwxSQIyt_LxNKuBeX-UHcAeajQcUk9NjF5yIsx5vw3Qk0alu4LarbVJvWu_QtVrJgsgQ34zVq80CB-6oAwww64fTiFnkEfNX0fky7DnY4jxKjff1BcEMhuo0dmCbfV61maaNHveWvLbyg"
                />
              </div>
              {/* Floating Badge for Trust */}
              <div className="absolute -bottom-4 -right-2 sm:right-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-100 max-w-xs">
                <div className="text-xl font-black text-emerald-950">300+ đối tác</div>
                <div className="text-xs font-semibold text-slate-600">Khách sạn tin dùng trên toàn quốc</div>
                <div className="flex items-center -space-x-1.5 mt-1.5">
                  <img
                    alt="Quản lý khách sạn đối tác"
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-white object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBqqwxob9XA367s3yNvHjEhAwRXaLAIWZ5jfWRBIKhH5c8U5wbzEdz4JREKlFzfjeng61ewfgNDDFVxztDJUSV8AbaVYJ09W7ga3y__IvyZJubWLqpjGMcAP2_cD1T6g_VgFFPzJr42WVR1FiAf9KLBrgNrM67impobE9jaB3BTy5Xbk6FnoIVbAeojxWvhk0TFbxMYeXWdLGWDsNTLJQIc8U7Q9GVVPQq-LvprQEaxeZOuvz1x0wmmaw"
                  />
                  <img
                    alt="Quản lý khách sạn đối tác"
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-white object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCz33bWmGJ0SsAg0kaMU0lgfAULxVAhP1xWGESDWcnv7hoVHi0M05VXn9nf7so17HYHC68j2dKblEnsWjVEM0KC4T0d5pzB-NSaHXjlMugutg8A1B8dwUvq4BEh4QkEv8H5qNG7tg_mZ5uRBB7Gm0lBrKxYrKjf2cvsLR3Xno1OaYUda2Ys5O6G11te8bbOCvJ1tUBeWYkyGQHoVMEbrDesO3IbTXq0BxGVkgNy0Q5Fk6iklKgIbuhHSw"
                  />
                  <img
                    alt="Quản lý khách sạn đối tác"
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-white object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTp6J_RO7S55x-hcnIhUIhGtc9_IhjyEX3DAR-5IRv-AntCPUoKFoeXlhzg3EcxvU1ygJFC4CkB4epxEG51afPwx3B3uTgP761G-M_OldE_Rz32O-AxB5vzVViE792ET1UtmVR5pxaFuareDT788l1QANND82iPzixlKtfVf_RbfsjjR3MlxyipuggWNZ4Ye6AHFSIxKrkVasNeR4CtTMGzLXfOpmVg5JHb3I8n-42Sx-TgAmv64trnA"
                  />
                  <div className="inline-flex items-center justify-center h-6 w-6 rounded-full ring-2 ring-white bg-emerald-100 text-xs font-bold text-emerald-900 whitespace-nowrap">
                    +297
                  </div>
                </div>
              </div>
            </div>

            {/* Numbers & Text on Right */}
            <div className="lg:col-span-7 space-y-5 lg:pl-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/90 text-xs font-bold uppercase tracking-wider whitespace-nowrap shadow-xs">
                <span>Được tin tưởng</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight text-balance">
                Đồng hành cùng hơn 300+ khách sạn trên toàn quốc
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed text-pretty">
                Từ khách sạn boutique, resort nghỉ dưỡng ven biển đến chuỗi lưu trú thương mại, VietSage tự hào là người bạn đồng hành tin cậy kiến tạo chuẩn mực vận hành mới.
              </p>

              {/* 4 Metrics Counter */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                <div className="p-3 bg-slate-50/70 rounded-xl">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">300+</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 whitespace-nowrap">Khách sạn</div>
                </div>
                <div className="p-3 bg-slate-50/70 rounded-xl">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">50,000+</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 whitespace-nowrap">Phòng vận hành</div>
                </div>
                <div className="p-3 bg-slate-50/70 rounded-xl">
                  <div className="text-2xl sm:text-3xl font-black text-emerald-900">98%</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 whitespace-nowrap">Hài lòng</div>
                </div>
                <div className="p-3 bg-slate-50/70 rounded-xl">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">24/7</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 whitespace-nowrap">Hỗ trợ kỹ thuật</div>
                </div>
              </div>

              {/* Testimonial Quote */}
              <div className="pt-2">
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-start gap-3">
                  <QuoteIcon className="w-5 h-5 text-emerald-800 mt-0.5 shrink-0" />
                  <div className="text-xs text-slate-700 leading-relaxed text-pretty">
                    <span className="italic font-medium">
                      &ldquo;VietSage giúp chúng tôi tiết kiệm thời gian vận hành và khai báo lưu trú Công an tự động, đội ngũ hỗ trợ cực kỳ tận tâm.&rdquo;
                    </span>
                    <span className="block mt-1 font-bold text-emerald-950 text-xs">
                      — Nguyễn Thị Mai, Quản lý Khách sạn Soleil Đà Nẵng
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: SocialProofSection */}

      {/* BEGIN: CTABanner */}
      <section className="py-10 bg-white" id="contact">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-emerald-950 text-white shadow-xl">
            {/* Background Resort Backdrop */}
            <div className="absolute inset-0 z-0 opacity-20">
              <img
                alt="Resort hoàng hôn"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDcZIJpnYIhyP_O0NCpLqnzaDQLNcFaujLc3Db7Aoq1dWFo58ukjT60ky0aprsyNApTT6oPlV0u3oBISeyQT8LhZO1-ev3MiXNz7oIgcabfpXRl3UYllFgQaedt1xsbAcA05jTMZOhWpGTKsXNHEj6skT-ewGW_bz4CA8P0N72MWBb0E7eedSWO2JrQpNjEJcNyUf0pTxnsl5H_AmVdGZoo5eb6N-WtI0jF1gBnoYqdZb8xdeSj5nvy3w"
              />
            </div>

            <div className="relative z-10 p-6 sm:p-10 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Content */}
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800 text-emerald-200 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                  <span>Bắt đầu ngay hôm nay</span>
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight text-balance">
                  Đưa khách sạn của bạn lên tầm cao mới cùng VietSage
                </h2>
                <p className="text-emerald-100/90 text-xs sm:text-sm max-w-xl leading-relaxed text-pretty">
                  Tư vấn giải pháp phù hợp với quy mô và nhu cầu vận hành thực tế. Trải nghiệm hệ thống quản trị hiện đại, linh hoạt và đồng hành 24/7.
                </p>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3.5 pt-1">
                  <Link
                    href="/contact"
                    className="px-5 py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-transform hover:-translate-y-0.5 inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <span>Liên hệ tư vấn ngay</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/contact"
                    className="px-5 py-3 rounded-full bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/60 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap"
                  >
                    <span>Xem demo trực tiếp</span>
                  </Link>
                </div>
              </div>

              {/* Right Checklist Box */}
              <div className="lg:col-span-5 bg-white/10 backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-white/15">
                <div className="space-y-3 text-xs sm:text-sm font-semibold text-emerald-50">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                    <span className="text-pretty">Tư vấn 1:1 cùng chuyên gia công nghệ khách sạn</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                    <span className="text-pretty">Demo trực tiếp các tính năng trên hệ thống thật</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                    <span className="text-pretty">Đề xuất gói giải pháp tối ưu theo ngân sách</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                    <span className="text-pretty">Triển khai nhanh chóng, hỗ trợ kỹ thuật 24/7</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* END: CTABanner */}
    </MarketingShell>
  );
}
