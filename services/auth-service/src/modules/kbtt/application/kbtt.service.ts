import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createHash } from "crypto";
import { KbttAutoSubmitRun, KbttGuestDeclaration, KbttHotelConnection, Prisma } from "@prisma/client";
import { HotelAccessService, HotelStayOccupantsReadService } from "../../property/property-public";
import { TelegramNotificationService } from "../../notifications/notifications-public";
import { z } from "zod";
import {
  isValidCalendarDate,
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
  type KbttDerivedStatus,
  type KbttSession,
} from "../domain/schemas/kbtt.schema";
import { KbttCredentialCipher } from "../infrastructure/kbtt-credential-cipher";
import {
  KbttProviderClient,
  kbttAuthFailed,
  kbttProviderError,
  KBTT_AUTH_FAILED_MESSAGE,
} from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";

function formatVietnamDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
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
    .slice(0, 500);
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

  const rawIdentity = String(draft.soGiayTo || draft.soHoChieu || "").trim();
  if (!rawIdentity) return false;
  const normalizedIdentity = rawIdentity.toUpperCase().replace(/[\s-]/g, "");

  const rawDeparture = String(draft.ngayDiDuKienStr || draft.thoiHanTamTruStr || "").trim();
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
  private readonly sessions = new Map<string, { ciphertext: string; session: KbttSession }>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly scheduledTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly cipher: KbttCredentialCipher,
    private readonly provider: KbttProviderClient,
    private readonly occupantsReadService?: HotelStayOccupantsReadService,
    private readonly telegramNotificationService?: TelegramNotificationService,
  ) {}

  async onModuleInit() {
    const runs = await this.repository.findPendingScheduledAutoSubmitRuns();
    for (const run of runs) {
      if ((run.summaryJson as any)?.trigger === "MANUAL_DELAYED") this.armScheduledRun(run);
    }
  }

  private withOccupantDefaults(
    citizenshipKind: "VIETNAMESE" | "FOREIGN",
    data: Record<string, unknown>,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>> | Awaited<ReturnType<HotelStayOccupantsReadService["getActiveStayOccupants"]>>[number],
  ): Record<string, unknown> {
    const draft = { ...data };
    if (!draft.hoTen && occupant.fullName) draft.hoTen = occupant.fullName;
    const stay = "stay" in occupant ? occupant.stay : null;
    const roomNumber = "roomNumber" in occupant ? occupant.roomNumber : stay?.room?.roomNumber;
    const checkedInAt = "checkedInAt" in occupant ? occupant.checkedInAt : stay?.checkedInAt;
    const plannedCheckInAt = "plannedCheckInAt" in occupant ? occupant.plannedCheckInAt : stay?.plannedCheckInAt;
    const plannedCheckOutAt = "plannedCheckOutAt" in occupant ? occupant.plannedCheckOutAt : stay?.plannedCheckOutAt;
    if (!draft.soPhong && roomNumber) {
      draft.soPhong = roomNumber;
    }
    if (!draft.ngayDenCsltStr && (checkedInAt || plannedCheckInAt)) {
      draft.ngayDenCsltStr = formatVietnamDateTime(checkedInAt || plannedCheckInAt!);
    }
    if (!draft.ngayDiDuKienStr && plannedCheckOutAt) {
      draft.ngayDiDuKienStr = formatVietnamDateTime(plannedCheckOutAt);
    }
    if (
      !draft.ngayThangNamSinhStr &&
      occupant.dateOfBirth &&
      isValidCalendarDate(occupant.dateOfBirth)
    ) {
      draft.ngayThangNamSinhStr = occupant.dateOfBirth;
    }
    if (!draft.gioiTinh && occupant.gender) {
      const gender = occupant.gender.trim().toUpperCase();
      if (["M", "MALE", "NAM", "MALE [M]"].includes(gender)) draft.gioiTinh = "M";
      if (["F", "FEMALE", "NỮ", "NU", "FEMALE [F]"].includes(gender)) {
        draft.gioiTinh = "F";
      }
    }

    const identityNumber = occupant.identityNumber?.trim();
    if (citizenshipKind === "VIETNAMESE") {
      if (!draft.soGiayTo && identityNumber && /^[A-Za-z0-9]{1,32}$/.test(identityNumber)) {
        draft.soGiayTo = identityNumber;
      }
      if (!draft.loaiGiayTo && typeof draft.soGiayTo === "string") {
        if (/^\d{12}$/.test(draft.soGiayTo)) draft.loaiGiayTo = 1;
        else if (/^\d{9}$/.test(draft.soGiayTo)) draft.loaiGiayTo = 2;
        else if (/^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(draft.soGiayTo)) {
          draft.loaiGiayTo = 4;
        }
      }
      if (!draft.lyDoCuTru) draft.lyDoCuTru = 1;
    } else {
      if (!draft.soHoChieu && identityNumber && /^[A-Za-z0-9]{1,32}$/.test(identityNumber)) {
        draft.soHoChieu = identityNumber;
      }
      if (!draft.thoiHanTamTruStr && plannedCheckOutAt) {
        draft.thoiHanTamTruStr = formatVietnamDateTime(plannedCheckOutAt);
      }
      if (!draft.loaiNgayThangNamSinh && draft.ngayThangNamSinhStr) {
        draft.loaiNgayThangNamSinh = "D";
      }
      if (
        !draft.quocTich &&
        occupant.nationality &&
        /^[A-Z]{3}$/.test(occupant.nationality.trim().toUpperCase())
      ) {
        draft.quocTich = occupant.nationality.trim().toUpperCase();
      }
    }
    return draft;
  }

  async get(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.view(await this.repository.find(hotelId));
  }

  async connect(userId: string, roleId: string, hotelId: string, credentials: KbttCredentials) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
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
      this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session });
      if (previous && previous.AccessToken !== session.AccessToken)
        await this.revoke(previous.AccessToken);
      return this.view(connection);
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
        if (
          cached?.ciphertext === connection.ciphertext &&
          cached.session.Exp * 1000 <= Date.now() + 60_000
        ) {
          try {
            session = await this.provider.refresh(cached.session.RefreshToken);
          } catch {
            session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
          }
        } else {
          session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
        }
      } catch (error) {
        this.sessions.delete(hotelId);
        const response =
          error &&
          typeof error === "object" &&
          "response" in error &&
          error.response &&
          typeof error.response === "object"
            ? (error.response as { code?: string; message?: string })
            : {};
        const isStableError = response.code?.startsWith("KBTT_") ?? false;
        const code = isStableError ? response.code! : "KBTT_AUTH_FAILED";
        const message =
          isStableError && response.message ? response.message : KBTT_AUTH_FAILED_MESSAGE;
        await this.repository.update(connection, {
          status: "AUTH_FAILED",
          lastCheckedAt: new Date(),
          lastErrorCode: code,
          lastErrorMessage: message,
        });
        if (isStableError && error && typeof error === "object") throw error;
        throw kbttAuthFailed();
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
      this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session });
      if (cached && cached.session.AccessToken !== session.AccessToken)
        await this.revoke(cached.session.AccessToken);
      return this.view(updated);
    });
  }

  async disconnect(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const cached = this.sessions.get(hotelId);
      this.sessions.delete(hotelId);
      if (cached) await this.revoke(cached.session.AccessToken);
      await this.repository.remove(hotelId);
      return this.view(null);
    });
  }

  onModuleDestroy() {
    this.sessions.clear();
    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();
  }

  private armScheduledRun(run: KbttAutoSubmitRun) {
    if (this.scheduledTimers.has(run.id)) return;
    const timer = setTimeout(() => {
      this.scheduledTimers.delete(run.id);
      void this.executeAutoSubmitForHotel(run.hotelId, run.scheduledFor, run.dryRun).catch(
        () => undefined,
      );
    }, Math.max(0, run.scheduledFor.getTime() - Date.now()));
    this.scheduledTimers.set(run.id, timer);
  }

  private async revoke(accessToken: string) {
    try {
      await this.provider.revoke(accessToken);
    } catch {
      return;
    }
  }

  private async serialize<Result>(hotelId: string, action: () => Promise<Result>): Promise<Result> {
    for (const [cachedHotelId, cached] of this.sessions) {
      if (cachedHotelId !== hotelId && cached.session.Exp * 1000 <= Date.now())
        this.sessions.delete(cachedHotelId);
    }
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
    pagination?: { page?: number; limit?: number },
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const occupants = (await this.occupantsReadService?.getActiveStayOccupants(hotelId)) ?? [];
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 50));
    const pagedOccupants = occupants.slice((page - 1) * limit, page * limit);

    const occupantIds = pagedOccupants.map((o) => o.id);
    const declarations = await this.repository.findDeclarationsByHotel(hotelId, occupantIds);

    const declarationsByOccupant = new Map<string, KbttGuestDeclaration>();
    for (const decl of declarations) {
      if (!declarationsByOccupant.has(decl.occupantId)) {
        declarationsByOccupant.set(decl.occupantId, decl);
      }
    }

    const items = pagedOccupants.map((occupant) => {
      const decl = declarationsByOccupant.get(occupant.id) ?? null;
      const draft = (decl?.draftPayloadJson ?? {}) as Record<string, unknown>;
      const classification = decl?.declarationKind ?? occupant.citizenshipKind ?? null;
      const derivedStatus: KbttDerivedStatus = decl
        ? decl.status === "SUBMITTED"
          ? "SUBMITTED"
          : "DRAFT"
        : "MISSING_PROFILE";

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
            : occupant.dateOfBirth,
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
                : (typeof draft.soGiayTo === "string"
                    ? draft.soGiayTo
                    : occupant.identityNumber) &&
                  /^\d{9,12}$/.test(
                    (typeof draft.soGiayTo === "string"
                      ? draft.soGiayTo
                      : occupant.identityNumber ?? "").trim(),
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
                      : occupant.identityNumber ?? "").trim(),
                  )
                ? 1
                : /^\d{9}$/.test(
                      (typeof draft.soGiayTo === "string"
                        ? draft.soGiayTo
                        : occupant.identityNumber ?? "").trim(),
                    )
                  ? 2
                  : /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(
                        (typeof draft.soHoChieu === "string"
                          ? draft.soHoChieu
                          : typeof draft.soGiayTo === "string"
                            ? draft.soGiayTo
                            : occupant.identityNumber ?? "").trim(),
                      )
                    ? 4
                    : null,
        residencePlace: occupant.residencePlace,
        citizenshipKind:
          classification ??
          (/^\d{9,12}$/.test((occupant.identityNumber ?? "").trim())
            ? "VIETNAMESE"
            : /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(
                  (occupant.identityNumber ?? "").trim(),
                )
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
              status: decl.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
              declarationKind: decl.declarationKind,
              providerCode: decl.providerCode,
              providerMessage: decl.providerMessage,
              submittedAt: decl.submittedAt ? decl.submittedAt.toISOString() : null,
              createdAt: decl.createdAt.toISOString(),
              updatedAt: decl.updatedAt.toISOString(),
            }
          : null,
      };
    });

    return {
      items,
      total: occupants.length,
      totalPages: Math.max(1, Math.ceil(occupants.length / limit)),
      page,
      limit,
    };
  }

  async getDeclaration(userId: string, roleId: string, hotelId: string, occupantId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const occupant = await this.repository.findOccupant(hotelId, occupantId);
    if (!occupant) {
      throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
    }
    const decl = await this.repository.findLatestDeclaration(hotelId, occupantId);
    return {
      occupant: {
        id: occupant.id,
        stayId: occupant.stayId,
        hotelId: occupant.hotelId,
        fullName: occupant.fullName,
        phone: occupant.phone,
        identityNumber: occupant.identityNumber,
        dateOfBirth: occupant.dateOfBirth,
        gender: occupant.gender,
        nationality: occupant.nationality,
        residencePlace: occupant.residencePlace,
        isPrimary: occupant.isPrimary,
        citizenshipKind: decl?.declarationKind ?? occupant.citizenshipKind ?? null,
      },
      declaration: decl ? this.viewDeclaration(decl) : null,
      derivedStatus: decl
        ? decl.status === "SUBMITTED"
          ? "SUBMITTED"
          : "DRAFT"
        : "MISSING_PROFILE",
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
    const occupant = await this.repository.findOccupant(hotelId, occupantId);
    if (!occupant) {
      throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
    }

    const { citizenshipKind, data, allowSubmittedEdit } = parseDraftPayload(body);

    const existing = await this.repository.findLatestDeclaration(hotelId, occupantId);

    if (existing?.status === "SUBMITTED" && !allowSubmittedEdit) {
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
      { ...previousData, ...data },
      occupant,
    );

    let savedDeclaration: KbttGuestDeclaration;
    if (existing) {
      savedDeclaration = await this.repository.updateDeclaration({
        id: existing.id,
        hotelId,
        expectedVersion: existing.version,
        data: {
          declarationKind: citizenshipKind,
          draftPayloadJson: draftData as Prisma.InputJsonValue,
          status: "DRAFT",
          providerCode: null,
          providerMessage: null,
          providerResponseJson: Prisma.JsonNull,
          submittedAt: null,
        },
      });
    } else {
      savedDeclaration = await this.repository.createDeclaration({
        hotelId,
        stayId: occupant.stayId,
        occupantId,
        declarationKind: citizenshipKind,
        revision: 1,
        status: "DRAFT",
        draftPayloadJson: draftData as Prisma.InputJsonValue,
      });
    }

    const identityNumber =
      citizenshipKind === "VIETNAMESE"
        ? typeof draftData.soGiayTo === "string" ? draftData.soGiayTo : undefined
        : typeof draftData.soHoChieu === "string" ? draftData.soHoChieu : undefined;

    await this.repository.updateOccupantDetails(occupantId, hotelId, {
      identityNumber,
      fullName: typeof draftData.hoTen === "string" ? draftData.hoTen : undefined,
      gender: typeof draftData.gioiTinh === "string" ? draftData.gioiTinh : undefined,
      dateOfBirth: typeof draftData.ngayThangNamSinhStr === "string" ? draftData.ngayThangNamSinhStr : undefined,
      nationality: typeof draftData.quocTich === "string" ? draftData.quocTich : undefined,
    });

    if (occupant.citizenshipKind !== citizenshipKind) {
      await this.repository.updateOccupantCitizenship(occupantId, hotelId, citizenshipKind);
    }

    return this.viewDeclaration(savedDeclaration);
  }

  private async getOrRefreshSession(
    hotelId: string,
    connection: KbttHotelConnection,
  ): Promise<KbttSession> {
    const cached = this.sessions.get(hotelId);
    let session: KbttSession;

    if (
      cached?.ciphertext === connection.ciphertext &&
      cached.session.Exp * 1000 > Date.now() + 60_000
    ) {
      return cached.session;
    }

    if (
      cached?.ciphertext === connection.ciphertext &&
      cached.session.Exp * 1000 <= Date.now() + 60_000
    ) {
      try {
        session = await this.provider.refresh(cached.session.RefreshToken);
      } catch {
        session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
      }
    } else {
      session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
    }

    this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session });
    if (cached && cached.session.AccessToken !== session.AccessToken) {
      await this.revoke(cached.session.AccessToken);
    }
    return session;
  }

  async submit(userId: string, roleId: string, hotelId: string, occupantId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const occupant = await this.repository.findOccupant(hotelId, occupantId);
      if (!occupant) {
        throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
      }

      const declaration = await this.repository.findLatestDeclaration(hotelId, occupantId);
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
            data: { draftPayloadJson: parsed.data },
          })
        : await this.repository.createDeclaration({
            hotelId,
            stayId: occupant.stayId,
            occupantId,
            declarationKind,
            status: "DRAFT",
            draftPayloadJson: parsed.data,
          });

      const connection = await this.repository.find(hotelId);
      if (!connection) {
        throw new NotFoundException({
          code: "KBTT_NOT_CONFIGURED",
          message: "Khách sạn chưa cấu hình kết nối KBTT.",
        });
      }

      const session = await this.getOrRefreshSession(hotelId, connection);
      const payload = [parsed.data];
      let result = await this.provider.submitDeclaration(
        declarationKind,
        payload,
        session.AccessToken,
      );

      // If token expired or rejected with HTTP 401/403, evict cached session and re-login once
      if (result.code === "HTTP_401" || result.code === "HTTP_403") {
        this.sessions.delete(hotelId);
        try {
          const freshSession = await this.provider.login(this.cipher.decrypt(hotelId, connection));
          this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session: freshSession });
          result = await this.provider.submitDeclaration(
            declarationKind,
            payload,
            freshSession.AccessToken,
          );
        } catch {
          // re-login failed, preserve rejection result
        }
      }

      if (result.outcome === "AMBIGUOUS") {
        try {
          const probeResult = await this.provider.submitDeclaration(
            declarationKind,
            payload,
            session.AccessToken,
            12_000,
          );
          if (
            probeResult.outcome === "SUCCESS" ||
            isBcaDuplicateConflict(probeResult.message, parsed.data)
          ) {
            result = probeResult;
          }
        } catch {
          // ignore probe failure
        }
      }

      const isConflictSuccess =
        result.outcome === "BUSINESS_REJECTION" &&
        isBcaDuplicateConflict(result.message, parsed.data);

      if (result.outcome === "SUCCESS" || isConflictSuccess) {
        const providerCode = isConflictSuccess ? "200" : result.code.slice(0, 32);
        const providerMessage = isConflictSuccess
          ? "Đã xác nhận khai báo trên hệ thống Bộ Công An (Tự động đối soát)"
          : sanitizeProviderText(result.message || "Không có thông báo");
        const providerResponseJson = result.data
          ? (sanitizeProviderData(result.data) as Prisma.InputJsonValue)
          : Prisma.JsonNull;

        const updated = await this.repository.updateDeclaration({
          id: preparedDeclaration.id,
          hotelId,
          expectedVersion: preparedDeclaration.version,
          data: {
            status: "SUBMITTED",
            draftPayloadJson: parsed.data,
            submittedPayloadJson: payload,
            providerCode,
            providerMessage,
            providerResponseJson,
            submittedAt: new Date(),
          },
        });

        try {
          const hotelName = (await this.repository.findHotelName?.(hotelId)) || hotelId;
          const roomNumber = (occupant as any).stay?.room?.roomNumber || (occupant as any).roomNumber;
          const fromDate = String(parsed.data.ngayDenCsltStr || "").substring(0, 10);
          const toDate = String(
            parsed.data.ngayDiDuKienStr || (parsed.data as any).thoiHanTamTruStr || "",
          ).substring(0, 10);
          await this.telegramNotificationService?.sendKbttSingleSubmitNotification?.({
            hotelId,
            hotelName,
            roomNumber,
            fullName: occupant.fullName || (parsed.data as any).hoTen || "Khách lưu trú",
            identityNumber,
            stayPeriod: fromDate && toDate ? `${fromDate} ➔ ${toDate}` : undefined,
            status: "SUBMITTED",
            isReconciled: isConflictSuccess,
          });
        } catch {
          // non-blocking
        }

        return this.viewDeclaration(updated);
      }

      const providerCode = result.code.slice(0, 32);
      const providerMessage = sanitizeProviderText(result.message || "Không có thông báo");
      const providerResponseJson = result.data
        ? (sanitizeProviderData(result.data) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      await this.repository.updateDeclaration({
        id: preparedDeclaration.id,
        hotelId,
        expectedVersion: preparedDeclaration.version,
        data: {
          status: "DRAFT",
          providerCode,
          providerMessage,
          providerResponseJson,
          submittedAt: null,
        },
      });

      try {
        const hotelName = (await this.repository.findHotelName?.(hotelId)) || hotelId;
        const roomNumber = (occupant as any).stay?.room?.roomNumber || (occupant as any).roomNumber;
        await this.telegramNotificationService?.sendKbttSingleSubmitNotification?.({
          hotelId,
          hotelName,
          roomNumber,
          fullName: occupant.fullName || (parsed.data as any).hoTen || "Khách lưu trú",
          identityNumber,
          status: "FAILED",
          errorMessage: providerMessage,
        });
      } catch {
        // non-blocking
      }

      throw new HttpException(
        {
          code: providerCode,
          message: providerMessage,
        },
        result.outcome === "BUSINESS_REJECTION" ? 422 : 502,
      );
    });
  }

  private viewDeclaration(decl: KbttGuestDeclaration) {
    return {
      id: decl.id,
      hotelId: decl.hotelId,
      stayId: decl.stayId,
      occupantId: decl.occupantId,
      declarationKind: decl.declarationKind,
      revision: decl.revision,
      status: decl.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
      draftPayload: decl.draftPayloadJson,
      providerCode: decl.providerCode,
      providerMessage: decl.providerMessage,
      submittedAt: decl.submittedAt ? decl.submittedAt.toISOString() : null,
      version: decl.version,
      createdAt: decl.createdAt.toISOString(),
      updatedAt: decl.updatedAt.toISOString(),
    };
  }

  private view(connection: KbttHotelConnection | null) {
    return {
      configured: Boolean(connection),
      status: connection?.status ?? "DISCONNECTED",
      maskedUsername: connection ? "••••••" : null,
      csltId: connection?.csltId ?? null,
      csltKhuVuc: connection?.csltKhuVuc ?? null,
      csltDonVi: connection?.csltDonVi ?? null,
      maTTCuaCslt: connection?.maTTCuaCslt ?? null,
      maPxCuaCslt: connection?.maPxCuaCslt ?? null,
      isCsltChinh: connection?.isCsltChinh ?? null,
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
    const activeRun = runs.find((r) => r.status === "RUNNING");
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
      autoSubmitEnabled: body.autoSubmitEnabled,
      autoSubmitTime: body.autoSubmitTime ?? null,
    });
    return {
      autoSubmitEnabled: updated.autoSubmitEnabled,
      autoSubmitTime: updated.autoSubmitTime,
    };
  }

  async submitDeclarationInternal(
    hotelId: string,
    declaration: KbttGuestDeclaration,
    session: KbttSession | null,
    isDryRun: boolean,
  ): Promise<{
    status: "SUBMITTED" | "FAILED" | "UNKNOWN";
    isReconciled?: boolean;
    isBusinessRejection?: boolean;
    error?: string;
  }> {
    if (isDryRun) {
      return { status: "SUBMITTED" };
    }

    // CAS transition to SENDING
    let sendingDecl: KbttGuestDeclaration;
    try {
      sendingDecl = await this.repository.updateDeclaration({
        id: declaration.id,
        hotelId,
        expectedVersion: declaration.version,
        data: {
          status: "SENDING",
        },
      });
    } catch {
      return { status: "UNKNOWN", error: "CAS conflict setting SENDING" };
    }

    const payload = [sendingDecl.draftPayloadJson];
    const payloadStr = JSON.stringify(payload);
    const submittedPayloadFingerprint = createHash("sha256").update(payloadStr).digest("hex");
    const draftData = (sendingDecl.draftPayloadJson ?? {}) as Record<string, unknown>;

    let attempt = 0;
    const maxAttempts = 3;
    let finalOutcome: KbttSubmitOutcome | null = null;
    let lastTransientError = "";

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const timeoutMs = attempt > 1 ? 12_000 : undefined;
        const res = await this.provider.submitDeclaration(
          sendingDecl.declarationKind,
          payload,
          session!.AccessToken,
          timeoutMs,
        );
        finalOutcome = res;

        // If duplicate conflict on BUSINESS_REJECTION: reconcile to SUCCESS
        if (
          res.outcome === "BUSINESS_REJECTION" &&
          isBcaDuplicateConflict(res.message, draftData)
        ) {
          break;
        }

        // If token expired or rejected (401/403), evict cached session and try to re-authenticate once
        if ((res.code === "HTTP_401" || res.code === "HTTP_403") && attempt === 1) {
          this.sessions.delete(hotelId);
          const conn = await this.repository.find(hotelId);
          if (conn) {
            try {
              session = await this.provider.login(this.cipher.decrypt(hotelId, conn));
              this.sessions.set(hotelId, { ciphertext: conn.ciphertext, session });
              continue;
            } catch {
              // re-login failed, stop retry
              break;
            }
          }
        }

        // If SUCCESS or regular BUSINESS_REJECTION (not transient), do not retry
        if (res.outcome === "SUCCESS" || res.outcome === "BUSINESS_REJECTION") {
          break;
        }

        // Outcome is AMBIGUOUS (transient)
        lastTransientError = res.message || "Lỗi tạm thời từ hệ thống C06";
      } catch (err: any) {
        lastTransientError = err?.message || "Lỗi kết nối nhà cung cấp C06";
        finalOutcome = {
          outcome: "AMBIGUOUS",
          code: "PROVIDER_TIMEOUT",
          message: lastTransientError,
        };
      }
    }

    const isConflictSuccess =
      finalOutcome?.outcome === "BUSINESS_REJECTION" &&
      isBcaDuplicateConflict(finalOutcome.message, draftData);

    if (finalOutcome?.outcome === "SUCCESS" || isConflictSuccess) {
      const providerCode = isConflictSuccess ? "200" : finalOutcome!.code.slice(0, 32);
      const providerMessage = isConflictSuccess
        ? "Đã xác nhận khai báo trên hệ thống Bộ Công An (Tự động đối soát)"
        : sanitizeProviderText(finalOutcome!.message || "Không có thông báo");
      const providerResponseJson = finalOutcome!.data
        ? (sanitizeProviderData(finalOutcome!.data) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      await this.repository.updateDeclaration({
        id: sendingDecl.id,
        hotelId,
        expectedVersion: sendingDecl.version,
        data: {
          status: "SUBMITTED",
          draftPayloadJson: sendingDecl.draftPayloadJson ?? Prisma.JsonNull,
          submittedPayloadJson: payload,
          submittedPayloadFingerprint,
          providerCode,
          providerMessage,
          providerResponseJson,
          submittedAt: new Date(),
        },
      });
      return { status: "SUBMITTED", isReconciled: isConflictSuccess };
    }

    if (finalOutcome?.outcome === "BUSINESS_REJECTION") {
      const providerCode = finalOutcome.code.slice(0, 32);
      const providerMessage = sanitizeProviderText(finalOutcome.message || "Không có thông báo");
      const providerResponseJson = finalOutcome.data
        ? (sanitizeProviderData(finalOutcome.data) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      await this.repository.updateDeclaration({
        id: sendingDecl.id,
        hotelId,
        expectedVersion: sendingDecl.version,
        data: {
          status: "FAILED",
          submittedPayloadFingerprint,
          providerCode,
          providerMessage,
          providerResponseJson,
          submittedAt: null,
        },
      });
      return { status: "FAILED", isBusinessRejection: true, error: providerMessage };
    }

    // Transient failure exhausted 3 attempts -> UNKNOWN
    const providerCode = finalOutcome?.code?.slice(0, 32) || "PROVIDER_TIMEOUT";
    const providerMessage = sanitizeProviderText(
      finalOutcome?.message || lastTransientError || "Hết lượt thử lại khi kết nối C06",
    );

    try {
      await this.repository.updateDeclaration({
        id: sendingDecl.id,
        hotelId,
        expectedVersion: sendingDecl.version,
        data: {
          status: "UNKNOWN",
          submittedPayloadFingerprint,
          providerCode,
          providerMessage,
          submittedAt: null,
        },
      });
    } catch {
      // secondary CAS error ignored
    }
    return { status: "UNKNOWN", error: providerMessage };
  }

  async executeAutoSubmitForHotel(
    hotelId: string,
    scheduledForDate: Date,
    isDryRun: boolean,
  ) {
    return this.serialize(hotelId, async () => {
      const run = await this.repository.claimAutoSubmitRunLease(hotelId, scheduledForDate, isDryRun);
      if (!run) {
        return null;
      }

      const connection = await this.repository.find(hotelId);
      if (!connection) {
        return await this.repository.finalizeAutoSubmitRun(run.id, {
          status: "FAILED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
          telegramSent: false,
          summaryJson: { error: "Khách sạn chưa cấu hình kết nối KBTT." },
        });
      }

      let session: KbttSession | null = null;
      if (!isDryRun) {
        try {
          session = await this.getOrRefreshSession(hotelId, connection);
        } catch (authError: any) {
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
      const PAGE_SIZE = 10;
      let totalEligibleCount = 0;
      let directSuccessCount = 0;
      let reconciledSuccessCount = 0;
      let validationFailureCount = 0;
      let bcaRejectionCount = 0;
      let transientExhaustedCount = 0;
      let leaseFenced = false;

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

        const now = Date.now();
        const STALE_SENDING_MS = 5 * 60 * 1000;

        const candidates = occupants
          .map((occupant) => ({ occupant, declaration: latestByOccupant.get(occupant.id) ?? null }))
          .filter(({ occupant, declaration }) => {
            if (!occupant.citizenshipKind) return false;
            if (!declaration) return true;

            // Skip SUBMITTED
            if (declaration.status === "SUBMITTED") return false;

            // Recover stale SENDING safely
            if (declaration.status === "SENDING") {
              const updatedAtMs = declaration.updatedAt ? new Date(declaration.updatedAt).getTime() : 0;
              return now - updatedAtMs > STALE_SENDING_MS;
            }

            if (declaration.status === "DRAFT" || declaration.status === "READY") {
              return true;
            }

            if (declaration.status === "UNKNOWN") {
              return true;
            }

            // declaration.status === "FAILED"
            const isTransientFailure =
              declaration.providerCode === "PROVIDER_TIMEOUT" ||
              declaration.providerCode?.startsWith("HTTP_5") ||
              declaration.providerCode?.startsWith("5") ||
              declaration.providerCode === "STREAM_READ_ERROR";
            if (isTransientFailure) {
              return true;
            }

            // Validation or business failure -> only retry if payload changed
            const draft = this.withOccupantDefaults(
              declaration.declarationKind,
              (declaration.draftPayloadJson ?? {}) as Record<string, unknown>,
              occupant,
            );
            const currentFingerprint = createHash("sha256")
              .update(JSON.stringify([draft]))
              .digest("hex");

            if (
              declaration.submittedPayloadFingerprint &&
              declaration.submittedPayloadFingerprint === currentFingerprint
            ) {
              return false;
            }

            return true;
          });

        const declarations = candidates
          .filter(({ occupant }) => Boolean(occupant.citizenshipKind))
          .map(({ occupant, declaration }) =>
            declaration ?? ({
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
          continue;
        }

        const occupantById = new Map(occupants.map((occupant) => [occupant.id, occupant]));

        const chunkResults = await Promise.allSettled(
          declarations.map(async (decl) => {
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
                    draftPayloadJson: draft as Prisma.InputJsonValue,
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
              return {
                status: "FAILED" as const,
                category: "VALIDATION_FAILURE" as const,
              };
            }

            let submitDeclaration = decl;
            if (!isDryRun && decl.id.startsWith("pending:")) {
              submitDeclaration = await this.repository.createDeclaration({
                hotelId,
                stayId: decl.stayId,
                occupantId: decl.occupantId,
                declarationKind: decl.declarationKind,
                status: "READY",
                draftPayloadJson: validated.data as Prisma.InputJsonValue,
              });
            } else if (!isDryRun && occupant) {
              submitDeclaration = await this.repository.updateDeclaration({
                id: decl.id,
                hotelId,
                expectedVersion: decl.version,
                data: { draftPayloadJson: validated.data as Prisma.InputJsonValue },
              });
            }

            const result = await this.submitDeclarationInternal(
              hotelId,
              submitDeclaration,
              session,
              isDryRun,
            );

            let category:
              | "DIRECT_SUCCESS"
              | "RECONCILED_SUCCESS"
              | "BCA_REJECTION"
              | "TRANSIENT_EXHAUSTED";
            if (result.status === "SUBMITTED") {
              category = result.isReconciled ? "RECONCILED_SUCCESS" : "DIRECT_SUCCESS";
            } else if (result.status === "FAILED") {
              category = "BCA_REJECTION";
            } else {
              category = "TRANSIENT_EXHAUSTED";
            }
            return {
              status: result.status,
              category,
              error: result.error,
            };
          }),
        );

        for (const r of chunkResults) {
          const category =
            r.status === "fulfilled"
              ? r.value.category
              : "TRANSIENT_EXHAUSTED";

          if (category === "DIRECT_SUCCESS") {
            directSuccessCount++;
          } else if (category === "RECONCILED_SUCCESS") {
            reconciledSuccessCount++;
          } else if (category === "VALIDATION_FAILURE") {
            validationFailureCount++;
          } else if (category === "BCA_REJECTION") {
            bcaRejectionCount++;
          } else {
            transientExhaustedCount++;
          }
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
            breakdown: {
              directSuccessCount: 0,
              reconciledSuccessCount: 0,
              validationFailureCount: 0,
              bcaRejectionCount: 0,
              transientExhaustedCount: 0,
            },
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
          telegramSent = await (this.telegramNotificationService as any).sendKbttAutoSubmitSummary(hotelId, {
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
          });
        } catch {
          // non-blocking
        }
      }

      const finalRun = await this.repository.finalizeAutoSubmitRun(run.id, {
        status: "COMPLETED",
        totalCount: totalEligibleCount,
        successCount,
        failedCount,
        unknownCount,
        telegramSent,
        summaryJson: {
          breakdown: {
            directSuccessCount,
            reconciledSuccessCount,
            validationFailureCount,
            bcaRejectionCount,
            transientExhaustedCount,
          },
        },
      });

      return finalRun;
    });
  }

  async testAutoSubmit(
    userId: string,
    roleId: string,
    hotelId: string,
    dryRun = true,
  ) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    if (!dryRun && process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true") {
      throw new BadRequestException("Live KBTT auto-submit chưa được bật trong môi trường hiện tại.");
    }
    const run = await this.executeAutoSubmitForHotel(hotelId, new Date(), dryRun);
    if (!run) {
      throw new BadRequestException("Không thể khởi tạo phiên nộp tự động hoặc đang có phiên khác đang chạy.");
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

  async scheduleAutoSubmit(userId: string, roleId: string, hotelId: string, dryRun: boolean) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    if (!dryRun && process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true") {
      throw new BadRequestException("Live KBTT auto-submit chưa được bật trong môi trường hiện tại.");
    }
    const pending = await this.repository.findPendingScheduledAutoSubmitRuns(hotelId);
    if (
      pending.some(
        (run) =>
          (run.summaryJson as any)?.trigger === "MANUAL_DELAYED" &&
          run.scheduledFor.getTime() > Date.now(),
      )
    ) {
      throw new ConflictException("Đã có một phiên KBTT đang được hẹn.");
    }
    const run = await this.repository.createScheduledAutoSubmitRun(
      hotelId,
      new Date(Date.now() + 15_000),
      dryRun,
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

  private generateRandomCccd(occ?: { gender?: string | null; dateOfBirth?: string | null }): string {
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

  async devResetDeclarations(
    userId: string,
    roleId: string,
    hotelId: string,
    options?: { generateNewIdentityNumbers?: boolean },
  ) {
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
              draftPayloadJson: draft as Prisma.InputJsonValue,
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
        ? `Đã đổi trạng thái toàn bộ ${resetCount} hồ sơ về Chưa gửi và sinh mới ${generatedCount} Số giấy tờ ngẫu nhiên hợp lệ trong DB.`
        : `Đã đổi trạng thái toàn bộ ${resetCount} hồ sơ về Chưa gửi (DRAFT). Bạn có thể chỉnh sửa và bấm Upload tất cả test đẩy BCA ngay.`,
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
            draftPayloadJson: draft as Prisma.InputJsonValue,
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
      message: `Đã can thiệp DB cập nhật thành công thông tin / Số giấy tờ cho ${updatedCount} khách lưu trú.`,
      updatedCount,
    };
  }
}


