import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import { KBTT_READ_RETRIES, waitForKbttRetry, withKbttDeadline } from "../domain/kbtt-retry";
import type { KbttConnectionProfile } from "../domain/schemas/kbtt-provider-read.schema";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  KbttAutoSubmitRun,
  KbttGuestDeclaration,
  KbttHotelConnection,
  Prisma,
} from "@prisma/client";
import {
  HotelAccessService,
  HotelStayOccupantsReadService,
  type ActiveStayOccupantRow,
} from "../../property/property-public";
import { TelegramNotificationService } from "../../notifications/notifications-public";
import { StayCheckInEventBus } from "../../../shared/events";
import { z } from "zod";
import {
  assertKbttDeclarationMutable,
  normalizeDateStringToIso,
  kbttForeignReadySchema,
  kbttMetadata,
  kbttProviderCountrySchema,
  kbttProviderNamedItemSchema,
  kbttProviderProvinceSchema,
  kbttProviderWardSchema,
  kbttVietnameseReadySchema,
  parseDraftPayload,
  type KbttAutoSubmitConfig,
  type KbttCatalogItemView,
  type KbttCatalogKind,
  type KbttCatalogQuery,
  type KbttCredentials,
  type KbttDailyMovementItem,
  type KbttDailyMovementsQuery,
  type KbttDailyMovementsResponse,
  type KbttDerivedStatus,
  type KbttPaginationQuery,
  type KbttSession,
} from "../domain/schemas/kbtt.schema";
import { KbttCredentialCipher } from "../infrastructure/kbtt-credential-cipher";
import {
  KbttProviderClient,
  kbttAuthFailed,
  kbttProviderError,
  KBTT_AUTH_FAILED_MESSAGE,
  type KbttSubmitOutcome,
} from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";
import { composeKbttDraft, compactKbttDeclarationDraft, markKbttDeclarationDates } from "../domain/kbtt-draft-profile";
import { isValidCalendarDateTime } from "../domain/schemas/kbtt.schema";
import { providerDay } from "../domain/kbtt-stay-sync";
import { KbttStaySyncService } from "./kbtt-stay-sync.service";
import {
  formatLocalDateTime,
  getDayBounds,
  toYmd,
  VIETNAM_TIME_ZONE,
} from "../../../common/time/vietnam-temporal";

function formatVietnamDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return formatLocalDateTime(d, VIETNAM_TIME_ZONE);
}

function sanitizeProviderText(text: string): string {
  if (!text) return "";
  return text
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "bearer [REDACTED]")
    .replace(/basic\s+[A-Za-z0-9+/=]+/gi, "basic [REDACTED]")
    .replace(
      /(?:password|token|secret|access_token|refresh_token)\s*[:=]\s*["']?[^"'\s,]+["']?/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 5000);
}

function sanitizeProviderData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeProviderData);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token") ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("authorization")
    ) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeProviderData(value);
    } else if (typeof value === "string") {
      result[key] = sanitizeProviderText(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function stableKbttError(error: unknown) {
  const response =
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
      ? (error.response as { code?: string; message?: string })
      : {};
  const stable = response.code?.startsWith("KBTT_") ?? false;
  return {
    stable,
    code: stable ? response.code! : "KBTT_PROVIDER_UNAVAILABLE",
    message:
      stable && response.message
        ? response.message
        : "Không thể kết nối hệ thống Bộ Công an. Vui lòng thử lại.",
    authenticationFailed: response.code === "KBTT_AUTH_FAILED",
  };
}

const KBTT_FIELD_LABELS: Record<string, string> = {
  hoTen: "Họ và tên",
  gioiTinh: "Giới tính",
  ngayThangNamSinhStr: "Ngày sinh",
  noiCuTru: "Nơi cư trú",
  maTT: "Tỉnh/thành phố",
  maPX: "Phường/xã",
  diaChi: "Địa chỉ",
  ngayDenCsltStr: "Ngày check-in",
  ngayDiDuKienStr: "Ngày check-out dự kiến",
  soPhong: "Số phòng",
  lyDoCuTru: "Lý do cư trú",
  lyDoChiTiet: "Lý do chi tiết",
  loaiGiayTo: "Loại giấy tờ",
  soGiayTo: "Số giấy tờ",
  quocTich: "Quốc tịch",
  soHoChieu: "Số hộ chiếu",
  loaiNgayThangNamSinh: "Loại ngày sinh",
  thoiHanTamTruStr: "Thời hạn tạm trú",
};

export function isBcaDuplicateConflict(
  message: string | undefined | null,
  draft: Record<string, unknown>,
): boolean {
  if (!message || typeof message !== "string") return false;
  const hasConflictKeywords =
    /(đang tạm trú tại CSLT|đã có khai báo tạm trú|trùng thời gian tại CSLT|chưa checkout)/i.test(
      message,
    );
  if (!hasConflictKeywords) return false;

  const toSafeString = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";

  const rawIdentity = (toSafeString(draft.soGiayTo) || toSafeString(draft.soHoChieu)).trim();
  if (!rawIdentity) return false;
  const normalizedIdentity = rawIdentity.toUpperCase().replace(/[\s-]/g, "");

  const rawDeparture = (
    toSafeString(draft.ngayDiDuKienStr) || toSafeString(draft.thoiHanTamTruStr)
  ).trim();
  const departureMatch = rawDeparture.match(/\d{4}-\d{2}-\d{2}/);
  if (!departureMatch) return false;
  const draftDeparture = departureMatch[0];

  const normalizedMessage = message.toUpperCase().replace(/[\s-]/g, "");
  if (!normalizedMessage.includes(normalizedIdentity)) return false;

  const toDateMatch = message.match(/(?:đến|hết hạn|hạn đến)\s*(\d{4}-\d{2}-\d{2})/i);
  const dateMatched = toDateMatch
    ? toDateMatch[1] === draftDeparture
    : message.includes(draftDeparture);
  return dateMatched;
}

function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const key = String(issue.path[0] ?? "");
      const label = (KBTT_FIELD_LABELS[key] ?? key) || "Dữ liệu";
      return issue.message.toLocaleLowerCase("vi").includes(label.toLocaleLowerCase("vi"))
        ? issue.message
        : `${label}: ${issue.message}`;
    })
    .join("; ");
}

