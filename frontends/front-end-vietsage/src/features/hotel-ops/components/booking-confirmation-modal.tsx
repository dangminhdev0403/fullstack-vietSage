"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import type {
  ConfirmationHotelInfo,
  GroupConfirmationData,
  HotelConfirmationTemplateConfig,
  ReservationConfirmationData,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type BookingConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  reservationId?: string | null;
  groupCode?: string | null;
  mode?: "single" | "group";
  autoPrint?: boolean;
  canManage?: boolean;
  initialData?: ReservationConfirmationData | GroupConfirmationData | null;
};

export type BookingConfirmationPrintViewProps = {
  data: ReservationConfirmationData | GroupConfirmationData;
  mode?: "single" | "group";
};

function formatVnd(val?: number | string | null): string {
  if (val === null || val === undefined || val === "") return "0 ₫";
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTimeVi(value?: string | Date | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateVi(value?: string | Date | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function mapReservationStatus(status?: string): { label: string; className: string } {
  switch (status) {
    case "CONFIRMED":
      return { label: "Đã xác nhận", className: "bg-blue-50 text-blue-800 border-blue-200" };
    case "ARRIVAL_READY":
      return { label: "Sẵn sàng đón", className: "bg-indigo-50 text-indigo-800 border-indigo-200" };
    case "CHECKED_IN":
      return { label: "Đã nhận phòng", className: "bg-emerald-50 text-emerald-800 border-emerald-200" };
    case "CANCELLED":
      return { label: "Đã hủy", className: "bg-rose-50 text-rose-800 border-rose-200" };
    case "NO_SHOW":
      return { label: "Vắng mặt", className: "bg-slate-100 text-slate-800 border-slate-300" };
    default:
      return { label: "Đặt trước", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function cleanPolicyTime(val?: string | null): string {
  if (!val) return "";
  return val.replace(/\s*\(.*?\)/g, "").trim();
}

const DEFAULT_FOOTER_NOTE = "Cảm ơn quý khách đã tin tưởng và đồng hành cùng khách sạn.";

export function HotelConfirmationTemplateForm({
  hotelId,
  onSaved,
  canManage = true,
  readOnly = false,
  hotel,
  variant = "full",
}: {
  hotelId: string;
  onSaved?: () => void;
  canManage?: boolean;
  readOnly?: boolean;
  hotel?: Readonly<Hotel>;
  variant?: "full" | "modal";
}) {
  const isEditable = canManage && !readOnly;
  const queryClient = useQueryClient();
  const templateQueryOptions = staffRoomsResource.queries.confirmationTemplate.options({ hotelId });
  const { data: templateData, isLoading } = useQuery<HotelConfirmationTemplateConfig | null>({
    ...(templateQueryOptions as any),
  });

  const upsertMutation = useMutation(
    staffRoomsResource.bind({ hotelId }).mutations.upsertConfirmationTemplate.options(),
  );

  const [footerNotes, setFooterNotes] = useState(DEFAULT_FOOTER_NOTE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [previewMode, setPreviewMode] = useState<"single" | "group">("single");

  useEffect(() => {
    if (templateData && !isInitialized) {
      setFooterNotes(templateData.footerNotes || DEFAULT_FOOTER_NOTE);
      setIsInitialized(true);
    } else if (!templateData && !isLoading && !isInitialized) {
      setFooterNotes(DEFAULT_FOOTER_NOTE);
      setIsInitialized(true);
    }
  }, [templateData, isLoading, isInitialized]);

  const handleResetDefaults = () => {
    setFooterNotes(DEFAULT_FOOTER_NOTE);
  };

  const sampleSingleData: ReservationConfirmationData = useMemo(() => {
    const brand = (hotel?.brandSettings as Record<string, any>) || {};
    const hotelInfo: ConfirmationHotelInfo = {
      id: hotel?.id || hotelId,
      name: hotel?.name || "Khách sạn",
      code: hotel?.code || "HOTEL",
      address: (hotel as any)?.address || (brand.address as string) || "",
      phone: (hotel as any)?.phone || (brand.phone as string) || (brand.hotline as string) || "",
      email: (hotel as any)?.email || (brand.email as string) || "",
      logoUrl: (hotel as any)?.logoUrl || (brand.logoUrl as string) || (brand.logo as string) || "/brand/vietsage-mark-white.png",
      checkInTimePolicy: "14:00",
      checkOutTimePolicy: "12:00",
    };

    const sampleTemplate: HotelConfirmationTemplateConfig = {
      title: "PHIẾU XÁC NHẬN ĐẶT PHÒNG",
      subtitle: null,
      contactInfo: null,
      checkInPolicy: "14:00",
      checkOutPolicy: "12:00",
      paymentTerms: null,
      footerNotes: footerNotes.trim() || DEFAULT_FOOTER_NOTE,
      showLogo: true,
      showPriceBreakdown: true,
    };

    return {
      hotel: hotelInfo,
      template: sampleTemplate,
      reservation: {
        id: "demo-res-1",
        reservationCode: "VS-889922",
        groupCode: null,
        status: "CONFIRMED",
        guestDisplayName: "Nguyễn Văn An",
        guestPhone: "0987 654 321",
        guestCount: 2,
        roomType: { id: "rt-1", name: "Deluxe Ocean View", code: "DLX-OV" },
        room: { id: "r-302", roomNumber: "302", floor: "3" },
        plannedCheckInAt: new Date(Date.now() + 86400000).toISOString(),
        plannedCheckOutAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        nights: 2,
        notes: "Khách kỷ niệm ngày cưới, yêu cầu phòng tầng cao và không hút thuốc.",
        createdAt: new Date().toISOString(),
      },
      pricing: {
        nightlyBreakdown: [
          {
            date: new Date(Date.now() + 86400000).toISOString(),
            description: "Đêm 1 - Giá niêm yết tiêu chuẩn phòng",
            rate: 1500000,
            lineType: "NIGHTLY_RATE",
          },
          {
            date: new Date(Date.now() + 86400000 * 2).toISOString(),
            description: "Đêm 2 - Giá niêm yết tiêu chuẩn phòng",
            rate: 1500000,
            lineType: "NIGHTLY_RATE",
          },
        ],
        roomSubtotal: 3000000,
        taxAmount: 240000,
        serviceAmount: 150000,
        discountAmount: 0,
        totalAmount: 3390000,
        paidAmount: 1500000,
        balanceAmount: 1890000,
        currency: "VND",
      },
      policies: {
        checkInTime: "14:00",
        checkOutTime: "12:00",
        cancellationPolicy: "",
        terms: [],
        footerNoteText: footerNotes.trim() || DEFAULT_FOOTER_NOTE,
      },
    };
  }, [hotel, hotelId, footerNotes]);

  const sampleGroupData: GroupConfirmationData = useMemo(() => {
    const brand = (hotel?.brandSettings as Record<string, any>) || {};
    const hotelInfo: ConfirmationHotelInfo = {
      id: hotel?.id || hotelId,
      name: hotel?.name || "Khách sạn",
      code: hotel?.code || "HOTEL",
      address: (hotel as any)?.address || (brand.address as string) || "",
      phone: (hotel as any)?.phone || (brand.phone as string) || (brand.hotline as string) || "",
      email: (hotel as any)?.email || (brand.email as string) || "",
      logoUrl: (hotel as any)?.logoUrl || (brand.logoUrl as string) || (brand.logo as string) || "/brand/vietsage-mark-white.png",
      checkInTimePolicy: "14:00",
      checkOutTimePolicy: "12:00",
    };

    const sampleTemplate: HotelConfirmationTemplateConfig = {
      title: "PHIẾU XÁC NHẬN ĐẶT PHÒNG",
      subtitle: null,
      contactInfo: null,
      checkInPolicy: "14:00",
      checkOutPolicy: "12:00",
      paymentTerms: null,
      footerNotes: footerNotes.trim() || DEFAULT_FOOTER_NOTE,
      showLogo: true,
      showPriceBreakdown: true,
    };

    return {
      hotel: hotelInfo,
      template: sampleTemplate,
      group: {
        groupCode: "GRP-2026-088",
        groupName: "Đoàn Vietravel",
        leadGuestName: "Trần Minh Quân (Đoàn Vietravel)",
        leadGuestPhone: "0918 223 344",
        totalRooms: 3,
        nights: 2,
        checkInDate: new Date(Date.now() + 86400000).toISOString(),
        checkOutDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        notes: "Đoàn yêu cầu các phòng cạnh nhau và ăn sáng cùng giờ.",
      },
      rooms: [
        {
          reservationId: "res-grp-1",
          reservationCode: "VS-G01",
          guestDisplayName: "Trần Minh Quân",
          guestPhone: "0918 223 344",
          guestCount: 2,
          roomNumber: "201",
          floor: "2",
          roomTypeName: "Deluxe King",
          plannedCheckInAt: new Date(Date.now() + 86400000).toISOString(),
          plannedCheckOutAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          nights: 2,
          nightlyRate: 1400000,
          roomSubtotal: 2800000,
          paidAmount: 2800000,
          balanceAmount: 0,
          status: "CONFIRMED",
        },
        {
          reservationId: "res-grp-2",
          reservationCode: "VS-G02",
          guestDisplayName: "Lê Thu Hà",
          guestPhone: "0909 112 233",
          guestCount: 2,
          roomNumber: "202",
          floor: "2",
          roomTypeName: "Deluxe Twin",
          plannedCheckInAt: new Date(Date.now() + 86400000).toISOString(),
          plannedCheckOutAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          nights: 2,
          nightlyRate: 1400000,
          roomSubtotal: 2800000,
          paidAmount: 1400000,
          balanceAmount: 1400000,
          status: "CONFIRMED",
        },
        {
          reservationId: "res-grp-3",
          reservationCode: "VS-G03",
          guestDisplayName: "Phạm Hải Đăng",
          guestPhone: "0934 556 677",
          guestCount: 1,
          roomNumber: "203",
          floor: "2",
          roomTypeName: "Superior King",
          plannedCheckInAt: new Date(Date.now() + 86400000).toISOString(),
          plannedCheckOutAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          nights: 2,
          nightlyRate: 1200000,
          roomSubtotal: 2400000,
          paidAmount: 0,
          balanceAmount: 2400000,
          status: "CONFIRMED",
        },
      ],
      pricing: {
        totalRooms: 3,
        totalGuests: 5,
        totalAmount: 8000000,
        paidAmount: 4200000,
        balanceAmount: 3800000,
        roomSubtotal: 8000000,
        taxAmount: 0,
        serviceAmount: 0,
        discountAmount: 0,
        currency: "VND",
      },
      policies: {
        checkInTime: "14:00",
        checkOutTime: "12:00",
        cancellationPolicy: "",
        terms: [],
        footerNoteText: footerNotes.trim() || DEFAULT_FOOTER_NOTE,
      },
    };
  }, [hotel, hotelId, footerNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable) {
      await showErrorAlert(
        "Không có quyền thao tác",
        "Bạn không có quyền cập nhật mẫu phiếu xác nhận đặt phòng.",
      );
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        title: "PHIẾU XÁC NHẬN ĐẶT PHÒNG",
        subtitle: null,
        contactInfo: null,
        checkInPolicy: null,
        checkOutPolicy: null,
        paymentTerms: null,
        footerNotes: footerNotes.trim() || null,
        showLogo: true,
        showPriceBreakdown: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["hotelOps", hotelId] });
      await showSuccessAlert(
        "Lưu mẫu thành công",
        "Đã cập nhật mẫu phiếu xác nhận của khách sạn.",
      );
      onSaved?.();
    } catch (err: unknown) {
      await showErrorAlert(
        "Lỗi lưu mẫu phiếu",
        err instanceof Error ? err.message : "Không thể lưu cài đặt mẫu phiếu.",
      );
    }
  };

  if (isLoading && !isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-900 border-t-transparent" />
        <span className="text-xs font-semibold">Đang tải cấu hình mẫu phiếu...</span>
      </div>
    );
  }

  const isFullStudio = variant === "full";

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-700">
      {/* Alert Banners */}
      {!isEditable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3 text-amber-900 shadow-2xs">
          <VsIcon name="lock" className="text-lg shrink-0 text-amber-700 mt-0.5" />
          <div>
            <p className="font-bold text-xs text-balance">Chế độ chỉ xem cấu hình</p>
            <p className="text-xs text-amber-800 text-pretty mt-0.5">
              Bạn không có quyền (hotel.reservations.manage) để cập nhật mẫu phiếu xác nhận.
            </p>
          </div>
        </div>
      )}

      {/* Thông tin chuẩn hóa tóm tắt */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <VsIcon name="verified" className="text-base text-blue-900 shrink-0" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider text-balance">
            Quy chuẩn phiếu xác nhận
          </h3>
        </div>
        <p className="text-xs text-slate-600 text-pretty leading-relaxed">
          Tiêu đề phiếu được cố định theo chuẩn <strong className="text-slate-900 font-semibold">PHIẾU XÁC NHẬN ĐẶT PHÒNG</strong>. Thông tin khách sạn (logo, hotline, email, địa chỉ) lấy từ mục <strong className="text-slate-900 font-semibold">Thông tin khách sạn</strong>. Khung giờ nhận/trả phòng và bảng giá được nạp tự động theo từng đơn đặt phòng thực tế.
        </p>
      </div>

      {/* Khối cấu hình: Lời cảm ơn / Thông điệp chân trang */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5 shadow-2xs">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <VsIcon name="notes" className="text-base" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 text-balance">
              Lời cảm ơn / Thông điệp chân trang
            </h3>
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-800 mb-1.5">
            Thông điệp kết thúc phiếu gửi khách
          </label>
          <textarea
            rows={3}
            disabled={!isEditable}
            value={footerNotes}
            onChange={(e) => setFooterNotes(e.target.value)}
            placeholder="Cảm ơn quý khách đã tin tưởng và đồng hành cùng khách sạn."
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 transition focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100 disabled:text-slate-500 resize-none"
          />
          {isEditable ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-xs text-slate-500 font-medium">Gợi ý câu:</span>
              <button
                type="button"
                onClick={() => setFooterNotes("Cảm ơn quý khách đã tin tưởng và đồng hành cùng khách sạn.")}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-900 transition cursor-pointer whitespace-nowrap"
              >
                Cảm ơn quý khách đã tin tưởng và đồng hành cùng khách sạn.
              </button>
              <button
                type="button"
                onClick={() => setFooterNotes("Kính chúc quý khách có kỳ nghỉ thoải mái và trọn vẹn!")}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-900 transition cursor-pointer whitespace-nowrap"
              >
                Kính chúc quý khách có kỳ nghỉ thoải mái và trọn vẹn!
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Form Action Controls */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          {isEditable ? (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <VsIcon name="restart_alt" className="text-base text-slate-500" />
              <span>Khôi phục mẫu chuẩn</span>
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {onSaved ? (
            <button
              type="button"
              onClick={onSaved}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <span>{isEditable ? "Hủy bỏ" : "Đóng"}</span>
            </button>
          ) : null}

          {isEditable ? (
            <button
              type="submit"
              disabled={upsertMutation.isPending}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-blue-900 px-6 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <VsIcon name="save" className="text-base" />
              <span>{upsertMutation.isPending ? "Đang lưu cấu hình..." : "Lưu mẫu phiếu"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );

  const previewContent = (
    <div className="space-y-4 w-full">
      {/* Preview Control Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <VsIcon name="visibility" className="text-base" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-900 text-balance">Bản xem trước trực tiếp</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Thời gian thực
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setPreviewMode("single")}
              className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                previewMode === "single"
                  ? "bg-white text-blue-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Đặt đơn lẻ
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("group")}
              className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                previewMode === "group"
                  ? "bg-white text-blue-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Đặt theo đoàn
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap min-h-[34px]"
            title="In thử hoặc lưu PDF"
          >
            <VsIcon name="print" className="text-base" />
            <span>In thử</span>
          </button>
        </div>
      </div>

      {/* A4 Paper Document Canvas */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-100/70 p-3 sm:p-6 shadow-inner overflow-x-auto">
        <div className="mx-auto max-w-3xl transform-gpu transition-all">
          <BookingConfirmationPrintView
            data={previewMode === "single" ? sampleSingleData : sampleGroupData}
            mode={previewMode}
          />
        </div>
      </div>

      <div className="flex items-center justify-end text-xs text-slate-500 px-1">
        <span className="font-semibold text-slate-600 whitespace-nowrap">Khổ in tiêu chuẩn A4</span>
      </div>
    </div>
  );

  if (!isFullStudio) {
    return formContent;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <div className="xl:col-span-5 min-w-0">{formContent}</div>
      <div className="xl:col-span-7 min-w-0 sticky top-6">{previewContent}</div>
    </div>
  );
}

export function BookingConfirmationPrintView({
  data,
  mode = "single",
}: BookingConfirmationPrintViewProps) {
  const isGroup = mode === "group" || ("rooms" in data && Array.isArray((data as GroupConfirmationData).rooms));
  const hotel = data.hotel;
  const policies = data.policies;
  const template = data.template;

  const codeValue = isGroup
    ? (data as GroupConfirmationData).group.groupCode
    : (data as ReservationConfirmationData).reservation.reservationCode;

  const titleText = template?.title || (isGroup ? "Xác nhận đặt đoàn" : "Phiếu xác nhận đặt phòng");
  const displayLogo = template?.showLogo !== false;
  const showPriceBreakdown = template?.showPriceBreakdown !== false;
  const footerNote = template?.footerNotes || policies.footerNoteText;

  return (
    <div className="text-slate-900 font-sans print:bg-white print:p-0 print:m-0 print:w-full print:max-w-none">
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print,
          nav,
          header:not(.print-header),
          aside,
          button {
            display: none !important;
          }
          .print-full-page {
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="print-full-page max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {/* Header: Hotel info & Confirmation title */}
        <header className="print-header border-b border-slate-200 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {displayLogo ? (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hotel.logoUrl || "/brand/vietsage-mark-white.png"}
                    alt={hotel.name || "VietSage"}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="space-y-1 min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight text-balance">
                  {hotel.name}
                </h1>
                {template?.subtitle ? (
                  <p className="text-xs text-blue-900 font-semibold italic text-pretty">
                    {template.subtitle}
                  </p>
                ) : null}
                {hotel.address && !hotel.address.includes("Địa chỉ khách sạn") ? (
                  <p className="text-xs text-slate-600 text-pretty">
                    {hotel.address}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium pt-0.5">
                  {hotel.phone && !hotel.phone.includes("Số điện thoại liên hệ") ? (
                    <span className="inline-block whitespace-nowrap">Điện thoại: {hotel.phone}</span>
                  ) : null}
                  {hotel.email && !hotel.email.includes("Email liên hệ") ? (
                    <span className="inline-block whitespace-nowrap">Email: {hotel.email}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-200 sm:border-none shrink-0">
              <div className="text-left sm:text-right">
                <div className="inline-block rounded-lg bg-blue-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap">
                  {titleText}
                </div>
                <div className="text-xs text-slate-500 pt-1 font-medium whitespace-nowrap">
                  Ngày lập: {formatDateVi(new Date())}
                </div>
              </div>

              <div className="flex flex-col items-center sm:items-end gap-1.5 pt-0.5">
                <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={codeValue}
                    size={72}
                    fgColor="#0f172a"
                    bgColor="#ffffff"
                    level="M"
                  />
                </div>
                <div className="text-center sm:text-right">
                  <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">
                    Mã xác nhận
                  </span>
                  <span className="font-mono text-sm font-black tracking-wider text-slate-900 whitespace-nowrap">
                    {codeValue}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Guest & Reservation details overview */}
        <section className="print-break-inside-avoid rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3 text-balance">
            {isGroup ? "Thông tin đại diện đoàn" : "Thông tin khách & Đặt phòng"}
          </h2>

          {!isGroup ? (
            (() => {
              const res = (data as ReservationConfirmationData).reservation;
              const statusObj = mapReservationStatus(res.status);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Khách đại diện:</span>
                    <strong className="text-sm font-bold text-slate-900">{res.guestDisplayName}</strong>
                    {res.guestPhone ? <div className="text-slate-600">{res.guestPhone}</div> : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày nhận phòng:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateTimeVi(res.plannedCheckInAt)}</strong>
                    {policies.checkInTime ? (
                      <div className="text-slate-500">Giờ nhận: {cleanPolicyTime(policies.checkInTime)}</div>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày trả phòng:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateTimeVi(res.plannedCheckOutAt)}</strong>
                    {policies.checkOutTime ? (
                      <div className="text-slate-500">Giờ trả: {cleanPolicyTime(policies.checkOutTime)}</div>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Thời gian lưu trú:</span>
                    <strong className="text-slate-900 font-semibold">{res.nights} đêm · {res.guestCount} khách</strong>
                    <div>
                      <span className={`inline-block px-2 py-0.5 mt-1 rounded-md text-xs font-bold border whitespace-nowrap ${statusObj.className}`}>
                        {statusObj.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const grp = (data as GroupConfirmationData).group;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Tên đoàn / Trưởng đoàn:</span>
                    <strong className="text-sm font-bold text-slate-900">{grp.leadGuestName}</strong>
                    {grp.leadGuestPhone ? <div className="text-slate-600">{grp.leadGuestPhone}</div> : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày đến dự kiến:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateVi(grp.checkInDate)}</strong>
                    {policies.checkInTime ? (
                      <div className="text-slate-500">Giờ nhận: {cleanPolicyTime(policies.checkInTime)}</div>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày đi dự kiến:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateVi(grp.checkOutDate)}</strong>
                    {policies.checkOutTime ? (
                      <div className="text-slate-500">Giờ trả: {cleanPolicyTime(policies.checkOutTime)}</div>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Quy mô đoàn:</span>
                    <strong className="text-slate-900 font-semibold">{grp.totalRooms} phòng · {grp.nights} đêm</strong>
                    <div className="text-slate-500">Mã đoàn: {grp.groupCode}</div>
                  </div>
                </div>
              );
            })()
          )}
        </section>

        {/* Room & Pricing details */}
        {!isGroup ? (
          (() => {
            const resData = data as ReservationConfirmationData;
            const res = resData.reservation;
            const pricing = resData.pricing;

            return (
              <section className="print-break-inside-avoid space-y-4 mb-6">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Phòng gán: {res.room ? `Phòng ${res.room.roomNumber}` : "Chưa gán phòng"} ({res.roomType?.name || "Hạng tiêu chuẩn"})
                    </span>
                    <span className="text-xs text-slate-600 font-medium">
                      Thời lượng: {res.nights} đêm
                    </span>
                  </div>

                  {showPriceBreakdown ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2.5 px-4 w-12 text-center">STT</th>
                          <th className="py-2.5 px-4">Ngày lưu trú</th>
                          <th className="py-2.5 px-4">Diễn giải</th>
                          <th className="py-2.5 px-4 text-right">Đơn giá</th>
                          <th className="py-2.5 px-4 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pricing.nightlyBreakdown.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-center text-slate-500">{index + 1}</td>
                            <td className="py-2 px-4 font-semibold text-slate-800">
                              {item.date ? formatDateVi(item.date) : `Đêm ${index + 1}`}
                            </td>
                            <td className="py-2 px-4 text-slate-600">
                              Đêm {index + 1} {res.room ? `— P.${res.room.roomNumber}` : ""}
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-slate-700">{formatVnd(item.rate)}</td>
                            <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{formatVnd(item.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">Giá phòng trọn gói ({res.nights} đêm):</span>
                      <span className="text-sm font-bold text-slate-900">{formatVnd(pricing.roomSubtotal)}</span>
                    </div>
                  )}
                </div>

                {/* Prebooked Services Breakdown */}
                {pricing.serviceBreakdown && pricing.serviceBreakdown.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Dịch vụ & Tiện ích đặt trước ({pricing.serviceBreakdown.length} mục)
                      </span>
                      <span className="text-xs font-bold text-emerald-800 font-mono">
                        {formatVnd(pricing.serviceAmount)}
                      </span>
                    </div>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2 px-4 w-12 text-center">STT</th>
                          <th className="py-2 px-4">Tên dịch vụ</th>
                          <th className="py-2 px-4 text-center">Số lượng</th>
                          <th className="py-2 px-4 text-right">Đơn giá</th>
                          <th className="py-2 px-4 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pricing.serviceBreakdown.map((svc, sIdx) => (
                          <tr key={sIdx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-center text-slate-500">{sIdx + 1}</td>
                            <td className="py-2 px-4 font-semibold text-slate-800">{svc.name}</td>
                            <td className="py-2 px-4 text-center text-slate-700">{svc.quantity}</td>
                            <td className="py-2 px-4 text-right font-mono text-slate-700">{formatVnd(svc.unitPrice)}</td>
                            <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{formatVnd(svc.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* Subtotal & Balance calculation card */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="text-xs space-y-1.5 max-w-sm">
                    {res.notes ? (
                      <div className="text-slate-600">
                        <strong className="text-slate-800">Ghi chú:</strong> {res.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full sm:w-72 space-y-2 text-xs border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Tiền phòng:</span>
                      <span className="font-semibold text-slate-800">{formatVnd(pricing.roomSubtotal)}</span>
                    </div>
                    {pricing.serviceAmount > 0 ? (
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Phụ thu / Dịch vụ:</span>
                        <span className="font-semibold text-slate-800">{formatVnd(pricing.serviceAmount)}</span>
                      </div>
                    ) : null}
                    {pricing.taxAmount > 0 ? (
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Thuế VAT:</span>
                        <span className="font-semibold text-slate-800">{formatVnd(pricing.taxAmount)}</span>
                      </div>
                    ) : null}
                    {pricing.discountAmount > 0 ? (
                      <div className="flex justify-between items-center text-emerald-700">
                        <span>Chiết khấu / Ưu đãi:</span>
                        <span className="font-semibold">-{formatVnd(pricing.discountAmount)}</span>
                      </div>
                    ) : null}
                    <div className="border-t border-slate-200 pt-2 flex justify-between items-center font-bold text-slate-900">
                      <span className="text-sm">Tổng thanh toán:</span>
                      <span className="text-sm text-blue-900 font-black">{formatVnd(pricing.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-800 font-semibold">
                      <span>Đã đặt cọc / Thanh toán:</span>
                      <span>{formatVnd(pricing.paidAmount)}</span>
                    </div>
                    <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-sm font-black text-rose-800">
                      <span>Số tiền còn lại:</span>
                      <span className="text-base">{formatVnd(pricing.balanceAmount)}</span>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()
        ) : (
          (() => {
            const grpData = data as GroupConfirmationData;
            const pricing = grpData.pricing;

            return (
              <section className="print-break-inside-avoid space-y-4 mb-6">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Danh sách phòng đặt theo đoàn ({grpData.rooms.length} phòng)
                    </span>
                    <span className="text-xs text-slate-600 font-medium">
                      Thời lượng lưu trú: {grpData.group.nights} đêm
                    </span>
                  </div>

                  {showPriceBreakdown ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                            <th className="py-2.5 px-3">STT</th>
                            <th className="py-2.5 px-3">Phòng / Hạng</th>
                            <th className="py-2.5 px-3">Khách nhận</th>
                            <th className="py-2.5 px-3 text-center">Đêm</th>
                            <th className="py-2.5 px-3 text-right">Đơn giá</th>
                            <th className="py-2.5 px-3 text-right">Tiền phòng</th>
                            <th className="py-2.5 px-3 text-right">Đã trả</th>
                            <th className="py-2.5 px-3 text-right">Còn lại</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grpData.rooms.map((room, idx) => (
                            <tr key={room.reservationId} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                              <td className="py-2 px-3">
                                <span className="font-bold text-slate-900">{room.roomNumber}</span>
                                <span className="text-slate-500 block">{room.roomTypeName}</span>
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                {room.guestDisplayName}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700">{room.nights}</td>
                              <td className="py-2 px-3 text-right text-slate-700">{formatVnd(room.nightlyRate)}</td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-900">{formatVnd(room.roomSubtotal)}</td>
                              <td className="py-2 px-3 text-right text-emerald-700">{formatVnd(room.paidAmount)}</td>
                              <td className="py-2 px-3 text-right font-semibold text-rose-700">{formatVnd(room.balanceAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">Tổng quy mô đoàn ({grpData.rooms.length} phòng · {grpData.group.nights} đêm):</span>
                      <span className="text-sm font-bold text-slate-900">{formatVnd(pricing.roomSubtotal)}</span>
                    </div>
                  )}
                </div>

                {/* Group Services Breakdown */}
                {pricing.serviceBreakdown && pricing.serviceBreakdown.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Dịch vụ & Tiện ích đoàn ({pricing.serviceBreakdown.length} mục)
                      </span>
                      <span className="text-xs font-bold text-emerald-800 font-mono">
                        {formatVnd(pricing.serviceAmount)}
                      </span>
                    </div>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2 px-4 w-12 text-center">STT</th>
                          <th className="py-2 px-4">Tên dịch vụ</th>
                          <th className="py-2 px-4 text-center">Số lượng</th>
                          <th className="py-2 px-4 text-right">Đơn giá</th>
                          <th className="py-2 px-4 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pricing.serviceBreakdown.map((svc, sIdx) => (
                          <tr key={sIdx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-center text-slate-500">{sIdx + 1}</td>
                            <td className="py-2 px-4 font-semibold text-slate-800">{svc.name}</td>
                            <td className="py-2 px-4 text-center text-slate-700">{svc.quantity}</td>
                            <td className="py-2 px-4 text-right font-mono text-slate-700">{formatVnd(svc.unitPrice)}</td>
                            <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{formatVnd(svc.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* Group Summary card */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="text-xs space-y-1.5 max-w-sm">
                    {grpData.group.notes ? (
                      <div className="text-slate-600">
                        <strong className="text-slate-800">Ghi chú đoàn:</strong> {grpData.group.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full sm:w-72 space-y-2 text-xs border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Tổng tiền phòng ({pricing.totalRooms} phòng):</span>
                      <span className="font-semibold text-slate-800">{formatVnd(pricing.roomSubtotal)}</span>
                    </div>
                    {pricing.serviceAmount > 0 ? (
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Phụ thu / Dịch vụ đoàn:</span>
                        <span className="font-semibold text-slate-800">{formatVnd(pricing.serviceAmount)}</span>
                      </div>
                    ) : null}
                    {pricing.taxAmount > 0 ? (
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Thuế VAT:</span>
                        <span className="font-semibold text-slate-800">{formatVnd(pricing.taxAmount)}</span>
                      </div>
                    ) : null}
                    {pricing.discountAmount > 0 ? (
                      <div className="flex justify-between items-center text-emerald-700">
                        <span>Chiết khấu / Ưu đãi:</span>
                        <span className="font-semibold">-{formatVnd(pricing.discountAmount)}</span>
                      </div>
                    ) : null}
                    <div className="border-t border-slate-200 pt-2 flex justify-between items-center font-bold text-slate-900">
                      <span className="text-sm">Tổng cộng tiền đoàn:</span>
                      <span className="text-sm text-blue-900 font-black">{formatVnd(pricing.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-800 font-semibold">
                      <span>Tổng tiền đã cọc/trả:</span>
                      <span>{formatVnd(pricing.paidAmount)}</span>
                    </div>
                    <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-sm font-black text-rose-800">
                      <span>Số tiền còn lại cần thu:</span>
                      <span className="text-base">{formatVnd(pricing.balanceAmount)}</span>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()
        )}

        {/* Policies and guidelines */}
        {policies?.cancellationPolicy || (policies?.terms && policies.terms.length > 0) ? (
          <section className="print-break-inside-avoid rounded-xl border border-slate-200 bg-slate-50/40 p-4 mb-6 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 uppercase tracking-wide">
              <VsIcon name="info" className="text-base text-blue-800" />
              <span className="text-balance">Chính sách & Quy định nhận phòng</span>
            </div>

            <div className="space-y-1 text-pretty">
              {policies.cancellationPolicy ? (
                <div>
                  <strong className="text-slate-800">Chính sách hủy phòng:</strong> {policies.cancellationPolicy}
                </div>
              ) : null}
              {policies.terms && policies.terms.length > 0 ? (
                <ul className="list-disc list-inside space-y-1 text-slate-600 pt-1">
                  {policies.terms.map((term, i) => (
                    <li key={i}>{term}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Footer: Thank you note (only if configured by tenant) */}
        {footerNote ? (
          <footer className="print-break-inside-avoid border-t border-slate-200 pt-6 text-center text-xs text-slate-600 font-medium italic text-pretty">
            {footerNote}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function BookingConfirmationModal({
  isOpen,
  onClose,
  hotelId,
  reservationId,
  groupCode,
  mode = "single",
  autoPrint = false,
  canManage = true,
  initialData,
}: BookingConfirmationModalProps) {
  const titleId = useId();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const shouldQuery = isOpen && !initialData && Boolean(reservationId || groupCode);

  const baseConfirmationOptions =
    mode === "group"
      ? staffRoomsResource.queries.groupConfirmation.options({
          hotelId,
          groupCode: groupCode ?? "",
        })
      : staffRoomsResource.queries.reservationConfirmation.options({
          hotelId,
          reservationId: reservationId ?? "",
        });

  const {
    data: queriedData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ReservationConfirmationData | GroupConfirmationData>({
    ...(baseConfirmationOptions as any),
    enabled: shouldQuery,
    staleTime: 30_000,
  });

  const effectiveData = initialData ?? queriedData;

  useEffect(() => {
    if (autoPrint && effectiveData && isOpen && !isLoading) {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, effectiveData, isOpen, isLoading]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print:flex"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Screen-only Modal Header */}
        <header className="no-print flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
              <VsIcon name="receipt_long" className="text-lg" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900 text-balance">
                {isConfigOpen
                  ? "Cài đặt mẫu phiếu xác nhận"
                  : mode === "group"
                    ? "Phiếu xác nhận đặt phòng đoàn"
                    : "Phiếu xác nhận đặt phòng"}
              </h2>
              <p className="text-xs text-slate-500 text-pretty">
                {isConfigOpen
                  ? "Tùy chỉnh thông tin và chính sách hiển thị trên phiếu xuất của khách sạn"
                  : "Xem trước bản in chính thức hoặc tải xuống lưu trữ gửi khách"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConfigOpen((prev) => !prev)}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs px-3.5 py-2 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            >
              <VsIcon name={isConfigOpen ? "visibility" : "tune"} className="text-base text-slate-600" />
              <span>{isConfigOpen ? "Xem trước phiếu" : "Tùy chỉnh mẫu"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Đóng"
            >
              <VsIcon name="close" className="text-base" />
            </button>
          </div>
        </header>

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-12 sm:pb-16 bg-slate-100/50">
          {isConfigOpen ? (
            <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <HotelConfirmationTemplateForm
                hotelId={hotelId}
                canManage={canManage}
                variant="modal"
                onSaved={() => {
                  setIsConfigOpen(false);
                  void refetch();
                }}
              />
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-slate-500">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-800 border-t-transparent" />
              <span className="text-xs font-semibold">Đang tạo dữ liệu phiếu xác nhận...</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <VsIcon name="error" className="text-2xl" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 text-balance">
                Không thể tải phiếu xác nhận
              </h3>
              <p className="text-xs text-slate-500 max-w-md text-pretty">
                {error instanceof Error ? error.message : "Đã xảy ra sự cố khi tải dữ liệu từ máy chủ."}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-800 cursor-pointer min-h-[36px]"
              >
                <span>Thử lại</span>
              </button>
            </div>
          ) : effectiveData ? (
            <BookingConfirmationPrintView data={effectiveData} mode={mode} />
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              Không có dữ liệu đặt phòng hợp lệ.
            </div>
          )}
        </div>

        {/* Screen-only Modal Footer */}
        <footer className="no-print flex items-center justify-between border-t border-slate-200 px-6 py-3.5 bg-slate-50/80 shrink-0">
          <div className="text-xs text-slate-500">
            {isConfigOpen ? (
              <span>Cài đặt mẫu sẽ áp dụng cho tất cả phiếu xuất của khách sạn</span>
            ) : (
              <span>Có thể in trực tiếp ra giấy hoặc lưu dưới dạng PDF để gửi khách</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <span>Đóng</span>
            </button>
            {!isConfigOpen ? (
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || isError || !effectiveData}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2 shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <VsIcon name="print" className="text-base" />
                <span>In phiếu / Lưu PDF</span>
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
