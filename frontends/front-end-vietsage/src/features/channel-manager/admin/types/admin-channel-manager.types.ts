export type AdminChannelOverviewState =
  | "UNCONFIGURED"
  | "SETTING_UP"
  | "ACTIVE"
  | "ATTENTION"
  | "INTERRUPTED";

export type AdminChannelOverviewPrimaryIssueCode =
  | "PROPERTY_MISSING"
  | "MAPPING_INCOMPLETE"
  | "SYNC_FAILED"
  | "RECONCILIATION_REQUIRED"
  | "CONNECTION_INTERRUPTED"
  | null;

export interface AdminChannelOverviewQuery {
  q?: string;
  state?: AdminChannelOverviewState;
  page?: number;
  limit?: number;
}

export interface AdminChannelOverviewSummary {
  totalHotels: number;
  configuredHotels: number;
  activeHotels: number;
  needsAttention: number;
  unconfiguredHotels: number;
  pendingReconciliations: number;
}

export interface AdminChannelOverviewItem {
  hotelId: string;
  hotelCode: string;
  hotelName: string;
  tenantId: string;
  tenantName: string;
  state: AdminChannelOverviewState;
  propertyConfigured: boolean;
  mappedRoomTypes: number;
  mappedRatePlans: number;
  pendingReconciliations: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  primaryIssueCode: AdminChannelOverviewPrimaryIssueCode;
}

export interface AdminChannelOverviewResponse {
  summary: AdminChannelOverviewSummary;
  items: AdminChannelOverviewItem[];
  page: number;
  limit: number;
  total: number;
}
