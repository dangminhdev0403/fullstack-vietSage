import type {
  AdminChannelOverviewItem,
  AdminChannelOverviewPrimaryIssueCode,
  AdminChannelOverviewQuery,
  AdminChannelOverviewResponse,
  AdminChannelOverviewState,
  AdminChannelOverviewSummary,
} from "../types/admin-channel-manager.types";

export type {
  AdminChannelOverviewItem,
  AdminChannelOverviewPrimaryIssueCode,
  AdminChannelOverviewQuery,
  AdminChannelOverviewResponse,
  AdminChannelOverviewState,
  AdminChannelOverviewSummary,
};

export const FRIENDLY_STATE_LABELS: Record<AdminChannelOverviewState, string> = {
  UNCONFIGURED: "Chưa thiết lập",
  SETTING_UP: "Đang thiết lập",
  ACTIVE: "Hoạt động",
  ATTENTION: "Cần chú ý",
  INTERRUPTED: "Gián đoạn",
};

export const PRIMARY_ISSUE_LABELS: Record<
  NonNullable<AdminChannelOverviewPrimaryIssueCode>,
  string
> = {
  PROPERTY_MISSING: "Chưa liên kết khách sạn",
  MAPPING_INCOMPLETE: "Chưa hoàn tất ghép phòng / gói giá",
  SYNC_FAILED: "Đồng bộ thất bại",
  RECONCILIATION_REQUIRED: "Cần xử lý đối soát",
  CONNECTION_INTERRUPTED: "Kết nối gián đoạn",
};

export const PRIMARY_ACTION_LABELS: Record<
  NonNullable<AdminChannelOverviewPrimaryIssueCode>,
  string
> = {
  PROPERTY_MISSING: "Liên kết Channex",
  MAPPING_INCOMPLETE: "Ghép phòng & gói giá",
  RECONCILIATION_REQUIRED: "Xử lý đối soát",
  SYNC_FAILED: "Kiểm tra kết nối",
  CONNECTION_INTERRUPTED: "Kiểm tra kết nối",
};

export function getPrimaryActionLabel(
  state: AdminChannelOverviewState,
  issueCode: AdminChannelOverviewPrimaryIssueCode,
): string {
  if (issueCode && PRIMARY_ACTION_LABELS[issueCode]) {
    return PRIMARY_ACTION_LABELS[issueCode];
  }
  if (state === "UNCONFIGURED") return "Liên kết Channex";
  if (state === "SETTING_UP") return "Ghép phòng & gói giá";
  if (state === "INTERRUPTED" || state === "ATTENTION") return "Khắc phục sự cố";
  return "Quản lý kênh";
}

const ALLOWED_STATES = new Set<AdminChannelOverviewState>([
  "UNCONFIGURED",
  "SETTING_UP",
  "ACTIVE",
  "ATTENTION",
  "INTERRUPTED",
]);

const VALID_ISSUES = new Set<string>([
  "PROPERTY_MISSING",
  "MAPPING_INCOMPLETE",
  "SYNC_FAILED",
  "RECONCILIATION_REQUIRED",
  "CONNECTION_INTERRUPTED",
]);

export function sanitizeOverviewQuery(
  rawQuery?: AdminChannelOverviewQuery | Record<string, unknown>,
): AdminChannelOverviewQuery {
  const result: AdminChannelOverviewQuery = {};
  if (!rawQuery) return result;

  const queryRecord = rawQuery as Record<string, unknown>;

  if (typeof queryRecord.q === "string") {
    const trimmed = queryRecord.q.trim();
    if (trimmed.length > 0) {
      result.q = trimmed.slice(0, 120);
    }
  }

  if (
    typeof queryRecord.state === "string" &&
    ALLOWED_STATES.has(queryRecord.state as AdminChannelOverviewState)
  ) {
    result.state = queryRecord.state as AdminChannelOverviewState;
  }

  if (queryRecord.page !== undefined && queryRecord.page !== null && queryRecord.page !== "") {
    const parsedPage = Number(queryRecord.page);
    if (Number.isFinite(parsedPage) && parsedPage >= 1) {
      result.page = Math.floor(parsedPage);
    }
  }

  if (queryRecord.limit !== undefined && queryRecord.limit !== null && queryRecord.limit !== "") {
    const parsedLimit = Number(queryRecord.limit);
    if (Number.isFinite(parsedLimit) && parsedLimit >= 1) {
      result.limit = Math.min(100, Math.floor(parsedLimit));
    }
  }

  return result;
}

export function buildOverviewQueryString(
  rawQuery?: AdminChannelOverviewQuery | Record<string, unknown>,
): string {
  const sanitized = sanitizeOverviewQuery(rawQuery);
  const params = new URLSearchParams();

  if (sanitized.q) params.set("q", sanitized.q);
  if (sanitized.state) params.set("state", sanitized.state);
  if (sanitized.page && sanitized.page > 1) {
    params.set("page", String(sanitized.page));
  }
  if (sanitized.limit && sanitized.limit !== 25) {
    params.set("limit", String(sanitized.limit));
  }

  return params.toString();
}

