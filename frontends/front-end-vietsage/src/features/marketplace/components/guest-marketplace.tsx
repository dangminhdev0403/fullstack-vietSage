"use client";

import { useEffect, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsServiceImagePreview } from "@/components/ui/vs-service-image-preview";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestStagger, GuestStaggerItem } from "@/features/guest-os/components/motion/guest-stagger";
import { GuestServiceEmptyState } from "@/features/guest-os/components/services/guest-service-empty-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestMarketplace } from "../queries/use-guest-marketplace";
import type { MarketplaceOrder, MarketplaceServiceItem } from "../types/marketplace-contract";
import {
  formatQuantityWithUnit,
  formatUnitPriceWithUnit,
  getServicePricingUnit,
} from "../utils/marketplace-unit";
import { useGuestCartStore, useGuestCartStoreHydrated } from "../store/guest-cart-store";
import { GuestMarketplaceServiceDetail } from "./guest-marketplace-service-detail";
import { GuestMarketplaceCartFlow } from "./guest-marketplace-cart-flow";
import { GuestMarketplaceOrderDetail } from "./guest-marketplace-order-detail";

const distance = (meters: number | null, intlLocale: string = "vi-VN") =>
  meters == null
    ? null
    : meters < 1000
      ? `${meters} m`
      : `${(meters / 1000).toLocaleString(intlLocale, { maximumFractionDigits: 1 })} km`;

