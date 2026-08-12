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
  if (order.status === "PENDING") return { label: "Xác nhận & tiếp nhận đơn", status: "ACCEPTED", icon: "✓" };
  if (order.status === "ACCEPTED") return { label: "Bắt đầu chuẩn bị", status: "PREPARING", icon: "⚙️" };
  if (order.status === "PREPARING") {
    return order.serviceModeSnapshot === "DELIVERY_TO_HOTEL"
      ? { label: "Bắt đầu giao tận phòng", status: "DELIVERING", icon: "🚚" }
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

  useServiceTenantRealtime({
    onReady: () => setIsConnected(true),
    onExternalOrderCreated: () => {
      toast.info("Có đơn hàng dịch vụ mới từ khách lưu trú!");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e5ddcd] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-3 py-0.5 text-xs font-extrabold text-[#92400e] border border-[#fde68a]">
              🌐 Dịch vụ bên ngoài
            </span>
            <h1 className="text-2xl font-extrabold text-[#17201b] sm:text-3xl">Console Đơn Dịch Vụ Đối Tác</h1>
          </div>
          <p className="text-sm font-medium text-[#5a6760]">
            Tiếp nhận, xử lý fulfillment và cập nhật tiến độ đơn hàng dịch vụ từ khách lưu trú tại các khách sạn đối tác.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
              isConnected
                ? "bg-[#e7f4eb] text-[#16562c] border-[#bde2c7]"
                : "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            {isConnected ? "Realtime Socket Đã Kết Nối" : "Đang Kết Nối Lại..."}
          </span>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e5ddcd] pb-3.5">
        {[
          { key: "ALL", label: "Tất cả đơn", count: ordersList.length },
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
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              filter === tab.key
                ? "bg-[#17201b] text-[#f8f1e6] shadow-xs"
                : "bg-[#f2efe9] text-[#46534b] hover:bg-[#e7e1d5]"
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${filter === tab.key ? "bg-white/20 text-[#f8f1e6]" : "bg-[#e5ddcd] text-[#17201b]"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      {filteredOrders.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const next = getNextStatus(order);
            const badge = getStatusBadge(order.status);
            const createdDateStr = new Date(order.createdAt).toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });

            return (
              <article
                key={order.id}
                className="flex flex-col justify-between space-y-4 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs transition-all hover:shadow-md"
              >
                <div className="space-y-3.5">
                  {/* Top bar */}
                  <div className="flex items-center justify-between border-b border-[#eee7d8] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#17201b] text-base">{order.orderNumber}</span>
                      <span className="inline-flex items-center rounded-md bg-[#fef3c7] px-2 py-0.5 text-[10px] font-extrabold text-[#92400e] border border-[#fde68a]">
                        Dịch vụ bên ngoài
                      </span>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Order Body Details */}
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-[#17201b] text-lg leading-snug">{order.serviceNameSnapshot}</h3>

                    <div className="rounded-xl bg-[#f7f3eb] p-3 space-y-1 text-xs text-[#46534b]">
                      <p className="font-bold text-[#8a6a13] text-sm">
                        Số lượng: {formatQuantityWithUnit(order.quantity, getServicePricingUnit(order))}
                      </p>
                      <p className="font-extrabold text-[#17201b] text-sm">
                        Tổng tiền: {Number(order.totalAmount).toLocaleString("vi-VN")} {order.currency}
                      </p>
                      <p className="font-medium text-[#5a6760]">
                        Hình thức: <b>{order.serviceModeSnapshot === "DELIVERY_TO_HOTEL" ? "🚚 Giao tận phòng khách sạn" : "📍 Khách đến địa điểm dịch vụ"}</b>
                      </p>
                    </div>

                    {order.guestNote ? (
                      <div className="rounded-xl bg-[#fff8eb] border border-[#f3e5ca] p-3 text-xs text-[#78540a]">
                        <p className="font-bold text-[11px] uppercase tracking-wide opacity-80">Ghi chú của khách:</p>
                        <p className="mt-0.5 italic font-medium">&quot;{order.guestNote}&quot;</p>
                      </div>
                    ) : null}

                    {/* Timeline status indicator */}
                    <div className="pt-1">
                      <p className="text-[11px] font-bold text-[#5a6760] uppercase tracking-wider mb-1.5">Tiến độ fulfillment:</p>
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "PENDING" ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>1. Chờ</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "ACCEPTED" || order.status === "PREPARING" ? "bg-purple-100 text-purple-900 border-purple-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>2. Xử lý</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "READY" || order.status === "DELIVERING" ? "bg-cyan-100 text-cyan-900 border-cyan-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>3. Sẵn sàng</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded-md border ${order.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900 border-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>4. Xong</span>
                      </div>
                    </div>

                    <p className="text-[11px] font-medium text-[#7a8780] pt-1">
                      Thời gian đặt: {createdDateStr}
                    </p>
                  </div>
                </div>

                {/* Transition Actions */}
                <div className="border-t border-[#eee7d8] pt-3.5 space-y-2">
                  {next ? (
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void handleTransition(order)}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17201b] text-xs font-extrabold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50 shadow-xs"
                    >
                      {next.icon} {next.label}
                    </button>
                  ) : (
                    <div className="text-center text-xs font-extrabold text-[#16562c] bg-[#e7f4eb] py-2.5 rounded-xl border border-[#bde2c7]">
                      ✓ Đơn hàng đã hoàn thành
                    </div>
                  )}

                  {order.status !== "COMPLETED" && order.status !== "CANCELLED" ? (
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void handleTransition(order, "CANCELLED", "Hủy đơn hàng")}
                      className="w-full text-center text-xs font-bold text-[#9f1239] hover:underline py-1"
                    >
                      Hủy đơn hàng
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#dcd3c1] bg-[#fffcf7] p-12 text-center text-sm font-medium text-[#65726a]">
          Không tìm thấy đơn hàng nào thuộc bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
}
