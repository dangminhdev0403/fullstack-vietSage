import { CardGrid, CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VietSage Commerce | Quản trị thương mại dịch vụ số",
  description: "Tối ưu quản lý menu, dịch vụ ẩm thực tại phòng, thanh toán tức thì và báo cáo doanh thu với lớp công nghệ số hiện đại.",
};

const items = [
  { title: "Tổng quan thương mại", text: "Số hóa toàn diện danh mục ẩm thực, quà lưu niệm, tour du lịch và các dịch vụ gia tăng ngay trên thiết bị của khách." },
  { title: "Giải quyết điểm nghẽn", text: "Loại bỏ hoàn toàn tình trạng máy bận khi gọi tổng đài phòng ăn, nhầm lẫn đơn gọi món hoặc thất lạc yêu cầu của khách." },
  { title: "Đặt món & Dịch vụ tức thì", text: "Khách xem hình ảnh trực quan, chọn món và gửi yêu cầu; quầy bếp hoặc dịch vụ nhận phiếu chế biến theo thời gian thực." },
  { title: "Quản lý tồn kho & Menu linh hoạt", text: "Cập nhật giá cả, trạng thái còn/hết món tức thì trên toàn bộ hệ thống mà không phải in lại menu giấy tốn kém." },
  { title: "Trải nghiệm cá nhân hóa", text: "Gợi ý thông minh các món ăn kèm, thức uống phù hợp theo thời điểm trong ngày (bữa sáng, trà chiều, dạ tiệc đêm)." },
  { title: "Báo cáo phân tích doanh thu", text: "Thống kê chi tiết doanh thu theo từng phòng, khung giờ cao điểm, các món được ưa chuộng nhất giúp tối ưu chi phí nguyên liệu." },
  { title: "Tích hợp thanh toán an toàn", text: "Hỗ trợ ghi nợ vào hóa đơn phòng (Folio) hoặc thanh toán trực tuyến qua cổng thẻ, QR code ngân hàng thuận tiện." },
  { title: "Kết nối hệ sinh thái PMS", text: "Đồng bộ tức thì chi phí vào tài khoản phòng của khách trên hệ thống quản trị lễ tân trung tâm." },
  { title: "Giao diện quản lý trực quan", text: "Bảng điều khiển trực quan dành cho quản lý F&B và bếp, hiển thị thứ tự đơn gọi món theo thời gian thực." },
];

export default function Page() {
  return (
    <MarketingShell locale="vi">
      <Hero
        locale="vi"
        eyebrow="Thương mại dịch vụ ẩm thực và tiện ích tại phòng"
        title="VietSage Commerce"
        text="Gia tăng doanh thu dịch vụ phòng, nâng cao trải nghiệm ẩm thực và tối ưu quy trình phục vụ cho thương hiệu khách sạn hiện đại."
        image="/marketing/mountain-road.jpg"
      />
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Tính năng"
            title="Được xây dựng cho các nhà vận hành chuyên nghiệp."
            text="VietSage kết hợp quản lý danh mục số, tự động hóa đơn đặt hàng và giao diện thanh toán thanh lịch cho các đội ngũ khách sạn."
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
