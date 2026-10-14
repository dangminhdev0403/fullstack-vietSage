"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showSuccessAlert } from "@/libs/swal";
import { filterExtraOccupants } from "@/features/hotel-ops/utils/hotel-ops-display";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  HotelReservationSummary,
  HotelRoomSummary,
  HotelStaySummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import type { FolioItem } from "@/features/billing/types/billing-contract";

export type FrontDeskRoomDetailPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  room: HotelRoomSummary | null;
  businessDate?: string | null;
  isHousekeeping?: boolean;
  canViewBilling?: boolean;
  canCheckoutBilling?: boolean;
  canManageStays?: boolean;
  canCheckOutStay?: boolean;
  canCheckInStay?: boolean;
  onOpenQrPreview?: (room: HotelRoomSummary) => void;
  onExtendStay?: (room: HotelRoomSummary) => void;
  onCheckInReservation?: (reservationId: string, arrival?: unknown) => Promise<void>;
  triggerElementRef?: React.RefObject<HTMLElement | null>;
};

function formatDateTime(value?: string | Date | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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

function calculateNights(start?: string | Date | null, end?: string | Date | null): number {
  if (!start || !end) return 1;
  const d1 = new Date(start).getTime();
  const d2 = new Date(end).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 <= d1) return 1;
  const nights = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return Math.max(1, nights);
}

