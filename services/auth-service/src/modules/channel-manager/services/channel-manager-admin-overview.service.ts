import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  AdminChannelOverviewItem,
  AdminChannelOverviewPrimaryIssueCode,
  AdminChannelOverviewQuery,
  AdminChannelOverviewResponse,
  AdminChannelOverviewState,
  AdminChannelOverviewSummary,
} from "../domain/schemas/channel-manager.schema";

export function deriveChannelState(input: {
  propertyConfigured: boolean;
  mappedRoomTypes: number;
  mappedRatePlans: number;
  lastSyncStatus?: string | null;
  hasNonActiveConnection?: boolean;
  pendingReconciliations?: number;
}): {
  state: AdminChannelOverviewState;
  primaryIssueCode: AdminChannelOverviewPrimaryIssueCode;
} {
  if (!input.propertyConfigured) {
    return { state: "UNCONFIGURED", primaryIssueCode: "PROPERTY_MISSING" };
  }
  if (input.mappedRoomTypes === 0 || input.mappedRatePlans === 0) {
    return { state: "SETTING_UP", primaryIssueCode: "MAPPING_INCOMPLETE" };
  }
  const isSyncFailed = input.lastSyncStatus === "FAILED";
  const hasNonActive = Boolean(input.hasNonActiveConnection);
  if (isSyncFailed || hasNonActive) {
    return {
      state: "INTERRUPTED",
      primaryIssueCode: isSyncFailed ? "SYNC_FAILED" : "CONNECTION_INTERRUPTED",
    };
  }
  const isWarning =
    input.lastSyncStatus === "WARNING" || input.lastSyncStatus === "PARTIAL_FAILURE";
  const hasPending = (input.pendingReconciliations ?? 0) > 0;
  if (hasPending || isWarning) {
    return { state: "ATTENTION", primaryIssueCode: "RECONCILIATION_REQUIRED" };
  }
  return { state: "ACTIVE", primaryIssueCode: null };
}

