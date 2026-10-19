"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

interface MatrixRow {
  bracket: string;
  minRooms: number;
  maxRooms: number;
  basicMonthly: string;
  basicAnnual: string;
  standardMonthly: string;
  standardAnnual: string;
  professionalMonthly: string;
  professionalAnnual: string;
}

const MATRIX_DATA: MatrixRow[] = [
  {
    bracket: "1 – 10 phòng",
    minRooms: 1,
    maxRooms: 10,
    basicMonthly: "600.000đ",
    basicAnnual: "480.000đ",
    standardMonthly: "900.000đ",
    standardAnnual: "720.000đ",
    professionalMonthly: "1.200.000đ",
    professionalAnnual: "960.000đ",
  },
  {
    bracket: "11 – 30 phòng",
    minRooms: 11,
    maxRooms: 30,
    basicMonthly: "550.000đ",
    basicAnnual: "440.000đ",
    standardMonthly: "850.000đ",
    standardAnnual: "680.000đ",
    professionalMonthly: "1.100.000đ",
    professionalAnnual: "880.000đ",
  },
  {
    bracket: "31 – 50 phòng",
    minRooms: 31,
    maxRooms: 50,
    basicMonthly: "500.000đ",
    basicAnnual: "400.000đ",
    standardMonthly: "750.000đ",
    standardAnnual: "600.000đ",
    professionalMonthly: "1.000.000đ",
    professionalAnnual: "800.000đ",
  },
  {
    bracket: "51 – 100 phòng",
    minRooms: 51,
    maxRooms: 100,
    basicMonthly: "–",
    basicAnnual: "–",
    standardMonthly: "700.000đ",
    standardAnnual: "560.000đ",
    professionalMonthly: "950.000đ",
    professionalAnnual: "760.000đ",
  },
  {
    bracket: "101 – 200 phòng",
    minRooms: 101,
    maxRooms: 200,
    basicMonthly: "–",
    basicAnnual: "–",
    standardMonthly: "650.000đ",
    standardAnnual: "520.000đ",
    professionalMonthly: "900.000đ",
    professionalAnnual: "720.000đ",
  },
  {
    bracket: "Trên 200 phòng",
    minRooms: 201,
    maxRooms: 9999,
    basicMonthly: "Liên hệ",
    basicAnnual: "Liên hệ",
    standardMonthly: "Liên hệ",
    standardAnnual: "Liên hệ",
    professionalMonthly: "Liên hệ",
    professionalAnnual: "Liên hệ",
  },
];

const TIERS = [
  {
    id: "basic",
    name: "Basic",
    target: "Phù hợp khách sạn nhỏ, homestay (1 – 10 phòng)",
    monthlyPrice: "600.000đ",
    annualPrice: "480.000đ",
    unit: "/phòng/tháng",
    popular: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    features: [
      "Quản lý đặt phòng & lễ tân",
      "Quản lý phòng & giá",
      "Báo cáo cơ bản",
      "Hỗ trợ qua chat",
    ],
    buttonText: "Chọn gói Basic",
    href: "/contact?plan=basic",
  },
  {
    id: "standard",
    name: "Standard",
    target: "Phù hợp khách sạn vừa (11 – 50 phòng)",
    monthlyPrice: "900.000đ",
    annualPrice: "720.000đ",
    unit: "/phòng/tháng",
    popular: true,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    features: [
      "Tất cả tính năng của Basic",
      "Channel Manager (OTA)",
      "E-Concierge (trải nghiệm khách)",
      "Báo cáo nâng cao",
      "Hỗ trợ ưu tiên",
    ],
    buttonText: "Chọn gói Standard",
    href: "/contact?plan=standard",
  },
  {
    id: "professional",
    name: "Professional",
    target: "Phù hợp khách sạn lớn (51 – 200 phòng)",
    monthlyPrice: "1.200.000đ",
    annualPrice: "960.000đ",
    unit: "/phòng/tháng",
    popular: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    features: [
      "Tất cả tính năng của Standard",
      "Quản lý chuỗi khách sạn",
      "Phân quyền nâng cao",
      "Tích hợp hệ thống bên thứ 3",
      "Hỗ trợ 24/7",
    ],
    buttonText: "Chọn gói Professional",
    href: "/contact?plan=professional",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    target: "Giải pháp tùy chỉnh cho chuỗi & tập đoàn",
    monthlyPrice: "Liên hệ",
    annualPrice: "Liên hệ",
    unit: "Nhận báo giá theo nhu cầu",
    popular: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    features: [
      "Tùy chỉnh theo yêu cầu",
      "Tích hợp sâu hệ thống nội bộ",
      "Tư vấn triển khai riêng",
      "Bảo mật & vận hành cao cấp",
      "Hỗ trợ chuyên biệt 24/7",
    ],
    buttonText: "Liên hệ tư vấn",
    href: "/contact?plan=enterprise",
  },
];

