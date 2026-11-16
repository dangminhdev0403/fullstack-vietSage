import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  kbttResidentPageSchema, kbttVietnameseDetailSchema, kbttForeignDetailSchema,
  kbttVietnameseLookupSchema, kbttVietnameseHistoryPageSchema, kbttForeignHistoryPageSchema,
  kbttAccommodationSchema, kbttCurrentUserSchema,
  type KbttVietnameseDetail, type KbttForeignDetail,
  type KbttVietnameseHistoryPage, type KbttForeignHistoryPage,
} from "../domain/schemas/kbtt-provider-data.schema";
import {
  kbttHistoryDateQuerySchema,
  type KbttHistoryDateQuery,
  kbttProviderReadEnvelopeSchema,
  kbttProviderRecordIdSchema,
  kbttResidentListQuerySchema,
  type KbttProviderReadKind,
  type KbttProviderReadResponse,
} from "../domain/schemas/kbtt-provider-read.schema";
import { loadKbttConfig } from "./kbtt.config";

type ResidentKind = KbttProviderReadKind;
export type KbttProviderReadErrorKind = "HTTP" | "PROVIDER" | "INVALID_RESPONSE" | "NETWORK" | "CONFIGURATION" | "VALIDATION" | "INCOMPLETE";
export class KbttProviderReadError extends Error {
  constructor(
    public readonly kind: KbttProviderReadErrorKind,
    message: string,
    public readonly details: {
      httpStatus?: number;
      providerCode?: string | number;
      providerMessage?: string | null;
      rawBody?: string;
    } = {},
    cause?: unknown,
  ) { super(message, cause === undefined ? undefined : { cause }); this.name = "KbttProviderReadError"; }
}
export type KbttProviderReadResult = KbttProviderReadResponse;

/** Read-only transport. Never obtains, refreshes or revokes credentials. */
@Injectable()
export class KbttProviderReadClient {
  private prefix(kind: ResidentKind) {
    if (kind !== "VIETNAMESE" && kind !== "FOREIGN") throw new KbttProviderReadError("VALIDATION", "Invalid resident kind");
    return kind === "VIETNAMESE" ? "/client-service/kbtt-vn" : "/client-service/kbtt";
  }

