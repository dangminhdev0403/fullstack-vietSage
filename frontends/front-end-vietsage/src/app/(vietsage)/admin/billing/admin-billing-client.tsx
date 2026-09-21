"use client";

import { type FormEvent, useEffect, useState } from "react";
import { SwalVietSage, showSuccessAlert } from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { runtimeConsole } from "@/core/logging/runtime-console";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DebtStatementModal } from "@/app/(vietsage)/_components/debt-statement-modal";

type Period = {
  id: string;
  contractId?: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "FINALIZED" | "VOID";
  total: number;
  dueAt?: string;
  settledAmount?: number;
  outstandingAmount?: number;
  paymentState?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  isOverdue?: boolean;
  debtNoticeCount?: number;
  debtNoticeSentAt?: string | null;
};

type Contract = {
  id: string;
  hotelId: string;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  onboardedAt: string;
  billingStartedAt: string;
  hotel: { id: string; name: string; code: string };
  revisions: Array<{
    id: string;
    roomDayUnitPrice: number;
    pricingModel: "FIXED" | "PERCENTAGE";
    currency: string;
    starTierSnapshot: number;
  }>;
  periods: Period[];
};

type Summary = {
  activeContracts: number;
  finalizedPeriods: number;
  finalizedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  unpaidPeriodCount: number;
  overduePeriodCount: number;
  overdueAmount: number;
  duePeriods: Period[];
};

type HotelOption = {
  id: string;
  name: string;
  code?: string;
};

