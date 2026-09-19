import { CardGrid, CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Về VietSage | Công nghệ vận hành khách sạn",
  description: "Chúng tôi hỗ trợ các khách sạn và doanh nghiệp dịch vụ chuyển đổi vận hành phức tạp thành trải nghiệm lưu trú chuẩn mực và giàu giá trị.",
};

const items = [
  { title: "Giới thiệu công ty", text: "VietSage phát triển nền tảng công nghệ quản trị lưu trú thông minh, phục vụ các khách sạn mong muốn tối ưu vận hành và nâng cao chất lượng dịch vụ." },
  { title: "Sứ mệnh", text: "Kết nối liền mạch mọi mắt xích giữa quầy lễ tân, bộ phận buồng phòng, ẩm thực và trải nghiệm của khách lưu trú trong một luồng tương tác số tự động." },
  { title: "Tầm nhìn", text: "Trở thành hệ điều hành khách sạn và dịch vụ lưu trú tin cậy hàng đầu khu vực, đạt chuẩn mực quốc tế về bảo mật và vận hành." },
  { title: "Câu chuyện khởi nguồn", text: "Xuất phát từ thực tế quầy tiếp tân quá tải và nhu cầu của khách tại phòng thường bị chậm trễ, VietSage ra đời để giải quyết triệt để thời gian chờ." },
  { title: "Giá trị cốt lõi", text: "Minh bạch trong dữ liệu, tinh gọn trong thao tác, bảo mật theo chuẩn pháp lý và không ngừng nâng cao trải nghiệm khách hàng." },
  { title: "Đội ngũ sáng lập", text: "Tập hợp các chuyên gia giàu kinh nghiệm trong lĩnh vực công nghệ số, quản trị khách sạn và thiết kế trải nghiệm người dùng." },
  { title: "Tại sao chọn VietSage", text: "Triển khai thần tốc không cần thay thế PMS, khách không cần tải app, nhân viên nắm bắt công việc tức thì qua điện thoại." },
  { title: "Kiến trúc công nghệ", text: "Xây dựng trên nền tảng đám mây hiện đại, bảo đảm tính khả dụng 99.9%, mã hóa đầu cuối và tuân thủ Nghị định bảo vệ dữ liệu cá nhân." },
  { title: "Triết lý phục vụ", text: "Công nghệ phục vụ con người, giải phóng nhân viên khỏi các thao tác thủ công để tập trung vào sự ân cần và chu đáo dành cho khách lưu trú." },
];

export default function Page() {
  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Tổ chức tiên phong hạ tầng công nghệ dịch vụ số"
        title="Về VietSage"
        text="Chúng tôi đồng hành cùng các khách sạn biến quy trình vận hành phức tạp thành hành trình trải nghiệm dịch vụ liền mạch, êm ái và chuẩn xác."
        image="/marketing/team-road.jpg"
      />
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Tổng quan"
            title="Được thiết kế cho những nhà quản trị nghiêm túc."
            text="VietSage kết hợp tự động hóa quy trình, thiết kế vận hành, phân tích dữ liệu và trải nghiệm người dùng tinh tế cho các đội ngũ khách sạn."
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
