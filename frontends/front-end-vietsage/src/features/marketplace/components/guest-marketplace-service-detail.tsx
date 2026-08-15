"use client";

import { useState } from "react";
import { toast } from "sonner";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsServiceImagePreview } from "@/components/ui/vs-service-image-preview";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import type { MarketplaceServiceItem } from "../types/marketplace-contract";
import { useGuestCartStore } from "../store/guest-cart-store";
import {
  formatQuantityWithUnit,
  formatSubtotalAmount,
  formatUnitPriceWithUnit,
  getServicePricingUnit,
} from "../utils/marketplace-unit";

type GuestMarketplaceServiceDetailProps = {
  service: MarketplaceServiceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCart?: () => void;
};

export function GuestMarketplaceServiceDetail({
  service,
  isOpen,
  onClose,
  onOpenCart,
}: GuestMarketplaceServiceDetailProps) {
  const { t, intlLocale } = useGuestI18n();
  const addItem = useGuestCartStore((state) => state.addItem);

  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  if (!isOpen || !service) return null;

  const unit = getServicePricingUnit(service, t);
  const maxCap = service.capacityAvailable ?? 99;
  const isSoldOut = service.capacityAvailable === 0;
  const providerName =
    service.serviceTenant?.serviceProfile?.displayName || t("marketplace.providerFallback");
  const providerAddress = service.serviceTenant?.serviceProfile?.address;
  const providerPhone = service.serviceTenant?.serviceProfile?.phone;

  const handleAddToCart = (openCartAfter = false) => {
    if (isSoldOut) return;
    addItem(service, quantity, note.trim() || undefined);
    toast.success(t("marketplace.addedToCart", { name: service.name }), {
      action: onOpenCart
        ? {
            label: t("marketplace.viewCart"),
            onClick: onOpenCart,
          }
        : undefined,
    });
    if (openCartAfter && onOpenCart) {
      onClose();
      onOpenCart();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-detail-title"
        className="flex max-h-[min(92vh,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] sm:rounded-[2.2rem] bg-white shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-[#1b3830]">
          <VsServiceImagePreview
            src={service.imageUrls[0]}
            alt={service.name}
            categoryName={service.category?.name || service.category?.nameVi}
            providerName={providerName}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="vs-touch-button absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-105"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
          <span className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#18211d]/85 px-3 py-1 text-xs font-bold text-white backdrop-blur-md shadow">
            <VsIcon name="storefront" className="text-xs text-[#d7bd61]" />
            {providerName}
          </span>
          <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#25483f]/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md shadow">
            {t("services.discovery.external")}
          </span>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#8a6a13]">
                {service.category?.name || service.category?.nameVi}
              </span>
            </div>
            <h2 id="service-detail-title" className="vs-display mt-1 text-2xl font-extrabold text-[#18211d]">
              {service.name}
            </h2>
          </div>

          {/* Key Attributes Grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-[#5e6a62]">
                <VsIcon name="payments" className="text-sm text-[#8a6a13]" />
                <span>{t("marketplace.unitPrice")}</span>
              </div>
              <p className="mt-1 text-sm font-black text-[#25483f]">
                {formatUnitPriceWithUnit(service.unitPrice, service.currency, unit, intlLocale)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-[#5e6a62]">
                <VsIcon name="schedule" className="text-sm text-[#8a6a13]" />
                <span>{t("marketplace.estimatedWaiting")}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-[#18211d]">
                {service.waitingMinutes ? t("marketplace.minutesUnit", { minutes: service.waitingMinutes }) : "~15-30 phút"}
              </p>
            </div>

            <div className="rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-3 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-[#5e6a62]">
                <VsIcon name="room_service" className="text-sm text-[#8a6a13]" />
                <span>{t("marketplace.serviceMode")}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-[#18211d]">
                {service.mode === "DELIVERY_TO_HOTEL"
                  ? t("marketplace.modeDelivery")
                  : t("marketplace.modeCustomerAtService")}
              </p>
            </div>
          </div>

          {/* Description */}
          {service.description ? (
            <div className="space-y-1 rounded-2xl border border-[#25483f]/10 bg-[#fcfaf5] p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">
                {t("marketplace.serviceDetail")}
              </span>
              <p className="text-sm leading-relaxed text-[#465149] whitespace-pre-line">
                {service.description}
              </p>
            </div>
          ) : null}

          {/* Provider Contacts */}
          {(providerAddress || providerPhone) && (
            <div className="rounded-2xl border border-[#25483f]/10 bg-white p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">
                {t("marketplace.provider")}
              </span>
              <div className="space-y-1.5 text-xs text-[#5e6a62]">
                {providerAddress ? (
                  <div className="flex items-start gap-2">
                    <VsIcon name="location_on" className="text-sm shrink-0 text-[#8a6a13]" />
                    <span>{providerAddress}</span>
                  </div>
                ) : null}
                {providerPhone ? (
                  <div className="flex items-center gap-2">
                    <VsIcon name="phone" className="text-sm shrink-0 text-[#8a6a13]" />
                    <span className="font-semibold">{providerPhone}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Interactive Quantity Selector & Subtotal */}
          <div className="rounded-2xl border border-[#25483f]/15 bg-[#f8f4ea] p-4 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#18211d]">{t("services.quantity")}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={quantity <= 1 || isSoldOut}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-[#25483f]/30 bg-white font-black text-[#25483f] transition-all hover:bg-[#25483f] hover:text-white disabled:opacity-30"
                >
                  -
                </button>
                <span className="min-w-16 text-center text-base font-extrabold text-[#18211d]">
                  {formatQuantityWithUnit(quantity, unit, t)}
                </span>
                <button
                  type="button"
                  disabled={quantity >= maxCap || isSoldOut}
                  onClick={() => setQuantity((q) => Math.min(maxCap, q + 1))}
                  className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-[#25483f]/30 bg-white font-black text-[#25483f] transition-all hover:bg-[#25483f] hover:text-white disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Special Instructions Note */}
            <div className="border-t border-[#25483f]/10 pt-3">
              <label htmlFor="service-note-input" className="block text-xs font-bold text-[#5e6a62] mb-1">
                {t("marketplace.guestNote")}
              </label>
              <input
                id="service-note-input"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("marketplace.guestNotePlaceholder")}
                className="w-full rounded-xl border border-[#25483f]/20 bg-white px-3.5 py-2 text-xs text-[#18211d] placeholder:text-[#8e9c94] focus:border-[#25483f] focus:outline-none"
              />
            </div>

            {/* Live Subtotal */}
            <div className="flex items-center justify-between border-t border-[#25483f]/10 pt-3">
              <span className="text-sm font-semibold text-[#5e6a62]">{t("marketplace.subtotal")}:</span>
              <span className="text-xl font-black text-[#25483f]">
                {formatSubtotalAmount(service.unitPrice, quantity, service.currency, intlLocale)}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="shrink-0 border-t border-gray-100 bg-[#fffdfa] p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="vs-touch-button order-3 sm:order-1 inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-full border border-slate-300 bg-white px-4 sm:px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>

          <div className="order-1 sm:order-2 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <button
              type="button"
              disabled={isSoldOut}
              onClick={() => handleAddToCart(false)}
              className="vs-touch-button inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[#25483f] bg-white px-3 sm:px-5 text-xs sm:text-sm font-bold text-[#25483f] hover:bg-[#eef3ee] active:bg-[#e2e9e3] disabled:opacity-40"
            >
              <VsIcon name="add_shopping_cart" className="text-base shrink-0" />
              <span className="truncate">{t("marketplace.addToCart")}</span>
            </button>

            <button
              type="button"
              disabled={isSoldOut}
              onClick={() => handleAddToCart(true)}
              className="vs-touch-button inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#25483f] px-4 sm:px-6 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-[#25483f]/20 hover:bg-[#1a352d] active:bg-[#122b24] disabled:opacity-40"
            >
              <VsIcon name="shopping_bag" className="text-base shrink-0" />
              <span className="truncate">{isSoldOut ? t("marketplace.soldOut") : t("marketplace.bookNow")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