export function AdminBillingClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    hotelId: "",
    pricingModel: "FIXED" as "FIXED" | "PERCENTAGE",
    pricingValue: "10000",
    billingStartedAt: new Date().toISOString().substring(0, 10),
  });

  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [finalizeForm, setFinalizeForm] = useState({
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .substring(0, 10),
    periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      .toISOString()
      .substring(0, 10),
  });

  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [settlementForm, setSettlementForm] = useState({
    amount: "",
    method: "BANK_TRANSFER",
    reference: "",
  });
  const [settlementIdempotencyKey, setSettlementIdempotencyKey] = useState("");
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Debt notice / statement modal state
  const [statementPeriodId, setStatementPeriodId] = useState<string | null>(
    null,
  );
  const [issuingNoticeId, setIssuingNoticeId] = useState<string | null>(null);

  const refreshData = async () => {
    setLoadError(null);
    try {
      const [sumRes, contractsRes, hotelsRes] = await Promise.all([
        requestInternalApiEnvelope<Summary>(
          "/api/admin/platform-billing/dashboard/summary",
          { method: "GET" },
        ),
        requestInternalApiEnvelope<Contract[]>(
          "/api/admin/platform-billing/contracts",
          { method: "GET" },
        ),
        requestInternalApiEnvelope<{ items?: HotelOption[] }>(
          "/api/admin/hotels?limit=100",
          { method: "GET" },
        ),
      ]);
      if (sumRes.data) setSummary(sumRes.data);
      if (contractsRes.data) setContracts(contractsRes.data);
      if (hotelsRes.data?.items) setHotels(hotelsRes.data.items);
    } catch (err) {
      runtimeConsole.error(err);
      setLoadError(
        "Không tải được dữ liệu tài chính VietSage. Vui lòng thử lại.",
      );
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const [sumRes, contractsRes, hotelsRes] = await Promise.all([
          requestInternalApiEnvelope<Summary>(
            "/api/admin/platform-billing/dashboard/summary",
            { method: "GET" },
          ),
          requestInternalApiEnvelope<Contract[]>(
            "/api/admin/platform-billing/contracts",
            { method: "GET" },
          ),
          requestInternalApiEnvelope<{ items?: HotelOption[] }>(
            "/api/admin/hotels?limit=100",
            { method: "GET" },
          ),
        ]);
        if (!ignore) {
          if (sumRes.data) setSummary(sumRes.data);
          if (contractsRes.data) setContracts(contractsRes.data);
          if (hotelsRes.data?.items) setHotels(hotelsRes.data.items);
        }
      } catch (err) {
        runtimeConsole.error(err);
        if (!ignore) {
          setLoadError(
            "Không tải được dữ liệu tài chính VietSage. Vui lòng thử lại.",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const openSettlementModal = (period: Period) => {
    if (
      typeof crypto === "undefined" ||
      typeof crypto.randomUUID !== "function"
    ) {
      setSettlementError(
        "Môi trường trình duyệt không hỗ trợ crypto.randomUUID để khởi tạo mã idempotency an toàn.",
      );
      return;
    }

    const outstanding = period.outstandingAmount ?? period.total ?? 0;
    const key = `settle_${period.id}_${crypto.randomUUID()}`;

    setSelectedPeriod(period);
    setSettlementForm({
      amount: String(outstanding),
      method: "BANK_TRANSFER",
      reference: `REF_${period.id.substring(0, 8).toUpperCase()}`,
    });
    setSettlementIdempotencyKey(key);
    setSettlementError(null);
    setShowSettlementModal(true);
  };

  const closeSettlementModal = () => {
    setShowSettlementModal(false);
    setSelectedPeriod(null);
    setSettlementIdempotencyKey("");
    setSettlementError(null);
  };

  const handleIssueDebtNotice = async (periodId: string) => {
    const result = await SwalVietSage.fire({
      title: "Ghi nhận đã nhắc nợ?",
      text: "Bạn có chắc muốn ghi nhận đã nhắc nợ cho kỳ hóa đơn này?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ghi nhận đã nhắc nợ",
      cancelButtonText: "Hủy",
      reverseButtons: false,
    });
    if (!result.isConfirmed) return;

    setIssuingNoticeId(periodId);
    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/periods/${periodId}/debt-notice`,
        {
          method: "POST",
          body: { channel: "MANUAL", note: "Ghi nhận đã nhắc nợ thủ công" },
        },
      );
      await showSuccessAlert("Thành công", "Đã ghi nhận nhắc nợ thành công");
      void refreshData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể ghi nhận nhắc nợ";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIssuingNoticeId(null);
    }
  };

  const handleCreateContract = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.hotelId) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: "Vui lòng chọn khách sạn",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }
    try {
      await requestInternalApiEnvelope(
        "/api/admin/platform-billing/contracts",
        {
          method: "POST",
          body: {
            hotelId: createForm.hotelId,
            pricingModel: createForm.pricingModel,
            pricingValue: Number(createForm.pricingValue),
            billingStartedAt: createForm.billingStartedAt,
          },
        },
      );
      await showSuccessAlert("Thành công", "Đã khởi tạo hợp đồng tính phí mới");
      setShowCreateModal(false);
      void refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo hợp đồng";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  const handleFinalizePeriod = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/contracts/${selectedContractId}/finalize`,
        {
          method: "POST",
          body: finalizeForm,
        },
      );
      await showSuccessAlert(
        "Thành công",
        "Đã chốt hóa đơn kỳ thanh toán thành công",
      );
      setShowFinalizeModal(false);
      void refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể chốt hóa đơn";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  const handleRecordSettlement = async (e: FormEvent) => {
    e.preventDefault();
    setSettlementError(null);

    const numAmount = Number(settlementForm.amount);
    const maxAmount =
      selectedPeriod?.outstandingAmount ?? selectedPeriod?.total ?? 0;

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setSettlementError("Số tiền thanh toán phải là số hợp lệ lớn hơn 0");
      return;
    }

    if (numAmount > maxAmount) {
      setSettlementError(
        `Số tiền thanh toán không được vượt quá số tiền còn lại phải thanh toán (${maxAmount.toLocaleString("vi-VN")} VND)`,
      );
      return;
    }

    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/periods/${selectedPeriod?.id}/settlement`,
        {
          method: "POST",
          body: {
            amount: numAmount,
            method: settlementForm.method,
            reference: settlementForm.reference,
            idempotencyKey: settlementIdempotencyKey,
          },
        },
      );
      await showSuccessAlert("Thành công", "Đã ghi nhận thanh toán hóa đơn");
      closeSettlementModal();
      void refreshData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể ghi nhận thanh toán";
      setSettlementError(msg);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between border-b border-slate-200/80 pb-6 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <VsIcon name="payments" className="text-2xl" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Quản lý hợp đồng & Phí VietSage SaaS
            </h1>
          </div>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            Quản lý hợp đồng tính phí SaaS, theo dõi tổng quan doanh thu, chốt
            hóa đơn và ghi nhận thanh toán từ các khách sạn.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-600/30 active:scale-98"
        >
          <VsIcon name="add_circle" className="text-xl" />
          Onboard hợp đồng mới
        </button>
      </div>

      {/* Summary KPI Cards: Prioritize Outstanding, Overdue, Collected, Active */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Công nợ còn lại (Outstanding) */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Công nợ còn lại
            </p>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <VsIcon name="pending_actions" className="text-xl" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400">
            {Number(summary?.outstandingAmount ?? 0).toLocaleString("vi-VN")}{" "}
            <span className="text-sm font-semibold text-amber-600/80">VND</span>
          </p>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            Phí đã chốt:{" "}
            {Number(summary?.finalizedAmount ?? 0).toLocaleString("vi-VN")} VND
          </p>
        </div>

        {/* Card 2: Quá hạn thu hồi (Overdue) */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quá hạn thu hồi
            </p>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <VsIcon name="warning" className="text-xl" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-red-600 dark:text-red-400">
            {Number(summary?.overdueAmount ?? 0).toLocaleString("vi-VN")}{" "}
            <span className="text-sm font-semibold text-red-600/80">VND</span>
          </p>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            {summary?.overduePeriodCount ?? 0} kỳ cần ưu tiên thu hồi
          </p>
        </div>

        {/* Card 3: Đã thu (Collected) */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đã thu
            </p>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <VsIcon name="payments" className="text-xl" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
            {Number(summary?.collectedAmount ?? 0).toLocaleString("vi-VN")}{" "}
            <span className="text-sm font-semibold text-emerald-600/80">
              VND
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Đã ghi nhận thanh toán thực tế
          </p>
        </div>

        {/* Card 4: Hợp đồng Active */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Hợp đồng Active
            </p>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <VsIcon name="description" className="text-xl" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {summary?.activeContracts ?? 0}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Đang được tính phí phòng/ngày
          </p>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-base font-medium text-red-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void refreshData()}
              className="min-h-11 rounded-xl bg-red-700 px-4 text-base font-bold text-white"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Due / Overdue Work Queue */}
      {summary?.duePeriods && summary.duePeriods.length > 0 && (
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/50 p-6 dark:border-amber-800/60 dark:bg-amber-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <VsIcon
                name="notification_important"
                className="text-2xl text-amber-600 dark:text-amber-400"
              />
              <h2 className="text-lg font-bold">
                Hàng đợi công nợ &amp; kỳ đến hạn ({summary.duePeriods.length})
              </h2>
            </div>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Cần rà soát và ghi nhận nhắc nợ
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white dark:border-amber-900/50 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-amber-100/50 text-xs font-bold uppercase text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <tr>
                  <th className="px-4 py-3">Kỳ cước</th>
                  <th className="px-4 py-3">Hạn thanh toán</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Còn nợ</th>
                  <th className="px-4 py-3 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 dark:divide-amber-950">
                {summary.duePeriods.map((p) => {
                  const isFullyPaid = p.paymentState === "PAID";
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-amber-50/40 dark:hover:bg-amber-950/30"
                    >
                      <td className="px-4 py-3 font-medium">
                        {new Date(p.periodStart).toLocaleDateString("vi-VN")} —{" "}
                        {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {p.dueAt
                          ? new Date(p.dueAt).toLocaleDateString("vi-VN")
                          : "Chưa đặt"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-extrabold ${p.isOverdue ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}
                        >
                          {p.isOverdue ? "Quá hạn" : "Đến hạn"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-700 dark:text-amber-400">
                        {Number(p.outstandingAmount ?? p.total).toLocaleString(
                          "vi-VN",
                        )}{" "}
                        VND
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setStatementPeriodId(p.id)}
                            className="rounded-lg border border-slate-300 bg-white min-h-11 px-3 py-2 text-base font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            Bảng đối soát
                          </button>
                          {!isFullyPaid && (
                            <button
                              onClick={() => handleIssueDebtNotice(p.id)}
                              disabled={issuingNoticeId === p.id}
                              className="rounded-lg border border-amber-400 bg-amber-50 min-h-11 px-3 py-2 text-base font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            >
                              {issuingNoticeId === p.id
                                ? "Đang ghi..."
                                : "Ghi nhận đã nhắc nợ"}
                            </button>
                          )}
                          {!isFullyPaid && (
                            <button
                              onClick={() => openSettlementModal(p)}
                              className="rounded-lg bg-emerald-600 min-h-11 px-3 py-2 text-base font-bold text-white hover:bg-emerald-700"
                            >
                              Thanh toán
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-base font-semibold text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
        <VsIcon name="article" className="text-xl" />
        Hợp đồng tính phí ({contracts.length})
      </div>

      {/* Contracts Container */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-emerald-500 border-t-transparent text-emerald-500"></div>
          <p className="mt-4 text-base font-semibold text-slate-600 dark:text-slate-400">
            Đang tải dữ liệu hợp đồng & Kỳ hóa đơn...
          </p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <VsIcon
            name="assignment_late"
            className="mx-auto text-4xl text-slate-400"
          />
          <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
            Chưa có hợp đồng nào
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Bấm &quot;Onboard hợp đồng mới&quot; ở phía trên để bắt đầu tính phí
            SaaS cho khách sạn.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {contracts.map((c) => {
            const latestRev = c.revisions[0];
            return (
              <div
                key={c.id}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Contract Header Row */}
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/20">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {c.hotel?.name || c.hotelId}
                      </h3>
                      <span className="rounded-lg bg-slate-200/80 px-2.5 py-1 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {c.hotel?.code}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <VsIcon
                          name="sell"
                          className="text-base text-slate-400"
                        />
                        {latestRev?.pricingModel === "PERCENTAGE"
                          ? "Tỷ lệ phí"
                          : "Mức phí/phòng/ngày"}
                        :{" "}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {latestRev
                            ? Number(latestRev.roomDayUnitPrice).toLocaleString(
                                "vi-VN",
                              )
                            : 0}{" "}
                          {latestRev?.pricingModel === "PERCENTAGE"
                            ? "%"
                            : (latestRev?.currency ?? "VND")}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <VsIcon
                          name="calendar_today"
                          className="text-base text-slate-400"
                        />
                        Ngày bắt đầu tính phí:{" "}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {new Date(c.billingStartedAt).toLocaleDateString(
                            "vi-VN",
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setSelectedContractId(c.id);
                        setShowFinalizeModal(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 min-h-11 px-4 py-2.5 text-base font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-98"
                    >
                      <VsIcon name="fact_check" className="text-lg" />
                      Chốt kỳ hóa đơn
                    </button>
                  </div>
                </div>

                {/* Periods Breakdown Table */}
                <div className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Kỳ hóa đơn đã chốt ({c.periods?.length ?? 0})
                    </h4>
                  </div>
                  {!c.periods || c.periods.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm italic text-slate-400 dark:border-slate-800">
                      Chưa có kỳ hóa đơn nào được chốt cho hợp đồng này. Hãy
                      nhấn nút &quot;Chốt kỳ hóa đơn&quot; ở góc phải để tạo kỳ
                      đầu tiên.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-100/70 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                          <tr>
                            <th className="px-5 py-3.5 font-semibold">
                              Từ ngày
                            </th>
                            <th className="px-5 py-3.5 font-semibold">
                              Đến ngày
                            </th>
                            <th className="px-5 py-3.5 font-semibold">
                              Trạng thái thanh toán
                            </th>
                            <th className="px-5 py-3.5 font-semibold">
                              Tổng tiền & Dư nợ
                            </th>
                            <th className="px-5 py-3.5 font-semibold text-right">
                              Thao tác
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                          {c.periods.map((p) => {
                            const isFullyPaid =
                              p.paymentState === "PAID" ||
                              (p.outstandingAmount ?? 0) <= 0;
                            return (
                              <tr
                                key={p.id}
                                className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              >
                                <td className="px-5 py-4 font-mono font-semibold text-slate-900 dark:text-white">
                                  {new Date(p.periodStart).toLocaleDateString(
                                    "vi-VN",
                                  )}
                                </td>
                                <td className="px-5 py-4 font-mono font-semibold text-slate-900 dark:text-white">
                                  {new Date(p.periodEnd).toLocaleDateString(
                                    "vi-VN",
                                  )}
                                </td>
                                <td className="px-5 py-4">
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
                                        ? "Đã thanh toán (PAID)"
                                        : p.paymentState === "PARTIALLY_PAID"
                                          ? "Thanh toán một phần (PARTIALLY_PAID)"
                                          : "Chưa thanh toán (UNPAID)"}
                                    </span>
                                    {p.isOverdue && (
                                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-800 dark:bg-red-950 dark:text-red-300">
                                        Quá hạn
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                                  <div>
                                    <span className="text-base font-extrabold">
                                      {Number(p.total ?? 0).toLocaleString(
                                        "vi-VN",
                                      )}
                                    </span>{" "}
                                    <span className="text-xs font-bold text-slate-500">
                                      VND
                                    </span>
                                  </div>
                                  {!isFullyPaid &&
                                    p.outstandingAmount !== undefined && (
                                      <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                                        Còn nợ:{" "}
                                        {Number(
                                          p.outstandingAmount,
                                        ).toLocaleString("vi-VN")}{" "}
                                        VND
                                      </div>
                                    )}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2 flex-wrap">
                                    {/* View Statement */}
                                    <button
                                      onClick={() => setStatementPeriodId(p.id)}
                                      title="Xem phiếu báo công nợ"
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/60 bg-slate-50 min-h-11 px-3 py-2 text-base font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-100 hover:shadow dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300"
                                    >
                                      <VsIcon
                                        name="receipt_long"
                                        className="text-base"
                                      />
                                      Phiếu nợ
                                    </button>
                                    {/* Issue Debt Notice (only if finalized & unpaid) */}
                                    {p.status === "FINALIZED" &&
                                      !isFullyPaid && (
                                        <button
                                          onClick={() =>
                                            handleIssueDebtNotice(p.id)
                                          }
                                          disabled={issuingNoticeId === p.id}
                                          title="Ghi nhận đã nhắc nợ"
                                          className="relative inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-50 min-h-11 px-3 py-2 text-base font-bold text-amber-800 shadow-sm transition-all hover:bg-amber-100 hover:shadow disabled:opacity-50 dark:border-amber-600/50 dark:bg-amber-950/60 dark:text-amber-300"
                                        >
                                          <VsIcon
                                            name="mark_email_read"
                                            className="text-base"
                                          />
                                          {issuingNoticeId === p.id
                                            ? "Đang ghi..."
                                            : "Ghi nhận đã nhắc nợ"}
                                          {(p.debtNoticeCount ?? 0) > 0 && (
                                            <span className="ml-0.5 rounded-full bg-amber-700 px-1.5 py-0.5 text-sm font-extrabold text-white dark:bg-amber-400 dark:text-amber-950">
                                              {p.debtNoticeCount}
                                            </span>
                                          )}
                                        </button>
                                      )}
                                    {/* Record Payment */}
                                    {!isFullyPaid && (
                                      <button
                                        onClick={() => openSettlementModal(p)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 min-h-11 px-3.5 py-2 text-base font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 hover:shadow dark:border-emerald-700/60 dark:bg-emerald-950/80 dark:text-emerald-300"
                                      >
                                        <VsIcon
                                          name="payments"
                                          className="text-base"
                                        />
                                        Ghi nhận thanh toán
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Onboard Contract Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Onboard hợp đồng VietSage SaaS
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Đóng biểu mẫu tạo hợp đồng"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="onboard-hotel-select"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Khách sạn áp dụng hợp đồng{" "}
                  <span className="text-red-500">*</span>
                </label>
                <select
                  id="onboard-hotel-select"
                  required
                  value={createForm.hotelId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, hotelId: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- Chọn tên khách sạn --</option>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} {h.code ? `(${h.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="onboard-pricing-model"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Phương thức tính phí <span className="text-red-500">*</span>
                </label>
                <select
                  id="onboard-pricing-model"
                  value={createForm.pricingModel}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      pricingModel: e.target.value as "FIXED" | "PERCENTAGE",
                      pricingValue: "",
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="FIXED">Phí cố định</option>
                  <option value="PERCENTAGE">Phí theo tỷ lệ (%)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="onboard-unit-price"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  {createForm.pricingModel === "FIXED"
                    ? "Mức phí/phòng/ngày (VND)"
                    : "Tỷ lệ phí trên giá phòng (%)"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="onboard-unit-price"
                  type="number"
                  required
                  min="0"
                  max={
                    createForm.pricingModel === "PERCENTAGE" ? "100" : undefined
                  }
                  step={createForm.pricingModel === "PERCENTAGE" ? "0.01" : "1"}
                  value={createForm.pricingValue}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      pricingValue: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-sm text-slate-500">
                  {createForm.pricingModel === "FIXED"
                    ? "Mức phí cố định cho mỗi phòng lưu trú thực tế trong ngày."
                    : "Tỷ lệ áp dụng trên giá phòng đã lưu tại thời điểm phát sinh phí."}
                </p>
              </div>

              <div>
                <label
                  htmlFor="onboard-start-date"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Ngày bắt đầu tính phí <span className="text-red-500">*</span>
                </label>
                <input
                  id="onboard-start-date"
                  type="date"
                  required
                  value={createForm.billingStartedAt}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      billingStartedAt: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 min-h-11 px-5 py-2.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                >
                  Tạo hợp đồng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finalize Period Modal */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Chốt hóa đơn kỳ thanh toán
              </h3>
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                aria-label="Đóng biểu mẫu chốt kỳ"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleFinalizePeriod} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="finalize-period-start"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Từ ngày (Period Start) <span className="text-red-500">*</span>
                </label>
                <input
                  id="finalize-period-start"
                  type="date"
                  required
                  value={finalizeForm.periodStart}
                  onChange={(e) =>
                    setFinalizeForm({
                      ...finalizeForm,
                      periodStart: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="finalize-period-end"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Đến ngày (Period End - Half Open){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="finalize-period-end"
                  type="date"
                  required
                  value={finalizeForm.periodEnd}
                  onChange={(e) =>
                    setFinalizeForm({
                      ...finalizeForm,
                      periodEnd: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-sm text-slate-500">
                  Hệ thống sẽ tính tổng phòng/ngày phát sinh trong khoảng [Từ
                  ngày, Đến ngày) để niêm phong hóa đơn.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 min-h-11 px-5 py-2.5 text-base font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500"
                >
                  Chốt hóa đơn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Settlement Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Ghi nhận thanh toán hóa đơn
              </h3>
              <button
                type="button"
                onClick={closeSettlementModal}
                aria-label="Đóng biểu mẫu ghi nhận thanh toán"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleRecordSettlement} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="settle-amount"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Số tiền thanh toán (VND){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="settle-amount"
                  type="number"
                  required
                  min="0"
                  value={settlementForm.amount}
                  onChange={(e) => {
                    setSettlementForm({
                      ...settlementForm,
                      amount: e.target.value,
                    });
                    if (settlementError) setSettlementError(null);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {settlementError && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    {settlementError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="settle-method"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Phương thức thanh toán <span className="text-red-500">*</span>
                </label>
                <select
                  id="settle-method"
                  value={settlementForm.method}
                  onChange={(e) =>
                    setSettlementForm({
                      ...settlementForm,
                      method: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="BANK_TRANSFER">
                    Chuyển khoản ngân hàng (Bank Transfer)
                  </option>
                  <option value="CASH">Tiền mặt (Cash)</option>
                  <option value="CREDIT_CARD">
                    Thẻ tín dụng (Credit Card)
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="settle-reference"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Mã giao dịch / Ghi chú (Reference)
                </label>
                <input
                  id="settle-reference"
                  type="text"
                  placeholder="VD: FT2608039912"
                  value={settlementForm.reference}
                  onChange={(e) =>
                    setSettlementForm({
                      ...settlementForm,
                      reference: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeSettlementModal}
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 min-h-11 px-5 py-2.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                >
                  Ghi nhận thanh toán
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Debt Statement Modal */}
      {statementPeriodId && (
        <DebtStatementModal
          key={statementPeriodId}
          periodId={statementPeriodId}
          isOpen={true}
          onClose={() => setStatementPeriodId(null)}
          apiPathPrefix="admin"
        />
      )}
    </div>
  );
}
