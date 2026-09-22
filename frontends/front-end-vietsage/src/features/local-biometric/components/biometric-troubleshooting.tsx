"use client";

import React, { useState } from "react";

type GuideItem = {
  id: string;
  title: string;
  category: "HN-212" | "Mobile" | "General";
  steps: string[];
  recommendedFix: string;
};

const TROUBLESHOOTING_GUIDES: GuideItem[] = [
  {
    id: "guide-hn212-offline",
    title: "Máy đọc HN-212 báo Ngoại tuyến hoặc không sáng đèn",
    category: "HN-212",
    steps: [
      "Kiểm tra dây cáp USB kết nối trực tiếp vào cổng USB 3.0 phía sau case máy tính (tránh cắm qua Hub chia cổng không đủ nguồn).",
      "Đảm bảo dịch vụ VietSage Device Daemon đang chạy dưới khay hệ thống Windows (Taskbar Tray) tại cổng localhost:8080.",
      "Bấm nút 'Tạo mã ghép nối' trên màn hình này và nhập mã hiển thị vào máy đọc HN-212.",
    ],
    recommendedFix: "Khởi động lại phần mềm trạm VietSage Daemon hoặc rút cắm lại cáp USB.",
  },
  {
    id: "guide-mobile-camera",
    title: "Camera điện thoại không quét được hoặc báo lỗi quyền truy cập",
    category: "Mobile",
    steps: [
      "Đảm bảo đã cấp quyền 'Cho phép truy cập Camera' trên trình duyệt (Safari đối với iPhone, Chrome đối với Android).",
      "Giữ camera vuông góc với mã QR CCCD ở khoảng cách từ 15 đến 20 cm.",
      "Tránh để ánh đèn trần hoặc ánh sáng mạnh phản chiếu trực tiếp lên bề mặt thẻ gây lóa bóng camera.",
    ],
    recommendedFix: "Bật lại quyền Camera trong Cài đặt > Trình duyệt > Quyền riêng tư.",
  },
  {
    id: "guide-chip-failure",
    title: "Đọc mã QR thành công nhưng không đọc được chip NFC",
    category: "General",
    steps: [
      "Kiểm tra bề mặt tiếp xúc kim loại của chip ở mặt trước thẻ CCCD có bị bụi bẩn hoặc trầy xước không.",
      "Dùng khăn mềm lau nhẹ bề mặt chip rồi áp sát lại vào vùng cảm ứng máy đọc HN-212.",
      "Giữ nguyên thẻ trong ít nhất 2 giây cho đến khi trạm phát tiếng 'Bíp' xác nhận.",
    ],
    recommendedFix: "Nếu chip bị hỏng vật lý, lễ tân có thể quét mã QR mặt sau để lấy dữ liệu thay thế.",
  },
  {
    id: "guide-network-sync",
    title: "Điện thoại và máy tính không đồng bộ dữ liệu quét tức thì",
    category: "Mobile",
    steps: [
      "Đảm bảo điện thoại di động và máy tính lễ tân cùng kết nối vào một mạng Wi-Fi nội bộ của khách sạn.",
      "Kiểm tra điện thoại không bật mạng riêng ảo (VPN / Proxy / 4G) làm gián đoạn kênh WebRTC cục bộ.",
      "Nếu phiên quét bị gián đoạn, bấm 'Tạo QR kết nối điện thoại' để làm mới phiên ghép nối mới.",
    ],
    recommendedFix: "Tắt VPN trên điện thoại và kiểm tra đang vào đúng mạng Wi-Fi Lễ tân.",
  },
];

export function BiometricTroubleshooting() {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "HN-212" | "Mobile">("ALL");

  const filteredGuides = TROUBLESHOOTING_GUIDES.filter((g) => {
    if (selectedCategory === "ALL") return true;
    return g.category === selectedCategory || g.category === "General";
  });

  return (
    <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-100">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-[#735c00]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#00003c]">
              Cẩm nang xử lý sự cố & Chuẩn vận hành Lễ tân
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-stone-500">
              Các biện pháp xử lý nhanh khi đầu đọc không nhận thẻ hoặc mất kết nối tại quầy tiếp tân.
            </p>
          </div>
        </div>

        {/* Category Pills */}
        <div className="inline-flex rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              selectedCategory === "ALL" ? "bg-white text-[#00003c] shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Tất cả (4)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("HN-212")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              selectedCategory === "HN-212" ? "bg-white text-[#00003c] shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Đầu đọc HN-212
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("Mobile")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              selectedCategory === "Mobile" ? "bg-white text-[#00003c] shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Camera Di động
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredGuides.map((guide) => (
          <div
            key={guide.id}
            className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5 transition-all hover:border-stone-300 hover:bg-white"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">
                  !
                </span>
                <h4 className="text-sm sm:text-base font-bold text-stone-900">
                  {guide.title}
                </h4>
              </div>

              <ul className="mt-3 space-y-2 text-xs sm:text-sm text-stone-600">
                {guide.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3">
              <p className="text-xs font-bold text-emerald-900">
                💡 Giải pháp nhanh: <span className="font-normal text-emerald-800">{guide.recommendedFix}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
