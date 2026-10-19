"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";

export default function GiaPage() {
  const roomSliderId = useId();
  const [billingCycle, setBillingCycle] = useState<"annual" | "monthly">("annual");
  const [roomCount, setRoomCount] = useState<number>(25);

  // Dynamic calculations based on room count
  const isStarter = roomCount <= 10;
  const isStandard = roomCount > 10 && roomCount <= 50;
  const isAdvanced = roomCount > 50 && roomCount <= 120;
  const isEnterprise = roomCount > 120;

  // Monthly investment calculation
  const monthlyCost = isStarter
    ? billingCycle === "annual" ? 375000 : 500000
    : isStandard
    ? billingCycle === "annual" ? 600000 : 800000
    : isAdvanced
    ? billingCycle === "annual" ? 900000 : 1200000
    : 0; // Enterprise

  const dailyCost = monthlyCost > 0 ? Math.round(monthlyCost / 30) : 0;

  // Estimated OTA commission saved if direct booking engine is used for 15% of bookings
  // (Assuming avg price 600k/night, 60% occupancy, 18% OTA commission)
  const monthlyRoomNights = roomCount * 30 * 0.6;
  const directBookings = Math.round(monthlyRoomNights * 0.2); // 20% direct
  const estimatedOtaCommissionSaved = Math.round(directBookings * 600000 * 0.18);

  const PRICING_TIERS = [
    {
      id: "starter",
      name: "Gói Khởi Đầu",
      badge: "Homestay & Căn hộ",
      target: "1 – 10 phòng",
      price: billingCycle === "annual" ? "375.000 ₫" : "500.000 ₫",
      billedNote: billingCycle === "annual" ? "Thanh toán 4.500.000 ₫/năm" : "Linh hoạt từng tháng",
      savings: billingCycle === "annual" ? "Tiết kiệm 1.500.000 ₫" : null,
      popular: false,
      recommended: isStarter,
      features: [
        "Sơ đồ buồng phòng trực quan realtime",
        "Khai báo lưu trú NA17 / Cổng C06 Bộ Công An",
        "Mã QR phòng hiển thị nội quy & cẩm nang",
        "Đồng bộ lịch đặt phòng iCal cơ bản",
        "Hỗ trợ kỹ thuật qua Zalo ca trực",
      ],
    },
    {
      id: "standard",
      name: "Vận Hành Tiêu Chuẩn",
      badge: "Boutique & Khách sạn Mini",
      target: "10 – 50 phòng",
      price: billingCycle === "annual" ? "600.000 ₫" : "800.000 ₫",
      billedNote: billingCycle === "annual" ? "Thanh toán 7.200.000 ₫/năm" : "Linh hoạt từng tháng",
      savings: billingCycle === "annual" ? "Tiết kiệm 2.400.000 ₫" : null,
      popular: true,
      recommended: isStandard,
      features: [
        "Toàn bộ tính năng của Gói Khởi Đầu",
        "Trợ lý E-Concierge số tại phòng 6 ngôn ngữ",
        "Web App buồng phòng cho nhân viên qua SĐT",
        "Quản lý Folio hợp nhất & đối trừ cọc tự động",
        "Tích hợp xuất Hóa đơn điện tử Viettel NĐ 119",
        "Phản hồi kỹ thuật ưu tiên trong 15 phút",
      ],
    },
    {
      id: "advanced",
      name: "Toàn Diện (Có OTA)",
      badge: "Đồng bộ 2 chiều trực tiếp",
      target: "20 – 120 phòng",
      price: billingCycle === "annual" ? "900.000 ₫" : "1.200.000 ₫",
      billedNote: billingCycle === "annual" ? "Thanh toán 10.800.000 ₫/năm" : "Linh hoạt từng tháng",
      savings: billingCycle === "annual" ? "Tiết kiệm 3.600.000 ₫" : null,
      popular: false,
      recommended: isAdvanced,
      features: [
        "Toàn bộ tính năng Gói Tiêu Chuẩn",
        "Channel Manager đồng bộ 2 chiều Booking, Agoda, Airbnb",
        "Website Booking Engine nhận đặt phòng 0% hoa hồng",
        "Tự động thanh toán cọc VietQR, MoMo và thẻ tín dụng",
        "Báo cáo phân tích doanh thu & RevPAR buồng phòng",
        "Chuyên viên hỗ trợ thiết lập & đào tạo tận nơi",
      ],
    },
    {
      id: "enterprise",
      name: "Resort & Chuỗi Khách Sạn",
      badge: "Quy mô lớn & Tùy biến",
      target: "120+ phòng / Chuỗi cơ sở",
      price: "Liên hệ tư vấn",
      billedNote: "Gói giải pháp tùy biến chuyên biệt",
      savings: null,
      popular: false,
      recommended: isEnterprise,
      features: [
        "Hợp nhất PMS khách sạn + POS nhà hàng + KDS quầy bếp",
        "Trợ lý du lịch số LocalMate AI toàn khu nghỉ dưỡng",
        "Tích hợp máy quét chip CCCD NFC và Khóa thẻ từ sảnh",
        "Cam kết chất lượng vận hành SLA 99.9% bằng hợp đồng",
        "Quản trị tập trung đa chi nhánh, phân quyền chuyên sâu",
        "Kỹ sư hỗ trợ Dedicated 24/7",
      ],
    },
  ];

  const COMPARISON_ROWS = [
    {
      feature: "Đồng bộ 2 chiều Booking.com, Agoda, Airbnb",
      legacy: "Phải mua Channel Manager riêng (1tr – 2tr/tháng)",
      vietsage: "Tích hợp sẵn, cập nhật giá & phòng trong 0.8s",
    },
    {
      feature: "Trợ lý E-Concierge số tại phòng qua QR",
      legacy: "Không có, phụ thuộc 100% cuộc gọi lễ tân",
      vietsage: "QR riêng từng phòng, menu 6 ngôn ngữ tự động",
    },
    {
      feature: "Check-in CCCD & Cổng KBTT C06",
      legacy: "Chép tay sổ sách, nhập liệu thủ công chậm trễ",
      vietsage: "Quét chip NFC, xuất XML chuẩn C06 đúng hạn 12h",
    },
    {
      feature: "Ứng dụng buồng phòng cho nhân viên",
      legacy: "Nhắn tin qua nhóm Zalo, bộ đàm ồn ào dễ sót",
      vietsage: "Web App di động đăng nhập SĐT, cập nhật realtime",
    },
    {
      feature: "Hóa đơn Folio & E-Invoice NĐ 119",
      legacy: "Tính tay rời rạc, thất thoát minibar & đồ uống",
      vietsage: "Một hóa đơn gộp, xuất hóa đơn điện tử Viettel 1 chạm",
    },
    {
      feature: "Tổng chi phí vận hành ước tính",
      legacy: "2.500.000 ₫ – 4.000.000 ₫ / tháng",
      vietsage: "Chỉ từ 375.000 ₫ – 900.000 ₫ / tháng (Tiết kiệm ~65%)",
    },
  ];

  const FAQS = [
    {
      q: "Thời gian triển khai và hướng dẫn nhân viên mất bao lâu?",
      a: "Hệ thống VietSage hoạt động hoàn toàn trên nền tảng đám mây, không cần cài đặt máy chủ. Bạn có thể tự thêm thông tin phòng, in mã QR và kích hoạt đồng bộ OTA ngay trong ngày. Đội ngũ chuyên gia VietSage hỗ trợ đào tạo trực tiếp qua Zalo / Video Call trong vòng 30 phút.",
    },
    {
      q: "Khách sạn đang dùng phần mềm PMS khác có dùng thêm VietSage được không?",
      a: "Hoàn toàn được. VietSage đóng vai trò là Lớp trải nghiệm số (Guest Experience & E-Concierge Layer) song hành cùng PMS sẵn có của bạn. Khách quét QR gọi dịch vụ, nhân viên nhận phiếu công việc mà không làm gián đoạn sổ sách cốt lõi của khách sạn.",
    },
    {
      q: "Khách sạn có nhà hàng hoặc bếp riêng thì quản lý thế nào?",
      a: "VietSage tích hợp sẵn phân hệ VietSage Commerce (POS nhà hàng + KDS nhà bếp). Khi khách phòng quét QR gọi món, đơn được in trực tiếp tại quầy bếp và chi phí tự động ghi nợ vào Folio phòng lúc check-out.",
    },
    {
      q: "Chính sách dùng thử miễn phí như thế nào?",
      a: "VietSage cung cấp chương trình trải nghiệm miễn phí 7 ngày đầy đủ tính năng. Bạn không cần nhập thẻ tín dụng hay cam kết dài hạn.",
    },
  ];

  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Chi phí minh bạch - Đầu tư hiệu quả"
        title="Bảng giá phần mềm quản trị khách sạn và trợ lý số"
        text="Không chi phí ẩn, không phí duy trì máy chủ cồng kềnh. Chọn gói phù hợp với quy mô cơ sở lưu trú của bạn và nâng cấp linh hoạt bất cứ lúc nào."
        image="/brand/register-hero.png"
      />

      {/* Interactive Room Size & ROI Calculator Station */}
      <section className="bg-gradient-to-b from-[#123d2a] to-[#1a4a35] text-white py-16 px-4 sm:px-6 lg:px-8 border-y border-[#ba8c2f]/40">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <span className="rounded-full bg-[#e5c07b]/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[#e5c07b] border border-[#e5c07b]/30">
              Công cụ tính toán chi phí & ROI thông minh
            </span>
            <h2 className="mt-4 text-2xl sm:text-4xl font-extrabold text-balance text-white">
              Quy mô khách sạn của bạn có bao nhiêu phòng?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-white/80 max-w-xl mx-auto text-pretty">
              Kéo thanh trượt để hệ thống tự động xác định gói tối ưu và ước tính dòng tiền tiết kiệm được mỗi tháng.
            </p>
          </div>

          <div className="mt-10 rounded-3xl bg-white/95 p-6 sm:p-10 text-[#123d2a] shadow-2xl backdrop-blur-xl border border-white/20">
            {/* Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={roomSliderId}
                  className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#627064]"
                >
                  Số lượng phòng vận hành:
                </label>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-extrabold text-[#123d2a] font-mono">
                    {roomCount}
                  </span>
                  <span className="text-sm font-bold text-[#825916]">phòng</span>
                </div>
              </div>

              <input
                id={roomSliderId}
                type="range"
                min={5}
                max={150}
                step={1}
                value={roomCount}
                aria-label="Số lượng phòng vận hành"
                onChange={(e) => setRoomCount(Number(e.target.value))}
                className="w-full h-3 bg-[#123d2a]/15 rounded-lg appearance-none cursor-pointer accent-[#ba8c2f]"
              />

              <div className="flex justify-between text-xs font-semibold text-[#627064]">
                <span>5 phòng (Homestay)</span>
                <span>50 phòng (Boutique)</span>
                <span>100 phòng (Khách sạn)</span>
                <span>150+ phòng (Resort)</span>
              </div>
            </div>

            {/* Real-time Dynamic ROI Grid */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-[#123d2a]/10 pt-6">
              <div className="rounded-2xl bg-[#faf8f3] p-4 border border-[#123d2a]/8 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-[#627064] whitespace-nowrap">
                  Gói đề xuất cho bạn
                </span>
                <strong className="mt-1 block text-base sm:text-lg font-extrabold text-[#123d2a] text-balance">
                  {isStarter
                    ? "Gói Khởi Đầu"
                    : isStandard
                    ? "Vận Hành Tiêu Chuẩn"
                    : isAdvanced
                    ? "Toàn Diện (Có OTA)"
                    : "Resort & Chuỗi"}
                </strong>
                <span className="mt-1 inline-block rounded-full bg-[#825916]/10 px-2.5 py-0.5 text-xs font-semibold text-[#825916] whitespace-nowrap">
                  Phù hợp nhất
                </span>
              </div>

              <div className="rounded-2xl bg-[#faf8f3] p-4 border border-[#123d2a]/8 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-[#627064] whitespace-nowrap">
                  Đầu tư ước tính / ngày
                </span>
                <strong className="mt-1 block text-2xl font-extrabold text-[#123d2a] font-mono">
                  {dailyCost > 0 ? `~${dailyCost.toLocaleString("vi-VN")} ₫` : "Tùy biến"}
                </strong>
                <span className="mt-1 text-xs text-[#627064] block">
                  Chỉ bằng 1 tách cà phê mỗi ngày
                </span>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-[#825916]/10 via-[#ba8c2f]/15 to-[#825916]/10 p-4 border border-[#ba8c2f]/40 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-[#825916] whitespace-nowrap">
                  Hoa hồng OTA giữ lại / tháng
                </span>
                <strong className="mt-1 block text-2xl font-extrabold text-[#825916] font-mono">
                  ~{estimatedOtaCommissionSaved.toLocaleString("vi-VN")} ₫
                </strong>
                <span className="mt-1 text-xs text-[#526054] block">
                  Nhờ nhận đặt phòng trực tiếp qua web
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Billing Cycle Toggle */}
      <section className="px-4 pt-14 pb-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <SectionHeader
            eyebrow="Tùy chọn thanh toán linh hoạt"
            title={<>Bảng giá các gói&nbsp;dịch vụ chuẩn hóa</>}
            text="Đã bao gồm chi phí lưu trữ đám mây, bảo mật dữ liệu, cập nhật tính năng mới định kỳ và hỗ trợ kỹ thuật tận tâm."
          />

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-[#123d2a]/15 bg-[#faf8f3] p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-5 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                billingCycle === "monthly"
                  ? "bg-[#123d2a] text-white shadow"
                  : "text-[#627064] hover:text-[#123d2a]"
              }`}
            >
              Thanh toán Hàng tháng
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("annual")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                billingCycle === "annual"
                  ? "bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] text-white shadow-md"
                  : "text-[#627064] hover:text-[#123d2a]"
              }`}
            >
              <span>Thanh toán 1 Năm</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold text-white whitespace-nowrap">
                Giảm 25%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards Grid with Metallic Gold Accents */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between rounded-3xl p-6 sm:p-7 transition-all duration-300 ${
                  tier.recommended
                    ? "border-2 border-[#ba8c2f] bg-white shadow-2xl shadow-[#ba8c2f]/20 ring-4 ring-[#ba8c2f]/10 -translate-y-2"
                    : tier.popular
                    ? "border-2 border-[#123d2a] bg-white shadow-lg"
                    : "border border-[#123d2a]/10 bg-[#faf8f3] hover:bg-white hover:border-[#ba8c2f]/50 hover:shadow-md"
                }`}
              >
                {tier.recommended && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] px-3.5 py-1 text-xs font-extrabold text-white uppercase tracking-wider whitespace-nowrap shadow-md">
                    Khuyên dùng cho quy mô của bạn
                  </span>
                )}
                {!tier.recommended && tier.popular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#123d2a] px-3.5 py-1 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap shadow-sm">
                    Phổ biến nhất
                  </span>
                )}

                <div>
                  <span className="rounded-full bg-[#123d2a]/5 px-2.5 py-1 text-xs font-semibold text-[#123d2a] whitespace-nowrap">
                    {tier.badge}
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-[#123d2a] text-balance">
                    {tier.name}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-[#627064] text-pretty">
                    Quy mô: {tier.target}
                  </p>

                  <div className="mt-6 border-y border-[#123d2a]/8 py-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-extrabold text-[#123d2a] font-mono">
                        {tier.price}
                      </span>
                      {tier.price.includes("₫") && (
                        <span className="text-xs font-medium text-[#627064]">/tháng</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#627064]">
                      {tier.billedNote}
                    </p>
                    {tier.savings && (
                      <span className="mt-1.5 inline-block text-xs font-bold text-[#825916]">
                        ✓ {tier.savings}
                      </span>
                    )}
                  </div>

                  <ul className="mt-6 space-y-2.5 text-xs sm:text-sm text-[#465349]">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="text-[#825916] font-bold shrink-0">✓</span>
                        <span className="leading-5">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    href="/contact"
                    className={`block w-full rounded-full py-3 text-center text-xs sm:text-sm font-bold transition-all ${
                      tier.recommended || tier.popular
                        ? "bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] text-white hover:brightness-105 shadow-md shadow-[#825916]/25"
                        : "border border-[#123d2a]/20 text-[#123d2a] hover:bg-[#123d2a] hover:text-white"
                    }`}
                  >
                    Đăng ký trải nghiệm 7 ngày →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Matrix Table */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 border-t border-[#123d2a]/10">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="So sánh chi phí & hiệu năng"
            title={<>Tại sao nên chọn hệ sinh thái&nbsp;hợp nhất VietSage?</>}
            text="Tránh lãng phí khi phải mua riêng rẽ 3–4 phần mềm của các nhà cung cấp khác nhau mà dữ liệu vẫn bị phân mảnh."
          />

          <div className="mt-12 overflow-x-auto rounded-3xl border border-[#123d2a]/10 bg-[#fffdf7] shadow-lg">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#123d2a]/10 bg-[#faf8f3]">
                  <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Hạng mục tính năng
                  </th>
                  <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-[#627064]">
                    Cách làm cũ / Mua 3–4 phần mềm rời
                  </th>
                  <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-[#825916] bg-[#f4ead0]/50">
                    Nền tảng hợp nhất VietSage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#123d2a]/8 text-xs sm:text-sm">
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-[#faf8f3]/40" : ""}>
                    <td className="py-4 px-6 font-bold text-[#123d2a] text-balance">
                      {row.feature}
                    </td>
                    <td className="py-4 px-6 text-[#627064] text-pretty">
                      <span className="text-[#ba1a1a] mr-1.5 font-bold">✕</span>
                      {row.legacy}
                    </td>
                    <td className="py-4 px-6 font-semibold text-[#123d2a] bg-[#f4ead0]/25 text-pretty">
                      <span className="text-[#825916] mr-1.5 font-bold">✓</span>
                      {row.vietsage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 bg-[#faf8f3]">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="Giải đáp thắc mắc"
            title="Câu hỏi thường gặp về chi phí & triển khai"
            text="Tất cả những điều bạn cần biết trước khi khởi động cùng VietSage."
          />

          <div className="mt-10 space-y-4">
            {FAQS.map((item, idx) => (
              <details
                key={idx}
                className="group rounded-2xl border border-[#123d2a]/10 bg-white p-5 transition-all open:border-[#ba8c2f]/40 open:shadow-sm"
              >
                <summary className="cursor-pointer text-sm sm:text-base font-bold text-[#123d2a] list-none flex items-center justify-between gap-4 text-balance">
                  <span>{item.q}</span>
                  <span className="text-[#825916] font-bold text-lg transition-transform group-open:rotate-45 shrink-0">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-xs sm:text-sm leading-6 text-[#526054] text-pretty border-t border-[#123d2a]/5 pt-3">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CTA locale="vi" />
    </MarketingShell>
  );
}
