"use client";

import Link from "next/link";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  calculateOrderFinancials,
  getPartnerAuthorizedOrderItems,
  isTerminalOrderStatus,
} from "@/features/marketplace/utils/marketplace-unit";
import { useServicePortal } from "../use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "../types";

function getNextStatus(order: MarketplaceOrder): { label: string; status: string } | null {
  if (isTerminalOrderStatus(order.status)) return null;
  if (order.status === "PENDING") return { label: "Xác nhận đơn", status: "CONFIRMED" };
  if (
    order.status === "CONFIRMED" ||
    order.status === "ACCEPTED" ||
    order.status === "PREPARING" ||
    order.status === "DELIVERING" ||
    order.status === "READY"
  ) {
    return { label: "Hoàn tất đơn", status: "COMPLETED" };
  }
  return null;
}

export function ServiceDashboardView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { transition, financialSummary } = useServicePortal();
  const pendingOrders = data.orders.filter((o) => o.status === "PENDING");
  const activeOrders = data.orders.filter((o) => !isTerminalOrderStatus(o.status));


  const financial = financialSummary.data;

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#17201b] via-[#1f2e26] to-[#111814] p-6 sm:p-8 text-[#f8f1e6] shadow-md border border-[#2b3a31]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#e8b363]/12 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#e8b363]/15 px-3.5 py-1 text-xs font-semibold text-[#f5c77e] backdrop-blur-md border border-[#e8b363]/25">
              <span className="h-2 w-2 rounded-full bg-[#e8b363] animate-pulse" />
              Cổng đối tác dịch vụ
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#fff8e8]">
              {data.profile.displayName}
            </h1>
            {data.profile.address && (
              <p className="text-sm font-medium text-[#d7cbb8] flex items-center gap-2">
                <span>📍</span> {data.profile.address}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/service/catalog"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#e8b363] px-4.5 text-sm font-bold text-[#17201b] shadow-sm transition-all hover:bg-[#dfa652]"
            >
              <span>+</span> Thêm dịch vụ
            </Link>
            <Link
              href="/service/orders"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4.5 text-sm font-semibold text-[#f8f1e6] backdrop-blur-md transition-colors hover:bg-white/20 border border-white/15"
            >
              📋 Đơn hàng ({pendingOrders.length} mới)
            </Link>
          </div>
        </div>
      </section>

      {/* Financial Overview Section */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#17201b] flex items-center gap-2">
          <span>💰</span> Doanh số & Công nợ quyết toán với Khách sạn
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Gross Sales */}
          <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5a6760]">Doanh số dịch vụ</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ee] text-[#1c553f]">
                <VsIcon name="payments" className="text-xl" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#17201b]">
              {(financial?.grossSalesAmount ?? 0).toLocaleString("vi-VN")} VND
            </div>
            <p className="text-xs text-[#5a6760]">
              {financial?.completedOrdersCount ?? 0} đơn hoàn thành
            </p>
          </div>

          {/* Card 2: Collected by Hotel */}
          <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5a6760]">Hotel đã thu hộ</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4ebd9] text-[#8c6d29]">
                <VsIcon name="account_balance_wallet" className="text-xl" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#8c6d29]">
              {(financial?.hotelCollectedAmount ?? 0).toLocaleString("vi-VN")} VND
            </div>
            <p className="text-xs text-[#5a6760]">Khách thanh toán qua KS</p>
          </div>

          {/* Card 3: Outstanding Partner Payable */}
          <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5a6760]">Công nợ chưa quyết toán</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff3db] text-[#925f0e]">
                <VsIcon name="pending_actions" className="text-xl" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#b2720d]">
              {(financial?.outstandingAmount ?? 0).toLocaleString("vi-VN")} VND
            </div>
            <p className="text-xs text-[#5a6760]">Chờ quyết toán từ KS</p>
          </div>

          {/* Card 4: Settled Amount */}
          <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5a6760]">Đã quyết toán</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f4eb] text-[#16562c]">
                <VsIcon name="check_circle" className="text-xl" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#16562c]">
              {(financial?.settledAmount ?? 0).toLocaleString("vi-VN")} VND
            </div>
            <p className="text-xs text-[#5a6760]">Đã thực thu về đối tác</p>
          </div>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Services */}
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5a6760]">Tổng dịch vụ</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4ebd9] text-[#8c6d29]">
              <VsIcon name="inventory_2" className="text-xl" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#17201b]">{data.services.length}</span>
            <span className="text-xs font-medium text-[#5a6760]">dịch vụ đang mở</span>
          </div>
          <Link href="/service/catalog" className="inline-block text-xs font-bold text-[#8c6d29] hover:underline">
            Quản lý menu dịch vụ ➔
          </Link>
        </div>

        {/* Card 2: Total Orders */}
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5a6760]">Đơn hàng trên nền tảng</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ee] text-[#1c553f]">
              <VsIcon name="assignment" className="text-xl" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#17201b]">{data.orders.length}</span>
            <span className="text-xs font-medium text-[#5a6760]">lượt đặt hàng</span>
          </div>
          <Link href="/service/orders" className="inline-block text-xs font-bold text-[#1c553f] hover:underline">
            Xem lịch sử đơn ➔
          </Link>
        </div>

        {/* Card 3: Pending Orders */}
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5a6760]">Đơn chờ tiếp nhận</span>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${pendingOrders.length > 0 ? "bg-[#fff3db] text-[#925f0e] animate-pulse" : "bg-[#f2efe9] text-[#5a6760]"}`}>
              <VsIcon name="notifications" className="text-xl" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${pendingOrders.length > 0 ? "text-[#b2720d]" : "text-[#17201b]"}`}>
              {pendingOrders.length}
            </span>
            <span className="text-xs font-medium text-[#5a6760]">cần xử lý ngay</span>
          </div>
          <Link href="/service/orders" className="inline-block text-xs font-bold text-[#925f0e] hover:underline">
            Xử lý đơn ngay ➔
          </Link>
        </div>

        {/* Card 4: Location Status */}
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5a6760]">Vị trí trên nền tảng</span>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${data.profile.locationVerifiedAt ? "bg-[#e8f2ee] text-[#1c553f]" : "bg-[#fbebee] text-[#aa2d41]"}`}>
              <VsIcon name="verified_user" className="text-xl" />
            </div>
          </div>
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-[#17201b] block">
              {data.profile.locationVerifiedAt ? "Đã xác minh GPS" : "Chưa cập nhật vị trí"}
            </span>
            <span className="text-xs text-[#5a6760] block truncate">
              {data.profile.googleMapsUrl ? "Maps URL khả dụng" : "Vui lòng cập nhật tọa độ"}
            </span>
          </div>
          <Link href="/service/settings" className="inline-block text-xs font-bold text-[#8c6d29] hover:underline">
            Cập nhật vị trí ➔
          </Link>
        </div>
      </section>

      {/* Main Grid: Recent Orders & Service Highlights */}
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Active & Recent Orders Section */}
        <div className="space-y-4 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#eee7d8] pb-3.5">
            <h2 className="text-lg font-bold text-[#17201b] flex items-center gap-2">
              <span>📋</span> Đơn hàng đang xử lý
              <span className="rounded-full bg-[#e8f2ee] px-2.5 py-0.5 text-xs font-bold text-[#1c553f] border border-[#c1e0d3]">
                {activeOrders.length}
              </span>
            </h2>
            <Link href="/service/orders" className="text-xs font-bold text-[#8c6d29] hover:underline">
              Tất cả đơn hàng
            </Link>
          </div>

          {activeOrders.length > 0 ? (
            <div className="space-y-3">
              {activeOrders.slice(0, 5).map((order) => {
                const next = getNextStatus(order);
                const isSettled = order.settlement?.status === "SETTLED";
                const authorizedItems = getPartnerAuthorizedOrderItems(order, data.profile);
                const financials = calculateOrderFinancials(order, authorizedItems);
                const firstItem = authorizedItems[0];
                const serviceLabel = firstItem
                  ? `${firstItem.serviceName}${authorizedItems.length > 1 ? ` (+${authorizedItems.length - 1} mục khác)` : ""}`
                  : order.serviceNameSnapshot;

                return (
                  <div
                    key={order.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#eae3d5] bg-[#f9f6f0] p-4 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-white shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-bold text-[#17201b] text-base">{order.orderNumber}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          order.status === "PENDING"
                            ? "bg-[#fff3db] text-[#925f0e] border border-[#f3d6a2]"
                            : order.status === "ACCEPTED"
                            ? "bg-[#e8f2ee] text-[#1c553f] border border-[#c1e0d3]"
                            : "bg-[#e7f4eb] text-[#16562c] border border-[#bde2c7]"
                        }`}>
                          {order.status}
                        </span>
                        {/* Settlement Status Badge */}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          isSettled
                            ? "bg-[#e7f4eb] text-[#16562c] border border-[#bde2c7]"
                            : "bg-[#fff3db] text-[#925f0e] border border-[#f3d6a2]"
                        }`}>
                          {isSettled ? "✓ Đã quyết toán" : "⌛ Chưa quyết toán"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#35433a]">
                        {serviceLabel} — <span className="font-bold text-[#8c6d29]">{financials.partnerSubtotal.toLocaleString("vi-VN")} {financials.currency}</span>
                      </p>
                      {order.hotel?.name && (
                        <p className="text-xs text-[#5a6760]">🏨 {order.hotel.name}</p>
                      )}
                    </div>

                    {next && !isTerminalOrderStatus(order.status) && (
                      <button
                        type="button"
                        disabled={transition.isPending || isTerminalOrderStatus(order.status)}
                        onClick={() => {
                          if (isTerminalOrderStatus(order.status)) return;
                          transition.mutate({ orderId: order.id, toStatus: next.status });
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-[#17201b] px-4 text-xs font-bold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50"
                      >
                        {next.label}
                      </button>
                    )}
                  </div>
                );
              })}

            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#dcd3c1] p-8 text-center text-sm font-medium text-[#65726a]">
              Hiện chưa có đơn hàng mới nào cần xử lý.
            </div>
          )}
        </div>

        {/* Services Quick View Sidebar */}
        <div className="space-y-4 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#eee7d8] pb-3.5">
            <h2 className="text-lg font-bold text-[#17201b] flex items-center gap-2">
              <span>🛍️</span> Dịch vụ nổi bật
            </h2>
            <Link href="/service/catalog" className="text-xs font-bold text-[#8c6d29] hover:underline">
              Thêm mới
            </Link>
          </div>

          {data.services.length > 0 ? (
            <div className="space-y-3">
              {data.services.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-xl border border-[#eae3d5] bg-[#f9f6f0] p-3.5 space-y-1">
                  <div className="font-bold text-[#17201b] text-sm">{item.name}</div>
                  <div className="flex items-center justify-between text-xs text-[#46534b] font-semibold">
                    <span className="text-[#8c6d29] text-sm font-bold">
                      {Number(item.unitPrice).toLocaleString("vi-VN")} VND
                    </span>
                    <span>Chờ {item.waitingMinutes} phút</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#dcd3c1] p-6 text-center text-sm font-medium text-[#65726a]">
              Chưa tạo dịch vụ nào. Hãy tạo dịch vụ đầu tiên!
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
