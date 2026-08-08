"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DataTable, type DataTableColumn, type DataTableSortDirection } from "@/components/ui/data-table";

type PeriodItem = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  total: number;
  dueAt: string;
  settledAmount?: number;
  outstandingAmount?: number;
  paymentState?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  isOverdue?: boolean;
};

type BillableDayItem = {
  id: string;
  subjectId: string;
  roomNumber?: string;
  serviceDate: string;
  unitPrice: number;
  amount: number;
};

type PaginatedResult<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

type OwnerAnalyticsData = {
  hasContract: boolean;
  contract?: {
    id?: string;
    hotelId?: string;
    status?: string;
    hotel?: { name?: string; code?: string };
  };
  unitPrice: number;
  billableDaysCount: number;
  usageCount: number;
  estimatedFee: number;
  billableDays?: BillableDayItem[];
  periods?: PeriodItem[];
  billableDaysPage?: PaginatedResult<BillableDayItem>;
  periodsPage?: PaginatedResult<PeriodItem>;
  reminder?: {
    dueSoonCount: number;
    overdueCount: number;
    dueSoonOutstandingAmount: number;
    overdueOutstandingAmount: number;
    nearestDueAt: string | null;
  };
  roomUsageSummary?: Array<{
    roomNumber: string;
    usageCount: number;
    billableDaysCount: number;
    billedAmount?: number;
    currency?: string;
  }>;
};

