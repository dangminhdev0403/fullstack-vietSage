import {
  CardGrid,
  CTA as Cta,
  Hero,
  MarketingShell,
  SectionHeader,
} from "@/components/marketing/marketing-shell";
import type { Metadata } from "next";

export const marketingMetadata: Metadata = {
  title: "VietSage | Nền tảng trợ lý số tại phòng",
  description:
    "VietSage cung cấp giải pháp trợ lý số tại phòng qua mã QR, tiếp nhận và điều phối dịch vụ tức thì, hỗ trợ đa ngôn ngữ và nâng tầm trải nghiệm khách lưu trú mà không thay thế hệ thống PMS.",
  openGraph: {
    title: "VietSage | Nền tảng trợ lý số tại phòng",
    description:
      "Lớp dịch vụ E-Concierge số tại phòng: tối ưu yêu cầu buồng phòng, ẩm thực tại phòng, điều phối tác vụ tức thì và hỗ trợ khách quốc tế đa ngôn ngữ.",
    images: ["/brand/register-hero.png"],
  },
};

const stats = [
  ["24/7", "trợ lý số tại phòng"],
  ["QR", "không cần tải ứng dụng"],
  ["Tức thì", "tự động điều phối"],
  ["Đa ngữ", "hỗ trợ khách quốc tế"],
];

const solutions = [
  {
    title: "Trợ lý số tại phòng qua mã QR",
    text: "Khách chỉ cần quét mã QR đặt tại phòng để yêu cầu khăn tắm, vật dụng cá nhân, buồng phòng, ẩm thực hay cẩm nang địa phương mà không cần tải ứng dụng.",
  },
  {
    title: "Tự động điều phối tác vụ",
    text: "Mọi yêu cầu được chuyển đến đúng bộ phận phụ trách kèm số phòng, mức ưu tiên, ngôn ngữ của khách và cập nhật theo thời gian thực.",
  },
  {
    title: "Nâng tầm trải nghiệm lưu trú",
    text: "Đóng vai trò như một bàn E-Concierge số tinh gọn ngay tại phòng: chuẩn xác, cao cấp, hỗ trợ đa ngôn ngữ và luôn sẵn sàng phục vụ 24/7.",
  },
];

const why = [
  {
    title: "Chuyên biệt cho trải nghiệm lưu trú",
    text: "VietSage không cạnh tranh với các hệ thống CRM quản lý tiếp thị; nền tảng tập trung giải quyết tức thì mọi nhu cầu phát sinh thực tế của khách trong suốt thời gian lưu trú.",
  },
  {
    title: "Giải tỏa áp lực quầy lễ tân",
    text: "Chuyển các yêu cầu dịch vụ thường gặp và thắc mắc của khách từ cuộc gọi tổng đài hoặc hàng chờ tiền sảnh sang luồng tự phục vụ nhanh gọn ngay tại phòng.",
  },
  {
    title: "Nâng chuẩn tiện nghi & riêng tư",
    text: "Khách chủ động gửi yêu cầu nhanh chóng và riêng tư; nhân viên tiếp nhận phiếu công việc chuẩn hóa thay vì ghi nhận thủ công qua điện thoại hay tin nhắn rời rạc.",
  },
  {
    title: "Giao tiếp đa ngôn ngữ",
    text: "Khách quốc tế dễ dàng nắm rõ dịch vụ và gửi yêu cầu bằng chính tiếng mẹ đẻ; hệ thống tự động dịch thuật giúp đội ngũ vận hành xử lý thông suốt, loại bỏ hiểu nhầm.",
  },
  {
    title: "Minh bạch dữ liệu vận hành",
    text: "Ban quản lý và chủ đầu tư dễ dàng theo dõi tần suất yêu cầu, thời gian đáp ứng (SLA), nhu cầu thực tế của khách và hiệu suất từng bộ phận theo thời gian thực.",
  },
  {
    title: "Tương thích hoàn hảo với PMS",
    text: "VietSage đóng vai trò là lớp giao tiếp trải nghiệm khách (Guest Experience Layer) song hành cùng hệ sinh thái PMS sẵn có, nâng cấp chất lượng phục vụ mà không làm gián đoạn hệ thống cốt lõi.",
  },
];

