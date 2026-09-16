import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import {
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitRunSummarySchema,
  kbttAutoSubmitStateSchema,
  kbttCatalogListSchema,
  kbttConnectionSchema,
  kbttDeclarationListSchema,
  kbttDeclarationRecordSchema,
  kbttOccupantDeclarationDetailSchema,
  saveKbttDraftPayloadSchema,
  type KbttAutoSubmitConfig,
  type KbttAutoSubmitRunSummary,
  type KbttAutoSubmitState,
  type KbttCatalogItem,
  type KbttCatalogKind,
  type KbttConnection,
  type KbttCredentials,
  type KbttDeclarationListItem,
  type KbttDeclarationRecord,
  type KbttDevOccupantUpdateItem,
  type KbttOccupantDeclarationDetail,
  type SaveKbttDraftPayload,
} from "../types/kbtt-contract";

function connectionPath(hotelId: string) {
  return `/api/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/connection`;
}

function autoSubmitPath(hotelId: string) {
  return `/api/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/auto-submit`;
}

function declarationsPath(hotelId: string) {
  return `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/kbtt/declarations`;
}

function catalogPath(kind: KbttCatalogKind, parentCode?: string) {
  const path = `/api/hotel-ops/kbtt/catalogs/${kind}`;
  return parentCode
    ? `${path}?parentCode=${encodeURIComponent(parentCode)}`
    : path;
}

