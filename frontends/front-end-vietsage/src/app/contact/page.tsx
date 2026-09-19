import { CardGrid, CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Liên hệ VietSage | Yêu cầu tư vấn & Demo",
  description: "Chia sẻ với chúng tôi về quy mô khách sạn của bạn để cùng thiết kế lộ trình chuyển đổi số vận hành phù hợp nhất.",
};

const items = [
  { title: "Yêu cầu buổi Demo", text: "Trực tiếp trải nghiệm giao diện E-Concierge tại phòng cho khách và trang điều phối tác vụ dành riêng cho nhân viên lễ tân, buồng phòng." },
  { title: "Tư vấn triển khai", text: "Đội ngũ chuyên gia VietSage khảo sát hiện trạng PMS, hạ tầng mạng Wi-Fi và tư vấn gói giải pháp tối ưu theo số lượng phòng." },
  { title: "Kế hoạch tích hợp", text: "Quy trình thiết lập trạm máy quét CCCD, mã QR tại từng phòng và kết nối bảo mật hoàn tất nhanh chóng chỉ trong vài ngày làm việc." },
  { title: "Hợp tác đối tác", text: "Chính sách hợp tác chiến lược dành cho các đơn vị tư vấn giải pháp du lịch, nhà cung cấp phần mềm khách sạn và chủ chuỗi lưu trú." },
  { title: "Hỗ trợ kỹ thuật 24/7", text: "Kênh hỗ trợ trực tiếp qua tổng đài, Zalo OA và kỹ sư hệ thống luôn sẵn sàng xử lý mọi sự cố vận hành trong ca trực." },
  { title: "Mạng lưới phục vụ", text: "Đã và đang đồng hành cùng các khách sạn, khu nghỉ dưỡng cao cấp tại Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Nha Trang, Phú Quốc." },
];

export default function Page() {
  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Đăng ký trải nghiệm giải pháp VietSage"
        title="Liên hệ VietSage"
        text="Hãy chia sẻ về khách sạn của bạn, đội ngũ chuyên gia của chúng tôi sẽ đồng hành thiết kế lộ trình số hóa vận hành chuẩn xác nhất."
        image="/marketing/bay.jpg"
      />
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Kết nối"
            title="Đồng hành cùng sự phát triển của bạn."
            text="VietSage mang lại sự an tâm tuyệt đối với cam kết chất lượng, bảo mật dữ liệu và đội ngũ hỗ trợ tận tâm mọi lúc mọi nơi."
          />
          <div className="mt-12">
            <CardGrid items={items} />
          </div>
        </div>
      </section>
      <CTA locale="vi" />
    </MarketingShell>
  );
}
