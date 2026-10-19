"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

interface PartnerItem {
  id: string;
  name: string;
  category: "ota" | "pms" | "ops" | "payment" | "hardware";
  categoryLabel: string;
  tagline: string;
  logo: React.ReactNode;
}

interface SectionConfig {
  id: "ota" | "pms" | "ops" | "payment" | "hardware";
  label: string;
  description: string;
  gridCols: string;
  icon: (className?: string) => React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  {
    id: "ota",
    label: "Kênh OTA & Booking",
    description: "Đồng bộ lịch phòng, quản lý giá và tối ưu doanh thu từ các kênh đặt phòng trực tuyến.",
    gridCols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
    icon: (className = "h-5 w-5") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      </svg>
    ),
  },
  {
    id: "pms",
    label: "Hệ thống Quản lý PMS",
    description: "Kết nối với các hệ thống quản lý khách sạn phổ biến, giúp đồng bộ dữ liệu phòng, đặt phòng và vận hành.",
    gridCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    icon: (className = "h-5 w-5") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
      </svg>
    ),
  },
  {
    id: "ops",
    label: "Dịch vụ vận hành & Thuế số",
    description: "Tích hợp các dịch vụ hỗ trợ vận hành khách sạn như quản lý phân phối, kênh đánh giá và công cụ marketing.",
    gridCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    icon: (className = "h-5 w-5") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: "payment",
    label: "Cổng Thanh toán & Ví điện tử",
    description: "Hỗ trợ đa dạng phương thức thanh toán, giúp khách sạn tối ưu trải nghiệm và tăng tỷ lệ chuyển đổi.",
    gridCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    icon: (className = "h-5 w-5") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
  },
  {
    id: "hardware",
    label: "Phần cứng & Thiết bị IoT",
    description: "Kết nối với các thiết bị thông minh, nâng cao trải nghiệm khách và tối ưu vận hành.",
    gridCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    icon: (className = "h-5 w-5") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 9h6v6H9z" />
        <path d="M15 3v6" />
        <path d="M9 3v6" />
        <path d="M15 15v6" />
        <path d="M9 15v6" />
      </svg>
    ),
  },
];

