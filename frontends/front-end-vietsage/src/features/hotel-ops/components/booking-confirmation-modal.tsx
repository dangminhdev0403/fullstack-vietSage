"use client";

import React, { useCallback, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  GroupConfirmationData,
  ReservationConfirmationData,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type BookingConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  reservationId?: string | null;
  groupCode?: string | null;
  mode?: "single" | "group";
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

export function BookingConfirmationPrintView({
  data,
  mode = "single",
}: BookingConfirmationPrintViewProps) {
  const isGroup = mode === "group" || ("rooms" in data && Array.isArray((data as GroupConfirmationData).rooms));
  const hotel = data.hotel;
  const policies = data.policies;

  const codeValue = isGroup
    ? (data as GroupConfirmationData).group.groupCode
    : (data as ReservationConfirmationData).reservation.reservationCode;

  return (
    <div className="bg-white text-slate-900 font-sans print:p-0 print:m-0 print:w-full print:max-w-none">
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
            <div className="flex items-start gap-4">
              {hotel.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hotel.logoUrl}
                  alt={hotel.name}
                  className="h-16 w-16 object-contain rounded-xl border border-slate-200 p-1"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-blue-900 text-white font-black text-xl tracking-tight">
                  {hotel.code || "VS"}
                </div>
              )}
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight text-balance">
                  {hotel.name}
                </h1>
                <p className="text-xs text-slate-600 text-pretty">
                  {hotel.address}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                  <span>Điện thoại: {hotel.phone}</span>
                  {hotel.email ? <span>Email: {hotel.email}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-200 sm:border-none">
              <div className="text-left sm:text-right">
                <div className="inline-block rounded-lg bg-blue-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap">
                  {isGroup ? "Xác nhận đặt đoàn" : "Phiếu xác nhận đặt phòng"}
                </div>
                <div className="text-xs text-slate-500 pt-1 font-medium">
                  Ngày lập: {formatDateVi(new Date())}
                </div>
              </div>

              <div className="flex flex-col items-center sm:items-end">
                <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={codeValue}
                    size={76}
                    fgColor="#0f172a"
                    bgColor="#ffffff"
                    level="M"
                  />
                </div>
                <span className="text-xs font-black tracking-wider text-slate-900 pt-1 whitespace-nowrap">
                  {codeValue}
                </span>
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
                    <div className="text-slate-500">Giờ chuẩn từ {policies.checkInTime}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày trả phòng:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateTimeVi(res.plannedCheckOutAt)}</strong>
                    <div className="text-slate-500">Trước {policies.checkOutTime}</div>
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
                    <div className="text-slate-500">Nhận phòng từ {policies.checkInTime}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày đi dự kiến:</span>
                    <strong className="text-slate-900 font-semibold">{formatDateVi(grp.checkOutDate)}</strong>
                    <div className="text-slate-500">Trả phòng trước {policies.checkOutTime}</div>
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

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                        <th className="py-2.5 px-4">Đêm lưu trú / Dịch vụ</th>
                        <th className="py-2.5 px-4">Diễn giải</th>
                        <th className="py-2.5 px-4 text-right">Đơn giá</th>
                        <th className="py-2.5 px-4 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pricing.nightlyBreakdown.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 font-semibold text-slate-800">
                            {item.date ? formatDateVi(item.date) : `Đêm ${index + 1}`}
                          </td>
                          <td className="py-2 px-4 text-slate-600">{item.description}</td>
                          <td className="py-2 px-4 text-right text-slate-700">{formatVnd(item.rate)}</td>
                          <td className="py-2 px-4 text-right font-semibold text-slate-900">{formatVnd(item.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal & Balance calculation card */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="text-xs space-y-1.5 max-w-sm">
                    {res.notes ? (
                      <div className="text-slate-600">
                        <strong className="text-slate-800">Ghi chú:</strong> {res.notes}
                      </div>
                    ) : null}
                    <div className="text-slate-500">
                      Giá phòng đã bao gồm các tiện ích tiêu chuẩn theo quy định của khách sạn.
                    </div>
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
                      Tổng số khách: {pricing.totalGuests}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3">STT</th>
                          <th className="py-2.5 px-3">Mã đơn</th>
                          <th className="py-2.5 px-3">Phòng / Hạng phòng</th>
                          <th className="py-2.5 px-3">Khách nhận phòng</th>
                          <th className="py-2.5 px-3 text-center">Số đêm</th>
                          <th className="py-2.5 px-3 text-right">Đơn giá/đêm</th>
                          <th className="py-2.5 px-3 text-right">Thành tiền</th>
                          <th className="py-2.5 px-3 text-right">Đã trả</th>
                          <th className="py-2.5 px-3 text-right">Còn lại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grpData.rooms.map((room, idx) => (
                          <tr key={room.reservationId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{room.reservationCode}</td>
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-900">{room.roomNumber}</span>
                              <span className="text-slate-500 block">{room.roomTypeName}</span>
                            </td>
                            <td className="py-2 px-3 text-slate-800">
                              <span className="font-semibold block">{room.guestDisplayName}</span>
                              {room.guestPhone ? <span className="text-slate-500">{room.guestPhone}</span> : null}
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
                </div>

                {/* Group Summary card */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="text-xs space-y-1.5 max-w-sm">
                    {grpData.group.notes ? (
                      <div className="text-slate-600">
                        <strong className="text-slate-800">Ghi chú đoàn:</strong> {grpData.group.notes}
                      </div>
                    ) : null}
                    <div className="text-slate-500">
                      Bảng giá đoàn áp dụng cho toàn bộ danh sách phòng được xác nhận trong phiếu này.
                    </div>
                  </div>

                  <div className="w-full sm:w-72 space-y-2 text-xs border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Tổng tiền phòng ({pricing.totalRooms} phòng):</span>
                      <span className="font-semibold text-slate-800">{formatVnd(pricing.roomSubtotal)}</span>
                    </div>
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
        <section className="print-break-inside-avoid rounded-xl border border-slate-200 bg-slate-50/40 p-4 mb-8 text-xs text-slate-600 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 uppercase tracking-wide">
            <VsIcon name="info" className="text-base text-blue-800" />
            <span className="text-balance">Chính sách & Quy định nhận phòng</span>
          </div>

          <div className="space-y-1.5 text-pretty">
            <div>
              <strong className="text-slate-800">Thời gian quy định:</strong> Nhận phòng từ {policies.checkInTime} và trả phòng trước {policies.checkOutTime}.
            </div>
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

        {/* Signatures section */}
        <footer className="print-break-inside-avoid border-t border-slate-200 pt-6">
          <div className="grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-12">
              <div>
                <span className="font-bold text-slate-900 block text-balance">Đại diện khách sạn</span>
                <span className="text-slate-500">(Ký và đóng dấu xác nhận)</span>
              </div>
              <div className="text-slate-400 italic">...................................................</div>
            </div>

            <div className="space-y-12">
              <div>
                <span className="font-bold text-slate-900 block text-balance">
                  {isGroup ? "Đại diện đoàn khách" : "Khách hàng"}
                </span>
                <span className="text-slate-500">(Ký và ghi rõ họ tên)</span>
              </div>
              <div className="text-slate-400 italic">...................................................</div>
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 pt-8 border-t border-slate-100 mt-6">
            Cảm ơn quý khách đã tin tưởng và lựa chọn {hotel.name}. Kính chúc quý khách có kỳ lưu trú thoải mái và trọn vẹn!
          </div>
        </footer>
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
  initialData,
}: BookingConfirmationModalProps) {
  const titleId = useId();

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
    staleTime: 60_000,
  });

  const effectiveData = initialData ?? queriedData;

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
                {mode === "group" ? "Phiếu xác nhận đặt phòng đoàn" : "Phiếu xác nhận đặt phòng"}
              </h2>
              <p className="text-xs text-slate-500 text-pretty">
                Xem trước bản in chính thức hoặc tải xuống lưu trữ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || isError || !effectiveData}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-4 py-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <VsIcon name="print" className="text-base" />
              <span>In phiếu / Lưu PDF</span>
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/50">
          {isLoading ? (
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
        <footer className="no-print flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-3.5 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition cursor-pointer whitespace-nowrap"
          >
            <span>Đóng</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading || isError || !effectiveData}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2 shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <VsIcon name="print" className="text-base" />
            <span>In phiếu / Lưu PDF</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
