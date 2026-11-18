import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import {
  KBTT_READ_RETRIES,
  KBTT_TEMP_DISCONNECT_COOLDOWN_MS,
  waitForKbttRetry,
  withKbttDeadline,
} from "../domain/kbtt-retry";
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
import { createHash, randomUUID } from "crypto";
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
  getKbttSubmissionDateContext,
  KBTT_DAILY_SCHEDULE_SLOTS,
  KBTT_SCHEDULE_TIMEZONE,
  normalizeDateStringToIso,
  normalizeKbttSubmissionDates,
  kbttForeignReadySchema,
  kbttMetadata,
  kbttProviderCountrySchema,
  kbttProviderNamedItemSchema,
  kbttProviderProvinceSchema,
  kbttProviderWardSchema,
  kbttVietnameseReadySchema,
  parseDraftPayload,
  validateKbttSubmissionDates,
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
  type KbttSubmissionDateContext,
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
import {
  composeKbttDraft,
  compactKbttDeclarationDraft,
  markKbttDeclarationDates,
} from "../domain/kbtt-draft-profile";
import {
  reconcileGuests,
  reconciliationArrivalDay,
  type LocalReconciliationGuest,
  type ProviderReconciliationGuest,
  type ReconciliationKind,
} from "../domain/kbtt-reconciliation";
import { isValidCalendarDateTime } from "../domain/schemas/kbtt.schema";
import { providerDay } from "../domain/kbtt-stay-sync";
import { KbttStaySyncService } from "./kbtt-stay-sync.service";
import {
  addDaysYmd,
  formatLocalDateTime,
  getDayBounds,
  plainDateAtTime,
  toYmd,
  VIETNAM_TIME_ZONE,
} from "../../../common/time/vietnam-temporal";

const KBTT_TRANSIENT_OR_PAUSED_CODES = new Set([
  "DELIVERY_PAUSED",
  "KBTT_NOT_CONFIGURED",
  "KBTT_AUTH_FAILED",
  "AUTHENTICATION_REQUIRED",
  "401",
  "403",
  "HTTP_401",
  "HTTP_403",
  "KBTT_SESSION_ENDED",
  "KBTT_TEMP_DISCONNECTED",
  "KBTT_RETRY_PENDING",
  "KBTT_PROVIDER_UNAVAILABLE",
  "DELIVERY_BUSY",
  "LOCAL_PREPARATION",
  "CONNECTION_SCOPE_CHANGED",
  "429",
  "HTTP_429",
  "TOO_MANY_REQUESTS",
  "KBTT_RATE_LIMITED",
]);

const KBTT_RATE_LIMIT_CODES = new Set([
  "429",
  "HTTP_429",
  "TOO_MANY_REQUESTS",
  "KBTT_RATE_LIMITED",
]);

export function computeVietnamNextTenMinuteBoundary(now: Date = new Date()): Date {
  const vnOffsetMs = 7 * 3600_000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const year = vnNow.getUTCFullYear();
  const month = vnNow.getUTCMonth();
  const day = vnNow.getUTCDate();
  const hour = vnNow.getUTCHours();
  const minute = vnNow.getUTCMinutes();

  const deltaMinutes = 10 - (minute % 10);
  const minuteFloorUtcMs = Date.UTC(year, month, day, hour, minute, 0, 0) - vnOffsetMs;
  return new Date(minuteFloorUtcMs + deltaMinutes * 60_000);
}

