import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import { HotelAccessService, HotelStayOccupantsReadService } from "../../property/property-public";
import { KbttRepository } from "../infrastructure/kbtt.repository";
import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import { KbttService } from "./kbtt.service";
import { composeKbttDraft } from "../domain/kbtt-draft-profile";
import { reconcileGuests, reconciliationArrivalDay, type LocalReconciliationGuest, type ProviderReconciliationGuest, type ReconciliationKind } from "../domain/kbtt-reconciliation";
import { type KbttReconciliationResponse, type ReconciliationSource } from "../domain/schemas/kbtt-reconciliation.schema";
import type { KbttSession } from "../domain/schemas/kbtt.schema";
import { kbttForeignDraftDataSchema, kbttVietnameseDraftDataSchema } from "../domain/schemas/kbtt.schema";
import { VIETNAM_TIME_ZONE, toYmd, plainDateAtTime } from "../../../common/time/vietnam-temporal";

type KindRead = { guests: ProviderReconciliationGuest[]; source: ReconciliationSource };
type RemoteSnapshot = { VIETNAMESE: KindRead; FOREIGN: KindRead };
const KINDS: ReconciliationKind[] = ["VIETNAMESE", "FOREIGN"];
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const providerId = (value: unknown): string | null => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^\d{1,32}$/.test(value) ? value : null;

