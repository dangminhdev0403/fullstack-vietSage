"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SwalVietSage } from "@/libs/swal";
import { useServicePortal } from "../use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "../types";

function getNextStatus(order: MarketplaceOrder): { label: string; status: string } | null {
  if (order.status === "PENDING") return { label: "Xác nhận đơn", status: "ACCEPTED" };
  if (order.status === "ACCEPTED") return { label: "Bắt đầu chuẩn bị", status: "PREPARING" };
  if (order.status === "PREPARING") {
    return order.serviceModeSnapshot === "DELIVERY_TO_HOTEL"
      ? { label: "Giao hàng tới ks", status: "DELIVERING" }
      : { label: "Sẵn sàng phục vụ", status: "READY" };
  }
  if (order.status === "DELIVERING" || order.status === "READY") {
    return { label: "Hoàn tất đơn", status: "COMPLETED" };
  }
  return null;
}

export function ServiceOrdersView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { transition } = useServicePortal();
  const [filter, setFilter] = useState<string>("ALL");

  const filteredOrders = data.orders.filter((order) => {
    if (filter === "ALL") return true;
    if (filter === "PENDING") return order.status === "PENDING";
    if (filter === "PROCESSING") return order.status === "ACCEPTED" || order.status === "PREPARING";
    if (filter === "READY") return order.status === "READY" || order.status === "DELIVERING";
    if (filter === "COMPLETED") return order.status === "COMPLETED";
    return true;
  });

  const handleTransition = async (order: MarketplaceOrder) => {
    const next = getNextStatus(order);
    if (!next) return;

    const res = await SwalVietSage.fire({
      icon: "question",
      title: `Chuyển trạng thái đơn ${order.orderNumber}?`,
      text: `Bạn có muốn chuyển đơn hàng sang trạng thái "${next.label}" không?`,
      showCancelButton: true,
      confirmButtonText: "Xác nhận chuyển",
      cancelButtonText: "Hủy",
    });

    if (!res.isConfirmed) return;

    transition.mutate(
      { orderId: order.id, toStatus: next.status },
      {
        onSuccess: () => {
          toast.success(`Đã cập nhật trạng thái đơn thành ${next.label}!`);
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
      <header className="space-y-1.5 border-b border-[#e5ddcd] pb-4">
        <h1 className="text-2xl font-extrabold text-[#17201b] sm:text-3xl">Đơn Hàng Trên Nền Tảng Khách Sạn</h1>
        <p className="text-sm font-medium text-[#5a6760]">
          Theo dõi và xử lý tiến độ các đơn hàng yêu cầu dịch vụ từ khách lưu trú tại các khách sạn đối tác.
        </p>
      </header>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e5ddcd] pb-3.5">
        {[
          { key: "ALL", label: "Tất cả đơn", count: data.orders.length },
          { key: "PENDING", label: "Chờ xác nhận", count: data.orders.filter((o) => o.status === "PENDING").length },
          { key: "PROCESSING", label: "Đang xử lý", count: data.orders.filter((o) => o.status === "ACCEPTED" || o.status === "PREPARING").length },
          { key: "READY", label: "Sẵn sàng / Đang giao", count: data.orders.filter((o) => o.status === "READY" || o.status === "DELIVERING").length },
          { key: "COMPLETED", label: "Hoàn tất", count: data.orders.filter((o) => o.status === "COMPLETED").length },
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

      {/* Orders List */}
      {filteredOrders.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const next = getNextStatus(order);
            return (
              <article
                key={order.id}
                className="flex flex-col justify-between space-y-4 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs transition-all hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#eee7d8] pb-3">
                    <span className="font-mono font-bold text-[#17201b] text-base">{order.orderNumber}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        order.status === "PENDING"
                          ? "bg-[#fff3db] text-[#925f0e] border border-[#f3d6a2]"
                          : order.status === "ACCEPTED" || order.status === "PREPARING"
                          ? "bg-[#e8f2ee] text-[#1c553f] border border-[#c1e0d3]"
                          : order.status === "COMPLETED"
                          ? "bg-[#e7f4eb] text-[#16562c] border border-[#bde2c7]"
                          : "bg-[#f2efe9] text-[#46534b] border border-[#e5ddcd]"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-[#17201b] text-base">{order.serviceNameSnapshot}</h3>
                    <p className="text-xs text-[#5a6760] font-medium">
                      Hình thức: {order.serviceModeSnapshot === "DELIVERY_TO_HOTEL" ? "Giao tận phòng" : "Khách đến địa điểm"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#eee7d8] pt-3.5 space-y-3">
                  {next ? (
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void handleTransition(order)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#17201b] text-xs font-bold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50"
                    >
                      ⚡ {next.label}
                    </button>
                  ) : (
                    <div className="text-center text-xs font-bold text-[#16562c] bg-[#e7f4eb] py-2 rounded-xl border border-[#bde2c7]">
                      ✓ Đơn hàng hoàn thành
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#dcd3c1] bg-[#fffcf7] p-10 text-center text-sm font-medium text-[#65726a]">
          Không tìm thấy đơn hàng nào thuộc bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
}
