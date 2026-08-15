"use client";

import { useEffect, useState } from "react";
import { SwalVietSage } from "@/libs/swal";
import type {
  MarketplaceOrder,
  MarketplaceSettlement,
} from "@/features/marketplace/types/marketplace-contract";

import {
  CodeCell,
  DataTable,
  type DataTableColumnDef,
  MoneyCell,
  StatusBadge,
  TextCell,
} from "@/components/ui/data-table";
import { getCanonicalOrderItems } from "@/features/marketplace/utils/marketplace-unit";

type SettlementItem = MarketplaceSettlement & { order: MarketplaceOrder };
type RevenueSummary = { grossAmount: string | number; orderCount: number };

export function HotelPartnerSettlementsTab({
  hotelId,
}: Readonly<{ hotelId: string }>) {
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "UNSETTLED" | "SETTLED"
  >("UNSETTLED");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleStatusFilterChange = (
    filter: "ALL" | "UNSETTLED" | "SETTLED",
  ) => {
    setStatusFilter(filter);
  };

  const refetch = () => {
    setLoading(true);
    setRevenueLoading(true);
    setRevenueError(null);
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    let isCancelled = false;

    fetch(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements`,
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.message ?? "Không thể tải danh sách quyết toán");
        return json;
      })
      .then((json) => {
        if (!isCancelled) {
          setSettlements(json.data ?? json);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          void SwalVietSage.fire({
            icon: "error",
            title: "Lỗi tải dữ liệu",
            text: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
            showConfirmButton: true,
            confirmButtonText: "OK",
          });
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hotelId, refreshKey]);

  useEffect(() => {
    let isCancelled = false;

    fetch(`/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/marketplace/revenue`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message ?? "Không thể tải doanh thu phí dịch vụ ngoài");
        return json;
      })
      .then((json) => {
        if (!isCancelled) {
          setRevenue(json.data ?? json);
          setRevenueError(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setRevenue(null);
          setRevenueError(err instanceof Error ? err.message : "Không thể tải doanh thu phí dịch vụ");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setRevenueLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hotelId, refreshKey]);

  const totalCollected = settlements.reduce((sum, s) => {
    if (
      s.order?.customerTotalAmount !== undefined &&
      s.order?.customerTotalAmount !== null
    ) {
      return sum + Number(s.order.customerTotalAmount || 0);
    }
    if (
      s.order?.hotelServiceFeeAmount !== undefined &&
      s.order?.hotelServiceFeeAmount !== null
    ) {
      return (
        sum +
        Number(s.grossAmount || 0) +
        Number(s.order.hotelServiceFeeAmount || 0)
      );
    }
    return sum + Number(s.grossAmount || 0);
  }, 0);
  const totalNetPayable = settlements.reduce(
    (sum, s) => sum + Number(s.netAmount || 0),
    0,
  );

  const unsettledItems = settlements.filter((s) => s.status === "UNSETTLED");
  const settledItems = settlements.filter((s) => s.status === "SETTLED");
  const displayedSettlements =
    statusFilter === "ALL"
      ? settlements
      : settlements.filter((s) => s.status === statusFilter);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSelectAllUnsettled = () => {
    if (selectedIds.length === unsettledItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unsettledItems.map((s) => s.id));
    }
  };

  const handleSettleSingle = async (item: SettlementItem) => {
    const orderNum = item.order?.orderNumber ?? item.orderId;
    const netStr = Number(item.netAmount).toLocaleString("vi-VN");

    const confirm = await SwalVietSage.fire({
      icon: "question",
      title: "Xác nhận quyết toán đơn hàng?",
      html: `Quyết toán cho đơn hàng <b>#${orderNum}</b> số tiền <b>${netStr} VND</b> cho đối tác dịch vụ.<br/><br/><i>Hành động này xác nhận Khách sạn đã chuyển tiền/thanh toán đầy đủ cho Đối tác.</i>`,
      showCancelButton: true,
      reverseButtons: false,
      confirmButtonText: "Xác nhận quyết toán",
      cancelButtonText: "Quay lại",
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements/${encodeURIComponent(item.id)}/settle`,
        {
          method: "POST",
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.message ?? "Không thể hoàn thành quyết toán");

      await SwalVietSage.fire({
        icon: "success",
        title: "Quyết toán thành công!",
        text: `Đã quyết toán thành công đơn hàng #${orderNum}.`,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });

      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      refetch();
    } catch (err) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Thất bại",
        text:
          err instanceof Error ? err.message : "Quyết toán không thành công",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleBatch = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const selectedSettlements = settlements.filter((s) =>
      selectedIds.includes(s.id),
    );
    const totalBatchNet = selectedSettlements.reduce(
      (sum, s) => sum + Number(s.netAmount),
      0,
    );
    const totalBatchStr = totalBatchNet.toLocaleString("vi-VN");

    const confirm = await SwalVietSage.fire({
      icon: "warning",
      title: `Quyết toán ${count} đơn hàng chọn?`,
      html: `Tổng tiền thanh toán cho đối tác: <b>${totalBatchStr} VND</b> (${count} giao dịch).<br/><br/>Xác nhận khách sạn đã đối soát và chi trả toàn bộ số tiền này.`,
      showCancelButton: true,
      reverseButtons: false,
      confirmButtonText: `Quyết toán ${count} đơn`,
      cancelButtonText: "Quay lại",
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements/settle-batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settlementIds: selectedIds }),
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.message ?? "Quyết toán hàng loạt thất bại");

      await SwalVietSage.fire({
        icon: "success",
        title: "Quyết toán hàng loạt thành công!",
        text: `Đã xử lý quyết toán cho ${json.data?.settledCount ?? count} đơn hàng chọn.`,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });

      setSelectedIds([]);
      refetch();
    } catch (err) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Quyết toán thất bại",
        text:
          err instanceof Error
            ? err.message
            : "Không thể xử lý quyết toán hàng loạt",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns: DataTableColumnDef<SettlementItem>[] = [
    {
      id: "orderNumber",
      header: "Mã đơn hàng",
      type: "code",
      width: "w-32 min-w-[128px]",
      cell: (item) => (
        <CodeCell code={item.order?.orderNumber ?? item.orderId} />
      ),
    },
    {
      id: "service",
      header: "Dịch vụ & đối tác",
      type: "text",
      width: "w-56 min-w-[190px]",
      cell: (item) => {
        const partnerName =
          item.order?.serviceTenant?.serviceProfile?.displayName;
        const canonicalItems = item.order ? getCanonicalOrderItems(item.order) : [];
        const serviceTitle =
          canonicalItems.length > 1
            ? `${canonicalItems[0].serviceName} (+${canonicalItems.length - 1} mục khác)`
            : (item.order?.serviceNameSnapshot ?? "Dịch vụ");
        return (
          <TextCell
            title={serviceTitle}
            subtext={partnerName ? `🤝 ${partnerName}` : undefined}
            truncate
          />
        );
      },
    },
    {
      id: "roomGuest",
      header: "Phòng & khách hàng",
      type: "text",
      width: "w-44 min-w-[160px]",
      cell: (item) => {
        const roomNum = item.order?.stay?.room?.roomNumber;
        const guestName = item.order?.stay?.guestDisplayName;
        return (
          <div className="space-y-1 min-w-0 max-w-full">
            {roomNum ? (
              <span className="font-extrabold text-slate-900 bg-slate-100/90 px-2.5 py-0.5 rounded-md border border-slate-200/90 inline-block text-xs whitespace-nowrap">
                Phòng {roomNum}
              </span>
            ) : (
              <span className="font-medium text-slate-400 text-xs whitespace-nowrap">
                Phòng —
              </span>
            )}
            {guestName ? (
              <span title={guestName} className="block text-xs font-medium text-slate-600 truncate max-w-full">
                👤 {guestName}
              </span>
            ) : null}
          </div>
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
      header: "Trạng thái",
      type: "status",
      width: "w-40 min-w-[150px]",
      cell: (item) => <StatusBadge status={item.status} />,
    },
    {
      id: "actions",
      header: "Thao tác",
      type: "actions",
      width: "w-32 min-w-[120px]",
      cell: (item) => {
        const isSettled = item.status === "SETTLED";
        if (!isSettled) {
          return (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSettleSingle(item)}
              className="h-9 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-extrabold text-white whitespace-nowrap shrink-0 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-xs hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              Quyết toán
            </button>
          );
        }
        return (
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 inline-block whitespace-nowrap">
            {item.settledAt
              ? new Date(item.settledAt).toLocaleDateString("vi-VN")
              : "Đã hoàn thành"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Financial Metrics Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-6 shadow-xs space-y-2">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
            Doanh thu phí dịch vụ ngoài
          </span>
          <div className="text-3xl font-black text-emerald-900 tracking-tight">
            {revenueLoading ? (
              <span className="text-xl font-bold text-emerald-700 animate-pulse">
                Đang tải...
              </span>
            ) : revenueError ? (
              <span className="text-lg font-bold text-rose-600">
                Không thể tải
              </span>
            ) : revenue ? (
              <>
                {Number(revenue.grossAmount).toLocaleString("vi-VN")}{" "}
                <span className="text-base font-extrabold text-emerald-700">
                  VND
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
          <p className="text-xs font-medium text-emerald-800/80">
            {revenueLoading
              ? "Đang tải dữ liệu doanh thu..."
              : revenueError
                ? revenueError
                : `Phần trăm khách sạn hưởng từ ${revenue?.orderCount ?? 0} đơn hoàn tất`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-2 hover:shadow-md transition-all">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Khách sạn đã thu hộ
          </span>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {totalCollected.toLocaleString("vi-VN")}{" "}
            <span className="text-base font-extrabold text-slate-500">
              VND
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500">
            Tổng tiền dịch vụ thu qua folio phòng
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-6 shadow-xs space-y-2 hover:shadow-md transition-all">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            Phải trả cho đối tác
          </span>
          <div className="text-3xl font-black text-amber-900 tracking-tight">
            {totalNetPayable.toLocaleString("vi-VN")}{" "}
            <span className="text-base font-extrabold text-amber-700">
              VND
            </span>
          </div>
          <p className="text-xs font-medium text-amber-800/80">
            Giá trị thực nhận của nhà cung cấp
          </p>
        </div>

        <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/70 p-6 shadow-xs space-y-2 hover:shadow-md transition-all">
          <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
            <span>⌛</span> Chờ quyết toán
          </span>
          <div className="text-3xl font-black text-amber-900 tracking-tight">
            {unsettledItems.length}{" "}
            <span className="text-base font-extrabold text-amber-800">đơn</span>
          </div>
          <p className="text-xs font-semibold text-amber-800/90">
            Cần đối soát & chuyển khoản
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50/70 p-6 shadow-xs space-y-2 hover:shadow-md transition-all">
          <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
            <span>✓</span> Đã quyết toán
          </span>
          <div className="text-3xl font-black text-emerald-900 tracking-tight">
            {settledItems.length}{" "}
            <span className="text-base font-extrabold text-emerald-800">
              đơn
            </span>
          </div>
          <p className="text-xs font-semibold text-emerald-800/90">
            Đã hoàn tất nghĩa vụ tài chính
          </p>
        </div>
      </div>

      {/* Filter Toolbar & Datatable */}
      <DataTable
        minWidth="840px"
        density="compact"
        title="Đối soát công nợ đối tác"
        columns={columns}
        data={displayedSettlements}
        getRowKey={(item) => item.id}
        loading={loading}
        toolbar={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleStatusFilterChange("UNSETTLED")}
                className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  statusFilter === "UNSETTLED"
                    ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md shadow-amber-600/20 scale-[1.02]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-[1.01]"
                }`}
              >
                <span>⌛</span> Chờ quyết toán ({unsettledItems.length})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange("SETTLED")}
                className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  statusFilter === "SETTLED"
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-600/20 scale-[1.02]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-[1.01]"
                }`}
              >
                <span>✓</span> Đã quyết toán ({settledItems.length})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange("ALL")}
                className={`h-11 px-5 text-sm font-extrabold rounded-xl transition-all duration-200 cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-[1.02]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-[1.01]"
                }`}
              >
                Tất cả ({settlements.length})
              </button>
            </div>
          </div>
        }
        selection={
          statusFilter === "UNSETTLED" && displayedSettlements.length > 0
            ? {
                selectedIds,
                onSelectAll: handleSelectAllUnsettled,
                onSelectRow: handleToggleSelect,
                isAllSelected:
                  selectedIds.length === displayedSettlements.length &&
                  displayedSettlements.length > 0,
                bulkActions: (
                  <button
                    type="button"
                    disabled={selectedIds.length === 0 || submitting}
                    onClick={() => void handleSettleBatch()}
                    className="h-9 px-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 text-xs font-extrabold text-white shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                  >
                    ✓ Quyết toán ({selectedIds.length}) đơn chọn
                  </button>
                ),
              }
            : undefined
        }
        emptyState={{
          title: "Không có khoản quyết toán",
          description: "Không tìm thấy khoản quyết toán nào phù hợp với bộ lọc.",
        }}
      />
    </div>
  );
}