const PARTNERS: PartnerItem[] = [
  // 1. Kênh OTA & Booking
  {
    id: "booking-com",
    name: "Booking.com",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Kênh đặt phòng toàn cầu phổ biến nhất.",
    logo: (
      <div className="flex items-center justify-center">
        <span className="text-xl sm:text-2xl font-black tracking-tight text-[#003580] font-sans">
          Booking<span className="text-[#0080ff]">.com</span>
        </span>
      </div>
    ),
  },
  {
    id: "agoda",
    name: "Agoda",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Nền tảng đặt phòng hàng đầu châu Á.",
    logo: (
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e12d2d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5a623]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7ed321]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#50e3c2]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#9013fe]" />
        </div>
        <span className="text-lg font-black tracking-tight text-slate-800 lowercase">agoda</span>
      </div>
    ),
  },
  {
    id: "airbnb",
    name: "Airbnb",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Kết nối với cộng đồng khách du lịch toàn cầu.",
    logo: (
      <div className="flex items-center justify-center gap-1.5">
        <svg className="h-7 w-7 text-[#ff5a5f]" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <path d="M16 1c2 0 4 2 4 4.5 0 3.7-2 8.4-4 12.3-2-3.9-4-8.6-4-12.3C12 3 14 1 16 1zm0 2.2c-1 0-2 1.1-2 2.3 0 2.9 1.6 6.8 3.2 10.1 1.6-3.3 3.2-7.2 3.2-10.1 0-1.2-1-2.3-2-2.3zM16 19c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 13.8c-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8 5.8 2.6 5.8 5.8-2.6 5.8-5.8 5.8z" />
        </svg>
        <span className="text-xl font-extrabold tracking-tight text-[#ff5a5f]">airbnb</span>
      </div>
    ),
  },
  {
    id: "trip-com",
    name: "Trip.com",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Nền tảng du lịch hàng đầu khu vực châu Á.",
    logo: (
      <div className="flex items-center justify-center gap-1.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2681ff] text-white font-bold text-xs">
          Trip
        </span>
        <span className="text-lg font-black tracking-tight text-slate-800">Trip.com</span>
      </div>
    ),
  },
  {
    id: "traveloka",
    name: "Traveloka",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Nền tảng du lịch phổ biến tại Đông Nam Á.",
    logo: (
      <div className="flex items-center justify-center gap-1.5">
        <svg className="h-6 w-6 text-[#0064d2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
        <span className="text-lg font-black tracking-tight text-[#0064d2]">traveloka</span>
      </div>
    ),
  },
  {
    id: "expedia",
    name: "Expedia",
    category: "ota",
    categoryLabel: "Kênh OTA",
    tagline: "Nền tảng du lịch toàn cầu với mạng lưới rộng lớn.",
    logo: (
      <div className="flex items-center justify-center gap-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00355f] text-[#ffc400] text-xs font-bold">
          ✈
        </div>
        <span className="text-lg font-black tracking-tight text-[#00355f]">Expedia</span>
      </div>
    ),
  },

  // 2. Hệ thống Quản lý PMS
  {
    id: "oracle-opera",
    name: "Oracle Hospitality OPERA Cloud",
    category: "pms",
    categoryLabel: "Hệ thống PMS",
    tagline: "Hệ thống PMS hàng đầu toàn cầu.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c74634] text-white font-black text-xs">
          ORCL
        </span>
        <div className="text-left leading-tight">
          <span className="text-xs font-bold text-[#c74634] uppercase tracking-wider block">ORACLE HOSPITALITY</span>
          <span className="text-base font-extrabold tracking-tight text-slate-900">OPERA Cloud</span>
        </div>
      </div>
    ),
  },
  {
    id: "innkeeper",
    name: "INNKEEPER Hotel Software",
    category: "pms",
    categoryLabel: "Hệ thống PMS",
    tagline: "Giải pháp quản lý khách sạn dễ sử dụng.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b6623] text-white font-black text-xs">
          ik
        </span>
        <div className="text-left leading-tight">
          <span className="text-base font-black tracking-tight text-[#0b6623]">INNKEEPER</span>
          <span className="block text-xs font-semibold text-slate-500">Hotel Software</span>
        </div>
      </div>
    ),
  },
  {
    id: "ezcloud",
    name: "ezCloud",
    category: "pms",
    categoryLabel: "Hệ thống PMS",
    tagline: "Nền tảng quản lý khách sạn phổ biến tại Việt Nam.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ff6600] text-white font-black text-xs">
          ez
        </span>
        <span className="text-xl font-black tracking-tight text-[#ff6600]">ezCloud</span>
      </div>
    ),
  },
  {
    id: "cloudbeds",
    name: "Cloudbeds",
    category: "pms",
    categoryLabel: "Hệ thống PMS",
    tagline: "Giải pháp PMS toàn diện cho khách sạn hiện đại.",
    logo: (
      <div className="flex items-center gap-2.5">
        <svg className="h-8 w-8 text-[#00a3e0]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
        <span className="text-xl font-black tracking-tight text-[#00a3e0]">Cloudbeds</span>
      </div>
    ),
  },

  // 3. Dịch vụ vận hành & Thuế số
  {
    id: "goglobal",
    name: "GO GLOBAL OTA Đánh Giá",
    category: "ops",
    categoryLabel: "Dịch vụ vận hành",
    tagline: "Quản lý đánh giá và uy tín thương hiệu.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d92d20] text-white font-black text-xs shadow-xs">
          GG
        </span>
        <div className="text-left leading-tight">
          <span className="text-sm font-black tracking-tight text-[#d92d20] uppercase block">GO GLOBAL</span>
          <span className="text-xs font-semibold text-slate-600">OTA Đánh Giá</span>
        </div>
      </div>
    ),
  },
  {
    id: "viettel",
    name: "Viettel Business Solutions",
    category: "ops",
    categoryLabel: "Dịch vụ vận hành",
    tagline: "Giải pháp viễn thông & chuyển đổi số.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ee0033] text-white font-black text-xs shadow-xs">
          W
        </span>
        <div className="text-left leading-tight">
          <span className="text-base font-black tracking-tight text-[#ee0033]">Viettel</span>
          <span className="block text-xs font-semibold text-slate-500">Business Solutions</span>
        </div>
      </div>
    ),
  },
  {
    id: "vnpt-einvoice",
    name: "VNPT e-invoice",
    category: "ops",
    categoryLabel: "Thuế số & Hóa đơn",
    tagline: "Giải pháp hóa đơn điện tử an toàn, tuân thủ quy định.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#005bac] text-white font-black text-xs shadow-xs">
          VNPT
        </span>
        <span className="text-base font-black tracking-tight text-[#005bac]">VNPT e-invoice</span>
      </div>
    ),
  },
  {
    id: "qikstay",
    name: "QikStay",
    category: "ops",
    categoryLabel: "Dịch vụ vận hành",
    tagline: "Giải pháp check-in trực tuyến, tiết kiệm thời gian.",
    logo: (
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4f46e5] text-white font-bold text-xs shadow-xs">
          QS
        </span>
        <span className="text-lg font-black tracking-tight text-[#4f46e5]">QikStay</span>
      </div>
    ),
  },

  // 4. Cổng Thanh toán & Ví điện tử
  {
    id: "vnpay-qr",
    name: "VNPAY-QR",
    category: "payment",
    categoryLabel: "Cổng Thanh toán",
    tagline: "Thanh toán QR phổ biến tại Việt Nam.",
    logo: (
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-2 gap-0.5">
          <span className="h-3 w-3 bg-[#005baa] rounded-xs" />
          <span className="h-3 w-3 bg-[#e31e24] rounded-xs" />
          <span className="h-3 w-3 bg-[#e31e24] rounded-xs" />
          <span className="h-3 w-3 bg-[#005baa] rounded-xs" />
        </div>
        <span className="text-lg font-black tracking-tight text-[#005baa]">
          VNPAY<span className="text-[#e31e24]">·QR</span>
        </span>
      </div>
    ),
  },
  {
    id: "momo",
    name: "MoMo",
    category: "payment",
    categoryLabel: "Ví điện tử",
    tagline: "Ví điện tử được ưa chuộng nhất tại Việt Nam.",
    logo: (
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#a50064] text-white font-black text-xs shadow-xs">
          momo
        </span>
        <span className="text-lg font-black tracking-tight text-[#a50064]">MoMo</span>
      </div>
    ),
  },
  {
    id: "visa",
    name: "VISA",
    category: "payment",
    categoryLabel: "Thẻ Quốc Tế",
    tagline: "Thanh toán thẻ quốc tế an toàn, nhanh chóng.",
    logo: (
      <div className="flex items-center justify-center">
        <span className="text-2xl font-black italic tracking-tighter text-[#1a1f71] font-sans">
          VISA
        </span>
      </div>
    ),
  },
  {
    id: "mastercard",
    name: "MasterCard",
    category: "payment",
    categoryLabel: "Thẻ Quốc Tế",
    tagline: "Giải pháp thanh toán toàn cầu dành cho khách sạn.",
    logo: (
      <div className="flex items-center justify-center gap-2">
        <div className="flex -space-x-3">
          <span className="h-7 w-7 rounded-full bg-[#eb001b] opacity-90" />
          <span className="h-7 w-7 rounded-full bg-[#f79e1b] opacity-90" />
        </div>
        <span className="text-sm font-extrabold tracking-tight text-slate-800 lowercase">mastercard</span>
      </div>
    ),
  },

  // 5. Phần cứng & Thiết bị IoT
  {
    id: "hafele",
    name: "HÄFELE",
    category: "hardware",
    categoryLabel: "Khóa thông minh",
    tagline: "Giải pháp khóa thông minh cho khách sạn.",
    logo: (
      <div className="flex items-center justify-center">
        <span className="text-xl font-black tracking-wider text-[#da291c] font-sans">
          HÄFELE
        </span>
      </div>
    ),
  },
  {
    id: "phglock",
    name: "PHGLock Smart Security",
    category: "hardware",
    categoryLabel: "Khóa điện tử",
    tagline: "Thiết bị khóa điện tử hiện đại.",
    logo: (
      <div className="text-left leading-none">
        <span className="text-base font-black tracking-tight text-[#0066cc]">PHGLock</span>
        <span className="block text-xs font-semibold text-[#00a3e0] uppercase tracking-wider mt-0.5">
          Smart Security
        </span>
      </div>
    ),
  },
  {
    id: "miwa",
    name: "MIWA",
    category: "hardware",
    categoryLabel: "Kiểm soát ra vào",
    tagline: "Giải pháp kiểm soát ra vào chuyên nghiệp.",
    logo: (
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#008751] text-white font-black text-xs">
          M
        </span>
        <span className="text-xl font-black tracking-wider text-[#008751]">MIWA</span>
      </div>
    ),
  },
  {
    id: "zkteco",
    name: "ZKTeco",
    category: "hardware",
    categoryLabel: "An ninh thông minh",
    tagline: "Thiết bị kiểm soát an ninh thông minh.",
    logo: (
      <div className="flex items-center justify-center">
        <span className="text-xl font-black tracking-tight text-slate-900 font-sans">
          ZK<span className="text-[#689f38]">Teco</span>
        </span>
      </div>
    ),
  },
];

