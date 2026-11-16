import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import { HotelAccessService } from "../../property/application/hotel-access.service";
import { HotelStayOccupantsReadService } from "../../property/application/hotel-stay-occupants-read.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";
import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import { KbttService } from "./kbtt.service";
import { composeKbttDraft } from "../domain/kbtt-draft-profile";
import { reconcileGuests, reconciliationArrivalDay, type LocalReconciliationGuest, type ProviderReconciliationGuest, type ReconciliationKind } from "../domain/kbtt-reconciliation";
import { type KbttReconciliationResponse, type ReconciliationSource } from "../domain/schemas/kbtt-reconciliation.schema";
import type { KbttSession } from "../domain/schemas/kbtt.schema";
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
  private readonly pending = new Map<string, { session: KbttSession; value: Promise<RemoteSnapshot> }>();
  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly occupants: HotelStayOccupantsReadService,
    private readonly sessions: KbttService,
    private readonly provider: KbttProviderReadClient,
  ) {}

  onModuleDestroy() { this.snapshots.clear(); this.pending.clear(); }

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
      const identity = str(kind === "FOREIGN" ? draft.soHoChieu : draft.soGiayTo) ?? row.identityNumber;
      const documentType = typeof draft.loaiGiayTo === "number" ? draft.loaiGiayTo
        : kind === "VIETNAMESE" && /^\d{12}$/.test(identity ?? "") ? 1
          : kind === "VIETNAMESE" && /^\d{9}$/.test(identity ?? "") ? 2 : null;
      return { id: row.id, stayId: row.stayId, roomId: row.roomId, roomNumber: row.roomNumber,
        groupCode: row.groupCode ?? null, fullName: row.fullName, identityNumber: identity,
        kind, documentType, nationality: str(draft.quocTich) ?? row.nationality,
        checkedInAt: row.checkedInAt?.toISOString() ?? null, plannedCheckOutAt: row.plannedCheckOutAt.toISOString(),
        declarationStatus: declaration?.status ?? null, providerMessage: declaration?.providerMessage ?? null, linkedBcaId: null };
    });
    const today = toYmd(new Date(), VIETNAM_TIME_ZONE);
    const arrivalDays = local.map((row) => reconciliationArrivalDay(row.checkedInAt)).filter((day): day is string => Boolean(day));
    const range = { dateFrom: arrivalDays.reduce((min, day) => day < min ? day : min, today), dateTo: today };
    if (localOnly) return {
      items: reconcileGuests(local, [], new Set(), ""), checkedAt: null, range,
      sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } },
    };
    const connection = await this.repository.find(hotelId);
    const unavailable = (state: "NOT_CONNECTED" | "NEEDS_LOGIN", message: string): KbttReconciliationResponse => ({
      items: reconcileGuests(local, [], new Set(), connection?.csltId ?? ""), checkedAt: null, range,
      sources: { VIETNAMESE: { state, checkedAt: null, error: { code: "KBTT_RECONCILIATION_" + state, message } },
        FOREIGN: { state, checkedAt: null, error: { code: "KBTT_RECONCILIATION_" + state, message } } },
    });
    if (!connection || connection.status !== "CONNECTED") return unavailable("NOT_CONNECTED", "Cần kết nối tài khoản BCA để đối soát cả khách Việt Nam và nước ngoài.");
    const session = this.sessions.getCachedReadSession(hotelId, connection);
    if (!session) return unavailable("NEEDS_LOGIN", "Phiên BCA chưa sẵn sàng. Kiểm tra kết nối BCA để cập nhật phiên trước khi đối soát.");
    const snapshot = await this.readBoth(hotelId, session, range, force);
    const current = await this.repository.find(hotelId);
    if (!current || current.ciphertext !== connection.ciphertext || current.csltId !== connection.csltId ||
        current.status !== "CONNECTED" || this.sessions.getCachedReadSession(hotelId, current) !== session) {
      for (const [key, cached] of this.snapshots) if (cached.session === session) this.snapshots.delete(key);
      return unavailable("NEEDS_LOGIN", "Kết nối BCA đã thay đổi trong lúc đối soát. Vui lòng tải lại.");
    }
    const complete = new Set(KINDS.filter((kind) => snapshot[kind].source.state === "COMPLETE"));
    let items = reconcileGuests(local, [...snapshot.VIETNAMESE.guests, ...snapshot.FOREIGN.guests], complete, connection.csltId);
    // Provider room labels are not an authorization boundary. Restricted users see local scoped guests only.
    if (restrictedRooms !== undefined) items = items.filter((row) => row.source === "VIETSAGE");
    const paused = process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" || process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true";
    if (paused) items = items.map((row) => ({ ...row, canRetry: false }));
    return { items, range, checkedAt: complete.size === 2 ? snapshot.VIETNAMESE.source.checkedAt : null,
      sources: { VIETNAMESE: snapshot.VIETNAMESE.source, FOREIGN: snapshot.FOREIGN.source } };
  }

  private async readBoth(hotelId: string, session: KbttSession, range: { dateFrom: string; dateTo: string }, force: boolean): Promise<RemoteSnapshot> {
    const now = Date.now();
    for (const [key, cached] of this.snapshots) if (cached.expiresAt <= now) this.snapshots.delete(key);
    const key = JSON.stringify([hotelId, session.CsltId, range.dateFrom, range.dateTo]);
    const running = this.pending.get(key);
    if (running?.session === session) return running.value;
    const cached = this.snapshots.get(key);
    if (!force && cached?.session === session && cached.expiresAt > now) return cached.value;
    const signal = AbortSignal.timeout(10_000);
    const value = Promise.allSettled(KINDS.map((kind) => this.readKind(kind, session, range, signal))).then((results) => {
      const reads = results.map((result) => result.status === "fulfilled" ? result.value : { guests: [], source: this.failure(result.reason, session) });
      const snapshot = { VIETNAMESE: reads[0], FOREIGN: reads[1] };
      if (KINDS.every((kind) => snapshot[kind].source.state === "COMPLETE")) {
        if (this.snapshots.size >= 100) this.snapshots.delete(this.snapshots.keys().next().value!);
        this.snapshots.set(key, { session, expiresAt: Date.now() + 30_000, value: snapshot });
      }
      return snapshot;
    });
    this.pending.set(key, { session, value });
    try { return await value; } finally { if (this.pending.get(key)?.value === value) this.pending.delete(key); }
  }

  private async readKind(kind: ReconciliationKind, session: KbttSession, range: { dateFrom: string; dateTo: string }, signal: AbortSignal): Promise<KindRead> {
    const responses = await Promise.allSettled([
      this.provider.readAllResidents(kind, session.AccessToken, signal), this.provider.readAllHistory(kind, session.AccessToken, range, signal),
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
    return { id: str(row.id)!, kind, csltId, fullName: str(row.hoTen)!,
      identityNumber: identity,
      documentType: typeof row.loaiGiayTo === "number" && Number.isSafeInteger(row.loaiGiayTo) ? row.loaiGiayTo : null,
      nationality: str(row.quocTich), arrivalDay: reconciliationArrivalDay(arrival), checkedInAt: arrival,
      plannedCheckOutAt: this.providerInstant(row.ngayDiDuKien), departed: Boolean(departure),
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
    const auth = known?.details.httpStatus === 401 || String(known?.details.providerCode) === "401";
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
