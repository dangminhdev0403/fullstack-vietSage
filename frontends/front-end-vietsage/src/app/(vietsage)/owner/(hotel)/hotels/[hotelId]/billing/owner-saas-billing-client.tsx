"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

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

type PaginatedResult<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

type RoomUsageRow = {
  roomNumber: string;
  usageCount: number;
  billableDaysCount: number;
  billedAmount?: number;
  currency?: string;
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
  monthKey?: string;
  billableDaysCount: number;
  usageCount: number;
  estimatedFee: number;
  periods?: PeriodItem[];
  periodsPage?: PaginatedResult<PeriodItem>;
  reminder?: {
    dueSoonCount: number;
    overdueCount: number;
    dueSoonOutstandingAmount: number;
    overdueOutstandingAmount: number;
    nearestDueAt: string | null;
  };
  roomUsageSummary?: RoomUsageRow[];
};

const MONTH_PARAM = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

const formatVnd = (value: number | undefined) => Number(value ?? 0).toLocaleString("vi-VN");

export function OwnerSaasBillingClient({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodPageParam = parseInt(searchParams.get("periodPage") || "1", 10);
  const periodPage = Number.isInteger(periodPageParam) && periodPageParam > 0 ? periodPageParam : 1;

  const monthParam = searchParams.get("month") || "";
  const month = MONTH_PARAM.test(monthParam) ? monthParam : currentMonthKey();

  const [roomQuery, setRoomQuery] = useState("");

  // One query per (hotel, month, page): React Query wires AbortController signal to abort in-flight requests on unmount.
  const analytics = useQuery({
    queryKey: ["owner-saas-billing", hotelId, month, periodPage],
    queryFn: async ({ signal }) => {
      const queryParams = new URLSearchParams({
        periodPage: String(periodPage),
        periodLimit: "10",
        monthDate: `${month}-01`,
      });
      const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
        `/api/owner/platform-billing/analytics/${hotelId}?${queryParams.toString()}`,
        { method: "GET", signal },
      );
      return res.data ?? null;
    },
  });

  const data = analytics.data ?? null;
  const loading = analytics.isPending;
  const error = analytics.isError
    ? "Không tải được dữ liệu đối soát phí VietSage SaaS. Vui lòng thử lại."
    : null;

  const updateQueryParams = (entries: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) params.set(key, value);
    params.set("tab", "saas");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const roomRows = useMemo(() => data?.roomUsageSummary ?? [], [data?.roomUsageSummary]);
  const filteredRoomRows = useMemo(() => {
    const q = roomQuery.trim().toLowerCase();
    if (!q) return roomRows;
    return roomRows.filter((r) => r.roomNumber.toLowerCase().includes(q));
  }, [roomRows, roomQuery]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-emerald-500 border-t-transparent text-emerald-500"></div>
        <p className="mt-4 text-base font-semibold text-slate-600 dark:text-slate-400">
          Đang đối soát dữ liệu phí VietSage SaaS &amp; Bảo vệ doanh thu...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-8 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm font-bold text-red-800 dark:text-red-200">{error}</p>
        <button
          type="button"
          onClick={() => void analytics.refetch()}
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700"
        >
          Thử lại
        </button>
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
          <h3 className="mt-4 text-xl font-bold">Khách sạn chưa kích hoạt hợp đồng VietSage SaaS</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-amber-700 dark:text-amber-400">
            Vui lòng liên hệ Đội ngũ Quản trị viên VietSage Platform để chốt hợp đồng và kích hoạt tính năng bảo vệ doanh thu tự động.
          </p>
        </div>
      </div>
    );
  }

  const hotelName = data.contract?.hotel?.name || "Khách sạn";
  const periodsList = data.periodsPage?.items || data.periods || [];
  const pTotalItems = data.periodsPage?.total ?? periodsList.length;
  const pLimit = data.periodsPage?.limit ?? 10;
  const pTotalPages = Math.max(1, Math.ceil(pTotalItems / pLimit));

  const reminder = data.reminder;
  const hasOverdue = (reminder?.overdueCount ?? 0) > 0;
  const hasDueSoon = !hasOverdue && (reminder?.dueSoonCount ?? 0) > 0;

  const kpiCards = [
    {
      key: "stays",
      label: "Lượt lưu trú thực tế",
      value: String(data.usageCount ?? 0),
      unit: "lượt",
      icon: "qr_code_scanner",
      accent: "text-blue-600 dark:text-blue-400",
      chip: "bg-blue-100/80 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400",
      border: "border-blue-200/70 dark:border-blue-900/40",
    },
    {
      key: "days",
      label: "Ngày phòng tính phí",
      value: String(data.billableDaysCount ?? 0),
      unit: "ngày",
      icon: "hotel",
      accent: "text-slate-900 dark:text-white",
      chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      border: "border-slate-200/80 dark:border-slate-800",
    },
    {
      key: "fee",
      label: "Phí VietSage SaaS tháng này",
      value: formatVnd(data.estimatedFee),
      unit: "VND",
      icon: "payments",
      accent: "text-emerald-600 dark:text-emerald-400",
      chip: "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400",
      border: "border-emerald-200/70 dark:border-emerald-900/40",
    },
    {
      key: "periods",
      label: "Kỳ hóa đơn đã chốt",
      value: String(pTotalItems),
      unit: "kỳ",
      icon: "fact_check",
      accent: "text-indigo-600 dark:text-indigo-400",
      chip: "bg-indigo-100/80 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-400",
      border: "border-indigo-200/70 dark:border-indigo-900/40",
    },
  ];

  return (
    <div className="space-y-6">
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
                Tổng dư nợ quá hạn: <strong className="font-extrabold">{formatVnd(reminder?.overdueOutstandingAmount)} VND</strong>.
                {reminder?.nearestDueAt && (
                  <span className="ml-1">Hạn chót gần nhất: {new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN")}.</span>
                )}
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
                Tổng số tiền cần thanh toán: <strong className="font-extrabold">{formatVnd(reminder?.dueSoonOutstandingAmount)} VND</strong>.
                {reminder?.nearestDueAt && (
                  <span className="ml-1">Hạn thanh toán: {new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN")}.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contract summary */}
      <section className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 shadow-sm sm:p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm shadow-emerald-600/20">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                Hợp đồng đang hoạt động
              </span>
              <span className="rounded-lg bg-slate-900/5 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                Mã HĐ: {data.contract?.id ? `${data.contract.id.slice(0, 12)}...` : "ĐÃ KÍCH HOẠT"}
              </span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Hợp đồng phí VietSage SaaS — {hotelName}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Phí được tính từ số ngày phòng hợp lệ đã chốt trên hệ thống: ngày phòng tính phí × đơn giá hợp đồng.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl border border-emerald-200/60 bg-white p-4 shadow-sm lg:text-right dark:border-emerald-900/50 dark:bg-slate-900">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đơn giá hợp đồng
            </div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-emerald-600 sm:text-3xl dark:text-emerald-400">
              {formatVnd(data.unitPrice)}
            </div>
            <div className="text-xs font-semibold text-slate-500">VND / phòng / ngày</div>
          </div>
        </div>
      </section>

      {/* 4 main KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            className={`rounded-2xl border ${card.border} bg-white p-5 shadow-xs transition-shadow duration-200 hover:shadow-md dark:bg-slate-900`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase leading-tight tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {card.label}
              </span>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.chip}`}>
                <VsIcon name={card.icon} className="text-lg" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${card.accent}`}>
                {card.value}
              </span>
              <span className="text-xs font-bold text-slate-500">{card.unit}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Monthly room table */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Thống kê phòng theo tháng
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900">
              <VsIcon name="search" className="mr-1.5 text-sm text-slate-400" />
              <input
                type="text"
                value={roomQuery}
                onChange={(e) => setRoomQuery(e.target.value)}
                placeholder="Tìm phòng..."
                aria-label="Tìm phòng"
                className="w-28 bg-transparent text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400 sm:w-36 dark:text-white"
              />
              {roomQuery && (
                <button
                  type="button"
                  onClick={() => setRoomQuery("")}
                  aria-label="Xóa từ khóa tìm phòng"
                  className="ml-1 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
              <VsIcon name="calendar_month" className="text-sm text-emerald-600" />
              <span className="sr-only">Tháng đối soát</span>
              <input
                type="month"
                value={month}
                max={currentMonthKey()}
                onChange={(e) => {
                  const next = e.target.value;
                  if (MONTH_PARAM.test(next)) updateQueryParams({ month: next, periodPage: "1" });
                }}
                className="bg-transparent text-xs font-bold text-emerald-800 outline-none dark:text-emerald-300"
              />
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-base">
              <thead className="border-b border-slate-200/80 bg-slate-50/90 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                <tr>
                  <th scope="col" className="px-5 py-4">Phòng</th>
                  <th scope="col" className="px-5 py-4 text-right">Lượt lưu trú</th>
                  <th scope="col" className="px-5 py-4 text-right">Ngày tính phí</th>
                  <th scope="col" className="px-5 py-4 text-right">Phí VietSage SaaS</th>
                  <th scope="col" className="px-5 py-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRoomRows.map((item) => {
                  const carriedOver = item.usageCount === 0 && item.billableDaysCount > 0;
                  const isBillable = item.billableDaysCount > 0;

                  return (
                    <tr
                      key={item.roomNumber}
                      className="transition-colors hover:bg-emerald-50/40 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-sm sm:text-base font-bold text-emerald-800 dark:bg-slate-800 dark:text-slate-200">
                          <VsIcon name="meeting_room" className="text-lg text-emerald-600" />
                          Phòng {item.roomNumber}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-base sm:text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                        {item.usageCount}
                      </td>
                      <td className="px-5 py-4 text-right text-base sm:text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                        {item.billableDaysCount}
                      </td>
                      <td className="px-5 py-4 text-right text-base sm:text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">
                        <span title="Phí tương ứng">{formatVnd(item.billedAmount)}</span>{" "}
                        <span className="text-xs sm:text-sm font-semibold text-slate-400">
                          {item.currency || "VND"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {carriedOver ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50 px-3.5 py-1 text-xs sm:text-sm font-bold text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/60 dark:text-cyan-300"
                            title="Khách nhận phòng từ tháng trước và tiếp tục lưu trú trong tháng này"
                          >
                            <span className="h-2 w-2 rounded-full bg-cyan-600" />
                            Lưu trú từ tháng trước
                          </span>
                        ) : isBillable ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3.5 py-1 text-xs sm:text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-600" />
                            Có phát sinh phí
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3.5 py-1 text-xs sm:text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Chưa phát sinh
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredRoomRows.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 text-base font-extrabold text-slate-900 dark:border-slate-800 dark:bg-slate-800/80 dark:text-white">
                  <tr>
                    <td className="px-5 py-4 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Tổng tháng {month}
                    </td>
                    <td className="px-5 py-4 text-right text-base sm:text-lg tabular-nums">{data.usageCount ?? 0}</td>
                    <td className="px-5 py-4 text-right text-base sm:text-lg tabular-nums">{data.billableDaysCount ?? 0}</td>
                    <td className="px-5 py-4 text-right text-base sm:text-lg tabular-nums">
                      {formatVnd(data.estimatedFee)}{" "}
                      <span className="text-xs sm:text-sm font-semibold text-slate-400">VND</span>
                    </td>
                    <td className="px-5 py-4" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {filteredRoomRows.length === 0 && (
            <div className="p-10 text-center text-sm font-medium text-slate-500">
              {roomRows.length === 0
                ? "Chưa có phòng nào phát sinh lượt lưu trú hoặc phí trong tháng này."
                : `Không tìm thấy phòng phù hợp với từ khóa “${roomQuery}”`}
            </div>
          )}
        </div>
      </section>

      {/* Finalized periods (immutable) */}
      {periodsList.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            Lịch sử Hóa đơn VietSage SaaS đã chốt
          </h3>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-base text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-200/80 bg-slate-50/90 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-5 py-4">Chu kỳ chốt sổ</th>
                    <th scope="col" className="px-5 py-4">Trạng thái thanh toán</th>
                    <th scope="col" className="px-5 py-4">Hạn thanh toán</th>
                    <th scope="col" className="px-5 py-4 text-right">Tổng tiền &amp; Dư nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {periodsList.map((p) => {
                    const isFullyPaid = p.paymentState === "PAID" || (p.outstandingAmount ?? 0) <= 0;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-4 text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                          {new Date(p.periodStart).toLocaleDateString("vi-VN")} — {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-3.5 py-1 text-xs sm:text-sm font-bold ${
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
                                  ? "Một phần"
                                  : "Chưa thanh toán"}
                            </span>
                            {p.isOverdue && (
                              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs sm:text-sm font-extrabold text-red-800 dark:bg-red-950 dark:text-red-300">
                                Quá hạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                          {p.dueAt ? new Date(p.dueAt).toLocaleDateString("vi-VN") : "Hàng tháng"}
                        </td>
                        <td className="px-5 py-4 text-right text-slate-900 dark:text-white">
                          <div className="text-base sm:text-lg font-extrabold tabular-nums">
                            {formatVnd(p.total)} <span className="text-xs sm:text-sm font-semibold text-slate-400">VND</span>
                          </div>
                          {!isFullyPaid && p.outstandingAmount !== undefined && (
                            <div className="mt-1 text-xs sm:text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                              Còn phải trả: {formatVnd(p.outstandingAmount)} VND
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/50 px-5 py-4 text-sm sm:text-base font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <div>
                Trang <span className="font-bold text-slate-900 dark:text-white">{periodPage}</span> /{" "}
                <span className="font-bold text-slate-900 dark:text-white">{pTotalPages}</span> ({pTotalItems} kỳ)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={periodPage <= 1}
                  onClick={() => updateQueryParams({ periodPage: String(periodPage - 1) })}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  disabled={periodPage >= pTotalPages}
                  onClick={() => updateQueryParams({ periodPage: String(periodPage + 1) })}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 p-5 shadow-sm dark:border-indigo-900/30 dark:from-slate-900 dark:to-slate-900/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-indigo-950 dark:text-indigo-200">
              Thông tin chuyển khoản thanh toán phí VietSage SaaS
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Vui lòng chuyển khoản đúng số tiền kỳ hóa đơn với cú pháp:{" "}
              <strong className="font-mono text-indigo-600 dark:text-indigo-400">VIETSAGE [MÃ KHÁCH SẠN] [KỲ BILLING]</strong>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
            Vietcombank • 1029384756 • CTCP VIETSAGE
          </div>
        </div>
      </div>
    </div>
  );
}