const moments = [
  "Khách cần bổ sung khăn tắm và vật dụng sau khi nhận phòng, gửi yêu cầu tức thì qua mã QR đặt tại phòng.",
  "Gia đình đặt dịch vụ ẩm thực tại phòng thuận tiện mà không cần chờ máy tổng đài trong khung giờ cao điểm.",
  "Khách quốc tế tra cứu hướng dẫn trả phòng (check-out) và chính sách khách sạn bằng chính ngôn ngữ của họ một cách chuẩn xác.",
];

const faqs = [
  [
    "VietSage có thay thế hệ thống PMS hoặc CRM hiện tại không?",
    "Không. VietSage là lớp trải nghiệm khách lưu trú (Guest Experience Layer) và trợ lý E-Concierge tại phòng. Nền tảng hoạt động song hành, bổ trợ hoàn hảo cho hệ thống PMS sẵn có nhằm giải quyết bài toán tiếp nhận dịch vụ, hỗ trợ đa ngôn ngữ và chuẩn hóa quy trình phục vụ tại phòng.",
  ],
  [
    "Khách lưu trú có cần cài đặt ứng dụng không?",
    "Hoàn toàn không. Khách chỉ cần quét mã QR tại phòng bằng camera điện thoại để truy cập ngay web-app dịch vụ, thao tác nhanh chóng mà không cần tải hay cài đặt bất kỳ ứng dụng nào.",
  ],
  [
    "Đội ngũ vận hành khách sạn nhận và xử lý yêu cầu ra sao?",
    "Các bộ phận liên quan (Lễ tân, Buồng phòng, F&B...) tiếp nhận phiếu yêu cầu chuẩn hóa theo số phòng, danh mục dịch vụ, độ ưu tiên và được dịch tự động về tiếng Việt, giúp phân công công việc minh bạch và phản hồi tức thì.",
  ],
];

