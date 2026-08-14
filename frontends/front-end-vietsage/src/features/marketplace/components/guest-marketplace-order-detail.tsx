"use client";

import { useEffect } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { formatGuestDateTime } from "@/features/guest-os/utils/guest-os-display";
import { GUEST_REQUEST_REALTIME_BROWSER_EVENT } from "@/features/request-realtime/guest-request-realtime-notifier";
import { printMarketplaceVoucherTicket } from "../utils/print-voucher";
import type { MarketplaceOrder } from "../types/marketplace-contract";
import { useGuestMarketplaceOrder } from "../queries/use-guest-marketplace";
import { getServicePricingUnit, formatQuantityWithUnit } from "../utils/marketplace-unit";

type GuestMarketplaceOrderDetailProps = {
  order?: MarketplaceOrder | null;
  orderId?: string;
  sessionToken: string;
  isOpen?: boolean;
  onClose?: () => void;
  onBackToMarketplace?: () => void;
};

function getGuestOrderStatusBadge(status: string, t: (key: string) => string): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return { label: t("requests.statusPending"), className: "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]" };
    case "CONFIRMED":
    case "PROCESSING":
    case "ACCEPTED":
    case "PREPARING":
    case "DELIVERING":
    case "READY":
      return { label: t("requests.statusConfirmed"), className: "bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]" };
    case "COMPLETED":
      return { label: t("requests.completed"), className: "bg-[#e7f4eb] text-[#16562c] border-[#bde2c7]" };
    case "CANCELLED":
    case "REJECTED":
      return { label: t("requests.cancelled"), className: "bg-[#ffe4e6] text-[#9f1239] border-[#fecdd3]" };
    default:
      return { label: status, className: "bg-[#f2efe9] text-[#46534b] border-[#e5ddcd]" };
  }
}