export const kbttRepository = {
  async connection(
    hotelId: string,
    signal?: AbortSignal,
  ): Promise<KbttConnection> {
    const payload = await requestInternalApiEnvelope<unknown>(
      connectionPath(hotelId),
      {
        method: "GET",
        signal,
      },
    );
    return kbttConnectionSchema.parse(payload.data);
  },
  async connect(
    hotelId: string,
    credentials: KbttCredentials,
  ): Promise<KbttConnection> {
    try {
      const payload = await requestInternalApiEnvelope<unknown>(
        connectionPath(hotelId),
        {
          method: "PUT",
          body: credentials,
        },
      );
      return kbttConnectionSchema.parse(payload.data);
    } finally {
      credentials.password = "";
    }
  },
  async check(hotelId: string): Promise<KbttConnection> {
    const payload = await requestInternalApiEnvelope<unknown>(
      `${connectionPath(hotelId)}/check`,
      {
        method: "POST",
      },
    );
    return kbttConnectionSchema.parse(payload.data);
  },
  async disconnect(hotelId: string): Promise<KbttConnection> {
    const payload = await requestInternalApiEnvelope<unknown>(
      connectionPath(hotelId),
      {
        method: "DELETE",
      },
    );
    return kbttConnectionSchema.parse(payload.data);
  },
  async listDeclarations(
    hotelId: string,
    params?: { page?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<KbttDeclarationListItem[]> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const url = `${declarationsPath(hotelId)}?page=${page}&limit=${limit}`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "GET",
      signal,
    });
    const parsed = kbttDeclarationListSchema.parse(payload.data);
    const total = typeof (payload as any).total === "number" ? (payload as any).total : undefined;
    const totalPages = typeof (payload as any).totalPages === "number" ? (payload as any).totalPages : undefined;
    if (total !== undefined || totalPages !== undefined) {
      Object.assign(parsed, { total, totalPages, page, limit });
    }
    return parsed;
  },
  async getDeclaration(
    hotelId: string,
    occupantId: string,
    signal?: AbortSignal,
  ): Promise<KbttOccupantDeclarationDetail> {
    const url = `${declarationsPath(hotelId)}/${encodeURIComponent(occupantId)}/draft`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "GET",
      signal,
    });
    return kbttOccupantDeclarationDetailSchema.parse(payload.data);
  },
  async listCatalog(
    kind: KbttCatalogKind,
    parentCode?: string,
    signal?: AbortSignal,
  ): Promise<KbttCatalogItem[]> {
    const payload = await requestInternalApiEnvelope<unknown>(
      catalogPath(kind, parentCode),
      {
        method: "GET",
        signal,
      },
    );
    return kbttCatalogListSchema.parse(payload.data);
  },
  async saveDraft(
    hotelId: string,
    occupantId: string,
    body: SaveKbttDraftPayload,
  ): Promise<KbttDeclarationRecord> {
    const validated = saveKbttDraftPayloadSchema.parse(body);
    const url = `${declarationsPath(hotelId)}/${encodeURIComponent(occupantId)}/draft`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "PUT",
      body: validated,
    });
    return kbttDeclarationRecordSchema.parse(payload.data);
  },
  async submit(
    hotelId: string,
    occupantId: string,
  ): Promise<KbttDeclarationRecord> {
    const url = `${declarationsPath(hotelId)}/${encodeURIComponent(occupantId)}/submit`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "POST",
    });
    return kbttDeclarationRecordSchema.parse(payload.data);
  },
  async getAutoSubmitConfig(
    hotelId: string,
    signal?: AbortSignal,
  ): Promise<KbttAutoSubmitState> {
    const payload = await requestInternalApiEnvelope<unknown>(
      autoSubmitPath(hotelId),
      {
        method: "GET",
        signal,
      },
    );
    return kbttAutoSubmitStateSchema.parse(payload.data);
  },
  async updateAutoSubmitConfig(
    hotelId: string,
    config: KbttAutoSubmitConfig,
  ): Promise<{ autoSubmitEnabled: boolean; autoSubmitTime: string | null }> {
    const validated = kbttAutoSubmitConfigSchema.parse(config);
    const payload = await requestInternalApiEnvelope<unknown>(
      autoSubmitPath(hotelId),
      {
        method: "PUT",
        body: validated,
      },
    );
    return payload.data as { autoSubmitEnabled: boolean; autoSubmitTime: string | null };
  },
  async testAutoSubmit(
    hotelId: string,
    dryRun = true,
  ): Promise<KbttAutoSubmitRunSummary> {
    const url = `${autoSubmitPath(hotelId)}?mode=${dryRun ? "dry-run" : "live"}`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "POST",
    });
    return kbttAutoSubmitRunSummarySchema.parse(payload.data);
  },
  async testTelegram(hotelId: string): Promise<{ sent: boolean }> {
    const payload = await requestInternalApiEnvelope<{ sent: boolean }>(
      `${autoSubmitPath(hotelId)}?mode=telegram-test`,
      { method: "POST" },
    );
    return payload.data;
  },
  async scheduleAutoSubmit(hotelId: string, mode: "dry-run" | "live") {
    const payload = await requestInternalApiEnvelope<unknown>(
      `${autoSubmitPath(hotelId)}?mode=schedule`,
      { method: "POST", body: { mode } },
    );
    return kbttAutoSubmitRunSummarySchema.parse(payload.data);
  },
  async cancelScheduledAutoSubmit(hotelId: string) {
    const payload = await requestInternalApiEnvelope<{ cancelled: boolean }>(
      `${autoSubmitPath(hotelId)}?mode=cancel`,
      { method: "DELETE" },
    );
    return payload.data;
  },
  async devResetDeclarations(
    hotelId: string,
    options?: { generateNewIdentityNumbers?: boolean },
  ): Promise<{
    success: boolean;
    message: string;
    resetCount: number;
    generatedCount?: number;
  }> {
    const url = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/kbtt/dev?action=reset`;
    const payload = await requestInternalApiEnvelope<any>(url, {
      method: "POST",
      body: options ?? {},
    });
    return payload.data;
  },
  async devUpdateOccupants(
    hotelId: string,
    occupants: KbttDevOccupantUpdateItem[],
  ): Promise<{ success: boolean; message: string; updatedCount: number }> {
    const url = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/kbtt/dev?action=update-occupants`;
    const payload = await requestInternalApiEnvelope<any>(url, {
      method: "POST",
      body: { occupants },
    });
    return payload.data;
  },
};

