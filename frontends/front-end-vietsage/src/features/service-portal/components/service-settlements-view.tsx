"use client";

import { useState } from "react";
import Link from "next/link";
import { useServicePortal } from "../use-service-portal";
import {
  CodeCell,
  DataTable,
  type DataTableColumnDef,
  DateCell,
  MoneyCell,
  StatusBadge,
  TextCell,
} from "@/components/ui/data-table";
import { getCanonicalOrderItems } from "@/features/marketplace/utils/marketplace-unit";
import type {
  MarketplaceOrder,
  MarketplaceSettlement,
} from "@/features/marketplace/types/marketplace-contract";

type SettlementItem = MarketplaceSettlement & { order?: MarketplaceOrder };

export function ServiceSettlementsView() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const { financialSummary, settlements } = useServicePortal({
    settlementStatus: statusFilter === "ALL" ? undefined : statusFilter,
  });

  const financial = financialSummary.data;
  const list = (settlements.data ?? []) as SettlementItem[];

  const columns: DataTableColumnDef<SettlementItem>[] = [
    {
      id: "orderNumber",
      header: "Mã đơn hàng",
      type: "code",
      width: "w-36 min-w-[144px]",
      cell: (item) => (
        <CodeCell code={item.order?.orderNumber ?? item.orderId} />
      ),
    },
    {
      id: "hotel",
      header: "Khách sạn",
      type: "text",
      width: "w-44 min-w-[165px]",
      cell: (item) => (
        <TextCell title={`🏨 ${item.order?.hotel?.name ?? "Khách sạn"}`} truncate />
      ),
    },
    {
      id: "serviceGuest",
      header: "Dịch vụ & khách hàng",
      type: "text",
      width: "w-56 min-w-[200px]",
      cell: (item) => {
        const canonicalItems = item.order ? getCanonicalOrderItems(item.order) : [];
        const title =
          canonicalItems.length > 1
            ? `${canonicalItems[0].serviceName} (+${canonicalItems.length - 1} mục khác)`
            : (item.order?.serviceNameSnapshot ?? "Dịch vụ");
        return (
          <TextCell
            title={title}
            subtext={
              item.order?.stay?.guestDisplayName
                ? `👤 Khách: ${item.order.stay.guestDisplayName} (${
                    item.order.stay.room?.roomNumber
                      ? `Phòng ${item.order.stay.room.roomNumber}`
                      : "Phòng —"
                  })`
                : undefined
            }
            truncate
          />
        );
      },
    },
    {
      id: "settlementAmount",
      header: "Giá trị quyết toán",
      type: "money",
      width: "w-40 min-w-[150px]",
      cell: (item) => <MoneyCell value={item.netAmount} highlight />,
    },
    {
      id: "status",
      header: "Trạng thái quyết toán",
      type: "status",
      width: "w-40 min-w-[150px]",
      cell: (item) => <StatusBadge status={item.status} />,
    },
    {
      id: "settledAt",
      header: "Ngày quyết toán",
      type: "date",
      align: "right",
      width: "w-36 min-w-[130px]",
      cell: (item) => (
        <DateCell date={item.settledAt} format="date" />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#f4ebd9] px-3 py-1 text-xs font-semibold text-[#8c6d29] mb-2">
            <span>🤝</span> Đối soát công nợ Hotel ↔ Đối tác
          </div>
          <h1 className="text-2xl font-extrabold text-[#17201b]">Lịch sử quyết toán dịch vụ</h1>
          <p className="text-xs text-[#5a6760] mt-1">
            Khách sạn thu hộ tiền dịch vụ từ khách lưu trú và quyết toán lại cho nhà cung cấp.
          </p>
        </div>
        <Link
          href="/service/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#17201b] px-4 text-xs font-bold text-[#f8f1e6] hover:bg-[#27352d] shrink-0"
        >
          ← Về bảng điều khiển
        </Link>
      </section>

      {/* Financial Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-[#5a6760]">Doanh số khách sạn thu hộ</span>
          <div className="text-2xl font-extrabold text-[#17201b]">
            {(financial?.hotelCollectedAmount ?? 0).toLocaleString("vi-VN")} VND
          </div>
          <p className="text-[11px] text-[#5a6760]">Tổng giá trị dịch vụ hoàn thành</p>
        </div>

        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-[#5a6760]">Tổng thực nhận của đối tác</span>
          <div className="text-2xl font-extrabold text-[#8c6d29]">
            {(financial?.totalNetPayable ?? 0).toLocaleString("vi-VN")} VND
          </div>
          <p className="text-[11px] text-[#5a6760]">Theo đúng giá trị đơn hàng</p>
        </div>

        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-[#5a6760]">Công nợ chờ quyết toán</span>
          <div className="text-2xl font-extrabold text-[#b2720d]">
            {(financial?.outstandingAmount ?? 0).toLocaleString("vi-VN")} VND
          </div>
          <p className="text-[11px] text-[#5a6760]">KS chưa thanh toán cho đối tác</p>
        </div>

        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-[#5a6760]">Đã nhận quyết toán</span>
          <div className="text-2xl font-extrabold text-[#16562c]">
            {(financial?.settledAmount ?? 0).toLocaleString("vi-VN")} VND
          </div>
          <p className="text-[11px] text-[#5a6760]">Đã thực nhận từ khách sạn</p>
        </div>
      </section>

      {/* Settlements Datatable */}
      <DataTable
        minWidth="800px"
        density="compact"
        title={`Danh sách giao dịch quyết toán (${list.length})`}
        columns={columns}
        data={list}
        getRowKey={(item) => item.id}
        loading={settlements.isPending}
        toolbar={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-[#17201b] text-white shadow-md shadow-[#17201b]/20 scale-[1.02]"
                  : "bg-[#f4efe6] text-[#5a6760] hover:bg-[#e8e2d4] hover:scale-[1.01]"
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("UNSETTLED")}
              className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "UNSETTLED"
                  ? "bg-gradient-to-r from-[#b2720d] to-[#925f0e] text-white shadow-md shadow-[#b2720d]/20 scale-[1.02]"
                  : "bg-[#fff3db] text-[#925f0e] hover:bg-[#fce5b5] hover:scale-[1.01]"
              }`}
            >
              <span>⌛</span> Chờ quyết toán
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("SETTLED")}
              className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "SETTLED"
                  ? "bg-gradient-to-r from-[#16562c] to-[#0e3b1e] text-white shadow-md shadow-[#16562c]/20 scale-[1.02]"
                  : "bg-[#e7f4eb] text-[#16562c] hover:bg-[#cdecd6] hover:scale-[1.01]"
              }`}
            >
              <span>✓</span> Đã quyết toán
            </button>
          </div>
        }
        emptyState={{
          title: "Chưa có dữ liệu quyết toán",
          description: "Chưa có lịch sử giao dịch quyết toán phù hợp với bộ lọc hiện tại.",
        }}
      />
    </div>
  );
}