@Injectable()
export class KbttReconciliationService implements OnModuleDestroy {
  private readonly snapshots = new Map<string, { session: KbttSession; expiresAt: number; value: RemoteSnapshot }>();
  private readonly pending = new Map<string, { session: KbttSession; controller: AbortController; value: Promise<RemoteSnapshot> }>();
  // Retain only projected views in process memory; login/logout never imports provider guests.
  private readonly lastKnown = new Map<string, KbttReconciliationResponse>();
  private readonly unsubscribe: () => void;
  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly occupants: HotelStayOccupantsReadService,
    private readonly sessions: KbttService,
    private readonly provider: KbttProviderReadClient,
  ) {
    this.unsubscribe = this.sessions.onSessionEnded((hotelId) => this.clearHotelViews(hotelId));
  }

  onModuleDestroy() {
    this.unsubscribe();
    for (const running of this.pending.values()) running.controller.abort();
    this.snapshots.clear(); this.pending.clear(); this.lastKnown.clear();
  }

  private clearHotelViews(hotelId: string, session?: KbttSession, cancelPending = true) {
    const prefix = JSON.stringify([hotelId]).slice(0, -1) + ",";
    if (!session) for (const key of this.lastKnown.keys()) if (key.startsWith(prefix)) this.lastKnown.delete(key);
    for (const [key, cached] of this.snapshots) if (key.startsWith(prefix) && (!session || cached.session === session)) this.snapshots.delete(key);
    for (const [key, running] of this.pending) if (cancelPending && key.startsWith(prefix) && (!session || running.session === session)) {
      running.controller.abort(); this.pending.delete(key);
    }
  }

  async get(userId: string, roleId: string, hotelId: string, force = false, localOnly = false): Promise<KbttReconciliationResponse> {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const restrictedRooms = scope.allowedRoomIds !== undefined ? scope.allowedRoomIds
      : scope.mode === "ROOM_EXCLUSIVE" ? (scope.allowedRoomId ? [scope.allowedRoomId] : []) : undefined;
    const raw = await this.occupants.getActiveStayOccupants(hotelId, restrictedRooms ? { roomIds: restrictedRooms } : undefined);
    const declarations = await this.repository.findDeclarationsByHotel(hotelId, raw.map((row) => row.id));
    const byOccupant = new Map(declarations.map((declaration) => [declaration.occupantId, declaration]));
    const local: LocalReconciliationGuest[] = raw.map((row) => {
      const declaration = byOccupant.get(row.id);
      const nationality = row.nationality?.trim().toUpperCase();
      const kind = declaration?.declarationKind ?? row.citizenshipKind ?? (nationality === "VNM" ? "VIETNAMESE" : null);
      const draft = kind ? composeKbttDraft(kind, object(declaration?.draftPayloadJson) ?? {}, row) : {};
      const allowed = kind === "FOREIGN" ? kbttForeignDraftDataSchema.shape : kbttVietnameseDraftDataSchema.shape;
      const draftPayload: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(allowed)) {
        if (!Object.hasOwn(draft, key)) continue;
        const parsed = schema.safeParse(draft[key]);
        if (parsed.success && parsed.data !== undefined) draftPayload[key] = parsed.data;
      }
      const identity = str(kind === "FOREIGN" ? draft.soHoChieu : draft.soGiayTo) ?? row.identityNumber;
      const documentType = typeof draft.loaiGiayTo === "number" ? draft.loaiGiayTo
        : kind === "VIETNAMESE" && /^\d{12}$/.test(identity ?? "") ? 1
          : kind === "VIETNAMESE" && /^\d{9}$/.test(identity ?? "") ? 2 : null;
      return { id: row.id, stayId: row.stayId, roomId: row.roomId, roomNumber: row.roomNumber,
        groupCode: row.groupCode ?? null, fullName: row.fullName, identityNumber: identity,
        kind, documentType, nationality: str(draft.quocTich) ?? row.nationality,
        checkedInAt: this.providerInstant(draft.ngayDenCsltStr) ?? row.checkedInAt?.toISOString() ?? null,
        plannedCheckOutAt: this.providerInstant(draft.ngayDiDuKienStr) ?? row.plannedCheckOutAt.toISOString(),
        declarationStatus: declaration?.status ?? null, providerMessage: declaration?.providerMessage ?? null, linkedBcaId: null, draftPayload };
    });
    const today = toYmd(new Date(), VIETNAM_TIME_ZONE);
    const arrivalDays = local.map((row) => reconciliationArrivalDay(row.checkedInAt)).filter((day): day is string => Boolean(day));
    const range = { dateFrom: arrivalDays.reduce((min, day) => day < min ? day : min, today), dateTo: today };
    const connection = await this.repository.find(hotelId);
    const viewKey = JSON.stringify([hotelId, connection?.csltId, connection?.ciphertext, restrictedRooms?.slice().sort() ?? null]);
    const unavailable = (state: "NOT_CONNECTED" | "NEEDS_LOGIN", message: string): KbttReconciliationResponse => ({
      items: reconcileGuests(local, [], new Set(), connection?.csltId ?? ""), checkedAt: null, range,
      sources: { VIETNAMESE: { state, checkedAt: null, error: { code: "KBTT_RECONCILIATION_" + state, message } },
        FOREIGN: { state, checkedAt: null, error: { code: "KBTT_RECONCILIATION_" + state, message } } },
    });
    if (!connection || connection.status !== "CONNECTED") {
      this.clearHotelViews(hotelId, undefined, connection?.lastErrorCode !== "KBTT_RETRY_PENDING");
      return unavailable(connection?.status === "AUTH_FAILED" ? "NEEDS_LOGIN" : "NOT_CONNECTED", "Cần kết nối tài khoản BCA để đối soát cả khách Việt Nam và nước ngoài.");
    }
    if (localOnly) return this.retainView(viewKey, {
      items: reconcileGuests(local, [], new Set(), ""), checkedAt: null, range,
      sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } },
    });
    const session = this.sessions.getCachedReadSession(hotelId, connection);
    if (!session) return this.retainView(viewKey, unavailable("NEEDS_LOGIN", "Phiên BCA chưa sẵn sàng. Kiểm tra kết nối BCA để cập nhật phiên trước khi đối soát."));
    const snapshot = await this.readBoth(hotelId, session, force);
    if (KINDS.some((kind) => snapshot[kind].source.state !== "COMPLETE")) {
      this.lastKnown.delete(viewKey);
      await this.sessions.recoverReadSession(hotelId, session, async (signal) => {
        const next = await this.readBoth(hotelId, session, true, signal);
        if (KINDS.some((kind) => next[kind].source.state === "NEEDS_LOGIN")) {
          await this.sessions.disconnectFailedSession(hotelId, session);
          return false;
        }
        return KINDS.every((kind) => next[kind].source.state === "COMPLETE");
      }, KINDS.some((kind) => snapshot[kind].source.state === "NEEDS_LOGIN"));
      return unavailable("NOT_CONNECTED", KINDS.some((kind) => snapshot[kind].source.state === "NEEDS_LOGIN")
        ? "Phiên BCA không còn hợp lệ. Vui lòng đăng nhập lại."
        : "Mất kết nối BCA. Danh sách VietSage vẫn hoạt động; hệ thống sẽ thử lại sau 10 giây.");
    }
    const current = await this.repository.find(hotelId);
    if (!current || current.ciphertext !== connection.ciphertext || current.csltId !== connection.csltId ||
        current.status !== "CONNECTED" || this.sessions.getCachedReadSession(hotelId, current) !== session) {
      this.lastKnown.delete(viewKey);
      this.clearHotelViews(hotelId, session);
      return unavailable(!current || current.status === "DISCONNECTED" ? "NOT_CONNECTED" : "NEEDS_LOGIN", "Kết nối BCA đã thay đổi trong lúc đối soát. Vui lòng tải lại.");
    }
    const complete = new Set(KINDS.filter((kind) => snapshot[kind].source.state === "COMPLETE"));
    let items = reconcileGuests(local, [...snapshot.VIETNAMESE.guests, ...snapshot.FOREIGN.guests], complete, connection.csltId);
    // Provider room labels are not an authorization boundary. Restricted users see local scoped guests only.
    if (restrictedRooms !== undefined) items = items.filter((row) => row.source === "VIETSAGE");
    const paused = process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" || process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true";
    if (paused || complete.size !== 2) items = items.map((row) => ({ ...row, canRetry: false }));
    return this.retainView(viewKey, { items, range, checkedAt: complete.size === 2 ? snapshot.VIETNAMESE.source.checkedAt : null,
      sources: { VIETNAMESE: snapshot.VIETNAMESE.source, FOREIGN: snapshot.FOREIGN.source } });
  }

  private retainView(key: string, current: KbttReconciliationResponse): KbttReconciliationResponse {
    const previous = this.lastKnown.get(key);
    const identity = (row: KbttReconciliationResponse["items"][number]) => JSON.stringify([
      row.id, row.kind, row.identityNumber, row.documentType, row.nationality, reconciliationArrivalDay(row.checkedInAt),
    ]);
    const prior = new Map(previous?.items.map((row) => [identity(row), row]) ?? []);
    const complete = (kind: ReconciliationKind | null) => kind !== null && current.sources[kind].state === "COMPLETE";
    const allComplete = KINDS.every((kind) => complete(kind));
    const items = current.items.map((row) => {
      const old = !complete(row.kind) ? prior.get(identity(row)) : undefined;
      return old ? { ...row, status: old.status, bcaRecordId: old.bcaRecordId, reason: old.reason, canRetry: false }
        : { ...row, canRetry: allComplete && row.canRetry };
    });
    const ids = new Set(items.map((row) => row.id));
    for (const old of previous?.items ?? []) {
      if (old.source === "BCA_ONLY" && !complete(old.kind) && !ids.has(old.id)) items.push({ ...old, canRetry: false });
    }
    const sources = { ...current.sources };
    for (const kind of KINDS) if (!complete(kind) && previous?.sources[kind].checkedAt) {
      sources[kind] = { ...sources[kind], checkedAt: previous.sources[kind].checkedAt };
    }
    const result = { ...current, items, sources, checkedAt: current.checkedAt ?? previous?.checkedAt ?? null };
    if (previous || KINDS.some((kind) => complete(kind))) {
      if (this.lastKnown.size >= 100 && !this.lastKnown.has(key)) this.lastKnown.delete(this.lastKnown.keys().next().value!);
      this.lastKnown.set(key, result);
    }
    return result;
  }

  private async readBoth(hotelId: string, session: KbttSession, force: boolean, parent?: AbortSignal): Promise<RemoteSnapshot> {
    const now = Date.now();
    for (const [key, cached] of this.snapshots) if (cached.expiresAt <= now) this.snapshots.delete(key);
    const key = JSON.stringify([hotelId, session.CsltId]);
    const running = this.pending.get(key);
    if (running?.session === session) return running.value;
    const cached = this.snapshots.get(key);
    if (!force && cached?.session === session && cached.expiresAt > now) return cached.value;
    const controller = new AbortController();
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    // Leave room for local DB projection within the BFF's 10-second deadline.
    const timer = setTimeout(() => controller.abort(), parent ? 10_000 : 8_000);
    timer.unref?.();
    let onAbort!: () => void;
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(new KbttProviderReadError("NETWORK", "BCA reconciliation cancelled or timed out"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // The deadline must settle the service even if a transport ignores AbortSignal.
    const value = Promise.allSettled(KINDS.map((kind) => Promise.race([this.readKind(kind, session, signal), deadline]))).then((results) => {
      const reads = results.map((result) => result.status === "fulfilled" ? result.value : { guests: [], source: this.failure(result.reason, session) });
      const snapshot = { VIETNAMESE: reads[0], FOREIGN: reads[1] };
      if (!signal.aborted && KINDS.every((kind) => snapshot[kind].source.state === "COMPLETE")) {
        if (this.snapshots.size >= 100) this.snapshots.delete(this.snapshots.keys().next().value!);
        this.snapshots.set(key, { session, expiresAt: Date.now() + 30_000, value: snapshot });
      }
      return snapshot;
    });
    this.pending.set(key, { session, controller, value });
    try { return await value; } finally {
      clearTimeout(timer); signal.removeEventListener("abort", onAbort);
      if (this.pending.get(key)?.value === value) this.pending.delete(key);
    }
  }

  private async readKind(kind: ReconciliationKind, session: KbttSession, signal: AbortSignal): Promise<KindRead> {
    const responses = await Promise.allSettled([
      this.provider.readAllResidents(kind, session.AccessToken, signal), this.provider.readAllHistory(kind, session.AccessToken, {}, signal),
    ]);
    const guests = new Map<string, ProviderReconciliationGuest>();
    let issue: ReconciliationSource | null = null;
    for (const [index, response] of responses.entries()) {
      if (response.status === "rejected") { issue ??= this.failure(response.reason, session); continue; }
      for (const row of response.value) {
        try {
          const normalized = this.normalizeProvider(row, kind, session.CsltId, index === 0);
          const previous = guests.get(normalized.id);
          if (previous && (previous.identityNumber !== normalized.identityNumber || previous.arrivalDay !== normalized.arrivalDay ||
              previous.documentType !== normalized.documentType || previous.nationality !== normalized.nationality || previous.departed !== normalized.departed)) {
            throw new KbttProviderReadError("INCOMPLETE", "Conflicting BCA history and active-list records");
          }
          guests.set(normalized.id, previous ? { ...normalized, isActive: previous.isActive || normalized.isActive } : normalized);
        } catch (error) { issue ??= this.failure(error, session); }
      }
    }
    return { guests: [...guests.values()], source: issue ?? { state: "COMPLETE", checkedAt: new Date().toISOString(), error: null } };
  }

  private normalizeProvider(value: unknown, kind: ReconciliationKind, csltId: string, active: boolean): ProviderReconciliationGuest {
    const row = object(value);
    const scope = providerId(row?.csltId ?? object(row?.cslt)?.id);
    if (!row || !str(row.id) || !str(row.hoTen) || scope !== csltId) throw new KbttProviderReadError("INCOMPLETE", "BCA record has invalid identity or accommodation scope");
    const arrival = this.providerInstant(row.ngayDenCslt);
    const identity = str(kind === "VIETNAMESE" ? row.soGiayTo : row.soHoChieu);
    const qualifier = kind === "VIETNAMESE" ? typeof row.loaiGiayTo === "number" && Number.isSafeInteger(row.loaiGiayTo) && row.loaiGiayTo > 0 : Boolean(str(row.quocTich));
    if (!identity || !arrival || !qualifier) throw new KbttProviderReadError("INCOMPLETE", "BCA record lacks verified document or arrival fields");
    const departureText = str(row.ngayDiCslt);
    const departure = this.providerInstant(row.ngayDiCslt);
    if (departureText && !departure) throw new KbttProviderReadError("INCOMPLETE", "Invalid BCA departure timestamp");
    const gender = str(row.gioiTinh)?.toUpperCase();
    const birthDate = str(row.ngayThangNamSinh)?.slice(0, 10);
    const draftPayload: Record<string, unknown> = {
      hoTen: str(row.hoTen), ...(gender === "M" || gender === "F" ? { gioiTinh: gender } : {}),
      ...(birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? { ngayThangNamSinhStr: birthDate } : {}),
      ...(kind === "VIETNAMESE" ? { soGiayTo: identity, loaiGiayTo: row.loaiGiayTo } : { soHoChieu: identity, quocTich: str(row.quocTich) }),
    };
    return { id: str(row.id)!, kind, csltId, fullName: str(row.hoTen)!, draftPayload,
      identityNumber: identity,
      documentType: typeof row.loaiGiayTo === "number" && Number.isSafeInteger(row.loaiGiayTo) ? row.loaiGiayTo : null,
      nationality: str(row.quocTich), arrivalDay: reconciliationArrivalDay(arrival), checkedInAt: arrival,
      plannedCheckOutAt: this.providerInstant(row.ngayDiDuKien), checkedOutAt: departure, departed: Boolean(departure),
      roomNumber: str(row.soPhong), isActive: active && !departure };
  }

  private providerInstant(value: unknown): string | null {
    const raw = str(value);
    if (!raw) return null;
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return plainDateAtTime(raw, "00:00:00", VIETNAM_TIME_ZONE).toISOString();
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) return plainDateAtTime(raw.slice(0, 10), raw.slice(11), VIETNAM_TIME_ZONE).toISOString();
      return Temporal.Instant.from(raw).toString();
    } catch { return null; }
  }

  private failure(error: unknown, session: KbttSession): ReconciliationSource {
    const known = error instanceof KbttProviderReadError ? error : null;
    const auth = known?.details.httpStatus === 401 || known?.details.httpStatus === 403 || ["401", "403"].includes(String(known?.details.providerCode));
    const state = auth ? "NEEDS_LOGIN" : known?.kind === "INCOMPLETE" || known?.kind === "INVALID_RESPONSE" ? "INCOMPLETE" : "FAILED";
    const redact = (value: string) => value.replaceAll(session.AccessToken, "[REDACTED]").replaceAll(session.RefreshToken, "[REDACTED]")
      .replace(/(?:bearer|basic)\s+\S+/gi, "[REDACTED]").replace(/(?:password|token|secret)\s*[:=]\s*\S+/gi, "[REDACTED]").slice(0, 500);
    const providerFailure = known && ["HTTP", "PROVIDER"].includes(known.kind);
    return { state, checkedAt: null, error: {
      code: providerFailure && known.details.providerCode !== undefined ? redact(String(known.details.providerCode)) : "KBTT_RECONCILIATION_" + (known?.kind ?? "FAILED"),
      message: auth ? "Phiên BCA không còn hợp lệ. Vui lòng kiểm tra kết nối BCA."
        : providerFailure && known.details.providerMessage ? redact(known.details.providerMessage)
          : state === "INCOMPLETE" ? "Chưa đọc đủ dữ liệu BCA để kết luận. Vui lòng làm mới đối soát."
            : "Không đọc được dữ liệu BCA. Vui lòng thử lại.",
    } };
  }
}