export function FrontDeskRoomDetailPanel({
  isOpen,
  onClose,
  hotelId,
  room,
  businessDate,
  isHousekeeping = false,
  canViewBilling = false,
  canCheckoutBilling = false,
  canManageStays = false,
  canCheckOutStay = false,
  canCheckInStay = false,
  onOpenQrPreview,
  onExtendStay,
  onCheckInReservation,
  triggerElementRef,
}: FrontDeskRoomDetailPanelProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const [serviceSearch, setServiceSearch] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [nowTimestamp] = useState(() => Date.now());

  const todayYmd = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  const isFutureDate = Boolean(businessDate && businessDate > todayYmd);
  const isToday = !businessDate || businessDate === todayYmd;

  // Determine stay context (current or projected)
  const stay: HotelStaySummary | null =
    room?.projectedStay || room?.activeStay || null;

  // Determine reservation context
  const reservation: HotelReservationSummary | null =
    room?.projectedReservation || null;

  // Determine mode
  const effectiveStatus = (
    isFutureDate && room?.projectedStatus ? room.projectedStatus : room?.status || ""
  ).toUpperCase();

  const isOverdue = Boolean(
    stay &&
      !stay.checkedOutAt &&
      stay.plannedCheckOutAt &&
      new Date(stay.plannedCheckOutAt).getTime() < nowTimestamp &&
      ["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes((stay.status || "").toUpperCase()),
  );

  const isOccupiedMode =
    isOverdue ||
    effectiveStatus === "OCCUPIED" ||
    (Boolean(stay) && effectiveStatus !== "RESERVED");

  const isReservedMode = !isOccupiedMode && (effectiveStatus === "RESERVED" || Boolean(reservation));

  const activeReservationCode = isOccupiedMode
    ? stay?.reservationCode
    : isReservedMode
      ? reservation?.reservationCode
      : null;


  // Lazy Folio Query: Only enabled when panel is open, room is occupied/overdue, and user has billing view capability
  const stayId = stay?.id || "";
  const {
    data: folioContext,
    isLoading: isFolioLoading,
    isError: isFolioError,
    error: folioError,
    refetch: refetchFolio,
  } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.stayFolio.options(stayId),
    enabled: Boolean(isOpen && canViewBilling && stayId && isOccupiedMode),
    staleTime: 10_000,
  });

  // Keyboard and focus management
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Initial focus on open and return focus on close
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
    const triggerEl = triggerElementRef?.current;
    return () => {
      triggerEl?.focus();
    };
  }, [isOpen, triggerElementRef]);

  // Service item lines
  const folioItems = folioContext?.items;
  const serviceItems: FolioItem[] = useMemo(() => {
    if (!folioItems) return [];
    return folioItems.filter((item) => item.itemType === "SERVICE");
  }, [folioItems]);

  const activeServices = useMemo(
    () => serviceItems.filter((item) => !item.voidedAt && item.status !== "VOIDED"),
    [serviceItems],
  );

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return serviceItems;
    const term = serviceSearch.trim().toLowerCase();
    return serviceItems.filter((item) =>
      (item.nameSnapshot || "").toLowerCase().includes(term),
    );
  }, [serviceItems, serviceSearch]);

  const stayOccupants = stay?.occupants;
  const extraOccupants = useMemo(() => {
    if (!stayOccupants || !stay) return [];
    return filterExtraOccupants(stayOccupants, stay);
  }, [stayOccupants, stay]);

  const roomNumberDisplay = room?.roomNumber || room?.id || "";

  // Safe Checkout navigation to Billing workspace
  function handleGoToCheckout() {
    const params = new URLSearchParams();
    if (room?.roomNumber) params.set("roomNumber", room.roomNumber);
    if (room?.id) params.set("roomId", room.id);
    if (stay?.id) params.set("stayId", stay.id);
    onClose();
    router.push(`/hotels/${encodeURIComponent(hotelId)}/billing?${params.toString()}`);
  }

  async function handleExecuteCheckIn() {
    if (!reservation?.id || !onCheckInReservation) return;
    setIsCheckingIn(true);
    try {
      await onCheckInReservation(reservation.id, reservation);
      onClose();
    } finally {
      setIsCheckingIn(false);
    }
  }

  // If housekeeping, this panel is completely hidden
  if (isHousekeeping || !room || !isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="my-auto flex flex-col w-full max-w-4xl lg:max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4.5 bg-slate-50 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id={titleId} className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                Phòng {roomNumberDisplay}
              </h2>
              {activeReservationCode ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-mono text-xs sm:text-sm font-black text-blue-900 shadow-2xs">
                  <span>#{activeReservationCode}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeReservationCode) {
                        void navigator.clipboard.writeText(activeReservationCode);
                        void showSuccessAlert(
                          "Đã sao chép",
                          `Mã đặt phòng #${activeReservationCode} đã được sao chép vào bộ nhớ tạm.`,
                        );
                      }
                    }}
                    className="inline-flex items-center text-blue-600 hover:text-blue-950 transition cursor-pointer"
                    title="Sao chép mã đặt phòng"
                    aria-label="Sao chép mã đặt phòng"
                  >
                    <VsIcon name="content_copy" className="text-xs" />
                  </button>
                </span>
              ) : null}
              {isOverdue ? (
                <span className="rounded-lg bg-rose-50 text-rose-700 border border-rose-300 px-3 py-1 text-sm font-black uppercase tracking-wider">
                  Quá hạn trả
                </span>
              ) : isOccupiedMode ? (
                <span className="rounded-lg bg-sky-50 text-sky-800 border border-sky-300 px-3 py-1 text-sm font-black uppercase tracking-wider">
                  Đang ở
                </span>
              ) : isReservedMode ? (
                <span className="rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-sm font-black uppercase tracking-wider">
                  Đặt trước
                </span>
              ) : (
                <span className="rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-sm font-black uppercase tracking-wider">
                  {room.status || "Trống"}
                </span>
              )}
            </div>
            <p id={descId} className="text-sm font-bold text-slate-600 mt-1">
              {room.type ?? "Tiêu chuẩn"} {room.floor ? `· Tầng ${room.floor}` : ""}{" "}
              {businessDate ? `· Ngày: ${businessDate}` : ""}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết phòng"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer min-h-[44px]"
          >
            <VsIcon name="close" className="text-2xl" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Semantic Overdue Warning */}
          {isOverdue && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs sm:text-sm text-rose-900 font-medium shadow-2xs">
              <VsIcon name="warning" className="text-base text-rose-600 shrink-0" />
              <span>
                Lượt lưu trú đã quá hạn trả phòng. Vui lòng rà soát dịch vụ và hướng dẫn khách hoàn tất thanh toán hoặc gia hạn thời gian lưu trú.
              </span>
            </div>
          )}

          {/* OCCUPIED / OVERDUE STAY CONTEXT */}
          {isOccupiedMode && stay && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {/* Guest & Stay Snapshot */}
              <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                    <VsIcon name="person" className="text-slate-600 text-lg" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                      Thông tin khách & Lưu trú
                    </h3>
                  </div>
                  <div className="space-y-3 text-base">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Khách đại diện:</span>
                      <span className="font-black text-slate-900 text-lg">
                        {stay.guestDisplayName || "Chưa rõ"}
                      </span>
                    </div>
                    {stay.guestPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-600">Số điện thoại:</span>
                        <span className="font-bold text-slate-900">{stay.guestPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                      <span className="text-sm font-semibold text-slate-600">Nhận phòng thực tế:</span>
                      <span className="font-black text-slate-900">
                        {stay.checkedInAt
                          ? formatDateTime(stay.checkedInAt)
                          : formatDateTime(stay.plannedCheckInAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Trả phòng dự kiến:</span>
                      <span
                        className={`font-black ${isOverdue ? "text-red-700" : "text-slate-900"}`}
                      >
                        {formatDateTime(stay.plannedCheckOutAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Số đêm lưu trú:</span>
                      <span className="font-black text-slate-900">
                        {calculateNights(
                          stay.checkedInAt ?? stay.plannedCheckInAt,
                          stay.plannedCheckOutAt,
                        )}{" "}
                        đêm
                      </span>
                    </div>
                  </div>
                </div>

                {/* Extra occupants */}
                {extraOccupants.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200/70">
                    <p className="text-xs font-bold text-slate-600 mb-2">
                      Khách ở cùng ({extraOccupants.length} người):
                    </p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {extraOccupants.map((occ, idx) => (
                        <div
                          key={occ.id || idx}
                          className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200"
                        >
                          <span className="font-medium text-slate-900">{occ.fullName}</span>
                          <span className="text-slate-500 font-mono">
                            {occ.phone || occ.identityNumber || "Khách phụ"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* FOLIO & BILLABLE SERVICES */}
              {canViewBilling ? (
                <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <VsIcon name="receipt" className="text-slate-600 text-xl" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Hóa đơn & Dịch vụ phát sinh
                      </h3>
                    </div>
                    {folioContext?.folio && (
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                        {folioContext.folio.status === "OPEN" ? "ĐANG MỞ" : folioContext.folio.status === "CLOSED" ? "ĐÃ ĐÓNG" : (folioContext.folio.status || "ĐANG MỞ")}
                      </span>
                    )}
                  </div>

                  {isFolioLoading ? (
                    <div className="space-y-2.5 py-4" aria-busy="true">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
                      <div className="h-10 bg-slate-100 rounded-lg animate-pulse mt-2" />
                    </div>
                  ) : isFolioError ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                      <p className="font-bold">Không thể tải thông tin thanh toán & dịch vụ.</p>
                      <p className="mt-0.5 text-amber-800">
                        {folioError instanceof Error
                          ? folioError.message
                          : "Vui lòng thử lại sau giây lát."}
                      </p>
                      <button
                        type="button"
                        onClick={() => void refetchFolio()}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer transition min-h-[44px]"
                      >
                        <VsIcon name="refresh" className="text-sm" />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  ) : !folioContext?.folio ? (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-5 text-center text-sm text-slate-600 font-medium">
                      Chưa có hóa đơn đang mở cho lượt lưu trú này.
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col space-y-3.5">
                      {/* Summary breakdown */}
                      <div className="rounded-xl bg-slate-50 p-4 space-y-2.5 text-sm">
                        {folioContext.summary?.estimatedRoomCharge && (
                          <div className="flex justify-between text-slate-700">
                            <span className="font-medium">
                              Tiền phòng (
                              {folioContext.summary.estimatedRoomCharge.nights} đêm):
                            </span>
                            <span className="font-bold text-slate-900">
                              {formatVnd(folioContext.summary.estimatedRoomCharge.subtotal)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-700">
                          <span className="font-medium">Dịch vụ đã ghi ({activeServices.length} mục):</span>
                          <span className="font-bold text-slate-900">
                            {formatVnd(
                              activeServices.reduce(
                                (sum, i) => sum + Number(i.totalSnapshot || 0),
                                0,
                              ),
                            )}
                          </span>
                        </div>
                        {Number(folioContext.summary?.discount ?? 0) > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span className="font-medium">Giảm giá / Ưu đãi:</span>
                            <span className="font-bold">
                              -{formatVnd(folioContext.summary?.discount)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-black text-slate-900 pt-2.5 border-t border-slate-200">
                          <span>Tổng tạm tính:</span>
                          <span className="text-emerald-700 text-lg sm:text-xl font-black">
                            {formatVnd(folioContext.summary?.total ?? folioContext.folio.total)}
                          </span>
                        </div>
                      </div>

                      {/* Unresolved Service Requests Warning */}
                      {Boolean(
                        folioContext.summary?.activeServiceRequests &&
                          folioContext.summary.activeServiceRequests.length > 0,
                      ) && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                          <p className="font-bold flex items-center gap-1.5 text-amber-900">
                            <VsIcon name="info" className="text-sm shrink-0" />
                            <span>
                              Có {folioContext.summary?.activeServiceRequests?.length} yêu cầu
                              dịch vụ chưa quyết toán
                            </span>
                          </p>
                          <p className="mt-1 text-amber-800">
                            Các yêu cầu chưa hoàn tất không được tự động tính vào hóa đơn. Vui lòng
                            rà soát trước khi đóng lượt lưu trú.
                          </p>
                        </div>
                      )}

                      {/* Service Lines List */}
                      <div className="flex-1 flex flex-col min-h-0 space-y-2.5 pt-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black uppercase tracking-wider text-slate-700">
                              Chi tiết dịch vụ
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                              {serviceItems.length}
                            </span>
                          </div>
                          {activeServices.length > 0 && (
                            <span className="text-xs font-bold text-emerald-700">
                              {formatVnd(
                                activeServices.reduce(
                                  (sum, i) => sum + Number(i.totalSnapshot || 0),
                                  0,
                                ),
                              )}
                            </span>
                          )}
                        </div>

                        {serviceItems.length === 0 ? (
                          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center min-h-[140px]">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
                              <VsIcon name="room_service" className="text-xl" />
                            </div>
                            <p className="text-sm font-bold text-slate-700">
                              Chưa có dịch vụ nào phát sinh
                            </p>
                            <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
                              Các dịch vụ phòng, ăn uống hoặc tiện ích phát sinh trong quá trình lưu trú sẽ tự động hiển thị tại đây.
                            </p>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col min-h-0 space-y-2">
                            {serviceItems.length > 5 && (
                              <div className="relative">
                                <VsIcon
                                  name="search"
                                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none"
                                />
                                <input
                                  type="text"
                                  value={serviceSearch}
                                  onChange={(e) => setServiceSearch(e.target.value)}
                                  placeholder="Tìm dịch vụ theo tên..."
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                                />
                                {serviceSearch && (
                                  <button
                                    type="button"
                                    onClick={() => setServiceSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                  >
                                    <VsIcon name="close" className="text-xs" />
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                              <div className="max-h-56 sm:max-h-60 overflow-y-auto divide-y divide-slate-100">
                                {filteredServices.length === 0 ? (
                                  <div className="py-6 px-4 text-center text-xs text-slate-500">
                                    Không tìm thấy dịch vụ nào khớp với từ khóa &ldquo;{serviceSearch}&rdquo;.
                                  </div>
                                ) : (
                                  filteredServices.map((item) => {
                                    const isVoided = Boolean(
                                      item.voidedAt || item.status === "VOIDED",
                                    );
                                    return (
                                      <div
                                        key={item.id}
                                        className={`flex items-center justify-between px-3.5 py-2.5 text-xs transition-colors hover:bg-slate-50/80 ${
                                          isVoided
                                            ? "bg-slate-50/60 text-slate-400 line-through"
                                            : "text-slate-800"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                                          <span className="truncate font-medium">{item.nameSnapshot}</span>
                                          {item.quantity > 1 && (
                                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                                              x{item.quantity}
                                            </span>
                                          )}
                                          {isVoided && (
                                            <span className="shrink-0 text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                              Đã hủy
                                            </span>
                                          )}
                                        </div>
                                        <span
                                          className={`font-bold shrink-0 tabular-nums ${
                                            isVoided ? "text-slate-400" : "text-slate-900"
                                          }`}
                                        >
                                          {formatVnd(item.totalSnapshot)}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* Footer count & link */}
                              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs">
                                <span className="text-slate-500 font-medium">
                                  {serviceSearch ? `${filteredServices.length} / ${serviceItems.length} kết quả` : `${serviceItems.length} dịch vụ phát sinh`}
                                </span>
                                {serviceItems.length > 5 && (
                                  <Link
                                    href={`/hotels/${encodeURIComponent(hotelId)}/billing?stayId=${encodeURIComponent(stay.id)}&roomId=${encodeURIComponent(room?.id || "")}&roomNumber=${encodeURIComponent(room?.roomNumber || "")}`}
                                    className="font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 transition"
                                  >
                                    <span>Chi tiết Folio</span>
                                    <VsIcon name="arrow_forward" className="text-xs" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          )}

          {/* RESERVED MODE CONTEXT */}
          {isReservedMode && reservation && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                    <VsIcon name="event" className="text-blue-600 text-lg" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                      Thông tin Đặt trước
                    </h3>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Khách đặt phòng:</span>
                      <span className="font-extrabold text-slate-900 text-base">
                        {reservation.guestDisplayName || "Chưa rõ"}
                      </span>
                    </div>
                    {reservation.guestPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Số điện thoại:</span>
                        <span className="font-medium text-slate-900">{reservation.guestPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Mã đặt phòng:</span>
                      <span className="font-mono text-sm font-bold text-slate-800 bg-slate-200 px-2.5 py-0.5 rounded">
                        {reservation.reservationCode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Trạng thái:</span>
                      <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded text-xs">
                        {reservation.status}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                    <VsIcon name="calendar_month" className="text-slate-500 text-lg" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                      Lịch lưu trú & Chi phí dự kiến
                    </h3>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Thời gian nhận phòng:</span>
                      <span className="font-bold text-slate-900">
                        {formatDateTime(reservation.plannedCheckInAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Thời gian trả phòng:</span>
                      <span className="font-bold text-slate-900">
                        {formatDateTime(reservation.plannedCheckOutAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Số đêm:</span>
                      <span className="font-medium text-slate-900">
                        {calculateNights(
                          reservation.plannedCheckInAt,
                          reservation.plannedCheckOutAt,
                        )}{" "}
                        đêm
                      </span>
                    </div>
                    {reservation.nightlyRateSnapshot && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Giá phòng snapshot:</span>
                        <span className="font-bold text-slate-900">
                          {formatVnd(reservation.nightlyRateSnapshot)} / đêm
                        </span>
                      </div>
                    )}
                    {reservation.nightlyRateSnapshot && (
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70 text-base font-black text-slate-900">
                        <span>Dự kiến tiền phòng:</span>
                        <span className="text-emerald-700 text-lg font-black">
                          {formatVnd(
                            Number(reservation.nightlyRateSnapshot) *
                              calculateNights(
                                reservation.plannedCheckInAt,
                                reservation.plannedCheckOutAt,
                              ),
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-xl border border-blue-200/80 bg-blue-50/60 p-5 text-center text-sm font-medium text-blue-900 min-h-[100px]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 mb-1.5">
                    <VsIcon name="info" className="text-base" />
                  </div>
                  <p className="font-bold text-slate-800">Chưa phát sinh dịch vụ</p>
                  <p className="mt-0.5 text-xs text-slate-600 max-w-xs">
                    Phòng đang ở trạng thái đặt trước. Chưa có hóa đơn hoặc dịch vụ phát sinh.
                  </p>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Bottom Actions Bar (Horizontal for Desktop, touch target >= 44px) */}
        <footer className="border-t border-slate-200 px-6 py-4 bg-slate-50 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {isOccupiedMode && (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                {onOpenQrPreview && (
                  <button
                    type="button"
                    onClick={() => onOpenQrPreview(room)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[46px]"
                  >
                    <VsIcon name="qr_code_2" className="text-lg text-slate-700" />
                    <span>Xem QR GuestOS</span>
                  </button>
                )}
                {canManageStays && onExtendStay && (
                  <button
                    type="button"
                    onClick={() => onExtendStay(room)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[46px]"
                  >
                    <VsIcon name="schedule" className="text-lg text-slate-700" />
                    <span>Gia hạn lưu trú</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-5 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[46px]"
                >
                  <span>Đóng</span>
                </button>
                {canViewBilling && (canCheckoutBilling || canCheckOutStay) && (
                  <button
                    type="button"
                    onClick={handleGoToCheckout}
                    className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#00003c] via-[#091540] to-[#172554] hover:from-[#0a0f30] hover:to-[#1e3a8a] px-6 py-2.5 text-white font-black text-sm sm:text-base shadow-md shadow-blue-950/20 border border-blue-900/50 transition active:scale-[0.98] cursor-pointer min-h-[46px]"
                  >
                    <VsIcon name="receipt_long" className="text-xl text-amber-300 shrink-0" />
                    <span className="tracking-wide">Rà soát trả phòng & thanh toán</span>
                  </button>
                )}
              </div>
            </>
          )}

          {isReservedMode && reservation && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <VsIcon name="info" className="text-lg text-blue-600 shrink-0" />
                <span>Đã khóa phòng theo mã đặt #{reservation.reservationCode}</span>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-5 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[46px]"
                >
                  <span>Đóng</span>
                </button>
                {isToday && canCheckInStay && onCheckInReservation ? (
                  <button
                    type="button"
                    disabled={isCheckingIn}
                    onClick={() => void handleExecuteCheckIn()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 px-6 py-2.5 text-white font-black text-sm sm:text-base shadow-md transition active:scale-[0.98] cursor-pointer min-h-[46px]"
                  >
                    <VsIcon name="login" className="text-lg" />
                    <span>{isCheckingIn ? "Đang nhận phòng..." : "Nhận phòng"}</span>
                  </button>
                ) : (
                  <div className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-slate-200/80 px-4 py-2 text-slate-800 text-sm font-bold border border-slate-300">
                    <span>Lịch đặt tương lai — Đến vào ngày nhận</span>
                  </div>
                )}
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