export function GuestMarketplaceOrderDetail({
  order: initialOrder,
  orderId,
  sessionToken,
  isOpen = true,
  onClose,
  onBackToMarketplace,
}: GuestMarketplaceOrderDetailProps) {
  const { t, intlLocale } = useGuestI18n();

  const activeOrderId = initialOrder?.id || orderId;
  const orderQuery = useGuestMarketplaceOrder(sessionToken, activeOrderId);

  const order = orderQuery.data || initialOrder;

  // Refetch live when real-time event received
  useEffect(() => {
    const handleRealtime = () => {
      if (activeOrderId) {
        void orderQuery.refetch();
      }
    };
    window.addEventListener(GUEST_REQUEST_REALTIME_BROWSER_EVENT, handleRealtime);
    return () => window.removeEventListener(GUEST_REQUEST_REALTIME_BROWSER_EVENT, handleRealtime);
  }, [activeOrderId, orderQuery]);

  if (!isOpen) return null;

  if (!order && orderQuery.isPending) {
    return (
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      >
        <div className="w-full max-w-lg rounded-[2.2rem] bg-white p-8 text-center space-y-4">
          <div className="size-12 animate-spin rounded-full border-4 border-[#25483f] border-t-transparent mx-auto" />
          <p className="font-bold text-[#18211d]">{t("common.wait")}</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      >
        <div className="w-full max-w-lg rounded-[2.2rem] bg-white p-7 text-center space-y-4">
          <VsIcon name="error" className="mx-auto text-4xl text-red-500" />
          <h3 className="text-lg font-bold text-[#18211d]">Không tìm thấy đơn dịch vụ</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#25483f] px-6 text-sm font-bold text-white"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = getGuestOrderStatusBadge(order.status, t);
  const providerName = order.serviceTenant?.serviceProfile?.displayName || t("marketplace.providerFallback");
  const totalAmountNum = typeof order.totalAmount === "number" ? order.totalAmount : Number(order.totalAmount);
  const orderUnit = getServicePricingUnit(order, t);

  const handlePrint = () => {
    if (!order.voucher?.voucherNumber) return;
    printMarketplaceVoucherTicket({
      voucherCode: order.voucher.voucherNumber,
      verificationCode: order.voucher.verificationCode ?? "VS-VERIFY",
      guestDisplayName: order.stay?.guestDisplayName ?? "Khách lưu trú",
      roomNumber: order.stay?.room?.roomNumber ?? "-",
      providerDisplayName: providerName,
      orderNumber: order.orderNumber,
      serviceName: order.serviceNameSnapshot,
      quantity: order.quantity,
      totalAmount: totalAmountNum,
      currency: order.currency || "VND",
      guestNote: order.guestNote,
    });
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[2.2rem] bg-white shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[#fbf9f4] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#25483f] text-white">
              <VsIcon name="receipt_long" className="text-xl text-[#d7bd61]" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">
                {t("marketplace.orderDetail")}
              </p>
              <h2 id="order-detail-title" className="vs-display font-mono text-base font-extrabold text-[#18211d]">
                {order.orderNumber}
              </h2>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-bold text-slate-500 hover:bg-slate-100"
            >
              ×
            </button>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Status and Summary Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-4">
            <div>
              <span className="text-xs font-semibold text-[#5e6a62]">Trạng thái đơn:</span>
              <div className="mt-1">
                <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-black border ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-[#5e6a62]">{t("marketplace.total")}:</span>
              <p className="text-lg font-black text-[#25483f]">
                {Number.isFinite(totalAmountNum)
                  ? totalAmountNum.toLocaleString(intlLocale)
                  : String(order.totalAmount)}{" "}
                {order.currency || "VND"}
              </p>
            </div>
          </div>

          {/* Service & Partner Details */}
          <div className="space-y-3 rounded-2xl border border-[#25483f]/12 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3 border-b border-[#25483f]/10 pb-3">
              <div>
                <span className="inline-flex items-center rounded-md bg-[#fef3c7] px-2 py-0.5 text-[10px] font-extrabold text-[#92400e] border border-[#fde68a] mb-1">
                  {t("services.discovery.external")}
                </span>
                <h3 className="vs-display text-lg font-extrabold text-[#18211d]">{order.serviceNameSnapshot}</h3>
                <p className="text-xs font-semibold text-[#8a6a13] mt-0.5">{providerName}</p>
              </div>
              <span className="rounded-lg bg-[#f8f4ea] px-3 py-1 font-mono text-xs font-black text-[#25483f] border border-[#25483f]/15">
                {formatQuantityWithUnit(order.quantity, orderUnit, t)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-[#5e6a62]">{t("marketplace.serviceMode")}:</span>
                <p className="font-bold text-[#18211d]">
                  {order.serviceModeSnapshot === "DELIVERY_TO_HOTEL"
                    ? t("marketplace.modeDelivery")
                    : t("marketplace.modeCustomerAtService")}
                </p>
              </div>
              <div>
                <span className="text-[#5e6a62]">Thời gian tạo:</span>
                <p className="font-bold text-[#18211d]">
                  {formatGuestDateTime(order.createdAt, intlLocale)}
                </p>
              </div>
            </div>

            {order.guestNote ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs">
                <span className="font-bold text-[#8a6a13] block mb-0.5">{t("marketplace.guestNote")}:</span>
                <p className="italic text-[#5e6a62]">&quot;{order.guestNote}&quot;</p>
              </div>
            ) : null}
          </div>

          {/* Service Voucher Card */}
          {order.voucher?.voucherNumber || order.hotelCoordinationStatus === "VOUCHER_ISSUED" ? (
            <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-xl bg-emerald-700 text-white font-bold">
                    <VsIcon name="confirmation_number" className="text-lg" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                      {t("marketplace.voucherCodeLabel")}
                    </span>
                    <p className="font-mono text-base font-black text-emerald-950 tracking-wider">
                      {order.voucher?.voucherNumber ?? "ĐÃ PHÁT HÀNH"}
                    </p>
                  </div>
                </div>

                {order.voucher?.voucherNumber ? (
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="vs-touch-button inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-800"
                  >
                    <VsIcon name="print" className="text-sm" />
                    <span>{t("marketplace.printTicket")}</span>
                  </button>
                ) : null}
              </div>

              <p className="text-xs leading-relaxed text-emerald-900 border-t border-emerald-200/80 pt-2">
                {t("marketplace.voucherHelpText")}
              </p>
            </div>
          ) : order.hotelCoordinationStatus === "ACKNOWLEDGED" ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-xs font-bold text-blue-900">
              <VsIcon name="check_circle" className="text-lg text-blue-600 shrink-0" />
              <span>{t("marketplace.voucherPendingText")}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
              <VsIcon name="hourglass_top" className="text-lg text-amber-600 shrink-0" />
              <span>Khách sạn đang tiếp nhận và sẽ cấp phiếu dịch vụ ngay cho bạn.</span>
            </div>
          )}

          {/* Billing Notice */}
          <div className="rounded-2xl border border-[#25483f]/10 bg-[#f8fbf8] p-3 text-center text-xs text-[#5e6a62]">
            {t("marketplace.roomBillNote")}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 bg-[#fffdfa] p-4 flex items-center justify-end gap-3">
          {onBackToMarketplace ? (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onBackToMarketplace();
              }}
              className="vs-touch-button inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[#25483f] bg-white px-5 text-sm font-bold text-[#25483f] hover:bg-[#eef3ee]"
            >
              <VsIcon name="arrow_back" className="text-base" />
              <span>{t("marketplace.backToMarketplace")}</span>
            </button>
          ) : null}

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="vs-touch-button inline-flex h-11 items-center justify-center rounded-full bg-[#25483f] px-6 text-sm font-extrabold text-white hover:bg-[#1a352d]"
            >
              {t("common.close")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
