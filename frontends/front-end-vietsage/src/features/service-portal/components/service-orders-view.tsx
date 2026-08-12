"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SwalVietSage } from "@/libs/swal";
import {
  formatQuantityWithUnit,
  getServicePricingUnit,
} from "@/features/marketplace/utils/marketplace-unit";
import { useServiceTenantRealtime } from "@/features/request-realtime/use-service-tenant-request-realtime";
import { useServicePortal } from "../use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "../types";

function getNextStatus(order: MarketplaceOrder): { label: string; status: string; icon: string } | null {
  if (order.status === "PENDING") return { label: "Xác nhận & Tiếp nhận", status: "ACCEPTED", icon: "✓" };
  if (order.status === "ACCEPTED") return { label: "Bắt đầu chuẩn bị", status: "PREPARING", icon: "⚙️" };
  if (order.status === "PREPARING") {
    return order.serviceModeSnapshot === "DELIVERY_TO_HOTEL"
      ? { label: "Bắt đầu giao hàng", status: "DELIVERING", icon: "🚚" }
      : { label: "Sẵn sàng phục vụ", status: "READY", icon: "✨" };
  }
  if (order.status === "DELIVERING" || order.status === "READY") {
    return { label: "Hoàn tất đơn hàng", status: "COMPLETED", icon: "🎉" };
  }
  return null;
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return { label: "Đang chờ xác nhận", className: "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]" };
    case "ACCEPTED":
      return { label: "Đã tiếp nhận", className: "bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]" };
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

export function ServiceOrdersView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { transition, data: dataQuery } = useServicePortal();
  const [filter, setFilter] = useState<string>("ALL");
  const [isConnected, setIsConnected] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useServiceTenantRealtime({
    onReady: () => setIsConnected(true),
    onExternalOrderCreated: () => {
      toast.info("Có đơn hàng dịch vụ mới!");
      void dataQuery.refetch();
    },
    onExternalOrderStatusChanged: () => {
      void dataQuery.refetch();
    },
    onReconnect: () => {
      setIsConnected(true);
      void dataQuery.refetch();
    },
    onError: () => setIsConnected(false),
  });

  const ordersList = dataQuery.data?.orders ?? data.orders;

  const filteredOrders = useMemo(() => {
    return ordersList.filter((order) => {
      if (filter === "ALL") return true;
      if (filter === "PENDING") return order.status === "PENDING";
      if (filter === "PROCESSING") return order.status === "ACCEPTED" || order.status === "PREPARING";
      if (filter === "READY") return order.status === "READY" || order.status === "DELIVERING";
      if (filter === "COMPLETED") return order.status === "COMPLETED";
      if (filter === "CANCELLED") return order.status === "CANCELLED";
      return true;
    });
  }, [filter, ordersList]);

  const handleTransition = async (order: MarketplaceOrder, targetStatus?: string, customLabel?: string) => {
    const next = targetStatus ? { label: customLabel ?? targetStatus, status: targetStatus } : getNextStatus(order);
    if (!next) return;

    const isCancel = next.status === "CANCELLED";

    const res = await SwalVietSage.fire({
      icon: isCancel ? "warning" : "question",
      title: `${isCancel ? "Hủy" : "Cập nhật"} đơn hàng ${order.orderNumber}?`,
      text: `Bạn có chắc chắn muốn chuyển đơn sang trạng thái "${next.label}" không?`,
      showCancelButton: true,
      confirmButtonText: isCancel ? "Hủy đơn hàng" : "Xác nhận chuyển",
      cancelButtonText: "Quay lại",
    });

    if (!res.isConfirmed) return;

    transition.mutate(
      { orderId: order.id, toStatus: next.status },
      {
        onSuccess: () => {
          toast.success(`Đã cập nhật trạng thái đơn thành ${next.label}!`);
          void dataQuery.refetch();
        },
        onError: () => {
          toast.error("Không thể cập nhật trạng thái đơn hàng.");
        },
      },
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5ddcd] pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-[#fef3c7] px-2.5 py-0.5 text-xs font-extrabold text-[#92400e] border border-[#fde68a]">
              🌐 Dịch vụ bên ngoài
            </span>
            <h1 className="text-xl font-extrabold text-[#17201b] sm:text-2xl">Quản Lý Đơn Dịch Vụ Đối Tác</h1>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[#5a6760]">
            Tiếp nhận và cập nhật tiến độ đơn hàng từ khách lưu trú tại các khách sạn liên kết.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
              isConnected
                ? "bg-[#e7f4eb] text-[#16562c] border-[#bde2c7]"
                : "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            {isConnected ? "Realtime Socket" : "Đang Kết Nối Lại..."}
          </span>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e5ddcd] pb-3">
        {[
          { key: "ALL", label: "Tất cả", count: ordersList.length },
          { key: "PENDING", label: "Chờ xác nhận", count: ordersList.filter((o) => o.status === "PENDING").length },
          { key: "PROCESSING", label: "Đang xử lý", count: ordersList.filter((o) => o.status === "ACCEPTED" || o.status === "PREPARING").length },
          { key: "READY", label: "Sẵn sàng / Đang giao", count: ordersList.filter((o) => o.status === "READY" || o.status === "DELIVERING").length },
          { key: "COMPLETED", label: "Hoàn tất", count: ordersList.filter((o) => o.status === "COMPLETED").length },
          { key: "CANCELLED", label: "Đã hủy", count: ordersList.filter((o) => o.status === "CANCELLED").length },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === tab.key
                ? "bg-[#17201b] text-[#f8f1e6] shadow-2xs"
                : "bg-[#f2efe9] text-[#46534b] hover:bg-[#e7e1d5]"
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${filter === tab.key ? "bg-white/20 text-[#f8f1e6]" : "bg-[#e5ddcd] text-[#17201b]"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* High-Density B2B Order Rows List */}
      {filteredOrders.length > 0 ? (
        <div className="space-y-2.5">
          {filteredOrders.map((order) => {
            const next = getNextStatus(order);
            const badge = getStatusBadge(order.status);
            const isExpanded = expandedOrderId === order.id;
            const createdDateStr = new Date(order.createdAt).toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
            });

            return (
              <article
                key={order.id}
                className="rounded-xl border border-[#e5ddcd] bg-[#fffcf7] p-3.5 sm:p-4 shadow-2xs transition-all hover:border-[#d5cbb8] hover:shadow-xs"
              >
                {/* Compact Row Grid */}
                <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] items-center">
                  {/* Left Column: Order Number, Source Badge, Service Name & Created Time */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[#17201b] text-sm">{order.orderNumber}</span>
                      <span className="inline-flex items-center rounded bg-[#fef3c7] px-1.5 py-0.2 text-[10px] font-extrabold text-[#92400e] border border-[#fde68a]">
                        Dịch vụ bên ngoài
                      </span>
                    </div>
                    <h3 className="font-extrabold text-[#17201b] text-base leading-tight truncate" title={order.serviceNameSnapshot}>
                      {order.serviceNameSnapshot}
                    </h3>
                    <p className="text-[11px] font-medium text-[#7a8780]">
                      {createdDateStr}
                    </p>
                  </div>

                  {/* Middle Column: Quantity + Unit, Total Amount, Delivery Mode & Guest Note preview */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <div>
                      <span className="text-[#5a6760] font-medium">Số lượng: </span>
                      <span className="font-extrabold text-[#8a6a13]">
                        {formatQuantityWithUnit(order.quantity, getServicePricingUnit(order))}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#5a6760] font-medium">Tổng tiền: </span>
                      <span className="font-black text-[#17201b] text-sm">
                        {Number(order.totalAmount).toLocaleString("vi-VN")} {order.currency}
                      </span>
                    </div>

                    <div>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#46534b] bg-[#f2efe9] px-2 py-0.5 rounded-md border border-[#e5ddcd] text-[11px]">
                        {order.serviceModeSnapshot === "DELIVERY_TO_HOTEL" ? "🚚 Giao tận phòng" : "📍 Tại địa điểm"}
                      </span>
                    </div>

                    {order.guestNote ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(order.id)}
                        className="inline-flex items-center gap-1 font-bold text-[#925f0e] bg-[#fff3db] px-2 py-0.5 rounded-md border border-[#f3d6a2] text-[11px] hover:bg-[#fde8c2]"
                      >
                        💬 Ghi chú
                      </button>
                    ) : null}
                  </div>

                  {/* Right Column: Fulfillment Status + Action Buttons */}
                  <div className="flex items-center gap-2 justify-between lg:justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#eee7d8]">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${badge.className}`}>
                      {badge.label}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {next ? (
                        <button
                          type="button"
                          disabled={transition.isPending}
                          onClick={() => void handleTransition(order)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#17201b] px-3 text-xs font-extrabold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50 shadow-2xs"
                        >
                          <span>{next.icon}</span>
                          <span>{next.label}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center text-xs font-extrabold text-[#16562c] bg-[#e7f4eb] px-3 py-1.5 rounded-lg border border-[#bde2c7]">
                          ✓ Hoàn thành
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(order.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5ddcd] bg-white text-xs font-bold text-[#46534b] hover:bg-[#f2efe9]"
                        title="Xem chi tiết"
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Details Drawer */}
                {isExpanded ? (
                  <div className="mt-3 border-t border-[#eee7d8] pt-3 space-y-3.5 text-xs animate-in fade-in">
                    {order.guestNote ? (
                      <div className="rounded-lg bg-[#fff8eb] border border-[#f3e5ca] p-2.5 text-[#78540a]">
                        <span className="font-extrabold text-[11px] uppercase tracking-wide opacity-80">Ghi chú từ khách hàng: </span>
                        <span className="italic font-medium">&quot;{order.guestNote}&quot;</span>
                      </div>
                    ) : null}

                    {/* Compact Fulfillment Timeline */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f3eb] p-2.5 border border-[#e5ddcd]">
                      <span className="font-extrabold text-[#5a6760] uppercase text-[10px] tracking-wider">Tiến độ đơn:</span>
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "PENDING" ? "bg-amber-100 text-amber-900 border-amber-300 font-extrabold" : "bg-white text-slate-500 border-slate-200"}`}>1. Chờ</span>
                        <span className="text-slate-400">→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "ACCEPTED" || order.status === "PREPARING" ? "bg-purple-100 text-purple-900 border-purple-300 font-extrabold" : "bg-white text-slate-500 border-slate-200"}`}>2. Xử lý</span>
                        <span className="text-slate-400">→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "READY" || order.status === "DELIVERING" ? "bg-cyan-100 text-cyan-900 border-cyan-300 font-extrabold" : "bg-white text-slate-500 border-slate-200"}`}>3. Sẵn sàng</span>
                        <span className="text-slate-400">→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold" : "bg-white text-slate-500 border-slate-200"}`}>4. Xong</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-[#7a8780]">ID Đơn: {order.id}</span>
                      {order.status !== "COMPLETED" && order.status !== "CANCELLED" ? (
                        <button
                          type="button"
                          disabled={transition.isPending}
                          onClick={() => void handleTransition(order, "CANCELLED", "Hủy đơn hàng")}
                          className="font-bold text-[#9f1239] hover:underline"
                        >
                          Hủy đơn hàng này
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#dcd3c1] bg-[#fffcf7] p-8 text-center text-sm font-medium text-[#65726a]">
          Không tìm thấy đơn hàng nào thuộc bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
}

