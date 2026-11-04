import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export type PeriodItem = {
  id: string;
  contractId?: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "FINALIZED" | "VOID" | string;
  total: number;
  dueAt?: string;
  settledAmount?: number;
  outstandingAmount?: number;
  paymentState?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | string;
  isOverdue?: boolean;
};

export type PaginatedResult<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

export type RoomUsageRow = {
  roomNumber: string;
  usageCount: number;
  billableDaysCount: number;
  billedAmount?: number;
  currency?: string;
};

export type OwnerAnalyticsData = {
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
  debtSummary?: {
    totalOutstandingAmount: number;
    unpaidPeriodCount: number;
    totalSettledAmount: number;
    totalFinalizedAmount: number;
    overdueAmount: number;
    overdueCount: number;
    dueSoonAmount: number;
    dueSoonCount: number;
    nearestDueAt: string | null;
  };
  reminder?: {
    dueSoonCount: number;
    overdueCount: number;
    dueSoonOutstandingAmount: number;
    overdueOutstandingAmount: number;
    totalOutstandingAmount?: number;
    unpaidPeriodCount?: number;
    nearestDueAt: string | null;
  };
  roomUsageSummary?: RoomUsageRow[];
};

export interface OwnerAnalyticsQuery {
  periodPage?: number;
  periodLimit?: number;
  monthDate?: string;
}

export const ownerSaasBillingRepository = {
  async getAnalytics(
    hotelId: string,
    query?: OwnerAnalyticsQuery,
    signal?: AbortSignal,
  ): Promise<OwnerAnalyticsData | null> {
    const queryParams = new URLSearchParams({
      periodPage: String(query?.periodPage ?? 1),
      periodLimit: String(query?.periodLimit ?? 10),
      monthDate: query?.monthDate ?? `${new Date().toISOString().slice(0, 7)}-01`,
    });
    const res = await requestInternalApiEnvelope<OwnerAnalyticsData>(
      `/api/owner/platform-billing/analytics/${encodeURIComponent(hotelId)}?${queryParams.toString()}`,
      { method: "GET", signal },
    );
    return res.data ?? null;
  },
};