export function OwnerSaasBillingClient({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodPageParam = parseInt(searchParams.get("periodPage") || "1", 10);
  const periodPage = Number.isInteger(periodPageParam) && periodPageParam > 0 ? periodPageParam : 1;

  const billableDayPageParam = parseInt(searchParams.get("billableDayPage") || "1", 10);
  const billableDayPage = Number.isInteger(billableDayPageParam) && billableDayPageParam > 0 ? billableDayPageParam : 1;

  const billableDayLimitParam = parseInt(searchParams.get("billableDayLimit") || "20", 10);
  const billableDayLimit = [10, 20, 50, 100].includes(billableDayLimitParam) ? billableDayLimitParam : 20;

  const [billableDaySort, setBillableDaySort] = useState<{
    key: "serviceDate" | "room" | "unitPrice" | "amount";
    direction: DataTableSortDirection;
  }>({ key: "serviceDate", direction: "desc" });

  const [data, setData] = useState<OwnerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const updateQueryParams = (key: string, value: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    params.set("tab", "saas");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const changeBillableDayLimit = (newLimit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("billableDayLimit", String(newLimit));
    params.set("billableDayPage", "1");
    params.set("tab", "saas");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const loadAnalytics = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("periodPage", String(periodPage));
      queryParams.set("periodLimit", "10");
      queryParams.set("billableDayPage", String(billableDayPage));
      queryParams.set("billableDayLimit", String(billableDayLimit));

      const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
        `/api/owner/platform-billing/analytics/${hotelId}?${queryParams.toString()}`,
        { method: "GET" },
      );
      if (res.data) setData(res.data);
    } catch (err) {
      console.error("Lỗi tải thông tin đối soát phí VietSage:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [hotelId, periodPage, billableDayPage, billableDayLimit]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("periodPage", String(periodPage));
        queryParams.set("periodLimit", "10");
        queryParams.set("billableDayPage", String(billableDayPage));
        queryParams.set("billableDayLimit", String(billableDayLimit));

        const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
          `/api/owner/platform-billing/analytics/${hotelId}?${queryParams.toString()}`,
          { method: "GET" },
        );
        if (isMounted && res.data) setData(res.data);
      } catch (err) {
        console.error("Lỗi tải thông tin đối soát phí VietSage:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void init();

    function onFocusOrVisible() {
      if (document.visibilityState === "visible") {
        void loadAnalytics(false);
      }
    }

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [hotelId, periodPage, billableDayPage, billableDayLimit, loadAnalytics]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-emerald-500 border-t-transparent text-emerald-500"></div>
        <p className="mt-4 text-base font-semibold text-slate-600 dark:text-slate-400">
          Đang đối soát dữ liệu phí VietSage SaaS & Bảo vệ doanh thu...
        </p>
      </div>
    );
  }

  if (!data?.hasContract) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-10 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <VsIcon name="info" className="text-3xl" />
          </div>
          <h3 className="mt-4 text-xl font-bold">Khách sạn chưa kích hoạt Hợp đồng VietSage SaaS</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-amber-700 dark:text-amber-400">
            Vui lòng liên hệ Đội ngũ Quản trị viên VietSage Platform để chốt hợp đồng và kích hoạt tính năng bảo vệ doanh thu tự động.
          </p>
        </div>
      </div>
    );
  }

  const hotelName = data.contract?.hotel?.name || "Khách sạn";
  const billableDaysList = data.billableDaysPage?.items || data.billableDays || [];
  const periodsList = data.periodsPage?.items || data.periods || [];

  const bdTotalItems = data.billableDaysPage?.total ?? data.billableDaysCount ?? 0;

  const pTotalItems = data.periodsPage?.total ?? periodsList.length;
  const pLimit = data.periodsPage?.limit ?? 10;
  const pTotalPages = Math.max(1, Math.ceil(pTotalItems / pLimit));

  const reminder = data.reminder;
  const hasOverdue = (reminder?.overdueCount ?? 0) > 0;
  const hasDueSoon = !hasOverdue && (reminder?.dueSoonCount ?? 0) > 0;

  const allColumns: DataTableColumn<BillableDayItem>[] = [
    {
      key: "serviceDate",
      header: "Ngày dịch vụ",
      sortable: true,
      className: "font-bold text-slate-900 dark:text-white",
      cell: (bd) =>
        new Date(bd.serviceDate).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
    },
    {
      key: "room",
      header: "Đối tượng / Mã phòng",
      sortable: true,
      cell: (bd) => (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 font-sans text-xs font-bold text-emerald-800 dark:bg-slate-800 dark:text-slate-300">
          <VsIcon name="meeting_room" className="text-sm text-emerald-600" />
          Phòng {bd.roomNumber || bd.subjectId}
        </span>
      ),
    },
    {
      key: "unitPrice",
      header: "Đơn giá áp dụng",
      sortable: true,
      className: "font-medium",
      cell: (bd) => `${Number(bd.unitPrice).toLocaleString("vi-VN")} VND`,
    },
    {
      key: "amount",
      header: "Thành tiền",
      sortable: true,
      className: "text-right font-extrabold text-slate-900 dark:text-white",
      headerClassName: "text-right",
      cell: (bd) => `${Number(bd.amount).toLocaleString("vi-VN")} VND`,
    },
  ];

  const billableDayColumns = allColumns;

  const sortedBillableDays = [...billableDaysList].sort((left, right) => {
    const key = billableDaySort.key;
    const leftValue = key === "serviceDate"
      ? new Date(left.serviceDate).getTime()
      : key === "room"
        ? left.roomNumber || left.subjectId
        : Number(left[key]);
    const rightValue = key === "serviceDate"
      ? new Date(right.serviceDate).getTime()
      : key === "room"
        ? right.roomNumber || right.subjectId
        : Number(right[key]);
    const result = typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue), "vi")
      : leftValue - Number(rightValue);
    return billableDaySort.direction === "asc" ? result : -result;
  });

  return (
    <div className="space-y-8">
      {/* Due Reminder Banner (Backend Owned Only) */}
      {hasOverdue && (
        <div className="rounded-2xl border border-red-200 bg-red-50/90 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
              <VsIcon name="warning" className="text-xl" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-red-900 dark:text-red-200">
                Quá hạn thanh toán — Có {reminder?.overdueCount} kỳ hóa đơn quá hạn
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                Tổng dư nợ quá hạn: <strong className="font-extrabold">{Number(reminder?.overdueOutstandingAmount ?? 0).toLocaleString("vi-VN")} VND</strong>.
                {reminder?.nearestDueAt && (
                  <span className="ml-1">Hạn chót gần nhất: {new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN")}.</span>
                )}
                Vui lòng thanh toán sớm để đảm bảo dịch vụ vận hành thông suốt.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasDueSoon && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <VsIcon name="schedule" className="text-xl" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-amber-900 dark:text-amber-200">
                Sắp đến hạn trong 7 ngày — Có {reminder?.dueSoonCount} kỳ hóa đơn sắp đến hạn
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Tổng số tiền cần thanh toán: <strong className="font-extrabold">{Number(reminder?.dueSoonOutstandingAmount ?? 0).toLocaleString("vi-VN")} VND</strong>.
                {reminder?.nearestDueAt && (
                  <span className="ml-1">Hạn thanh toán: {new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN")}.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Contract Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6 lg:p-8 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-black tracking-wider text-white shadow-sm shadow-emerald-600/20">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                Hợp đồng đang hoạt động
              </span>
              <span className="rounded-xl bg-slate-900/5 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                Mã HĐ: {data.contract?.id ? `${data.contract.id.slice(0, 12)}...` : "ĐÃ KÍCH HOẠT"}
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Hợp đồng Phí VietSage SaaS — {hotelName}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Đối soát minh bạch chi phí dịch vụ nền tảng được tự động tính theo lượt phòng/ngày từ lượt khách thực tế lưu trú.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200/60 bg-white p-5 shadow-sm dark:border-emerald-900/50 dark:bg-slate-900 md:text-right">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đơn giá hợp đồng
            </div>
            <div className="mt-1 text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {Number(data.unitPrice).toLocaleString("vi-VN")}{" "}
              <span className="text-sm font-semibold text-slate-500">VND / phòng / ngày</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards (4 Cards Grid) */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-200/80 bg-white p-6 shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Số lượt lưu trú
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400">
              <VsIcon name="qr_code_scanner" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-blue-600 dark:text-blue-400">
              {data.usageCount ?? 0}
            </span>
            <span className="text-sm font-bold text-slate-500">lượt lưu trú thực tế</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ngày phòng tính phí
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <VsIcon name="hotel" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {data.billableDaysCount}
            </span>
            <span className="text-sm font-bold text-slate-500">ngày phòng tính phí</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-white p-6 shadow-sm dark:border-emerald-900/40 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Phí SaaS ước tính tháng này
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400">
              <VsIcon name="payments" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl lg:text-4xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {Number(data.estimatedFee).toLocaleString("vi-VN")}
            </span>
            <span className="text-sm font-bold text-slate-500">VND</span>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200/80 bg-white p-6 shadow-sm dark:border-indigo-900/40 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Các kỳ hóa đơn đã chốt
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-400">
              <VsIcon name="fact_check" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
              {pTotalItems}
            </span>
            <span className="text-sm font-bold text-slate-500">kỳ đã chốt</span>
          </div>
        </div>
      </div>

      {/* Room Usage Summary Breakdown */}
      {data.roomUsageSummary && data.roomUsageSummary.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Thống kê hai bộ đếm theo từng phòng trong tháng (Số lượt lưu trú vs Ngày phòng tính phí)
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.roomUsageSummary.map((item) => (
              <div
                key={item.roomNumber}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-slate-800 dark:text-slate-300">
                    <VsIcon name="meeting_room" className="text-sm text-emerald-600" />
                    Phòng {item.roomNumber}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-blue-50/60 p-2.5 dark:bg-blue-950/30">
                    <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">Số lượt lưu trú</div>
                    <div className="text-xl font-black text-blue-900 dark:text-blue-200">{item.usageCount} lượt</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30">
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Ngày phòng tính phí</div>
                    <div className="text-xl font-black text-emerald-900 dark:text-emerald-200">{item.billableDaysCount} ngày</div>
                  </div>
                </div>

                {item.billedAmount !== undefined && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Phí tương ứng:</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {Number(item.billedAmount).toLocaleString("vi-VN")} {item.currency || "VND"}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table breakdown */}
      <DataTable
        columns={billableDayColumns}
        data={sortedBillableDays.slice(0, billableDayLimit)}
        getRowKey={(bd) => bd.id}
        emptyMessage="Chưa ghi nhận lượt phòng tính phí"
        minWidth="760px"
        header={
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5dcd0] p-4 sm:p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Chi tiết lượt phòng/ngày tính phí trong tháng — Ngày / Số tiền ({bdTotalItems})
            </h3>
          </div>
        }
        pagination={{
          serverSide: true,
          page: billableDayPage,
          pageSize: billableDayLimit,
          totalItems: bdTotalItems,
          pageSizeOptions: [10, 20, 50, 100],
          onPageChange: (newPage) => updateQueryParams("billableDayPage", newPage),
          onPageSizeChange: changeBillableDayLimit,
        }}
        sort={{
          key: billableDaySort.key,
          direction: billableDaySort.direction,
          onSortChange: (key, direction) =>
            setBillableDaySort({
              key: key as "serviceDate" | "room" | "unitPrice" | "amount",
              direction,
            }),
        }}
      />

      {/* Finalized Periods & Payment Instructions */}
      {periodsList.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Lịch sử Hóa đơn VietSage SaaS đã chốt
          </h3>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-100/70 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-bold">Chu kỳ chốt sổ</th>
                    <th className="px-6 py-4 font-bold">Trạng thái thanh toán</th>
                    <th className="px-6 py-4 font-bold">Hạn thanh toán</th>
                    <th className="px-6 py-4 font-bold text-right">Tổng tiền & Dư nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {periodsList.map((p) => {
                    const isFullyPaid = p.paymentState === "PAID" || (p.outstandingAmount ?? 0) <= 0;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                          {new Date(p.periodStart).toLocaleDateString("vi-VN")} — {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                p.paymentState === "PAID"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : p.paymentState === "PARTIALLY_PAID"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              }`}
                            >
                              {p.paymentState === "PAID"
                                ? "Đã thanh toán"
                                : p.paymentState === "PARTIALLY_PAID"
                                ? "Thanh toán một phần"
                                : "Chưa thanh toán"}
                            </span>
                            {p.isOverdue && (
                              <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-extrabold text-red-800 dark:bg-red-950 dark:text-red-300">
                                Quá hạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                          {p.dueAt ? new Date(p.dueAt).toLocaleDateString("vi-VN") : "Hàng tháng"}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-white">
                          <div>
                            <span className="font-extrabold">{Number(p.total).toLocaleString("vi-VN")}</span> VND
                          </div>
                          {!isFullyPaid && p.outstandingAmount !== undefined && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                              Còn phải trả: {Number(p.outstandingAmount).toLocaleString("vi-VN")} VND
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <div>
                Trang <span className="font-bold text-slate-900 dark:text-white">{periodPage}</span> / <span className="font-bold text-slate-900 dark:text-white">{pTotalPages}</span> ({pTotalItems} kỳ)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={periodPage <= 1}
                  onClick={() => updateQueryParams("periodPage", periodPage - 1)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  disabled={periodPage >= pTotalPages}
                  onClick={() => updateQueryParams("periodPage", periodPage + 1)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Instruction Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 p-6 shadow-sm dark:border-indigo-900/30 dark:from-slate-900 dark:to-slate-900/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-indigo-950 dark:text-indigo-200">
              Thông tin Chuyển khoản Thanh toán Phí VietSage SaaS
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Vui lòng chuyển khoản đúng số tiền kỳ hóa đơn với cú pháp: <strong className="text-indigo-600 dark:text-indigo-400 font-mono">VIETSAGE [MÃ KHÁCH SẠN] [KỲ BILLING]</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-3 text-xs font-bold text-slate-700 shadow-sm border border-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
              Vietcombank • 1029384756 • CTCP VIETSAGE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
