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
    return kbttDeclarationListSchema.parse(payload.data);
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
    const url = `${autoSubmitPath(hotelId)}?dryRun=${dryRun}`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "POST",
    });
    return kbttAutoSubmitRunSummarySchema.parse(payload.data);
  },
};

