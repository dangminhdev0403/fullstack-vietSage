"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SwalVietSage, showSuccessAlert } from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { runtimeConsole } from "@/core/logging/runtime-console";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DebtStatementModal } from "@/app/(vietsage)/_components/debt-statement-modal";
import { localMateAdminRepository } from "@/features/localmate-admin/repository";

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
  contract?: {
    id: string;
    hotelId: string;
    hotel?: { id: string; name: string; code: string };
    revisions?: Array<{
      pricingModel: "FIXED" | "PERCENTAGE";
      roomDayUnitPrice: number;
      currency: string;
    }>;
  };
  billableDaysCount?: number;
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
    effectiveFrom?: string;
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

function getMonthString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthRange(monthStr: string): { periodStart: string; periodEnd: string } {
  const [yearStr, mStr] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(mStr);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return {
    periodStart: start.toISOString().substring(0, 10),
    periodEnd: end.toISOString().substring(0, 10),
  };
}

export function AdminBillingClient({
  activeView = "invoices",
}: {
  activeView?: "invoices" | "finalize" | "contracts" | "localmate";
} = {}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [allPeriods, setAllPeriods] = useState<Period[]>([]);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"invoices" | "finalize" | "contracts" | "localmate">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (
        tabParam === "finalize" ||
        tabParam === "contracts" ||
        tabParam === "invoices" ||
        tabParam === "localmate"
      ) {
        return tabParam;
      }
    }
    return activeView;
  });

  const [prevActiveView, setPrevActiveView] = useState(activeView);
  if (prevActiveView !== activeView) {
    setPrevActiveView(activeView);
    setActiveTab(activeView);
  }

  // LocalMate Platform Fee Configuration State
  const [localMateFeeRate, setLocalMateFeeRate] = useState<number>(15);
  const [localMateFeeInput, setLocalMateFeeInput] = useState<number>(15);
  const [isSavingLocalMateFee, setIsSavingLocalMateFee] = useState<boolean>(false);
  const [simTourPrice, setSimTourPrice] = useState<number>(1000000);

  const handleTabChange = (tab: "invoices" | "finalize" | "contracts" | "localmate") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith("/finance")) {
        const targetPath =
          tab === "invoices"
            ? "/finance/billing"
            : tab === "finalize"
              ? "/finance/finalize"
              : tab === "contracts"
                ? "/finance/contracts"
                : "/admin/billing?tab=localmate";
        window.history.replaceState(null, "", `${targetPath}${url.search}`);
      } else {
        if (tab === "invoices") {
          url.searchParams.delete("tab");
        } else {
          url.searchParams.set("tab", tab);
        }
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
    }
  };

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (
        tabParam === "finalize" ||
        tabParam === "contracts" ||
        tabParam === "invoices" ||
        tabParam === "localmate"
      ) {
        setActiveTab(tabParam);
      }
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const handleSaveLocalMateFee = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (localMateFeeInput < 0 || localMateFeeInput > 100) {
      await SwalVietSage.fire({
        title: "Tỷ lệ không hợp lệ",
        text: "Mức phí VietSage thu LocalMate phải từ 0% đến 100%.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    setIsSavingLocalMateFee(true);
    try {
      const res = await localMateAdminRepository.updatePricingConfig(localMateFeeInput);
      const updatedRate = Number(res?.localMatePlatformFeeRate ?? localMateFeeInput);
      setLocalMateFeeRate(updatedRate);
      setLocalMateFeeInput(updatedRate);
      await showSuccessAlert(
        "Cập nhật thành công",
        `Đã lưu mức phí VietSage thu LocalMate là ${updatedRate}%. Tỷ lệ mới sẽ tự động áp dụng cho các tour và booking tiếp theo.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật biểu phí LocalMate.";
      await SwalVietSage.fire({
        title: "Lỗi",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsSavingLocalMateFee(false);
    }
  };


  // Invoices Tab Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNPAID" | "OVERDUE" | "PAID">("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");

  // Batch / Quick Finalize Tab State
  const [finalizeMonth, setFinalizeMonth] = useState<string>(getMonthString());
  const [isBatchFinalizing, setIsBatchFinalizing] = useState(false);

  // Modal: Onboard Contract
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submittingContract, setSubmittingContract] = useState(false);
  const [createForm, setCreateForm] = useState({
    hotelId: "",
    pricingModel: "FIXED" as "FIXED" | "PERCENTAGE",
    pricingValue: "10000",
    billingStartedAt: new Date().toISOString().substring(0, 10),
  });
  // Simulation states for fee estimation preview
  const [simCheckins, setSimCheckins] = useState(500);
  const [simMonthlyRevenue, setSimMonthlyRevenue] = useState(150000000);

  // Modal: Single / Custom Finalize
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

  // Modal: Settlement
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [settlementForm, setSettlementForm] = useState({
    amount: "",
    method: "BANK_TRANSFER",
    reference: "",
  });
  const [settlementIdempotencyKey, setSettlementIdempotencyKey] = useState("");
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Modal: Revision (Edit pricing)
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionContract, setRevisionContract] = useState<Contract | null>(null);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [revisionForm, setRevisionForm] = useState({
    pricingModel: "FIXED" as "FIXED" | "PERCENTAGE",
    pricingValue: "10000",
    effectiveFrom: new Date().toISOString().substring(0, 10),
  });

  // Modal: Debt Statement
  const [statementPeriodId, setStatementPeriodId] = useState<string | null>(null);
  const [issuingNoticeId, setIssuingNoticeId] = useState<string | null>(null);

  const refreshData = async () => {
    setLoadError(null);
    try {
      const [sumRes, contractsRes, hotelsRes, periodsRes, localMatePricingRes] = await Promise.all([
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
        requestInternalApiEnvelope<Period[]>(
          "/api/admin/platform-billing/periods?limit=100",
          { method: "GET" },
        ).catch(() => ({ data: [] as Period[] })),
        localMateAdminRepository
          .pricingConfig()
          .catch(() => ({ localMatePlatformFeeRate: 15 })),
      ]);

      if (sumRes.data) setSummary(sumRes.data);
      if (contractsRes.data) setContracts(contractsRes.data);
      if (hotelsRes.data?.items) setHotels(hotelsRes.data.items);
      if (localMatePricingRes?.localMatePlatformFeeRate != null) {
        const rate = Number(localMatePricingRes.localMatePlatformFeeRate);
        setLocalMateFeeRate(rate);
        setLocalMateFeeInput(rate);
      }

      if (periodsRes?.data && Array.isArray(periodsRes.data) && periodsRes.data.length > 0) {
        setAllPeriods(periodsRes.data);
      } else if (contractsRes.data) {
        const aggregated: Period[] = [];
        for (const c of contractsRes.data) {
          if (c.periods && c.periods.length > 0) {
            for (const p of c.periods) {
              aggregated.push({
                ...p,
                contract: {
                  id: c.id,
                  hotelId: c.hotelId,
                  hotel: c.hotel,
                  revisions: c.revisions,
                },
              });
            }
          }
        }
        aggregated.sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
        setAllPeriods(aggregated);
      }
    } catch (err) {
      runtimeConsole.error(err);
      setLoadError("Không tải được dữ liệu tài chính VietSage. Vui lòng thử lại.");
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const [sumRes, contractsRes, hotelsRes, periodsRes] = await Promise.all([
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
          requestInternalApiEnvelope<Period[]>(
            "/api/admin/platform-billing/periods?limit=100",
            { method: "GET" },
          ).catch(() => ({ data: [] as Period[] })),
        ]);

        if (!ignore) {
          if (sumRes.data) setSummary(sumRes.data);
          if (contractsRes.data) setContracts(contractsRes.data);
          if (hotelsRes.data?.items) setHotels(hotelsRes.data.items);

          if (periodsRes?.data && Array.isArray(periodsRes.data) && periodsRes.data.length > 0) {
            setAllPeriods(periodsRes.data);
          } else if (contractsRes.data) {
            const aggregated: Period[] = [];
            for (const c of contractsRes.data) {
              if (c.periods && c.periods.length > 0) {
                for (const p of c.periods) {
                  aggregated.push({
                    ...p,
                    contract: {
                      id: c.id,
                      hotelId: c.hotelId,
                      hotel: c.hotel,
                      revisions: c.revisions,
                    },
                  });
                }
              }
            }
            aggregated.sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
            setAllPeriods(aggregated);
          }
        }
      } catch (err) {
        runtimeConsole.error(err);
        if (!ignore) {
          setLoadError("Không tải được dữ liệu tài chính VietSage. Vui lòng thử lại.");
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

  // Filtered periods for Tab 1 (Actionable Invoices List)
  const filteredPeriods = useMemo(() => {
    return allPeriods.filter((p) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const hotelName = p.contract?.hotel?.name?.toLowerCase() || "";
        const hotelCode = p.contract?.hotel?.code?.toLowerCase() || "";
        if (!hotelName.includes(query) && !hotelCode.includes(query)) {
          return false;
        }
      }

      if (statusFilter === "UNPAID") {
        if (p.paymentState === "PAID") return false;
      } else if (statusFilter === "OVERDUE") {
        if (!p.isOverdue) return false;
      } else if (statusFilter === "PAID") {
        if (p.paymentState !== "PAID") return false;
      }

      if (monthFilter !== "ALL") {
        const pMonth = p.periodStart.substring(0, 7);
        if (pMonth !== monthFilter) return false;
      }

      return true;
    });
  }, [allPeriods, searchQuery, statusFilter, monthFilter]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPeriods) {
      if (p.periodStart) {
        set.add(p.periodStart.substring(0, 7));
      }
    }
    return Array.from(set).sort().reverse();
  }, [allPeriods]);

  const activeContracts = useMemo(() => {
    return contracts.filter((c) => c.status === "ACTIVE");
  }, [contracts]);

  const activeHotelIds = useMemo(() => {
    return new Set(activeContracts.map((c) => c.hotelId));
  }, [activeContracts]);

  // Settlement Handlers
  const openSettlementModal = (period: Period) => {
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
      setSettlementError("Môi trường trình duyệt không hỗ trợ crypto.randomUUID để khởi tạo mã idempotency an toàn.");
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

  const handleRecordSettlement = async (e: FormEvent) => {
    e.preventDefault();
    setSettlementError(null);

    const numAmount = Number(settlementForm.amount);
    const maxAmount = selectedPeriod?.outstandingAmount ?? selectedPeriod?.total ?? 0;

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
      await showSuccessAlert("Thành công", "Đã ghi nhận thanh toán hóa đơn thành công");
      closeSettlementModal();
      void refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể ghi nhận thanh toán";
      setSettlementError(msg);
    }
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
      const msg = err instanceof Error ? err.message : "Không thể ghi nhận nhắc nợ";
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

  const handleBatchFinalize = async () => {
    const { periodStart, periodEnd } = getMonthRange(finalizeMonth);
    const [y, m] = finalizeMonth.split("-");

    const result = await SwalVietSage.fire({
      title: `Chốt kỳ Tháng ${m}/${y}?`,
      text: `Hệ thống sẽ chốt doanh thu và tạo hóa đơn cho tất cả ${activeContracts.length} khách sạn đang hoạt động trong kỳ từ ${periodStart} đến ${periodEnd}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Xác nhận chốt kỳ",
      cancelButtonText: "Hủy",
      reverseButtons: false,
    });
    if (!result.isConfirmed) return;

    setIsBatchFinalizing(true);
    try {
      const res = await requestInternalApiEnvelope<{
        finalizedCount: number;
        results?: Array<{ hotelName: string; total: number }>;
      }>("/api/admin/platform-billing/batch-finalize", {
        method: "POST",
        body: { periodStart, periodEnd },
      });

      const count = res.data?.finalizedCount ?? activeContracts.length;
      await showSuccessAlert(
        "Chốt kỳ thành công",
        `Đã chốt hóa đơn kỳ Tháng ${m}/${y} cho ${count} khách sạn đối tác.`,
      );
      void refreshData();
      handleTabChange("invoices");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể chốt kỳ hóa đơn hàng loạt";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsBatchFinalizing(false);
    }
  };

  const handleQuickFinalizeHotel = async (contractId: string, hotelName: string) => {
    const { periodStart, periodEnd } = getMonthRange(finalizeMonth);
    const [y, m] = finalizeMonth.split("-");

    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/contracts/${contractId}/finalize`,
        {
          method: "POST",
          body: { periodStart, periodEnd },
        },
      );
      await showSuccessAlert(
        "Chốt kỳ thành công",
        `Đã chốt hóa đơn Tháng ${m}/${y} cho khách sạn ${hotelName}.`,
      );
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
      await showSuccessAlert("Thành công", "Đã chốt hóa đơn kỳ thanh toán thành công");
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

  const handleCreateContract = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.hotelId) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: "Vui lòng chọn khách sạn áp dụng hợp đồng",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const hasActive = activeHotelIds.has(createForm.hotelId);
    if (hasActive) {
      await SwalVietSage.fire({
        icon: "warning",
        title: "Khách sạn đã có hợp đồng",
        text: "Khách sạn này đã có hợp đồng tính phí đang hoạt động. Vui lòng chọn khách sạn khác hoặc cập nhật biểu phí.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const numValue = Number(createForm.pricingValue);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: "Mức phí/tỷ lệ phí phải là số hợp lệ lớn hơn 0",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    if (createForm.pricingModel === "PERCENTAGE" && numValue > 100) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: "Tỷ lệ phí phần trăm không được vượt quá 100%",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    setSubmittingContract(true);
    try {
      await requestInternalApiEnvelope("/api/admin/platform-billing/contracts", {
        method: "POST",
        body: {
          hotelId: createForm.hotelId,
          pricingModel: createForm.pricingModel,
          pricingValue: numValue,
          billingStartedAt: createForm.billingStartedAt,
        },
      });
      await showSuccessAlert(
        "Khởi tạo thành công",
        "Đã hoàn tất onboard hợp đồng tính phí VietSage SaaS cho khách sạn.",
      );
      setShowCreateModal(false);
      setCreateForm({
        hotelId: "",
        pricingModel: "FIXED",
        pricingValue: "10000",
        billingStartedAt: new Date().toISOString().substring(0, 10),
      });
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
    } finally {
      setSubmittingContract(false);
    }
  };

  const handleAddRevision = async (e: FormEvent) => {
    e.preventDefault();
    if (!revisionContract) return;

    const numValue = Number(revisionForm.pricingValue);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: "Mức phí phải là số hợp lệ lớn hơn 0",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    setSubmittingRevision(true);
    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/contracts/${revisionContract.id}/revisions`,
        {
          method: "POST",
          body: {
            effectiveFrom: revisionForm.effectiveFrom,
            pricingModel: revisionForm.pricingModel,
            pricingValue: numValue,
          },
        },
      );
      await showSuccessAlert("Thành công", "Đã cập nhật biểu phí hợp đồng thành công");
      setShowRevisionModal(false);
      void refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật biểu phí";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleToggleContractStatus = async (contract: Contract) => {
    const nextStatus = contract.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const actionText = nextStatus === "ACTIVE" ? "Kích hoạt lại" : "Tạm dừng";

    const result = await SwalVietSage.fire({
      title: `${actionText} hợp đồng?`,
      text: `Bạn có chắc muốn ${actionText.toLowerCase()} hợp đồng tính phí của ${contract.hotel?.name}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: actionText,
      cancelButtonText: "Hủy",
      reverseButtons: false,
    });
    if (!result.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/admin/platform-billing/contracts/${contract.id}/status`,
        {
          method: "PATCH",
          body: { status: nextStatus },
        },
      );
      await showSuccessAlert("Thành công", `Đã ${actionText.toLowerCase()} hợp đồng.`);
      void refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể đổi trạng thái hợp đồng";
      await SwalVietSage.fire({
        icon: "error",
        title: "Lỗi",
        text: msg,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  return (
    <div className="w-full space-y-5 px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${
              activeTab === "invoices"
                ? "bg-emerald-600 text-white"
                : activeTab === "finalize"
                  ? "bg-indigo-600 text-white"
                  : activeTab === "contracts"
                    ? "bg-slate-800 text-white dark:bg-slate-700"
                    : "bg-teal-600 text-white"
            }`}
          >
            <VsIcon
              name={
                activeTab === "invoices"
                  ? "receipt_long"
                  : activeTab === "finalize"
                    ? "bolt"
                    : activeTab === "contracts"
                      ? "apartment"
                      : "handshake"
              }
              className="text-2xl"
            />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {activeTab === "invoices"
                ? "Hóa đơn & Công nợ"
                : activeTab === "finalize"
                  ? "Chốt kỳ cước theo tháng"
                  : activeTab === "contracts"
                    ? "Hợp đồng & Biểu phí SaaS"
                    : "Biểu phí Nền tảng LocalMate"}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {activeTab === "invoices"
                ? "Theo dõi công nợ, ghi nhận thanh toán và phát hành phiếu đối soát."
                : activeTab === "finalize"
                  ? "Chốt sổ doanh thu định kỳ, niêm phong hóa đơn cho từng khách sạn đối tác."
                  : activeTab === "contracts"
                    ? "Quản lý thỏa thuận biểu phí theo lượt check-in hoặc % doanh thu phòng cho khách sạn."
                    : "Cấu hình mức phí nền tảng VietSage thu từ mạng lưới Hướng dẫn viên du lịch LocalMate."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleTabChange("localmate")}
            className={`inline-flex items-center gap-2 rounded-xl min-h-10 px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === "localmate"
                ? "bg-teal-700 text-white shadow-sm"
                : "border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-300"
            }`}
          >
            <VsIcon name="handshake" className="text-base" />
            <span>Phí LocalMate ({localMateFeeRate}%)</span>
          </button>

          {activeTab !== "finalize" && (
            <button
              type="button"
              onClick={() => handleTabChange("finalize")}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 min-h-10 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"
            >
              <VsIcon name="bolt" className="text-base" />
              <span>Chốt kỳ</span>
            </button>
          )}

          {activeTab !== "invoices" && (
            <button
              type="button"
              onClick={() => handleTabChange("invoices")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white min-h-10 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
            >
              <VsIcon name="receipt_long" className="text-base" />
              <span>Hóa đơn</span>
            </button>
          )}


          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 min-h-10 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors"
          >
            <VsIcon name="add_circle" className="text-base" />
            Onboard hợp đồng
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Công nợ còn lại */}
        <div
          onClick={() => {
            handleTabChange("invoices");
            setStatusFilter("UNPAID");
          }}
          className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Công nợ còn lại
              </p>
              <p className="mt-2.5 text-2xl font-extrabold tabular-nums tracking-tight text-amber-600 dark:text-amber-400">
                {Number(summary?.outstandingAmount ?? 0).toLocaleString("vi-VN")}
                <span className="ml-1 text-sm font-bold text-amber-600/70">VND</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Phí đã chốt:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {Number(summary?.finalizedAmount ?? 0).toLocaleString("vi-VN")} đ
                </span>
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-950/50 dark:text-amber-400">
              <VsIcon name="pending_actions" className="text-xl" />
            </span>
          </div>
        </div>

        {/* Card 2: Quá hạn thu hồi */}
        <div
          onClick={() => {
            handleTabChange("invoices");
            setStatusFilter("OVERDUE");
          }}
          className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-red-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Quá hạn thu hồi
              </p>
              <p className="mt-2.5 text-2xl font-extrabold tabular-nums tracking-tight text-red-600 dark:text-red-400">
                {Number(summary?.overdueAmount ?? 0).toLocaleString("vi-VN")}
                <span className="ml-1 text-sm font-bold text-red-600/70">VND</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {summary?.overduePeriodCount ?? 0} kỳ
                </span>{" "}
                cần ưu tiên thu hồi
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-400">
              <VsIcon name="warning" className="text-xl" />
            </span>
          </div>
        </div>

        {/* Card 3: Đã thu */}
        <div
          onClick={() => {
            handleTabChange("invoices");
            setStatusFilter("PAID");
          }}
          className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Đã thu
              </p>
              <p className="mt-2.5 text-2xl font-extrabold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                {Number(summary?.collectedAmount ?? 0).toLocaleString("vi-VN")}
                <span className="ml-1 text-sm font-bold text-emerald-600/70">VND</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Ghi nhận thanh toán thực tế
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-400">
              <VsIcon name="payments" className="text-xl" />
            </span>
          </div>
        </div>

        {/* Card 4: Hợp đồng Active */}
        <div
          onClick={() => handleTabChange("contracts")}

          className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Hợp đồng hoạt động
              </p>
              <p className="mt-2.5 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
                {summary?.activeContracts ?? 0}
                <span className="ml-1 text-sm font-bold text-slate-500">khách sạn</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Đang tính phí theo lượt check-in
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-950/50 dark:text-blue-400">
              <VsIcon name="description" className="text-xl" />
            </span>
          </div>
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

      {/* Navigation Tab Bar — Segmented Control Style */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-slate-100/70 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60">
        <nav className="flex flex-wrap gap-1" aria-label="Finance Views Navigation">
          <button
            type="button"
            onClick={() => handleTabChange("invoices")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all min-h-9 ${
              activeTab === "invoices"
                ? "bg-white text-emerald-700 shadow-sm border border-slate-200/80 dark:bg-slate-800 dark:text-emerald-400 dark:border-slate-700"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <VsIcon name="receipt_long" className="text-base" />
            <span>Hóa đơn & Công nợ</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                activeTab === "invoices"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {allPeriods.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("finalize")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all min-h-9 ${
              activeTab === "finalize"
                ? "bg-white text-indigo-700 shadow-sm border border-slate-200/80 dark:bg-slate-800 dark:text-indigo-400 dark:border-slate-700"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <VsIcon name="bolt" className="text-base" />
            <span>Chốt kỳ theo tháng</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("contracts")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all min-h-9 ${
              activeTab === "contracts"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/80 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <VsIcon name="apartment" className="text-base" />
            <span>Hợp đồng & Biểu phí ({contracts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("localmate")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all min-h-9 ${
              activeTab === "localmate"
                ? "bg-white text-teal-700 shadow-sm border border-slate-200/80 dark:bg-slate-800 dark:text-teal-400 dark:border-slate-700"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <VsIcon name="handshake" className="text-base" />
            <span>Biểu phí LocalMate</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                activeTab === "localmate"
                  ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                  : "bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400"
              }`}
            >
              {localMateFeeRate}%
            </span>
          </button>
        </nav>

        <button
          type="button"
          onClick={() => void refreshData()}
          title="Tải lại dữ liệu"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <VsIcon name="refresh" className="text-base" />
          <span>Làm mới</span>
        </button>
      </div>



      {/* ========================================================================= */}
      {/* VIEW 1: DANH SÁCH HÓA ĐƠN & CÔNG NỢ (ACTIONABLE INVOICES TABLE) */}
      {/* ========================================================================= */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-lg">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <VsIcon name="search" className="text-lg" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm khách sạn theo tên hoặc mã (VD: Test, SGSTAR)..."
                className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  <VsIcon name="cancel" className="text-base" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                  statusFilter === "ALL"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                Tất cả ({allPeriods.length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("UNPAID")}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                  statusFilter === "UNPAID"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
                }`}
              >
                Chưa thanh toán ({allPeriods.filter((p) => p.paymentState !== "PAID").length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("OVERDUE")}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                  statusFilter === "OVERDUE"
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"
                }`}
              >
                Quá hạn ({allPeriods.filter((p) => p.isOverdue).length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("PAID")}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                  statusFilter === "PAID"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                }`}
              >
                Đã thu ({allPeriods.filter((p) => p.paymentState === "PAID").length})
              </button>

              {availableMonths.length > 0 && (
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">Tất cả kỳ cước</option>
                  {availableMonths.map((m) => {
                    const [y, mm] = m.split("-");
                    return (
                      <option key={m} value={m}>
                        Tháng {mm}/{y}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          </div>

          {/* Full-width Spacious Actionable Table */}
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-emerald-500 border-t-transparent text-emerald-500"></div>
              <p className="mt-4 text-base font-semibold text-slate-600 dark:text-slate-400">
                Đang tải danh sách kỳ hóa đơn &amp; công nợ...
              </p>
            </div>
          ) : filteredPeriods.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center dark:border-slate-800 bg-white dark:bg-slate-900">
              <VsIcon name="search_off" className="mx-auto text-4xl text-slate-400" />
              <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                Không tìm thấy kỳ hóa đơn nào
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchQuery || statusFilter !== "ALL" || monthFilter !== "ALL"
                  ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm để xem các kỳ khác."
                  : "Chưa có kỳ hóa đơn nào được chốt trên toàn hệ thống."}
              </p>
              {(searchQuery || statusFilter !== "ALL" || monthFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                    setMonthFilter("ALL");
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">Khách sạn đối tác</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">Kỳ cước</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">Trạng thái</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Tổng tiền</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Đã thu</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Còn nợ</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">Hạn nợ</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPeriods.map((p) => {
                      const isFullyPaid = p.paymentState === "PAID";
                      const hotelName = p.contract?.hotel?.name || "Khách sạn";
                      const hotelCode = p.contract?.hotel?.code || "";
                      const outstanding = p.outstandingAmount ?? p.total ?? 0;
                      const settled = p.settledAmount ?? 0;

                      return (
                        <tr
                          key={p.id}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-3.5 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">
                                {hotelName}
                              </span>
                              {hotelCode && (
                                <span className="mt-0.5 inline-block w-fit rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  {hotelCode}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 font-mono text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            <div>
                              {new Date(p.periodStart).toLocaleDateString("vi-VN")} →{" "}
                              {new Date(p.periodEnd).toLocaleDateString("vi-VN")}
                            </div>
                            <span className="text-xs font-semibold text-slate-400">
                              Kỳ T{new Date(p.periodStart).getMonth() + 1}/{new Date(p.periodStart).getFullYear()}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-nowrap">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
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
                                    ? "Thanh toán 1 phần"
                                    : "Chưa thanh toán"}
                              </span>
                              {p.isOverdue && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-800 dark:bg-red-950 dark:text-red-300 whitespace-nowrap">
                                  Quá hạn
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {Number(p.total ?? 0).toLocaleString("vi-VN")} đ
                          </td>

                          <td className="px-3.5 py-3 text-right font-mono font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            {Number(settled).toLocaleString("vi-VN")} đ
                          </td>

                          <td className="px-3.5 py-3 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            {Number(outstanding).toLocaleString("vi-VN")} đ
                          </td>

                          <td className="px-3.5 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {p.dueAt ? (
                              <span className={p.isOverdue ? "text-red-600 font-bold" : ""}>
                                {new Date(p.dueAt).toLocaleDateString("vi-VN")}
                              </span>
                            ) : (
                              "Chưa đặt"
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              {!isFullyPaid && (
                                <button
                                  type="button"
                                  onClick={() => openSettlementModal(p)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all active:scale-98 whitespace-nowrap"
                                >
                                  <VsIcon name="payments" className="text-sm" />
                                  <span className="whitespace-nowrap">Thanh toán</span>
                                </button>
                              )}

                              {!isFullyPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleIssueDebtNotice(p.id)}
                                  disabled={issuingNoticeId === p.id}
                                  title="Ghi nhận đã nhắc nợ cho khách sạn"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 transition-all whitespace-nowrap disabled:opacity-50"
                                >
                                  <VsIcon name="notifications" className="text-sm" />
                                  <span className="whitespace-nowrap">{issuingNoticeId === p.id ? "Đang ghi..." : "Ghi nhận đã nhắc nợ"}</span>
                                  {(p.debtNoticeCount ?? 0) > 0 && (
                                    <span className="ml-0.5 rounded-full bg-amber-700 px-1.5 py-0.2 text-[10px] font-bold text-white dark:bg-amber-400 dark:text-amber-950 whitespace-nowrap">
                                      {p.debtNoticeCount}
                                    </span>
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setStatementPeriodId(p.id)}
                                title="Xem phiếu báo công nợ và đối soát chi tiết"
                                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-all whitespace-nowrap"
                              >
                                <VsIcon name="receipt" className="text-sm" />
                                <span className="whitespace-nowrap">Phiếu nợ</span>
                              </button>
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: CHỐT KỲ CƯỚC THEO THÁNG (MONTHLY BILLING CYCLE / BATCH FINALIZE) */}
      {/* ========================================================================= */}
      {activeTab === "finalize" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 via-slate-50 to-white p-6 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  <VsIcon name="auto_mode" className="text-sm" />
                  Quy trình chốt sổ chu kỳ SaaS
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                  Chốt doanh thu &amp; phát hành hóa đơn theo tháng
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Chọn tháng cần chốt sổ. Hệ thống sẽ tự động tính toán số lượt check-in thực tế và niêm phong hóa đơn cho các khách sạn đối tác.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3.5 shadow-sm transition-all hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800/90 dark:hover:border-slate-600 shrink-0">
                  <label htmlFor="finalize-month-input" className="shrink-0 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Chọn tháng:
                  </label>
                  <input
                    id="finalize-month-input"
                    type="month"
                    value={finalizeMonth}
                    onChange={(e) => setFinalizeMonth(e.target.value)}
                    className="border-0 bg-transparent text-sm font-bold text-slate-900 outline-none dark:text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-75 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleBatchFinalize}
                  disabled={isBatchFinalizing || activeContracts.length === 0}
                  className="inline-flex h-11 items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/30 disabled:opacity-50 transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
                >
                  {isBatchFinalizing ? (
                    <>
                      <VsIcon name="progress_activity" className="text-base animate-spin" />
                      <span>Đang chốt sổ...</span>
                    </>
                  ) : (
                    <>
                      <VsIcon name="bolt" className="text-base text-amber-300" />
                      <span>Chốt tất cả khách sạn</span>
                      <span className="inline-flex items-center justify-center rounded-lg bg-white/20 px-2 py-0.5 text-xs font-bold leading-none text-white">
                        {activeContracts.length}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Khách sạn áp dụng trong kỳ ({finalizeMonth})
                </h3>
                <p className="text-sm text-slate-500">
                  Trạng thái chốt sổ của các khách sạn đối tác cho tháng được chọn.
                </p>
              </div>
            </div>

            {activeContracts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm italic text-slate-400">
                Không có hợp đồng nào đang ở trạng thái ACTIVE. Hãy vào tab &quot;Hợp đồng &amp; Biểu phí&quot; để onboard khách sạn.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Khách sạn</th>
                      <th className="px-4 py-3 whitespace-nowrap">Biểu phí SaaS</th>
                      <th className="px-4 py-3 whitespace-nowrap">Trạng thái kỳ này</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeContracts.map((c) => {
                      const latestRev = c.revisions[0];
                      const existingPeriodForMonth = c.periods?.find(
                        (p) => p.periodStart && p.periodStart.startsWith(finalizeMonth),
                      );

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                            <div>{c.hotel?.name}</div>
                            <span className="font-mono text-xs text-slate-500">{c.hotel?.code}</span>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                            <strong>
                              {latestRev
                                ? Number(latestRev.roomDayUnitPrice).toLocaleString("vi-VN")
                                : 0}{" "}
                              {latestRev?.pricingModel === "PERCENTAGE" ? "%" : "VND / lượt"}
                            </strong>
                          </td>
                          <td className="px-4 py-3.5">
                            {existingPeriodForMonth ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <VsIcon name="check_circle" className="text-xs" />
                                Đã chốt hóa đơn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                <VsIcon name="schedule" className="text-xs" />
                                Chưa chốt kỳ này
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {existingPeriodForMonth ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleTabChange("invoices");
                                  setSearchQuery(c.hotel?.name || "");
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              >
                                Xem hóa đơn
                              </button>

                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleQuickFinalizeHotel(c.id, c.hotel?.name)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-sm"
                                >
                                  <VsIcon name="fact_check" className="text-xs" />
                                  Chốt kỳ ngay
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedContractId(c.id);
                                    setShowFinalizeModal(true);
                                  }}
                                  title="Chốt kỳ với khoảng ngày tùy chỉnh"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  Tùy chọn ngày
                                </button>
                              </div>
                            )}
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
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: QUẢN LÝ HỢP ĐỒNG & BIỂU PHÍ (HOTELS & PRICING CONTRACTS) */}
      {/* ========================================================================= */}
      {activeTab === "contracts" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                Danh sách Hợp đồng &amp; Biểu phí đối tác
              </h2>
              <p className="text-sm text-slate-500">
                Quản lý các thỏa thuận mức phí tính theo lượt check-in hoặc % doanh thu cho từng khách sạn.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 min-h-11 px-5 py-2.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500"
            >
              <VsIcon name="add_circle" className="text-lg" />
              Onboard hợp đồng mới
            </button>
          </div>

          {/* Callout to LocalMate Fee Separation */}
          <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 to-emerald-50/60 p-4.5 dark:border-teal-900/60 dark:bg-teal-950/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                <VsIcon name="handshake" className="text-xl" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-teal-950 dark:text-teal-200">
                    Phí Nền tảng LocalMate (Tour &amp; Hướng dẫn viên): Hiện đang thu {localMateFeeRate}%
                  </h4>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-extrabold text-teal-800 dark:bg-teal-900 dark:text-teal-300">
                    Chính sách riêng
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  LocalMate là nghiệp vụ hướng dẫn viên du lịch địa phương, tách biệt hoàn toàn với biểu phí SaaS phòng và dịch vụ Marketplace bên ngoài.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange("localmate")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-600 transition-colors shadow-sm"
            >
              <span>Xem &amp; chỉnh sửa phí LocalMate</span>
              <VsIcon name="arrow_forward" className="text-xs" />
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-4 whitespace-nowrap">Khách sạn</th>
                    <th className="px-5 py-4 whitespace-nowrap">Biểu phí SaaS</th>
                    <th className="px-5 py-4 whitespace-nowrap">Ngày bắt đầu</th>
                    <th className="px-5 py-4 whitespace-nowrap">Trạng thái</th>
                    <th className="px-5 py-4 text-center whitespace-nowrap">Số kỳ đã chốt</th>
                    <th className="px-5 py-4 text-right whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {contracts.map((c) => {
                    const latestRev = c.revisions[0];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                          <div className="text-base">{c.hotel?.name || c.hotelId}</div>
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {c.hotel?.code}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                            {latestRev
                              ? Number(latestRev.roomDayUnitPrice).toLocaleString("vi-VN")
                              : 0}{" "}
                            {latestRev?.pricingModel === "PERCENTAGE" ? "%" : (latestRev?.currency ?? "VND")}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {latestRev?.pricingModel === "PERCENTAGE"
                              ? "% doanh thu phòng"
                              : "VND / lượt check-in"}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-mono text-sm text-slate-600 dark:text-slate-400">
                          {new Date(c.billingStartedAt).toLocaleDateString("vi-VN")}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                              c.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${c.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                            {c.status === "ACTIVE" ? "Hoạt động" : c.status === "SUSPENDED" ? "Tạm dừng" : c.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center font-bold text-slate-700 dark:text-slate-300">
                          {c.periods?.length ?? 0}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionContract(c);
                                setRevisionForm({
                                  pricingModel: latestRev?.pricingModel || "FIXED",
                                  pricingValue: String(latestRev?.roomDayUnitPrice || 10000),
                                  effectiveFrom: new Date().toISOString().substring(0, 10),
                                });
                                setShowRevisionModal(true);
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Điều chỉnh giá
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleContractStatus(c)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                c.status === "ACTIVE"
                                  ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                  : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {c.status === "ACTIVE" ? "Tạm dừng" : "Kích hoạt"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: CẤU HÌNH BIỂU PHÍ NỀN TẢNG LOCALMATE (LOCALMATE PLATFORM PRICING) */}
      {/* ========================================================================= */}
      {activeTab === "localmate" && (
        <div className="space-y-6">
          {/* Header & KPI Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/60 to-white p-5 shadow-sm dark:border-teal-900/60 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                    Phí VietSage thu
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-teal-900 dark:text-white">
                    {localMateFeeRate}%
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/20">
                  <VsIcon name="payments" className="text-2xl" />
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Hoa hồng trích từ mỗi booking tour hoàn thành
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white p-5 shadow-sm dark:border-emerald-900/60 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    LocalMate thực nhận
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-emerald-900 dark:text-white">
                    {100 - localMateFeeRate}%
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                  <VsIcon name="handshake" className="text-2xl" />
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Thu nhập ròng chuyển về ví Hướng dẫn viên
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Phạm vi áp dụng
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                    Toàn sàn LocalMate
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <VsIcon name="explore" className="text-2xl" />
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Độc lập với Marketplace &amp; SaaS khách sạn
              </p>
            </div>
          </div>

          {/* Form & Simulator Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: Configuration Form */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                  <VsIcon name="tune" className="text-xl" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Điều chỉnh Tỷ lệ Thu phí Platform
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cập nhật tỷ lệ hoa hồng VietSage thu từ hướng dẫn viên du lịch
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveLocalMateFee} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="localmate-fee-input" className="block text-sm font-bold text-slate-900 dark:text-white">
                    Tỷ lệ hoa hồng VietSage thu (%)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        id="localmate-fee-input"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={localMateFeeInput}
                        onChange={(e) => setLocalMateFeeInput(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold text-slate-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        placeholder="Nhập số % (0 - 100)"
                      />
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 font-bold text-slate-400">
                        %
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      {[10, 15, 20, 25].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setLocalMateFeeInput(preset)}
                          className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                            localMateFeeInput === preset
                              ? "bg-teal-700 text-white shadow-sm"
                              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Range Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>0% (Miễn phí)</span>
                    <span className="text-teal-700 dark:text-teal-400 font-bold">{localMateFeeInput}%</span>
                    <span>50% (Mức đề xuất)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={Math.min(50, localMateFeeInput)}
                    onChange={(e) => setLocalMateFeeInput(Number(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer h-2 bg-slate-200 rounded-lg dark:bg-slate-700"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 space-y-1 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <VsIcon name="info" className="text-sm text-teal-600" />
                    <span>Quy tắc áp dụng biểu phí:</span>
                  </div>
                  <p>
                    • Mức phí mặc định toàn hệ thống là <strong>15%</strong>.
                  </p>
                  <p>
                    • Khi lưu thay đổi, mức phí mới sẽ áp dụng ngay cho tất cả booking tour LocalMate mới khởi tạo.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-500">
                    Hiện tại đang áp dụng: <strong className="text-teal-700 dark:text-teal-400">{localMateFeeRate}%</strong>
                  </span>
                  <button
                    type="submit"
                    disabled={isSavingLocalMateFee || localMateFeeInput === localMateFeeRate}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isSavingLocalMateFee ? (
                      <>
                        <VsIcon name="progress_activity" className="animate-spin text-base" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <VsIcon name="check_circle" className="text-base" />
                        <span>Cập nhật biểu phí LocalMate</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Live Commission Simulator */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <VsIcon name="fact_check" className="text-xl" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Mô phỏng Phân chia Doanh thu Tour
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tính toán tức thời dòng tiền theo mức phí đang nhập ({localMateFeeInput}%)
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="sim-tour-price-input" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Giá trị booking tour mẫu (VND)
                  </label>
                  <div className="relative">
                    <input
                      id="sim-tour-price-input"
                      type="number"
                      step="50000"
                      min="0"
                      value={simTourPrice}
                      onChange={(e) => setSimTourPrice(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="1,000,000"
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 font-bold text-slate-400 text-sm">
                      VND
                    </span>
                  </div>
                </div>

                {/* Visual Ratio Progress Bar */}
                <div className="space-y-1.5">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
                    <div
                      style={{ width: `${Math.max(0, Math.min(100, 100 - localMateFeeInput))}%` }}
                      className="bg-emerald-500 transition-all duration-300 flex items-center justify-center text-[10px] font-extrabold text-white"
                      title={`LocalMate: ${100 - localMateFeeInput}%`}
                    >
                      {100 - localMateFeeInput >= 15 ? `${100 - localMateFeeInput}%` : ""}
                    </div>
                    <div
                      style={{ width: `${Math.max(0, Math.min(100, localMateFeeInput))}%` }}
                      className="bg-teal-600 transition-all duration-300 flex items-center justify-center text-[10px] font-extrabold text-white"
                      title={`VietSage: ${localMateFeeInput}%`}
                    >
                      {localMateFeeInput >= 15 ? `${localMateFeeInput}%` : ""}
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ● Hướng dẫn viên ({100 - localMateFeeInput}%)
                    </span>
                    <span className="text-teal-700 dark:text-teal-400">
                      ● VietSage Fee ({localMateFeeInput}%)
                    </span>
                  </div>
                </div>

                {/* Calculation Breakdown Table */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-850/50 p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Khách du lịch thanh toán:</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {simTourPrice.toLocaleString("vi-VN")} VND
                    </span>
                  </div>
                  <div className="border-t border-slate-200/60 dark:border-slate-800 pt-2 flex items-center justify-between text-sm">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                      <VsIcon name="handshake" className="text-base" />
                      HDV LocalMate thực nhận ({100 - localMateFeeInput}%):
                    </span>
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400 text-base">
                      {Math.round(simTourPrice * (100 - localMateFeeInput) / 100).toLocaleString("vi-VN")} VND
                    </span>
                  </div>
                  <div className="border-t border-slate-200/60 dark:border-slate-800 pt-2 flex items-center justify-between text-sm">
                    <span className="text-teal-800 dark:text-teal-300 font-semibold flex items-center gap-1.5">
                      <VsIcon name="payments" className="text-base" />
                      VietSage Platform thu ({localMateFeeInput}%):
                    </span>
                    <span className="font-extrabold text-teal-800 dark:text-teal-300 text-base">
                      {Math.round(simTourPrice * localMateFeeInput / 100).toLocaleString("vi-VN")} VND
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Business Model Clarity Callout */}
          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <VsIcon name="hub" className="text-xl" />
              </span>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-blue-950 dark:text-blue-200">
                  Phân định rõ ràng 3 luồng doanh thu trên nền tảng VietSage
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <p className="font-bold text-teal-700 dark:text-teal-400">1. LocalMate (Đang cấu hình)</p>
                    <p className="mt-1">
                      Hướng dẫn viên du lịch &amp; trải nghiệm tour địa phương. Thu phí hoa hồng nền tảng <strong>{localMateFeeRate}%</strong>.
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <p className="font-bold text-indigo-700 dark:text-indigo-400">2. Marketplace dịch vụ</p>
                    <p className="mt-1">
                      Dịch vụ ngoài (vé tham quan, xe, spa, quà tặng). Chiết khấu theo từng đối tác cung cấp dịch vụ bên ngoài.
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <p className="font-bold text-slate-900 dark:text-white">3. VietSage SaaS Khách sạn</p>
                    <p className="mt-1">
                      Phí phần mềm quản lý lưu trú &amp; check-in khách sạn. Tính theo lượt check-in hoặc % doanh thu phòng (tab Hợp đồng).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ONBOARD CONTRACT (PRO-MAX WITH LIVE SIMULATOR) */}
      {/* ========================================================================= */}
      {showCreateModal && (() => {
        const availableHotels = hotels.filter((h) => !activeHotelIds.has(h.id));
        const activeHotels = hotels.filter((h) => activeHotelIds.has(h.id));
        const selectedHotel = hotels.find((h) => h.id === createForm.hotelId);
        const isSelectedActive = !!createForm.hotelId && activeHotelIds.has(createForm.hotelId);

        const numVal = Number(createForm.pricingValue) || 0;
        const projectedMonthlyFee =
          createForm.pricingModel === "FIXED"
            ? simCheckins * numVal
            : simMonthlyRevenue * (numVal / 100);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                    <VsIcon name="handshake" className="text-2xl" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Onboard hợp đồng VietSage SaaS
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                        Hợp đồng mới
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Kích hoạt thỏa thuận dịch vụ &amp; thiết lập biểu phí nền tảng cho khách sạn đối tác
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Đóng biểu mẫu tạo hợp đồng"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>

              <form onSubmit={handleCreateContract} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="onboard-hotel-select"
                      className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"
                    >
                      <VsIcon name="apartment" className="text-base text-emerald-600 dark:text-emerald-400" />
                      Khách sạn áp dụng hợp đồng <span className="text-red-500">*</span>
                    </label>
                    <span className="text-xs text-slate-500">
                      {availableHotels.length} khả dụng / {hotels.length} khách sạn
                    </span>
                  </div>

                  <select
                    id="onboard-hotel-select"
                    required
                    value={createForm.hotelId}
                    onChange={(e) => setCreateForm({ ...createForm, hotelId: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">-- Chọn khách sạn cần kích hoạt hợp đồng --</option>
                    {availableHotels.length > 0 && (
                      <optgroup label="Khách sạn sẵn sàng onboard (Chưa có hợp đồng)">
                        {availableHotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} {h.code ? `(${h.code})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {activeHotels.length > 0 && (
                      <optgroup label="Khách sạn đang hoạt động (Đã có hợp đồng Active)">
                        {activeHotels.map((h) => (
                          <option key={h.id} value={h.id} disabled>
                            {h.name} {h.code ? `(${h.code})` : ""} — [ĐÃ CÓ HỢP ĐỒNG]
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {isSelectedActive && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-2.5">
                      <VsIcon name="warning" className="text-lg text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Khách sạn này đã có hợp đồng đang hoạt động (ACTIVE)</p>
                        <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                          Hệ thống không cho phép tạo hợp đồng mới đè lên. Vui lòng đóng modal và sử dụng tính năng &quot;Chốt kỳ hóa đơn&quot; hoặc &quot;Điều chỉnh biểu phí&quot;.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedHotel && !isSelectedActive && (
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <VsIcon name="check_circle" className="text-base text-emerald-600 dark:text-emerald-400" />
                        <span>Đối tác: <strong>{selectedHotel.name}</strong> {selectedHotel.code ? `(${selectedHotel.code})` : ""}</span>
                      </div>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">Sẵn sàng kích hoạt</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <VsIcon name="loyalty" className="text-base text-emerald-600 dark:text-emerald-400" />
                    Mô hình tính phí SaaS <span className="text-red-500">*</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, pricingModel: "FIXED", pricingValue: "10000" })}
                      className={`relative flex flex-col p-4 text-left rounded-xl border-2 transition-all ${
                        createForm.pricingModel === "FIXED"
                          ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 dark:border-emerald-500 shadow-sm"
                          : "border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                          <VsIcon name="pin" className="text-emerald-600 dark:text-emerald-400 text-lg" />
                          Phí cố định theo lượt
                        </span>
                        {createForm.pricingModel === "FIXED" && (
                          <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                            <VsIcon name="check" className="text-xs" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Thu một mức phí cố định VND cho mỗi lượt phòng lưu trú / check-in thực tế.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, pricingModel: "PERCENTAGE", pricingValue: "2" })}
                      className={`relative flex flex-col p-4 text-left rounded-xl border-2 transition-all ${
                        createForm.pricingModel === "PERCENTAGE"
                          ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 dark:border-emerald-500 shadow-sm"
                          : "border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                          <VsIcon name="percent" className="text-emerald-600 dark:text-emerald-400 text-lg" />
                          Tỷ lệ % doanh thu phòng
                        </span>
                        {createForm.pricingModel === "PERCENTAGE" && (
                          <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                            <VsIcon name="check" className="text-xs" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Trích % theo doanh thu phòng khách sạn ghi nhận tại thời điểm lưu trú.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="onboard-unit-price" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <VsIcon name="payments" className="text-base text-emerald-600 dark:text-emerald-400" />
                      {createForm.pricingModel === "FIXED" ? "Mức phí mỗi lượt check-in (VND)" : "Tỷ lệ phí trên doanh thu phòng (%)"}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <span className="text-xs text-slate-500">Mức đề xuất nhanh</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {createForm.pricingModel === "FIXED" ? (
                      <>
                        {[5000, 10000, 15000, 20000, 30000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCreateForm({ ...createForm, pricingValue: String(preset) })}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                              createForm.pricingValue === String(preset)
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                            }`}
                          >
                            {preset.toLocaleString("vi-VN")} đ {preset === 10000 ? "(Chuẩn)" : ""}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        {[1, 1.5, 2, 3, 5].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCreateForm({ ...createForm, pricingValue: String(preset) })}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                              createForm.pricingValue === String(preset)
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                            }`}
                          >
                            {preset}% {preset === 2 ? "(Chuẩn)" : ""}
                          </button>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      id="onboard-unit-price"
                      type="number"
                      required
                      min="0"
                      max={createForm.pricingModel === "PERCENTAGE" ? "100" : undefined}
                      step={createForm.pricingModel === "PERCENTAGE" ? "0.01" : "1"}
                      value={createForm.pricingValue}
                      onChange={(e) => setCreateForm({ ...createForm, pricingValue: e.target.value })}
                      placeholder={createForm.pricingModel === "FIXED" ? "VD: 10000" : "VD: 2.0"}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-28 text-base font-bold text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md">
                        {createForm.pricingModel === "FIXED" ? "VND / lượt" : "% giá phòng"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-slate-50/60 p-4 dark:border-emerald-500/30 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-slate-900/40">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        <VsIcon name="calculate" className="text-lg" />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Mô phỏng doanh thu VietSage dự kiến
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Ước tính theo tháng
                    </span>
                  </div>

                  {createForm.pricingModel === "FIXED" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>Lưu lượng check-in giả định:</span>
                        <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-sm">
                          {simCheckins.toLocaleString("vi-VN")} lượt / tháng
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="2000"
                        step="50"
                        value={simCheckins}
                        onChange={(e) => setSimCheckins(Number(e.target.value))}
                        className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                          Công thức: {simCheckins.toLocaleString("vi-VN")} lượt × {numVal.toLocaleString("vi-VN")} VND
                        </span>
                        <span className="font-extrabold text-base text-emerald-700 dark:text-emerald-400">
                          ≈ {projectedMonthlyFee.toLocaleString("vi-VN")} VND
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>Doanh thu phòng giả định:</span>
                        <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-sm">
                          {simMonthlyRevenue.toLocaleString("vi-VN")} VND / tháng
                        </span>
                      </div>
                      <input
                        type="range"
                        min="20000000"
                        max="1000000000"
                        step="10000000"
                        value={simMonthlyRevenue}
                        onChange={(e) => setSimMonthlyRevenue(Number(e.target.value))}
                        className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                          Công thức: {simMonthlyRevenue.toLocaleString("vi-VN")} VND × {numVal}%
                        </span>
                        <span className="font-extrabold text-base text-emerald-700 dark:text-emerald-400">
                          ≈ {projectedMonthlyFee.toLocaleString("vi-VN")} VND
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="onboard-start-date" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <VsIcon name="calendar_today" className="text-base text-emerald-600 dark:text-emerald-400" />
                    Ngày bắt đầu tính phí <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="onboard-start-date"
                    type="date"
                    required
                    value={createForm.billingStartedAt}
                    onChange={(e) => setCreateForm({ ...createForm, billingStartedAt: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-200/80 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingContract || isSelectedActive}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 min-h-11 px-6 py-2.5 text-base font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all active:scale-98"
                  >
                    {submittingContract ? (
                      <>
                        <VsIcon name="progress_activity" className="text-lg animate-spin" />
                        <span>Đang xử lý...</span>
                      </>
                    ) : (
                      <>
                        <VsIcon name="add_circle" className="text-lg" />
                        <span>Khởi tạo hợp đồng</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: RECORD SETTLEMENT */}
      {/* ========================================================================= */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Ghi nhận thanh toán hóa đơn
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dư nợ còn lại:{" "}
                  <strong className="text-amber-600 font-extrabold">
                    {Number(selectedPeriod?.outstandingAmount ?? selectedPeriod?.total ?? 0).toLocaleString("vi-VN")} VND
                  </strong>
                </p>
              </div>
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
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="settle-amount" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Số tiền thanh toán (VND) <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const maxAmount = selectedPeriod?.outstandingAmount ?? selectedPeriod?.total ?? 0;
                      setSettlementForm({ ...settlementForm, amount: String(maxAmount) });
                    }}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Trả hết toàn bộ dư nợ
                  </button>
                </div>
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
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-bold text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {settlementError && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    {settlementError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="settle-method" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
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
                  <option value="BANK_TRANSFER">Chuyển khoản ngân hàng (Bank Transfer)</option>
                  <option value="CASH">Tiền mặt (Cash)</option>
                  <option value="CREDIT_CARD">Thẻ tín dụng (Credit Card)</option>
                </select>
              </div>

              <div>
                <label htmlFor="settle-reference" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Mã giao dịch / Ghi chú đối soát (Reference)
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
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
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

      {/* ========================================================================= */}
      {/* MODAL: CUSTOM / SINGLE FINALIZE PERIOD */}
      {/* ========================================================================= */}
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
                <label htmlFor="finalize-period-start" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Từ ngày (Period Start) <span className="text-red-500">*</span>
                </label>
                <input
                  id="finalize-period-start"
                  type="date"
                  required
                  value={finalizeForm.periodStart}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, periodStart: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="finalize-period-end" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Đến ngày (Period End) <span className="text-red-500">*</span>
                </label>
                <input
                  id="finalize-period-end"
                  type="date"
                  required
                  value={finalizeForm.periodEnd}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, periodEnd: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Hệ thống sẽ chốt các khoản phí check-in phát sinh trong khoảng thời gian này để niêm phong hóa đơn.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
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

      {/* ========================================================================= */}
      {/* MODAL: EDIT PRICE REVISION */}
      {/* ========================================================================= */}
      {showRevisionModal && revisionContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Điều chỉnh biểu phí hợp đồng
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Khách sạn: <strong>{revisionContract.hotel?.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleAddRevision} className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Mô hình tính phí
                </label>
                <select
                  value={revisionForm.pricingModel}
                  onChange={(e) =>
                    setRevisionForm({
                      ...revisionForm,
                      pricingModel: e.target.value as "FIXED" | "PERCENTAGE",
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="FIXED">Cố định theo lượt check-in (VND)</option>
                  <option value="PERCENTAGE">Tỷ lệ % doanh thu phòng</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  {revisionForm.pricingModel === "FIXED" ? "Mức phí mới (VND / lượt)" : "Tỷ lệ phí mới (%)"}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step={revisionForm.pricingModel === "PERCENTAGE" ? "0.01" : "1"}
                  value={revisionForm.pricingValue}
                  onChange={(e) => setRevisionForm({ ...revisionForm, pricingValue: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Ngày có hiệu lực
                </label>
                <input
                  type="date"
                  required
                  value={revisionForm.effectiveFrom}
                  onChange={(e) => setRevisionForm({ ...revisionForm, effectiveFrom: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(false)}
                  className="rounded-xl border border-slate-300 min-h-11 px-5 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingRevision}
                  className="rounded-xl bg-emerald-600 min-h-11 px-5 py-2.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submittingRevision ? "Đang lưu..." : "Cập nhật biểu phí"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DEBT STATEMENT MODAL */}
      {/* ========================================================================= */}
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
