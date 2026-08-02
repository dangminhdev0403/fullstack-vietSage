"use client";

import { type FormEvent, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Contract = {
  id: string;
  hotelId: string;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  onboardedAt: string;
  billingStartedAt: string;
  hotel: { id: string; name: string; code: string };
  revisions: Array<{ id: string; roomDayUnitPrice: number; currency: string; starTierSnapshot: number }>;
  periods: Array<{ id: string; periodStart: string; periodEnd: string; status: string; total: number }>;
};

type Summary = {
  activeContracts: number;
  finalizedPeriods: number;
  totalFinalizedRevenue: number;
  duePeriods: Array<any>;
};

export function AdminBillingClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"contracts" | "periods">("contracts");
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    hotelId: "",
    roomDayUnitPrice: "10000",
    billingStartedAt: new Date().toISOString().substring(0, 10),
  });

  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [finalizeForm, setFinalizeForm] = useState({
    periodStart: "2026-01-01",
    periodEnd: "2026-02-01",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, contractsRes] = await Promise.all([
        requestInternalApiEnvelope<Summary>("/api/admin/platform-billing/dashboard/summary", { method: "GET" }),
        requestInternalApiEnvelope<Contract[]>("/api/admin/platform-billing/contracts", { method: "GET" }),
      ]);
      if (sumRes.data) setSummary(sumRes.data);
      if (contractsRes.data) setContracts(contractsRes.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateContract = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await requestInternalApiEnvelope("/api/admin/platform-billing/contracts", {
        method: "POST",
        body: {
          hotelId: createForm.hotelId,
          roomDayUnitPrice: Number(createForm.roomDayUnitPrice),
          billingStartedAt: createForm.billingStartedAt,
        },
      });
      Swal.fire("Thành công", "Đã khởi tạo hợp đồng tính phí mới", "success");
      setShowCreateModal(false);
      fetchData();
    } catch (err: any) {
      Swal.fire("Lỗi", err.message || "Không thể tạo hợp đồng", "error");
    }
  };

  const handleFinalizePeriod = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await requestInternalApiEnvelope(`/api/admin/platform-billing/contracts/${selectedContractId}/finalize`, {
        method: "POST",
        body: finalizeForm,
      });
      Swal.fire("Thành công", "Đã chốt hóa đơn kỳ thanh toán", "success");
      setShowFinalizeModal(false);
      fetchData();
    } catch (err: any) {
      Swal.fire("Lỗi", err.message || "Không thể chốt hóa đơn", "error");
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Quản lý Hợp đồng & Phí VietSage SaaS
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Quản lý hợp đồng tính phí SaaS, xem tổng quan doanh thu và chốt hóa đơn các kỳ thanh toán.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
          >
            <VsIcon name="plus" className="h-4 w-4" />
            Onboard Hợp đồng mới
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hợp đồng Active</div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {summary?.activeContracts ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Doanh thu SaaS đã chốt</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {Number(summary?.totalFinalizedRevenue ?? 0).toLocaleString("vi-VN")} VND
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kỳ hóa đơn đã chốt</div>
          <div className="mt-2 text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {summary?.finalizedPeriods ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kỳ sắp / Quá hạn</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600 dark:text-amber-400">
            {summary?.duePeriods?.length ?? 0}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("contracts")}
            className={`border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "contracts"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Danh sách Hợp đồng ({contracts.length})
          </button>
        </nav>
      </div>

      {/* Contracts Table */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">Đang tải dữ liệu hợp đồng...</div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Chưa có hợp đồng tính phí nào được ghi nhận.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Khách sạn</th>
                <th className="px-6 py-3.5 font-semibold">Trạng thái</th>
                <th className="px-6 py-3.5 font-semibold">Đơn giá phòng/ngày</th>
                <th className="px-6 py-3.5 font-semibold">Ngày bắt đầu tính phí</th>
                <th className="px-6 py-3.5 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {contracts.map((c) => {
                const latestRev = c.revisions[0];
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {c.hotel?.name || c.hotelId}
                      <span className="ml-2 text-xs font-mono text-slate-400">({c.hotel?.code})</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                      {latestRev ? Number(latestRev.roomDayUnitPrice).toLocaleString("vi-VN") : 0} {latestRev?.currency ?? "VND"}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono">
                      {new Date(c.billingStartedAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedContractId(c.id);
                          setShowFinalizeModal(true);
                        }}
                        className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        Chốt kỳ hóa đơn
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Onboard Hợp đồng VietSage SaaS</h3>
            <form onSubmit={handleCreateContract} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">ID Khách sạn (Hotel ID)</label>
                <input
                  type="text"
                  required
                  value={createForm.hotelId}
                  onChange={(e) => setCreateForm({ ...createForm, hotelId: e.target.value })}
                  placeholder="Nhập hotelId..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Đơn giá phòng/ngày (VND)</label>
                <input
                  type="number"
                  required
                  value={createForm.roomDayUnitPrice}
                  onChange={(e) => setCreateForm({ ...createForm, roomDayUnitPrice: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Ngày bắt đầu tính phí</label>
                <input
                  type="date"
                  required
                  value={createForm.billingStartedAt}
                  onChange={(e) => setCreateForm({ ...createForm, billingStartedAt: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Tạo hợp đồng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finalize Modal */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chốt Hóa đơn Kỳ thanh toán</h3>
            <form onSubmit={handleFinalizePeriod} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Từ ngày (Period Start)</label>
                <input
                  type="date"
                  required
                  value={finalizeForm.periodStart}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, periodStart: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Đến ngày (Period End Excl.)</label>
                <input
                  type="date"
                  required
                  value={finalizeForm.periodEnd}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, periodEnd: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Chốt hóa đơn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
