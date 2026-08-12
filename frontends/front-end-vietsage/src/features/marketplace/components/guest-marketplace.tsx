"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsServiceImagePreview } from "@/components/ui/vs-service-image-preview";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestStagger, GuestStaggerItem } from "@/features/guest-os/components/motion/guest-stagger";
import { GuestServiceEmptyState } from "@/features/guest-os/components/services/guest-service-empty-state";
import { useGuestRequestRealtime } from "@/features/request-realtime/use-guest-request-realtime";
import { useGuestMarketplace } from "../queries/use-guest-marketplace";
import type { MarketplaceServiceItem } from "../types/marketplace-contract";
import {
  formatQuantityWithUnit,
  formatSubtotalAmount,
  formatUnitPriceWithUnit,
  getServicePricingUnit,
} from "../utils/marketplace-unit";

const distance = (meters: number | null) =>
  meters == null
    ? null
    : meters < 1000
      ? `${meters} m`
      : `${(meters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;

type GuestMarketplaceProps = {
  readonly sessionToken: string;
  readonly searchQuery?: string;
  readonly selectedCategoryId?: string | null;
  readonly onCategoriesLoaded?: (categories: Array<{ id: string; name: string }>) => void;
  readonly hideHeader?: boolean;
};

function getGuestOrderStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return { label: "Đang chờ xác nhận", className: "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]" };
    case "ACCEPTED":
      return { label: "Đối tác đã tiếp nhận", className: "bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]" };
    case "PREPARING":
      return { label: "Đang chuẩn bị", className: "bg-[#f3e8ff] text-[#6b21a8] border-[#e9d5ff]" };
    case "DELIVERING":
      return { label: "Đang giao tận phòng", className: "bg-[#e0e7ff] text-[#3730a3] border-[#c7d2fe]" };
    case "READY":
      return { label: "Sẵn sàng phục vụ", className: "bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]" };
    case "COMPLETED":
      return { label: "Hoàn thành", className: "bg-[#e7f4eb] text-[#16562c] border-[#bde2c7]" };
    case "CANCELLED":
    case "REJECTED":
      return { label: "Đã hủy", className: "bg-[#ffe4e6] text-[#9f1239] border-[#fecdd3]" };
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
  const { categories, services, orders, order } = useGuestMarketplace(
    sessionToken,
    selectedCategoryId ?? undefined,
  );

  useGuestRequestRealtime(sessionToken, {
    onExternalOrderCreated: () => {
      void orders.refetch();
    },
    onExternalOrderStatusChanged: () => {
      void orders.refetch();
    },
    onReconnect: () => {
      void orders.refetch();
    },
  });

  const [bookingItem, setBookingItem] = useState<MarketplaceServiceItem | null>(null);
  const [bookingQuantity, setBookingQuantity] = useState<number>(1);

  // Notify parent of available categories for unified category chip bar
  useEffect(() => {
    if (categories.data && onCategoriesLoaded) {
      onCategoriesLoaded(
        categories.data.map((cat) => ({
          id: cat.id,
          name: cat.nameVi,
        })),
      );
    }
  }, [categories.data, onCategoriesLoaded]);

  // Toast feedback on order status
  useEffect(() => {
    if (order.isSuccess) {
      toast.success(`Đã tạo đơn ${order.data.orderNumber} thành công!`);
      void orders.refetch();
    } else if (order.isError) {
      toast.error("Không thể tạo đơn dịch vụ. Vui lòng thử lại.");
    }
  }, [order.isSuccess, order.isError, order.data?.orderNumber, orders]);

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

  const openBookingModal = (item: MarketplaceServiceItem) => {
    setBookingItem(item);
    setBookingQuantity(1);
  };

  const handleConfirmOrder = () => {
    if (!bookingItem) return;
    order.mutate(
      {
        serviceId: bookingItem.id,
        quantity: bookingQuantity,
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          setBookingItem(null);
        },
      },
    );
  };

  return (
    <section aria-labelledby="marketplace-title" className="space-y-8">
      {!hideHeader ? (
        <GuestReveal>
          <header className="mb-6">
            <p className="text-sm font-semibold text-[#8a6a13]">
              Dịch vụ quanh bạn
            </p>
            <h2 id="marketplace-title" className="vs-display mt-1 text-2xl font-semibold text-[#18211d] md:text-3xl">
              Dịch vụ bên ngoài
            </h2>
            <p className="mt-2 text-sm text-[#5e6a62]">
              Khám phá dịch vụ quanh khách sạn và đặt trực tiếp với nhà cung cấp uy tín.
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
              className="h-80 animate-pulse rounded-[24px] bg-[#ece8df] shadow-sm"
            />
          ))}
        </div>
      ) : services.isError ? (
        <div
          role="alert"
          className="rounded-[24px] border border-red-200 bg-red-50/80 p-6 text-center text-red-800 backdrop-blur-sm"
        >
          <p className="font-semibold">Không thể tải danh sách dịch vụ bên ngoài.</p>
          <button
            type="button"
            className="vs-touch-button mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-red-300 bg-white px-5 text-sm font-bold text-red-700 shadow-sm"
            onClick={() => void services.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : filteredItems.length ? (
        <GuestStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const providerName =
              item.serviceTenant?.serviceProfile?.displayName || "Nhà cung cấp";
            const distLabel = distance(item.distanceMeters);
            const isSoldOut = item.capacityAvailable === 0;
            const unit = getServicePricingUnit(item);

            return (
              <GuestStaggerItem key={item.id} className="h-full">
                <article className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#25483f]/10 bg-[#fffdfa] shadow-[0_12px_36px_rgba(31,61,53,0.08)] transition-[transform,box-shadow,border-color] duration-200 active:translate-y-px md:hover:-translate-y-1 md:hover:border-[#d7bd61]/70 md:hover:shadow-[0_20px_48px_rgba(31,61,53,0.13)]">
                  {/* Image Header with VietSage Professional Preview Fallback */}
                  <div className="relative aspect-video w-full overflow-hidden bg-[#1b3830]">
                    <VsServiceImagePreview
                      src={item.imageUrls[0]}
                      alt={item.name}
                      categoryName={item.category?.nameVi || item.category?.name}
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
                      Dịch vụ bên ngoài
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
                        <span className="text-xs text-[#5e6a62]">Đơn giá:</span>
                        <span className="text-base font-bold text-[#25483f]">
                          {formatUnitPriceWithUnit(item.unitPrice, item.currency, unit)}
                        </span>
                      </div>

                      {item.waitingMinutes ? (
                        <div className="flex items-center justify-between text-xs text-[#5e6a62]">
                          <span>Thời gian chờ dự kiến:</span>
                          <span className="font-semibold text-[#18211d]">
                            ~{item.waitingMinutes} phút
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Commercial Booking Action Button */}
                    <button
                      type="button"
                      disabled={order.isPending || isSoldOut}
                      onClick={() => openBookingModal(item)}
                      className="vs-touch-button mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(37,72,63,0.15)] transition-all hover:bg-[#19382f] active:bg-[#122b24] disabled:opacity-50"
                    >
                      {isSoldOut ? "Tạm hết lượt" : "Đặt dịch vụ"}
                    </button>
                  </div>
                </article>
              </GuestStaggerItem>
            );
          })}
        </GuestStagger>
      ) : (
        <GuestServiceEmptyState message="Chưa tìm thấy dịch vụ bên ngoài nào phù hợp với từ khóa tìm kiếm." />
      )}

      {/* Orders List Section */}
      {orders.data?.length ? (
        <GuestReveal>
          <section className="mt-12 space-y-4 rounded-[28px] border border-[#25483f]/10 bg-[#fffdfa] p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <VsIcon name="receipt_long" className="text-xl text-[#8a6a13]" />
              <h3 className="vs-display text-xl font-bold text-[#18211d]">
                Đơn dịch vụ bên ngoài của tôi
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {orders.data.map((item) => {
                const orderUnit = getServicePricingUnit(item);
                const badge = getGuestOrderStatusBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#25483f]/10 bg-[#f8f4ea]/60 p-4 text-sm shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-[#fef3c7] px-2 py-0.5 text-[10px] font-extrabold text-[#92400e] border border-[#fde68a]">
                          Dịch vụ bên ngoài
                        </span>
                        <p className="font-bold text-[#18211d]">{item.serviceNameSnapshot}</p>
                      </div>
                      <p className="text-xs font-semibold text-[#5e6a62]">
                        Mã đơn: <span className="font-mono">{item.orderNumber}</span> • Số lượng: {formatQuantityWithUnit(item.quantity, orderUnit)}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${badge.className}`}>
                        {badge.label}
                      </span>
                      <p className="text-sm font-extrabold text-[#18211d]">
                        {Number(item.totalAmount).toLocaleString("vi-VN")} {item.currency}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </GuestReveal>
      ) : null}

      {/* Interactive External Service Booking Modal with Quantity Stepper & Subtotal Calculation */}
      {bookingItem ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onMouseDown={(e) => e.target === e.currentTarget && setBookingItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            className="w-full max-w-lg overflow-hidden rounded-[2.2rem] bg-white p-7 shadow-2xl border border-gray-100 space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-[#8a6a13] uppercase tracking-wider">
                  Đặt dịch vụ bên ngoài
                </p>
                <h2 id="booking-modal-title" className="vs-display mt-1 text-2xl font-extrabold text-[#18211d]">
                  Xác nhận đặt dịch vụ
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBookingItem(null)}
                className="vs-touch-button flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-lg font-bold text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            {/* Info Card with Quantity Stepper & Live Subtotal */}
            {(() => {
              const unit = getServicePricingUnit(bookingItem);
              const providerName =
                bookingItem.serviceTenant?.serviceProfile?.displayName || "Nhà cung cấp";
              const maxCap = bookingItem.capacityAvailable ?? 99;

              return (
                <div className="space-y-4 rounded-[22px] bg-[#f8f4ea] p-5 border border-[#25483f]/15 shadow-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black text-[#8a6a13] uppercase tracking-wider">
                      Dịch vụ đã chọn
                    </span>
                    <span className="text-xl font-extrabold text-[#18211d] leading-snug">
                      {bookingItem.name}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#25483f]/12 pt-3 text-sm">
                    <span className="font-semibold text-[#5e6a62]">Nhà cung cấp</span>
                    <span className="font-bold text-[#18211d] text-base">{providerName}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#25483f]/12 pt-3 text-sm">
                    <span className="font-semibold text-[#5e6a62]">Đơn giá</span>
                    <span className="font-bold text-[#25483f] text-base">
                      {formatUnitPriceWithUnit(bookingItem.unitPrice, bookingItem.currency, unit)}
                    </span>
                  </div>

                  {/* Generic Quantity Stepper Field */}
                  <div className="flex items-center justify-between border-t border-[#25483f]/12 pt-3 text-sm">
                    <span className="font-semibold text-[#5e6a62]">Số lượng</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={bookingQuantity <= 1 || order.isPending}
                        onClick={() => setBookingQuantity((q) => Math.max(1, q - 1))}
                        className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-[#25483f]/30 bg-white font-black text-[#25483f] transition-all hover:bg-[#25483f] hover:text-white disabled:opacity-30"
                      >
                        -
                      </button>
                      <span className="text-base font-extrabold text-[#18211d]">
                        {formatQuantityWithUnit(bookingQuantity, unit)}
                      </span>
                      <button
                        type="button"
                        disabled={bookingQuantity >= maxCap || order.isPending}
                        onClick={() => setBookingQuantity((q) => Math.min(maxCap, q + 1))}
                        className="vs-touch-button flex h-9 w-9 items-center justify-center rounded-full border border-[#25483f]/30 bg-white font-black text-[#25483f] transition-all hover:bg-[#25483f] hover:text-white disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Live Calculated Subtotal */}
                  <div className="flex items-center justify-between border-t border-[#25483f]/12 pt-3 text-sm">
                    <span className="font-semibold text-[#5e6a62]">Thành tiền</span>
                    <span className="text-xl font-black text-[#25483f]">
                      {formatSubtotalAmount(bookingItem.unitPrice, bookingQuantity, bookingItem.currency)}
                    </span>
                  </div>
                </div>
              );
            })()}

            <p className="text-sm font-medium leading-6 text-[#5e6a62] text-center">
              Chi phí sẽ được tự động cộng vào hóa đơn phòng của Quý khách khi trả phòng.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={order.isPending}
                onClick={() => setBookingItem(null)}
                className="vs-touch-button inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-base font-bold text-slate-700 transition-all hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={order.isPending}
                onClick={handleConfirmOrder}
                className="vs-touch-button inline-flex h-12 items-center justify-center rounded-full bg-[#25483f] px-7 text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] disabled:opacity-50"
              >
                {order.isPending ? "Đang xử lý..." : "Đặt dịch vụ ngay"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