export function mapAdminChannelOverviewItem(raw: unknown): AdminChannelOverviewItem {
  const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const state = (
    typeof item.state === "string" && ALLOWED_STATES.has(item.state as AdminChannelOverviewState)
      ? item.state
      : "UNCONFIGURED"
  ) as AdminChannelOverviewState;

  const primaryIssueCode = (
    typeof item.primaryIssueCode === "string" && VALID_ISSUES.has(item.primaryIssueCode)
      ? item.primaryIssueCode
      : null
  ) as AdminChannelOverviewPrimaryIssueCode;

  // Strict projection: only defined domain fields are retained.
  // Sensitive/raw provider properties (API keys, raw errors, tokens) are omitted.
  return {
    hotelId: String(item.hotelId || ""),
    hotelCode: String(item.hotelCode || ""),
    hotelName: String(item.hotelName || "Khách sạn"),
    tenantId: String(item.tenantId || ""),
    tenantName: String(item.tenantName || "Chưa xác định"),
    state,
    propertyConfigured: Boolean(item.propertyConfigured),
    mappedRoomTypes: Math.max(0, Number(item.mappedRoomTypes) || 0),
    mappedRatePlans: Math.max(0, Number(item.mappedRatePlans) || 0),
    pendingReconciliations: Math.max(0, Number(item.pendingReconciliations) || 0),
    lastSyncAt: typeof item.lastSyncAt === "string" ? item.lastSyncAt : null,
    lastSyncStatus: typeof item.lastSyncStatus === "string" ? item.lastSyncStatus : null,
    primaryIssueCode,
  };
}

export function mapAdminChannelOverviewResponse(raw: unknown): AdminChannelOverviewResponse {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawSummary = (typeof data.summary === "object" && data.summary !== null ? data.summary : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  const summary: AdminChannelOverviewSummary = {
    totalHotels: Math.max(0, Number(rawSummary.totalHotels) || 0),
    configuredHotels: Math.max(0, Number(rawSummary.configuredHotels) || 0),
    activeHotels: Math.max(0, Number(rawSummary.activeHotels) || 0),
    needsAttention: Math.max(0, Number(rawSummary.needsAttention) || 0),
    unconfiguredHotels: Math.max(0, Number(rawSummary.unconfiguredHotels) || 0),
    pendingReconciliations: Math.max(0, Number(rawSummary.pendingReconciliations) || 0),
  };

  const page = Math.max(1, Number(data.page) || 1);
  const limit = Math.max(1, Number(data.limit) || 25);
  const total = Math.max(0, Number(data.total) || 0);

  return {
    summary,
    items: rawItems.map(mapAdminChannelOverviewItem),
    page,
    limit,
    total,
  };
}

export type DrillDownTab = "OVERVIEW" | "CHANNELS" | "CONFIG" | "REPAIR";

export function getContextualTab(item: AdminChannelOverviewItem): DrillDownTab {
  if (item.primaryIssueCode === "PROPERTY_MISSING" || !item.propertyConfigured) {
    return "CONFIG";
  }
  if (
    item.primaryIssueCode === "MAPPING_INCOMPLETE" ||
    item.mappedRoomTypes === 0 ||
    item.mappedRatePlans === 0
  ) {
    return "CHANNELS";
  }
  if (
    item.primaryIssueCode === "RECONCILIATION_REQUIRED" ||
    item.primaryIssueCode === "SYNC_FAILED" ||
    item.primaryIssueCode === "CONNECTION_INTERRUPTED" ||
    item.state === "INTERRUPTED" ||
    item.pendingReconciliations > 0
  ) {
    return "REPAIR";
  }
  return "OVERVIEW";
}

export function hasActiveOverviewFilter(
  query?: AdminChannelOverviewQuery,
): boolean {
  if (!query) return false;
  const hasQ = typeof query.q === "string" && query.q.trim().length > 0;
  const hasState =
    typeof query.state === "string" &&
    query.state.length > 0 &&
    (query.state as string) !== "ALL";
  return hasQ || hasState;
}

export function isEmptyFleet(
  overview: AdminChannelOverviewResponse,
  query?: AdminChannelOverviewQuery,
): boolean {
  if (hasActiveOverviewFilter(query)) {
    return false;
  }
  return overview.summary.totalHotels === 0 && overview.items.length === 0;
}

export function isFilteredEmpty(
  overview: AdminChannelOverviewResponse,
  query?: AdminChannelOverviewQuery,
): boolean {
  if (!hasActiveOverviewFilter(query)) {
    return false;
  }
  return overview.items.length === 0;
}

export type ApiEnvelopeRequester = <T>(
  path: string,
  options?: { method?: string; signal?: AbortSignal; body?: unknown },
) => Promise<{ data: T }>;

let customRequester: ApiEnvelopeRequester | null = null;

export function setAdminChannelManagerRequester(requester: ApiEnvelopeRequester | null) {
  customRequester = requester;
}

export const adminChannelManagerRepository = {
  async getOverview(
    query?: AdminChannelOverviewQuery,
    signal?: AbortSignal,
  ): Promise<AdminChannelOverviewResponse> {
    const queryString = buildOverviewQueryString(query);
    const path = `/api/admin/channel-manager/overview${queryString ? `?${queryString}` : ""}`;

    if (customRequester) {
      const response = await customRequester<unknown>(path, { method: "GET", signal });
      return mapAdminChannelOverviewResponse(response.data);
    }

    const { requestInternalApiEnvelope } = await import(
      "@/core/http/internal-api-client"
    );
    const response = await requestInternalApiEnvelope<unknown>(path, {
      method: "GET",
      signal,
    });
    return mapAdminChannelOverviewResponse(response.data);
  },
};