export function computeVietnamNextDailySlot(now: Date = new Date()): {
  slot: "12:00" | "21:00";
  scheduledFor: Date;
} {
  const todayYmd = toYmd(now, VIETNAM_TIME_ZONE);
  const slot12Today = plainDateAtTime(todayYmd, "12:00:00", VIETNAM_TIME_ZONE);
  if (now.getTime() < slot12Today.getTime()) {
    return { slot: "12:00", scheduledFor: slot12Today };
  }
  const slot21Today = plainDateAtTime(todayYmd, "21:00:00", VIETNAM_TIME_ZONE);
  if (now.getTime() < slot21Today.getTime()) {
    return { slot: "21:00", scheduledFor: slot21Today };
  }
  const tomorrowYmd = addDaysYmd(todayYmd, 1);
  return {
    slot: "12:00",
    scheduledFor: plainDateAtTime(tomorrowYmd, "12:00:00", VIETNAM_TIME_ZONE),
  };
}

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
  private readonly sessions = new Map<
    string,
    {
      ciphertext: string;
      session: KbttSession;
      profile?: KbttConnectionProfile;
      cooldownUntil?: number;
    }
  >();
  private readonly readPreparations = new Map<string, Promise<{ ready: true }>>();
  private readonly recoveries = new Map<
    string,
    { session: KbttSession; controller: AbortController; task?: Promise<void> }
  >();
  private readonly cooldownTimers = new Map<string, NodeJS.Timeout>();
  private readonly healthProbes = new Map<string, Promise<boolean>>();
  private readonly unknownReconciliations = new Map<
    string,
    Promise<{
      settledCount: number;
      retryScheduledCount: number;
      remainingUnknownCount: number;
      incomplete?: boolean;
      nextCursor?: string | null;
    }>
  >();
  private readonly unknownReconciliationCursors = new Map<string, string>();
  private readonly unknownWorkCheckCursors = new Map<string, string>();
  private readonly unsentWorkCheckCursors = new Map<string, string>();
  private readonly autoSubmitResumeCursors = new Map<string, string>();
  private readonly revocations = new Map<
    string,
    { controller: AbortController; task: Promise<void> }
  >();
  private readonly sessionEnded = new Set<(hotelId: string, session: KbttSession) => void>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly initialDeliveries = new Map<string, Promise<void>>();
  private readonly scheduledTimers = new Map<string, NodeJS.Timeout>();
  private readonly historyDayCache = new Map<
    string,
    { expiresAt: number; rows: Promise<unknown[]> }
  >();

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
    await this.staySync?.run(
      (hotelId, connection) => this.getOrRefreshSession(hotelId, connection),
      (hotelId, session, options) =>
        this.handleProviderSessionFailure(hotelId, session, options?.authRejected ?? false),
      (hotelId, csltId) => this.hasConflictingFacilityOwnership(hotelId, csltId),
    );
  }

  private async updateConnectionIfCurrent(
    hotelId: string,
    ciphertext: string,
    data: Partial<
      Omit<KbttHotelConnection, "hotelId" | "ciphertext" | "iv" | "authTag" | "keyVersion">
    >,
  ): Promise<KbttHotelConnection | null> {
    const current = await this.repository.find(hotelId).catch(() => null);
    if (!current || current.ciphertext !== ciphertext) return null;
    try {
      return await this.repository.update(current, data);
    } catch {
      return null;
    }
  }

  private async sendInitialDeclaration(
    hotelId: string,
    declarationId: string,
    kind: "VIETNAMESE" | "FOREIGN",
    payload: unknown[],
    accessToken: string,
    csltId: string,
    requireEnabled = true,
    expectedCiphertext?: string,
  ): Promise<KbttSubmitOutcome> {
    if (
      process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
      process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true"
    ) {
      return {
        outcome: "BUSINESS_REJECTION",
        code: "DELIVERY_PAUSED",
        message: "Luồng gửi BCA đang tạm dừng.",
      };
    }
    try {
      const current = await this.repository.findDeclarationForDispatch(hotelId, declarationId);
      const guest = Array.isArray(payload) ? payload[0] : null;
      if (
        !current ||
        current.status !== "UNKNOWN" ||
        current.submittedCsltId !== csltId ||
        current.stay.checkedOutAt ||
        !["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes(current.stay.status) ||
        !guest ||
        typeof guest !== "object" ||
        !("ngayDiDuKienStr" in guest) ||
        providerDay(guest.ngayDiDuKienStr) !==
          providerDay(
            normalizeKbttSubmissionDates(kind, composeKbttDraft(
              kind,
              (current.draftPayloadJson ?? {}) as Record<string, unknown>,
              { fullName: "", stay: current.stay },
            ), new Date()).ngayDiDuKienStr,
          )
      ) {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "LOCAL_STATE_CHANGED",
          message: "Lượt lưu trú đã thay đổi; cần cập nhật hồ sơ trước khi gửi.",
        };
      }
      const connection = await this.repository.find(hotelId);
      const cached = this.sessions.get(hotelId);
      if (
        !connection ||
        connection.status !== "CONNECTED" ||
        connection.csltId !== csltId ||
        (expectedCiphertext !== undefined && connection.ciphertext !== expectedCiphertext) ||
        !cached ||
        cached.session.AccessToken !== accessToken ||
        cached.session.CsltId !== csltId ||
        cached.ciphertext !== connection.ciphertext
      ) {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "CONNECTION_SCOPE_CHANGED",
          message: "Kết nối BCA đã thay đổi; cần xác nhận lại cơ sở trước khi gửi.",
        };
      }
      const baselineCiphertext = expectedCiphertext ?? connection.ciphertext;
      let hasFacilityConflict = false;
      try {
        hasFacilityConflict = await this.hasConflictingFacilityOwnership(hotelId, csltId);
      } catch {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "KBTT_UNAVAILABLE",
          message:
            "Không thể xác minh quyền sở hữu cơ sở lưu trú BCA trong hệ thống; đã chặn gửi để đảm bảo an toàn.",
        };
      }
      if (hasFacilityConflict) {
        await this.markFacilityConflictIfCurrent(hotelId, baselineCiphertext);
        return {
          outcome: "BUSINESS_REJECTION",
          code: "KBTT_FACILITY_CONFLICT",
          message:
            "Cơ sở lưu trú BCA này đang bị trùng liên kết với một khách sạn khác trên hệ thống; luồng gửi đã được chặn an toàn.",
        };
      }
      // Recheck connection generation, status and session immediately before calling the provider after every awaited precondition.
      const finalConnection = await this.repository.find(hotelId);
      const finalCached = this.sessions.get(hotelId);
      if (
        !finalConnection ||
        finalConnection.status !== "CONNECTED" ||
        finalConnection.csltId !== csltId ||
        finalConnection.ciphertext !== baselineCiphertext ||
        !finalCached ||
        finalCached.session.AccessToken !== accessToken ||
        finalCached.session.CsltId !== csltId ||
        finalCached.ciphertext !== baselineCiphertext
      ) {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "CONNECTION_SCOPE_CHANGED",
          message: "Kết nối BCA đã thay đổi; cần xác nhận lại cơ sở trước khi gửi.",
        };
      }
      if (requireEnabled && !finalConnection.autoSubmitEnabled) {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "DELIVERY_PAUSED",
          message: "Luồng gửi BCA đang tạm dừng.",
        };
      }
      const dateCheck = validateKbttSubmissionDates(kind, guest as Record<string, unknown>, new Date(), { enforceArrivalWindow: true });
      if (!dateCheck.valid) {
        return {
          outcome: "BUSINESS_REJECTION",
          code: dateCheck.outOfWindow ? "OUT_OF_DATE_WINDOW" : "LOCAL_VALIDATION",
          message: dateCheck.issues.map((i) => `${i.field}: ${i.message}`).join("; "),
        };
      }
      const outcome = this.staySync?.enabled()
        ? await this.staySync.sendInitial(
            hotelId,
            kind,
            payload,
            accessToken,
            declarationId,
            csltId,
            requireEnabled,
            baselineCiphertext,
            (hId, cId) => this.hasConflictingFacilityOwnership(hId, cId),
          )
        : await this.provider.submitDeclaration(kind, payload, accessToken);
      const latestAfterProvider = await this.repository.find(hotelId).catch(() => null);
      const cachedAfterProvider = this.sessions.get(hotelId);
      const sameGenerationAfterProvider = Boolean(
        latestAfterProvider &&
          latestAfterProvider.status === "CONNECTED" &&
          latestAfterProvider.csltId === csltId &&
          latestAfterProvider.ciphertext === baselineCiphertext &&
          cachedAfterProvider &&
          cachedAfterProvider.ciphertext === baselineCiphertext &&
          cachedAfterProvider.session.AccessToken === accessToken,
      );
      if (!sameGenerationAfterProvider && outcome.outcome === "BUSINESS_REJECTION") {
        return {
          outcome: "BUSINESS_REJECTION",
          code: "CONNECTION_SCOPE_CHANGED",
          message:
            "Phiên kết nối BCA đã thay đổi trong lúc gửi; hệ thống sẽ tự gửi lại theo kết nối mới.",
        };
      }
      const authRejected = /^(401|403|HTTP_401|HTTP_403|KBTT_AUTH_FAILED)$/.test(outcome.code);
      const rateLimited = KBTT_RATE_LIMIT_CODES.has(outcome.code);
      if (
        sameGenerationAfterProvider &&
        (outcome.outcome === "AMBIGUOUS" || authRejected || rateLimited)
      ) {
        const failed = cachedAfterProvider?.session;
        if (failed?.AccessToken === accessToken) {
          if (rateLimited) {
            await this.enterTemporaryDisconnectCooldown(
              hotelId,
              failed,
              "Hệ thống BCA đang giới hạn tần suất gửi hồ sơ. Tạm dừng gửi và tự kiểm tra lại sau thời gian chờ.",
              outcome.outcome !== "SUCCESS" ? outcome.retryAfterMs : undefined,
            );
          } else {
            await this.handleProviderSessionFailure(hotelId, failed, authRejected);
          }
        }
      }
      return outcome;
    } catch {
      const failedCached = this.sessions.get(hotelId);
      const failed = failedCached?.session;
      if (failed?.AccessToken === accessToken) {
        try {
          await this.handleProviderSessionFailure(hotelId, failed, false);
        } catch {
          this.logger.error("Could not persist BCA temporary disconnection after delivery failure.");
        }
      }
      return {
        outcome: "AMBIGUOUS",
        code: "INTERRUPTED_DELIVERY",
        message: "Lần gửi chưa rõ kết quả; cần đối soát trước khi gửi tiếp.",
      };
    }
  }

  async onModuleInit() {
    this.stayCheckInEventBus?.subscribe((event) => {
      void this.triggerCheckInBcaPush(event.hotelId, event.stayId).catch(() => {
        this.logger.error("Could not prepare background BCA check-in delivery.");
      });
    });

    const now = new Date();
    const runs = await this.repository.findPendingScheduledAutoSubmitRuns();
    for (const run of runs) {
      const trigger = (run.summaryJson as any)?.trigger;
      const isFuture = run.scheduledFor.getTime() > now.getTime();
      const resumableUnknown = (run.summaryJson as any)?.unknownResume?.day === toYmd(now, VIETNAM_TIME_ZONE);
      if (!isFuture && trigger !== "MANUAL_DELAYED" && !resumableUnknown) {
        try {
          await this.repository.finalizeAutoSubmitRun(run.id, {
            status: "CANCELLED",
            totalCount: 0,
            successCount: 0,
            failedCount: 0,
            unknownCount: 0,
            telegramSent: false,
            summaryJson: {
              ...(typeof run.summaryJson === "object" && run.summaryJson
                ? (run.summaryJson as Record<string, unknown>)
                : {}),
              reason: "STALE_ON_RESTART",
            } as Prisma.InputJsonValue,
          });
        } catch {
          // ignore stale cleanup error
        }
        continue;
      }
      if (
        trigger === "MANUAL_DELAYED" ||
        trigger === "CATCH_UP_10M" ||
        trigger === "CONTINUATION_30M" ||
        (typeof trigger === "string" && trigger.startsWith("CONTINUATION_"))
      ) {
        this.armScheduledRun(run);
      }
    }
  }

  private withOccupantDefaults(
    citizenshipKind: "VIETNAMESE" | "FOREIGN",
    data: Record<string, unknown>,
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
  ): Record<string, unknown> {
    return composeKbttDraft(citizenshipKind, data, occupant);
  }

  private compactDraft(
    citizenshipKind: "VIETNAMESE" | "FOREIGN",
    data: Record<string, unknown>,
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
  ): Prisma.InputJsonValue {
    return compactKbttDeclarationDraft(citizenshipKind, data, occupant) as Prisma.InputJsonValue;
  }

  private static readonly activeFacilityLocks = new Map<string, Promise<unknown>>();
  private static readonly activeFacilities = new Map<string, string>(); // key: `${origin}:${csltId}` -> hotelId

  private getNormalizedProviderOrigin(): string {
    const raw = (this.provider as any)?.getOrigin?.() ?? process.env.KBTT_BASE_URL ?? "";
    return String(raw).trim().replace(/\/+$/, "").toLowerCase();
  }

  private getFacilityKey(csltId: string): string {
    return `${this.getNormalizedProviderOrigin()}:${csltId.trim()}`;
  }

  private async serializeFacility<Result>(
    csltId: string,
    action: () => Promise<Result>,
  ): Promise<Result> {
    const key = this.getFacilityKey(csltId);
    const pending = (KbttService.activeFacilityLocks.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    KbttService.activeFacilityLocks.set(key, pending);
    try {
      return await pending;
    } finally {
      if (KbttService.activeFacilityLocks.get(key) === pending) {
        KbttService.activeFacilityLocks.delete(key);
      }
    }
  }

  private async hasConflictingFacilityOwnership(hotelId: string, csltId: string): Promise<boolean> {
    const normalizedCsltId = csltId.trim();
    if (!normalizedCsltId) return false;
    const key = this.getFacilityKey(normalizedCsltId);
    if (typeof this.repository.findConflictingFacilityConnections === "function") {
      const dbConflicts =
        (await this.repository.findConflictingFacilityConnections(normalizedCsltId, hotelId)) ?? [];
      if (dbConflicts.length > 0) {
        return true;
      }
      const activeOwner = KbttService.activeFacilities.get(key);
      if (activeOwner && activeOwner !== hotelId) {
        KbttService.activeFacilities.delete(key);
      }
      return false;
    }
    const activeOwner = KbttService.activeFacilities.get(key);
    return Boolean(activeOwner && activeOwner !== hotelId);
  }

  private async markFacilityConflictIfCurrent(hotelId: string, ciphertext: string) {
    this.cancelRecovery(hotelId);
    const cached = this.sessions.get(hotelId);
    if (cached?.ciphertext === ciphertext) {
      this.sessions.delete(hotelId);
      this.notifySessionEnded(hotelId, cached.session);
    }
    await this.updateConnectionIfCurrent(hotelId, ciphertext, {
      status: "DISCONNECTED",
      lastCheckedAt: new Date(),
      lastErrorCode: "KBTT_FACILITY_CONFLICT",
      lastErrorMessage:
        "Cơ sở lưu trú BCA này đang bị trùng liên kết với một khách sạn khác trên hệ thống; luồng gửi đã được chặn an toàn.",
    });
  }

  async get(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const connection = await this.repository.find(hotelId);
    if (
      connection &&
      connection.csltId &&
      (await this.hasConflictingFacilityOwnership(hotelId, connection.csltId))
    ) {
      return this.view({
        ...connection,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_FACILITY_CONFLICT",
        lastErrorMessage:
          "Cơ sở lưu trú BCA này đang bị trùng liên kết với một khách sạn khác trên hệ thống; luồng gửi đã được chặn an toàn.",
      });
    }
    return this.view(connection);
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
        connection = await this.serializeFacility(session.CsltId, async () => {
          if (await this.hasConflictingFacilityOwnership(hotelId, session.CsltId)) {
            throw new ConflictException({
              code: "KBTT_FACILITY_CONFLICT",
              message:
                "Cơ sở lưu trú BCA này đã được liên kết với một khách sạn khác trên hệ thống. Không thể dùng chung một cơ sở BCA cho nhiều khách sạn.",
            });
          }
          const payload = {
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
          };
          const saved = await this.repository.save(payload as any);
          for (const [fKey, owner] of KbttService.activeFacilities.entries()) {
            if (owner === hotelId) KbttService.activeFacilities.delete(fKey);
          }
          KbttService.activeFacilities.set(this.getFacilityKey(session.CsltId), hotelId);
          return saved;
        });
      } catch (error) {
        await this.revoke(session.AccessToken);
        throw error;
      }
      const previous = this.sessions.get(hotelId)?.session;
      await this.attachSession(hotelId, connection, session);
      if (previous && previous.AccessToken !== session.AccessToken)
        await this.revoke(previous.AccessToken);
      const latest = await this.repository.find(hotelId);
      if (latest?.status === "CONNECTED" && latest.autoSubmitEnabled) {
        void this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
      return this.view(latest);
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
      if (await this.hasConflictingFacilityOwnership(hotelId, connection.csltId)) {
        await this.markFacilityConflictIfCurrent(hotelId, connection.ciphertext);
        throw new ConflictException({
          code: "KBTT_FACILITY_CONFLICT",
          message:
            "Cơ sở lưu trú BCA này đang bị trùng liên kết với một khách sạn khác trên hệ thống; cần hủy kết nối trùng trước khi tiếp tục.",
        });
      }
      const cached = this.sessions.get(hotelId);
      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection);
      } catch (error) {
        const failure = stableKbttError(error);
        if (cached) {
          await this.handleProviderSessionFailure(
            hotelId,
            cached.session,
            failure.authenticationFailed,
          );
        }
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
      KbttService.activeFacilities.set(this.getFacilityKey(session.CsltId), hotelId);
      await this.attachSession(hotelId, updated, session);
      if (cached && cached.session.AccessToken !== session.AccessToken)
        await this.revoke(cached.session.AccessToken);
      const latest = await this.repository.find(hotelId);
      if (latest?.status === "CONNECTED" && latest.autoSubmitEnabled) {
        void this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
      return this.view(latest);
    });
  }

  async disconnect(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    this.cancelRecovery(hotelId);
    return this.serialize(hotelId, async () => {
      this.cancelRecovery(hotelId);
      await this.cancelHotelAutomatedScheduledRuns(hotelId, "USER_DISCONNECTED");
      const cached = this.sessions.get(hotelId);
      try {
        await this.repository.remove(hotelId);
      } finally {
        this.sessions.delete(hotelId);
        for (const [fKey, owner] of KbttService.activeFacilities.entries()) {
          if (owner === hotelId) KbttService.activeFacilities.delete(fKey);
        }
        if (cached) {
          this.notifySessionEnded(hotelId, cached.session);
          void this.revoke(cached.session.AccessToken);
        }
      }
      return this.view(null);
    });
  }

  onModuleDestroy() {
    for (const recovery of this.recoveries.values()) recovery.controller.abort();
    this.recoveries.clear();
    for (const timer of this.cooldownTimers.values()) clearTimeout(timer);
    this.cooldownTimers.clear();
    this.healthProbes.clear();
    this.unknownReconciliations.clear();
    this.unknownReconciliationCursors.clear();
    this.unknownWorkCheckCursors.clear();
    this.unsentWorkCheckCursors.clear();
    this.autoSubmitResumeCursors.clear();
    for (const revocation of this.revocations.values()) revocation.controller.abort();
    this.revocations.clear();
    this.sessionEnded.clear();
    for (const hotelId of this.sessions.keys()) {
      for (const [fKey, owner] of KbttService.activeFacilities.entries()) {
        if (owner === hotelId) KbttService.activeFacilities.delete(fKey);
      }
    }
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
    const task = this.provider
      .revoke(accessToken, controller.signal)
      .catch(() => {
        if (!controller.signal.aborted)
          this.logger.warn(
            "BCA token revocation failed after bounded retries; local session is cleared.",
          );
      })
      .finally(() => {
        if (this.revocations.get(accessToken)?.task === task)
          this.revocations.delete(accessToken);
      });
    this.revocations.set(accessToken, { controller, task });
  }

  onSessionEnded(listener: (hotelId: string, session: KbttSession) => void) {
    this.sessionEnded.add(listener);
    return () => {
      this.sessionEnded.delete(listener);
    };
  }

  private notifySessionEnded(hotelId: string, session: KbttSession) {
    for (const listener of this.sessionEnded) {
      try {
        listener(hotelId, session);
      } catch {
        this.logger.error("Could not clear a BCA dependent view; local session remains disabled.");
      }
    }
  }

  private cancelRecovery(hotelId: string) {
    this.recoveries.get(hotelId)?.controller.abort();
    this.recoveries.delete(hotelId);
    const cooldownTimer = this.cooldownTimers.get(hotelId);
    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      this.cooldownTimers.delete(hotelId);
    }
  }

  private async attachSession(
    hotelId: string,
    connection: KbttHotelConnection,
    session: KbttSession,
  ) {
    const previous = this.sessions.get(hotelId);
    this.cancelRecovery(hotelId);
    if (previous && previous.session !== session) this.notifySessionEnded(hotelId, previous.session);
    const cached: {
      ciphertext: string;
      session: KbttSession;
      profile?: KbttConnectionProfile;
      cooldownUntil?: number;
    } = { ciphertext: connection.ciphertext, session };
    this.sessions.set(hotelId, cached);
    const profile = await this.readConnectionProfile(session);
    if (this.sessions.get(hotelId) !== cached) return;
    cached.profile = profile;
    if (profile.state === "FAILED") {
      await this.recoverReadSession(
        hotelId,
        session,
        async (signal) => {
          const next = await this.readConnectionProfile(session, signal);
          if (this.sessions.get(hotelId) === cached && next.state === "READY") cached.profile = next;
          return next.state === "READY";
        },
        profile.error?.code === "KBTT_AUTH_FAILED",
      );
    }
  }

  async markAuthFailedSession(hotelId: string, session: KbttSession) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session !== session) return;
    this.cancelRecovery(hotelId);
    this.sessions.delete(hotelId);
    this.notifySessionEnded(hotelId, session);
    await this.updateConnectionIfCurrent(hotelId, cached.ciphertext, {
      status: "AUTH_FAILED",
      lastCheckedAt: new Date(),
      lastErrorCode: "KBTT_AUTH_FAILED",
      lastErrorMessage: KBTT_AUTH_FAILED_MESSAGE,
    });
  }

  async enterTemporaryDisconnectCooldown(
    hotelId: string,
    session: KbttSession,
    message = "Tạm ngắt kết nối BCA. Hệ thống tạm dừng gửi 60 giây và sẽ tự kiểm tra lại khi có hồ sơ chờ gửi.",
    customCooldownMs?: number,
  ) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session !== session) return;
    this.cancelRecovery(hotelId);
    const delayMs =
      customCooldownMs !== undefined && Number.isFinite(customCooldownMs) && customCooldownMs > 0
        ? Math.min(KBTT_TEMP_DISCONNECT_COOLDOWN_MS, Math.max(1_000, customCooldownMs))
        : KBTT_TEMP_DISCONNECT_COOLDOWN_MS;
    const cooldownUntil = Date.now() + delayMs;
    cached.cooldownUntil = cooldownUntil;
    const updated = await this.updateConnectionIfCurrent(hotelId, cached.ciphertext, {
      status: "DISCONNECTED",
      lastCheckedAt: new Date(),
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
      lastErrorMessage: message,
    });
    if (!updated || this.sessions.get(hotelId) !== cached) return;
    this.armCooldownHealthProbe(hotelId, cached);
  }

  private armCooldownHealthProbe(
    hotelId: string,
    cached: { ciphertext: string; session: KbttSession; cooldownUntil?: number },
  ) {
    const existing = this.cooldownTimers.get(hotelId);
    if (existing) clearTimeout(existing);
    const delayMs = Math.max(0, (cached.cooldownUntil ?? Date.now()) - Date.now());
    const timer = setTimeout(() => {
      this.cooldownTimers.delete(hotelId);
      if (this.sessions.get(hotelId) !== cached) return;
      void this.probeTemporarilyDisconnectedSession(hotelId, false).catch(() => false);
    }, delayMs);
    if (typeof timer.unref === "function") timer.unref();
    this.cooldownTimers.set(hotelId, timer);
  }

  async handleProviderSessionFailure(
    hotelId: string,
    session: KbttSession,
    authRejected = false,
  ) {
    if (authRejected) {
      await this.markAuthFailedSession(hotelId, session);
      return;
    }
    await this.enterTemporaryDisconnectCooldown(hotelId, session);
  }

  async disconnectFailedSession(hotelId: string, session: KbttSession, authRejected = false) {
    await this.handleProviderSessionFailure(hotelId, session, authRejected);
  }

  async recoverReadSession(
    hotelId: string,
    session: KbttSession,
    retry: (signal: AbortSignal) => Promise<boolean>,
    authenticationFailed = false,
  ) {
    const cached = this.sessions.get(hotelId);
    if (cached?.session !== session || this.recoveries.has(hotelId)) return;
    if (authenticationFailed) {
      await this.markAuthFailedSession(hotelId, session);
      return;
    }
    const recovery: { session: KbttSession; controller: AbortController; task?: Promise<void> } = {
      session,
      controller: new AbortController(),
    };
    this.recoveries.set(hotelId, recovery);
    try {
      const connection = await this.repository.find(hotelId);
      if (
        !connection ||
        connection.ciphertext !== cached.ciphertext ||
        connection.status !== "CONNECTED"
      ) {
        this.recoveries.delete(hotelId);
        return;
      }
      await this.repository.update(connection, {
        status: "DISCONNECTED",
        lastCheckedAt: new Date(),
        lastErrorCode: "KBTT_RETRY_PENDING",
        lastErrorMessage: "Mất kết nối BCA. Hệ thống đang thử lại.",
      });
      recovery.task = (async () => {
        try {
          for (let attempt = 0; attempt < KBTT_READ_RETRIES; attempt++) {
            await waitForKbttRetry(recovery.controller.signal);
            if (this.sessions.get(hotelId) !== cached) return;
            const current = await this.repository.find(hotelId);
            if (
              !current ||
              current.status !== "DISCONNECTED" ||
              current.ciphertext !== cached.ciphertext ||
              current.lastErrorCode !== "KBTT_RETRY_PENDING"
            ) {
              return;
            }
            let recovered = false;
            try {
              recovered = await withKbttDeadline(retry, recovery.controller.signal);
            } catch (retryErr) {
              if (recovery.controller.signal.aborted) return;
              if (stableKbttError(retryErr).authenticationFailed) {
                await this.markAuthFailedSession(hotelId, session);
                return;
              }
            }
            if (recovery.controller.signal.aborted || this.sessions.get(hotelId) !== cached) return;
            if (recovered) {
              const latest = await this.repository.find(hotelId);
              if (
                !latest ||
                latest.status !== "DISCONNECTED" ||
                latest.ciphertext !== cached.ciphertext ||
                latest.lastErrorCode !== "KBTT_RETRY_PENDING"
              ) {
                return;
              }
              cached.cooldownUntil = undefined;
              await this.repository.update(latest, {
                status: "CONNECTED",
                lastCheckedAt: new Date(),
                lastErrorCode: null,
                lastErrorMessage: null,
              });
              if (latest.autoSubmitEnabled) {
                await this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
                await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
              }
              return;
            }
          }
          if (!recovery.controller.signal.aborted && this.sessions.get(hotelId) === cached) {
            await this.enterTemporaryDisconnectCooldown(hotelId, session);
          }
        } catch {
          if (!recovery.controller.signal.aborted && this.sessions.get(hotelId) === cached) {
            try {
              await this.enterTemporaryDisconnectCooldown(hotelId, session);
            } catch {
              this.logger.error("Could not persist BCA temporary disconnection.");
            }
          }
        } finally {
          if (this.recoveries.get(hotelId) === recovery) this.recoveries.delete(hotelId);
        }
      })();
    } catch (error) {
      if (this.recoveries.get(hotelId) === recovery) this.recoveries.delete(hotelId);
      await this.enterTemporaryDisconnectCooldown(hotelId, session);
      throw error;
    }
  }

  async runDueCooldownHealthProbes(now: Date = new Date()) {
    const tasks: Array<Promise<unknown>> = [];
    for (const [hotelId, cached] of this.sessions.entries()) {
      if (cached.cooldownUntil && now.getTime() >= cached.cooldownUntil) {
        tasks.push(this.probeTemporarilyDisconnectedSession(hotelId, false).catch(() => false));
      } else if (!cached.cooldownUntil && !this.recoveries.has(hotelId) && !this.healthProbes.has(hotelId)) {
        tasks.push(
          (async () => {
            const connection = await this.repository.find(hotelId).catch(() => null);
            if (
              !connection ||
              connection.status !== "CONNECTED" ||
              !connection.autoSubmitEnabled ||
              connection.ciphertext !== cached.ciphertext
            ) {
              return;
            }
            if (await this.hasPendingUnknownWork(hotelId)) {
              await this.reconcilePendingUnknownDeclarationsForHotel(hotelId, false, now);
            }
          })().catch(() => null),
        );
      }
    }
    if (tasks.length > 0) await Promise.allSettled(tasks);
  }

  async probeTemporarilyDisconnectedSession(
    hotelId: string,
    forceExplicitRead = false,
  ): Promise<boolean> {
    const existingProbe = this.healthProbes.get(hotelId);
    if (existingProbe) return existingProbe;

    const probe = (async () => {
      const cached = this.sessions.get(hotelId);
      if (!cached || this.recoveries.has(hotelId)) return false;
      if (cached.cooldownUntil && Date.now() < cached.cooldownUntil) {
        return false;
      }
      const connection = await this.repository.find(hotelId).catch(() => null);
      if (
        !connection ||
        connection.ciphertext !== cached.ciphertext ||
        connection.status !== "DISCONNECTED" ||
        connection.lastErrorCode !== "KBTT_TEMP_DISCONNECTED"
      ) {
        return false;
      }
      if (!forceExplicitRead) {
        if (!connection.autoSubmitEnabled) return false;
        const [hasSafeWork, hasUnknownWork] = await Promise.all([
          this.hasEligibleSameDayUnsentWork(hotelId),
          this.hasPendingUnknownWork(hotelId),
        ]);
        if (!hasSafeWork && !hasUnknownWork) return false;
      }

      let activeSession = cached.session;
      let refreshed = false;
      try {
        if (activeSession.Exp * 1000 <= Date.now() + 60_000) {
          activeSession = await this.provider.refresh(activeSession.RefreshToken);
          refreshed = true;
        }
        if (activeSession.CsltId !== connection.csltId) {
          await this.markAuthFailedSession(hotelId, cached.session);
          return false;
        }
        if (this.providerRead) {
          const profile = await this.readConnectionProfile(activeSession);
          if (profile.state !== "READY") {
            if (profile.error?.code === "KBTT_AUTH_FAILED") {
              await this.markAuthFailedSession(hotelId, cached.session);
            } else if (this.sessions.get(hotelId) === cached) {
              await this.enterTemporaryDisconnectCooldown(hotelId, cached.session);
            }
            return false;
          }
          if (this.sessions.get(hotelId) === cached) {
            cached.profile = profile;
          }
        } else if (!refreshed) {
          activeSession = await this.provider.refresh(activeSession.RefreshToken);
          refreshed = true;
        }
      } catch (err) {
        const failure = stableKbttError(err);
        if (failure.authenticationFailed) {
          await this.markAuthFailedSession(hotelId, cached.session);
        } else if (this.sessions.get(hotelId) === cached) {
          await this.enterTemporaryDisconnectCooldown(hotelId, cached.session);
        }
        return false;
      }

      if (this.sessions.get(hotelId) !== cached) {
        if (refreshed && activeSession.AccessToken !== cached.session.AccessToken) {
          await this.revoke(activeSession.AccessToken);
        }
        return false;
      }
      const latest = await this.repository.find(hotelId).catch(() => null);
      if (
        !latest ||
        latest.ciphertext !== cached.ciphertext ||
        latest.status !== "DISCONNECTED" ||
        latest.csltId !== activeSession.CsltId
      ) {
        if (refreshed && activeSession.AccessToken !== cached.session.AccessToken) {
          await this.revoke(activeSession.AccessToken);
        }
        return false;
      }

      const oldToken = cached.session.AccessToken;
      cached.session = activeSession;
      cached.cooldownUntil = undefined;
      await this.repository.update(latest, {
        ...kbttMetadata(activeSession),
        status: "CONNECTED",
        lastCheckedAt: new Date(),
        lastConnectedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      if (refreshed && oldToken !== activeSession.AccessToken) {
        await this.revoke(oldToken);
      }
      if (latest.autoSubmitEnabled) {
        await this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
      return true;
    })();

    this.healthProbes.set(hotelId, probe);
    try {
      return await probe;
    } finally {
      if (this.healthProbes.get(hotelId) === probe) {
        this.healthProbes.delete(hotelId);
      }
    }
  }

  private getOccupantArrivalInstant(
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
  ): Date | null {
    const raw =
      (occupant as any).checkedInAt ??
      (occupant as any).stay?.checkedInAt ??
      (occupant as any).plannedCheckInAt ??
      (occupant as any).stay?.plannedCheckInAt;
    if (!raw) return null;
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getOccupantArrivalVietnamYmd(
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
    draft?: Record<string, unknown> | null,
  ): string | null {
    const arrivalInstant = this.getOccupantArrivalInstant(occupant);
    const stayYmd = arrivalInstant ? toYmd(arrivalInstant, VIETNAM_TIME_ZONE) : null;
    if (stayYmd) return stayYmd;
    const draftStr = typeof draft?.ngayDenCsltStr === "string" ? draft.ngayDenCsltStr.trim() : "";
    return /^\d{4}-\d{2}-\d{2}/.test(draftStr) ? draftStr.slice(0, 10) : null;
  }

  private hasMismatchedDraftArrivalVietnamYmd(
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
    draft?: Record<string, unknown> | null,
  ): boolean {
    const arrivalInstant = this.getOccupantArrivalInstant(occupant);
    const stayYmd = arrivalInstant ? toYmd(arrivalInstant, VIETNAM_TIME_ZONE) : null;
    const draftStr = typeof draft?.ngayDenCsltStr === "string" ? draft.ngayDenCsltStr.trim() : "";
    const draftYmd = /^\d{4}-\d{2}-\d{2}/.test(draftStr) ? draftStr.slice(0, 10) : null;
    return Boolean(stayYmd && draftYmd && stayYmd !== draftYmd);
  }

  private isDeclarationEligibleForAutoCatchUp(
    occupant:
      | NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>
      | ActiveStayOccupantRow,
    declaration: KbttGuestDeclaration | null | undefined,
    nowOrContext: Date | string | KbttSubmissionDateContext,
    cutoffInstant?: Date | null,
  ): boolean {
    const kind = declaration?.declarationKind ?? occupant.citizenshipKind;
    if (!kind) return false;
    const context =
      typeof nowOrContext === "string"
        ? {
            todayYmd: nowOrContext,
            yesterdayYmd: addDaysYmd(nowOrContext, -1),
            todayStartStr: `${nowOrContext} 00:00:00`,
            yesterdayStartStr: `${addDaysYmd(nowOrContext, -1)} 00:00:00`,
            tomorrowStartStr: `${addDaysYmd(nowOrContext, 1)} 00:00:00`,
          }
        : nowOrContext instanceof Date
          ? getKbttSubmissionDateContext(nowOrContext)
          : nowOrContext;
    const arrivalInstant = this.getOccupantArrivalInstant(occupant);
    if (cutoffInstant && arrivalInstant && arrivalInstant.getTime() > cutoffInstant.getTime()) {
      return false;
    }
    const draft = declaration
      ? this.declarationDraft(declaration, occupant)
      : this.withOccupantDefaults(kind, {}, occupant);
    if (this.hasMismatchedDraftArrivalVietnamYmd(occupant, draft)) {
      return false;
    }
    const arrivalYmd = this.getOccupantArrivalVietnamYmd(occupant, draft);
    if (!arrivalYmd || arrivalYmd > context.todayYmd) {
      return false;
    }
    const dateCheck = validateKbttSubmissionDates(kind, normalizeKbttSubmissionDates(kind, draft, context), context, {
      enforceArrivalWindow: true,
    });
    if (dateCheck.outOfWindow) {
      return false;
    }
    if (!declaration) return true;
    if (
      declaration.status === "SUBMITTED" ||
      declaration.status === "UNKNOWN" ||
      declaration.status === "CANCELLED"
    ) {
      return false;
    }
    if (declaration.status === "READY" && declaration.providerCode === "LOCAL_QUEUED") {
      return false;
    }
    if (declaration.status === "DRAFT" || declaration.status === "READY") {
      return true;
    }
    if (declaration.status === "FAILED") {
      if (KBTT_TRANSIENT_OR_PAUSED_CODES.has(declaration.providerCode ?? "")) {
        return true;
      }
      if (!declaration.submittedPayloadFingerprint) {
        return true;
      }
      const normalized = normalizeKbttSubmissionDates(kind, draft, context);
      const ready = (kind === "VIETNAMESE" ? kbttVietnameseReadySchema : kbttForeignReadySchema).safeParse(normalized);
      const lastAttemptAt = declaration.attemptedAt ?? declaration.updatedAt;
      const confirmedProviderFailure = /^(?:HTTP_)?[1-5]\d{2}$/.test(declaration.providerCode ?? "");
      if (confirmedProviderFailure && ready.success && dateCheck.valid && lastAttemptAt &&
          toYmd(lastAttemptAt, VIETNAM_TIME_ZONE) < context.todayYmd) {
        return true;
      }
      const currentFp = createHash("sha256")
        .update(JSON.stringify([ready.success ? ready.data : normalized]))
        .digest("hex");
      return currentFp !== declaration.submittedPayloadFingerprint;
    }
    return false;
  }

  async hasPendingUnknownWork(hotelId: string, now: Date = new Date()): Promise<boolean> {
    if (!this.occupantsReadService) return false;
    const todayYmd = toYmd(now, VIETNAM_TIME_ZONE);
    const yesterdayYmd = addDaysYmd(todayYmd, -1);
    const minWindowDay = addDaysYmd(todayYmd, -29);
    const recentStart = getDayBounds(yesterdayYmd, VIETNAM_TIME_ZONE).start;
    const todayEnd = getDayBounds(todayYmd, VIETNAM_TIME_ZONE).end;
    const windowStart = getDayBounds(minWindowDay, VIETNAM_TIME_ZONE).start;

    const cohorts = [
      { key: `${hotelId}:recent`, arrivalStart: recentStart, arrivalEnd: todayEnd },
      { key: `${hotelId}:window`, arrivalStart: windowStart, arrivalEnd: recentStart },
    ];
    const pageSize = 100;
    const maxPages = 50;
    let pagesUsed = 0;

    for (const cohort of cohorts) {
      const savedCursor = this.unknownWorkCheckCursors.get(cohort.key);
      let cursor: string | undefined = savedCursor;
      let wrapped = !savedCursor;

      while (pagesUsed < maxPages) {
        pagesUsed++;
        const res = await this.occupantsReadService.getActiveStayOccupantsPaged(hotelId, {
          cursor,
          take: pageSize,
          arrivalStart: cohort.arrivalStart,
          arrivalEnd: cohort.arrivalEnd,
          kbttFilter: "UNKNOWN_ONLY",
        });
        const items = res?.items ?? [];
        if (items.length > 0) {
          const decls = await this.repository.findDeclarationsByHotel(
            hotelId,
            items.map((i) => i.id),
          );
          const declMap = new Map<string, KbttGuestDeclaration>();
          for (const d of decls) {
            if (!declMap.has(d.occupantId)) declMap.set(d.occupantId, d);
          }
          for (const occ of items) {
            if (declMap.get(occ.id)?.status === "UNKNOWN") {
              if (res?.nextCursor) {
                this.unknownWorkCheckCursors.set(cohort.key, res.nextCursor);
              } else {
                this.unknownWorkCheckCursors.delete(cohort.key);
              }
              return true;
            }
          }
        }
        if (res?.nextCursor && items.length > 0) {
          cursor = res.nextCursor;
          if (pagesUsed >= maxPages) {
            this.unknownWorkCheckCursors.set(cohort.key, cursor);
            // Capped before reaching EOF of the DB cohort: never report a false absence.
            return true;
          }
        } else {
          this.unknownWorkCheckCursors.delete(cohort.key);
          if (!wrapped && pagesUsed < maxPages) {
            wrapped = true;
            cursor = undefined;
            continue;
          }
          break;
        }
      }
    }
    return false;
  }

  private normalizeProviderReconciliationRow(
    value: unknown,
    kind: ReconciliationKind,
    csltId: string,
    active: boolean,
  ): ProviderReconciliationGuest {
    const row =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    const rawCslt =
      row?.csltId ??
      (row?.cslt && typeof row.cslt === "object" ? (row.cslt as any).id : undefined);
    const scope =
      typeof rawCslt === "number" && Number.isSafeInteger(rawCslt) && rawCslt > 0
        ? String(rawCslt)
        : typeof rawCslt === "string" && /^\d{1,32}$/.test(rawCslt.trim())
          ? rawCslt.trim()
          : null;
    if (!row || !str(row.id) || !str(row.hoTen) || scope !== csltId) {
      throw new KbttProviderReadError(
        "INCOMPLETE",
        "BCA record has invalid identity or accommodation scope",
      );
    }
    const parseProviderInstant = (rawVal: unknown): string | null => {
      const s = str(rawVal);
      if (!s) return null;
      try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return plainDateAtTime(s, "00:00:00", VIETNAM_TIME_ZONE).toISOString();
        }
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
          return plainDateAtTime(s.slice(0, 10), s.slice(11), VIETNAM_TIME_ZONE).toISOString();
        }
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      } catch {
        return null;
      }
    };
    const arrival = parseProviderInstant(row.ngayDenCslt);
    const identity = str(kind === "VIETNAMESE" ? row.soGiayTo : row.soHoChieu);
    const qualifier =
      kind === "VIETNAMESE"
        ? typeof row.loaiGiayTo === "number" &&
          Number.isSafeInteger(row.loaiGiayTo) &&
          row.loaiGiayTo > 0
        : Boolean(str(row.quocTich));
    if (!identity || !arrival || !qualifier) {
      throw new KbttProviderReadError(
        "INCOMPLETE",
        "BCA record lacks verified document or arrival fields",
      );
    }
    const departureText = str(row.ngayDiCslt);
    const departure = parseProviderInstant(row.ngayDiCslt);
    if (departureText && !departure) {
      throw new KbttProviderReadError("INCOMPLETE", "Invalid BCA departure timestamp");
    }
    return {
      id: str(row.id)!,
      kind,
      csltId,
      fullName: str(row.hoTen)!,
      identityNumber: identity,
      documentType:
        typeof row.loaiGiayTo === "number" && Number.isSafeInteger(row.loaiGiayTo)
          ? row.loaiGiayTo
          : null,
      nationality: str(row.quocTich),
      arrivalDay: reconciliationArrivalDay(arrival),
      checkedInAt: arrival,
      plannedCheckOutAt: parseProviderInstant(row.ngayDiDuKien),
      checkedOutAt: departure,
      departed: Boolean(departure),
      roomNumber: str(row.soPhong),
      isActive: active && !departure,
    };
  }

  private isDeclarationClaimActive(
    declaration: KbttGuestDeclaration,
    now: Date = new Date(),
  ): boolean {
    if (this.initialDeliveries.has(declaration.id)) {
      return true;
    }
    const claimToken = (declaration as any).claimToken as string | null | undefined;
    if (!claimToken) return false;
    const attemptedAtRaw =
      ((declaration as any).attemptedAt as Date | string | null | undefined) ??
      declaration.updatedAt;
    const attemptedAt =
      attemptedAtRaw instanceof Date ? attemptedAtRaw : new Date(attemptedAtRaw ?? 0);
    if (Number.isNaN(attemptedAt.getTime())) return false;
    return now.getTime() - attemptedAt.getTime() < 5 * 60_000;
  }

  private async readCoalescedProviderHistoryDay(
    csltId: string,
    ciphertext: string,
    kind: ReconciliationKind,
    dayYmd: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const nowMs = Date.now();
    for (const [k, cached] of this.historyDayCache.entries()) {
      if (cached.expiresAt <= nowMs) this.historyDayCache.delete(k);
    }
    const cacheKey = `${csltId}:${ciphertext}:${kind}:${dayYmd}`;
    const existing = this.historyDayCache.get(cacheKey);
    if (existing && existing.expiresAt > nowMs) {
      return existing.rows;
    }
    const rowsPromise = this.providerRead!
      .readAllHistory(kind, accessToken, { dateFrom: dayYmd, dateTo: dayYmd }, signal)
      .catch((err) => {
        if (this.historyDayCache.get(cacheKey)?.rows === rowsPromise) {
          this.historyDayCache.delete(cacheKey);
        }
        throw err;
      });
    if (this.historyDayCache.size >= 200) {
      const oldestKey = this.historyDayCache.keys().next().value;
      if (oldestKey) this.historyDayCache.delete(oldestKey);
    }
    this.historyDayCache.set(cacheKey, {
      expiresAt: nowMs + 30_000,
      rows: rowsPromise,
    });
    return rowsPromise;
  }

  async reconcilePendingUnknownDeclarationsForHotel(
    hotelId: string,
    forceExplicit = false,
    now: Date = new Date(),
    resume?: { day: string; recent?: string; window?: string; next?: string },
  ): Promise<{
    settledCount: number;
    retryScheduledCount: number;
    remainingUnknownCount: number;
    incomplete?: boolean;
    nextCursor?: string | null;
  }> {
    const existingTask = this.unknownReconciliations.get(hotelId);
    if (existingTask) return existingTask;

    const task = (async () => {
      if (!this.providerRead || !this.occupantsReadService) {
        return { settledCount: 0, retryScheduledCount: 0, remainingUnknownCount: 0 };
      }
      await this.repository.recoverInterruptedDeclarations?.(
        hotelId,
        new Date(now.getTime() - 5 * 60_000),
      );
      const connection = await this.repository.find(hotelId).catch(() => null);
      const cached = this.sessions.get(hotelId);
      if (
        !connection ||
        connection.status !== "CONNECTED" ||
        (!forceExplicit && !connection.autoSubmitEnabled) ||
        !cached ||
        cached.ciphertext !== connection.ciphertext ||
        cached.session.CsltId !== connection.csltId ||
        this.recoveries.has(hotelId)
      ) {
        return { settledCount: 0, retryScheduledCount: 0, remainingUnknownCount: 0 };
      }
      let hasFacilityConflict = false;
      try {
        hasFacilityConflict = await this.hasConflictingFacilityOwnership(hotelId, connection.csltId);
      } catch {
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: 0,
          incomplete: true,
        };
      }
      if (hasFacilityConflict) {
        await this.markFacilityConflictIfCurrent(hotelId, connection.ciphertext);
        return { settledCount: 0, retryScheduledCount: 0, remainingUnknownCount: 0 };
      }

      const todayYmd = toYmd(now, VIETNAM_TIME_ZONE);
      const yesterdayYmd = addDaysYmd(todayYmd, -1);
      const minWindowDay = addDaysYmd(todayYmd, -29);
      if (this.unknownReconciliationCursors.get(`${hotelId}:day`) !== todayYmd) {
        for (const key of ["recent", "window", "next"]) {
          this.unknownReconciliationCursors.delete(`${hotelId}:${key}`);
        }
        this.unknownReconciliationCursors.set(`${hotelId}:day`, todayYmd);
      }
      if (resume?.day === todayYmd) {
        if (resume.next === "window") this.unknownReconciliationCursors.set(`${hotelId}:next`, "window");
        for (const cohort of ["recent", "window"] as const) {
          const cursor = resume[cohort];
          if (cursor) this.unknownReconciliationCursors.set(`${hotelId}:${cohort}`, cursor);
        }
      }
      const recentStart = getDayBounds(yesterdayYmd, VIETNAM_TIME_ZONE).start;
      const todayEnd = getDayBounds(todayYmd, VIETNAM_TIME_ZONE).end;
      const windowStart = getDayBounds(minWindowDay, VIETNAM_TIME_ZONE).start;

      const cohorts = [
        { key: `${hotelId}:recent`, arrivalStart: recentStart, arrivalEnd: todayEnd },
        { key: `${hotelId}:window`, arrivalStart: windowStart, arrivalEnd: recentStart },
      ];
      const occupants: ActiveStayOccupantRow[] = [];
      const seenOccupantIds = new Set<string>();
      const maxPages = 20;
      let pagesUsed = 0;
      let hasMoreUnknownPages = false;
      let nextResumeCursor: string | null = null;

      const startCohort = this.unknownReconciliationCursors.get(`${hotelId}:next`) === "window" ? 1 : 0;
      for (const cohort of cohorts.slice(startCohort)) {
        if (pagesUsed >= maxPages) {
          hasMoreUnknownPages = true;
          if (!this.unknownReconciliationCursors.has(`${hotelId}:next`)) {
            this.unknownReconciliationCursors.set(`${hotelId}:next`, "window");
          }
          break;
        }
        const savedCursor = this.unknownReconciliationCursors.get(cohort.key);
        let cursor: string | undefined = savedCursor;

        while (pagesUsed < maxPages) {
          pagesUsed++;
          const res = await this.occupantsReadService.getActiveStayOccupantsPaged(hotelId, {
            cursor,
            take: 500,
            arrivalStart: cohort.arrivalStart,
            arrivalEnd: cohort.arrivalEnd,
            kbttFilter: "UNKNOWN_ONLY",
          });
          const items = res?.items ?? [];
          for (const item of items) {
            if (!seenOccupantIds.has(item.id)) {
              seenOccupantIds.add(item.id);
              occupants.push(item);
            }
          }
          if (res?.nextCursor && items.length > 0) {
            cursor = res.nextCursor;
            if (pagesUsed >= maxPages) {
              hasMoreUnknownPages = true;
              nextResumeCursor = cursor;
              this.unknownReconciliationCursors.set(cohort.key, cursor);
              this.unknownReconciliationCursors.set(`${hotelId}:next`, cohort.key.endsWith(":window") ? "window" : "recent");
              break;
            }
          } else {
            this.unknownReconciliationCursors.delete(cohort.key);
            this.unknownReconciliationCursors.delete(`${hotelId}:next`);
            break;
          }
        }
      }

      const scheduleBoundedUnknownContinuationIfNeeded = async () => {
        if (
          !hasMoreUnknownPages ||
          !connection.autoSubmitEnabled ||
          process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
          process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true" ||
          !this.repository.createScheduledAutoSubmitRun
        ) {
          return;
        }
        try {
          const nextBoundary = computeVietnamNextTenMinuteBoundary(now);
          const unknownResume = {
            day: todayYmd,
            recent: this.unknownReconciliationCursors.get(`${hotelId}:recent`),
            window: this.unknownReconciliationCursors.get(`${hotelId}:window`),
            next: this.unknownReconciliationCursors.get(`${hotelId}:next`),
          };
          const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
          const existing = pending.find(
            (r) =>
              r.status === "RUNNING" &&
              r.scheduledFor.getTime() === nextBoundary.getTime(),
          );
          if (existing) {
            await this.repository.saveUnknownContinuation(existing.id, unknownResume);
            this.armScheduledRun(existing);
            return;
          }
          const run = await this.repository.createScheduledAutoSubmitRun(
            hotelId,
            nextBoundary,
            false,
            "CONTINUATION_UNKNOWN",
            {
              cutoffAt: nextBoundary.toISOString(),
              unknownResume: {
                day: todayYmd,
                recent: this.unknownReconciliationCursors.get(`${hotelId}:recent`),
                window: this.unknownReconciliationCursors.get(`${hotelId}:window`),
                next: this.unknownReconciliationCursors.get(`${hotelId}:next`),
              },
            },
          );
          if (run) {
            await this.repository.saveUnknownContinuation(run.id, unknownResume);
            this.armScheduledRun(run);
          }
        } catch {
          // non-blocking continuation registration
        }
      };

      if (occupants.length === 0) {
        await scheduleBoundedUnknownContinuationIfNeeded();
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: 0,
          ...(hasMoreUnknownPages
            ? { incomplete: true, ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}) }
            : {}),
        };
      }

      const declarations = await this.repository.findDeclarationsByHotel(
        hotelId,
        occupants.map((o) => o.id),
      );
      const declByOccupant = new Map<string, KbttGuestDeclaration>();
      for (const d of declarations) {
        if (!declByOccupant.has(d.occupantId)) declByOccupant.set(d.occupantId, d);
      }
      const allUnknownDeclarations = occupants
        .map((occ) => ({ occupant: occ, declaration: declByOccupant.get(occ.id) ?? null }))
        .filter(
          (item): item is { occupant: ActiveStayOccupantRow; declaration: KbttGuestDeclaration } =>
            item.declaration?.status === "UNKNOWN",
        );

      if (allUnknownDeclarations.length === 0) {
        await scheduleBoundedUnknownContinuationIfNeeded();
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: 0,
          ...(hasMoreUnknownPages
            ? { incomplete: true, ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}) }
            : {}),
        };
      }

      // Skip declarations that currently have an active in-flight claim across processes or in-memory.
      const reconcilableUnknowns = allUnknownDeclarations.filter(
        ({ declaration }) => !this.isDeclarationClaimActive(declaration, now),
      );
      const fencedInFlightCount = allUnknownDeclarations.length - reconcilableUnknowns.length;
      if (reconcilableUnknowns.length === 0) {
        await scheduleBoundedUnknownContinuationIfNeeded();
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: fencedInFlightCount,
          ...(hasMoreUnknownPages
            ? { incomplete: true, ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}) }
            : {}),
        };
      }

      let activeSession: KbttSession;
      try {
        activeSession = await this.getOrRefreshSession(hotelId, connection);
      } catch {
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: allUnknownDeclarations.length,
          incomplete: true,
          ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}),
        };
      }

      const neededDaysByKind: Record<ReconciliationKind, Set<string>> = {
        VIETNAMESE: new Set<string>(),
        FOREIGN: new Set<string>(),
      };
      const neededKinds = new Set<ReconciliationKind>();
      for (const { occupant, declaration } of reconcilableUnknowns) {
        if (declaration.submittedCsltId && declaration.submittedCsltId !== connection.csltId) {
          continue;
        }
        const nat = occupant.nationality?.trim().toUpperCase();
        const kind: ReconciliationKind =
          declaration.declarationKind ??
          occupant.citizenshipKind ??
          (nat === "VNM" ? "VIETNAMESE" : "FOREIGN");
        neededKinds.add(kind);
        const draft = this.declarationDraft(declaration, occupant);
        const submitted = declaration.submittedCsltId === connection.csltId && Array.isArray(declaration.submittedPayloadJson)
          ? declaration.submittedPayloadJson[0] as Record<string, unknown> | undefined : undefined;
        const submittedArrival = submitted?.ngayDenCsltStr;
        const arrivalYmd = typeof submittedArrival === "string" && isValidCalendarDateTime(submittedArrival)
          ? submittedArrival.slice(0, 10) : this.getOccupantArrivalVietnamYmd(occupant, draft);
        if (arrivalYmd && arrivalYmd >= minWindowDay && arrivalYmd <= todayYmd) {
          neededDaysByKind[kind].add(arrivalYmd);
        }
      }

      if (neededKinds.size === 0) {
        await scheduleBoundedUnknownContinuationIfNeeded();
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: allUnknownDeclarations.length,
          ...(hasMoreUnknownPages
            ? { incomplete: true, ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}) }
            : {}),
        };
      }

      const providerGuests: ProviderReconciliationGuest[] = [];
      const completeKinds = new Set<ReconciliationKind>();
      let authFailed = false;
      let transientReadFailed = false;
      let incompleteRead = false;

      for (const kind of neededKinds) {
        const sortedDays = [...neededDaysByKind[kind]].sort();
        try {
          const [residents, history] = await withKbttDeadline(
            async (sig) => {
              const residentsPromise = this.providerRead!.readAllResidents(
                kind,
                activeSession.AccessToken,
                sig,
              );
              const historyRows: unknown[] = [];
              for (const dayYmd of sortedDays) {
                sig.throwIfAborted();
                const dayRows = await this.readCoalescedProviderHistoryDay(
                  connection.csltId,
                  connection.ciphertext,
                  kind,
                  dayYmd,
                  activeSession.AccessToken,
                  sig,
                );
                historyRows.push(...dayRows);
              }
              return [await residentsPromise, historyRows] as const;
            },
            undefined,
            10_000,
          );
          const merged = new Map<string, ProviderReconciliationGuest>();
          for (const [idx, list] of [residents, history].entries()) {
            for (const rawRow of list) {
              const normalized = this.normalizeProviderReconciliationRow(
                rawRow,
                kind,
                connection.csltId,
                idx === 0,
              );
              const prev = merged.get(normalized.id);
              if (
                prev &&
                (prev.identityNumber !== normalized.identityNumber ||
                  prev.arrivalDay !== normalized.arrivalDay ||
                  prev.documentType !== normalized.documentType ||
                  prev.nationality !== normalized.nationality ||
                  prev.departed !== normalized.departed)
              ) {
                throw new KbttProviderReadError(
                  "INCOMPLETE",
                  "Conflicting BCA history and active-list records",
                );
              }
              merged.set(
                normalized.id,
                prev ? { ...normalized, isActive: prev.isActive || normalized.isActive } : normalized,
              );
            }
          }
          providerGuests.push(...merged.values());
          completeKinds.add(kind);
        } catch (err) {
          incompleteRead = true;
          const known = err instanceof KbttProviderReadError ? err : null;
          if (
            known?.details.httpStatus === 401 ||
            known?.details.httpStatus === 403 ||
            ["401", "403"].includes(String(known?.details.providerCode))
          ) {
            authFailed = true;
          } else if (!known || known.kind !== "INCOMPLETE") {
            transientReadFailed = true;
          }
        }
      }

      if (authFailed) {
        await this.markAuthFailedSession(hotelId, activeSession);
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: allUnknownDeclarations.length,
          incomplete: true,
          ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}),
        };
      }

      // Re-verify generation fence before persisting any resolution
      const latestConn = await this.repository.find(hotelId).catch(() => null);
      if (
        !latestConn ||
        latestConn.status !== "CONNECTED" ||
        latestConn.ciphertext !== connection.ciphertext ||
        latestConn.csltId !== connection.csltId ||
        this.sessions.get(hotelId)?.ciphertext !== connection.ciphertext
      ) {
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: allUnknownDeclarations.length,
          incomplete: true,
          ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}),
        };
      }

      if (completeKinds.size === 0) {
        if (transientReadFailed) {
          await this.enterTemporaryDisconnectCooldown(hotelId, activeSession);
        }
        return {
          settledCount: 0,
          retryScheduledCount: 0,
          remainingUnknownCount: allUnknownDeclarations.length,
          incomplete: true,
          ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}),
        };
      }

      const localGuests: LocalReconciliationGuest[] = reconcilableUnknowns.map(({ occupant: row, declaration: decl }) => {
        const nat = row.nationality?.trim().toUpperCase();
        const kind =
          decl?.declarationKind ?? row.citizenshipKind ?? (nat === "VNM" ? "VIETNAMESE" : null);
        const snapshot =
          decl && Array.isArray(decl.submittedPayloadJson) && decl.submittedPayloadJson[0]
            ? (decl.submittedPayloadJson[0] as Record<string, unknown>)
            : kind
              ? this.withOccupantDefaults(
                  kind,
                  (decl?.draftPayloadJson ?? {}) as Record<string, unknown>,
                  row,
                )
              : {};
        const identity =
          (typeof (kind === "FOREIGN" ? snapshot.soHoChieu : snapshot.soGiayTo) === "string"
            ? String(kind === "FOREIGN" ? snapshot.soHoChieu : snapshot.soGiayTo).trim()
            : "") || row.identityNumber;
        const documentType =
          typeof snapshot.loaiGiayTo === "number"
            ? snapshot.loaiGiayTo
            : kind === "VIETNAMESE" && /^\d{12}$/.test(identity ?? "")
              ? 1
              : kind === "VIETNAMESE" && /^\d{9}$/.test(identity ?? "")
                ? 2
                : null;
        const arrivalInstant = this.getOccupantArrivalInstant(row);
        return {
          id: row.id,
          stayId: row.stayId,
          roomId: row.roomId,
          roomNumber: row.roomNumber,
          groupCode: row.groupCode ?? null,
          fullName: row.fullName,
          identityNumber: identity ?? null,
          kind,
          documentType,
          nationality:
            (typeof snapshot.quocTich === "string" && snapshot.quocTich.trim()
              ? snapshot.quocTich.trim()
              : null) ?? row.nationality,
          checkedInAt: arrivalInstant ? arrivalInstant.toISOString() : null,
          submittedArrivalAt: decl.submittedCsltId === connection.csltId && typeof snapshot.ngayDenCsltStr === "string" && isValidCalendarDateTime(snapshot.ngayDenCsltStr)
            ? new Date(snapshot.ngayDenCsltStr.replace(" ", "T") + "+07:00").toISOString() : null,
          plannedCheckOutAt: row.plannedCheckOutAt.toISOString(),
          declarationStatus: decl?.status ?? null,
          providerMessage: decl?.providerMessage ?? null,
          linkedBcaId: null,
        };
      });

      const reconciledRows = reconcileGuests(
        localGuests,
        providerGuests,
        completeKinds,
        connection.csltId,
        {
          coveredHistoryDays: neededDaysByKind,
        },
      );
      const reconciledByOccupant = new Map(
        reconciledRows
          .filter((r) => r.source === "VIETSAGE" && r.occupantId)
          .map((r) => [r.occupantId!, r]),
      );

      let settledCount = 0;
      const retryScheduledCount = 0;
      let remainingUnknownCount = fencedInFlightCount;

      for (const { occupant, declaration } of reconcilableUnknowns) {
        if (
          declaration.submittedCsltId &&
          declaration.submittedCsltId !== connection.csltId
        ) {
          remainingUnknownCount++;
          continue;
        }
        const matchedRow = reconciledByOccupant.get(occupant.id);
        if (
          !matchedRow ||
          !matchedRow.kind ||
          !completeKinds.has(matchedRow.kind) ||
          matchedRow.status !== "MATCHED" ||
          !matchedRow.bcaRecordId
        ) {
          // Empty or non-matching read is never authoritative proof of nonacceptance; preserve UNKNOWN for manual review.
          remainingUnknownCount++;
          continue;
        }

        try {
          await this.repository.updateDeclaration({
            id: declaration.id,
            hotelId,
            expectedVersion: declaration.version,
            expectedStatus: "UNKNOWN",
            data: {
              status: "SUBMITTED",
              submittedCsltId: connection.csltId,
              claimToken: null,
              providerCode: "200",
              providerMessage: `Đã đối soát khớp hồ sơ trên BCA (#${matchedRow.bcaRecordId}).`,
              providerResponseJson: {
                reconciled: true,
                bcaRecordId: matchedRow.bcaRecordId,
              } as Prisma.InputJsonValue,
              submittedAt: declaration.submittedAt ?? now,
            },
          });
          settledCount++;
        } catch {
          remainingUnknownCount++;
        }
      }

      if (transientReadFailed) {
        await this.enterTemporaryDisconnectCooldown(hotelId, activeSession);
      } else {
        await scheduleBoundedUnknownContinuationIfNeeded();
      }

      const isIncomplete = hasMoreUnknownPages || incompleteRead || completeKinds.size < neededKinds.size;
      return {
        settledCount,
        retryScheduledCount,
        remainingUnknownCount,
        ...(isIncomplete
          ? { incomplete: true, ...(nextResumeCursor ? { nextCursor: nextResumeCursor } : {}) }
          : {}),
      };
    })();

    this.unknownReconciliations.set(hotelId, task);
    try {
      return await task;
    } finally {
      if (this.unknownReconciliations.get(hotelId) === task) {
        this.unknownReconciliations.delete(hotelId);
      }
    }
  }

  async hasEligibleSameDayUnsentWork(hotelId: string, now: Date = new Date()): Promise<boolean> {
    if (!this.occupantsReadService) return false;
    const context = getKbttSubmissionDateContext(now);
    const todayBounds = getDayBounds(context.todayYmd, VIETNAM_TIME_ZONE);
    const yesterdayBounds = getDayBounds(addDaysYmd(context.todayYmd, -29), VIETNAM_TIME_ZONE);
    const cohorts = [
      { key: `${hotelId}:today`, arrivalStart: todayBounds.start, arrivalEnd: todayBounds.end },
      { key: `${hotelId}:yesterday`, arrivalStart: yesterdayBounds.start, arrivalEnd: todayBounds.start },
    ];
    const pageSize = 100;
    const maxPages = 100;
    let pagesUsed = 0;

    for (const cohort of cohorts) {
      const savedCursor = this.unsentWorkCheckCursors.get(cohort.key);
      let cursor: string | undefined = savedCursor;
      let wrapped = !savedCursor;

      while (pagesUsed < maxPages) {
        pagesUsed++;
        const res = await this.occupantsReadService.getActiveStayOccupantsPaged(hotelId, {
          cursor,
          take: pageSize,
          arrivalStart: cohort.arrivalStart,
          arrivalEnd: cohort.arrivalEnd,
          kbttFilter: "UNSYNCHRONIZED",
        });
        const items = res?.items ?? [];
        if (items.length > 0) {
          const decls = await this.repository.findDeclarationsByHotel(
            hotelId,
            items.map((i) => i.id),
          );
          const declMap = new Map<string, KbttGuestDeclaration>();
          for (const d of decls) {
            if (!declMap.has(d.occupantId)) declMap.set(d.occupantId, d);
          }
          for (const occ of items) {
            if (this.isDeclarationEligibleForAutoCatchUp(occ, declMap.get(occ.id), context)) {
              if (res?.nextCursor) {
                this.unsentWorkCheckCursors.set(cohort.key, res.nextCursor);
              } else {
                this.unsentWorkCheckCursors.delete(cohort.key);
              }
              return true;
            }
          }
        }
        if (res?.nextCursor && items.length > 0) {
          cursor = res.nextCursor;
          if (pagesUsed >= maxPages) {
            this.unsentWorkCheckCursors.set(cohort.key, cursor);
            // Capped before reaching EOF of the DB cohort: never report a false absence.
            return true;
          }
        } else {
          this.unsentWorkCheckCursors.delete(cohort.key);
          if (!wrapped && pagesUsed < maxPages) {
            wrapped = true;
            cursor = undefined;
            continue;
          }
          break;
        }
      }
    }
    return false;
  }

  async scheduleEligibleSameDayCatchUp(
    hotelId: string,
    now: Date = new Date(),
  ): Promise<KbttAutoSubmitRun | null> {
    if (
      process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
      process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true"
    ) {
      return null;
    }
    const nextBoundary = computeVietnamNextTenMinuteBoundary(now);
    if (!nextBoundary) {
      return null;
    }
    const connection = await this.repository.find(hotelId).catch(() => null);
    if (!connection || !connection.autoSubmitEnabled || connection.status !== "CONNECTED") {
      return null;
    }
    const hasWork = await this.hasEligibleSameDayUnsentWork(hotelId, now);
    if (!hasWork) {
      return null;
    }
    try {
      const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
      const existing = pending.find(
        (r) =>
          r.status === "RUNNING" &&
          r.scheduledFor.getTime() === nextBoundary.getTime(),
      );
      if (existing) {
        this.armScheduledRun(existing);
        return existing;
      }
      if (!this.repository.createScheduledAutoSubmitRun) return null;
      const run = await this.repository.createScheduledAutoSubmitRun(
        hotelId,
        nextBoundary,
        false,
        "CATCH_UP_10M",
        { cutoffAt: nextBoundary.toISOString() },
      );
      if (run) {
        this.armScheduledRun(run);
      }
      return run ?? null;
    } catch {
      return null;
    }
  }

  private async cancelHotelAutomatedScheduledRuns(hotelId: string, reason: string) {
    try {
      const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
      for (const run of pending) {
        const trigger = (run.summaryJson as any)?.trigger;
        if (trigger === "MANUAL_DELAYED") continue;
        const timer = this.scheduledTimers.get(run.id);
        if (timer) {
          clearTimeout(timer);
          this.scheduledTimers.delete(run.id);
        }
        if (run.scheduledFor.getTime() > Date.now() && this.repository.finalizeAutoSubmitRun) {
          await this.repository.finalizeAutoSubmitRun(run.id, {
            status: "CANCELLED",
            totalCount: 0,
            successCount: 0,
            failedCount: 0,
            unknownCount: 0,
            telegramSent: false,
            summaryJson: {
              ...(typeof run.summaryJson === "object" && run.summaryJson
                ? (run.summaryJson as Record<string, unknown>)
                : {}),
              reason,
            } as Prisma.InputJsonValue,
          });
        }
      }
    } catch {
      // ignore cleanup error
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
    const [declarations, connection, pendingRuns] = await Promise.all([
      this.repository.findDeclarationsByHotel(hotelId, occupantIds),
      this.repository.find(hotelId),
      this.repository.findPendingScheduledAutoSubmitRuns(hotelId),
    ]);
    const now = new Date();
    const dateContext = getKbttSubmissionDateContext(now);
    const pendingCatchUp = pendingRuns.find(
      (r) =>
        r.status === "RUNNING" &&
        (r.summaryJson as any)?.trigger === "CATCH_UP_10M" &&
        r.scheduledFor.getTime() > now.getTime(),
    );
    const hotelCatchUpIso =
      connection?.autoSubmitEnabled && pendingCatchUp
        ? pendingCatchUp.scheduledFor.toISOString()
        : null;

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
      const arrivalYmd = this.getOccupantArrivalVietnamYmd(occupant, draft);
      const isInArrivalWindow =
        Boolean(arrivalYmd && arrivalYmd <= dateContext.todayYmd);
      const dateCheck = classification
        ? validateKbttSubmissionDates(classification, normalizeKbttSubmissionDates(classification, draft, dateContext), dateContext, {
            enforceArrivalWindow: true,
          })
        : { valid: true, outOfWindow: !isInArrivalWindow, issues: [] };
      const isEligibleCatchUp = this.isDeclarationEligibleForAutoCatchUp(
        occupant,
        decl,
        dateContext,
      );
      const eligibilityState:
        | "ELIGIBLE_SAME_DAY"
        | "NEEDS_CORRECTION"
        | "PRIOR_DAY_MANUAL"
        | "OUT_OF_DATE_WINDOW"
        | "RECONCILIATION_REQUIRED"
        | "SUBMITTED" =
        decl?.status === "SUBMITTED"
          ? "SUBMITTED"
          : decl?.status === "UNKNOWN"
            ? "RECONCILIATION_REQUIRED"
            : !isInArrivalWindow || dateCheck.outOfWindow
              ? "OUT_OF_DATE_WINDOW"
              : isEligibleCatchUp
                ? "ELIGIBLE_SAME_DAY"
                : "NEEDS_CORRECTION";

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
              nextCatchUpAt: eligibilityState === "ELIGIBLE_SAME_DAY" ? hotelCatchUpIso : null,
              eligibilityState,
            }
          : null,
      };
    });

    const query = pagination?.q?.trim().toLocaleLowerCase("vi") ?? "";
    const checkInBounds = pagination?.checkInDate ? getDayBounds(pagination.checkInDate, VIETNAM_TIME_ZONE) : null;
    const localFailureCodes = new Set(["LOCAL_VALIDATION","LOCAL_STATE_CHANGED","CONNECTION_SCOPE_CHANGED","DELIVERY_BUSY","RECONCILIATION_REQUIRED","LOCAL_PREPARATION","LOCAL_STAY_ENDED","DELIVERY_PAUSED","KBTT_NOT_CONFIGURED","KBTT_AUTH_FAILED","KBTT_PROVIDER_UNAVAILABLE","KBTT_TEMP_DISCONNECTED","KBTT_RETRY_PENDING","KBTT_SESSION_ENDED","PRIOR_DAY_MANUAL_REQUIRED","OUT_OF_DATE_WINDOW","KBTT_FACILITY_CONFLICT","KBTT_UNAVAILABLE"]);
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
    const [connection, snapshot, pendingRuns] = await Promise.all([
      this.repository.find(hotelId),
      this.repository.getDeliverySnapshot(hotelId, allowedRoomId),
      this.repository.findPendingScheduledAutoSubmitRuns(hotelId),
    ]);
    const now = new Date();
    const nextSlot = computeVietnamNextDailySlot(now);
    const pendingCatchUp = pendingRuns.find(
      (r) =>
        r.status === "RUNNING" &&
        (r.summaryJson as any)?.trigger === "CATCH_UP_10M" &&
        r.scheduledFor.getTime() > now.getTime(),
    );
    const live = process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED === "true" &&
      process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH !== "true";
    const localIssueMessages: Record<string, string> = {
      LOCAL_STAY_ENDED: "Khách đã kết thúc lưu trú trước khi hồ sơ được gửi; cần đối soát.",
      DELIVERY_PAUSED: "Luồng gửi BCA đang tạm dừng; hồ sơ chưa được gửi.",
      KBTT_NOT_CONFIGURED: "Khách sạn chưa cấu hình kết nối BCA; hồ sơ chưa được gửi.",
      KBTT_AUTH_FAILED: "Cần đăng nhập lại kết nối BCA trước khi gửi hồ sơ.",
      KBTT_SESSION_ENDED: "Phiên kết nối BCA đã kết thúc; cần đăng nhập lại.",
      KBTT_TEMP_DISCONNECTED: "Tạm ngắt kết nối BCA; hệ thống đang chờ kết nối lại.",
      KBTT_RETRY_PENDING: "Đang thử kết nối lại BCA sau 10 giây.",
      KBTT_PROVIDER_UNAVAILABLE: "Chưa thể kết nối BCA để gửi hồ sơ.",
      PRIOR_DAY_MANUAL_REQUIRED: "Hồ sơ ngoài khung ngày cho phép của BCA; cần xử lý thủ công.",
      OUT_OF_DATE_WINDOW: "Hồ sơ ngoài khung ngày cho phép của BCA; cần xử lý thủ công.",
      KBTT_FACILITY_CONFLICT: "Cơ sở BCA đang bị trùng liên kết với khách sạn khác; đã chặn gửi.",
      KBTT_UNAVAILABLE: "Tạm thời không thể xác minh trạng thái cơ sở BCA.",
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
      nextScheduledSlotAt: connection?.autoSubmitEnabled ? nextSlot.scheduledFor.toISOString() : null,
      nextCatchUpAt: connection?.autoSubmitEnabled && pendingCatchUp ? pendingCatchUp.scheduledFor.toISOString() : null,
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
    const now = new Date();
    const dateContext = getKbttSubmissionDateContext(now);
    if (this.isDeclarationEligibleForAutoCatchUp(canonical, savedDeclaration, dateContext)) {
      const schema =
        citizenshipKind === "VIETNAMESE" ? kbttVietnameseReadySchema : kbttForeignReadySchema;
      const arrivalYmd = this.getOccupantArrivalVietnamYmd(canonical, draftData);
      const dateCheck = validateKbttSubmissionDates(citizenshipKind, normalizeKbttSubmissionDates(citizenshipKind, draftData, dateContext), dateContext, {
        enforceArrivalWindow: true,
      });
      if (schema.safeParse(normalizeKbttSubmissionDates(citizenshipKind, draftData, dateContext)).success && dateCheck.valid) {
        await this.scheduleEligibleSameDayCatchUp(hotelId, now).catch(() => null);
      }
    }
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
      let connection = await this.repository.find(hotelId);
      if (!connection) throw new NotFoundException({ code: "KBTT_NOT_CONFIGURED", message: "Khách sạn chưa cấu hình kết nối BCA." });
      if (
        connection.status === "DISCONNECTED" &&
        connection.lastErrorCode === "KBTT_TEMP_DISCONNECTED"
      ) {
        const cached = this.sessions.get(hotelId);
        if (cached && (!cached.cooldownUntil || Date.now() >= cached.cooldownUntil)) {
          const resumed = await this.probeTemporarilyDisconnectedSession(hotelId, true);
          if (resumed) {
            connection = await this.repository.find(hotelId);
          }
        }
      }
      if (!connection || connection.status !== "CONNECTED") throw kbttAuthFailed("Cần đăng nhập lại BCA trước khi đối soát.");
      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection, false);
        if (session.Exp * 1000 <= Date.now() + 5_000) throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
      } catch (error) {
        const failure = stableKbttError(error);
        const failed = this.sessions.get(hotelId)?.session;
        if (failed) {
          await this.handleProviderSessionFailure(hotelId, failed, failure.authenticationFailed);
        }
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
      await this.reconcilePendingUnknownDeclarationsForHotel(hotelId, true).catch(() => null);
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
        const failure = stableKbttError(error);
        await this.handleProviderSessionFailure(
          hotelId,
          cached.session,
          failure.authenticationFailed,
        );
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
    if (latest?.status === "UNKNOWN" && this.isDeclarationClaimActive(latest)) {
      return this.viewDeclaration(latest, occupant);
    }
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
          submittedAt: null, submittedPayloadFingerprint: fingerprint, claimToken: null },
      });
      return this.viewDeclaration(failed, occupant);
    }
    const claimToken = randomUUID();
    const attemptedAt = new Date();
    const claimed = await this.repository.updateDeclaration({
      id: preparedDeclaration.id, hotelId, expectedVersion: preparedDeclaration.version,
      data: { status: "UNKNOWN", providerCode: null, providerMessage: null,
        providerResponseJson: Prisma.JsonNull, submittedAt: null,
        submittedPayloadJson: payload as Prisma.InputJsonValue, submittedPayloadFingerprint: fingerprint,
        submittedCsltId: connection.csltId,
        submittedConnectionCiphertext: connection.ciphertext,
        claimToken,
        attemptedAt },
    });
    const delivery = this.serialize(`delivery:${connection.csltId}`, () =>
      this.deliverInitialDeclaration(hotelId, claimed, declarationKind, payload, fingerprint))
      .catch(async () => {
        try {
          const current = await this.repository.findLatestDeclaration(hotelId, occupantId);
          if (current?.id === claimed.id && current.version === claimed.version && current.status === "UNKNOWN") {
            await this.repository.updateDeclaration({
              id: current.id, hotelId, expectedVersion: current.version,
              data: { status: "UNKNOWN", claimToken: null, providerCode: "INTERRUPTED_DELIVERY",
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
    const attemptCiphertext =
      ((declaration as any).submittedConnectionCiphertext as string | null | undefined) ?? undefined;
    const connection = await this.repository.find(hotelId);
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true" ||
        process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true" || !connection?.autoSubmitEnabled) {
      await this.persistDeclarationFailed(hotelId, declaration, fingerprint, {
        outcome: "BUSINESS_REJECTION", code: "DELIVERY_PAUSED", message: "Luồng gửi BCA đang tạm dừng.",
      }, attemptCiphertext ?? connection?.ciphertext);
      return;
    }
    if (
      (attemptCiphertext && connection.ciphertext !== attemptCiphertext) ||
      (declaration.submittedCsltId && connection.csltId !== declaration.submittedCsltId)
    ) {
      await this.persistDeclarationFailed(
        hotelId,
        declaration,
        fingerprint,
        {
          outcome: "BUSINESS_REJECTION",
          code: "CONNECTION_SCOPE_CHANGED",
          message: "Kết nối BCA đã thay đổi; hệ thống sẽ tự gửi lại theo kết nối mới.",
        },
        attemptCiphertext ?? connection.ciphertext,
      );
      return;
    }
    let session: KbttSession;
    try {
      session = await this.serialize(`session:${hotelId}`, () => this.getOrRefreshSession(hotelId, connection));
    } catch (error) {
      const issue = stableKbttError(error);
      await this.persistDeclarationFailed(hotelId, declaration, fingerprint, {
        outcome: "BUSINESS_REJECTION", code: issue.code, message: issue.message,
      }, attemptCiphertext ?? connection.ciphertext);
      if (!issue.authenticationFailed && connection.autoSubmitEnabled) {
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
      return;
    }
    const baselineCiphertext = attemptCiphertext ?? connection.ciphertext;
    const outcome = await this.sendInitialDeclaration(
      hotelId,
      declaration.id,
      kind,
      payload,
      session.AccessToken,
      session.CsltId,
      true,
      baselineCiphertext,
    );
    if (outcome.outcome === "SUCCESS") {
      await this.persistDeclarationSubmitted(
        hotelId,
        declaration,
        payload,
        fingerprint,
        outcome,
        session.CsltId,
        baselineCiphertext,
      );
    } else if (outcome.outcome === "BUSINESS_REJECTION") {
      await this.persistDeclarationFailed(
        hotelId,
        declaration,
        fingerprint,
        outcome,
        baselineCiphertext,
      );
      if (KBTT_TRANSIENT_OR_PAUSED_CODES.has(outcome.code) && connection.autoSubmitEnabled) {
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
    } else {
      await this.repository.updateDeclaration({
        id: declaration.id, hotelId, expectedVersion: declaration.version,
        data: { status: "UNKNOWN", claimToken: null, providerCode: outcome.code.slice(0, 32),
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
        ? kbttVietnameseReadySchema.safeParse(normalizeKbttSubmissionDates(declarationKind, draft, new Date()))
        : kbttForeignReadySchema.safeParse(normalizeKbttSubmissionDates(declarationKind, draft, new Date()));
    if (!parsed.success) {
      throw new BadRequestException({
        code: "KBTT_PAYLOAD_INVALID",
        message: formatValidationIssues(parsed.error.issues),
      });
    }
    const wirePayload = normalizeKbttSubmissionDates(declarationKind, parsed.data, new Date());
    const dateCheck = validateKbttSubmissionDates(declarationKind, wirePayload, new Date(), { enforceArrivalWindow: true });
    if (!dateCheck.valid) {
      throw new BadRequestException({
        code: dateCheck.outOfWindow ? "OUT_OF_DATE_WINDOW" : "KBTT_PAYLOAD_INVALID",
        message: dateCheck.issues
          .map((issue) => {
            const label = KBTT_FIELD_LABELS[issue.field] ?? issue.field;
            return issue.message.toLocaleLowerCase("vi").includes(label.toLocaleLowerCase("vi"))
              ? issue.message
              : `${label}: ${issue.message}`;
          })
          .join("; "),
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
          data: { draftPayloadJson: this.compactDraft(declarationKind, draft, occupant) },
        })
      : await this.repository.createDeclaration({
          hotelId,
          stayId: occupant.stayId,
          occupantId,
          declarationKind,
          status: "DRAFT",
          draftPayloadJson: this.compactDraft(declarationKind, draft, occupant),
        });

    return { preparedDeclaration, declarationKind, payload: [wirePayload], draft };
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
    const hasValidGeneration = Boolean(
      connection &&
        cached &&
        cached.ciphertext === connection.ciphertext &&
        cached.session.CsltId === connection.csltId,
    );
    const interruptedRecovery = Boolean(
      connection &&
        ((connection.lastErrorCode === "KBTT_RETRY_PENDING" &&
          !this.recoveries.has(connection.hotelId)) ||
          (connection.lastErrorCode === "KBTT_TEMP_DISCONNECTED" && !hasValidGeneration)),
    );
    const profile =
      connection?.status === "CONNECTED" &&
      !this.recoveries.has(connection.hotelId) &&
      hasValidGeneration
        ? cached?.profile
        : undefined;
    return {
      username,
      providerProfile: profile ?? {
        state: "NOT_LOADED" as const,
        accommodation: null,
        fetchedAt: null,
        error: null,
      },
      configured: Boolean(connection),
      status:
        connection &&
        (this.recoveries.has(connection.hotelId) ||
          (connection.status === "CONNECTED" && !hasValidGeneration))
          ? "DISCONNECTED"
          : (connection?.status ?? "DISCONNECTED"),
      maskedUsername: connection ? "••••••" : null,
      csltId: connection?.csltId ?? null,
      lastCheckedAt: connection?.lastCheckedAt.toISOString() ?? null,
      lastConnectedAt: connection?.lastConnectedAt.toISOString() ?? null,
      lastErrorCode: interruptedRecovery
        ? "KBTT_SESSION_ENDED"
        : (connection?.lastErrorCode ?? null),
      lastErrorMessage: interruptedRecovery
        ? "Phiên BCA đã kết thúc. Vui lòng đăng nhập lại."
        : (connection?.lastErrorMessage ?? null),
      cooldownUntil:
        hasValidGeneration && cached?.cooldownUntil
          ? new Date(cached.cooldownUntil).toISOString()
          : null,
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
    if (autoSubmitEnabled) {
      if (updated.status === "CONNECTED") {
        void this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      } else {
        const cached = this.sessions.get(hotelId);
        if (cached && updated.lastErrorCode === "KBTT_TEMP_DISCONNECTED") {
          this.armCooldownHealthProbe(hotelId, cached);
        }
      }
    } else {
      const cooldownTimer = this.cooldownTimers.get(hotelId);
      if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        this.cooldownTimers.delete(hotelId);
      }
      await this.cancelHotelAutomatedScheduledRuns(hotelId, "DELIVERY_PAUSED");
    }
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
    const now = new Date();
    const nextSlot = computeVietnamNextDailySlot(now);
    const pendingSchedule = pendingRuns.find(
      (run) =>
        (run.summaryJson as any)?.trigger === "MANUAL_DELAYED" &&
        run.scheduledFor.getTime() > now.getTime(),
    );
    const pendingCatchUp = pendingRuns.find(
      (run) =>
        run.status === "RUNNING" &&
        (run.summaryJson as any)?.trigger === "CATCH_UP_10M" &&
        run.scheduledFor.getTime() > now.getTime(),
    );
    const activeRun = runs.find(
      (r) =>
        r.status === "RUNNING" &&
        r.leaseExpiresAt.getTime() > now.getTime() &&
        r.scheduledFor.getTime() <= now.getTime(),
    );
    return {
      autoSubmitEnabled: connection.autoSubmitEnabled,
      autoSubmitTime: null,
      scheduleSlots: [...KBTT_DAILY_SCHEDULE_SLOTS],
      timezone: KBTT_SCHEDULE_TIMEZONE,
      nextScheduledSlotAt: connection.autoSubmitEnabled
        ? nextSlot.scheduledFor.toISOString()
        : null,
      nextCatchUpAt:
        connection.autoSubmitEnabled && pendingCatchUp
          ? pendingCatchUp.scheduledFor.toISOString()
          : null,
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
    if ((body as any)?.autoSubmitTime !== undefined && (body as any)?.autoSubmitTime !== null) {
      throw new BadRequestException(
        "Khung giờ gửi tự động cố định lúc 12:00 và 21:00 (Asia/Ho_Chi_Minh), không hỗ trợ tự chọn giờ.",
      );
    }
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
      autoSubmitTime: null,
    });
    if (body.autoSubmitEnabled === true) {
      if (updated.status === "CONNECTED") {
        void this.reconcilePendingUnknownDeclarationsForHotel(hotelId).catch(() => null);
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      } else {
        const cached = this.sessions.get(hotelId);
        if (cached && updated.lastErrorCode === "KBTT_TEMP_DISCONNECTED") {
          this.armCooldownHealthProbe(hotelId, cached);
        }
      }
    } else if (body.autoSubmitEnabled === false) {
      const cooldownTimer = this.cooldownTimers.get(hotelId);
      if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        this.cooldownTimers.delete(hotelId);
      }
      await this.cancelHotelAutomatedScheduledRuns(hotelId, "DELIVERY_PAUSED");
    }
    const now = new Date();
    const nextSlot = computeVietnamNextDailySlot(now);
    return {
      autoSubmitEnabled: updated.autoSubmitEnabled,
      autoSubmitTime: null,
      scheduleSlots: [...KBTT_DAILY_SCHEDULE_SLOTS],
      timezone: KBTT_SCHEDULE_TIMEZONE,
      nextScheduledSlotAt: updated.autoSubmitEnabled ? nextSlot.scheduledFor.toISOString() : null,
    };
  }

  private async persistDeclarationSubmitted(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    payload: unknown[],
    fingerprint: string,
    outcome: KbttSubmitOutcome,
    submittedCsltId?: string,
    expectedCiphertext?: string,
  ) {
    const providerCode = outcome.code.slice(0, 32);
    const providerMessage = sanitizeProviderText(outcome.message || "Không có thông báo");
    const providerResponseJson = outcome.data
      ? (sanitizeProviderData(outcome.data) as Prisma.InputJsonValue)
      : Prisma.JsonNull;
    const effectiveCsltId = submittedCsltId ?? declaration.submittedCsltId ?? null;
    const liveConn = await this.repository.find(hotelId).catch(() => null);
    if (liveConn && effectiveCsltId && liveConn.csltId !== effectiveCsltId) {
      // Hotel relogged into a different BCA facility while the initial submission was in flight.
      // Preserve the acceptance metadata on the original facility and mark UNKNOWN for manual review.
      const settleFn =
        this.repository.settleAcceptedDeclaration?.bind(this.repository) ??
        this.repository.updateDeclaration.bind(this.repository);
      await settleFn({
        id: declaration.id,
        hotelId,
        expectedVersion: declaration.version,
        data: {
          status: "UNKNOWN",
          claimToken: null,
          submittedCsltId: effectiveCsltId,
          submittedConnectionCiphertext:
            expectedCiphertext ?? (declaration as any).submittedConnectionCiphertext ?? null,
          draftPayloadJson: declaration.draftPayloadJson ?? Prisma.JsonNull,
          submittedPayloadJson: payload as Prisma.InputJsonValue,
          submittedPayloadFingerprint: fingerprint,
          providerCode: "RECONCILIATION_REQUIRED",
          providerMessage: sanitizeProviderText(
            `Cơ sở BCA đã đổi từ #${effectiveCsltId} sang #${liveConn.csltId} khi hồ sơ được chấp nhận; cần đối soát cơ sở nhận.`,
          ),
          providerResponseJson,
          submittedAt: new Date(),
        },
      });
      return;
    }

    const settleFn =
      this.repository.settleAcceptedDeclaration?.bind(this.repository) ??
      this.repository.updateDeclaration.bind(this.repository);
    await settleFn({
      id: declaration.id,
      hotelId,
      expectedVersion: declaration.version,
      data: {
        status: "SUBMITTED",
        claimToken: null,
        ...(effectiveCsltId ? { submittedCsltId: effectiveCsltId } : {}),
        ...(expectedCiphertext
          ? { submittedConnectionCiphertext: expectedCiphertext }
          : {}),
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
    expectedCiphertext?: string,
  ) {
    const baselineCiphertext =
      expectedCiphertext ??
      ((declaration as any).submittedConnectionCiphertext as string | null | undefined);
    const liveConn = await this.repository.find(hotelId).catch(() => null);
    if (
      baselineCiphertext &&
      (!liveConn || liveConn.ciphertext !== baselineCiphertext)
    ) {
      // Logout or a newer login generation superseded the in-flight attempt; do not overwrite with a terminal rejection.
      try {
        await this.repository.updateDeclaration({
          id: declaration.id,
          hotelId,
          expectedVersion: declaration.version,
          data: {
            status: "FAILED",
            claimToken: null,
            submittedPayloadFingerprint: fingerprint,
            providerCode: "CONNECTION_SCOPE_CHANGED",
            providerMessage:
              "Phiên kết nối BCA đã được làm mới trong lúc gửi; hệ thống sẽ tự gửi lại theo kết nối mới.",
            submittedAt: null,
          },
        });
      } catch {
        // ignore CAS conflict
      }
      if (liveConn?.status === "CONNECTED" && liveConn.autoSubmitEnabled) {
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
      }
      return;
    }

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
        claimToken: null,
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
          claimToken: null,
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
      const now = new Date();
      const dateContext = getKbttSubmissionDateContext(now);
      const scheduledYmd = toYmd(scheduledForDate, VIETNAM_TIME_ZONE);
      if (
        !isDryRun &&
        !isManualDelayed &&
        scheduledYmd !== dateContext.todayYmd &&
        scheduledYmd !== dateContext.yesterdayYmd
      ) {
        return this.repository.finalizeAutoSubmitRun(run.id, {
          status: "CANCELLED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: { trigger, reason: "CROSS_DAY_EXPIRED" },
        });
      }
      const rawCutoff = (run.summaryJson as any)?.cutoffAt;
      const cutoffInstant =
        typeof rawCutoff === "string" && !Number.isNaN(new Date(rawCutoff).getTime())
          ? new Date(rawCutoff)
          : scheduledForDate;

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

      let hasFacilityConflict = false;
      try {
        hasFacilityConflict = await this.hasConflictingFacilityOwnership(hotelId, connection.csltId);
      } catch {
        return await this.repository.finalizeAutoSubmitRun(run.id, {
          status: "FAILED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: {
            trigger,
            error: "Không thể xác minh quyền sở hữu cơ sở lưu trú BCA trong hệ thống; đã chặn gửi để đảm bảo an toàn.",
          },
        });
      }
      if (hasFacilityConflict) {
        await this.markFacilityConflictIfCurrent(hotelId, connection.ciphertext);
        return await this.repository.finalizeAutoSubmitRun(run.id, {
          status: "FAILED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: {
            trigger,
            error:
              "Cơ sở lưu trú BCA đang bị trùng liên kết với khách sạn khác; luồng gửi tự động đã được chặn an toàn.",
          },
        });
      }

      const baselineCiphertext = connection.ciphertext;
      let session: KbttSession | null = null;
      let hasUnknownReconciliationBacklog = false;
      if (!isDryRun) {
        try {
          session = await this.getOrRefreshSession(hotelId, connection);
        } catch (authError: any) {
          const failure = stableKbttError(authError);
          const failed = this.sessions.get(hotelId)?.session;
          if (failed) {
            await this.handleProviderSessionFailure(
              hotelId,
              failed,
              failure.authenticationFailed,
            );
          }
          if (!failure.authenticationFailed && !isManualDelayed && connection.autoSubmitEnabled) {
            await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
          }
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
        const unknownRecResult = await this.reconcilePendingUnknownDeclarationsForHotel(
          hotelId,
          isManualDelayed,
          new Date(),
          (run.summaryJson as any)?.unknownResume,
        ).catch(() => null);
        if (unknownRecResult?.incomplete) {
          hasUnknownReconciliationBacklog = true;
        }
      }

      const savedResumeCursor =
        (trigger !== "CONTINUATION_UNKNOWN" && typeof (run.summaryJson as any)?.resumeCursor === "string" &&
        (run.summaryJson as any).resumeCursor.trim()
          ? (run.summaryJson as any).resumeCursor.trim()
          : undefined) ?? this.autoSubmitResumeCursors.get(hotelId);
      let cursor: string | undefined = savedResumeCursor;
      let wrapped = !savedResumeCursor;
      let hasMorePages = true;
      const PAGE_SIZE = Number(
        process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE || (process.env.NODE_ENV === "test" ? 100 : 500),
      );
      const MAX_BATCH_ELIGIBLE = Number(
        process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE || (process.env.NODE_ENV === "test" ? 100 : 1000),
      );
      const MAX_SCAN_PAGES = 20;
      let pagesScanned = 0;
      const arrivalStart = getDayBounds(addDaysYmd(dateContext.todayYmd, -29), VIETNAM_TIME_ZONE).start;
      const arrivalEnd = cutoffInstant;
      let totalEligibleCount = 0;
      let directSuccessCount = 0;
      const reconciledSuccessCount = 0;
      let validationFailureCount = 0;
      let bcaRejectionCount = 0;
      let transientExhaustedCount = 0;
      let hasTransientSafeFailure = false;
      let leaseFenced = false;
      let deliveryPaused = false;
      let hasBacklog = hasUnknownReconciliationBacklog;

      while (hasMorePages) {
        if (pagesScanned >= MAX_SCAN_PAGES) {
          hasBacklog = true;
          if (cursor) {
            this.autoSubmitResumeCursors.set(hotelId, cursor);
          }
          break;
        }
        const leaseOk = await this.repository.renewAutoSubmitRunLease(run.id);
        if (!leaseOk) {
          leaseFenced = true;
          break;
        }

        pagesScanned++;
        const pageResult = await this.occupantsReadService?.getActiveStayOccupantsPaged(hotelId, {
          cursor,
          take: PAGE_SIZE,
          arrivalStart,
          arrivalEnd,
          kbttFilter: "UNSYNCHRONIZED",
        });

        const occupants = pageResult?.items ?? [];
        cursor = pageResult?.nextCursor ?? undefined;
        hasMorePages = Boolean(cursor && occupants.length > 0);

        if (occupants.length === 0) {
          this.autoSubmitResumeCursors.delete(hotelId);
          if (!wrapped && pagesScanned < MAX_SCAN_PAGES) {
            wrapped = true;
            cursor = undefined;
            hasMorePages = true;
            continue;
          }
          break;
        }
        if (!hasMorePages) {
          this.autoSubmitResumeCursors.delete(hotelId);
          if (!wrapped && pagesScanned < MAX_SCAN_PAGES) {
            wrapped = true;
            cursor = undefined;
            hasMorePages = true;
          }
        } else if (cursor) {
          this.autoSubmitResumeCursors.set(hotelId, cursor);
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

        const selectionContext = getKbttSubmissionDateContext(new Date());
        const candidates = occupants
          .map((occupant) => ({ occupant, declaration: latestByOccupant.get(occupant.id) ?? null }))
          .filter(({ occupant, declaration }) =>
            this.isDeclarationEligibleForAutoCatchUp(
              occupant,
              declaration,
              selectionContext,
              cutoffInstant,
            ),
          );

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
                draftPayloadJson: this.withOccupantDefaults(occupant.citizenshipKind!, {}, occupant),
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
          arrivalYmd: string | null;
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
          const validated = schema.safeParse(normalizeKbttSubmissionDates(decl.declarationKind, (draft ?? {}) as Record<string, unknown>, selectionContext));
          const arrivalYmd = occupant
            ? this.getOccupantArrivalVietnamYmd(occupant, (draft ?? {}) as Record<string, unknown>)
            : typeof (draft as any)?.ngayDenCsltStr === "string"
              ? (draft as any).ngayDenCsltStr.slice(0, 10)
              : null;
          const dateCheck = validateKbttSubmissionDates(
            decl.declarationKind,
            normalizeKbttSubmissionDates(decl.declarationKind, (validated.success ? validated.data : (draft ?? {})) as Record<string, unknown>, selectionContext),
            selectionContext,
            {
              enforceArrivalWindow: true,
            },
          );
          if (!validated.success || !dateCheck.valid) {
            if (!isDryRun) {
              const zodIssueMsg = !validated.success
                ? formatValidationIssues(validated.error.issues)
                : "";
              const dateIssueMsg = !dateCheck.valid
                ? dateCheck.issues
                    .map((issue) => {
                      const label = KBTT_FIELD_LABELS[issue.field] ?? issue.field;
                      return issue.message.toLocaleLowerCase("vi").includes(label.toLocaleLowerCase("vi"))
                        ? issue.message
                        : `${label}: ${issue.message}`;
                    })
                    .join("; ")
                : "";
              const error = [zodIssueMsg, dateIssueMsg].filter(Boolean).join("; ");
              const failureCode = !validated.success
                ? "LOCAL_VALIDATION"
                : dateCheck.outOfWindow
                  ? "OUT_OF_DATE_WINDOW"
                  : "LOCAL_VALIDATION";
              const draftFp = createHash("sha256")
                .update(JSON.stringify([normalizeKbttSubmissionDates(decl.declarationKind, draft as Record<string, unknown>, selectionContext)]))
                .digest("hex");
              if (decl.id.startsWith("pending:")) {
                await this.repository.createDeclaration({
                  hotelId,
                  stayId: decl.stayId,
                  occupantId: decl.occupantId,
                  declarationKind: decl.declarationKind,
                  status: "FAILED",
                  draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, draft as Record<string, unknown>, occupant) : (draft ?? {}) as Prisma.InputJsonValue as Prisma.InputJsonValue,
                  submittedPayloadFingerprint: draftFp,
                  providerCode: failureCode,
                  providerMessage: error,
                });
              } else {
                await this.repository.updateDeclaration({
                  id: decl.id,
                  hotelId,
                  expectedVersion: decl.version,
                  data: {
                    status: "FAILED",
                    claimToken: null,
                    submittedPayloadFingerprint: draftFp,
                    providerCode: failureCode,
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
              draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, draft as Record<string, unknown>, occupant) : (draft ?? {}) as Prisma.InputJsonValue,
            });
          } else if (!isDryRun && occupant) {
            submitDeclaration = await this.repository.updateDeclaration({
              id: decl.id,
              hotelId,
              expectedVersion: decl.version,
              data: { draftPayloadJson: occupant ? this.compactDraft(decl.declarationKind, draft as Record<string, unknown>, occupant) : (draft ?? {}) as Prisma.InputJsonValue },
            });
          }

          const payload = [normalizeKbttSubmissionDates(decl.declarationKind, validated.data, new Date())];
          const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
          validItems.push({
            declaration: submitDeclaration,
            payload,
            draftData: payload[0],
            fingerprint,
            arrivalYmd,
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
          const liveConn = await this.repository.find(hotelId).catch(() => null);
          if (!isManualDelayed && !liveConn?.autoSubmitEnabled) {
            deliveryPaused = true;
            break;
          }
          if (!(await this.repository.renewAutoSubmitRunLease(run.id))) {
            leaseFenced = true;
            break;
          }
          const liveCached = this.sessions.get(hotelId);
          if (
            !liveConn ||
            liveConn.status !== "CONNECTED" ||
            liveConn.ciphertext !== baselineCiphertext ||
            liveConn.csltId !== session!.CsltId ||
            !liveCached ||
            liveCached.session.AccessToken !== session!.AccessToken ||
            liveCached.ciphertext !== baselineCiphertext
          ) {
            try {
              await this.repository.updateDeclaration({
                id: item.declaration.id,
                hotelId,
                expectedVersion: item.declaration.version,
                data: {
                  status: "FAILED",
                  claimToken: null,
                  submittedPayloadFingerprint: item.fingerprint,
                  providerCode: "CONNECTION_SCOPE_CHANGED",
                  providerMessage:
                    "Kết nối BCA đã thay đổi; cần xác nhận lại cơ sở trước khi gửi.",
                  submittedAt: null,
                },
              });
            } catch {
              // ignore CAS conflict
            }
            bcaRejectionCount++;
            hasTransientSafeFailure = true;
            continue;
          }
          const liveDateCheck = validateKbttSubmissionDates(
            item.declaration.declarationKind,
            item.draftData,
            new Date(),
            {
              enforceArrivalWindow: true,
            },
          );
          if (!liveDateCheck.valid) {
            try {
              await this.repository.updateDeclaration({
                id: item.declaration.id,
                hotelId,
                expectedVersion: item.declaration.version,
                data: {
                  status: "FAILED",
                  claimToken: null,
                  submittedPayloadFingerprint: item.fingerprint,
                  providerCode: liveDateCheck.outOfWindow
                    ? "OUT_OF_DATE_WINDOW"
                    : "LOCAL_VALIDATION",
                  providerMessage: liveDateCheck.issues
                    .map((i) => `${KBTT_FIELD_LABELS[i.field] ?? i.field}: ${i.message}`)
                    .join("; "),
                  submittedAt: null,
                },
              });
            } catch {
              // ignore CAS conflict
            }
            validationFailureCount++;
            continue;
          }
          let claimedDeclaration: KbttGuestDeclaration;
          const claimToken = randomUUID();
          const attemptedAt = new Date();
          try {
            claimedDeclaration = await this.repository.updateDeclaration({
              id: item.declaration.id, hotelId, expectedVersion: item.declaration.version,
              data: { status: "UNKNOWN", submittedPayloadJson: item.payload as Prisma.InputJsonValue,
                submittedPayloadFingerprint: item.fingerprint, submittedCsltId: session!.CsltId,
                submittedConnectionCiphertext: baselineCiphertext,
                claimToken,
                attemptedAt },
            });
          } catch {
            continue; // Another writer owns the current declaration version.
          }
          const outcome = await this.sendInitialDeclaration(
            hotelId,
            claimedDeclaration.id,
            claimedDeclaration.declarationKind,
            item.payload,
            session!.AccessToken,
            session!.CsltId,
            !isManualDelayed,
            baselineCiphertext,
          );
          if (outcome.outcome === "SUCCESS") {
            await this.persistDeclarationSubmitted(
              hotelId,
              claimedDeclaration,
              item.payload,
              item.fingerprint,
              outcome,
              session!.CsltId,
              baselineCiphertext,
            );
            directSuccessCount++;
          } else if (outcome.outcome === "BUSINESS_REJECTION" && outcome.code === "DELIVERY_PAUSED") {
            await this.repository.updateDeclaration({
              id: claimedDeclaration.id, hotelId, expectedVersion: claimedDeclaration.version,
              data: { status: "FAILED", claimToken: null, providerCode: "DELIVERY_PAUSED", providerMessage: "Luồng gửi BCA đang tạm dừng." },
            });
            deliveryPaused = true;
            break;
          } else if (outcome.outcome === "BUSINESS_REJECTION") {
            await this.persistDeclarationFailed(
              hotelId,
              claimedDeclaration,
              item.fingerprint,
              outcome,
              baselineCiphertext,
            );
            bcaRejectionCount++;
            if (KBTT_TRANSIENT_OR_PAUSED_CODES.has(outcome.code)) {
              hasTransientSafeFailure = true;
            }
          } else {
            await this.persistDeclarationUnknown(hotelId, claimedDeclaration, item.fingerprint,
              outcome.message || "Lần gửi chưa rõ kết quả; cần đối soát.");
            transientExhaustedCount++;
          }
        }
        if (leaseFenced || deliveryPaused) break;

        if (totalEligibleCount >= MAX_BATCH_ELIGIBLE) {
          while (hasMorePages && !hasBacklog) {
            if (pagesScanned >= MAX_SCAN_PAGES) {
              hasBacklog = true;
              if (cursor) {
                this.autoSubmitResumeCursors.set(hotelId, cursor);
              }
              break;
            }
            pagesScanned++;
            const nextResult = await this.occupantsReadService?.getActiveStayOccupantsPaged(
              hotelId,
              {
                cursor,
                take: PAGE_SIZE,
                arrivalStart,
                arrivalEnd,
                kbttFilter: "UNSYNCHRONIZED",
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
            const nextCheckContext = getKbttSubmissionDateContext(new Date());
            for (const occ of nextOccupants) {
              const decl = declByOcc.get(occ.id);
              if (this.isDeclarationEligibleForAutoCatchUp(occ, decl, nextCheckContext, cutoffInstant)) {
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

      if (totalEligibleCount === 0 && !hasBacklog) {
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

      if (hasTransientSafeFailure && !isDryRun && !isManualDelayed && !deliveryPaused) {
        await this.scheduleEligibleSameDayCatchUp(hotelId).catch(() => null);
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
          const validated = schema.safeParse(normalizeKbttSubmissionDates(citizenshipKind, draft, new Date()));
          const arrivalYmd = this.getOccupantArrivalVietnamYmd(occupant, draft);
          const dateCheck = validateKbttSubmissionDates(
            citizenshipKind,
            normalizeKbttSubmissionDates(citizenshipKind, (validated.success ? validated.data : draft) as Record<string, unknown>, new Date()),
            new Date(),
            {
              enforceArrivalWindow: true,
            },
          );

          if (!validated.success || !dateCheck.valid) {
            const zodIssueMsg = !validated.success
              ? formatValidationIssues(validated.error.issues)
              : "";
            const dateIssueMsg = !dateCheck.valid
              ? dateCheck.issues
                  .map((issue) => {
                    const label = KBTT_FIELD_LABELS[issue.field] ?? issue.field;
                    return issue.message.toLocaleLowerCase("vi").includes(label.toLocaleLowerCase("vi"))
                      ? issue.message
                      : `${label}: ${issue.message}`;
                  })
                  .join("; ")
              : "";
            const error = [zodIssueMsg, dateIssueMsg].filter(Boolean).join("; ");
            const failureCode = !validated.success
              ? "LOCAL_VALIDATION"
              : dateCheck.outOfWindow
                ? "OUT_OF_DATE_WINDOW"
                : "LOCAL_VALIDATION";
            const draftFp = createHash("sha256")
              .update(JSON.stringify([normalizeKbttSubmissionDates(citizenshipKind, draft, new Date())]))
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
                providerCode: failureCode,
                providerMessage: error,
              });
            } else {
              await this.repository.updateDeclaration({
                id: existingDecl.id,
                hotelId,
                expectedVersion: existingDecl.version,
                data: {
                  status: "FAILED",
                  claimToken: null,
                  draftPayloadJson: this.compactDraft(citizenshipKind, draft, occupant),
                  submittedPayloadFingerprint: draftFp,
                  providerCode: failureCode,
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
