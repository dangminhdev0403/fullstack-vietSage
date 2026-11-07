"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CardGrid, CTA, Hero, MarketingShell, SectionHeader } from "@/components/marketing/marketing-shell";
import { showSuccessAlert } from "@/libs/swal";

const items = [
  { title: "Yêu cầu buổi Demo", text: "Trực tiếp trải nghiệm giao diện E-Concierge tại phòng cho khách và trang điều phối tác vụ dành riêng cho nhân viên lễ tân, buồng phòng." },
  { title: "Tư vấn triển khai", text: "Đội ngũ chuyên gia VietSage khảo sát hiện trạng PMS, hạ tầng mạng Wi-Fi và tư vấn gói giải pháp tối ưu theo số lượng phòng." },
  { title: "Kế hoạch tích hợp", text: "Quy trình thiết lập trạm máy quét CCCD, mã QR tại từng phòng và kết nối bảo mật hoàn tất nhanh chóng chỉ trong vài ngày làm việc." },
  { title: "Hợp tác đối tác", text: "Chính sách hợp tác chiến lược dành cho các đơn vị tư vấn giải pháp du lịch, nhà cung cấp phần mềm khách sạn và chủ chuỗi lưu trú." },
  { title: "Hỗ trợ kỹ thuật 24/7", text: "Kênh hỗ trợ trực tiếp qua tổng đài, Zalo OA và kỹ sư hệ thống luôn sẵn sàng xử lý mọi sự cố vận hành trong ca trực." },
  { title: "Mạng lưới phục vụ", text: "Đã và đang đồng hành cùng các khách sạn, khu nghỉ dưỡng cao cấp tại Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Nha Trang, Phú Quốc." },
];

export default function Page() {
  const [fullName, setFullName] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roomScale, setRoomScale] = useState("20-50");
  const [topic, setTopic] = useState("general");
  const [notes, setNotes] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const actionParam = params.get("action");
    const topicParam = params.get("topic");
    if (actionParam === "demo") {
      setIsDemoMode(true);
      setTopic("demo");
    }
    if (topicParam === "kbtt-compliance") {
      setTopic("kbtt-compliance");
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await showSuccessAlert(
      isDemoMode ? "Đã ghi nhận lịch hẹn Demo" : "Đã gửi yêu cầu tư vấn",
      `Cảm ơn ${fullName.trim() || "Quý đối tác"}. Chuyên gia VietSage sẽ liên hệ qua số ${phone.trim()} trong vòng 30 phút làm việc.`,
    );
    setFullName("");
    setHotelName("");
    setPhone("");
    setEmail("");
    setNotes("");
  };

  return (
    <MarketingShell locale="vi" showSceneRail={false}>
      <Hero
        locale="vi"
        eyebrow="Đăng ký trải nghiệm giải pháp VietSage"
        title="Liên hệ VietSage"
        text="Hãy chia sẻ về khách sạn của bạn, đội ngũ chuyên gia của chúng tôi sẽ đồng hành thiết kế lộ trình số hóa vận hành chuẩn xác nhất."
        image="/brand/register-hero.png"
      />

      <section className="px-5 py-12 lg:px-8" id="consultation-form">
        <div className="mx-auto max-w-6xl rounded-3xl border border-[#123d2a]/12 bg-white p-6 shadow-xl sm:p-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <div className="space-y-5 lg:col-span-5">
              <span className="inline-flex items-center rounded-full bg-amber-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-900 border border-amber-200 whitespace-nowrap">
                {isDemoMode ? "Trải nghiệm trực tiếp 1:1" : "Tư vấn giải pháp chuyên sâu"}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#123d2a] leading-tight text-balance">
                {isDemoMode
                  ? "Đặt lịch xem Demo hệ thống VietSage"
                  : "Nhận tư vấn lộ trình chuyển đổi số khách sạn"}
              </h2>
              <p className="text-sm sm:text-base text-[#5c5549] leading-relaxed text-pretty">
                Đội ngũ kỹ sư và chuyên gia vận hành khách sạn VietSage hỗ trợ khảo sát quy mô phòng, tích hợp máy quét CCCD C06 và thiết lập E-Concierge đa ngôn ngữ.
              </p>

              <div className="space-y-3 rounded-2xl border border-[#123d2a]/10 bg-[#fbf9f4] p-5 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">Hotline tư vấn 24/7</p>
                  <a href="tel:1900636800" className="mt-0.5 block text-base font-extrabold text-[#123d2a] hover:underline">
                    1900 636 800 — 0903 889 456
                  </a>
                </div>
                <div className="border-t border-[#123d2a]/10 pt-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">Email hỗ trợ triển khai</p>
                  <a href="mailto:contact@vietsage.vn" className="mt-0.5 block text-sm font-bold text-[#123d2a] hover:underline">
                    contact@vietsage.vn
                  </a>
                </div>
                <div className="border-t border-[#123d2a]/10 pt-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">Văn phòng điều hành</p>
                  <p className="mt-0.5 text-xs font-medium text-[#5c5549] text-pretty">
                    Tòa nhà VietSage Tower, Quận 1, TP. Hồ Chí Minh &amp; Quận Hoàn Kiếm, Hà Nội
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-fullname" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Họ và tên người liên hệ *
                  </label>
                  <input
                    id="contact-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="VD: Nguyễn Văn Minh"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="contact-hotel" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Tên khách sạn / Khu nghỉ dưỡng *
                  </label>
                  <input
                    id="contact-hotel"
                    type="text"
                    required
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    placeholder="VD: Grand Saigon, Soleil Đà Nẵng"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-phone" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Số điện thoại *
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="VD: 0903889456"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Email công việc
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="VD: gm@grandsaigon.vn"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-scale" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Quy mô buồng phòng
                  </label>
                  <select
                    id="contact-scale"
                    value={roomScale}
                    onChange={(e) => setRoomScale(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-semibold text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  >
                    <option value="under-20">Dưới 20 phòng (Boutique / Homestay)</option>
                    <option value="20-50">Từ 20 – 50 phòng</option>
                    <option value="50-150">Từ 50 – 150 phòng</option>
                    <option value="over-150">Trên 150 phòng / Chuỗi lưu trú</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="contact-topic" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                    Nội dung quan tâm chính
                  </label>
                  <select
                    id="contact-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-semibold text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                  >
                    <option value="general">Tư vấn tổng thể PMS &amp; E-Concierge</option>
                    <option value="demo">Đặt lịch xem Demo trực tiếp 1:1</option>
                    <option value="kbtt-compliance">Tự động khai báo lưu trú C06 Bộ Công An</option>
                    <option value="channel-manager">Đồng bộ kênh bán OTA (Channel Manager)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="contact-notes" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#123d2a]">
                  Yêu cầu cụ thể
                </label>
                <textarea
                  id="contact-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Chia sẻ thêm về nhu cầu vận hành hoặc khung giờ thuận tiện để chuyên gia liên hệ..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm font-medium text-slate-900 focus:border-[#123d2a] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] px-8 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:brightness-105 whitespace-nowrap cursor-pointer"
                >
                  {isDemoMode ? "Xác nhận đặt lịch Demo" : "Gửi yêu cầu tư vấn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

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