type GuestMarketplaceProps = {
  readonly sessionToken: string;
  readonly searchQuery?: string;
  readonly selectedCategoryId?: string | null;
  readonly onCategoriesLoaded?: (categories: Array<{ id: string; name: string }>) => void;
  readonly hideHeader?: boolean;
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

export function GuestMarketplace({
  sessionToken,
  searchQuery = "",
  selectedCategoryId = null,
  onCategoriesLoaded,
  hideHeader = false,
}: GuestMarketplaceProps) {
  const { t, intlLocale } = useGuestI18n();
  const isCartHydrated = useGuestCartStoreHydrated();
  const cartItemCount = useGuestCartStore((state) => state.getItemCount());

  const { categories, services, orders } = useGuestMarketplace(
    sessionToken,
    selectedCategoryId ?? undefined,
  );

  const [selectedDetailService, setSelectedDetailService] = useState<MarketplaceServiceItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<MarketplaceOrder | null>(null);

  // Notify parent of available categories for unified category chip bar
  useEffect(() => {
    if (categories.data && onCategoriesLoaded) {
      onCategoriesLoaded(
        categories.data.map((cat) => ({
          id: cat.id,
          name: cat.name || cat.nameVi,
        })),
      );
    }
  }, [categories.data, onCategoriesLoaded]);

  // Client-side search filtering across service name, description, category, and provider name
  const filteredItems = (services.data?.items ?? []).filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = item.name.toLowerCase().includes(q);
    const descMatch = item.description?.toLowerCase().includes(q);
    const categoryMatch =
      item.category?.name?.toLowerCase().includes(q) ||
      item.category?.nameVi?.toLowerCase().includes(q);
    const providerMatch = item.serviceTenant?.serviceProfile?.displayName
      ?.toLowerCase()
      .includes(q);
    return nameMatch || descMatch || categoryMatch || providerMatch;
  });

  return (
    <section aria-labelledby="marketplace-title" className="space-y-8 relative">
      {!hideHeader ? (
        <GuestReveal>
          <header className="mb-6">
            <p className="text-sm font-semibold text-[#8a6a13]">
              {t("marketplace.aroundYou")}
            </p>
            <h2 id="marketplace-title" className="vs-display mt-1 text-2xl font-semibold text-[#18211d] md:text-3xl">
              {t("services.discovery.external")}
            </h2>
            <p className="mt-2 text-sm text-[#5e6a62]">
              {t("marketplace.subtitle")}
            </p>
          </header>
        </GuestReveal>
      ) : null}

      {/* Services List / Grid */}
      {services.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((id) => (
            <div
              key={id}
              className="h-80 animate-pulse rounded-3xl bg-[#ece8df] shadow-sm"
            />
          ))}
        </div>
      ) : services.isError ? (
        <div
          role="alert"
          className="rounded-[24px] border border-red-200 bg-red-50/80 p-6 text-center text-red-800 backdrop-blur-sm"
        >
          <p className="font-semibold">{t("marketplace.loadError")}</p>
          <button
            type="button"
            className="vs-touch-button mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-red-300 bg-white px-5 text-sm font-bold text-red-700 shadow-sm"
            onClick={() => void services.refetch()}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : filteredItems.length ? (
        <GuestStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const providerName =
              item.serviceTenant?.serviceProfile?.displayName || t("marketplace.providerFallback");
            const distLabel = distance(item.distanceMeters, intlLocale);
            const isSoldOut = item.capacityAvailable === 0;
            const unit = getServicePricingUnit(item, t);

            return (
              <GuestStaggerItem key={item.id} className="h-full">
                <article
                  onClick={() => setSelectedDetailService(item)}
                  className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#25483f]/10 bg-[#fffdfa] shadow-[0_12px_36px_rgba(31,61,53,0.08)] transition-[transform,box-shadow,border-color] duration-200 active:translate-y-px md:hover:-translate-y-1 md:hover:border-[#d7bd61]/70 md:hover:shadow-[0_20px_48px_rgba(31,61,53,0.13)] cursor-pointer"
                >
                  {/* Image Header with VietSage Professional Preview Fallback */}
                  <div className="relative aspect-video w-full overflow-hidden bg-[#1b3830]">
                    <VsServiceImagePreview
                      src={item.imageUrls[0]}
                      alt={item.name}
                      categoryName={item.category?.name || item.category?.nameVi}
                      providerName={providerName}
                    />
                    {/* Distance Badge */}
                    {distLabel ? (
                      <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#18211d]/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md shadow">
                        <VsIcon name="location_on" className="text-xs text-[#d7bd61]" />
                        {distLabel}
                      </span>
                    ) : null}
                    {/* Visual Badge for External Service */}
                    <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#25483f]/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md shadow">
                      {t("services.discovery.external")}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-[#8a6a13]">
                        {providerName}
                      </p>
                      <h3 className="vs-display mt-1 text-lg font-bold leading-6 text-[#18211d]">
                        {item.name}
                      </h3>
                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-[#5e6a62]">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2 border-t border-[#25483f]/10 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#5e6a62]">{t("marketplace.unitPrice")}:</span>
                        <span className="text-base font-bold text-[#25483f]">
                          {formatUnitPriceWithUnit(item.unitPrice, item.currency, unit, intlLocale)}
                        </span>
                      </div>

                      {item.waitingMinutes ? (
                        <div className="flex items-center justify-between text-xs text-[#5e6a62]">
                          <span>{t("marketplace.estimatedWaiting")}:</span>
                          <span className="font-semibold text-[#18211d]">
                            {t("marketplace.minutesUnit", { minutes: item.waitingMinutes })}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Booking Action Button */}
                    <button
                      type="button"
                      disabled={isSoldOut}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDetailService(item);
                      }}
                      className="vs-touch-button mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(37,72,63,0.15)] transition-all hover:bg-[#19382f] active:bg-[#122b24] disabled:opacity-50"
                    >
                      <VsIcon name="visibility" className="text-base" />
                      <span>{isSoldOut ? t("marketplace.soldOut") : t("marketplace.bookService")}</span>
                    </button>
                  </div>
                </article>
              </GuestStaggerItem>
            );
          })}
        </GuestStagger>
      ) : (
        <GuestServiceEmptyState message={t("marketplace.emptySearch")} />
      )}

      {/* Orders List Section */}
      {orders.data?.length ? (
        <GuestReveal>
          <section className="mt-12 space-y-4 rounded-[28px] border border-[#25483f]/10 bg-[#fffdfa] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VsIcon name="receipt_long" className="text-xl text-[#8a6a13]" />
                <h3 className="vs-display text-xl font-bold text-[#18211d]">
                  {t("marketplace.myOrders")}
                </h3>
              </div>
              <span className="rounded-full bg-[#f8f4ea] px-3 py-1 text-xs font-black text-[#8a6a13] border border-[#25483f]/10">
                {orders.data.length} đơn
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {orders.data.map((item) => {
                const orderUnit = getServicePricingUnit(item, t);
                const badge = getGuestOrderStatusBadge(item.status, t);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedOrderForDetail(item)}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-4 text-sm shadow-2xs cursor-pointer transition-all hover:bg-[#f3ede0] hover:border-[#25483f]/25"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#25483f]/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-[#fef3c7] px-2 py-0.5 text-[10px] font-extrabold text-[#92400e] border border-[#fde68a]">
                            {t("services.discovery.external")}
                          </span>
                          <p className="font-bold text-[#18211d]">{item.serviceNameSnapshot}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#5e6a62]">
                        {t("marketplace.orderNumber")}: <span className="font-mono">{item.orderNumber}</span> • {formatQuantityWithUnit(item.quantity, orderUnit, t)} • {t("marketplace.total")}: <span className="font-black text-[#25483f]">{Number(item.totalAmount).toLocaleString(intlLocale)} {item.currency}</span>
                      </p>

                      {/* Hotel Acknowledgement & Service Voucher Section */}
                      {item.hotelCoordinationStatus === "ACKNOWLEDGED" || item.hotelCoordinationStatus === "VOUCHER_ISSUED" || item.voucher ? (
                        <div className="mt-2 space-y-2 rounded-xl bg-white p-3 border border-[#25483f]/15">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#16562c]">
                            <VsIcon name="check_circle" className="text-sm text-[#16562c]" />
                            <span>{t("marketplace.hotelAcknowledgedBadge")}</span>
                          </div>

                          {item.voucher?.voucherNumber ? (
                            <div className="space-y-1.5 border-t border-[#25483f]/10 pt-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-[#8a6a13] uppercase tracking-wider text-[10px]">
                                  {t("marketplace.voucherCodeLabel")}
                                </span>
                                <span className="font-mono font-black text-base text-[#25483f] bg-[#f8f4ea] px-2 py-0.5 rounded-lg border border-[#25483f]/20">
                                  {item.voucher.voucherNumber}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#5e6a62] italic">
                                {t("marketplace.voucherHelpText")}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#8a6a13] italic">
                              {t("marketplace.voucherPendingText")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </GuestReveal>
      ) : null}

      {/* Floating Action Button for Cart (Visible whenever Cart has items) */}
      {isCartHydrated && cartItemCount > 0 ? (
        <div className="fixed bottom-24 right-5 z-40 md:bottom-8 md:right-8 animate-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label={t("marketplace.viewCart")}
            className="vs-touch-button flex items-center gap-2.5 rounded-full bg-[#25483f] py-3.5 pl-4 pr-5 text-white shadow-[0_12px_28px_rgba(37,72,63,0.35)] transition-all hover:bg-[#19382f] active:scale-95"
          >
            <div className="relative">
              <VsIcon name="shopping_bag" className="text-2xl text-[#d7bd61]" />
              <span className="absolute -top-1.5 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d7bd61] px-1 text-[11px] font-black text-[#18211d] shadow">
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            </div>
            <span className="text-sm font-extrabold tracking-wide">{t("marketplace.cart")}</span>
          </button>
        </div>
      ) : null}

      {/* Service Detail Drawer / Modal */}
      {selectedDetailService ? (
        <GuestMarketplaceServiceDetail
          service={selectedDetailService}
          isOpen={Boolean(selectedDetailService)}
          onClose={() => setSelectedDetailService(null)}
          onOpenCart={() => setIsCartOpen(true)}
        />
      ) : null}

      {/* Complete Cart Flow Modal (Cart -> Review -> Confirm -> Order Detail) */}
      {isCartOpen ? (
        <GuestMarketplaceCartFlow
          sessionToken={sessionToken}
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          availableServices={services.data?.items}
          onOrderCreated={(order) => {
            void orders.refetch();
          }}
        />
      ) : null}

      {/* Single Order Detail Modal (when user clicks an existing order) */}
      {selectedOrderForDetail ? (
        <GuestMarketplaceOrderDetail
          order={selectedOrderForDetail}
          sessionToken={sessionToken}
          isOpen={Boolean(selectedOrderForDetail)}
          onClose={() => setSelectedOrderForDetail(null)}
        />
      ) : null}
    </section>
  );
}
