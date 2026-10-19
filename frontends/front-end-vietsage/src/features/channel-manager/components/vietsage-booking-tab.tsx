"use client";

import { useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

interface VietSageBookingTabProps {
  hotelId: string;
  hotelName: string;
  hotelCode: string;
  tenantName: string;
}

export function VietSageBookingTab({
  hotelId,
  hotelName,
  hotelCode,
  tenantName,
}: VietSageBookingTabProps) {
  const [copied, setCopied] = useState(false);
  const otaUrl = "https://vietsage-booking.localhost";
  const partnerRoomsUrl = "https://vietsage-booking.localhost/partner/rooms";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(partnerRoomsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner / Channel Status Card */}
      <div className="rounded-2xl border border-[#e5dcd0] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#24473d] text-[#e8b363] shadow-xs">
              <VsIcon name="shopping_bag" className="text-2xl" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-[#17201b]">
                  Kênh phân phối trực tiếp VietSage OTA
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200 whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Sẵn sàng kết nối
                </span>
              </div>
              <p className="text-xs text-[#69726b]">
                Kênh bán phòng trực tuyến tự vận hành dành riêng cho {hotelName} ({hotelCode}). Hỗ trợ đồng bộ tự động loại phòng, giá sàn và quỹ phòng tức thời.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={partnerRoomsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-10 inline-flex items-center gap-2 rounded-xl bg-[#24473d] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#1b362e] focus:outline-none focus:ring-2 focus:ring-[#24473d]/30 whitespace-nowrap"
            >
              <span>Mở quản trị phòng OTA</span>
              <VsIcon name="open_in_new" className="text-sm" />
            </a>
          </div>
        </div>
      </div>

      {/* Connection Info & Architecture Details */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e5dcd0] bg-[#fbf8f2] p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#24473d]">
            <VsIcon name="dns" className="text-base text-[#e8b363]" />
            <span>Điểm cuối kết nối</span>
          </div>
          <p className="font-mono text-xs font-semibold text-[#17201b] break-all">
            {otaUrl}
          </p>
          <p className="text-xs text-[#69726b]">
            Cổng quản trị đối tác và sàn thương mại điện tử du lịch.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e5dcd0] bg-[#fbf8f2] p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#24473d]">
            <VsIcon name="verified_user" className="text-base text-emerald-600" />
            <span>Bảo mật liên thông</span>
          </div>
          <p className="text-xs font-semibold text-[#17201b]">
            HMAC SHA-256 + Email Đối tác
          </p>
          <p className="text-xs text-[#69726b]">
            Khách sạn được định danh an toàn theo email duy nhất, bảo vệ quyền riêng tư.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e5dcd0] bg-[#fbf8f2] p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#24473d]">
            <VsIcon name="sync_alt" className="text-base text-blue-600" />
            <span>Xuất danh mục phòng 1-Click</span>
          </div>
          <p className="text-xs font-semibold text-emerald-700">
            Kích hoạt sẵn sàng
          </p>
          <p className="text-xs text-[#69726b]">
            Tự động tải loại phòng, số lượng phòng thực tế và giá cơ sở từ PMS.
          </p>
        </div>
      </div>

      {/* Step by Step Workflow Guide */}
      <div className="rounded-2xl border border-[#e5dcd0] bg-white p-6 space-y-4 shadow-xs">
        <h4 className="text-sm font-bold text-[#17201b]">
          Quy trình nhập phòng tự động sang sàn Booking OTA
        </h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#e8dfd1] p-4 space-y-2 bg-[#fcfaf7]">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#24473d] text-xs font-bold text-white">
                1
              </span>
              <span className="text-xs font-bold text-[#17201b]">Liên kết cơ sở</span>
            </div>
            <p className="text-xs text-[#69726b]">
              Đăng nhập trang quản trị Kênh Booking bằng tài khoản đối tác ({tenantName}). Khách sạn đã được kích hoạt tự động theo email đối tác.
            </p>
          </div>

          <div className="rounded-xl border border-[#e8dfd1] p-4 space-y-2 bg-[#fcfaf7]">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#24473d] text-xs font-bold text-white">
                2
              </span>
              <span className="text-xs font-bold text-[#17201b]">Nhập nhanh danh mục</span>
            </div>
            <p className="text-xs text-[#69726b]">
              Vào mục <strong className="text-[#17201b]">Quản lý phòng</strong> trên Kênh Booking, bấm nút <strong className="text-[#24473d]">"Nhập phòng từ VietSage PMS"</strong> để xem trước danh sách phòng.
            </p>
          </div>

          <div className="rounded-xl border border-[#e8dfd1] p-4 space-y-2 bg-[#fcfaf7]">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                3
              </span>
              <span className="text-xs font-bold text-[#17201b]">Đồng bộ & Bán phòng</span>
            </div>
            <p className="text-xs text-[#69726b]">
              Chọn các hạng phòng muốn bán, bấm <strong className="text-[#17201b]">Xác nhận nhập</strong>. Toàn bộ thông tin giá, sức chứa và tiện nghi sẽ được tạo lập tức thời.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#f0eae1]">
          <span className="text-xs text-[#69726b]">
            Đường dẫn quản lý nhanh danh mục phòng: <code className="bg-gray-100 px-2 py-0.5 rounded text-gray-800">{partnerRoomsUrl}</code>
          </span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8cfc0] bg-white px-3 py-1.5 text-xs font-semibold text-[#17201b] hover:bg-[#fbf8f2] transition"
          >
            <VsIcon name={copied ? "check" : "content_copy"} className="text-sm text-emerald-700" />
            <span>{copied ? "Đã sao chép!" : "Sao chép liên kết"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