const ADDONS = [
  {
    id: "channel-manager",
    name: "Channel Manager",
    desc: "Kết nối Booking, Agoda, Airbnb, Traveloka...",
    price: "Từ 100.000đ",
    unit: "/phòng/tháng",
    iconBg: "bg-emerald-50 text-emerald-700",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    id: "e-concierge",
    name: "E-Concierge",
    desc: "Tăng trải nghiệm khách với dịch vụ trực tuyến",
    price: "Từ 100.000đ",
    unit: "/phòng/tháng",
    iconBg: "bg-teal-50 text-teal-700",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    id: "kbtt-police",
    name: "Khai báo lưu trú Công an",
    desc: "Tự động gửi thông tin sau mỗi lần check-in",
    price: "Từ 50.000đ",
    unit: "/phòng/tháng",
    iconBg: "bg-blue-50 text-blue-700",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    id: "iot-integration",
    name: "Tích hợp thiết bị IoT",
    desc: "Khóa, thẻ, điện, minibar...",
    price: "Từ 80.000đ",
    unit: "/phòng/tháng",
    iconBg: "bg-purple-50 text-purple-700",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
  },
];

const COMPARISON_FEATURES = [
  {
    title: "Quản lý đặt phòng, phòng, giá",
    basic: "✓",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "Lễ tân & check-in/out",
    basic: "✓",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "Channel Manager (OTA)",
    basic: "–",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "E-Concierge (trải nghiệm khách)",
    basic: "–",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "Báo cáo & phân tích nâng cao",
    basic: "–",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "Quản lý chuỗi khách sạn",
    basic: "–",
    standard: "–",
    professional: "✓",
  },
  {
    title: "Khai báo lưu trú Công an tự động",
    basic: "✓",
    standard: "✓",
    professional: "✓",
  },
  {
    title: "Tích hợp thiết bị IoT (khoá, thẻ,...)",
    basic: "–",
    standard: "Tùy chọn",
    professional: "✓",
  },
  {
    title: "Hỗ trợ kỹ thuật",
    basic: "Giờ hành chính",
    standard: "Ưu tiên",
    professional: "24/7",
  },
];

