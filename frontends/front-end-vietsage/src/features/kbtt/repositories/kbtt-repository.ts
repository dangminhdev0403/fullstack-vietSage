import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import {
  kbttCatalogListSchema,
  kbttConnectionSchema,
  kbttDeclarationListSchema,
  kbttDeclarationRecordSchema,
  kbttOccupantDeclarationDetailSchema,
  kbttStaySubmissionResultSchema,
  saveKbttDraftPayloadSchema,
  type KbttCatalogItem,
  type KbttCatalogKind,
  type KbttConnection,
  type KbttCredentials,
  type KbttDeclarationListItem,
  type KbttDeclarationRecord,
  type KbttStaySubmissionResult,
  type KbttOccupantDeclarationDetail,
  type SaveKbttDraftPayload,
} from "../types/kbtt-contract";

function connectionPath(hotelId: string) {
  return `/api/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/connection`;
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
  async markReady(
    hotelId: string,
    occupantId: string,
  ): Promise<KbttDeclarationRecord> {
    const url = `${declarationsPath(hotelId)}/${encodeURIComponent(occupantId)}/ready`;
    const payload = await requestInternalApiEnvelope<unknown>(url, {
      method: "POST",
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
  async submitStay(
    hotelId: string,
    stayId: string,
  ): Promise<KbttStaySubmissionResult> {
    const payload = await requestInternalApiEnvelope<unknown>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/kbtt/stays/${encodeURIComponent(stayId)}/submit`,
      { method: "POST" },
    );
    return kbttStaySubmissionResultSchema.parse(payload.data);
  },
};