export default function TichHopPage() {
  const searchInputId = useId();
  const [searchQuery, setSearchQuery] = useState("");

  const visibleSections = useMemo(() => {
    return SECTIONS.map((sec) => {
      const items = PARTNERS.filter((p) => {
        if (p.category !== sec.id) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.categoryLabel.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q)
        );
      });
      return { ...sec, items };
    }).filter((sec) => sec.items.length > 0);
  }, [searchQuery]);

  return (
    <MarketingShell locale="vi">
      <main className="bg-[#fcfbfa] text-slate-900 min-h-screen">
        {/* Top Header Hero */}
        <section className="relative overflow-hidden pt-16 pb-12 sm:pt-20 sm:pb-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200/60 bg-gradient-to-b from-amber-50/50 via-white to-[#fcfbfa]">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl space-y-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-100/60 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-900 whitespace-nowrap">
                  HỆ SINH THÁI TÍCH HỢP VIETSAGE
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight text-balance">
                Các đối tác tích hợp
              </h1>
              <p className="text-sm sm:text-base text-slate-600 font-medium text-pretty leading-relaxed">
                Kết nối với hơn 30+ đối tác công nghệ uy tín, bao phủ toàn bộ nhu cầu vận hành khách sạn.
              </p>
            </div>

            {/* Quick Search Bar */}
            <div className="mt-8 max-w-xl">
              <div className="relative flex items-center rounded-2xl border border-slate-200 bg-white p-2 shadow-xs focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
                <span className="pl-3 pr-2 text-slate-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  id={searchInputId}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm nhanh đối tác (Booking, Agoda, Opera, Viettel, VNPAY, Häfele...)"
                  className="w-full bg-transparent px-2 py-1.5 text-xs sm:text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mr-2 rounded-full p-1 text-xs text-slate-400 hover:bg-slate-100 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Categorized Partner Grid Sections */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-12 sm:space-y-16">
            {visibleSections.map((section) => (
              <div key={section.id} className="space-y-5">
                {/* Category Header */}
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700/10 text-emerald-800 shadow-2xs border border-emerald-700/20">
                    {section.icon("h-5 w-5")}
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight text-balance">
                      {section.label}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 font-medium text-pretty">
                      {section.description}
                    </p>
                  </div>
                </div>

                {/* Partner Cards Grid */}
                <div className={`grid ${section.gridCols} gap-3 sm:gap-4`}>
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-amber-500/50 hover:shadow-md hover:shadow-amber-500/5 transition-all duration-200"
                    >
                      {/* Logo Area */}
                      <div className="flex h-14 items-center justify-center transition-transform duration-200 group-hover:scale-105">
                        {item.logo}
                      </div>

                      {/* Description */}
                      <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 text-pretty">
                          {item.tagline}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {visibleSections.length === 0 && (
              <div className="py-16 text-center rounded-3xl bg-white border border-slate-200">
                <p className="text-sm font-bold text-slate-800">
                  Không tìm thấy đối tác nào phù hợp với &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                >
                  Xóa từ khóa tìm kiếm
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Feature Spotlight Banner: Tự động Khai báo lưu trú Công an (KBTT) */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="relative overflow-hidden rounded-3xl lg:rounded-4xl border border-amber-400/30 bg-gradient-to-br from-[#072417] via-[#0d3322] to-[#082216] p-7 sm:p-10 lg:p-12 text-white shadow-2xl">
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
                {/* Left Info Column */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#ba8c2f]/20 border border-[#ba8c2f]/40 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-[#e5c07b] whitespace-nowrap">
                    <svg className="h-3.5 w-3.5 text-[#e5c07b]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                    </svg>
                    TÍNH NĂNG NỔI BẬT
                  </div>

                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight text-balance">
                    Tự động Khai báo lưu trú Công an
                  </h2>

                  <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed text-pretty max-w-xl">
                    Sau mỗi lần check-in, hệ thống tự động gửi thông tin lưu trú đến cơ quan Công an theo quy định, nhanh chóng – chính xác – an toàn – giảm thiểu rủi ro.
                  </p>

                  {/* 3 Value Badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5 backdrop-blur-xs border border-white/10">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-[#a3e635]">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="m22 2-7 20-4-9-9-4Z" />
                          <path d="M22 2 11 13" />
                        </svg>
                      </span>
                      <span className="text-xs font-semibold text-emerald-50 leading-tight">
                        Tự động gửi sau mỗi check-in
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5 backdrop-blur-xs border border-white/10">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-[#a3e635]">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect width="16" height="20" x="4" y="2" rx="2" />
                          <path d="m9 12 2 2 4-4" />
                        </svg>
                      </span>
                      <span className="text-xs font-semibold text-emerald-50 leading-tight">
                        Đúng định dạng theo quy định CA
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5 backdrop-blur-xs border border-white/10">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-[#a3e635]">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <span className="text-xs font-semibold text-emerald-50 leading-tight">
                        An toàn, bảo mật dữ liệu khách hàng
                      </span>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="pt-2">
                    <Link
                      href="/contact?topic=kbtt-compliance"
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ba8c2f] via-[#cda747] to-[#e5c07b] px-6 py-3 text-xs sm:text-sm font-bold text-slate-900 shadow-lg hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Tìm hiểu chi tiết</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>

                {/* Right Flow Illustration */}
                <div className="lg:col-span-5 flex items-center justify-center">
                  <div className="w-full max-w-md rounded-2xl bg-white/5 p-4 sm:p-6 border border-white/15 backdrop-blur-md shadow-2xl">
                    <div className="flex items-center justify-between gap-3 text-center">
                      {/* Step 1: Check-in */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="w-full rounded-xl bg-white p-3 text-slate-900 shadow-md border border-slate-200">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600 mb-1">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-black">
                              ✓
                            </span>
                            Check-in Thành công
                          </div>
                          <div className="text-left text-xs font-medium text-slate-700 space-y-0.5">
                            <p className="font-bold text-slate-900 truncate">Nguyễn Văn An</p>
                            <p className="text-slate-500 font-mono">0791xxxxxxxx</p>
                            <p className="text-amber-800 font-semibold">Phòng 101</p>
                          </div>
                        </div>
                      </div>

                      {/* Arrow / Cloud Sync */}
                      <div className="flex flex-col items-center justify-center px-1">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#123d2a] text-[#a3e635] shadow-inner border border-emerald-500/40 animate-pulse">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                          </svg>
                        </span>
                        <span className="mt-1 text-xs text-emerald-200/80 font-medium whitespace-nowrap text-center">
                          Tự động gửi
                        </span>
                      </div>

                      {/* Step 2: BCA */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="w-full rounded-xl bg-gradient-to-br from-[#1a4a35] to-[#0c2e1f] p-3 text-white border border-[#ba8c2f]/40 shadow-md">
                          <div className="flex justify-center mb-1">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-xs shadow-xs ring-2 ring-red-600">
                              ★
                            </div>
                          </div>
                          <p className="text-xs font-bold text-amber-300">Cơ quan Công an</p>
                          <p className="text-xs text-emerald-100/70 mt-0.5">Hệ thống C06</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call To Action Banner: ĐỒNG HÀNH CÙNG VIETSAGE */}
        <section className="mt-8 border-t border-slate-200/80 bg-[#061910] text-white py-16 sm:py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          <div className="mx-auto max-w-7xl relative z-10">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-8 space-y-4">
                <span className="inline-block text-xs font-extrabold uppercase tracking-widest text-[#ba8c2f] whitespace-nowrap">
                  ĐỒNG HÀNH CÙNG VIETSAGE
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight text-balance">
                  Cùng VietSage mở rộng giá trị cho ngành khách sạn Việt Nam.
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium text-pretty leading-relaxed">
                  Chúng tôi luôn chào đón các đối tác công nghệ cùng nhau xây dựng hệ sinh thái khách sạn hiện đại, hiệu quả và bền vững.
                </p>
                <div className="pt-3">
                  <Link
                    href="/contact?topic=partner-ecosystem"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ba8c2f] to-[#d4af37] px-8 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-xl hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <span>Liên hệ hợp tác</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>

              {/* Graphical Orbit Constellation */}
              <div className="lg:col-span-4 flex items-center justify-center">
                <div className="relative flex h-52 w-52 sm:h-64 sm:w-64 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-spin" style={{ animationDuration: "25s" }} />
                  <div className="absolute inset-6 rounded-full border border-amber-400/25 animate-spin" style={{ animationDuration: "18s", animationDirection: "reverse" }} />
                  
                  {/* Center Resort Icon */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ba8c2f] to-[#825916] text-white shadow-xl shadow-amber-500/20 z-10 border border-amber-300/40">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                      <path d="M10 6h4" />
                      <path d="M10 10h4" />
                      <path d="M10 14h4" />
                    </svg>
                  </div>

                  {/* Satellite Nodes */}
                  <span className="absolute top-2 left-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs shadow-md">
                    OTA
                  </span>
                  <span className="absolute bottom-4 right-8 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white text-xs shadow-md">
                    PMS
                  </span>
                  <span className="absolute top-12 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-slate-900 text-xs font-bold shadow-md">
                    PAY
                  </span>
                  <span className="absolute bottom-6 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white text-xs shadow-md">
                    IoT
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