const FAQS = [
  {
    q: "Giá đã bao gồm những gì?",
    a: "Đơn giá đã bao gồm toàn bộ quyền sử dụng phần mềm, sao lưu dữ liệu điện toán đám mây hàng ngày, bảo mật SSL, cập nhật tính năng định kỳ và đội ngũ hỗ trợ kỹ thuật tận tâm. Khách sạn không cần đầu tư máy chủ vật lý hay chi trả thêm phí bản quyền phát sinh.",
  },
  {
    q: "Có phát sinh chi phí nào khác không?",
    a: "VietSage cam kết 100% minh bạch, không chi phí ẩn. Bạn chỉ chi trả đúng gói đã chọn và các dịch vụ mở rộng (Add-ons) nếu chủ động kích hoạt thêm. Chi phí thiết lập và đào tạo ban đầu được miễn phí hoàn toàn.",
  },
  {
    q: "Tôi có thể thay đổi gói dịch vụ khi đang sử dụng không?",
    a: "Hoàn toàn được. Bạn có thể nâng cấp gói dịch vụ hoặc mở rộng thêm số lượng phòng bất kỳ lúc nào ngay trên trang quản trị. Chi phí sẽ được tính toán bù trừ tự động theo số ngày sử dụng thực tế.",
  },
  {
    q: "Chính sách ưu đãi cho chuỗi khách sạn như thế nào?",
    a: "Đối với các chuỗi khách sạn, tập đoàn lưu trú từ 3 cơ sở hoặc trên 200 phòng, VietSage cung cấp chính sách chiết khấu lũy tiến đặc biệt, tùy biến báo cáo phân tích tổng hợp và cử kỹ sư hỗ trợ riêng theo hợp đồng cam kết chất lượng dịch vụ SLA.",
  },
  {
    q: "Thời gian triển khai và hướng dẫn nhân viên mất bao lâu?",
    a: "Hệ thống hoạt động hoàn toàn trên nền tảng đám mây. Bạn có thể thiết lập buồng phòng, in mã QR và kích hoạt đồng bộ OTA chỉ trong 1 đến 7 ngày. VietSage đào tạo nhân viên lễ tân, buồng phòng trực tiếp qua video call hoặc tận nơi trong 30–60 phút.",
  },
  {
    q: "VietSage có hỗ trợ tích hợp hệ thống hiện tại của tôi không?",
    a: "Có. VietSage cung cấp bộ Open API và webhook tiêu chuẩn giúp kết nối linh hoạt với khóa từ thông minh (Orbita, Adel, Yale), hệ thống hóa đơn điện tử (Viettel, VNPT), cổng thanh toán (VietQR, MoMo) và các phần mềm kế toán phổ biến.",
  },
];

