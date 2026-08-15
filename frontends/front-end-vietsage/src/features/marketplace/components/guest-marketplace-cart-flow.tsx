"use client";

import { useState, useId } from "react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsServiceImagePreview } from "@/components/ui/vs-service-image-preview";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestCartStore } from "../store/guest-cart-store";
import {
  useGuestMarketplace,
  useGuestMarketplaceCart,
} from "../queries/use-guest-marketplace";
import type {
  CheckoutMarketplaceCartInput,
  CheckoutMarketplaceCartResult,
  MarketplaceOrder,
  MarketplaceServiceItem,
} from "../types/marketplace-contract";
import {
  formatQuantityWithUnit,
  formatUnitPriceWithUnit,
  formatSubtotalAmount,
} from "../utils/marketplace-unit";
import { GuestMarketplaceOrderDetail } from "./guest-marketplace-order-detail";

type CartFlowStep = "CART" | "REVIEW" | "ORDER_DETAIL";

type GuestMarketplaceCartFlowProps = {
  sessionToken: string;
  isOpen: boolean;
  onClose: () => void;
  availableServices?: MarketplaceServiceItem[];
  onOrderCreated?: (order: MarketplaceOrder) => void;
};

export function GuestMarketplaceCartFlow({
  sessionToken,
  isOpen,
  onClose,
  availableServices = [],
  onOrderCreated,
}: GuestMarketplaceCartFlowProps) {
  const { t, intlLocale } = useGuestI18n();
  const idempotencyId = useId();

  const cartItems = useGuestCartStore((state) => state.items);
  const updateQuantity = useGuestCartStore((state) => state.updateQuantity);
  const removeItem = useGuestCartStore((state) => state.removeItem);
  const clearCart = useGuestCartStore((state) => state.clearCart);

  const [step, setStep] = useState<CartFlowStep>("CART");
  const [generalNote, setGeneralNote] = useState("");
  const [createdOrder, setCreatedOrder] = useState<MarketplaceOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { checkoutCart, confirmCart, orders, syncCart } = useGuestMarketplace(sessionToken);
  const checkoutMutation = checkoutCart ?? confirmCart;

  const cartQuery = useGuestMarketplaceCart(sessionToken, {
    enabled: isOpen && step === "REVIEW",
  });

  if (!isOpen) return null;

  // Stale and Availability checks against live services
  const itemsWithValidation = cartItems.map((item) => {
    const liveService = availableServices.find((s) => s.id === item.serviceId);
    let isUnavailable = false;
    let warningReason: string | null = null;

    if (liveService) {
      if (liveService.capacityAvailable !== null && liveService.capacityAvailable !== undefined) {
        if (liveService.capacityAvailable === 0) {
          isUnavailable = true;
          warningReason = t("marketplace.soldOut");
        } else if (item.quantity > liveService.capacityAvailable) {
          isUnavailable = true;
          warningReason = `Chỉ còn ${liveService.capacityAvailable} suất`;
        }
      }
    }
    return { ...item, isUnavailable, warningReason };
  });

  const hasUnavailableItems = itemsWithValidation.some((item) => item.isUnavailable);

  const handleClearCart = async () => {
    const confirmation = await Swal.fire({
      title: t("marketplace.clearCart"),
      text: t("marketplace.clearCartConfirm"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t("marketplace.remove"),
      cancelButtonText: t("common.cancel"),
      confirmButtonColor: "#ba1a1a",
      cancelButtonColor: "#767684",
      reverseButtons: false,
    });
    if (confirmation.isConfirmed) {
      clearCart();
      toast.success("Đã làm trống giỏ hàng");
    }
  };

  const handleProceedToReview = async () => {
    if (cartItems.length === 0 || hasUnavailableItems) return;
    try {
      await syncCart.mutateAsync({
        items: cartItems.map(({ serviceId, quantity, guestNote }) => ({ serviceId, quantity, guestNote })),
      });
      setStep("REVIEW");
    } catch {
      toast.error(t("marketplace.orderCreateError"));
    }
  };

  const handleConfirmOrder = async () => {
    if (isSubmitting || cartItems.length === 0) return;
    const confirmation = await Swal.fire({
      title: t("marketplace.orderReview"),
      text: t("marketplace.confirmOrder"),
      icon: "question",
      showCancelButton: true,
      confirmButtonText: t("marketplace.confirmOrder"),
      cancelButtonText: t("common.cancel"),
      confirmButtonColor: "#25483f",
    });
    if (!confirmation.isConfirmed) return;
    setIsSubmitting(true);

    void Swal.fire({
      title: t("common.wait"),
      text: t("marketplace.confirmSubmitting"),
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    const payload: CheckoutMarketplaceCartInput = {
      items: cartItems.map((item) => ({
        serviceId: item.serviceId,
        quantity: item.quantity,
        guestNote: item.guestNote,
      })),
      idempotencyKey: `cart_${Date.now()}_${idempotencyId.replace(/:/g, "_")}`,
      generalNote: generalNote.trim() || undefined,
      guestNote: generalNote.trim() || undefined,
    };

    checkoutMutation.mutate(payload, {
      onSuccess: (result: CheckoutMarketplaceCartResult) => {
        Swal.close();
        setIsSubmitting(false);
        clearCart();
        void orders.refetch();

        const firstOrder =
          result.orders?.[0] ??
          result.order ??
          ((result as unknown as MarketplaceOrder).orderNumber
            ? (result as unknown as MarketplaceOrder)
            : null);

        if (firstOrder) {
          setCreatedOrder(firstOrder);
          onOrderCreated?.(firstOrder);
          setStep("ORDER_DETAIL");
          toast.success(t("marketplace.orderCreatedSuccess", { orderNumber: firstOrder.orderNumber }));
        } else {
          toast.success(t("marketplace.orderSuccess"));
          onClose();
        }
      },
      onError: () => {
        Swal.close();
        setIsSubmitting(false);
        toast.error(t("marketplace.orderCreateError"));
      },
    });
  };

  // Render Order Detail Step
  if (step === "ORDER_DETAIL" && createdOrder) {
    return (
      <GuestMarketplaceOrderDetail
        order={createdOrder}
        sessionToken={sessionToken}
        isOpen={isOpen}
        onClose={onClose}
        onBackToMarketplace={() => {
          setStep("CART");
          onClose();
        }}
      />
    );
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-modal-title"
        className="flex max-h-[min(92vh,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] sm:rounded-[2.2rem] bg-white shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[#fbf9f4] p-5 sm:p-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#25483f] text-white">
              <VsIcon
                name={step === "CART" ? "shopping_cart" : "receipt_long"}
                className="text-xl text-[#d7bd61]"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#8a6a13]">
                {step === "CART" ? t("marketplace.cart") : t("marketplace.reviewOrder")}
              </p>
              <h2 id="cart-modal-title" className="vs-display text-xl font-extrabold text-[#18211d]">
                {step === "CART" ? t("marketplace.cart") : t("marketplace.orderReview")}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === "CART" && cartItems.length > 0 ? (
              <button
                type="button"
                onClick={handleClearCart}
                className="vs-touch-button text-xs font-bold text-red-600 hover:text-red-700 px-2 py-1"
              >
                {t("marketplace.clearCart")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-bold text-slate-500 hover:bg-slate-100"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
          {step === "CART" ? (
            /* CART STEP */
            cartItems.length === 0 ? (
              <div className="py-12 text-center space-y-4">
                <div className="grid size-16 place-items-center rounded-full bg-[#f8f4ea] text-[#25483f] mx-auto">
                  <VsIcon name="remove_shopping_cart" className="text-3xl text-[#8a6a13]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[#18211d]">{t("marketplace.cartEmpty")}</h3>
                  <p className="text-xs text-[#5e6a62] max-w-sm mx-auto leading-relaxed">
                    {t("marketplace.cartEmptySubtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="vs-touch-button inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25483f] px-6 text-sm font-bold text-white shadow hover:bg-[#1a352d]"
                >
                  <VsIcon name="storefront" className="text-base" />
                  <span>{t("marketplace.backToMarketplace")}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {hasUnavailableItems ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                    <VsIcon name="warning" className="text-base shrink-0 text-red-600" />
                    <span>{t("marketplace.staleItemWarning")}</span>
                  </div>
                ) : null}

                {/* Items List */}
                <div className="space-y-3">
                  {itemsWithValidation.map((item) => {
                    const maxCap = item.maxCapacity ?? 99;
                    return (
                      <article
                        key={item.serviceId}
                        className={`rounded-2xl border p-4 transition-all ${
                          item.isUnavailable
                            ? "border-red-300 bg-red-50/50"
                            : "border-[#25483f]/12 bg-white shadow-2xs"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Thumbnail */}
                          <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-[#1b3830]">
                            <VsServiceImagePreview
                              src={item.imageUrls[0]}
                              alt={item.name}
                              categoryName={item.providerName}
                              providerName={item.providerName}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[11px] font-bold text-[#8a6a13] truncate">
                                  {item.providerName}
                                </p>
                                <h4 className="font-bold text-sm text-[#18211d] leading-snug">
                                  {item.name}
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(item.serviceId)}
                                aria-label={t("marketplace.remove")}
                                className="vs-touch-button text-slate-400 hover:text-red-600 p-1"
                              >
                                <VsIcon name="delete" className="text-base" />
                              </button>
                            </div>

                            {item.warningReason ? (
                              <span className="inline-block mt-1 text-[11px] font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-md">
                                {item.warningReason}
                              </span>
                            ) : null}

                            {/* Price & Quantity Controls */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                              <span className="text-xs font-black text-[#25483f]">
                                {formatUnitPriceWithUnit(
                                  item.unitPrice,
                                  item.currency,
                                  item.pricingUnit || item.unit || "suất",
                                  intlLocale,
                                )}
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.serviceId, item.quantity - 1)}
                                  className="vs-touch-button flex h-7 w-7 items-center justify-center rounded-full border border-[#25483f]/30 bg-white text-xs font-black text-[#25483f] hover:bg-[#25483f] hover:text-white"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center text-xs font-black text-[#18211d]">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  disabled={item.quantity >= maxCap}
                                  onClick={() => updateQuantity(item.serviceId, item.quantity + 1)}
                                  className="vs-touch-button flex h-7 w-7 items-center justify-center rounded-full border border-[#25483f]/30 bg-white text-xs font-black text-[#25483f] hover:bg-[#25483f] hover:text-white disabled:opacity-30"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Item Subtotal Preview */}
                            <div className="mt-2 text-right">
                              <span className="text-[11px] text-[#5e6a62]">{t("marketplace.subtotal")}: </span>
                              <span className="text-xs font-black text-[#25483f]">
                                {formatSubtotalAmount(item.unitPrice, item.quantity, item.currency, intlLocale)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            /* REVIEW STEP (WITH BACKEND-PROVIDED QUOTE BREAKDOWN) */
            <div className="space-y-5">
              {/* Items Summary Table */}
              <div className="rounded-2xl border border-[#25483f]/15 bg-white p-4 space-y-3 shadow-2xs">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8a6a13] block">
                  {t("marketplace.selectedService")} ({cartItems.length})
                </span>
                <div className="divide-y divide-gray-100">
                  {cartItems.map((item) => (
                    <div key={item.serviceId} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-[#18211d]">{item.name}</p>
                        <p className="text-[11px] text-[#5e6a62]">
                          {item.providerName} • {formatQuantityWithUnit(item.quantity, item.pricingUnit || "suất", t)}
                        </p>
                      </div>
                      <span className="font-bold text-[#25483f]">
                        {formatSubtotalAmount(item.unitPrice, item.quantity, item.currency, intlLocale)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* General Note Input */}
              <div className="rounded-2xl border border-[#25483f]/15 bg-[#fcfaf5] p-4 space-y-2">
                <label htmlFor="cart-general-note" className="block text-xs font-bold text-[#5e6a62]">
                  {t("marketplace.guestNote")}
                </label>
                <input
                  id="cart-general-note"
                  type="text"
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder={t("marketplace.guestNotePlaceholder")}
                  className="w-full rounded-xl border border-[#25483f]/20 bg-white px-3.5 py-2.5 text-xs text-[#18211d] focus:border-[#25483f] focus:outline-none"
                />
              </div>

              {/* Backend-Provided Cart Totals Breakdown */}
              <div className="rounded-2xl border border-[#25483f]/15 bg-[#f8f4ea] p-4 space-y-3 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8a6a13] block">
                  Bảng kê chi phí (Hệ thống cung cấp)
                </span>

                {cartQuery.isPending ? (
                  <div className="py-4 text-center space-y-2 text-xs text-[#5e6a62]">
                    <div className="size-6 animate-spin rounded-full border-2 border-[#25483f] border-t-transparent mx-auto" />
                    <p>{t("marketplace.calculatingQuote")}</p>
                  </div>
                ) : cartQuery.data ? (
                  <div className="space-y-2.5 text-xs">
                    {(cartQuery.data.partnerSubtotal !== undefined || cartQuery.data.subtotal !== undefined) ? (
                      <div className="flex items-center justify-between text-[#5e6a62]">
                        <span>{t("marketplace.partnerSubtotal")}:</span>
                        <span className="font-bold text-[#18211d]">
                          {Number(cartQuery.data.partnerSubtotal ?? cartQuery.data.subtotal ?? 0).toLocaleString(intlLocale)}{" "}
                          {cartQuery.data.currency || "VND"}
                        </span>
                      </div>
                    ) : null}

                    {(cartQuery.data.hotelServiceFeeAmount !== undefined || cartQuery.data.hotelServiceFee !== undefined) ? (
                      <div className="flex items-center justify-between text-[#5e6a62]">
                        <span>{t("marketplace.hotelServiceFee")}:</span>
                        <span className="font-bold text-[#18211d]">
                          {Number(cartQuery.data.hotelServiceFeeAmount ?? cartQuery.data.hotelServiceFee ?? 0).toLocaleString(intlLocale)}{" "}
                          {cartQuery.data.currency || "VND"}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between border-t border-[#25483f]/15 pt-2.5 text-sm">
                      <span className="font-extrabold text-[#18211d]">{t("marketplace.customerTotal")}:</span>
                      <span className="text-xl font-black text-[#25483f]">
                        {Number(cartQuery.data.customerTotalAmount ?? cartQuery.data.customerTotal ?? cartQuery.data.totalAmount ?? 0).toLocaleString(intlLocale)}{" "}
                        {cartQuery.data.currency || "VND"}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Fallback display if cart query failed */
                  <div className="text-xs text-red-600">
                    Không thể lấy bảng kê chi phí. Vui lòng thử lại.
                  </div>
                )}
              </div>

              {/* Room Bill Notification */}
              <div className="rounded-2xl border border-[#25483f]/10 bg-[#f8fbf8] p-3 text-center text-xs text-[#5e6a62] leading-relaxed">
                {t("marketplace.roomChargeNotice")}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-gray-100 bg-[#fffdfa] p-3.5 sm:p-5 grid grid-cols-2 items-center gap-2.5 sm:gap-3">
          {step === "CART" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="vs-touch-button inline-flex h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-3 sm:px-5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.continue")}
              </button>

              <button
                type="button"
                disabled={cartItems.length === 0 || hasUnavailableItems}
                onClick={handleProceedToReview}
                className="vs-touch-button inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#25483f] px-3 sm:px-6 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-[#25483f]/20 hover:bg-[#1a352d] disabled:opacity-40"
              >
                <span>{t("marketplace.proceedToReview")}</span>
                <VsIcon name="arrow_forward" className="text-sm" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep("CART")}
                className="vs-touch-button inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 sm:px-5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <VsIcon name="arrow_back" className="text-sm" />
                <span>{t("marketplace.backToCart")}</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || cartQuery.isPending || (!cartQuery.data && cartItems.length > 0)}
                onClick={handleConfirmOrder}
                className="vs-touch-button inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#25483f] px-3 sm:px-7 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-[#25483f]/25 hover:bg-[#1a352d] disabled:opacity-40"
              >
                <VsIcon name="check_circle" className="text-base text-[#d7bd61]" />
                <span>{isSubmitting ? t("services.sending") : t("marketplace.confirmOrder")}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
