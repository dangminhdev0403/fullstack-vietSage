"use client";

import { useCallback, useEffect, useState } from "react";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

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
  billableDays: Array<{
    id: string;
    subjectId: string;
    roomNumber?: string;
    serviceDate: string;
    unitPrice: number;
    amount: number;
  }>;
  roomUsageSummary?: Array<{
    roomNumber: string;
    usageCount: number;
    billableDaysCount: number;
  }>;
  periods: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    total: number;
    dueAt: string;
    settlements?: Array<{ amount: number }>;
  }>;
};

export function OwnerSaasBillingClient({ hotelId }: { hotelId: string }) {
  const [data, setData] = useState<OwnerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
        `/api/owner/platform-billing/analytics/${hotelId}`,
        { method: "GET" },
      );
      if (res.data) setData(res.data);
    } catch (err) {
      console.error("Lỗi tải thông tin đối soát phí VietSage:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
          `/api/owner/platform-billing/analytics/${hotelId}`,
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
  }, [hotelId, loadAnalytics]);

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
            Vui lòng liên hệ Đội ngũ Quản trị viên VietSage Platform để onboard hợp đồng và kích hoạt tính năng bảo vệ doanh thu tự động.
          </p>
        </div>
      </div>
    );
  }

  const hotelName = data.contract?.hotel?.name || "Khách sạn";

  return (
    <div className="space-y-8">
      {/* Active Contract Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6 lg:p-8 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                ACTIVE
              </span>
              <span className="rounded-xl bg-slate-900/5 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                Mã HĐ: {data.contract?.id ? `${data.contract.id.slice(0, 12)}...` : "ONBOARDED"}
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Hợp đồng Phí VietSage SaaS — {hotelName}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Đối soát minh bạch chi phí dịch vụ nền tảng được tự động tính theo lượt phòng/ngày (Room-Days) từ lượt khách thực tế lưu trú.
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
              Lượt dùng thực tế (Usage Count)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400">
              <VsIcon name="qr_code_scanner" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-blue-600 dark:text-blue-400">
              {data.usageCount ?? 0}
            </span>
            <span className="text-sm font-bold text-slate-500">lượt ở thực tế</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Lượt phòng/ngày tính phí (Billable Day)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <VsIcon name="hotel" className="text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {data.billableDaysCount}
            </span>
            <span className="text-sm font-bold text-slate-500">lượt phòng/ngày</span>
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
              {data.periods.length}
            </span>
            <span className="text-sm font-bold text-slate-500">kỳ đã chốt</span>
          </div>
        </div>
      </div>

      {/* Room Usage Summary Breakdown */}
      {data.roomUsageSummary && data.roomUsageSummary.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Thống kê hai bộ đếm theo từng phòng trong tháng (Usage Count vs Billable Day)
          </h3>
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
                    <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">Usage Count</div>
                    <div className="text-xl font-black text-blue-900 dark:text-blue-200">{item.usageCount} lượt</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30">
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Billable Day</div>
                    <div className="text-xl font-black text-emerald-900 dark:text-emerald-200">{item.billableDaysCount} ngày</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billable Days Table Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Chi tiết lượt phòng/ngày tính phí trong tháng ({data.billableDays.length})
          </h3>
        </div>

        {data.billableDays.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center dark:border-slate-800">
            <VsIcon name="event_busy" className="mx-auto text-4xl text-slate-400" />
            <h4 className="mt-2 text-base font-bold text-slate-700 dark:text-slate-300">Chưa ghi nhận lượt phòng tính phí</h4>
            <p className="mt-1 text-sm text-slate-500">Tháng này chưa phát sinh lượt check-in phòng lưu trú nào.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-100/70 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-bold">Ngày dịch vụ</th>
                    <th className="px-6 py-4 font-bold">Đối tượng / Mã phòng</th>
                    <th className="px-6 py-4 font-bold">Đơn giá áp dụng</th>
                    <th className="px-6 py-4 font-bold text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.billableDays.slice(0, 30).map((bd) => (
                    <tr key={bd.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                        {new Date(bd.serviceDate).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 font-sans text-xs font-bold text-emerald-800 dark:bg-slate-800 dark:text-slate-300">
                          <VsIcon name="meeting_room" className="text-sm text-emerald-600" />
                          Phòng {bd.roomNumber || bd.subjectId}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {Number(bd.unitPrice).toLocaleString("vi-VN")} VND
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-slate-900 dark:text-white">
                        {Number(bd.amount).toLocaleString("vi-VN")} VND
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Finalized Periods & Payment Instructions */}
      {data.periods.length > 0 && (
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
                    <th className="px-6 py-4 font-bold">Trạng thái</th>
                    <th className="px-6 py-4 font-bold">Hạn thanh toán</th>
                    <th className="px-6 py-4 font-bold text-right">Tổng tiền phí SaaS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.periods.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                        {new Date(p.periodStart).toLocaleDateString("vi-VN")} — {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                        {p.dueAt ? new Date(p.dueAt).toLocaleDateString("vi-VN") : "Hàng tháng"}
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-slate-900 dark:text-white">
                        {Number(p.total).toLocaleString("vi-VN")} VND
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
