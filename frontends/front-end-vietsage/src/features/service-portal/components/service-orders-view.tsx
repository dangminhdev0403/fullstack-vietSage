"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SwalVietSage } from "@/libs/swal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortDirection,
} from "@/components/ui/data-table";
import {
  calculateOrderFinancials,
  getPartnerAuthorizedOrderItems,
  getServicePricingUnit,
  isTerminalOrderStatus,
} from "@/features/marketplace/utils/marketplace-unit";
import { useServicePortal } from "../use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "../types";

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return {
        label: "Chờ xác nhận",
        className: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
      };
    case "CONFIRMED":
    case "PROCESSING":
    case "ACCEPTED":
    case "PREPARING":
    case "DELIVERING":
    case "READY":
      return {
        label: "Đang xử lý",
        className: "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
      };
    case "COMPLETED":
      return {
        label: "Hoàn thành",
        className: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
      };
    case "CANCELLED":
    case "REJECTED":
      return {
        label: "Đã hủy",
        className: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      };
  }
}

function getNextStatus(order: MarketplaceOrder): { label: string; status: string; icon: string } | null {
  if (isTerminalOrderStatus(order.status)) return null;
  if (order.status === "PENDING") {
    return { label: "Xác nhận", status: "CONFIRMED", icon: "check" };
  }
  if (
    order.status === "CONFIRMED" ||
    order.status === "PROCESSING" ||
    order.status === "ACCEPTED" ||
    order.status === "PREPARING" ||
    order.status === "DELIVERING" ||
    order.status === "READY"
  ) {
    return { label: "Hoàn thành", status: "COMPLETED", icon: "task_alt" };
  }
  return null;
}

function formatOrderDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function ServiceOrdersView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { transition, data: dataQuery } = useServicePortal();
  const isConnected = true;
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);
  const [sortState, setSortState] = useState<{
    key: string;
    direction: DataTableSortDirection;
  }>({ key: "created", direction: "desc" });

  const ordersList = dataQuery.data?.orders ?? data.orders;

  const filteredOrders = useMemo(() => {
    return ordersList.filter((order) => {
      if (statusFilter === "PENDING" && order.status !== "PENDING") return false;
      if (
        statusFilter === "CONFIRMED" &&
        !(
          order.status === "CONFIRMED" ||
          order.status === "ACCEPTED" ||
          order.status === "PREPARING" ||
          order.status === "READY" ||
          order.status === "DELIVERING" ||
          order.status === "PROCESSING"
        )
      ) {
        return false;
      }
      if (statusFilter === "COMPLETED" && order.status !== "COMPLETED") return false;
      if (statusFilter === "CANCELLED" && order.status !== "CANCELLED" && order.status !== "REJECTED") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchNumber = order.orderNumber.toLowerCase().includes(query);
        const matchService = order.serviceNameSnapshot.toLowerCase().includes(query);
        const matchGuest = order.stay?.guestDisplayName?.toLowerCase().includes(query) ?? false;
        const matchHotel = order.hotel?.name?.toLowerCase().includes(query) ?? false;
        const matchRoom = order.stay?.room?.roomNumber?.toLowerCase().includes(query) ?? false;
        if (!matchNumber && !matchService && !matchGuest && !matchHotel && !matchRoom) {
          return false;
        }
      }

      return true;
    }).sort((left, right) => {
      const multiplier = sortState.direction === "asc" ? 1 : -1;
      let leftVal: string | number = left.createdAt;
      let rightVal: string | number = right.createdAt;

      if (sortState.key === "orderNumber") {
        leftVal = left.orderNumber;
        rightVal = right.orderNumber;
      } else if (sortState.key === "service") {
        leftVal = left.serviceNameSnapshot;
        rightVal = right.serviceNameSnapshot;
      } else if (sortState.key === "guest") {
        leftVal = left.stay?.guestDisplayName ?? "";
        rightVal = right.stay?.guestDisplayName ?? "";
      } else if (sortState.key === "amount") {
        const leftAuth = getPartnerAuthorizedOrderItems(left, data.profile);
        const rightAuth = getPartnerAuthorizedOrderItems(right, data.profile);
        leftVal = calculateOrderFinancials(left, leftAuth).partnerSubtotal;
        rightVal = calculateOrderFinancials(right, rightAuth).partnerSubtotal;
      } else if (sortState.key === "status") {
        leftVal = left.status;
        rightVal = right.status;
      } else {
        leftVal = new Date(left.createdAt).getTime();
        rightVal = new Date(right.createdAt).getTime();
      }

      if (typeof leftVal === "number" && typeof rightVal === "number") {
        return (leftVal - rightVal) * multiplier;
      }
      return String(leftVal).localeCompare(String(rightVal), undefined, { numeric: true }) * multiplier;
    });
  }, [ordersList, searchQuery, sortState, statusFilter, data.profile]);

  const handleTransition = async (order: MarketplaceOrder, targetStatus?: string, customLabel?: string) => {
    if (isTerminalOrderStatus(order.status)) {
      toast.error("Đơn hàng đã ở trạng thái kết thúc, không thể thay đổi.");
      return;
    }
    const next = targetStatus ? { label: customLabel ?? targetStatus, status: targetStatus } : getNextStatus(order);
    if (!next) return;

    const isCancel = next.status === "CANCELLED";

    const res = await SwalVietSage.fire({
      icon: isCancel ? "warning" : "question",
      title: `${isCancel ? "Hủy" : "Cập nhật"} đơn hàng ${order.orderNumber}?`,
      text: `Bạn có chắc chắn muốn chuyển đơn sang trạng thái "${next.label}" không?`,
      showCancelButton: true,
      confirmButtonText: isCancel ? "Xác nhận hủy" : "Xác nhận chuyển",
      cancelButtonText: "Đóng",
    });

    if (!res.isConfirmed) return;

    transition.mutate(
      { orderId: order.id, toStatus: next.status },
      {
        onSuccess: () => {
          toast.success(`Đã cập nhật trạng thái đơn thành ${next.label}!`);
          if (selectedOrder?.id === order.id) {
            setSelectedOrder((prev) => (prev ? { ...prev, status: next.status } : null));
          }
          void dataQuery.refetch();
        },
        onError: () => {
          toast.error("Không thể cập nhật trạng thái đơn hàng.");
        },
      },
    );
  };

  const columns: DataTableColumn<MarketplaceOrder>[] = [
    {
      key: "orderNumber",
      header: "Mã đơn",
      sortable: true,
      cell: (order) => {
        const shortCode =
          order.orderNumber.length > 14
            ? `#${order.orderNumber.slice(0, 4)}...${order.orderNumber.slice(-6)}`
            : `#${order.orderNumber}`;
        return (
          <div className="space-y-1 py-1" title={order.orderNumber}>
            <div className="font-mono font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">
              {shortCode}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {order.serviceModeSnapshot === "DELIVERY_TO_HOTEL" ? "🚚 Giao tận phòng" : "📍 Tại địa điểm"}
              </span>
              <span>·</span>
              <span>{formatOrderDateTime(order.createdAt)}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "service",
      header: "Dịch vụ / Khách",
      sortable: true,
      cell: (order) => {
        const authorizedItems = getPartnerAuthorizedOrderItems(order, data.profile);
        const firstItem = authorizedItems[0] ?? { serviceName: order.serviceNameSnapshot };
        return (
          <div className="min-w-0 max-w-[260px] space-y-1 py-1">
            <div className="truncate font-bold text-sm text-slate-900 dark:text-white leading-snug" title={firstItem.serviceName}>
              {firstItem.serviceName}
              {authorizedItems.length > 1 ? (
                <span className="ml-1.5 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-900 border border-indigo-200">
                  +{authorizedItems.length - 1} mục khác
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="truncate" title={order.stay?.guestDisplayName ?? "Khách lưu trú"}>
                {order.stay?.guestDisplayName ?? "Khách lưu trú"}
              </span>
              <span className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                {order.stay?.room?.roomNumber ? `Phòng ${order.stay.room.roomNumber}` : "Phòng -"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "quantity",
      header: "SL",
      sortable: true,
      className: "text-right whitespace-nowrap",
      cell: (order) => {
        const authorizedItems = getPartnerAuthorizedOrderItems(order, data.profile);
        const totalQty = authorizedItems.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
        const firstItem = authorizedItems[0];
        const unit = firstItem?.pricingUnit || getServicePricingUnit(order);
        return (
          <div className="text-right font-bold text-sm text-slate-900 dark:text-slate-100 py-1">
            {totalQty} {unit}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Doanh thu đối tác",
      sortable: true,
      className: "text-right whitespace-nowrap",
      cell: (order) => {
        const authorizedItems = getPartnerAuthorizedOrderItems(order, data.profile);
        const financials = calculateOrderFinancials(order, authorizedItems);
        return (
          <div className="text-right py-1 space-y-0.5">
            <div className="font-black text-base text-emerald-700 dark:text-emerald-400">
              {financials.partnerSubtotal.toLocaleString("vi-VN")} {financials.currency}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              {authorizedItems.length > 1 ? `${authorizedItems.length} hạng mục` : "Tạm tính đối tác"}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      sortable: true,
      className: "text-center whitespace-nowrap",
      cell: (order) => {
        const badge = getStatusBadge(order.status);
        return (
          <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-black shrink-0 border ${badge.className}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Thao tác",
      sortable: false,
      className: "text-right whitespace-nowrap min-w-[170px]",
      cell: (order) => {
        const isFinished = isTerminalOrderStatus(order.status);
        if (isFinished) {
          return <span className="text-xs font-medium text-slate-400">-</span>;
        }

        const next = getNextStatus(order);
        return (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap py-1">
            {next ? (
              <button
                type="button"
                disabled={transition.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleTransition(order);
                }}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#00003c] px-3 py-1.5 text-xs font-bold text-white transition-all shadow-2xs hover:bg-[#1a1a5c] active:scale-[0.97] disabled:opacity-50"
              >
                <VsIcon name={next.icon} className="text-xs opacity-90" />
                <span>{next.label}</span>
              </button>
            ) : null}

            {order.status === "PENDING" ? (
              <button
                type="button"
                disabled={transition.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleTransition(order, "CANCELLED", "Hủy");
                }}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-50"
              >
                <VsIcon name="close" className="text-xs opacity-90" />
                <span>Hủy</span>
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const pendingCount = ordersList.filter((o) => o.status === "PENDING").length;
  const confirmedCount = ordersList.filter(
    (o) =>
      o.status === "CONFIRMED" ||
      o.status === "ACCEPTED" ||
      o.status === "PREPARING" ||
      o.status === "READY" ||
      o.status === "DELIVERING" ||
      o.status === "PROCESSING"
  ).length;
  const completedCount = ordersList.filter((o) => o.status === "COMPLETED").length;
  const cancelledCount = ordersList.filter((o) => o.status === "CANCELLED" || o.status === "REJECTED").length;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto p-2 sm:p-4">
      {/* Top Header Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">
              🌐 Dịch vụ bên ngoài
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Quản lý đơn dịch vụ đối tác
            </h1>
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 font-medium">
            Tiếp nhận và cập nhật tiến độ đơn hàng dịch vụ từ khách lưu trú tại các khách sạn đối tác liên kết.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              void SwalVietSage.fire({
                title: "🔑 Kiểm tra mã dịch vụ",
                input: "text",
                inputPlaceholder: "Nhập mã dịch vụ (ví dụ: VS-85CE77 hoặc EDE749189F68)",
                showCancelButton: true,
                confirmButtonText: "Xác nhận",
                cancelButtonText: "Đóng",
                inputValidator: (value) => {
                  if (!value || !value.trim()) {
                    return "Vui lòng nhập mã dịch vụ!";
                  }
                  return null;
                },
              }).then(async (result) => {
                if (!result.isConfirmed || !result.value) return;
                const code = result.value.trim();
                try {
                  const resp = await fetch("/api/service-portal/vouchers/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                  });

                  const resJson = (await resp.json().catch(() => null)) as {
                    data?: {
                      valid?: boolean;
                      order?: MarketplaceOrder;
                      message?: string;
                    };
                    valid?: boolean;
                    order?: MarketplaceOrder;
                    message?: string;
                  } | null;

                  const body = resJson?.data ?? resJson;
                  const isValid = Boolean(body?.valid && body?.order);

                  if (!resp.ok || !isValid || !body?.order) {
                    await SwalVietSage.fire({
                      icon: "error",
                      title: "Mã dịch vụ không hợp lệ",
                      text: body?.message || "Mã dịch vụ không tồn tại hoặc không thuộc quyền quản lý.",
                    });
                    return;
                  }

                  toast.success("Mã dịch vụ hợp lệ");
                  setSelectedOrder(body.order);
                } catch (error) {
                  const msg = error instanceof Error ? error.message : "Không thể xác minh mã dịch vụ. Vui lòng thử lại.";
                  toast.error(msg);
                }
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#00003c] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1a1a5c] transition-all shadow-2xs active:scale-[0.98]"
          >
            <VsIcon name="key" className="text-sm" />
            <span>🔑 Kiểm tra mã dịch vụ</span>
          </button>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
              isConnected
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            {isConnected ? "Realtime Socket kết nối" : "Đang kết nối lại..."}
          </span>
        </div>
      </header>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "ALL", label: "Tất cả", count: ordersList.length },
            { key: "PENDING", label: "Chờ xác nhận", count: pendingCount },
            { key: "CONFIRMED", label: "Đã tiếp nhận", count: confirmedCount },
            { key: "COMPLETED", label: "Hoàn tất", count: completedCount },
            { key: "CANCELLED", label: "Đã hủy", count: cancelledCount },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === tab.key
                  ? "bg-[#00003c] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                  statusFilter === tab.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-800"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã đơn, dịch vụ, phòng..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* Main DataTable View */}
      <div className="rounded-xl border border-slate-200 shadow-2xs overflow-x-auto bg-white">
        <DataTable
          columns={columns}
          data={filteredOrders}
          getRowKey={(order) => order.id}
          emptyMessage="Không tìm thấy đơn dịch vụ nào phù hợp với bộ lọc hiện tại."
          onRowClick={(order) => setSelectedOrder(order)}
          sort={{
            key: sortState.key,
            direction: sortState.direction,
            onSortChange: (key, direction) => setSortState({ key, direction }),
          }}
          header={
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Danh sách đơn dịch vụ ({filteredOrders.length} / {ordersList.length})
              </p>
            </div>
          }
        />
      </div>

      {/* Detail Modal / Drawer */}
      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3.5">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-base font-bold text-[#00003c]">{selectedOrder.orderNumber}</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold border ${
                      getStatusBadge(selectedOrder.status).className
                    }`}
                  >
                    {getStatusBadge(selectedOrder.status).label}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Thời gian đặt: {formatOrderDateTime(selectedOrder.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors shadow-2xs"
                title="Đóng cửa sổ chi tiết"
              >
                <VsIcon name="close" className="text-sm" />
                <span>Đóng</span>
              </button>
            </div>

            {/* HERO MAIN CARD: Dịch vụ & Doanh thu đối tác */}
            {(() => {
              const authorizedItems = getPartnerAuthorizedOrderItems(selectedOrder, data.profile);
              const financials = calculateOrderFinancials(selectedOrder, authorizedItems);

              return (
                <div className="rounded-2xl border-2 border-emerald-600/30 bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/30 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-900/10 pb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-extrabold text-white tracking-wide shadow-2xs">
                      <VsIcon name="room_service" className="text-xs" />
                      <span>DỊCH VỤ THUỘC QUYỀN ĐỐI TÁC</span>
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-500">
                      Mã đơn: #{selectedOrder.orderNumber}
                    </span>
                  </div>

                  {/* List of authorized items */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Hạng mục dịch vụ ủy quyền ({authorizedItems.length}):
                    </p>
                    <div className="border border-emerald-800/10 rounded-xl overflow-hidden bg-white/90">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-emerald-50/60 border-b border-emerald-800/10 font-bold text-slate-600">
                          <tr>
                            <th className="p-2.5">Tên dịch vụ</th>
                            <th className="p-2.5 text-center">Số lượng</th>
                            <th className="p-2.5 text-right">Đơn giá</th>
                            <th className="p-2.5 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {authorizedItems.map((item, idx) => (
                            <tr key={item.id ?? idx}>
                              <td className="p-2.5 font-bold text-slate-900">{item.serviceName}</td>
                              <td className="p-2.5 text-center text-slate-700 font-semibold">{item.quantity} {item.pricingUnit ?? ""}</td>
                              <td className="p-2.5 text-right text-slate-700 font-mono">{Number(item.unitPrice).toLocaleString("vi-VN")} {financials.currency}</td>
                              <td className="p-2.5 text-right font-bold text-emerald-800 font-mono">{(Number(item.unitPrice) * Number(item.quantity)).toLocaleString("vi-VN")} {financials.currency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pricing & Financial Breakdown (Hides Hotel Fee) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-white/90 p-4 border border-emerald-800/10 shadow-2xs">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Doanh thu đối tác (Partner Subtotal)</p>
                      <p className="text-xl font-black text-emerald-700 mt-0.5">{financials.partnerSubtotal.toLocaleString("vi-VN")} {financials.currency}</p>
                      <span className="text-[10px] text-slate-500 font-medium">Doanh thu thực nhận của đối tác</span>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Trạng thái quyết toán</p>
                      <div className="mt-1">
                        {selectedOrder.settlement?.status === "SETTLED" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            ✓ Đã nhận quyết toán
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                            ⌛ Chờ khách sạn quyết toán
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">Hạch toán công nợ từ khách sạn</span>
                    </div>
                  </div>

                  {/* Guest Note block */}
                  {selectedOrder.guestNote ? (
                    <div className="rounded-xl bg-amber-100/60 p-3.5 border border-amber-300/80 space-y-1">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                        <VsIcon name="edit_note" className="text-sm" />
                        <span>Ghi chú từ khách hàng</span>
                      </p>
                      <p className="text-xs font-semibold italic text-amber-950">&quot;{selectedOrder.guestNote}&quot;</p>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* SECONDARY CARD: Khách hàng & Khách sạn */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Thông tin Phục vụ Khách hàng</p>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Khách hàng:</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedOrder.stay?.guestDisplayName ?? "Khách lưu trú"}
                  </p>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Địa điểm phục vụ:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-[#00003c] bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 text-xs">
                      {selectedOrder.stay?.room?.roomNumber ? `Phòng ${selectedOrder.stay.room.roomNumber}` : "Phòng -"}
                    </span>
                    {selectedOrder.hotel?.name ? (
                      <span className="text-slate-600 font-medium truncate">
                        {selectedOrder.hotel.name}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Hotel Coordination & Voucher Details */}
            {selectedOrder.hotelCoordinationStatus === "ACKNOWLEDGED" || selectedOrder.hotelCoordinationStatus === "VOUCHER_ISSUED" || selectedOrder.voucher ? (
              <div className="rounded-xl bg-teal-50 p-4 border border-teal-200 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-900">🤝 Phối hợp từ Khách sạn</p>
                <div className="text-xs text-teal-950 font-medium space-y-0.5">
                  <p>
                    Trạng thái tiếp nhận: <span className="font-bold text-teal-950">✓ Khách sạn đã tiếp nhận thông tin đơn hàng</span>
                  </p>
                  {selectedOrder.voucher ? (
                    <p>
                      Mã phiếu dịch vụ: <span className="font-bold text-indigo-950 font-mono">{selectedOrder.voucher.voucherNumber}</span>
                      {selectedOrder.voucher.status ? ` (${selectedOrder.voucher.status})` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Step Progression Timeline */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Tiến độ đơn hàng</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span className={`px-2.5 py-1 rounded-lg border ${selectedOrder.status === "PENDING" ? "bg-amber-100 text-amber-900 border-amber-300 font-bold" : "bg-white text-slate-500 border-slate-200"}`}>
                  1. Chờ xác nhận
                </span>
                <span className="text-slate-400 font-bold">→</span>
                <span className={`px-2.5 py-1 rounded-lg border ${selectedOrder.status === "CONFIRMED" || selectedOrder.status === "ACCEPTED" || selectedOrder.status === "PREPARING" || selectedOrder.status === "READY" || selectedOrder.status === "DELIVERING" || selectedOrder.status === "PROCESSING" ? "bg-blue-100 text-blue-900 border-blue-300 font-bold" : "bg-white text-slate-500 border-slate-200"}`}>
                  2. Đang xử lý
                </span>
                <span className="text-slate-400 font-bold">→</span>
                <span className={`px-2.5 py-1 rounded-lg border ${selectedOrder.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold" : selectedOrder.status === "CANCELLED" || selectedOrder.status === "REJECTED" ? "bg-rose-100 text-rose-900 border-rose-300 font-bold" : "bg-white text-slate-500 border-slate-200"}`}>
                  {selectedOrder.status === "CANCELLED" || selectedOrder.status === "REJECTED" ? "3. Đã hủy" : "3. Hoàn tất"}
                </span>
              </div>
            </div>

            {/* Action Buttons in Modal */}
            {!isTerminalOrderStatus(selectedOrder.status) ? (
              <div className="space-y-2.5 rounded-xl border border-slate-300 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cập nhật tiến độ thực hiện</p>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        disabled={transition.isPending}
                        onClick={() => void handleTransition(selectedOrder, "CONFIRMED", "Xác nhận")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 shadow-2xs"
                      >
                        <VsIcon name="check" className="text-xs" />
                        <span>Xác nhận</span>
                      </button>

                      <button
                        type="button"
                        disabled={transition.isPending}
                        onClick={() => void handleTransition(selectedOrder, "PREPARING", "Đang xử lý")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50 shadow-2xs"
                      >
                        <VsIcon name="hourglass_empty" className="text-xs" />
                        <span>Đang xử lý</span>
                      </button>
                    </>
                  ) : null}

                  {selectedOrder.status === "CONFIRMED" || selectedOrder.status === "ACCEPTED" || selectedOrder.status === "PREPARING" || selectedOrder.status === "READY" || selectedOrder.status === "DELIVERING" || selectedOrder.status === "PROCESSING" ? (
                    <>
                      {selectedOrder.status !== "PREPARING" ? (
                        <button
                          type="button"
                          disabled={transition.isPending}
                          onClick={() => void handleTransition(selectedOrder, "PREPARING", "Đang xử lý")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50 shadow-2xs"
                        >
                          <VsIcon name="hourglass_empty" className="text-xs" />
                          <span>Đang xử lý</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        disabled={transition.isPending}
                        onClick={() => void handleTransition(selectedOrder, "COMPLETED", "Hoàn thành")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 shadow-2xs"
                      >
                        <VsIcon name="task_alt" className="text-xs" />
                        <span>Hoàn thành</span>
                      </button>
                    </>
                  ) : null}

                  {selectedOrder.status === "PENDING" ? (
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void handleTransition(selectedOrder, "CANCELLED", "Hủy")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <VsIcon name="close" className="text-xs" />
                      <span>Hủy</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
