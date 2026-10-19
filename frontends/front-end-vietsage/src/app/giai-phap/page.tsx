"use client";

import { useState } from "react";
import Link from "next/link";
import { CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";

type PhaseId = "phase-1" | "phase-2" | "phase-3" | "phase-4" | "property-types";

const PHASES = [
  {
    id: "phase-1" as PhaseId,
    num: "PHASE 1",
    tag: "ĐẶT PHÒNG & BÁN PHÒNG",
    title: "Đồng bộ đa kênh OTA & Booking Engine trực tuyến",
    description:
      "Tự động khóa phòng tức thì trên Booking.com, Agoda, Airbnb khi có đơn mới. Nhận đặt phòng trực tiếp từ website không mất phí hoa hồng 15–25%.",
    metricBadge: "0% RỦI RO TRÙNG PHÒNG",
    modules: [
      {
        num: "Module 1",
        title: "Channel Manager đồng bộ 2 chiều thời gian thực",
        desc: "Lịch phòng và giá bán được cập nhật tự động lên Booking.com, Agoda, Airbnb trong thời gian thực. Loại bỏ hoàn toàn rủi ro trùng phòng (overbooking) giờ check-in.",
        highlights: [
          "Đồng bộ phòng trống và giá bán 2 chiều theo thời gian thực",
          "Điều chỉnh giá theo mùa, cuối tuần, ngày lễ đồng loạt trên mọi kênh OTA",
          "Quản lý toàn bộ danh sách đặt phòng tại một màn hình duy nhất",
          "Hỗ trợ mở rộng thêm Trip.com, Traveloka nhanh chóng",
        ],
      },
      {
        num: "Module 2",
        title: "Website Booking Engine 0% hoa hồng OTA",
        desc: "Khách quốc tế và nội địa đặt phòng trực tiếp trên website của khách sạn. Doanh thu giữ trọn 100%, tích hợp thanh toán cọc tự động qua VietQR, MoMo và thẻ quốc tế.",
        highlights: [
          "Giao diện đặt phòng mượt mà, hỗ trợ 6 ngôn ngữ quốc tế",
          "Hiển thị tình trạng phòng và mức giá tức thì theo Channel Manager",
          "Cổng thanh toán cọc tự động VietQR, MoMo, thẻ nội địa và quốc tế",
          "Tự động gửi email / tin nhắn xác nhận kèm mã QR nhận phòng",
        ],
      },
    ],
  },
  {
    id: "phase-2" as PhaseId,
    num: "PHASE 2",
    tag: "TIẾP ĐÓN & CHECK-IN",
    title: "Check-in thông minh với chip CCCD & Cổng KBTT C06",
    description:
      "Rút ngắn thời gian tiếp đón từ 15 phút xuống dưới 2 phút. Quét chip CCCD NFC và xuất dữ liệu khai báo lưu trú tự động đúng chuẩn pháp lý.",
    metricBadge: "-80% THỜI GIAN TIẾP ĐÓN",
    modules: [
      {
        num: "Module 3",
        title: "Khai báo lưu trú công an NA17 / Cổng C06",
        desc: "Thông tin hộ chiếu hoặc CCCD của khách được trích xuất tự động qua máy quét hoặc camera. Dữ liệu chuẩn bị sẵn để gửi cổng TBLT KBTT của Bộ Công An.",
        highlights: [
          "Trích xuất nhanh CMND, CCCD gắn chip NFC và Hộ chiếu quốc tế",
          "Xuất dữ liệu chuẩn Excel / XML đẩy thẳng lên cổng Dịch vụ công C06",
          "Bảo đảm mốc thời gian 12 giờ theo Nghị định 282/2025 phòng tránh xử phạt",
          "Lưu trữ lịch sử khai báo minh bạch, dễ dàng tra cứu theo phòng và ngày",
        ],
      },
      {
        num: "Module 4",
        title: "Cấp phòng & Phát mã QR riêng biệt",
        desc: "Lễ tân thao tác xếp phòng trên sơ đồ trực quan và bàn giao mã QR cá nhân hóa in trên thẻ khóa phòng hoặc gửi qua tin nhắn cho khách.",
        highlights: [
          "Bản đồ trạng thái phòng trực quan: Trống, Đang ở, Đang dọn, Cần bảo trì",
          "Mỗi phòng sở hữu mã QR bảo mật riêng biệt trong suốt kỳ lưu trú",
          "Khách quốc tế tự tra cứu nội quy, hướng dẫn và tiện ích bằng tiếng mẹ đẻ",
          "Giảm thiểu sai sót ghi nhận thông tin so với sổ tay truyền thống",
        ],
      },
    ],
  },
  {
    id: "phase-3" as PhaseId,
    num: "PHASE 3",
    tag: "LƯU TRÚ & DỊCH VỤ",
    title: "Trợ lý E-Concierge số tại phòng & Điều phối buồng phòng",
    description:
      "Khách quét QR để gọi dịch vụ, buồng phòng và ẩm thực mà không cần tải ứng dụng. Nhân viên tiếp nhận và xử lý tác vụ trên thiết bị di động tức thì.",
    metricBadge: "< 3 PHÚT PHẢN HỒI YÊU CẦU",
    modules: [
      {
        num: "Module 5",
        title: "Trợ lý số E-Concierge tại phòng qua QR",
        desc: "Khách lưu trú quét mã QR tại phòng để yêu cầu thêm khăn, đồ dùng cá nhân, gọi dọn phòng, giặt là, đặt món room service hoặc xe đưa đón 24/7.",
        highlights: [
          "Giao diện trực quan hỗ trợ 6 ngôn ngữ: Việt, Anh, Trung, Hàn, Nga, Hindi",
          "Khách không cần tải ứng dụng hay gọi tổng đài lễ tân giờ cao điểm",
          "Mọi yêu cầu dịch vụ có tính phí tự động cập nhật vào hóa đơn phòng (Folio)",
          "Tích hợp cẩm nang gợi ý điểm đến du lịch địa phương LocalMate AI",
        ],
      },
      {
        num: "Module 6",
        title: "Ứng dụng buồng phòng & Điều phối nội bộ",
        desc: "Nhân viên buồng phòng đăng nhập nhanh bằng số điện thoại trên trình duyệt di động, xem danh sách phòng cần làm sạch theo thứ tự ưu tiên.",
        highlights: [
          "Truy cập trực tiếp trên điện thoại di động, không cần cài đặt phần mềm",
          "Danh sách phòng phân chia theo tầng và mức độ ưu tiên trả phòng",
          "Cập nhật trạng thái 'Đã sạch' ngay khi xong để lễ tân đón khách mới",
          "Loại bỏ hoàn toàn việc trao đổi vụn vặt qua nhóm chat hay bộ đàm ồn ào",
        ],
      },
      {
        num: "Module 7",
        title: "Bản đồ quản lý phòng & CRM lưu trú",
        desc: "Hệ thống quản trị tập trung cho chủ cơ sở và quản lý ca trực, theo dõi công suất phòng, tiến độ phục vụ và lịch sử khách hàng.",
        highlights: [
          "Hiển thị trạng thái buồng phòng theo mã màu chuẩn mực quốc tế",
          "Lịch đặt phòng dài hạn, hỗ trợ gia hạn lưu trú chỉ với một thao tác",
          "Hồ sơ khách lưu trú ghi nhận sở thích, ghi chú đặc biệt và tần suất ghé thăm",
          "Phân quyền bảo mật chặt chẽ giữa Chủ cơ sở, Quản lý, Lễ tân và Buồng phòng",
        ],
      },
    ],
  },
  {
    id: "phase-4" as PhaseId,
    num: "PHASE 4",
    tag: "CHECK-OUT & THANH TOÁN",
    title: "Folio hợp nhất & Hóa đơn điện tử đúng chuẩn pháp luật",
    description:
      "Tất cả chi phí phòng, ẩm thực, minibar và dịch vụ phụ trợ được tổng hợp vào một bản Folio duy nhất, loại bỏ mọi tranh cãi lúc thanh toán.",
    metricBadge: "100% HÓA ĐƠN HỢP LỆ NĐ 119",
    modules: [
      {
        num: "Module 8",
        title: "Folio một hóa đơn lưu trú hợp nhất",
        desc: "Tiền phòng, ẩm thực, giặt là, xe đưa đón và minibar tự động ghi nhận vào tài khoản phòng. Khách có thể xem trước chi tiết hóa đơn qua mã QR phòng.",
        highlights: [
          "Tự động đối trừ tiền đặt cọc và khấu trừ các khoản giảm trừ chính xác",
          "Hỗ trợ đa dạng phương thức thanh toán: VietQR, thẻ ngân hàng, tiền mặt",
          "Khách chủ động kiểm tra sao kê chi phí trước khi xuống quầy lễ tân",
          "Lưu trữ hồ sơ thanh toán điện tử an toàn, dễ dàng tra soát đối chiếu",
        ],
      },
      {
        num: "Module 9",
        title: "Xuất hóa đơn điện tử E-Invoice chuẩn NĐ 119",
        desc: "Tích hợp sẵn dịch vụ Hóa đơn điện tử Viettel S-Invoice và VNPT. Xuất hóa đơn có mã cơ quan thuế ngay tại quầy và gửi tức thì qua Email / Zalo.",
        highlights: [
          "Ký số và phát hành hóa đơn điện tử trực tiếp từ màn hình Folio",
          "Đáp ứng đầy đủ quy định thuế theo Nghị định 119 và Thông tư 78",
          "Tự động gửi liên hóa đơn điện tử đến email doanh nghiệp của khách",
          "Lưu trữ số liệu an toàn 10 năm trên hạ tầng đám mây đạt chuẩn",
        ],
      },
    ],
  },
];

const PROPERTY_TYPES = [
  {
    title: "Homestay & Villa (5–15 phòng)",
    desc: "Chủ nhà tự vận hành hoặc ít nhân sự. VietSage tự động hóa đồng bộ lịch OTA tránh trùng phòng, hỗ trợ khách Tây đọc thông tin đa ngữ và xuất file KBTT nhanh.",
    badges: ["Channel Manager", "KBTT nhanh", "QR phòng"],
  },
  {
    title: "Khách sạn mini & Boutique (15–50 phòng)",
    desc: "Nâng cao chất lượng phục vụ, giảm tải quầy lễ tân vào giờ cao điểm. Mã QR phòng nhận đơn dịch vụ, app điều phối buồng phòng và folio gộp hóa đơn tự động.",
    badges: ["E-Concierge 6 thứ tiếng", "App buồng phòng", "Folio gộp"],
  },
  {
    title: "Khách sạn có F&B & Bếp riêng",
    desc: "Tích hợp liền mạch giữa PMS khách sạn, POS nhà hàng và màn hình KDS nhà bếp. Khách gọi món tại phòng, bếp nhận phiếu chế biến, chi phí ghi nợ tự động vào Folio.",
    badges: ["POS nhà hàng", "KDS nhà bếp", "Ghi nợ phòng"],
  },
  {
    title: "Resort & Khu nghỉ dưỡng (50–200+ phòng)",
    desc: "Khuôn viên rộng lớn với nhiều dịch vụ (Spa, Tour, Nhà hàng, Minibar). Khách chỉ cần quét QR để gọi dịch vụ đến tận villa, đội ngũ điều phối nhanh chóng qua ứng dụng di động.",
    badges: ["LocalMate AI", "Điều phối đa điểm", "Báo cáo SLA"],
  },
];

export default function GiaiPhapPage() {
  const [activeTab, setActiveTab] = useState<PhaseId>("phase-1");

  // Interactive In-Room E-Concierge Simulator State
  const [guestLanguage, setGuestLanguage] = useState<"vi" | "en" | "zh" | "ko">("vi");
  const [activeServiceDemo, setActiveServiceDemo] = useState("Khăn tắm & Tiện ích");
  const [simulatedRequests, setSimulatedRequests] = useState<string[]>([
    "Phòng 302: Yêu cầu bổ sung 02 khăn tắm lớn",
    "Phòng 405: Đặt 01 phần Phở Bò Bắp Hoa tại phòng",
  ]);

  const handleSimulateRequest = (serviceName: string) => {
    setActiveServiceDemo(serviceName);
    const newEntry = `Phòng 201: Yêu cầu ${serviceName.toLowerCase()} (vừa gửi qua QR)`;
    setSimulatedRequests((prev) => [newEntry, ...prev.slice(0, 3)]);
  };

  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Kiến trúc giải pháp số hóa toàn diện"
        title="Nền tảng vận hành khách sạn khép kín từ đặt phòng đến check-out"
        text="Một hệ thống duy nhất hợp nhất Channel Manager OTA, Check-in CCCD & cổng KBTT C06, Trợ lý QR 6 ngôn ngữ tại phòng, Điều phối buồng phòng và Folio thanh toán chuẩn pháp lý."
        image="/brand/register-hero.png"
      />

      {/* KPI Performance Highlights Banner */}
      <section className="bg-gradient-to-r from-[#123d2a] via-[#1a4a35] to-[#123d2a] text-white py-10 px-4 sm:px-6 lg:px-8 border-y border-[#ba8c2f]/30">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 text-center">
            <div className="border-r border-white/10 last:border-none p-3">
              <span className="block text-2xl sm:text-4xl font-extrabold text-[#e5c07b] font-mono">
                0%
              </span>
              <span className="mt-1 block text-xs sm:text-sm font-medium text-white/80 text-balance">
                Rủi ro trùng phòng OTA
              </span>
            </div>
            <div className="border-r border-white/10 last:border-none p-3">
              <span className="block text-2xl sm:text-4xl font-extrabold text-[#e5c07b] font-mono">
                3 giây
              </span>
              <span className="mt-1 block text-xs sm:text-sm font-medium text-white/80 text-balance">
                Quét chip CCCD & Tiếp đón
              </span>
            </div>
            <div className="border-r border-white/10 last:border-none p-3">
              <span className="block text-2xl sm:text-4xl font-extrabold text-[#e5c07b] font-mono">
                6 thứ tiếng
              </span>
              <span className="mt-1 block text-xs sm:text-sm font-medium text-white/80 text-balance">
                Trợ lý QR E-Concierge
              </span>
            </div>
            <div className="p-3">
              <span className="block text-2xl sm:text-4xl font-extrabold text-[#e5c07b] font-mono">
                100%
              </span>
              <span className="mt-1 block text-xs sm:text-sm font-medium text-white/80 text-balance">
                Đúng hạn Cổng C06 & NĐ 119
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Phase Navigation Tabs Bar */}
      <section className="sticky top-[64px] z-30 bg-[#fffdf7]/95 backdrop-blur-md border-b border-[#123d2a]/10 py-3 px-4 shadow-sm">
        <div className="mx-auto max-w-7xl flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {PHASES.map((p) => {
            const isActive = activeTab === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActiveTab(p.id);
                  const el = document.getElementById(p.id);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#123d2a] text-white shadow-md ring-2 ring-[#ba8c2f]/40"
                    : "bg-white text-[#465349] border border-[#123d2a]/15 hover:bg-[#f4ead0]/60 hover:text-[#123d2a]"
                }`}
              >
                <span>{p.num}: {p.tag}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setActiveTab("property-types");
              const el = document.getElementById("property-types");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "property-types"
                ? "bg-[#123d2a] text-white shadow-md ring-2 ring-[#ba8c2f]/40"
                : "bg-white text-[#465349] border border-[#123d2a]/15 hover:bg-[#f4ead0]/60 hover:text-[#123d2a]"
            }`}
          >
            <span>Mô hình cơ sở lưu trú</span>
          </button>
        </div>
      </section>

      {/* Interactive Live Workflow Simulation Station */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 bg-[#faf8f3]">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Trải nghiệm tương tác thời gian thực"
            title="Thử nghiệm luồng E-Concierge số tại phòng"
            text="Khách lưu trú quét mã QR tại phòng để gửi yêu cầu dịch vụ. Xem cách hệ thống phân luồng tác vụ ngay lập tức đến nhân viên buồng phòng."
          />

          <div className="mt-12 rounded-3xl border border-[#ba8c2f]/30 bg-white p-6 sm:p-8 lg:p-10 shadow-xl shadow-[#ba8c2f]/10">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              
              {/* Left Column: Simulated Guest Mobile Interface */}
              <div className="lg:col-span-5 rounded-2xl border border-[#123d2a]/15 bg-[#faf8f3] p-5 shadow-inner">
                <div className="flex items-center justify-between border-b border-[#123d2a]/10 pb-3">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-[#825916]">
                      Màn hình khách lưu trú
                    </span>
                    <strong className="text-sm font-extrabold text-[#123d2a]">
                      Phòng 201 · Deluxe Ocean
                    </strong>
                  </div>
                  {/* Language Selector in Mockup */}
                  <div className="flex items-center gap-1">
                    {(["vi", "en", "zh", "ko"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setGuestLanguage(lang)}
                        className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${
                          guestLanguage === lang
                            ? "bg-[#123d2a] text-white"
                            : "bg-white text-[#627064] border border-[#123d2a]/10"
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <p className="text-xs font-semibold text-[#526054]">
                    Chạm để gửi yêu cầu mẫu tức thì qua QR:
                  </p>
                  {[
                    "Khăn tắm & Tiện ích phòng",
                    "Dọn phòng & Thay ga trải giường",
                    "Đặt món Room Service tại phòng",
                    "Hỗ trợ cẩm nang & Đặt xe du lịch",
                  ].map((service) => (
                    <button
                      key={service}
                      type="button"
                      onClick={() => handleSimulateRequest(service)}
                      className={`flex w-full items-center justify-between rounded-xl p-3 text-xs sm:text-sm font-bold transition-all text-left ${
                        activeServiceDemo === service
                          ? "bg-gradient-to-r from-[#825916] to-[#ba8c2f] text-white shadow-md"
                          : "bg-white text-[#123d2a] border border-[#123d2a]/10 hover:border-[#ba8c2f]"
                      }`}
                    >
                      <span>{service}</span>
                      <span className="text-xs opacity-80 whitespace-nowrap">Gửi nhanh →</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column: Simulated Staff Live Dispatch Feed */}
              <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-[#123d2a] p-6 text-white shadow-lg">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]"></span>
                    </span>
                    <strong className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#e5c07b]">
                      Bảng điều phối tác vụ nhân viên Live
                    </strong>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-mono text-white/80 whitespace-nowrap">
                    Cập nhật 0.4s
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 min-h-[170px]">
                  {simulatedRequests.map((req, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-3 text-xs sm:text-sm animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[#e5c07b] font-bold">●</span>
                        <span className="text-white/90">{req}</span>
                      </div>
                      <span className="rounded bg-[#10b981]/20 px-2 py-0.5 text-xs font-semibold text-[#10b981] whitespace-nowrap">
                        Đã chuyển Buồng phòng
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                  <span>Trạng thái: Tự động phân luồng theo số phòng & ngôn ngữ</span>
                  <span className="text-[#e5c07b] font-bold">Không trễ hạn SLA</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 4 Phases of Hospitality Lifecycle with Visual Cards */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Chu trình vận hành khép kín"
            title="Đồng hành cùng mọi điểm chạm của khách lưu trú"
            text="VietSage được xây dựng dựa trên hành trình thực tế của cơ sở lưu trú, tối ưu năng suất lao động cho nhân viên và mang lại trải nghiệm chuẩn 5 sao cho khách hàng."
          />

          <div className="mt-14 space-y-16">
            {PHASES.map((p) => (
              <div
                key={p.id}
                id={p.id}
                className="scroll-mt-32 rounded-3xl border border-[#123d2a]/10 bg-[#faf8f3] p-6 sm:p-8 lg:p-10 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#123d2a]/8 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gradient-to-r from-[#825916] to-[#ba8c2f] px-3.5 py-1 text-xs font-extrabold text-white tracking-wider whitespace-nowrap shadow-sm">
                      {p.num}
                    </span>
                    <span className="text-xs font-bold tracking-wide text-[#123d2a] uppercase whitespace-nowrap">
                      {p.tag}
                    </span>
                  </div>
                  <span className="rounded-full bg-[#123d2a]/5 px-3 py-1 text-xs font-bold text-[#825916] border border-[#ba8c2f]/20 whitespace-nowrap">
                    {p.metricBadge}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-[#123d2a] text-balance">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm sm:text-base text-[#465349] max-w-3xl text-pretty leading-relaxed">
                  {p.description}
                </p>

                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {p.modules.map((m) => (
                    <div
                      key={m.num}
                      className="group flex flex-col justify-between rounded-2xl border border-[#123d2a]/10 bg-white p-6 shadow-sm hover:border-[#ba8c2f] hover:shadow-xl hover:shadow-[#ba8c2f]/10 transition-all duration-300"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="inline-block rounded-lg bg-[#123d2a]/5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#123d2a] whitespace-nowrap group-hover:bg-[#825916]/10 group-hover:text-[#825916] transition-colors">
                            {m.num}
                          </span>
                          <span className="text-xs font-mono text-[#825916] opacity-0 group-hover:opacity-100 transition-opacity">
                            Sẵn sàng triển khai
                          </span>
                        </div>
                        <h4 className="mt-3 text-base sm:text-lg font-bold text-[#123d2a] text-balance group-hover:text-[#825916] transition-colors">
                          {m.title}
                        </h4>
                        <p className="mt-2 text-xs sm:text-sm leading-6 text-[#526054] text-pretty">
                          {m.desc}
                        </p>
                      </div>

                      <ul className="mt-5 space-y-2 border-t border-[#123d2a]/8 pt-4 text-xs sm:text-sm text-[#38443b]">
                        {m.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-2">
                            <span className="text-[#825916] font-bold shrink-0">✓</span>
                            <span className="leading-5">{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Property Types Tailored Section */}
      <section id="property-types" className="scroll-mt-32 bg-white px-4 py-16 sm:px-6 lg:px-8 border-y border-[#123d2a]/10">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Tùy biến theo quy mô"
            title="Được thiết kế chuẩn xác cho mô hình cơ sở lưu trú của bạn"
            text="Dù bạn vận hành chuỗi homestay cá tính hay khách sạn nghỉ dưỡng cao cấp, VietSage cung cấp cấu hình linh hoạt đáp ứng trọn vẹn yêu cầu vận hành."
          />

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROPERTY_TYPES.map((item) => (
              <div
                key={item.title}
                className="flex flex-col justify-between rounded-2xl border border-[#123d2a]/10 bg-[#faf8f3] p-6 transition-all hover:bg-white hover:border-[#ba8c2f] hover:shadow-xl hover:shadow-[#ba8c2f]/10"
              >
                <div>
                  <h4 className="text-base font-bold text-[#123d2a] text-balance">
                    {item.title}
                  </h4>
                  <p className="mt-3 text-xs sm:text-sm leading-6 text-[#526054] text-pretty">
                    {item.desc}
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap gap-1.5 pt-4 border-t border-[#123d2a]/10">
                  {item.badges.map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#825916] border border-[#ba8c2f]/20 whitespace-nowrap"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl bg-gradient-to-r from-[#123d2a] to-[#1a4a35] text-white p-8 sm:p-10 text-center border border-[#ba8c2f]/40 shadow-xl shadow-[#123d2a]/15">
            <h4 className="text-xl sm:text-2xl font-bold text-balance text-[#e5c07b]">
              Khách sạn của bạn có quy trình vận hành đặc thù?
            </h4>
            <p className="mt-3 text-xs sm:text-sm text-white/80 max-w-xl mx-auto text-pretty leading-relaxed">
              Đội ngũ chuyên gia công nghệ VietSage sẵn sàng khảo sát thực tế và cấu hình giải pháp chuyên biệt theo số phòng và phần cứng sẵn có của bạn.
            </p>
            <div className="mt-6">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-lg hover:brightness-105 transition-all"
              >
                Đặt lịch tư vấn & Khảo sát trực tiếp →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CTA locale="vi" />
    </MarketingShell>
  );
}