export function MarketingHome() {
  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Trợ lý E-Concierge số tại từng phòng nghỉ"
        title="Kết nối lễ tân, buồng phòng và trải nghiệm lưu trú trong một quy trình liền mạch."
        text="VietSage mang đến giải pháp trợ lý QR thông minh hỗ trợ vật dụng phòng, ẩm thực tại phòng, dịch vụ buồng phòng, cẩm nang địa phương và đa ngôn ngữ; đồng thời giúp nhân viên phân luồng và xử lý từng yêu cầu nhanh chóng, chuẩn xác."
      >
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([v, l], index) => (
            <div
              key={l}
              data-reveal="scale"
              data-reveal-order={index}
              className="vs-stat-card rounded-3xl border border-[#123d2a]/10 bg-white/70 p-4 shadow-sm shadow-[#123d2a]/5"
            >
              <strong className="text-2xl text-[#123d2a]">{v}</strong>
              <span className="block text-[10px] leading-4 uppercase tracking-[.1em] text-[#627064]">
                {l}
              </span>
            </div>
          ))}
        </div>
      </Hero>

      <section className="vs-trust-strip px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p data-reveal="fade" className="text-center text-xs font-black uppercase tracking-[.28em] text-[#b8872f]">
            Tối ưu trải nghiệm thực tế của khách lưu trú thay vì quản trị dữ liệu cồng kềnh
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {["QR TẠI PHÒNG", "VẬT DỤNG PHÒNG", "ẨM THỰC TẠI PHÒNG", "CẨM NANG ĐỊA PHƯƠNG"].map((item, index) => (
              <span
                key={item}
                data-reveal="scale"
                data-reveal-order={index}
                className="vs-logo-tile"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="concierge" data-scene="concierge" className="vs-cinematic-scene relative overflow-hidden px-5 py-24 lg:px-8 lg:py-32">
        <div className="vs-scene-watermark vs-scene-watermark-right" aria-hidden="true">LƯU TRÚ</div>
        <div className="relative mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Giải pháp chuyên biệt từ VietSage"
            title="Số hóa mọi điểm chạm trong suốt kỳ lưu trú của khách."
            text="Thay vì quản trị dữ liệu như CRM truyền thống, VietSage tập trung xử lý nhu cầu thực tế: khách cần gì, bộ phận nào tiếp nhận và phục vụ nhanh nhất."
            reveal="from-left"
          />
          <div className="mt-12">
            <CardGrid items={solutions} />
          </div>
        </div>
      </section>

      <section id="operations" data-scene="operations" className="vs-cinematic-scene vs-operations-scene relative overflow-hidden px-5 py-24 lg:px-8 lg:py-32">
        <div className="vs-scene-watermark" aria-hidden="true">VẬN HÀNH</div>
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div data-reveal="from-left" className="vs-story-panel rounded-[2rem] p-8 text-white lg:sticky lg:top-32 lg:self-start">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-[#f3c66b]">03 / Kết nối tức thì từ phòng đến nhân sự</p>
            <h2 className="vs-display mt-5 text-3xl font-black leading-[1.02] tracking-[-0.035em] md:text-6xl md:leading-none md:tracking-[-0.04em] [text-wrap:balance]">
              Chuyển hóa mọi yêu cầu tại phòng thành tác vụ chính xác.
            </h2>
            <p className="mt-5 text-white/72">
              VietSage mang đến công cụ hỗ trợ tinh gọn, chuyên nghiệp, giúp khách luôn an tâm được phục vụ chu đáo mà không gây quá tải cho nhân viên qua các cuộc gọi dồn dập.
            </p>
          </div>
          <div className="grid gap-4">
            {moments.map((moment, index) => (
              <article
                key={moment}
                data-reveal={index % 2 === 0 ? "from-right" : "scale"}
                data-reveal-order={index}
                className="vs-moment-card rounded-[1.8rem] p-7"
              >
                <span className="vs-moment-number">0{index + 1}</span>
                <p className="mt-8 text-xl font-black leading-8 text-white">
                  {moment}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="visibility" data-scene="visibility" className="vs-cinematic-scene relative overflow-hidden px-5 py-24 lg:px-8 lg:py-32">
        <div className="vs-scene-watermark vs-scene-watermark-right" aria-hidden="true">MINH BẠCH</div>
        <div className="relative mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Tại sao chọn VietSage"
            title="Giải tỏa áp lực lễ tân. Nâng chuẩn tiện nghi phòng. Tối ưu hiệu suất vận hành."
            text="Khách sạn tiếp tục duy trì hệ thống PMS hiện có, đồng thời trang bị thêm nền tảng số hóa tại phòng giúp nâng cao mức độ hài lòng của khách và tối ưu năng lực phối hợp giữa các bộ phận."
            reveal="from-right"
          />
          <div className="mt-12">
            <CardGrid items={why} />
          </div>
        </div>
      </section>

      <section data-scene="visibility" className="px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="Câu hỏi thường gặp"
            title="Giải đáp thắc mắc trước khi trải nghiệm bản demo."
            text="VietSage được phát triển chuyên sâu cho dịch vụ tại phòng và tối ưu vận hành khách sạn, khác biệt hoàn toàn với các phần mềm CRM phổ thông."
          />
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} data-reveal="fade" className="vs-faq-item rounded-3xl bg-white/82 p-6 shadow-sm shadow-[#123d2a]/5">
                <summary className="cursor-pointer font-black text-[#123d2a]">
                  {q}
                </summary>
                <p className="mt-3 leading-7 text-[#627064]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <Cta locale="vi" />
    </MarketingShell>
  );
}
