import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { KbttGuestDeclaration, KbttHotelConnection, Prisma } from "@prisma/client";
import { HotelAccessService, HotelStayOccupantsReadService } from "../../property/property-public";
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
export class KbttService implements OnModuleDestroy {
  private readonly sessions = new Map<string, { ciphertext: string; session: KbttSession }>();
  private readonly operations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly cipher: KbttCredentialCipher,
    private readonly provider: KbttProviderClient,
    private readonly occupantsReadService?: HotelStayOccupantsReadService,
  ) {}

  private withOccupantDefaults(
    citizenshipKind: "VIETNAMESE" | "FOREIGN",
    data: Record<string, unknown>,
    occupant: NonNullable<Awaited<ReturnType<KbttRepository["findOccupant"]>>>,
  ): Record<string, unknown> {
    const draft = { ...data };
    if (!draft.hoTen && occupant.fullName) draft.hoTen = occupant.fullName;
    if (!draft.soPhong && occupant.stay?.room?.roomNumber) {
      draft.soPhong = occupant.stay.room.roomNumber;
    }
    if (!draft.ngayDenCsltStr && (occupant.stay?.checkedInAt || occupant.stay?.plannedCheckInAt)) {
      draft.ngayDenCsltStr = formatVietnamDateTime(
        occupant.stay.checkedInAt || occupant.stay.plannedCheckInAt,
      );
    }
    if (!draft.ngayDiDuKienStr && occupant.stay?.plannedCheckOutAt) {
      draft.ngayDiDuKienStr = formatVietnamDateTime(occupant.stay.plannedCheckOutAt);
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
      if (!draft.thoiHanTamTruStr && occupant.stay?.plannedCheckOutAt) {
        draft.thoiHanTamTruStr = formatVietnamDateTime(occupant.stay.plannedCheckOutAt);
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
    const stayIds = [...new Set(occupants.map((occupant) => occupant.stayId))];
    const pagedStayIds = new Set(stayIds.slice((page - 1) * limit, page * limit));
    const pagedOccupants = occupants.filter((occupant) => pagedStayIds.has(occupant.stayId));

    const occupantIds = pagedOccupants.map((o) => o.id);
    const declarations = await this.repository.findDeclarationsByHotel(hotelId, occupantIds);

    const declarationsByOccupant = new Map<string, KbttGuestDeclaration>();
    for (const decl of declarations) {
      if (!declarationsByOccupant.has(decl.occupantId)) {
        declarationsByOccupant.set(decl.occupantId, decl);
      }
    }

    return pagedOccupants.map((occupant) => {
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
            : typeof draft.quocTich === "string"
              ? draft.quocTich
              : occupant.nationality,
        documentType:
          classification === "FOREIGN"
            ? 4
            : typeof draft.loaiGiayTo === "number"
              ? draft.loaiGiayTo
              : typeof draft.soGiayTo === "string" && /^\d{12}$/.test(draft.soGiayTo)
                ? 1
                : typeof draft.soGiayTo === "string" && /^\d{9}$/.test(draft.soGiayTo)
                  ? 2
                  : typeof draft.soGiayTo === "string" &&
                      /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(draft.soGiayTo)
                    ? 4
                    : null,
        residencePlace: occupant.residencePlace,
        citizenshipKind: classification,
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

    const { citizenshipKind, data } = parseDraftPayload(body);

    const existing = await this.repository.findLatestDeclaration(hotelId, occupantId);

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
      const result = await this.provider.submitDeclaration(
        declarationKind,
        payload,
        session.AccessToken,
      );
      const providerCode = result.code.slice(0, 32);
      const providerMessage = sanitizeProviderText(result.message || "Không có thông báo");
      const providerResponseJson = result.data
        ? (sanitizeProviderData(result.data) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      if (result.outcome === "SUCCESS") {
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
        return this.viewDeclaration(updated);
      }

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
}