export default function GiaPage() {
  const roomSliderId = useId();
  const roomInputId = useId();

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [roomCount, setRoomCount] = useState<number>(50);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Determine active row in matrix table
  const activeRowIndex = MATRIX_DATA.findIndex(
    (row) => roomCount >= row.minRooms && roomCount <= row.maxRooms
  );

  // Dynamic hotel scale label
  let scaleCategory = "Khách sạn vừa";
  let scaleBracket = "31 – 50 phòng";
  if (roomCount <= 10) {
    scaleCategory = "Khách sạn nhỏ / Homestay";
    scaleBracket = "1 – 10 phòng";
  } else if (roomCount <= 30) {
    scaleCategory = "Khách sạn vừa";
    scaleBracket = "11 – 30 phòng";
  } else if (roomCount <= 50) {
    scaleCategory = "Khách sạn vừa";
    scaleBracket = "31 – 50 phòng";
  } else if (roomCount <= 100) {
    scaleCategory = "Khách sạn lớn";
    scaleBracket = "51 – 100 phòng";
  } else if (roomCount <= 200) {
    scaleCategory = "Khách sạn lớn";
    scaleBracket = "101 – 200 phòng";
  } else {
    scaleCategory = "Doanh nghiệp & Chuỗi";
    scaleBracket = "Trên 200 phòng";
  }

  // Calculate thumb badge offset percentage (5 to 250)
  const sliderPercentage = Math.min(100, Math.max(0, ((roomCount - 5) / (250 - 5)) * 100));

  const handleRoomChange = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(500, Math.max(1, value));
    setRoomCount(clamped);
  };

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <MarketingShell locale="vi" showSceneRail={false} showSceneBackdrop={false}>
      <style>{`
        .vs-room-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #064e3b;
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
          margin-top: -6px;
        }
        .vs-room-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 8px;
          cursor: pointer;
          background: #e2e8f0;
          border-radius: 4px;
        }
        .vs-room-slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #064e3b;
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        .vs-room-slider::-moz-range-track {
          width: 100%;
          height: 8px;
          cursor: pointer;
          background: #e2e8f0;
          border-radius: 4px;
        }
      `}</style>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20 space-y-16 text-slate-800">
        {/* SECTION 1: HERO HEADER */}
        <section className="text-center max-w-3xl mx-auto space-y-4" data-purpose="hero-section">
          <div className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold tracking-wide uppercase whitespace-nowrap">
            BẢNG GIÁ VIETSAGE
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-slate-900 tracking-tight leading-tight text-balance">
            Chi phí minh bạch.{" "}
            <span className="bg-gradient-to-r from-amber-600 to-amber-700 bg-clip-text text-transparent">
              Linh hoạt theo quy mô.
            </span>
          </h1>
          <p className="text-slate-600 text-base sm:text-lg text-pretty">
            Lựa chọn giải pháp phù hợp với số lượng phòng và nhu cầu vận hành thực tế của khách sạn của bạn.
          </p>

          {/* Quick Trust Indicators */}
          <div className="pt-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 whitespace-nowrap">Triển khai nhanh</div>
                <div className="text-xs text-slate-500 whitespace-nowrap">1 – 7 ngày</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 whitespace-nowrap">Không chi phí ẩn</div>
                <div className="text-xs text-slate-500 whitespace-nowrap">Minh bạch, rõ ràng</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 whitespace-nowrap">Linh hoạt nâng cấp</div>
                <div className="text-xs text-slate-500 whitespace-nowrap">Dễ dàng mở rộng</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 whitespace-nowrap">Hỗ trợ 24/7</div>
                <div className="text-xs text-slate-500 whitespace-nowrap">Đồng hành lâu dài</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: CALCULATOR & BILLING CYCLE */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-slate-50/70 p-6 sm:p-8 rounded-2xl border border-slate-200/80" data-purpose="calculator-panel">
          {/* Room Count Slider */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 text-balance">
                  1. Khách sạn của bạn có bao nhiêu phòng?
                </h2>
                <p className="text-xs text-slate-500 text-pretty">
                  Kéo thanh trượt hoặc nhập số để xem mức giá phù hợp.
                </p>
              </div>
              <div className="flex items-center border border-slate-200 bg-white rounded-lg px-2.5 py-1 shadow-sm">
                <input
                  id={roomInputId}
                  aria-label="Số phòng nhập trực tiếp"
                  className="w-14 text-right font-bold text-emerald-900 border-none p-0 focus:ring-0 text-sm bg-transparent"
                  max="500"
                  min="1"
                  type="number"
                  value={roomCount}
                  onChange={(e) => handleRoomChange(parseInt(e.target.value, 10))}
                />
                <span className="text-xs text-slate-500 pl-1 font-medium whitespace-nowrap">phòng</span>
              </div>
            </div>

            {/* Slider Bar */}
            <div className="pt-6 pb-2 relative">
              {/* Dynamic floating badge above thumb */}
              <div
                className="absolute -top-3 -translate-x-1/2 bg-emerald-950 text-white text-xs font-semibold px-2.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap transition-[left] duration-75"
                style={{ left: `${sliderPercentage}%` }}
              >
                {roomCount} phòng
              </div>
              <input
                id={roomSliderId}
                aria-label="Thanh trượt chọn số lượng phòng"
                className="vs-room-slider w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-900"
                max="250"
                min="5"
                step="5"
                type="range"
                value={Math.min(250, Math.max(5, roomCount))}
                onChange={(e) => handleRoomChange(parseInt(e.target.value, 10))}
              />
              {/* Slider Markers */}
              <div className="flex justify-between text-xs font-medium text-slate-400 mt-2">
                <span>5</span>
                <span>10</span>
                <span>20</span>
                <span className={roomCount >= 31 && roomCount <= 50 ? "font-bold text-emerald-900" : ""}>50</span>
                <span>100</span>
                <span>200+</span>
              </div>
            </div>
          </div>

          {/* Billing Cycle Toggle & Scope Box */}
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 text-balance">
              2. Chu kỳ thanh toán
            </h2>
            <div className="grid grid-cols-2 p-1 bg-slate-200/60 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`py-2 px-3 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                  billingCycle === "monthly"
                    ? "bg-emerald-900 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <span className="whitespace-nowrap">Hàng tháng</span>
                <span className={`text-xs font-normal whitespace-nowrap ${billingCycle === "monthly" ? "text-emerald-200" : "text-slate-500"}`}>
                  Linh hoạt, dễ triển khai
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={`py-2 px-3 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                  billingCycle === "annual"
                    ? "bg-emerald-900 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <span className="whitespace-nowrap">Hàng năm</span>
                <span className={`text-xs font-normal whitespace-nowrap ${billingCycle === "annual" ? "text-amber-300" : "text-amber-600"}`}>
                  Tiết kiệm đến 20%
                </span>
              </button>
            </div>

            {/* Hotel Size Recommendation Alert */}
            <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-emerald-100 shadow-sm">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900 mt-0.5 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold whitespace-nowrap">
                  Quy mô khách sạn của bạn
                </div>
                <div className="text-xs font-bold text-slate-800 text-balance">
                  {scaleCategory} ({scaleBracket})
                </div>
                <div className="text-xs text-slate-500 text-pretty mt-0.5">
                  Hiển thị giá phù hợp với {roomCount} phòng, thanh toán {billingCycle === "annual" ? "hàng năm (tiết kiệm 20%)" : "hàng tháng"}.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: PRICING TIER CARDS */}
        <section className="space-y-6" data-purpose="pricing-cards">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 text-balance">
              3. Chọn gói dịch vụ phù hợp
            </h2>
            <p className="text-xs text-slate-500 text-pretty">
              Tất cả các gói đều bao gồm các tính năng cốt lõi. Nâng cấp linh hoạt bất cứ lúc nào.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {TIERS.map((tier) => {
              const displayPrice = billingCycle === "annual" ? tier.annualPrice : tier.monthlyPrice;

              if (tier.popular) {
                return (
                  <div
                    key={tier.id}
                    className="relative bg-emerald-50/40 rounded-2xl border-2 border-emerald-900 p-6 flex flex-col justify-between shadow-xl shadow-emerald-900/5"
                  >
                    {/* Ribbon badge */}
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-500 text-emerald-950 font-bold text-xs px-3 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm whitespace-nowrap">
                      <span>👑 Phổ biến nhất</span>
                    </div>

                    <div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center mb-4 shadow-sm">
                        {tier.icon}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 text-balance">{tier.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 min-h-[32px] text-pretty">{tier.target}</p>

                      <div className="my-6">
                        <div className="text-2xl font-extrabold text-emerald-900">{displayPrice}</div>
                        <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
                          {tier.unit}
                          {billingCycle === "annual" && (
                            <span className="ml-1.5 text-amber-600 font-semibold">(Tiết kiệm 20%)</span>
                          )}
                        </div>
                      </div>

                      {/* Features */}
                      <ul className="space-y-2.5 text-xs text-slate-700 border-t border-emerald-200/60 pt-5">
                        {tier.features.map((feat, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                            </svg>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-8">
                      <Link
                        href={tier.href}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <span>{tier.buttonText}</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                );
              }

              const isEnterprise = tier.id === "enterprise";

              return (
                <div
                  key={tier.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-slate-300 hover:shadow-lg transition-all duration-200"
                >
                  <div>
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                        tier.id === "basic"
                          ? "bg-emerald-50 text-emerald-700"
                          : tier.id === "professional"
                          ? "bg-teal-50 text-teal-700"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {tier.icon}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 text-balance">{tier.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[32px] text-pretty">{tier.target}</p>

                    <div className="my-6">
                      <div className="text-2xl font-extrabold text-slate-900">{displayPrice}</div>
                      <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
                        {tier.unit}
                        {!isEnterprise && billingCycle === "annual" && (
                          <span className="ml-1.5 text-amber-600 font-semibold">(Tiết kiệm 20%)</span>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-5">
                      {tier.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 shrink-0 ${isEnterprise ? "text-amber-600" : "text-emerald-600"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                          </svg>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-8">
                    <Link
                      href={tier.href}
                      className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        isEnterprise
                          ? "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                          : "border border-slate-300 text-slate-700 hover:border-emerald-900 hover:text-emerald-900"
                      }`}
                    >
                      <span>{tier.buttonText}</span>
                      {isEnterprise && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      )}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: DETAILED MATRIX TABLE */}
        <section className="space-y-6" data-purpose="matrix-table-section">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 text-balance">
                Bảng giá chi tiết theo số lượng phòng
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 text-pretty">
                Đơn giá hiển thị theo đ/phòng/tháng. Hàng nổi bật tự động tương ứng theo số phòng của thanh trượt.
              </p>
            </div>

            {/* Yearly Discount Switch */}
            <div className="flex items-center gap-3 self-start md:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Thanh toán hàng năm <span className="text-amber-600 font-semibold">(Tiết kiệm đến 20%)</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={billingCycle === "annual"}
                aria-label="Chuyển đổi chu kỳ thanh toán hàng năm"
                onClick={() => setBillingCycle(billingCycle === "annual" ? "monthly" : "annual")}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  billingCycle === "annual" ? "bg-emerald-900" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    billingCycle === "annual" ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Matrix Table Card */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
                  <th className="py-4 px-6 font-bold" scope="col">
                    Số lượng phòng
                  </th>
                  <th className="py-4 px-6 font-bold text-center" scope="col">
                    Basic
                  </th>
                  <th className="py-4 px-6 font-bold text-center bg-emerald-50/60 text-emerald-950 relative" scope="col">
                    Standard
                    <span className="ml-1.5 px-1.5 py-0.5 bg-amber-400 text-emerald-950 rounded text-xs font-bold whitespace-nowrap">
                      Phổ biến nhất
                    </span>
                  </th>
                  <th className="py-4 px-6 font-bold text-center" scope="col">
                    Professional
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {MATRIX_DATA.map((row, index) => {
                  const isActive = index === activeRowIndex;
                  const basicPrice = billingCycle === "annual" ? row.basicAnnual : row.basicMonthly;
                  const standardPrice = billingCycle === "annual" ? row.standardAnnual : row.standardMonthly;
                  const profPrice = billingCycle === "annual" ? row.professionalAnnual : row.professionalMonthly;

                  if (isActive) {
                    return (
                      <tr
                        key={row.bracket}
                        className="bg-emerald-50/70 font-bold border-y-2 border-emerald-900/30 transition-colors"
                      >
                        <td className="py-3.5 px-6 text-emerald-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-900 shrink-0" />
                          <span>{row.bracket}</span>
                          <span className="ml-1 text-xs text-emerald-700 font-semibold">(Đang chọn)</span>
                        </td>
                        <td className="py-3.5 px-6 text-center text-emerald-900">{basicPrice}</td>
                        <td className="py-3.5 px-6 text-center text-emerald-950 font-extrabold bg-emerald-100/70">
                          {standardPrice}
                        </td>
                        <td className="py-3.5 px-6 text-center text-emerald-900">{profPrice}</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.bracket} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6 text-slate-700">{row.bracket}</td>
                      <td className={`py-3.5 px-6 text-center ${basicPrice === "–" ? "text-slate-400" : "text-slate-800"}`}>
                        {basicPrice}
                      </td>
                      <td className="py-3.5 px-6 text-center text-slate-900 font-semibold bg-emerald-50/30">
                        {standardPrice}
                      </td>
                      <td className={`py-3.5 px-6 text-center ${profPrice === "Liên hệ" ? "text-emerald-900 font-semibold" : "text-slate-800"}`}>
                        {profPrice}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 5: ADD-ON FEATURES */}
        <section className="space-y-6" data-purpose="addons-section">
          <div>
            <h2 className="text-xl font-bold text-slate-900 text-balance">
              Dịch vụ &amp; tính năng mở rộng
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 text-pretty">
              Linh hoạt bổ sung theo nhu cầu vận hành thực tế của khách sạn.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ADDONS.map((addon) => {
              const isSelected = selectedAddons.includes(addon.id);

              return (
                <div
                  key={addon.id}
                  className={`bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-emerald-600 shadow-md ring-2 ring-emerald-500/20"
                      : "border-slate-200/90 hover:shadow-md"
                  }`}
                >
                  <div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${addon.iconBg}`}>
                      {addon.icon}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 text-balance">{addon.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[36px] text-pretty">{addon.desc}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400 leading-none">
                        Từ <span className="text-xs font-bold text-slate-900">{addon.price}</span>
                      </div>
                      <div className="text-xs text-slate-400">{addon.unit}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAddon(addon.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? "bg-emerald-900 text-white"
                          : "bg-slate-100 hover:bg-emerald-900 hover:text-white text-slate-700"
                      }`}
                    >
                      {isSelected ? "✓ Đã chọn" : "Thêm"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 6: QUICK FEATURE COMPARISON */}
        <section className="space-y-6" data-purpose="features-comparison">
          <div>
            <h2 className="text-xl font-bold text-slate-900 text-balance">
              So sánh nhanh tính năng giữa các gói
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 text-pretty">
              Các tính năng quan trọng nhất để bạn dễ dàng lựa chọn.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
                  <th className="py-3.5 px-6 font-bold w-2/5" scope="col">
                    Tính năng
                  </th>
                  <th className="py-3.5 px-6 font-bold text-center" scope="col">
                    Basic
                  </th>
                  <th className="py-3.5 px-6 font-bold text-center bg-emerald-50/60 text-emerald-950" scope="col">
                    Standard
                  </th>
                  <th className="py-3.5 px-6 font-bold text-center" scope="col">
                    Professional
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON_FEATURES.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-6 text-slate-700 font-medium text-balance">{row.title}</td>
                    <td className={`py-3 px-6 text-center ${row.basic === "✓" ? "text-emerald-600 font-bold" : "text-slate-300"}`}>
                      {row.basic}
                    </td>
                    <td className={`py-3 px-6 text-center bg-emerald-50/20 ${row.standard === "✓" ? "text-emerald-600 font-bold" : row.standard === "Tùy chọn" ? "text-slate-700 font-medium" : "text-slate-300"}`}>
                      {row.standard}
                    </td>
                    <td className={`py-3 px-6 text-center ${row.professional === "✓" ? "text-emerald-600 font-bold" : row.professional === "24/7" ? "text-slate-900 font-bold" : "text-slate-800"}`}>
                      {row.professional}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 7: FAQ SECTION */}
        <section className="space-y-6" data-purpose="faq-section">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 text-balance">
                Câu hỏi thường gặp
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 text-pretty">
                Những thông tin quan trọng giúp bạn dễ dàng quyết định.
              </p>
            </div>
            <Link
              href="/contact"
              className="text-xs font-semibold text-emerald-900 hover:text-emerald-700 flex items-center gap-1 whitespace-nowrap"
            >
              <span>Xem tất cả</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Col 1 */}
            <div className="space-y-3">
              {FAQS.slice(0, 3).map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border transition-all ${
                      isOpen ? "border-emerald-700/40 shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full text-left flex items-center justify-between gap-2 p-4 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-balance">
                        <span className="text-emerald-900 text-sm font-extrabold shrink-0">
                          {isOpen ? "−" : "+"}
                        </span>
                        <span>{item.q}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 text-xs text-slate-600 border-t border-slate-100 text-pretty leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Col 2 */}
            <div className="space-y-3">
              {FAQS.slice(3, 6).map((item, idx) => {
                const globalIdx = idx + 3;
                const isOpen = openFaq === globalIdx;
                return (
                  <div
                    key={globalIdx}
                    className={`bg-white rounded-xl border transition-all ${
                      isOpen ? "border-emerald-700/40 shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : globalIdx)}
                      className="w-full text-left flex items-center justify-between gap-2 p-4 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-balance">
                        <span className="text-emerald-900 text-sm font-extrabold shrink-0">
                          {isOpen ? "−" : "+"}
                        </span>
                        <span>{item.q}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 text-xs text-slate-600 border-t border-slate-100 text-pretty leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 8: BOTTOM CONVERSION BANNER */}
        <section
          id="contact"
          data-purpose="cta-banner"
          className="rounded-3xl bg-gradient-to-r from-emerald-50/80 via-emerald-100/50 to-teal-50 border border-emerald-200/80 p-8 sm:p-10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white text-emerald-900 shadow-sm border border-emerald-100 flex items-center justify-center shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 text-balance">
                  Cần tư vấn gói phù hợp?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 text-pretty">
                  Đội ngũ chuyên gia của VietSage sẵn sàng tư vấn và đề xuất giải pháp tối ưu nhất cho khách sạn của bạn.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
              <Link
                href="/contact"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white font-semibold text-xs tracking-wide shadow-md transition-all whitespace-nowrap cursor-pointer"
              >
                <span>Liên hệ tư vấn</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </Link>
              <Link
                href="/contact?action=demo"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs tracking-wide border border-slate-300 shadow-sm transition-all whitespace-nowrap cursor-pointer"
              >
                Đặt lịch demo
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