@Injectable()
export class ChannelManagerAdminOverviewService {
  private readonly logger = new Logger(ChannelManagerAdminOverviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Báo cáo tổng quan hạm đội kênh (Fleet Overview) với phân trang server-side
   * và tính toán summary chính xác trên cùng tập đã lọc (q + state) trong PostgreSQL.
   * Không gọi remote HTTP tới Channex; không phát sinh N+1.
   */
  async getOverview(query: AdminChannelOverviewQuery): Promise<AdminChannelOverviewResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 25));
    const offset = (page - 1) * limit;

    const qTerm = query.q && query.q.trim().length > 0 ? `%${query.q.trim()}%` : null;
    const stateFilter = query.state ?? null;

    const sql = Prisma.sql`
      WITH hotel_raw AS (
        SELECT
          h.id AS "hotelId",
          h.code AS "hotelCode",
          h.name AS "hotelName",
          h."tenantId" AS "tenantId",
          COALESCE(t.name, '') AS "tenantName",
          COALESCE(t.code, '') AS "tenantCode",
          h."createdAt" AS "hotelCreatedAt",
          EXISTS (
            SELECT 1 FROM "ChannexMapping" cm
            WHERE cm."hotelId" = h.id AND cm.kind = 'property'
          ) AS "propertyConfigured",
          (
            SELECT COUNT(*)::int FROM "ChannexMapping" cm
            WHERE cm."hotelId" = h.id AND cm.kind = 'room_type'
          ) AS "mappedRoomTypes",
          (
            SELECT COUNT(*)::int FROM "ChannexMapping" cm
            WHERE cm."hotelId" = h.id AND cm.kind = 'rate_plan'
          ) AS "mappedRatePlans",
          (
            SELECT COUNT(*)::int FROM "ChannelSyncLog" csl
            WHERE csl."hotelId" = h.id
              AND csl."syncType" = 'CHANNEX_INBOUND_BOOKING_MODIFIED'
              AND csl.status = 'WARNING'
          ) AS "pendingReconciliations",
          (
            SELECT csl."createdAt" FROM "ChannelSyncLog" csl
            WHERE csl."hotelId" = h.id
            ORDER BY csl."createdAt" DESC
            LIMIT 1
          ) AS "lastSyncLogAt",
          (
            SELECT csl.status FROM "ChannelSyncLog" csl
            WHERE csl."hotelId" = h.id
            ORDER BY csl."createdAt" DESC
            LIMIT 1
          ) AS "lastSyncLogStatus",
          (
            SELECT cc."lastSyncAt" FROM "ChannelConnection" cc
            WHERE cc."hotelId" = h.id AND cc."lastSyncAt" IS NOT NULL
            ORDER BY cc."lastSyncAt" DESC
            LIMIT 1
          ) AS "lastConnSyncAt",
          (
            SELECT cc."lastSyncStatus" FROM "ChannelConnection" cc
            WHERE cc."hotelId" = h.id AND cc."lastSyncAt" IS NOT NULL
            ORDER BY cc."lastSyncAt" DESC
            LIMIT 1
          ) AS "lastConnSyncStatus",
          EXISTS (
            SELECT 1 FROM "ChannelConnection" cc
            WHERE cc."hotelId" = h.id AND cc.status IN ('PAUSED', 'ERROR')
          ) AS "hasNonActiveConnection"
        FROM "Hotel" h
        LEFT JOIN "Tenant" t ON t.id = h."tenantId"
      ),
      hotel_derived AS (
        SELECT
          "hotelId",
          "hotelCode",
          "hotelName",
          "tenantId",
          "tenantName",
          "tenantCode",
          "hotelCreatedAt",
          "propertyConfigured",
          "mappedRoomTypes",
          "mappedRatePlans",
          "pendingReconciliations",
          COALESCE("lastSyncLogAt", "lastConnSyncAt") AS "lastSyncAt",
          COALESCE("lastSyncLogStatus", "lastConnSyncStatus") AS "lastSyncStatus",
          CASE
            WHEN NOT "propertyConfigured" THEN 'UNCONFIGURED'
            WHEN "mappedRoomTypes" = 0 OR "mappedRatePlans" = 0 THEN 'SETTING_UP'
            WHEN COALESCE("lastSyncLogStatus", "lastConnSyncStatus") = 'FAILED' OR "hasNonActiveConnection" THEN 'INTERRUPTED'
            WHEN "pendingReconciliations" > 0 OR COALESCE("lastSyncLogStatus", "lastConnSyncStatus") IN ('WARNING', 'PARTIAL_FAILURE') THEN 'ATTENTION'
            ELSE 'ACTIVE'
          END AS state,
          CASE
            WHEN NOT "propertyConfigured" THEN 'PROPERTY_MISSING'
            WHEN "mappedRoomTypes" = 0 OR "mappedRatePlans" = 0 THEN 'MAPPING_INCOMPLETE'
            WHEN COALESCE("lastSyncLogStatus", "lastConnSyncStatus") = 'FAILED' THEN 'SYNC_FAILED'
            WHEN "hasNonActiveConnection" THEN 'CONNECTION_INTERRUPTED'
            WHEN "pendingReconciliations" > 0 OR COALESCE("lastSyncLogStatus", "lastConnSyncStatus") IN ('WARNING', 'PARTIAL_FAILURE') THEN 'RECONCILIATION_REQUIRED'
            ELSE NULL
          END AS "primaryIssueCode"
        FROM hotel_raw
      ),
      filtered AS (
        SELECT *
        FROM hotel_derived
        WHERE
          (${qTerm}::text IS NULL OR (
            "hotelName" ILIKE ${qTerm}
            OR "hotelCode" ILIKE ${qTerm}
            OR "tenantName" ILIKE ${qTerm}
            OR "tenantCode" ILIKE ${qTerm}
          ))
          AND (${stateFilter}::text IS NULL OR state = ${stateFilter})
      ),
      summary_calc AS (
        SELECT
          COUNT(*)::int AS "totalHotels",
          COUNT(CASE WHEN "propertyConfigured" THEN 1 END)::int AS "configuredHotels",
          COUNT(CASE WHEN state = 'ACTIVE' THEN 1 END)::int AS "activeHotels",
          COUNT(CASE WHEN state = 'ATTENTION' THEN 1 END)::int AS "needsAttention",
          COUNT(CASE WHEN state = 'UNCONFIGURED' THEN 1 END)::int AS "unconfiguredHotels",
          COALESCE(SUM("pendingReconciliations"), 0)::int AS "pendingReconciliations"
        FROM filtered
      ),
      page_items AS (
        SELECT
          "hotelId",
          "hotelCode",
          "hotelName",
          "tenantId",
          "tenantName",
          state,
          "propertyConfigured",
          "mappedRoomTypes",
          "mappedRatePlans",
          "pendingReconciliations",
          "lastSyncAt",
          "lastSyncStatus",
          "primaryIssueCode"
        FROM filtered
        ORDER BY "hotelCreatedAt" DESC, "hotelId" DESC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT
        (SELECT row_to_json(summary_calc.*) FROM summary_calc) AS summary,
        (SELECT COALESCE(json_agg(page_items.*), '[]'::json) FROM page_items) AS items
    `;

    const rows = await this.prisma.$queryRaw<Array<{ summary: any; items: any }>>(sql);
    const row = rows?.[0];

    const summary: AdminChannelOverviewSummary = {
      totalHotels: Number(row?.summary?.totalHotels ?? 0),
      configuredHotels: Number(row?.summary?.configuredHotels ?? 0),
      activeHotels: Number(row?.summary?.activeHotels ?? 0),
      needsAttention: Number(row?.summary?.needsAttention ?? 0),
      unconfiguredHotels: Number(row?.summary?.unconfiguredHotels ?? 0),
      pendingReconciliations: Number(row?.summary?.pendingReconciliations ?? 0),
    };

    const items: AdminChannelOverviewItem[] = (row?.items ?? []).map((item: any) => ({
      hotelId: String(item.hotelId),
      hotelCode: String(item.hotelCode),
      hotelName: String(item.hotelName),
      tenantId: String(item.tenantId),
      tenantName: String(item.tenantName ?? ""),
      state: item.state as AdminChannelOverviewState,
      propertyConfigured: Boolean(item.propertyConfigured),
      mappedRoomTypes: Number(item.mappedRoomTypes ?? 0),
      mappedRatePlans: Number(item.mappedRatePlans ?? 0),
      pendingReconciliations: Number(item.pendingReconciliations ?? 0),
      lastSyncAt: item.lastSyncAt ? new Date(String(item.lastSyncAt)).toISOString() : null,
      lastSyncStatus: item.lastSyncStatus ?? null,
      primaryIssueCode: (item.primaryIssueCode ?? null) as AdminChannelOverviewPrimaryIssueCode,
    }));

    return {
      summary,
      items,
      page,
      limit,
      total: summary.totalHotels,
    };
  }
}