  listResidents(kind: ResidentKind, query: unknown, accessToken: string, signal?: AbortSignal) {
    const parsed = kbttResidentListQuerySchema.safeParse(query);
    if (!parsed.success) throw new KbttProviderReadError("VALIDATION", "Invalid resident list query");
    return this.get(`${this.prefix(kind)}/get-all-by-cslt`, accessToken, kbttResidentPageSchema, {
      ...(parsed.data.search ? { search: parsed.data.search } : {}),
      ...(parsed.data.soPhong ? { soPhong: parsed.data.soPhong } : {}),
      page: String(parsed.data.page), size: String(parsed.data.size),
    }, signal);
  }
  getResident(kind: "VIETNAMESE", kbttId: string, accessToken: string): Promise<KbttProviderReadResponse<KbttVietnameseDetail>>;
  getResident(kind: "FOREIGN", kbttId: string, accessToken: string): Promise<KbttProviderReadResponse<KbttForeignDetail>>;
  getResident(kind: ResidentKind, kbttId: string, accessToken: string): Promise<KbttProviderReadResponse<KbttVietnameseDetail | KbttForeignDetail>>;
  getResident(kind: ResidentKind, kbttId: string, accessToken: string) {
    const schema: z.ZodType<KbttVietnameseDetail | KbttForeignDetail> = kind === "VIETNAMESE" ? kbttVietnameseDetailSchema : kbttForeignDetailSchema;
    return this.get(`${this.prefix(kind)}/${encodeURIComponent(this.identifier(kbttId))}`, accessToken, schema);
  }
  lookupVietnamese(soGiayTo: string, accessToken: string) {
    return this.get("/client-service/kbtt-vn/tra-cuu-nvn", accessToken, kbttVietnameseLookupSchema, { soGiayTo: this.identifier(soGiayTo) });
  }
  lookupForeign(soHoChieu: string, accessToken: string) {
    // Both captured responses were null. Preserve future data without inventing its shape.
    return this.get("/client-service/kbtt/tra-cuu-nnn", accessToken, z.unknown(), { soHoChieu: this.identifier(soHoChieu) });
  }
  listDeclarationHistory(kind: "VIETNAMESE", accessToken: string, query?: KbttHistoryDateQuery, signal?: AbortSignal): Promise<KbttProviderReadResponse<KbttVietnameseHistoryPage>>;
  listDeclarationHistory(kind: "FOREIGN", accessToken: string, query?: KbttHistoryDateQuery, signal?: AbortSignal): Promise<KbttProviderReadResponse<KbttForeignHistoryPage>>;
  listDeclarationHistory(kind: ResidentKind, accessToken: string, query?: KbttHistoryDateQuery, signal?: AbortSignal): Promise<KbttProviderReadResponse<KbttVietnameseHistoryPage | KbttForeignHistoryPage>>;
  listDeclarationHistory(kind: ResidentKind, accessToken: string, query?: KbttHistoryDateQuery, signal?: AbortSignal) {
    const schema: z.ZodType<KbttVietnameseHistoryPage | KbttForeignHistoryPage> = kind === "VIETNAMESE" ? kbttVietnameseHistoryPageSchema : kbttForeignHistoryPageSchema;
    const dates = kbttHistoryDateQuerySchema.safeParse(query ?? {});
    if (!dates.success) throw new KbttProviderReadError("VALIDATION", "Invalid BCA history date range", {}, dates.error);
    const providerQuery: Record<string, string> = {};
    if (dates.data.dateFrom && dates.data.dateTo) {
      providerQuery.typeDate = String(dates.data.typeDate ?? 3);
      providerQuery.dateFrom = dates.data.dateFrom + " 00:00:00";
      providerQuery.dateTo = dates.data.dateTo + " 23:59:59";
    } else if (dates.data.typeDate !== undefined) providerQuery.typeDate = String(dates.data.typeDate);
    if (dates.data.keyword !== undefined) providerQuery.keyword = dates.data.keyword;
    if (dates.data.page !== undefined) providerQuery.page = String(dates.data.page);
    if (dates.data.size !== undefined) providerQuery.size = String(dates.data.size);
    return this.get(`${this.prefix(kind)}/ls-khai-bao`, accessToken, schema, Object.keys(providerQuery).length ? providerQuery : undefined, signal);
  }
  /** Complete snapshots only: an interrupted/drifting scan is never an empty result. */
  readAllResidents(kind: ResidentKind, accessToken: string, signal?: AbortSignal): Promise<unknown[]> {
    this.prefix(kind);
    return this.readAllPages((page) => this.listResidents(kind, { page, size: 100 }, accessToken, signal), signal);
  }

