"use client";

import { useEffect, useState } from "react";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type OwnerAnalyticsData = {
  hasContract: boolean;
  contract?: any;
  unitPrice: number;
  billableDaysCount: number;
  estimatedFee: number;
  billableDays: Array<{
    id: string;
    subjectId: string;
    serviceDate: string;
    unitPrice: number;
    amount: number;
  }>;
  periods: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    total: number;
    dueAt: string;
  }>;
};

export function OwnerSaasBillingClient({ hotelId }: { hotelId: string }) {
  const [data, setData] = useState<OwnerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      try {
        const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
          `/api/owner/platform-billing/analytics/${hotelId}`,
          { method: "GET" },
        );
        if (res.data) setData(res.data);
      } catch (err) {
        console.error("Lỗi tải thông tin đối soát phí VietSage:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [hotelId]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-slate-500">Đang đối soát dữ liệu phí VietSage SaaS...</div>;
  }

  if (!data?.hasContract) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <div className="flex items-center gap-3">
          <VsIcon name="info" className="h-5 w-5 text-amber-600" />
          <div>
            <h4 className="font-semibold">Khách sạn chưa kích hoạt Hợp đồng VietSage SaaS</h4>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Vui lòng liên hệ Quản trị viên VietSage Platform để đăng ký hợp đồng và bắt đầu tính phí dịch vụ.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">ACTIVE</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Hợp đồng Phí VietSage SaaS — {data.contract?.hotel?.name}
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Bảo vệ doanh thu & đối soát minh bạch phí sử dụng dịch vụ nền tảng theo lượt phòng/ngày (Room-Days).
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-500">Đơn giá hợp đồng</div>
            <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
              {Number(data.unitPrice).toLocaleString("vi-VN")} VND <span className="text-xs font-normal">/ phòng / ngày</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lượt phòng/ngày tháng này</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            {data.billableDaysCount} <span className="text-sm font-normal text-slate-500">lượt</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phí SaaS ước tính tháng này</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {Number(data.estimatedFee).toLocaleString("vi-VN")} VND
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Các kỳ đã chốt hóa đơn</div>
          <div className="mt-2 text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {data.periods.length} <span className="text-sm font-normal text-slate-500">kỳ</span>
          </div>
        </div>
      </div>

      {/* Billable Days Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
          Chi tiết các lượt phòng tính phí trong tháng ({data.billableDays.length})
        </h4>
        {data.billableDays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
            Tháng này chưa ghi nhận lượt phòng/ngày nào.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ngày dịch vụ</th>
                  <th className="px-4 py-3 font-semibold">Mã phòng (Subject)</th>
                  <th className="px-4 py-3 font-semibold">Đơn giá áp dụng</th>
                  <th className="px-4 py-3 font-semibold text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.billableDays.slice(0, 20).map((bd) => (
                  <tr key={bd.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                      {new Date(bd.serviceDate).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-2.5 font-mono">{bd.subjectId}</td>
                    <td className="px-4 py-2.5">{Number(bd.unitPrice).toLocaleString("vi-VN")} VND</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">
                      {Number(bd.amount).toLocaleString("vi-VN")} VND
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Finalized Periods Table */}
      {data.periods.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Lịch sử hóa đơn VietSage SaaS đã chốt</h4>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Chu kỳ</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Hạn thanh toán</th>
                  <th className="px-4 py-3 font-semibold text-right">Tổng phí SaaS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.periods.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {new Date(p.periodStart).toLocaleDateString("vi-VN")} — {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {p.dueAt ? new Date(p.dueAt).toLocaleDateString("vi-VN") : "N/A"}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 dark:text-white">
                      {Number(p.total).toLocaleString("vi-VN")} VND
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
