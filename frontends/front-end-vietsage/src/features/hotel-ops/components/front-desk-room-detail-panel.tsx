"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
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

  const [showAllServices, setShowAllServices] = useState(false);
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

  const visibleServices = showAllServices ? serviceItems : serviceItems.slice(0, 5);

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
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-0 flex justify-end pointer-events-none">
        <div
          ref={panelRef}
          className="pointer-events-auto flex flex-col w-full h-full sm:max-w-lg bg-white shadow-2xl border-l border-slate-200 text-slate-900 overflow-hidden transition-transform animate-in slide-in-from-right duration-200"
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-xl font-extrabold tracking-tight text-slate-900">
                  Phòng {roomNumberDisplay}
                </h2>
                {isOverdue ? (
                  <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-black text-white uppercase tracking-wider">
                    Quá hạn
                  </span>
                ) : isOccupiedMode ? (
                  <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-950 uppercase tracking-wider">
                    Đang ở
                  </span>
                ) : isReservedMode ? (
                  <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
                    Đặt trước
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
                    {room.status || "Trống"}
                  </span>
                )}
              </div>
              <p id={descId} className="text-xs font-medium text-slate-500 mt-0.5">
                {room.type ?? "Tiêu chuẩn"} {room.floor ? `· Tầng ${room.floor}` : ""}{" "}
                {businessDate ? `· Ngày: ${businessDate}` : ""}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết phòng"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition cursor-pointer min-h-[44px]"
            >
              <VsIcon name="close" className="text-2xl" />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Semantic Overdue Warning */}
            {isOverdue && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
                <div className="flex items-center gap-2 font-black text-sm text-red-800">
                  <VsIcon name="warning" className="text-lg text-red-600 shrink-0 animate-bounce" />
                  <span>Cảnh báo quá hạn trả phòng</span>
                </div>
                <p className="mt-1 text-xs text-red-900 leading-relaxed">
                  Lượt lưu trú đã quá hạn dự kiến{" "}
                  <strong>{formatDateTime(stay?.plannedCheckOutAt)}</strong>. Vui lòng rà soát
                  dịch vụ và hướng dẫn khách hoàn tất thanh toán hoặc gia hạn thời gian lưu trú.
                </p>
              </div>
            )}

            {/* OCCUPIED / OVERDUE STAY CONTEXT */}
            {isOccupiedMode && stay && (
              <>
                {/* Guest & Stay Snapshot */}
                <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Thông tin khách & Lưu trú
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Khách đại diện:</span>
                      <span className="font-extrabold text-slate-900">
                        {stay.guestDisplayName || "Chưa rõ"}
                      </span>
                    </div>
                    {stay.guestPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Số điện thoại:</span>
                        <span className="font-medium text-slate-900">{stay.guestPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Mã đặt phòng / lưu trú:</span>
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded">
                        {stay.reservationCode || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                      <span className="text-slate-600">Nhận phòng thực tế:</span>
                      <span className="font-bold text-slate-900">
                        {stay.checkedInAt
                          ? formatDateTime(stay.checkedInAt)
                          : formatDateTime(stay.plannedCheckInAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Trả phòng dự kiến:</span>
                      <span
                        className={`font-bold ${isOverdue ? "text-red-700" : "text-slate-900"}`}
                      >
                        {formatDateTime(stay.plannedCheckOutAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Số đêm lưu trú:</span>
                      <span className="font-medium text-slate-900">
                        {calculateNights(
                          stay.checkedInAt ?? stay.plannedCheckInAt,
                          stay.plannedCheckOutAt,
                        )}{" "}
                        đêm
                      </span>
                    </div>
                  </div>

                  {/* Extra occupants */}
                  {extraOccupants.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/70">
                      <p className="text-xs font-bold text-slate-600 mb-2">
                        Khách ở cùng ({extraOccupants.length} người):
                      </p>
                      <div className="space-y-1.5">
                        {extraOccupants.map((occ, idx) => (
                          <div
                            key={occ.id || idx}
                            className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200"
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
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Hóa đơn & Dịch vụ phát sinh
                      </h3>
                      {folioContext?.folio && (
                        <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          {folioContext.folio.status || "OPEN"}
                        </span>
                      )}
                    </div>

                    {isFolioLoading ? (
                      <div className="space-y-2 py-3" aria-busy="true">
                        <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
                        <div className="h-10 bg-slate-100 rounded-lg animate-pulse mt-2" />
                      </div>
                    ) : isFolioError ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                        <p className="font-bold">Không thể tải thông tin thanh toán & dịch vụ.</p>
                        <p className="mt-0.5 text-amber-800">
                          {folioError instanceof Error
                            ? folioError.message
                            : "Vui lòng thử lại sau giây lát."}
                        </p>
                        <button
                          type="button"
                          onClick={() => void refetchFolio()}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer transition min-h-[36px]"
                        >
                          <VsIcon name="refresh" className="text-sm" />
                          <span>Thử lại</span>
                        </button>
                      </div>
                    ) : !folioContext?.folio ? (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center text-xs text-slate-600">
                        Chưa có folio đang mở cho lượt lưu trú này.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Summary breakdown */}
                        <div className="rounded-lg bg-slate-50 p-3 space-y-1.5 text-xs">
                          {folioContext.summary?.estimatedRoomCharge && (
                            <div className="flex justify-between text-slate-700">
                              <span>
                                Tiền phòng (
                                {folioContext.summary.estimatedRoomCharge.nights} đêm):
                              </span>
                              <span className="font-semibold">
                                {formatVnd(folioContext.summary.estimatedRoomCharge.subtotal)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-700">
                            <span>Dịch vụ đã ghi ({activeServices.length} mục):</span>
                            <span className="font-semibold">
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
                              <span>Giảm giá / Ưu đãi:</span>
                              <span className="font-semibold">
                                -{formatVnd(folioContext.summary?.discount)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                            <span>Tổng tạm tính:</span>
                            <span className="text-emerald-700">
                              {formatVnd(folioContext.summary?.total ?? folioContext.folio.total)}
                            </span>
                          </div>
                        </div>

                        {/* Unresolved Service Requests Warning */}
                        {Boolean(
                          folioContext.summary?.activeServiceRequests &&
                            folioContext.summary.activeServiceRequests.length > 0,
                        ) && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                            <p className="font-bold flex items-center gap-1 text-amber-900">
                              <VsIcon name="info" className="text-sm shrink-0" />
                              <span>
                                Có {folioContext.summary?.activeServiceRequests?.length} yêu cầu
                                dịch vụ chưa quyết toán
                              </span>
                            </p>
                            <p className="mt-0.5 text-amber-800">
                              Các yêu cầu chưa hoàn tất không được tự động tính vào hóa đơn. Vui lòng
                              rà soát trước khi đóng lượt lưu trú.
                            </p>
                          </div>
                        )}

                        {/* Service Lines List */}
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-2">
                            Chi tiết dịch vụ ({serviceItems.length}):
                          </p>
                          {serviceItems.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">
                              Chưa có dịch vụ nào phát sinh.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {visibleServices.map((item) => {
                                const isVoided = Boolean(
                                  item.voidedAt || item.status === "VOIDED",
                                );
                                return (
                                  <div
                                    key={item.id}
                                    className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                                      isVoided
                                        ? "bg-slate-100 border-slate-200 text-slate-400 line-through"
                                        : "bg-white border-slate-200 text-slate-900"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                      <span className="truncate font-medium">
                                        {item.nameSnapshot}
                                      </span>
                                      {item.quantity > 1 && (
                                        <span className="shrink-0 text-slate-500">
                                          x{item.quantity}
                                        </span>
                                      )}
                                      {isVoided && (
                                        <span className="shrink-0 text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                          Đã hủy
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={`font-semibold shrink-0 ${
                                        isVoided ? "text-slate-400" : "text-slate-900"
                                      }`}
                                    >
                                      {formatVnd(item.totalSnapshot)}
                                    </span>
                                  </div>
                                );
                              })}

                              {serviceItems.length > 5 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllServices((prev) => !prev)}
                                  className="w-full text-center text-xs font-bold text-blue-700 hover:text-blue-900 py-1 cursor-pointer"
                                >
                                  {showAllServices
                                    ? "Thu gọn"
                                    : `Xem tất cả (${serviceItems.length} dịch vụ)`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                ) : null}
              </>
            )}

            {/* RESERVED MODE CONTEXT */}
            {isReservedMode && reservation && (
              <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Thông tin Đặt trước
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Khách đặt phòng:</span>
                    <span className="font-extrabold text-slate-900">
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
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded">
                      {reservation.reservationCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Trạng thái:</span>
                    <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                      {reservation.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
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
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-sm font-extrabold text-slate-900">
                      <span>Dự kiến tiền phòng:</span>
                      <span className="text-emerald-700">
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

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
                  Phòng chưa check-in. Chưa có hóa đơn folio hoặc dịch vụ phát sinh.
                </div>
              </section>
            )}
          </div>

          {/* Sticky Bottom Actions Bar (Touch target >= 44px) */}
          <footer className="border-t border-slate-200 p-4 bg-slate-50 shrink-0 space-y-2">
            {isOccupiedMode && (
              <>
                {canViewBilling && (canCheckoutBilling || canCheckOutStay) && (
                  <button
                    type="button"
                    onClick={handleGoToCheckout}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer min-h-[44px]"
                  >
                    <VsIcon name="receipt_long" className="text-lg" />
                    <span>Rà soát trả phòng (Billing)</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {onOpenQrPreview && (
                    <button
                      type="button"
                      onClick={() => onOpenQrPreview(room)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs transition cursor-pointer min-h-[44px]"
                    >
                      <VsIcon name="qr_code_2" className="text-base text-slate-600" />
                      <span>Xem QR GuestOS</span>
                    </button>
                  )}
                  {canManageStays && onExtendStay && (
                    <button
                      type="button"
                      onClick={() => onExtendStay(room)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs transition cursor-pointer min-h-[44px]"
                    >
                      <VsIcon name="schedule" className="text-base text-slate-600" />
                      <span>Gia hạn lưu trú</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {isReservedMode && reservation && (
              <>
                {isToday && canCheckInStay && onCheckInReservation ? (
                  <button
                    type="button"
                    disabled={isCheckingIn}
                    onClick={() => void handleExecuteCheckIn()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer min-h-[44px]"
                  >
                    <VsIcon name="login" className="text-lg" />
                    <span>{isCheckingIn ? "Đang nhận phòng..." : "Nhận phòng (Check-in)"}</span>
                  </button>
                ) : (
                  <div className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 text-slate-700 text-xs font-bold border border-slate-300">
                    <span>Lịch đặt tương lai — Đến vào ngày nhận</span>
                  </div>
                )}
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