  readAllHistory(
    kind: ResidentKind,
    accessToken: string,
    query: { dateFrom?: string; dateTo?: string } = {},
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    this.prefix(kind);
    const parsed = kbttHistoryDateQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new KbttProviderReadError("VALIDATION", "Invalid BCA history calendar range", {}, parsed.error);
    }
    return this.readAllPages((page) => this.listDeclarationHistory(kind, accessToken, {
      ...(parsed.data.dateFrom ? { dateFrom: parsed.data.dateFrom, dateTo: parsed.data.dateTo, typeDate: 2 as const } : {}), page, size: 100,
    }, signal), signal);
  }

  private async readAllPages(
    fetchPage: (page: number) => Promise<KbttProviderReadResponse<{ content: unknown[]; totalElements: number }>>,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const rows: unknown[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    for (let page = 0; page < 100; page++) {
      if (signal?.aborted) throw new KbttProviderReadError("NETWORK", "BCA snapshot was aborted before the next page", {}, signal.reason);
      const result = await fetchPage(page);
      const details = { httpStatus: result.httpStatus, providerCode: result.envelope.code, providerMessage: result.envelope.message };
      const data = result.data;
      if (!Number.isSafeInteger(data.totalElements) || data.totalElements > 10_000 || data.content.length > 100) {
        throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot exceeds the supported bounded scan", details);
      }
      if (total === undefined) total = data.totalElements;
      else if (total !== data.totalElements) throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot total changed during pagination", details);
      if (rows.length + data.content.length > total) {
        throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot contains more rows than its declared total", details);
      }
      for (const row of data.content) {
        const parsed = z.object({ id: kbttProviderRecordIdSchema }).passthrough().safeParse(row);
        if (!parsed.success) throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot row has no valid stable identifier", details, parsed.error);
        if (ids.has(parsed.data.id)) throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot repeats a record during pagination", details);
        ids.add(parsed.data.id);
        rows.push(row);
      }
      if (rows.length === total) return rows;
      if (data.content.length === 0) throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot ended before all declared rows were read", details);
    }
    throw new KbttProviderReadError("INCOMPLETE", "BCA snapshot reached the maximum page count before completion");
  }

  getAccommodation(accessToken: string) { return this.get("/client-service/cslt/of-user", accessToken, kbttAccommodationSchema); }
  getCurrentUser(accessToken: string) { return this.get("/user-service/user/get-user-info", accessToken, kbttCurrentUserSchema); }

  private identifier(value: unknown): string {
    const parsed = kbttProviderRecordIdSchema.safeParse(value);
    if (!parsed.success || parsed.data === "." || parsed.data === "..") throw new KbttProviderReadError("VALIDATION", "Invalid provider identifier");
    return parsed.data;
  }

  private async get<T>(path: string, accessToken: string, dataSchema: z.ZodType<T>, query?: Record<string, string>, signal?: AbortSignal): Promise<KbttProviderReadResponse<T>> {
    if (typeof accessToken !== "string" || !accessToken.trim() || /[\u0000-\u0020\u007f]/.test(accessToken)) throw new KbttProviderReadError("VALIDATION", "A valid access token is required");
    let baseUrl: string | undefined;
    try { baseUrl = loadKbttConfig().KBTT_BASE_URL; } catch (error) { throw new KbttProviderReadError("CONFIGURATION", "Invalid KBTT configuration", {}, error); }
    if (!baseUrl) throw new KbttProviderReadError("CONFIGURATION", "KBTT base URL is not configured");
    const url = new URL(`${baseUrl}${path}`);
    if (query) url.search = new URLSearchParams(query).toString();
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    let response: Response;
    try {
      requestSignal.throwIfAborted();
      response = await fetch(url, {
        method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        redirect: "error", signal: requestSignal,
      });
    } catch (error) { throw new KbttProviderReadError("NETWORK", "Could not read BCA response", {}, error); }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new KbttProviderReadError("INVALID_RESPONSE", "BCA returned an empty response", { httpStatus: response.status });
    const reader = response.body.getReader();
    try {
      for (;;) {
        requestSignal.throwIfAborted();
        const chunk = await reader.read();
        requestSignal.throwIfAborted();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 5 * 1024 * 1024) throw new KbttProviderReadError("INVALID_RESPONSE", "BCA response exceeds 5 MiB", { httpStatus: response.status });
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof KbttProviderReadError) throw error;
      throw new KbttProviderReadError("NETWORK", "Could not finish reading BCA response", { httpStatus: response.status }, error);
    } finally { await reader.cancel().catch(() => undefined); }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(rawBody.replace(/^\uFEFF/, "").trim()); } catch {
      throw new KbttProviderReadError(response.ok ? "INVALID_RESPONSE" : "HTTP", "BCA response is not JSON", { httpStatus: response.status, rawBody });
    }
    const parsed = kbttProviderReadEnvelopeSchema.safeParse(body);
    if (!parsed.success) throw new KbttProviderReadError(response.ok ? "INVALID_RESPONSE" : "HTTP", "Invalid BCA response envelope", { httpStatus: response.status, rawBody });
    const envelope = parsed.data;
    const details = { httpStatus: response.status, providerCode: envelope.code, providerMessage: envelope.message, rawBody };
    if (!response.ok) throw new KbttProviderReadError("HTTP", envelope.message ?? `BCA HTTP ${response.status}`, details);
    if (envelope.code === undefined) throw new KbttProviderReadError("INVALID_RESPONSE", "BCA response has no result code", details);
    if (String(envelope.code) !== "200") throw new KbttProviderReadError("PROVIDER", envelope.message ?? "BCA rejected the read request", details);
    if (!Object.prototype.hasOwnProperty.call(envelope, "data")) throw new KbttProviderReadError("INVALID_RESPONSE", "BCA success response has no data field", details);
    const data = dataSchema.safeParse(envelope.data);
    if (!data.success) throw new KbttProviderReadError("INVALID_RESPONSE", "BCA response data does not match the observed endpoint schema", details, data.error);
    return { httpStatus: response.status, envelope, data: data.data };
  }
}