@Injectable()
export class KbttService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(KbttService.name);
  private readonly sessions = new Map<string, { ciphertext: string; session: KbttSession; profile?: KbttConnectionProfile }>();
  private readonly readPreparations = new Map<string, Promise<{ ready: true }>>();
  private readonly recoveries = new Map<string, { session: KbttSession; controller: AbortController; task?: Promise<void> }>();
  private readonly revocations = new Map<string, { controller: AbortController; task: Promise<void> }>();
  private readonly sessionEnded = new Set<(hotelId: string, session: KbttSession) => void>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly initialDeliveries = new Map<string, Promise<void>>();
  private readonly scheduledTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly cipher: KbttCredentialCipher,
    private readonly provider: KbttProviderClient,
    @Optional() private readonly occupantsReadService?: HotelStayOccupantsReadService,
    @Optional() private readonly telegramNotificationService?: TelegramNotificationService,
    @Optional() private readonly stayCheckInEventBus?: StayCheckInEventBus,
    @Optional() private readonly staySync?: KbttStaySyncService,
    @Optional() private readonly providerRead?: KbttProviderReadClient,
  ) {}

  async processStayLifecycleEvents() {
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true") return;
    await this.staySync?.run((hotelId, connection) => this.getOrRefreshSession(hotelId, connection),
      (hotelId, session) => this.disconnectFailedSession(hotelId, session));
  }

  private async sendInitialDeclaration(
    hotelId: string,
    declarationId: string,
    kind: "VIETNAMESE" | "FOREIGN",
    payload: unknown[],
    accessToken: string,
    csltId: string,
    requireEnabled = true,
  ): Promise<KbttSubmitOutcome> {
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
        process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true") {
      return { outcome: "BUSINESS_REJECTION", code: "DELIVERY_PAUSED", message: "Luồng gửi BCA đang tạm dừng." };
    }
    try {
      const current = await this.repository.findDeclarationForDispatch(hotelId, declarationId);
      const guest = Array.isArray(payload) ? payload[0] : null;
      if (!current || current.status !== "UNKNOWN" || current.submittedCsltId !== csltId || current.stay.checkedOutAt ||
          !["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes(current.stay.status) ||
          !guest || typeof guest !== "object" ||
          !("ngayDiDuKienStr" in guest) ||
          providerDay(guest.ngayDiDuKienStr) !== providerDay(composeKbttDraft(kind, (current.draftPayloadJson ?? {}) as Record<string, unknown>, { fullName: "", stay: current.stay }).ngayDiDuKienStr)) {
        return { outcome: "BUSINESS_REJECTION", code: "LOCAL_STATE_CHANGED",
          message: "Lượt lưu trú đã thay đổi; cần cập nhật hồ sơ trước khi gửi." };
      }
      const connection = await this.repository.find(hotelId);
      if (!connection || connection.status !== "CONNECTED" || connection.csltId !== csltId) {
        return { outcome: "BUSINESS_REJECTION", code: "CONNECTION_SCOPE_CHANGED",
          message: "Kết nối BCA đã thay đổi; cần xác nhận lại cơ sở trước khi gửi." };
      }
      if (requireEnabled && !connection.autoSubmitEnabled) {
        return { outcome: "BUSINESS_REJECTION", code: "DELIVERY_PAUSED", message: "Luồng gửi BCA đang tạm dừng." };
      }
      const outcome = this.staySync?.enabled()
        ? await this.staySync.sendInitial(hotelId, kind, payload, accessToken, declarationId, csltId, requireEnabled)
        : await this.provider.submitDeclaration(kind, payload, accessToken);
      if (outcome.outcome === "AMBIGUOUS" || /^(401|403|HTTP_401|HTTP_403|KBTT_AUTH_FAILED)$/.test(outcome.code)) {
        const failed = this.sessions.get(hotelId)?.session;
        if (failed?.AccessToken === accessToken) await this.disconnectFailedSession(hotelId, failed);
      }
      return outcome;
    } catch {
      const failed = this.sessions.get(hotelId)?.session;
      if (failed?.AccessToken === accessToken) {
        try { await this.disconnectFailedSession(hotelId, failed); }
        catch { this.logger.error("Could not persist BCA disconnection after delivery failure."); }
      }
      return { outcome: "AMBIGUOUS", code: "INTERRUPTED_DELIVERY", message: "Lần gửi chưa rõ kết quả; cần đối soát trước khi gửi tiếp." };
    }
  }

  async onModuleInit() {
    this.stayCheckInEventBus?.subscribe((event) => {
      void this.triggerCheckInBcaPush(event.hotelId, event.stayId).catch(() => {
        this.logger.error("Could not prepare background BCA check-in delivery.");
      });
    });

    const runs = await this.repository.findPendingScheduledAutoSubmitRuns();
    for (const run of runs) {
      const trigger = (run.summaryJson as any)?.trigger;
      if (
        trigger === "MANUAL_DELAYED" ||
        trigger === "CONTINUATION_30M" ||
        trigger === "ERROR_RETRY" ||
        (typeof trigger === "string" && trigger.startsWith("CONTINUATION_"))
      ) {
        this.armScheduledRun(run);
      }
    }
  }

  private withOccupantDefaults(
    citizenshipKind: 'VIETNAMESE' | 'FOREIGN', data: Record<string, unknown>,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository['findOccupant']>>> | ActiveStayOccupantRow,
  ): Record<string, unknown> {
    return composeKbttDraft(citizenshipKind, data, occupant);
  }

  private compactDraft(
    citizenshipKind: 'VIETNAMESE' | 'FOREIGN', data: Record<string, unknown>,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository['findOccupant']>>> | ActiveStayOccupantRow,
  ): Prisma.InputJsonValue {
    return compactKbttDeclarationDraft(citizenshipKind, data, occupant) as Prisma.InputJsonValue;
  }

  async get(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.view(await this.repository.find(hotelId));
  }

  async connect(userId: string, roleId: string, hotelId: string, credentials: KbttCredentials) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    this.cancelRecovery(hotelId);
    return this.serialize(hotelId, async () => {
      const encrypted = this.cipher.encrypt(hotelId, credentials);
      const session = await this.provider.login(credentials);
      const now = new Date();
      let connection: KbttHotelConnection;
      try {
        connection = await this.repository.save({
          hotelId,
          ...encrypted,
          ...kbttMetadata(session),
          autoSubmitEnabled: false,
          autoSubmitTime: null,
          status: "CONNECTED",
          lastCheckedAt: now,
          lastConnectedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
        });
      } catch (error) {
        await this.revoke(session.AccessToken);
        throw error;
      }
      const previous = this.sessions.get(hotelId)?.session;
      await this.attachSession(hotelId, connection, session);
      if (previous && previous.AccessToken !== session.AccessToken)
        await this.revoke(previous.AccessToken);
      return this.view(await this.repository.find(hotelId));
    });
  }

  async check(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const connection = await this.repository.find(hotelId);
      if (!connection)
        throw new NotFoundException({
          code: "KBTT_NOT_CONFIGURED",
          message: "Khách sạn chưa cấu hình kết nối KBTT.",
        });
      const cached = this.sessions.get(hotelId);
      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection);
      } catch (error) {
        const failure = stableKbttError(error);
        if (cached) await this.disconnectFailedSession(hotelId, cached.session);
        if (failure.stable && error && typeof error === "object") throw error;
        throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
      }
      let updated: KbttHotelConnection;
      try {
        updated = await this.repository.update(connection, {
          ...kbttMetadata(session),
          status: "CONNECTED",
          lastCheckedAt: new Date(),
          lastConnectedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        });
      } catch (error) {
        this.sessions.delete(hotelId);
        await this.revoke(session.AccessToken);
        throw error;
      }
      await this.attachSession(hotelId, updated, session);
      if (cached && cached.session.AccessToken !== session.AccessToken)
        await this.revoke(cached.session.AccessToken);
      return this.view(await this.repository.find(hotelId));
    });
  }

  async disconnect(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    this.cancelRecovery(hotelId);
    return this.serialize(hotelId, async () => {
      this.cancelRecovery(hotelId);
      const cached = this.sessions.get(hotelId);
      try { await this.repository.remove(hotelId); }
      finally {
        this.sessions.delete(hotelId);
        if (cached) { this.notifySessionEnded(hotelId, cached.session); void this.revoke(cached.session.AccessToken); }
      }
      return this.view(null);
    });
  }

  onModuleDestroy() {
    for (const recovery of this.recoveries.values()) recovery.controller.abort();
    this.recoveries.clear();
    for (const revocation of this.revocations.values()) revocation.controller.abort();
    this.revocations.clear();
    this.sessionEnded.clear();
    this.sessions.clear();
    this.readPreparations.clear();
    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();
  }

  private armScheduledRun(run: KbttAutoSubmitRun) {
    if (this.scheduledTimers.has(run.id)) return;
    const timer = setTimeout(
      () => {
        this.scheduledTimers.delete(run.id);
        void this.executeAutoSubmitForHotel(run.hotelId, run.scheduledFor, run.dryRun).catch(
          () => undefined,
        );
      },
      Math.max(0, run.scheduledFor.getTime() - Date.now()),
    );
    if (typeof timer.unref === "function") timer.unref();
    this.scheduledTimers.set(run.id, timer);
  }

  private async revoke(accessToken: string) {
    if (this.revocations.has(accessToken)) return;
    const controller = new AbortController();
    const task = this.provider.revoke(accessToken, controller.signal)
      .catch(() => { if (!controller.signal.aborted) this.logger.warn("BCA token revocation failed after bounded retries; local session is cleared."); })
      .finally(() => { if (this.revocations.get(accessToken)?.task === task) this.revocations.delete(accessToken); });
    this.revocations.set(accessToken, { controller, task });
  }

  onSessionEnded(listener: (hotelId: string, session: KbttSession) => void) {
    this.sessionEnded.add(listener);
    return () => { this.sessionEnded.delete(listener); };
  }

  private notifySessionEnded(hotelId: string, session: KbttSession) {
    for (const listener of this.sessionEnded) {
      try { listener(hotelId, session); }
      catch { this.logger.error("Could not clear a BCA dependent view; local session remains disabled."); }
    }
  }

  private cancelRecovery(hotelId: string) {
    this.recoveries.get(hotelId)?.controller.abort();
    this.recoveries.delete(hotelId);
  }

  private async attachSession(hotelId: string, connection: KbttHotelConnection, session: KbttSession) {
    const previous = this.sessions.get(hotelId);
    this.cancelRecovery(hotelId);
    if (previous && previous.session !== session) this.notifySessionEnded(hotelId, previous.session);
    const cached: { ciphertext: string; session: KbttSession; profile?: KbttConnectionProfile } = { ciphertext: connection.ciphertext, session };
    this.sessions.set(hotelId, cached);
    const profile = await this.readConnectionProfile(session);
    if (this.sessions.get(hotelId) !== cached) return;
    cached.profile = profile;
    if (profile.state === "FAILED") await this.recoverReadSession(hotelId, session, async (signal) => {
      const next = await this.readConnectionProfile(session, signal);
      if (this.sessions.get(hotelId) === cached && next.state === "READY") cached.profile = next;
      return next.state === "READY";
    }, profile.error?.code === "KBTT_AUTH_FAILED");
  }

  async disconnectFailedSession(hotelId: string, session: KbttSession) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session !== session) {
      if (cached?.session.AccessToken !== session.AccessToken) void this.revoke(session.AccessToken);
      return;
    }
    this.cancelRecovery(hotelId);
    this.sessions.delete(hotelId);
    this.notifySessionEnded(hotelId, session);
    try { await this.repository.removeIfCurrent(hotelId, cached.ciphertext); }
    finally { void this.revoke(session.AccessToken); }
  }

  async recoverReadSession(hotelId: string, session: KbttSession, retry: (signal: AbortSignal) => Promise<boolean>, authenticationFailed = false) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session !== session || this.recoveries.has(hotelId)) return;
    if (authenticationFailed) { await this.disconnectFailedSession(hotelId, session); return; }
    const recovery: { session: KbttSession; controller: AbortController; task?: Promise<void> } = { session, controller: new AbortController() };
    this.recoveries.set(hotelId, recovery);
    try {
      const connection = await this.repository.find(hotelId);
      if (!connection || connection.ciphertext !== cached.ciphertext || connection.status !== "CONNECTED") {
        await this.disconnectFailedSession(hotelId, session); return;
      }
      await this.repository.update(connection, { status: "DISCONNECTED", lastCheckedAt: new Date(),
        lastErrorCode: "KBTT_RETRY_PENDING", lastErrorMessage: "Mất kết nối BCA. Hệ thống đang thử lại." });
      recovery.task = (async () => {
        try {
          for (let attempt = 0; attempt < KBTT_READ_RETRIES; attempt++) {
            await waitForKbttRetry(recovery.controller.signal);
            if (this.sessions.get(hotelId) !== cached) return;
            const current = await this.repository.find(hotelId);
            if (!current || current.status !== "DISCONNECTED" || current.ciphertext !== cached.ciphertext || current.lastErrorCode !== "KBTT_RETRY_PENDING") {
              await this.disconnectFailedSession(hotelId, session); return;
            }
            let recovered = false;
            try { recovered = await withKbttDeadline(retry, recovery.controller.signal); }
            catch { if (recovery.controller.signal.aborted) return; }
            if (recovery.controller.signal.aborted || this.sessions.get(hotelId) !== cached) return;
            if (recovered) {
              const latest = await this.repository.find(hotelId);
              if (!latest || latest.status !== "DISCONNECTED" || latest.ciphertext !== cached.ciphertext || latest.lastErrorCode !== "KBTT_RETRY_PENDING") return;
              await this.repository.update(latest, { status: "CONNECTED", lastCheckedAt: new Date(), lastErrorCode: null, lastErrorMessage: null });
              return;
            }
          }
          await this.disconnectFailedSession(hotelId, session);
        } catch {
          if (!recovery.controller.signal.aborted) {
            try { await this.disconnectFailedSession(hotelId, session); }
            catch { this.logger.error("Could not persist BCA disconnection; local tokens have been cleared."); }
          }
        } finally { if (this.recoveries.get(hotelId) === recovery) this.recoveries.delete(hotelId); }
      })();
    } catch (error) {
      await this.disconnectFailedSession(hotelId, session);
      throw error;
    }
  }

  private async serialize<Result>(hotelId: string, action: () => Promise<Result>): Promise<Result> {
    // ponytail: per-process ordering; database compare-and-swap fences stale checks across replicas.
    const pending = (this.operations.get(hotelId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    this.operations.set(hotelId, pending);
    try {
      return await pending;
    } finally {
      if (this.operations.get(hotelId) === pending) this.operations.delete(hotelId);
    }
  }

  async listDeclarations(
    userId: string,
    roleId: string,
    hotelId: string,
    pagination?: Partial<KbttPaginationQuery>,
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = (await this.access.resolveRoomScope?.(userId, roleId, hotelId)) ?? {
      hotel: {} as any,
      allowedRoomId: null,
      mode: "HOTEL_WIDE",
    };
    let occupants = (await this.occupantsReadService?.getActiveStayOccupants(hotelId, pagination?.stayIds ? { stayIds: pagination.stayIds } : undefined)) ?? [];
    if (scope.mode === "ROOM_EXCLUSIVE") {
      occupants = occupants.filter((o) => o.roomId === scope.allowedRoomId);
    }
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 50));
    const occupantIds = occupants.map((o) => o.id);
    const declarations = await this.repository.findDeclarationsByHotel(hotelId, occupantIds);

    const declarationsByOccupant = new Map<string, KbttGuestDeclaration>();
    for (const decl of declarations) {
      if (!declarationsByOccupant.has(decl.occupantId)) {
        declarationsByOccupant.set(decl.occupantId, decl);
      }
    }

    const items = occupants.map((occupant) => {
      const decl = declarationsByOccupant.get(occupant.id) ?? null;
      const draft = decl ? this.declarationDraft(decl, occupant) : this.withOccupantDefaults(occupant.citizenshipKind ?? "VIETNAMESE", {}, occupant);
      const classification = decl?.declarationKind ?? occupant.citizenshipKind ?? null;
      const derivedStatus: KbttDerivedStatus = decl ? decl.status : "MISSING_PROFILE";

      return {
        occupantId: occupant.id,
        stayId: occupant.stayId,
        hotelId: occupant.hotelId,
        roomId: occupant.roomId,
        roomNumber: occupant.roomNumber,
        isPrimary: occupant.isPrimary,
        fullName: typeof draft.hoTen === "string" ? draft.hoTen : occupant.fullName,
        phone: occupant.phone,
        identityNumber:
          typeof draft.soGiayTo === "string"
            ? draft.soGiayTo
            : typeof draft.soHoChieu === "string"
              ? draft.soHoChieu
              : occupant.identityNumber,
        dateOfBirth:
          typeof draft.ngayThangNamSinhStr === "string"
            ? draft.ngayThangNamSinhStr
            : /^\d{4}$/.test(occupant.dateOfBirth?.trim() ?? "")
              ? occupant.dateOfBirth?.trim() ?? null
              : (normalizeDateStringToIso(occupant.dateOfBirth) ?? occupant.dateOfBirth),
        gender:
          draft.gioiTinh === "M" || draft.gioiTinh === "F"
            ? draft.gioiTinh
            : ["M", "MALE", "NAM", "MALE [M]"].includes(occupant.gender?.trim().toUpperCase() ?? "")
              ? "M"
              : ["F", "FEMALE", "NỮ", "NU", "FEMALE [F]"].includes(
                    occupant.gender?.trim().toUpperCase() ?? "",
                  )
                ? "F"
                : null,
        nationality:
          classification === "VIETNAMESE"
            ? "VNM"
            : typeof draft.quocTich === "string" && draft.quocTich.trim()
              ? draft.quocTich.trim()
              : occupant.nationality?.trim()
                ? occupant.nationality.trim()
                : (typeof draft.soGiayTo === "string" ? draft.soGiayTo : occupant.identityNumber) &&
                    /^\d{9,12}$/.test(
                      (typeof draft.soGiayTo === "string"
                        ? draft.soGiayTo
                        : (occupant.identityNumber ?? "")
                      ).trim(),
                    )
                  ? "VNM"
                  : null,
        documentType:
          classification === "FOREIGN"
            ? 4
            : typeof draft.loaiGiayTo === "number"
              ? draft.loaiGiayTo
              : /^\d{12}$/.test(
                    (typeof draft.soGiayTo === "string"
                      ? draft.soGiayTo
                      : (occupant.identityNumber ?? "")
                    ).trim(),
                  )
                ? 1
                : /^\d{9}$/.test(
                      (typeof draft.soGiayTo === "string"
                        ? draft.soGiayTo
                        : (occupant.identityNumber ?? "")
                      ).trim(),
                    )
                  ? 2
                  : /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(
                        (typeof draft.soHoChieu === "string"
                          ? draft.soHoChieu
                          : typeof draft.soGiayTo === "string"
                            ? draft.soGiayTo
                            : (occupant.identityNumber ?? "")
                        ).trim(),
                      )
                    ? 4
                    : null,
        residencePlace: occupant.residencePlace,
        citizenshipKind:
          classification ??
          (/^\d{9,12}$/.test((occupant.identityNumber ?? "").trim())
            ? "VIETNAMESE"
            : /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test((occupant.identityNumber ?? "").trim())
              ? "FOREIGN"
              : null),
        derivedStatus,
        stayStatus: occupant.stayStatus,
        reservationCode: occupant.reservationCode,
        checkedInAt: occupant.checkedInAt ? occupant.checkedInAt.toISOString() : null,
        plannedCheckInAt: occupant.plannedCheckInAt.toISOString(),
        plannedCheckOutAt: occupant.plannedCheckOutAt.toISOString(),
        declaration: decl
          ? {
              id: decl.id,
              revision: decl.revision,
              status: decl.status,
              declarationKind: decl.declarationKind,
              providerCode: decl.providerCode,
              providerMessage: decl.status === "READY" && decl.providerCode === "LOCAL_QUEUED"
                ? "Hồ sơ chưa được gửi BCA. Kiểm tra dữ liệu trước khi gửi." : decl.providerMessage,
              submittedAt: decl.submittedAt ? decl.submittedAt.toISOString() : null,
              createdAt: decl.createdAt.toISOString(),
              updatedAt: decl.updatedAt.toISOString(),
            }
          : null,
      };
    });

    const query = pagination?.q?.trim().toLocaleLowerCase("vi") ?? "";
    const checkInBounds = pagination?.checkInDate ? getDayBounds(pagination.checkInDate, VIETNAM_TIME_ZONE) : null;
    const localFailureCodes = new Set(["LOCAL_VALIDATION","LOCAL_STATE_CHANGED","CONNECTION_SCOPE_CHANGED","DELIVERY_BUSY","RECONCILIATION_REQUIRED","LOCAL_PREPARATION","LOCAL_STAY_ENDED","DELIVERY_PAUSED","KBTT_NOT_CONFIGURED","KBTT_AUTH_FAILED","KBTT_PROVIDER_UNAVAILABLE"]);
    const filteredItems = items.filter((item) => {
      if (query && ![item.roomNumber, item.fullName, item.identityNumber]
        .some((value) => value?.toLocaleLowerCase("vi").includes(query))) return false;
      if (pagination?.nationality === "VNM" && item.citizenshipKind !== "VIETNAMESE" && item.nationality !== "VNM") return false;
      if (pagination?.nationality === "FOREIGN" && (item.citizenshipKind !== "FOREIGN" || item.nationality === "VNM")) return false;
      const arrival = new Date(item.checkedInAt ?? item.plannedCheckInAt);
      if (checkInBounds && (arrival < checkInBounds.start || arrival >= checkInBounds.end)) return false;
      if (pagination?.status) {
        const declaration = item.declaration;
        const status = declaration?.status;
        const displayStatus = status === "READY" && declaration?.providerCode === "LOCAL_QUEUED" ? "LOCAL_ERROR"
          : status === "FAILED" ? localFailureCodes.has(declaration?.providerCode ?? "") ? "LOCAL_ERROR" : "REJECTED"
            : status === "SUBMITTED" || status === "UNKNOWN" || status === "CANCELLED" ? status : "UNSENT";
        if (displayStatus !== pagination.status) return false;
      }
      return true;
    });

    return {
      items: filteredItems.slice((page - 1) * limit, page * limit),
      delivery: await this.deliverySummary(hotelId,
        scope.mode === "ROOM_EXCLUSIVE" ? scope.allowedRoomId ?? "" : null),
      total: filteredItems.length,
      totalPages: Math.max(1, Math.ceil(filteredItems.length / limit)),
      page,
      limit,
    };
  }

  private async deliverySummary(hotelId: string, allowedRoomId: string | null) {
    const [connection, snapshot] = await Promise.all([
      this.repository.find(hotelId),
      this.repository.getDeliverySnapshot(hotelId, allowedRoomId),
    ]);
    const live = process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED === "true" &&
      process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH !== "true";
    const localIssueMessages: Record<string, string> = {
      LOCAL_STAY_ENDED: "Khách đã kết thúc lưu trú trước khi hồ sơ được gửi; cần đối soát.",
      DELIVERY_PAUSED: "Luồng gửi BCA đang tạm dừng; hồ sơ chưa được gửi.",
      KBTT_NOT_CONFIGURED: "Khách sạn chưa cấu hình kết nối BCA; hồ sơ chưa được gửi.",
      KBTT_AUTH_FAILED: "Cần đăng nhập lại kết nối BCA trước khi gửi hồ sơ.",
      KBTT_PROVIDER_UNAVAILABLE: "Chưa thể kết nối BCA để gửi hồ sơ.",
      LOCAL_QUEUED: "Hồ sơ chưa được gửi BCA. Kiểm tra dữ liệu trước khi gửi.",
      LOCAL_STATE_CHANGED: "Lượt lưu trú đã thay đổi; cần kiểm tra hồ sơ trước khi gửi.",
      DELIVERY_BUSY: "Chưa thể bắt đầu lần gửi; cần kiểm tra trước khi gửi lại.",
      RECONCILIATION_REQUIRED: "Có lần gửi trước chưa rõ kết quả; cần đối soát trước khi gửi tiếp.",
      DECLARATION_CSLT_REQUIRED: "Hồ sơ gốc chưa xác định được cơ sở BCA; cần đối soát trước khi cập nhật.",
      CONNECTION_REQUIRED: "Cần khôi phục đúng kết nối BCA của cơ sở đã khai báo.",
      CONNECTION_SCOPE_CHANGED: "Cần khôi phục đúng kết nối BCA của cơ sở đã khai báo.",
      RESIDENCE_VALIDITY_REQUIRED: "Cần kiểm tra thời hạn tạm trú của khách trước khi gia hạn.",
      DOMESTIC_30_DAY_LIMIT: "Ngày gia hạn vượt giới hạn 30 ngày tính từ ngày đến.",
      LOCAL_VALIDATION: "Cần kiểm tra thông tin khai báo và kết nối BCA.",
      LOCAL_PREPARATION: "Cần kiểm tra thông tin khai báo và kết nối BCA.",
    };
    return {
      mode: "BACKGROUND" as const,
      state: !connection ? "NOT_CONFIGURED" as const
        : connection.status === "CONNECTED" && connection.autoSubmitEnabled && live ? "RUNNING" as const : "PAUSED" as const,
      lifecycleEnabled: process.env.KBTT_STAY_LIFECYCLE_ENABLED === "true",
      pendingCount: snapshot.pendingCount,
      reviewCount: snapshot.reviewCount,
      lastSucceededAt: snapshot.lastSucceededAt?.toISOString() ?? null,
      recentIssues: snapshot.recentIssues.map((issue) => ({
        id: issue.id, kind: issue.kind, status: issue.status,
        roomNumber: issue.roomNumber, fullName: issue.fullName,
        updatedAt: new Date(issue.updatedAt).toISOString(),
        message: issue.status === "UNKNOWN"
          ? "Lần gửi chưa rõ kết quả; cần đối soát trước khi gửi tiếp."
          : localIssueMessages[issue.providerCode ?? ""] ?? (issue.status === "BLOCKED"
            ? "Hồ sơ cần được kiểm tra trước khi cập nhật BCA."
            : "BCA chưa chấp nhận hồ sơ; cần kiểm tra và đối soát."),
      })),
    };
  }

  async getDailyMovements(
    userId: string,
    roleId: string,
    hotelId: string,
    query: KbttDailyMovementsQuery,
  ): Promise<KbttDailyMovementsResponse> {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));

    if (scope.mode === "ROOM_EXCLUSIVE" && !scope.allowedRoomId) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
      };
    }

    const { start, end } = getDayBounds(query.date, VIETNAM_TIME_ZONE);
    const allowedRoomId = scope.mode === "ROOM_EXCLUSIVE" ? scope.allowedRoomId : null;

    if (!this.occupantsReadService) {
      throw new Error("HotelStayOccupantsReadService is unavailable");
    }

    const result = await this.occupantsReadService.getDailyMovements(hotelId, {
      kind: query.kind,
      start,
      end,
      q: query.q,
      allowedRoomId,
      page,
      limit,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    const items: KbttDailyMovementItem[] = result.items.map((item) => ({
      kind: item.kind,
      reservationId: item.reservationId,
      stayId: item.stayId,
      reservationCode: item.reservationCode,
      groupCode: item.groupCode,
      roomId: item.roomId,
      roomNumber: item.roomNumber,
      guestDisplayName: item.guestDisplayName,
      guestPhone: item.guestPhone,
      status: item.status,
      plannedCheckInAt: item.plannedCheckInAt
        ? item.plannedCheckInAt instanceof Date
          ? item.plannedCheckInAt.toISOString()
          : item.plannedCheckInAt
        : null,
      plannedCheckOutAt: item.plannedCheckOutAt
        ? item.plannedCheckOutAt instanceof Date
          ? item.plannedCheckOutAt.toISOString()
          : item.plannedCheckOutAt
        : null,
      actualCheckInAt: item.checkedInAt
        ? item.checkedInAt instanceof Date
          ? item.checkedInAt.toISOString()
          : item.checkedInAt
        : null,
      actualCheckOutAt: item.checkedOutAt
        ? item.checkedOutAt instanceof Date
          ? item.checkedOutAt.toISOString()
          : item.checkedOutAt
        : null,
      occupantCount: item.occupantCount,
      canCheckIn: item.canCheckIn,
      canCheckOut: item.canCheckOut,
    }));

    return {
      items,
      total: result.total,
      page,
      limit,
      totalPages,
    };
  }

  async getDeclaration(userId: string, roleId: string, hotelId: string, occupantId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = (await this.access.resolveRoomScope?.(userId, roleId, hotelId)) ?? {
      hotel: {} as any,
      allowedRoomId: null,
      mode: "HOTEL_WIDE",
    };
    const occupant = await this.repository.findOccupant(hotelId, occupantId);
    if (!occupant) {
      throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
    }
    this.access.assertRoomAccess?.(scope, occupant.stay?.roomId);
    const decl = await this.repository.findLatestDeclaration(hotelId, occupantId);
    return {
      occupant: {
        id: occupant.id,
        stayId: occupant.stayId,
        hotelId: occupant.hotelId,
        fullName: occupant.fullName,
        phone: occupant.phone,
        identityNumber: occupant.identityNumber,
        dateOfBirth: normalizeDateStringToIso(occupant.dateOfBirth) ?? occupant.dateOfBirth,
        gender: occupant.gender,
        nationality: occupant.nationality,
        residencePlace: occupant.residencePlace,
        isPrimary: occupant.isPrimary,
        citizenshipKind: decl?.declarationKind ?? occupant.citizenshipKind ?? null,
      },
      declaration: decl ? this.viewDeclaration(decl, occupant) : null,
      derivedStatus: decl ? (decl.status as KbttDerivedStatus) : "MISSING_PROFILE",
    };
  }

  async saveDraft(
    userId: string,
    roleId: string,
    hotelId: string,
    occupantId: string,
    body: unknown,
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = (await this.access.resolveRoomScope?.(userId, roleId, hotelId)) ?? {
      hotel: {} as any,
      allowedRoomId: null,
      mode: "HOTEL_WIDE",
    };
    const occupant = await this.repository.findOccupant(hotelId, occupantId);
    if (!occupant) {
      throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
    }
    this.access.assertRoomAccess?.(scope, occupant.stay?.roomId);

    const { citizenshipKind, data } = parseDraftPayload(body);

    const existing = await this.repository.findLatestDeclaration(hotelId, occupantId);
    assertKbttDeclarationMutable(existing?.status);

    if (existing?.status === "SUBMITTED") {
      throw new ConflictException({
        code: "KBTT_ALREADY_SUBMITTED",
        message: "Hồ sơ của lần lưu trú này đã gửi BCA và tạm thời không thể chỉnh sửa.",
      });
    }

    const previousData =
      existing?.declarationKind === citizenshipKind &&
      existing.draftPayloadJson &&
      typeof existing.draftPayloadJson === "object" &&
      !Array.isArray(existing.draftPayloadJson)
        ? (existing.draftPayloadJson as Record<string, unknown>)
        : {};
    const draftData = this.withOccupantDefaults(
      citizenshipKind,
      markKbttDeclarationDates({ ...previousData, ...data }, data),
      occupant,
    );

    const identityNumber = citizenshipKind === 'VIETNAMESE' ? draftData.soGiayTo : draftData.soHoChieu;
    const arrival = draftData.ngayDenCsltStr;
    const departure = draftData.ngayDiDuKienStr;
    if (typeof arrival !== "string" || typeof departure !== "string" || !isValidCalendarDateTime(arrival) || !isValidCalendarDateTime(departure) || departure < arrival) {
      throw new BadRequestException({ code: "KBTT_PAYLOAD_INVALID", message: "Ngày nhận/trả không hợp lệ; ngày trả phải từ ngày nhận trở đi." });
    }
    const profile = {
      citizenshipKind,
      identityNumber: typeof identityNumber === 'string' ? identityNumber : undefined,
      // Provider permits longer names than the PMS profile; retain those losslessly as BCA deltas.
      fullName: typeof draftData.hoTen === 'string' && draftData.hoTen.length <= 120 ? draftData.hoTen : undefined,
      gender: typeof draftData.gioiTinh === 'string' ? draftData.gioiTinh : undefined,
      nationality: typeof draftData.quocTich === 'string' ? draftData.quocTich : undefined,
      dateOfBirth: typeof draftData.ngayThangNamSinhStr === 'string'
        ? citizenshipKind === 'FOREIGN' && draftData.loaiNgayThangNamSinh === 'Y'
          ? draftData.ngayThangNamSinhStr.slice(0, 4) : draftData.ngayThangNamSinhStr : undefined,
      phone: Object.prototype.hasOwnProperty.call(data, 'soDienThoai')
        ? typeof data.soDienThoai === 'string' || data.soDienThoai === null ? data.soDienThoai : undefined : undefined,
      residencePlace: data.diaChi === null ? null : typeof draftData.diaChi === 'string' ? draftData.diaChi : undefined,
    };
    const canonical = { ...occupant, ...Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined)) };
    const savedDeclaration = await this.repository.saveCanonicalDraft({
      hotelId, stayId: occupant.stayId, occupantId, expectedOccupantUpdatedAt: occupant.updatedAt,
      existing: existing ? { id: existing.id, version: existing.version } : null, declarationKind: citizenshipKind,
      profile, draftPayloadJson: this.compactDraft(citizenshipKind, draftData, canonical),
    });
    return this.viewDeclaration(savedDeclaration, canonical);
  }

  /** Read-only integration callers must never log in or refresh as a GET side effect. */
  getCachedReadSession(hotelId: string, connection: KbttHotelConnection): KbttSession | null {
    const cached = this.sessions.get(hotelId);
    if (this.recoveries.has(hotelId)) return null;
    if (!cached || connection.status !== "CONNECTED" || cached.ciphertext !== connection.ciphertext ||
        cached.session.CsltId !== connection.csltId || cached.session.Exp * 1000 <= Date.now() + 5_000) return null;
    return cached.session;
  }

  /** Explicit POST preparation shared by front-desk entry and its connection action. */
  async ensureReconciliationSession(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    if (this.recoveries.has(hotelId)) throw kbttAuthFailed("BCA đang tạm ngắt kết nối và thử lại. Vui lòng chờ.");
    const running = this.readPreparations.get(hotelId);
    if (running) return running;
    const preparation = this.serialize(hotelId, async () => {
      const connection = await this.repository.find(hotelId);
      if (!connection) throw new NotFoundException({ code: "KBTT_NOT_CONFIGURED", message: "Khách sạn chưa cấu hình kết nối BCA." });
      if (connection.status !== "CONNECTED") throw kbttAuthFailed("Cần đăng nhập lại BCA trước khi đối soát.");
      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection, false);
        if (session.Exp * 1000 <= Date.now() + 5_000) throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
      } catch (error) {
        const failure = stableKbttError(error);
        const failed = this.sessions.get(hotelId)?.session;
        if (failed) await this.disconnectFailedSession(hotelId, failed);
        if (failure.stable) throw error;
        throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
      }
      const current = await this.repository.find(hotelId);
      if (!current || current.ciphertext !== connection.ciphertext || current.csltId !== session.CsltId) {
        if (this.sessions.get(hotelId)?.session === session) this.sessions.delete(hotelId);
        throw new ConflictException("Kết nối BCA đã thay đổi. Vui lòng thử lại.");
      }
      await this.repository.update(current, {
        ...kbttMetadata(session), status: "CONNECTED", lastCheckedAt: new Date(),
        lastErrorCode: null, lastErrorMessage: null,
      });
      return { ready: true as const };
    });
    this.readPreparations.set(hotelId, preparation);
    try { return await preparation; }
    finally { if (this.readPreparations.get(hotelId) === preparation) this.readPreparations.delete(hotelId); }
  }

  expireRejectedReadSession(hotelId: string, session: KbttSession) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session === session) this.sessions.set(hotelId, { ...cached, session: { ...session, Exp: 0 } });
  }

  private async getOrRefreshSession(
    hotelId: string,
    connection: KbttHotelConnection,
    revokePrevious = true,
  ): Promise<KbttSession> {
    if (this.recoveries.has(hotelId)) throw kbttAuthFailed("BCA đang tạm ngắt kết nối và thử lại.");
    const current = await this.repository.find(hotelId);
    if (!current || current.ciphertext !== connection.ciphertext || current.csltId !== connection.csltId) {
      throw new ConflictException("Kết nối BCA đã thay đổi. Vui lòng kết nối lại.");
    }
    if (current.status !== "CONNECTED") throw kbttAuthFailed("Cần đăng nhập lại BCA trước khi đồng bộ.");
    const cached = this.sessions.get(hotelId);
    let session: KbttSession;

    if (
      cached?.ciphertext === connection.ciphertext &&
      cached.session.Exp * 1000 > Date.now() + 60_000
    ) {
      if (cached.session.CsltId !== connection.csltId) {
        this.sessions.delete(hotelId);
        throw new ConflictException("Phiên BCA không thuộc cơ sở đã kết nối; cần xác nhận lại kết nối.");
      }
      return cached.session;
    }

    if (cached?.ciphertext === connection.ciphertext) {
      try {
        session = await this.provider.refresh(cached.session.RefreshToken);
      } catch (error) {
        await this.disconnectFailedSession(hotelId, cached.session);
        throw error;
      }
    } else {
      throw kbttAuthFailed("Phiên BCA đã kết thúc. Vui lòng đăng nhập lại.");
    }

    if (session.CsltId !== connection.csltId) {
      this.sessions.delete(hotelId);
      throw new ConflictException("Phiên BCA không thuộc cơ sở đã kết nối; cần xác nhận lại kết nối.");
    }
    const latest = await this.repository.find(hotelId);
    if (!latest || latest.status !== "CONNECTED" || latest.ciphertext !== connection.ciphertext || latest.csltId !== session.CsltId) {
      if (this.sessions.get(hotelId) === cached) this.sessions.delete(hotelId);
      await this.revoke(session.AccessToken);
      throw new ConflictException("Kết nối BCA đã thay đổi trong lúc cập nhật phiên. Vui lòng kết nối lại.");
    }
    this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session,
      profile: cached?.ciphertext === connection.ciphertext && cached.session.CsltId === session.CsltId ? cached.profile : undefined });
    if (revokePrevious && cached && cached.session.AccessToken !== session.AccessToken) {
      await this.revoke(cached.session.AccessToken);
    }
    return session;
  }

  async submit(userId: string, roleId: string, hotelId: string, occupantId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const scope = (await this.access.resolveRoomScope?.(userId, roleId, hotelId)) ?? {
      hotel: {} as any,
      allowedRoomId: null,
      mode: "HOTEL_WIDE",
    };
    return this.serialize(`initial:${hotelId}`, async () => {
      const occupant = await this.repository.findOccupant(hotelId, occupantId);
      if (!occupant) {
        throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
      }
      this.access.assertRoomAccess?.(scope, occupant.stay?.roomId);
      return this.beginInitialDelivery(hotelId, occupantId, occupant);
    });
  }

  private async beginInitialDelivery(
    hotelId: string,
    occupantId: string,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>,
  ) {
    const latest = await this.repository.findLatestDeclaration(hotelId, occupantId);
    if (latest?.status === "UNKNOWN" && this.initialDeliveries.has(latest.id)) return this.viewDeclaration(latest, occupant);
    const { preparedDeclaration, declarationKind, payload } =
      await this.prepareInitialDeclaration(hotelId, occupantId, occupant);
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const connection = await this.repository.find(hotelId);
    const paused = process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
      process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true" || !connection?.autoSubmitEnabled;
    if (!connection || paused) {
      const failed = await this.repository.updateDeclaration({
        id: preparedDeclaration.id, hotelId, expectedVersion: preparedDeclaration.version,
        data: { status: "FAILED", providerCode: connection ? "DELIVERY_PAUSED" : "KBTT_NOT_CONFIGURED",
          providerMessage: connection ? "Luồng gửi BCA đang tạm dừng." : "Khách sạn chưa cấu hình kết nối BCA.",
          submittedAt: null, submittedPayloadFingerprint: fingerprint },
      });
      return this.viewDeclaration(failed, occupant);
    }
    const claimed = await this.repository.updateDeclaration({
      id: preparedDeclaration.id, hotelId, expectedVersion: preparedDeclaration.version,
      data: { status: "UNKNOWN", providerCode: null, providerMessage: null,
        providerResponseJson: Prisma.JsonNull, submittedAt: null,
        submittedPayloadJson: payload, submittedPayloadFingerprint: fingerprint,
        submittedCsltId: connection.csltId },
    });
    const delivery = this.serialize(`delivery:${connection.csltId}`, () =>
      this.deliverInitialDeclaration(hotelId, claimed, declarationKind, payload, fingerprint))
      .catch(async () => {
        try {
          const current = await this.repository.findLatestDeclaration(hotelId, occupantId);
          if (current?.id === claimed.id && current.version === claimed.version && current.status === "UNKNOWN") {
            await this.repository.updateDeclaration({
              id: current.id, hotelId, expectedVersion: current.version,
              data: { status: "UNKNOWN", providerCode: "INTERRUPTED_DELIVERY",
                providerMessage: "Lần gửi chưa rõ kết quả; cần đối soát trước khi gửi tiếp.", submittedAt: null },
            });
          }
        } catch {
          // The persisted UNKNOWN record already fences an unresolved delivery.
          this.logger.error("Could not persist BCA delivery result; the in-flight record requires reconciliation.");
        }
      })
      .finally(() => this.initialDeliveries.delete(claimed.id));
    this.initialDeliveries.set(claimed.id, delivery);
    return this.viewDeclaration(claimed, occupant);
  }

  private async deliverInitialDeclaration(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    kind: "VIETNAMESE" | "FOREIGN",
    payload: unknown[],
    fingerprint: string,
  ): Promise<void> {
    const connection = await this.repository.find(hotelId);
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
        process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true" || !connection?.autoSubmitEnabled) {
      await this.persistDeclarationFailed(hotelId, declaration, fingerprint, {
        outcome: "BUSINESS_REJECTION", code: "DELIVERY_PAUSED", message: "Luồng gửi BCA đang tạm dừng.",
      });
      return;
    }
    let session: KbttSession;
    try {
      session = await this.serialize(`session:${hotelId}`, () => this.getOrRefreshSession(hotelId, connection));
    } catch (error) {
      const issue = stableKbttError(error);
      await this.persistDeclarationFailed(hotelId, declaration, fingerprint, {
        outcome: "BUSINESS_REJECTION", code: issue.code, message: issue.message,
      });
      return;
    }
    const outcome = await this.sendInitialDeclaration(
      hotelId, declaration.id, kind, payload, session.AccessToken, session.CsltId,
    );
    if (outcome.outcome === "SUCCESS") {
      await this.persistDeclarationSubmitted(hotelId, declaration, payload, fingerprint, outcome);
    } else if (outcome.outcome === "BUSINESS_REJECTION") {
      await this.persistDeclarationFailed(hotelId, declaration, fingerprint, outcome);
    } else {
      await this.repository.updateDeclaration({
        id: declaration.id, hotelId, expectedVersion: declaration.version,
        data: { status: "UNKNOWN", providerCode: outcome.code.slice(0, 32),
          providerMessage: sanitizeProviderText(outcome.message || "Lần gửi chưa rõ kết quả; cần đối soát."),
          providerResponseJson: outcome.data ? sanitizeProviderData(outcome.data) as Prisma.InputJsonValue : Prisma.JsonNull,
          submittedAt: null },
      });
    }
  }

  private async prepareInitialDeclaration(
    hotelId: string,
    occupantId: string,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>,
  ) {
    if (occupant.stay.checkedOutAt ||
        !["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes(occupant.stay.status)) {
      throw new ConflictException("Chỉ gửi khai báo ban đầu cho khách đang thực tế lưu trú.");
    }

    const declaration = await this.repository.findLatestDeclaration(hotelId, occupantId);
    assertKbttDeclarationMutable(declaration?.status);
    if (declaration?.status === "SUBMITTED") {
      throw new ConflictException({
        code: "KBTT_ALREADY_SUBMITTED",
        message: "Hồ sơ của lần lưu trú này đã gửi BCA và tạm thời không thể gửi lại.",
      });
    }

    const declarationKind = declaration?.declarationKind ?? occupant.citizenshipKind;
    if (!declarationKind) {
      throw new BadRequestException({
        code: "KBTT_PAYLOAD_INVALID",
        message: "Phân loại quốc tịch: chưa xác định khách Việt Nam hay người nước ngoài.",
      });
    }

    const draft = this.withOccupantDefaults(
      declarationKind,
      (declaration?.draftPayloadJson ?? {}) as Record<string, unknown>,
      occupant,
    );
    const parsed =
      declarationKind === "VIETNAMESE"
        ? kbttVietnameseReadySchema.safeParse(draft)
        : kbttForeignReadySchema.safeParse(draft);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "KBTT_PAYLOAD_INVALID",
        message: formatValidationIssues(parsed.error.issues),
      });
    }
    const identityNumber =
      "soGiayTo" in parsed.data ? parsed.data.soGiayTo : parsed.data.soHoChieu;
    const conflict = await this.repository.findActiveSubmittedOccupantByIdentity(
      hotelId,
      identityNumber,
      occupantId,
    );
    if (conflict) {
      throw new ConflictException({
        code: "KBTT_ACTIVE_IDENTITY_CONFLICT",
        message: `Số giấy tờ này đã có hồ sơ gửi BCA đang lưu trú tại phòng ${conflict.stay.room.roomNumber}. Checkout hồ sơ cũ trước khi gửi khách này.`,
      });
    }
    const preparedDeclaration = declaration
      ? await this.repository.updateDeclaration({
          id: declaration.id,
          hotelId,
          expectedVersion: declaration.version,
          data: { draftPayloadJson: this.compactDraft(declarationKind, parsed.data, occupant) },
        })
      : await this.repository.createDeclaration({
          hotelId,
          stayId: occupant.stayId,
          occupantId,
          declarationKind,
          status: "DRAFT",
          draftPayloadJson: this.compactDraft(declarationKind, parsed.data, occupant),
        });

    return { preparedDeclaration, declarationKind, payload: [parsed.data], draft: parsed.data };
  }

  private declarationDraft(
    decl: KbttGuestDeclaration,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository['findOccupant']>>> | ActiveStayOccupantRow,
  ): Record<string, unknown> {
    if (['SUBMITTED', 'UNKNOWN'].includes(decl.status) && Array.isArray(decl.submittedPayloadJson)) {
      const snapshot = decl.submittedPayloadJson[0];
      if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) return { ...snapshot };
    }
    return this.withOccupantDefaults(decl.declarationKind, (decl.draftPayloadJson ?? {}) as Record<string, unknown>, occupant);
  }

  private viewDeclaration(
    decl: KbttGuestDeclaration,
    occupant?: NonNullable<Awaited<ReturnType<KbttRepository['findOccupant']>>> | ActiveStayOccupantRow,
  ) {
    return {
      id: decl.id,
      hotelId: decl.hotelId,
      stayId: decl.stayId,
      occupantId: decl.occupantId,
      declarationKind: decl.declarationKind,
      revision: decl.revision,
      status: decl.status,
      draftPayload: occupant ? this.declarationDraft(decl, occupant)
        : decl.draftPayloadJson && typeof decl.draftPayloadJson === 'object' && !Array.isArray(decl.draftPayloadJson)
          ? decl.draftPayloadJson as Record<string, unknown> : null,
      providerCode: decl.providerCode,
      providerMessage: decl.providerMessage,
      submittedAt: decl.submittedAt ? decl.submittedAt.toISOString() : null,
      version: decl.version,
      createdAt: decl.createdAt.toISOString(),
      updatedAt: decl.updatedAt.toISOString(),
    };
  }

  private async readConnectionProfile(session: KbttSession, signal?: AbortSignal): Promise<KbttConnectionProfile> {
    if (!this.providerRead) return { state: "NOT_LOADED", accommodation: null, fetchedAt: null, error: null };
    try {
      const { data } = signal ? await this.providerRead.getAccommodation(session.AccessToken, signal)
        : await withKbttDeadline((bounded) => this.providerRead!.getAccommodation(session.AccessToken, bounded), undefined, 8_000);
      if (!Number.isSafeInteger(data.id) || String(data.id) !== session.CsltId) {
        return { state: "FAILED", accommodation: null, fetchedAt: null,
          error: { code: "KBTT_PROFILE_SCOPE_MISMATCH", message: "Thông tin cơ sở BCA không khớp với tài khoản đã kết nối." } };
      }
      const value = (text?: string) => text?.trim() || null;
      return { state: "READY", fetchedAt: new Date().toISOString(), error: null,
        accommodation: { name: value(data.tenCSLT), address: value(data.diaChi),
          representative: value(data.nguoiDD), phone: value(data.sdt), email: value(data.email), managingUnit: value(data.tenDvql) } };
    } catch (error) {
      const clean = (text: string) => sanitizeProviderText(text.replaceAll(session.AccessToken, "[REDACTED]").replaceAll(session.RefreshToken, "[REDACTED]")).slice(0, 500);
      const known = error instanceof KbttProviderReadError ? error : null;
      const providerMessage = known?.details.providerMessage;
      const providerCode = known?.details.providerCode;
      return { state: "FAILED", accommodation: null, fetchedAt: null,
        error: { code: known?.details.httpStatus === 401 || known?.details.httpStatus === 403 || ["401", "403"].includes(String(providerCode)) ? "KBTT_AUTH_FAILED" : clean(providerCode !== undefined && known && ["HTTP", "PROVIDER"].includes(known.kind) ? String(providerCode) : "KBTT_PROFILE_" + (known?.kind ?? "UNAVAILABLE")),
          message: providerMessage && known && ["HTTP", "PROVIDER"].includes(known.kind) ? clean(providerMessage) : "Chưa tải được thông tin cơ sở từ BCA. Vui lòng kiểm tra kết nối để thử lại." } };
    }
  }

  private view(connection: KbttHotelConnection | null) {
    let username: string | null = null;
    if (connection) {
      try {
        username = this.cipher.decrypt(connection.hotelId, connection).username;
      } catch {
        // Keep stored status readable if the credential key is unavailable.
      }
    }
    const cached = connection ? this.sessions.get(connection.hotelId) : undefined;
    const profile = connection?.status === "CONNECTED" && !this.recoveries.has(connection.hotelId) && cached?.ciphertext === connection.ciphertext && cached.session.CsltId === connection.csltId ? cached.profile : undefined;
    return {
      username,
      providerProfile: profile ?? { state: "NOT_LOADED" as const, accommodation: null, fetchedAt: null, error: null },
      configured: Boolean(connection),
      status: connection && (this.recoveries.has(connection.hotelId) || connection.status === "CONNECTED" &&
        (!cached || cached.ciphertext !== connection.ciphertext || cached.session.CsltId !== connection.csltId)) ? "DISCONNECTED" : connection?.status ?? "DISCONNECTED",
      maskedUsername: connection ? "••••••" : null,
      csltId: connection?.csltId ?? null,
      lastCheckedAt: connection?.lastCheckedAt.toISOString() ?? null,
      lastConnectedAt: connection?.lastConnectedAt.toISOString() ?? null,
      lastErrorCode: connection?.lastErrorCode ?? null,
      lastErrorMessage: connection?.lastErrorMessage ?? null,
    };
  }

  async listCatalog(
    userId: string,
    roleId: string,
    hotelId: string,
    kind: KbttCatalogKind,
    query: KbttCatalogQuery,
  ): Promise<KbttCatalogItemView[]> {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    let parentCodeNormalized: string | undefined = undefined;
    if (query.parentCode !== undefined) {
      parentCodeNormalized = query.parentCode.trim();
    } else if (kind !== "WARD") {
      parentCodeNormalized = "";
    }
    const items = await this.repository.listCatalogItems({
      kind,
      parentCodeNormalized,
      includeInactive: query.includeInactive,
      limit: query.limit,
    });
    return items.map((item) => ({
      id: item.id,
      kind: item.kind,
      code: item.code,
      parentCode: item.parentCodeNormalized || null,
      nameVi: item.nameVi,
      nameEn: item.nameEn ?? null,
      isActive: item.isActive,
      fetchedAt: item.fetchedAt.toISOString(),
    }));
  }

  async syncCatalog(
    userId: string,
    roleId: string,
    hotelId: string,
    kind: KbttCatalogKind,
    options?: { provinceCode?: string },
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    let provinceCode: string | undefined = undefined;
    if (kind === "WARD") {
      provinceCode = options?.provinceCode?.trim();
      if (!provinceCode) {
        throw new BadRequestException(
          "Mã tỉnh/thành phố (maTT) là bắt buộc khi đồng bộ danh mục phường xã.",
        );
      }
    }

    const rawData = await this.provider.fetchCatalog(kind, provinceCode);
    let candidateItems: Array<{
      code: string;
      nameVi: string;
      nameEn: string | null;
      parentCodeNormalized: string;
    }> = [];

    switch (kind) {
      case "NATIONALITY": {
        const parsed = z.array(kbttProviderCountrySchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.maQT,
          nameVi: item.tenQT,
          nameEn: item.tenQTEn ?? null,
          parentCodeNormalized: "",
        }));
        break;
      }
      case "PROVINCE": {
        const parsed = z.array(kbttProviderProvinceSchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.maTT,
          nameVi: item.tenTT,
          nameEn: item.tenTTEn ?? null,
          parentCodeNormalized: "",
        }));
        break;
      }
      case "WARD": {
        const parsed = z.array(kbttProviderWardSchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.maPhuongXa,
          nameVi: item.tenPhuongXa,
          nameEn: item.tenPhuongXaEn ?? null,
          parentCodeNormalized: (item.trucThuocTinh || provinceCode!).trim(),
        }));
        break;
      }
      case "STAY_REASON": {
        const parsed = z.array(kbttProviderNamedItemSchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.id,
          nameVi: item.name,
          nameEn: null,
          parentCodeNormalized: "",
        }));
        break;
      }
      case "DOCUMENT_TYPE": {
        const parsed = z.array(kbttProviderNamedItemSchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.id,
          nameVi: item.name,
          nameEn: null,
          parentCodeNormalized: "",
        }));
        break;
      }
      case "RESIDENCE_PLACE": {
        const parsed = z.array(kbttProviderNamedItemSchema).safeParse(rawData);
        if (!parsed.success) {
          throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
        }
        candidateItems = parsed.data.map((item) => ({
          code: item.id,
          nameVi: item.name,
          nameEn: null,
          parentCodeNormalized: "",
        }));
        break;
      }
      default:
        throw new BadRequestException("Loại danh mục KBTT không hợp lệ.");
    }

    const seen = new Set<string>();
    const deduplicatedCandidates: typeof candidateItems = [];
    for (const item of candidateItems) {
      const key = `${item.code}::${item.parentCodeNormalized}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedCandidates.push(item);
      }
    }

    const parentCodeNormalized = kind === "WARD" ? provinceCode! : "";
    const result = await this.repository.syncCatalogItems(
      kind,
      parentCodeNormalized,
      deduplicatedCandidates,
    );

    return {
      kind,
      parentCode: parentCodeNormalized || null,
      totalFetched: deduplicatedCandidates.length,
      syncedAt: result.syncedAt.toISOString(),
    };
  }

  async getAutoSubmitEnabled(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const connection = await this.repository.find(hotelId);
    return { autoSubmitEnabled: connection?.autoSubmitEnabled ?? false };
  }

  async updateAutoSubmitEnabled(userId: string, roleId: string, hotelId: string, autoSubmitEnabled: boolean) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const connection = await this.repository.find(hotelId);
    if (!connection) {
      throw new NotFoundException({ code: "KBTT_NOT_CONFIGURED", message: "Khách sạn chưa cấu hình kết nối KBTT." });
    }
    const updated = await this.repository.update(connection, { autoSubmitEnabled });
    return { autoSubmitEnabled: updated.autoSubmitEnabled };
  }

  async getAutoSubmitConfig(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const connection = await this.repository.find(hotelId);
    if (!connection) {
      throw new NotFoundException({
        code: "KBTT_NOT_CONFIGURED",
        message: "Khách sạn chưa cấu hình kết nối KBTT.",
      });
    }
    const [runs, pendingRuns] = await Promise.all([
      this.repository.getAutoSubmitRunHistory(hotelId, 10),
      this.repository.findPendingScheduledAutoSubmitRuns(hotelId),
    ]);
    const pendingSchedule = pendingRuns.find(
      (run) =>
        (run.summaryJson as any)?.trigger === "MANUAL_DELAYED" &&
        run.scheduledFor.getTime() > Date.now(),
    );
    const activeRun = runs.find(
      (r) =>
        r.status === "RUNNING" &&
        r.leaseExpiresAt.getTime() > Date.now() &&
        r.scheduledFor.getTime() <= Date.now(),
    );
    return {
      autoSubmitEnabled: connection.autoSubmitEnabled,
      autoSubmitTime: connection.autoSubmitTime,
      activeRun: activeRun ? this.autoSubmitRunView(activeRun) : null,
      pendingSchedule: pendingSchedule ? this.autoSubmitRunView(pendingSchedule) : null,
      recentRuns: runs.map((r) => this.autoSubmitRunView(r)),
    };
  }

  async updateAutoSubmitConfig(
    userId: string,
    roleId: string,
    hotelId: string,
    body: KbttAutoSubmitConfig,
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const connection = await this.repository.find(hotelId);
    if (!connection) {
      throw new NotFoundException({
        code: "KBTT_NOT_CONFIGURED",
        message: "Khách sạn chưa cấu hình kết nối KBTT.",
      });
    }
    const updated = await this.repository.update(connection, {
      ...(body.autoSubmitEnabled !== undefined ? { autoSubmitEnabled: body.autoSubmitEnabled } : {}),
      ...(body.autoSubmitTime !== undefined ? { autoSubmitTime: body.autoSubmitTime } : {}),
    });
    return {
      autoSubmitEnabled: updated.autoSubmitEnabled,
      autoSubmitTime: updated.autoSubmitTime,
    };
  }

  private async persistDeclarationSubmitted(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    payload: unknown[],
    fingerprint: string,
    outcome: KbttSubmitOutcome,
  ) {
    const providerCode = outcome.code.slice(0, 32);
    const providerMessage = sanitizeProviderText(outcome.message || "Không có thông báo");
    const providerResponseJson = outcome.data
      ? (sanitizeProviderData(outcome.data) as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await this.repository.updateDeclaration({
      id: declaration.id,
      hotelId,
      expectedVersion: declaration.version,
      data: {
        status: "SUBMITTED",
        draftPayloadJson: declaration.draftPayloadJson ?? Prisma.JsonNull,
        submittedPayloadJson: payload as Prisma.InputJsonValue,
        submittedPayloadFingerprint: fingerprint,
        providerCode,
        providerMessage,
        providerResponseJson,
        submittedAt: new Date(),
      },
    });
  }

  private async persistDeclarationFailed(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    fingerprint: string,
    outcome: KbttSubmitOutcome,
  ) {
    const providerCode = outcome.code.slice(0, 32);
    let detailStr = "";
    if (Array.isArray(outcome.data) && outcome.data.length > 0) {
      detailStr = outcome.data
        .map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item
              ? JSON.stringify(item)
              : String(item),
        )
        .filter(Boolean)
        .join("; ");
    } else if (typeof outcome.data === "string") {
      detailStr = outcome.data;
    } else if (outcome.data && typeof outcome.data === "object") {
      detailStr = Object.entries(outcome.data as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${typeof v === "object" && v ? JSON.stringify(v) : String(v)}`)
        .join("; ");
    }
    const rawMessage = [outcome.message, detailStr].filter(Boolean).join(": ");
    const providerMessage = sanitizeProviderText(rawMessage || "Không có thông báo");
    const providerResponseJson = outcome.data
      ? (sanitizeProviderData(outcome.data) as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await this.repository.updateDeclaration({
      id: declaration.id,
      hotelId,
      expectedVersion: declaration.version,
      data: {
        status: "FAILED",
        submittedPayloadFingerprint: fingerprint,
        providerCode,
        providerMessage,
        providerResponseJson,
        submittedAt: null,
      },
    });
  }

  private async persistDeclarationUnknown(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    fingerprint: string,
    message: string,
  ) {
    try {
      await this.repository.updateDeclaration({
        id: declaration.id,
        hotelId,
        expectedVersion: declaration.version,
        data: {
          status: "UNKNOWN",
          submittedPayloadFingerprint: fingerprint,
          providerCode: "PROVIDER_TIMEOUT",
          providerMessage: sanitizeProviderText(message),
          submittedAt: null,
        },
      });
    } catch {
      // secondary CAS error ignored
    }
  }

  async executeAutoSubmitForHotel(hotelId: string, scheduledForDate: Date, isDryRun: boolean) {
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true") return null;
    isDryRun = isDryRun || process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true";
    return this.serialize(hotelId, async () => {
      const run = await this.repository.claimAutoSubmitRunLease(
        hotelId,
        scheduledForDate,
        isDryRun,
      );
      if (!run) {
        return null;
      }
      if (this.scheduledTimers.has(run.id)) {
        clearTimeout(this.scheduledTimers.get(run.id));
        this.scheduledTimers.delete(run.id);
      }
      const trigger = (run.summaryJson as any)?.trigger ?? "DAILY";
      const isManualDelayed = trigger === "MANUAL_DELAYED";

      const connection = await this.repository.find(hotelId);
      if (!connection || connection.status !== "CONNECTED") {
        return await this.repository.finalizeAutoSubmitRun(run.id, {
          status: "FAILED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: { error: "Khách sạn chưa đăng nhập hoặc chưa kết nối Cổng DVC Bộ Công An." },
        });
      }

      if (!isDryRun && !isManualDelayed && !connection.autoSubmitEnabled) {
        return this.repository.finalizeAutoSubmitRun(run.id, {
          status: "CANCELLED", totalCount: 0, successCount: 0, failedCount: 0, unknownCount: 0,
          telegramSent: false, summaryJson: { trigger, reason: "DELIVERY_PAUSED" },
        });
      }

      let session: KbttSession | null = null;
      if (!isDryRun) {
        try {
          session = await this.getOrRefreshSession(hotelId, connection);
        } catch (authError: any) {
          const failure = stableKbttError(authError);
          const failed = this.sessions.get(hotelId)?.session;
          if (failed) await this.disconnectFailedSession(hotelId, failed);
          return await this.repository.finalizeAutoSubmitRun(run.id, {
            status: "FAILED",
            totalCount: 0,
            successCount: 0,
            failedCount: 0,
            unknownCount: 0,
            telegramSent: false,
            summaryJson: { error: `Xác thực C06 thất bại: ${authError?.message || ""}` },
          });
        }
      }

      let cursor: string | undefined = undefined;
      let hasMorePages = true;
      const PAGE_SIZE = Number(
        process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE || (process.env.NODE_ENV === "test" ? 100 : 500),
      );
      const MAX_BATCH_ELIGIBLE = Number(
        process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE || (process.env.NODE_ENV === "test" ? 100 : 1000),
      );
      let totalEligibleCount = 0;
      let directSuccessCount = 0;
      const reconciledSuccessCount = 0;
      let validationFailureCount = 0;
      let bcaRejectionCount = 0;
      let transientExhaustedCount = 0;
      let leaseFenced = false;
      let deliveryPaused = false;
      let hasBacklog = false;

      while (hasMorePages) {
        const leaseOk = await this.repository.renewAutoSubmitRunLease(run.id);
        if (!leaseOk) {
          leaseFenced = true;
          break;
        }

        const pageResult = await this.occupantsReadService?.getActiveStayOccupantsPaged(hotelId, {
          cursor,
          take: PAGE_SIZE,
        });

        const occupants = pageResult?.items ?? [];
        cursor = pageResult?.nextCursor ?? undefined;
        hasMorePages = Boolean(cursor && occupants.length > 0);

        if (occupants.length === 0) {
          break;
        }

        const existingDeclarations = await this.repository.findDeclarationsByHotel(
          hotelId,
          occupants.map((occupant) => occupant.id),
        );
        const latestByOccupant = new Map<string, KbttGuestDeclaration>();
        for (const declaration of existingDeclarations) {
          if (!latestByOccupant.has(declaration.occupantId)) {
            latestByOccupant.set(declaration.occupantId, declaration);
          }
        }


        const candidates = occupants
          .map((occupant) => ({ occupant, declaration: latestByOccupant.get(occupant.id) ?? null }))
          .filter(({ occupant, declaration }) => {
            if (!occupant.citizenshipKind) return false;
            if (!declaration) return true;

            // Initial failures and retired queued records require an explicit operator action.
            return declaration.providerCode !== "LOCAL_QUEUED" &&
              (declaration.status === "DRAFT" || declaration.status === "READY");
          });

        const remainingNeeded = MAX_BATCH_ELIGIBLE - totalEligibleCount;
        const candidatesToTake = candidates.slice(0, remainingNeeded);
        if (candidates.length > remainingNeeded) {
          hasBacklog = true;
        }

        const declarations = candidatesToTake
          .filter(({ occupant }) => Boolean(occupant.citizenshipKind))
          .map(
            ({ occupant, declaration }) =>
              declaration ??
              ({
                id: `pending:${occupant.id}`,
                hotelId,
                stayId: occupant.stayId,
                occupantId: occupant.id,
                declarationKind: occupant.citizenshipKind!,
                revision: 1,
                status: "READY",
                draftPayloadJson: this.withOccupantDefaults(occupant.citizenshipKind, {}, occupant),
                submittedPayloadJson: null,
                submittedPayloadFingerprint: null,
                submittedCsltId: null,
                providerCode: null,
                providerMessage: null,
                providerResponseJson: null,
                submittedAt: null,
                version: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as KbttGuestDeclaration),
          );

        totalEligibleCount += declarations.length;

        if (declarations.length === 0) {
          if (!hasBacklog && hasMorePages) continue;
          break;
        }

        const occupantById = new Map<string, ActiveStayOccupantRow>();
        for (const occupant of occupants) {
          occupantById.set(occupant.id, occupant);
        }

        const validItems: Array<{
          declaration: KbttGuestDeclaration;
          payload: unknown[];
          draftData: Record<string, unknown>;
          fingerprint: string;
        }> = [];

        for (const decl of declarations) {
          const occupant = occupantById.get(decl.occupantId);
          const draft = occupant
            ? this.withOccupantDefaults(
                decl.declarationKind,
                (decl.draftPayloadJson ?? {}) as Record<string, unknown>,
                occupant,
              )
            : decl.draftPayloadJson;
          const schema =
            decl.declarationKind === "VIETNAMESE"
              ? kbttVietnameseReadySchema
              : kbttForeignReadySchema;
          const validated = schema.safeParse(draft);
          if (!validated.success) {
            if (!isDryRun) {
              const error = formatValidationIssues(validated.error.issues);
              const draftFp = createHash("sha256")
                .update(JSON.stringify([draft]))
                .digest("hex");
              if (decl.id.startsWith("pending:")) {
                await this.repository.createDeclaration({
                  hotelId,
                  stayId: decl.stayId,
                  occupantId: decl.occupantId,
                  declarationKind: decl.declarationKind,
                  status: "FAILED",
                  draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, draft as Record<string, unknown>, occupant) : draft as Prisma.InputJsonValue,
                  submittedPayloadFingerprint: draftFp,
                  providerCode: "LOCAL_VALIDATION",
                  providerMessage: error,
                });
              } else {
                await this.repository.updateDeclaration({
                  id: decl.id,
                  hotelId,
                  expectedVersion: decl.version,
                  data: {
                    status: "FAILED",
                    submittedPayloadFingerprint: draftFp,
                    providerCode: "LOCAL_VALIDATION",
                    providerMessage: error,
                    submittedAt: null,
                  },
                });
              }
            }
            validationFailureCount++;
            continue;
          }

          let submitDeclaration = decl;
          if (!isDryRun && decl.id.startsWith("pending:")) {
            submitDeclaration = await this.repository.createDeclaration({
              hotelId,
              stayId: decl.stayId,
              occupantId: decl.occupantId,
              declarationKind: decl.declarationKind,
              status: "READY",
              draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, validated.data, occupant) : validated.data,
            });
          } else if (!isDryRun && occupant) {
            submitDeclaration = await this.repository.updateDeclaration({
              id: decl.id,
              hotelId,
              expectedVersion: decl.version,
              data: { draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, validated.data, occupant) : validated.data },
            });
          }

          const payload = [validated.data];
          const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
          validItems.push({
            declaration: submitDeclaration,
            payload,
            draftData: validated.data ?? {},
            fingerprint,
          });
        }

        if (validItems.length === 0) {
          continue;
        }

        if (isDryRun) {
          directSuccessCount += validItems.length;
          continue;
        }

        // One transmission per guest. UNKNOWN must never enter another retry wave.
        for (const item of validItems) {
          if (!isManualDelayed && !(await this.repository.find(hotelId))?.autoSubmitEnabled) {
            deliveryPaused = true;
            break;
          }
          if (!(await this.repository.renewAutoSubmitRunLease(run.id))) {
            leaseFenced = true;
            break;
          }
          let claimedDeclaration: KbttGuestDeclaration;
          try {
            claimedDeclaration = await this.repository.updateDeclaration({
              id: item.declaration.id, hotelId, expectedVersion: item.declaration.version,
              data: { status: "UNKNOWN", submittedPayloadJson: item.payload as Prisma.InputJsonValue,
                submittedPayloadFingerprint: item.fingerprint, submittedCsltId: session!.CsltId },
            });
          } catch {
            continue; // Another writer owns the current declaration version.
          }
          const outcome = await this.sendInitialDeclaration(
            hotelId, claimedDeclaration.id, claimedDeclaration.declarationKind,
            item.payload, session!.AccessToken, session!.CsltId, !isManualDelayed,
          );
          if (outcome.outcome === "SUCCESS") {
            await this.persistDeclarationSubmitted(hotelId, claimedDeclaration,
              item.payload, item.fingerprint, outcome);
            directSuccessCount++;
          } else if (outcome.outcome === "BUSINESS_REJECTION" && outcome.code === "DELIVERY_PAUSED") {
            await this.repository.updateDeclaration({
              id: claimedDeclaration.id, hotelId, expectedVersion: claimedDeclaration.version,
              data: { status: "FAILED", providerCode: "DELIVERY_PAUSED", providerMessage: "Luồng gửi BCA đang tạm dừng." },
            });
            deliveryPaused = true;
            break;
          } else if (outcome.outcome === "BUSINESS_REJECTION") {
            await this.persistDeclarationFailed(hotelId, claimedDeclaration, item.fingerprint, outcome);
            bcaRejectionCount++;
          } else {
            await this.persistDeclarationUnknown(hotelId, claimedDeclaration, item.fingerprint,
              outcome.message || "Lần gửi chưa rõ kết quả; cần đối soát.");
            transientExhaustedCount++;
          }
        }
        if (leaseFenced || deliveryPaused) break;

        if (totalEligibleCount >= MAX_BATCH_ELIGIBLE) {
          while (hasMorePages && !hasBacklog) {
            const nextResult = await this.occupantsReadService?.getActiveStayOccupantsPaged(
              hotelId,
              {
                cursor,
                take: PAGE_SIZE,
              },
            );
            const nextOccupants = nextResult?.items ?? [];
            cursor = nextResult?.nextCursor ?? undefined;
            hasMorePages = Boolean(cursor && nextOccupants.length > 0);
            if (nextOccupants.length === 0) break;

            const nextDecls = await this.repository.findDeclarationsByHotel(
              hotelId,
              nextOccupants.map((o) => o.id),
            );
            const declByOcc = new Map<string, KbttGuestDeclaration>();
            for (const d of nextDecls) {
              if (!declByOcc.has(d.occupantId)) declByOcc.set(d.occupantId, d);
            }
            for (const occ of nextOccupants) {
              if (!occ.citizenshipKind) continue;
              const decl = declByOcc.get(occ.id);
              if (!decl || (decl.providerCode !== "LOCAL_QUEUED" && ["DRAFT", "READY"].includes(decl.status))) {
                hasBacklog = true;
                break;
              }
            }
          }
          break;
        }
      }

      if (leaseFenced) {
        return null;
      }

      if (totalEligibleCount === 0) {
        return await this.repository.finalizeAutoSubmitRun(run.id, {
          status: "COMPLETED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: {
            trigger,
            breakdown: {
              directSuccessCount: 0,
              reconciledSuccessCount: 0,
              validationFailureCount: 0,
              bcaRejectionCount: 0,
              transientExhaustedCount: 0,
            },
            hasBacklog: false,
            continuationScheduled: false,
            nextContinuationAt: null,
          },
        });
      }

      const successCount = directSuccessCount + reconciledSuccessCount;
      const failedCount = validationFailureCount + bcaRejectionCount;
      const unknownCount = transientExhaustedCount;

      let telegramSent = false;
      if (
        !isDryRun &&
        this.telegramNotificationService &&
        (this.telegramNotificationService as any).sendKbttAutoSubmitSummary
      ) {
        try {
          const hotelName =
            (connection as any)?.hotel?.name ||
            (await this.repository.findHotelName?.(hotelId)) ||
            hotelId;
          telegramSent = await (this.telegramNotificationService as any).sendKbttAutoSubmitSummary(
            hotelId,
            {
              hotelName,
              scheduledTime: formatVietnamDateTime(scheduledForDate),
              totalEligible: totalEligibleCount,
              successCount,
              failureCount: failedCount,
              unknownCount,
              isDryRun,
              directSuccessCount,
              reconciledSuccessCount,
              validationFailureCount,
              bcaRejectionCount,
              transientExhaustedCount,
            },
          );
        } catch {
          // non-blocking
        }
      }

      let continuationScheduled = false;
      let nextContinuationAt: string | null = null;
      if (hasBacklog && !isManualDelayed && !deliveryPaused) {
        const continuationMinutes = Number(
          process.env.KBTT_AUTO_SUBMIT_CONTINUATION_MINUTES ||
            (process.env.NODE_ENV === "test" ? 30 : 1),
        );
        const continuationScheduledFor = new Date(
          scheduledForDate.getTime() + continuationMinutes * 60 * 1000,
        );
        const trigger =
          continuationMinutes === 30 ? "CONTINUATION_30M" : `CONTINUATION_${continuationMinutes}M`;
        try {
          const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
          const alreadyScheduled = pending.some((p) => p.scheduledFor.getTime() >= Date.now());
          if (!alreadyScheduled) {
            const continuation = await this.repository.createScheduledAutoSubmitRun(
              hotelId,
              continuationScheduledFor,
              isDryRun,
              trigger,
            );
            this.armScheduledRun(continuation);
            continuationScheduled = true;
            nextContinuationAt = continuationScheduledFor.toISOString();
          }
        } catch (err: any) {
          this.logger.warn(`Failed to schedule continuation for hotel ${hotelId}: ${err?.message}`);
        }
      }

      const finalRun = await this.repository.finalizeAutoSubmitRun(run.id, {
        status: deliveryPaused ? "CANCELLED" : "COMPLETED",
        totalCount: totalEligibleCount,
        successCount,
        failedCount,
        unknownCount,
        telegramSent,
        summaryJson: {
          trigger,
          ...(deliveryPaused ? { reason: "DELIVERY_PAUSED" } : {}),
          breakdown: {
            directSuccessCount,
            reconciledSuccessCount,
            validationFailureCount,
            bcaRejectionCount,
            transientExhaustedCount,
          },
          hasBacklog,
          continuationScheduled,
          nextContinuationAt,
        },
      });

      return finalRun;
    });
  }

  async testAutoSubmit(userId: string, roleId: string, hotelId: string, dryRun = true) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    if (!dryRun && process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true") {
      throw new BadRequestException(
        "Live KBTT auto-submit chưa được bật trong môi trường hiện tại.",
      );
    }
    if (!dryRun) return this.scheduleAutoSubmit(userId, roleId, hotelId, false);
    const run = await this.executeAutoSubmitForHotel(hotelId, new Date(), true);
    if (!run) {
      throw new BadRequestException(
        "Không thể khởi tạo phiên nộp tự động hoặc đang có phiên khác đang chạy.",
      );
    }
    return {
      id: run.id,
      hotelId: run.hotelId,
      scheduledFor: run.scheduledFor.toISOString(),
      status: run.status,
      dryRun: run.dryRun,
      totalCount: run.totalCount,
      totalEligible: run.totalCount,
      successCount: run.successCount,
      failedCount: run.failedCount,
      failureCount: run.failedCount,
      unknownCount: run.unknownCount,
      telegramSent: run.telegramSent,
      errorMessage: (run.summaryJson as any)?.error ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  async testTelegram(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const sent = await this.telegramNotificationService?.sendKbttTestMessage(hotelId);
    if (!sent) {
      throw new BadRequestException("Chưa cấu hình tuyến Telegram KBTT cho khách sạn.");
    }
    return { sent: true };
  }

  async sendBatchSummary(
    userId: string,
    roleId: string,
    hotelId: string,
    summary: {
      totalEligible: number;
      successCount: number;
      failureCount: number;
      unknownCount?: number;
      isDryRun?: boolean;
      scheduledTime?: string;
    },
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const hotelName = (await this.repository.findHotelName?.(hotelId)) || hotelId;
    const sent = await this.telegramNotificationService?.sendKbttAutoSubmitSummary(hotelId, {
      hotelName,
      scheduledTime: summary.scheduledTime || formatVietnamDateTime(new Date()),
      totalEligible: summary.totalEligible,
      successCount: summary.successCount,
      failureCount: summary.failureCount,
      unknownCount: summary.unknownCount ?? 0,
      isDryRun: summary.isDryRun ?? false,
    });
    return { sent: Boolean(sent) };
  }

  async scheduleAutoSubmit(userId: string, roleId: string, hotelId: string, dryRun: boolean) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    if (!dryRun && process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true") {
      throw new BadRequestException(
        "Live KBTT auto-submit chưa được bật trong môi trường hiện tại.",
      );
    }
    const [pending, runs] = await Promise.all([
      this.repository.findPendingScheduledAutoSubmitRuns(hotelId),
      this.repository.getAutoSubmitRunHistory(hotelId, 5),
    ]);
    const hasPending = pending.some(
      (run) =>
        (run.summaryJson as any)?.trigger === "MANUAL_DELAYED" &&
        run.scheduledFor.getTime() > Date.now(),
    );
    const hasActive =
      this.operations.has(hotelId) ||
      runs.some(
        (r) =>
          r.status === "RUNNING" &&
          r.leaseExpiresAt.getTime() > Date.now() &&
          r.scheduledFor.getTime() <= Date.now(),
      );
    if (hasPending || hasActive) {
      throw new ConflictException("Đã có một phiên KBTT đang được hẹn hoặc đang chạy.");
    }
    const run = await this.repository.createScheduledAutoSubmitRun(
      hotelId,
      new Date(Date.now() + 15_000),
      dryRun,
      "MANUAL_DELAYED",
    );
    this.armScheduledRun(run);
    return this.autoSubmitRunView(run);
  }

  async cancelScheduledAutoSubmit(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
    const run = pending.find(
      (item) =>
        (item.summaryJson as any)?.trigger === "MANUAL_DELAYED" &&
        item.scheduledFor.getTime() > Date.now(),
    );
    if (!run) throw new NotFoundException("Không có phiên KBTT đang hẹn.");
    const timer = this.scheduledTimers.get(run.id);
    if (timer) clearTimeout(timer);
    this.scheduledTimers.delete(run.id);
    await this.repository.finalizeAutoSubmitRun(run.id, {
      status: "CANCELLED",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      unknownCount: 0,
      telegramSent: false,
      summaryJson: { trigger: "MANUAL_DELAYED", cancelled: true },
    });
    return { cancelled: true };
  }

  private autoSubmitRunView(run: KbttAutoSubmitRun) {
    return {
      id: run.id,
      hotelId: run.hotelId,
      scheduledFor: run.scheduledFor.toISOString(),
      status: run.status,
      dryRun: run.dryRun,
      totalCount: run.totalCount,
      totalEligible: run.totalCount,
      successCount: run.successCount,
      failedCount: run.failedCount,
      failureCount: run.failedCount,
      unknownCount: run.unknownCount,
      telegramSent: run.telegramSent,
      errorMessage: (run.summaryJson as any)?.error ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  private generateRandomCccd(occ?: {
    gender?: string | null;
    dateOfBirth?: string | null;
  }): string {
    const provinces = ["001", "079", "048", "031", "037", "092", "024", "060", "056"];
    const prov = provinces[Math.floor(Math.random() * provinces.length)];

    let genderCentury = "0"; // default: male 1900-1999
    let year2Digits = "95";

    if (occ?.dateOfBirth && /^\d{4}/.test(occ.dateOfBirth)) {
      const year = Number(occ.dateOfBirth.slice(0, 4));
      year2Digits = String(year % 100).padStart(2, "0");
      const isFemale = ["F", "FEMALE", "NỮ", "NU", "FEMALE [F]"].includes(
        occ.gender?.trim().toUpperCase() ?? "",
      );
      if (year >= 1900 && year < 2000) {
        genderCentury = isFemale ? "1" : "0";
      } else if (year >= 2000 && year < 2100) {
        genderCentury = isFemale ? "3" : "2";
      }
    } else {
      const isFemale = ["F", "FEMALE", "NỮ", "NU", "FEMALE [F]"].includes(
        occ?.gender?.trim().toUpperCase() ?? "",
      );
      genderCentury = isFemale ? "1" : "0";
      year2Digits = String(Math.floor(80 + Math.random() * 20)).padStart(2, "0");
    }

    const randomSuffix = String(Math.floor(100000 + Math.random() * 900000));
    return `${prov}${genderCentury}${year2Digits}${randomSuffix}`;
  }

  private generateRandomPassport(): string {
    const randomSuffix = String(Math.floor(10000000 + Math.random() * 90000000));
    return `P${randomSuffix}`;
  }

  async triggerCheckInBcaPush(hotelId: string, stayId: string): Promise<void> {
    try {
      let occupants = (await this.repository.findOccupantsByStay(hotelId, stayId)) ?? [];
      if (occupants.length === 0) {
        const stay = await this.repository.findStayForOccupantCreation(hotelId, stayId);
        if (stay) {
          const createdOcc = await this.repository.createDefaultStayOccupant(hotelId, stay);
          occupants = [createdOcc];
        }
      }

      if (occupants.length === 0) {
        return;
      }

      const existingDeclarations = await this.repository.findDeclarationsByHotel(
        hotelId,
        occupants.map((o) => o.id),
      );
      const declByOccupant = new Map<string, KbttGuestDeclaration>();
      for (const d of existingDeclarations) {
        if (!declByOccupant.has(d.occupantId)) {
          declByOccupant.set(d.occupantId, d);
        }
      }

      for (const occupant of occupants) {
        const existingDecl = declByOccupant.get(occupant.id);
        try {
          if (occupant.stay.checkedOutAt ||
              !["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes(occupant.stay.status) ||
              (existingDecl && (["SUBMITTED", "UNKNOWN", "CANCELLED", "FAILED"].includes(existingDecl.status) ||
                existingDecl.providerCode === "LOCAL_QUEUED"))) {
            continue;
          }

          const isForeign =
            occupant.citizenshipKind === "FOREIGN" ||
            (occupant.nationality &&
              !["VN", "VNM", "VIET NAM", "VIETNAM"].includes(
                occupant.nationality.trim().toUpperCase(),
              )) ||
            (/^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test((occupant.identityNumber ?? "").trim()) &&
              !/^\d{9,12}$/.test((occupant.identityNumber ?? "").trim()));

          const citizenshipKind: "VIETNAMESE" | "FOREIGN" =
            existingDecl?.declarationKind ??
            occupant.citizenshipKind ??
            (isForeign ? "FOREIGN" : "VIETNAMESE");

          const previousData =
            existingDecl?.draftPayloadJson &&
            typeof existingDecl.draftPayloadJson === "object" &&
            !Array.isArray(existingDecl.draftPayloadJson)
              ? (existingDecl.draftPayloadJson as Record<string, unknown>)
              : {};

          const draft = this.withOccupantDefaults(citizenshipKind, previousData, occupant);

          const schema =
            citizenshipKind === "VIETNAMESE" ? kbttVietnameseReadySchema : kbttForeignReadySchema;
          const validated = schema.safeParse(draft);

          if (!validated.success) {
            const error = formatValidationIssues(validated.error.issues);
            const draftFp = createHash("sha256")
              .update(JSON.stringify([draft]))
              .digest("hex");

            if (!existingDecl) {
              await this.repository.createDeclaration({
                hotelId,
                stayId,
                occupantId: occupant.id,
                declarationKind: citizenshipKind,
                status: "FAILED",
                draftPayloadJson: this.compactDraft(citizenshipKind, draft, occupant),
                submittedPayloadFingerprint: draftFp,
                providerCode: "LOCAL_VALIDATION",
                providerMessage: error,
              });
            } else {
              await this.repository.updateDeclaration({
                id: existingDecl.id,
                hotelId,
                expectedVersion: existingDecl.version,
                data: {
                  status: "FAILED",
                  draftPayloadJson: this.compactDraft(citizenshipKind, draft, occupant),
                  submittedPayloadFingerprint: draftFp,
                  providerCode: "LOCAL_VALIDATION",
                  providerMessage: error,
                  submittedAt: null,
                },
              });
            }
            continue;
          }

          await this.serialize(`initial:${hotelId}`, async () => {
            await this.beginInitialDelivery(hotelId, occupant.id, occupant);
          });
        } catch {
          try {
            const current = await this.repository.findLatestDeclaration(hotelId, occupant.id);
            if (current && !["UNKNOWN", "SUBMITTED", "CANCELLED"].includes(current.status)) {
              await this.repository.updateDeclaration({
                id: current.id, hotelId, expectedVersion: current.version,
                data: { status: "FAILED", providerCode: "LOCAL_PREPARATION",
                  providerMessage: "Hồ sơ chưa thể gửi BCA; cần kiểm tra dữ liệu trước khi gửi lại.", submittedAt: null },
              });
            } else if (!current) {
              await this.repository.createDeclaration({
                hotelId, stayId, occupantId: occupant.id,
                declarationKind: existingDecl?.declarationKind ?? occupant.citizenshipKind ?? "VIETNAMESE",
                status: "FAILED", draftPayloadJson: existingDecl?.draftPayloadJson ?? {},
                providerCode: "LOCAL_PREPARATION",
                providerMessage: "Hồ sơ chưa thể gửi BCA; cần kiểm tra dữ liệu trước khi gửi lại.",
              });
            }
          } catch {
            this.logger.error("Could not persist a BCA check-in preparation issue.");
          }
        }
      }
    } catch (err: any) {
      this.logger.error("Could not prepare BCA check-in declarations.");
    }
  }

  async devResetDeclarations(
    userId: string,
    roleId: string,
    hotelId: string,
    options?: { generateNewIdentityNumbers?: boolean },
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException(
        "Thao tác này không khả dụng trên môi trường vận hành chính thức",
      );
    }
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const resetCount = await this.repository.resetAllDeclarationsToDraft(hotelId);

    let generatedCount = 0;
    if (options?.generateNewIdentityNumbers) {
      const occupants = (await this.occupantsReadService?.getActiveStayOccupants(hotelId)) ?? [];
      for (const occ of occupants) {
        const isVietnamese = occ.citizenshipKind === "VIETNAMESE" || occ.nationality === "VNM";
        const newIdentity = isVietnamese
          ? this.generateRandomCccd(occ)
          : this.generateRandomPassport();

        await this.repository.updateOccupantDetails(occ.id, hotelId, {
          identityNumber: newIdentity,
        });

        const latestDecl = await this.repository.findLatestDeclaration(hotelId, occ.id);
        if (latestDecl) {
          const draft = (latestDecl.draftPayloadJson ?? {}) as Record<string, unknown>;
          if (isVietnamese) {
            draft.soGiayTo = newIdentity;
          } else {
            draft.soHoChieu = newIdentity;
          }
          await this.repository.updateDeclaration({
            id: latestDecl.id,
            hotelId,
            expectedVersion: latestDecl.version,
            data: {
              draftPayloadJson: this.compactDraft(latestDecl.declarationKind, draft, { ...occ, identityNumber: newIdentity }),
              status: "DRAFT",
              submittedAt: null,
              providerCode: null,
              providerMessage: null,
              submittedPayloadJson: Prisma.DbNull,
              submittedPayloadFingerprint: null,
              providerResponseJson: Prisma.DbNull,
            },
          });
        }
        generatedCount++;
      }
    }

    return {
      success: true,
      message: options?.generateNewIdentityNumbers
        ? `Đã đặt lại trạng thái toàn bộ ${resetCount} hồ sơ về Chưa gửi và tạo mới ${generatedCount} Số giấy tờ hợp lệ.`
        : `Đã đặt lại trạng thái toàn bộ ${resetCount} hồ sơ về Chưa gửi. Bạn có thể kiểm tra thông tin và gửi hồ sơ lên Cổng dịch vụ công lưu trú.`,
      resetCount,
      generatedCount,
    };
  }

  async devUpdateOccupants(
    userId: string,
    roleId: string,
    hotelId: string,
    items: Array<{
      occupantId: string;
      identityNumber?: string;
      fullName?: string;
      nationality?: string;
      dateOfBirth?: string;
      gender?: string;
      resetToDraft?: boolean;
    }>,
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException(
        "Thao tác này không khả dụng trên môi trường vận hành chính thức",
      );
    }
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    let updatedCount = 0;

    for (const item of items) {
      const occ = await this.repository.findOccupant(hotelId, item.occupantId);
      if (!occ) continue;

      await this.repository.updateOccupantDetails(item.occupantId, hotelId, {
        identityNumber: item.identityNumber,
        fullName: item.fullName,
        nationality: item.nationality,
        dateOfBirth: item.dateOfBirth,
        gender: item.gender,
      });

      const latestDecl = await this.repository.findLatestDeclaration(hotelId, item.occupantId);
      if (latestDecl) {
        const draft = (latestDecl.draftPayloadJson ?? {}) as Record<string, unknown>;
        const isVietnamese =
          latestDecl.declarationKind === "VIETNAMESE" ||
          item.nationality === "VNM" ||
          occ.citizenshipKind === "VIETNAMESE";

        if (item.identityNumber !== undefined) {
          if (isVietnamese) {
            draft.soGiayTo = item.identityNumber;
          } else {
            draft.soHoChieu = item.identityNumber;
          }
        }
        if (item.fullName !== undefined) draft.hoTen = item.fullName;
        if (item.gender !== undefined) draft.gioiTinh = item.gender;
        if (item.dateOfBirth !== undefined) draft.ngayThangNamSinhStr = item.dateOfBirth;
        if (item.nationality !== undefined && !isVietnamese) draft.quocTich = item.nationality;

        const shouldReset = item.resetToDraft !== false;
        await this.repository.updateDeclaration({
          id: latestDecl.id,
          hotelId,
          expectedVersion: latestDecl.version,
          data: {
            draftPayloadJson: this.compactDraft(latestDecl.declarationKind, draft, { ...occ, ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)) }),
            ...(shouldReset
              ? {
                  status: "DRAFT",
                  submittedAt: null,
                  providerCode: null,
                  providerMessage: null,
                  submittedPayloadJson: Prisma.DbNull,
                  submittedPayloadFingerprint: null,
                  providerResponseJson: Prisma.DbNull,
                }
              : {}),
          },
        });
      }
      updatedCount++;
    }

    return {
      success: true,
      message: `Đã cập nhật thành công thông tin giấy tờ cho ${updatedCount} khách lưu trú.`,
      updatedCount,
    };
  }
}
