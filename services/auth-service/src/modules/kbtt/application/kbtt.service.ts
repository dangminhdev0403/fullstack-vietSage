import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  KbttDeclarationStatus,
  KbttGuestDeclaration,
  KbttHotelConnection,
  Prisma,
} from "@prisma/client";
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
      const classification = decl?.declarationKind ?? occupant.citizenshipKind ?? null;
      const derivedStatus: KbttDerivedStatus = decl?.status ?? "MISSING_PROFILE";

      return {
        occupantId: occupant.id,
        stayId: occupant.stayId,
        hotelId: occupant.hotelId,
        roomId: occupant.roomId,
        roomNumber: occupant.roomNumber,
        isPrimary: occupant.isPrimary,
        fullName: occupant.fullName,
        phone: occupant.phone,
        identityNumber: occupant.identityNumber,
        dateOfBirth: occupant.dateOfBirth,
        gender: occupant.gender,
        nationality: occupant.nationality,
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
              status: decl.status,
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
      derivedStatus: decl ? decl.status : "MISSING_PROFILE",
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

    const EDITABLE_STATUSES: readonly KbttDeclarationStatus[] = ["DRAFT", "READY", "FAILED"];
    const existing = await this.repository.findLatestDeclaration(hotelId, occupantId);
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
      if (existing.status === "SUBMITTED") {
        throw new BadRequestException(
          "Hồ sơ đã được gửi thành công đến cơ quan quản lý (SUBMITTED), không thể sửa đổi.",
        );
      }
      if (existing.status === "SENDING") {
        throw new BadRequestException(
          "Hồ sơ đang trong quá trình gửi (SENDING), không thể sửa đổi.",
        );
      }
      if (existing.status === "UNKNOWN") {
        throw new BadRequestException(
          "Hồ sơ ở trạng thái không xác định (UNKNOWN), không thể sửa đổi.",
        );
      }
      if (existing.status === "CANCELLED") {
        throw new BadRequestException("Hồ sơ đã bị hủy (CANCELLED), cần tạo bản sửa đổi mới.");
      }
      throw new BadRequestException(`Không thể sửa đổi hồ sơ ở trạng thái ${existing.status}.`);
    }

    const draftData = { ...data };
    if (!draftData.hoTen && occupant.fullName) draftData.hoTen = occupant.fullName;
    if (!draftData.soPhong && occupant.stay?.room?.roomNumber) {
      draftData.soPhong = occupant.stay.room.roomNumber;
    }
    if (
      !draftData.ngayDenCsltStr &&
      (occupant.stay?.checkedInAt || occupant.stay?.plannedCheckInAt)
    ) {
      draftData.ngayDenCsltStr = formatVietnamDateTime(
        occupant.stay.checkedInAt || occupant.stay.plannedCheckInAt,
      );
    }
    if (!draftData.ngayDiDuKienStr && occupant.stay?.plannedCheckOutAt) {
      draftData.ngayDiDuKienStr = formatVietnamDateTime(occupant.stay.plannedCheckOutAt);
    }
    if (
      !draftData.ngayThangNamSinhStr &&
      occupant.dateOfBirth &&
      isValidCalendarDate(occupant.dateOfBirth)
    ) {
      draftData.ngayThangNamSinhStr = occupant.dateOfBirth;
    }
    if (!draftData.gioiTinh && occupant.gender) {
      const g = occupant.gender.trim().toUpperCase();
      if (g === "M" || g === "MALE" || g === "NAM") draftData.gioiTinh = "M";
      else if (g === "F" || g === "FEMALE" || g === "NỮ" || g === "NU") draftData.gioiTinh = "F";
    }

    if (citizenshipKind === "VIETNAMESE") {
      if (!draftData.soGiayTo && occupant.identityNumber) {
        const rawId = occupant.identityNumber.trim();
        if (/^[A-Za-z0-9]{1,32}$/.test(rawId)) {
          draftData.soGiayTo = rawId;
        }
      }
    } else {
      if (!draftData.soHoChieu && occupant.identityNumber) {
        const rawId = occupant.identityNumber.trim();
        if (/^[A-Za-z0-9]{1,32}$/.test(rawId)) {
          draftData.soHoChieu = rawId;
        }
      }
    }

    let savedDeclaration: KbttGuestDeclaration;
    if (existing?.status === "FAILED") {
      savedDeclaration = await this.repository.createDeclaration({
        hotelId,
        stayId: occupant.stayId,
        occupantId,
        declarationKind: citizenshipKind,
        revision: existing.revision + 1,
        status: "DRAFT",
        draftPayloadJson: draftData as Prisma.InputJsonValue,
      });
    } else if (existing) {
      savedDeclaration = await this.repository.updateDeclaration({
        id: existing.id,
        hotelId,
        expectedVersion: existing.version,
        allowedStatuses: ["DRAFT", "READY", "FAILED"],
        data: {
          declarationKind: citizenshipKind,
          draftPayloadJson: draftData as Prisma.InputJsonValue,
          status: "DRAFT",
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

  async markReady(userId: string, roleId: string, hotelId: string, occupantId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    const occupant = await this.repository.findOccupant(hotelId, occupantId);
    if (!occupant) {
      throw new NotFoundException("Khách lưu trú không tồn tại trong khách sạn này.");
    }
    const decl = await this.repository.findLatestDeclaration(hotelId, occupantId);
    if (!decl) {
      throw new NotFoundException("Chưa có bản nháp khai báo để chuyển trạng thái READY.");
    }
    const EDITABLE_STATUSES: readonly KbttDeclarationStatus[] = ["DRAFT", "READY", "FAILED"];
    if (!EDITABLE_STATUSES.includes(decl.status)) {
      if (decl.status === "SUBMITTED") {
        throw new BadRequestException(
          "Hồ sơ đã được gửi thành công, không thể thay đổi trạng thái.",
        );
      }
      if (decl.status === "SENDING") {
        throw new BadRequestException(
          "Hồ sơ đang trong quá trình gửi, không thể thay đổi trạng thái.",
        );
      }
      if (decl.status === "UNKNOWN") {
        throw new BadRequestException(
          "Hồ sơ ở trạng thái không xác định (UNKNOWN), không thể thay đổi trạng thái.",
        );
      }
      if (decl.status === "CANCELLED") {
        throw new BadRequestException("Hồ sơ đã bị hủy (CANCELLED), không thể chuyển sang READY.");
      }
      throw new BadRequestException(`Không thể chuyển sang READY từ trạng thái ${decl.status}.`);
    }

    const draft = (decl.draftPayloadJson ?? {}) as Record<string, unknown>;
    if (decl.declarationKind === "VIETNAMESE") {
      const result = kbttVietnameseReadySchema.safeParse(draft);
      if (!result.success) {
        const errors = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new BadRequestException(`Bản nháp chưa đủ điều kiện READY: ${errors}`);
      }
    } else {
      const result = kbttForeignReadySchema.safeParse(draft);
      if (!result.success) {
        const errors = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new BadRequestException(`Bản nháp chưa đủ điều kiện READY: ${errors}`);
      }
    }

    const updated = await this.repository.updateDeclaration({
      id: decl.id,
      hotelId,
      expectedVersion: decl.version,
      allowedStatuses: ["DRAFT", "READY", "FAILED"],
      data: {
        status: "READY",
      },
    });

    return this.viewDeclaration(updated);
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

      const decl = await this.repository.findLatestDeclaration(hotelId, occupantId);
      if (!decl) {
        throw new NotFoundException("Chưa có hồ sơ khai báo để gửi.");
      }

      if (decl.status === "SUBMITTED") {
        throw new BadRequestException(
          "Hồ sơ đã được gửi thành công đến cơ quan quản lý (SUBMITTED), không thể gửi lại.",
        );
      }
      if (decl.status === "SENDING") {
        throw new BadRequestException(
          "Hồ sơ đang trong quá trình gửi (SENDING), vui lòng đợi hoàn tất.",
        );
      }
      if (decl.status === "UNKNOWN") {
        throw new BadRequestException(
          "Hồ sơ ở trạng thái không xác định (UNKNOWN), không thể tự động gửi lại.",
        );
      }
      if (decl.status === "CANCELLED") {
        throw new BadRequestException("Hồ sơ đã bị hủy (CANCELLED), không thể gửi.");
      }
      if (decl.status !== "READY" && decl.status !== "FAILED") {
        throw new BadRequestException(
          `Chỉ hồ sơ ở trạng thái READY hoặc FAILED mới có thể gửi (trạng thái hiện tại: ${decl.status}).`,
        );
      }

      let payload: unknown[];
      if (decl.status === "FAILED") {
        if (!Array.isArray(decl.submittedPayloadJson) || decl.submittedPayloadJson.length !== 1) {
          throw new BadRequestException("Hồ sơ lỗi không có snapshot an toàn để gửi lại.");
        }
        payload = decl.submittedPayloadJson;
      } else {
        const draft = (decl.draftPayloadJson ?? {}) as Record<string, unknown>;
        const result =
          decl.declarationKind === "VIETNAMESE"
            ? kbttVietnameseReadySchema.safeParse(draft)
            : kbttForeignReadySchema.safeParse(draft);
        if (!result.success) {
          const errors = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          throw new BadRequestException(`Hồ sơ chưa đủ điều kiện gửi: ${errors}`);
        }
        payload = [result.data];
      }

      const connection = await this.repository.find(hotelId);
      if (!connection) {
        throw new NotFoundException({
          code: "KBTT_NOT_CONFIGURED",
          message: "Khách sạn chưa cấu hình kết nối KBTT.",
        });
      }

      const payloadString = JSON.stringify(payload);
      const fingerprint = createHash("sha256").update(payloadString).digest("hex");
      if (
        decl.status === "FAILED" &&
        (!decl.submittedPayloadFingerprint || decl.submittedPayloadFingerprint !== fingerprint)
      ) {
        throw new BadRequestException("Snapshot gửi lại không khớp dấu vân tay đã lưu.");
      }

      const sendingDecl = await this.repository.updateDeclaration({
        id: decl.id,
        hotelId,
        expectedVersion: decl.version,
        allowedStatuses: ["READY", "FAILED"],
        data: {
          status: "SENDING",
          submittedPayloadJson: payload as unknown as Prisma.InputJsonValue,
          submittedPayloadFingerprint: fingerprint,
        },
      });

      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection);
      } catch (authError) {
        await this.repository.updateDeclaration({
          id: sendingDecl.id,
          hotelId,
          expectedVersion: sendingDecl.version,
          allowedStatuses: ["SENDING"],
          data: {
            status: "FAILED",
            providerCode: "KBTT_AUTH_FAILED",
            providerMessage: sanitizeProviderText(KBTT_AUTH_FAILED_MESSAGE),
          },
        });
        throw authError;
      }

      const submitResult = await this.provider.submitDeclaration(
        decl.declarationKind,
        payload,
        session.AccessToken,
      );

      if (submitResult.outcome === "SUCCESS") {
        const updated = await this.repository.updateDeclaration({
          id: sendingDecl.id,
          hotelId,
          expectedVersion: sendingDecl.version,
          allowedStatuses: ["SENDING"],
          data: {
            status: "SUBMITTED",
            providerCode: "200",
            providerMessage: sanitizeProviderText(submitResult.message || "Thành công"),
            submittedAt: new Date(),
            providerResponseJson: submitResult.data
              ? (sanitizeProviderData(submitResult.data) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        return this.viewDeclaration(updated);
      }

      if (submitResult.outcome === "BUSINESS_REJECTION") {
        const code = submitResult.code.slice(0, 32);
        const message = sanitizeProviderText(
          submitResult.message || "Bị từ chối bởi cơ quan quản lý",
        );
        await this.repository.updateDeclaration({
          id: sendingDecl.id,
          hotelId,
          expectedVersion: sendingDecl.version,
          allowedStatuses: ["SENDING"],
          data: {
            status: "FAILED",
            providerCode: code,
            providerMessage: message,
            submittedAt: null,
            providerResponseJson: submitResult.data
              ? (sanitizeProviderData(submitResult.data) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        throw new HttpException({ code, message }, 422);
      }

      // AMBIGUOUS outcome (timeout or network error)
      const code = submitResult.code.slice(0, 32);
      const message = sanitizeProviderText(
        submitResult.message || "Không xác định được kết quả gửi từ cơ quan quản lý",
      );
      await this.repository.updateDeclaration({
        id: sendingDecl.id,
        hotelId,
        expectedVersion: sendingDecl.version,
        allowedStatuses: ["SENDING"],
        data: {
          status: "UNKNOWN",
          providerCode: code,
          providerMessage: message,
          submittedAt: null,
          providerResponseJson: submitResult.data
            ? (sanitizeProviderData(submitResult.data) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      throw new HttpException({ code, message }, 409);
    });
  }

  async submitStay(userId: string, roleId: string, hotelId: string, stayId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const occupants = (
        (await this.occupantsReadService?.getActiveStayOccupants(hotelId)) ?? []
      ).filter((occupant) => occupant.stayId === stayId);
      if (occupants.length === 0) {
        throw new NotFoundException("Không tìm thấy danh sách khách đang check-in trong phòng.");
      }

      const declarations = await this.repository.findDeclarationsByHotel(
        hotelId,
        occupants.map((occupant) => occupant.id),
      );
      const latestByOccupant = new Map<string, KbttGuestDeclaration>();
      for (const declaration of declarations) {
        if (!latestByOccupant.has(declaration.occupantId)) {
          latestByOccupant.set(declaration.occupantId, declaration);
        }
      }

      const invalid = occupants.filter((occupant) => {
        const status = latestByOccupant.get(occupant.id)?.status;
        return !status || !["READY", "FAILED", "SUBMITTED"].includes(status);
      });
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: "DECLARATION_BATCH_NOT_READY",
          message: `Còn ${invalid.length} khách chưa sẵn sàng gửi. Vui lòng hoàn thiện toàn bộ hồ sơ trong phòng.`,
        });
      }

      const targets = occupants.flatMap((occupant) => {
        const declaration = latestByOccupant.get(occupant.id)!;
        if (declaration.status === "SUBMITTED") return [];

        let payload: unknown[];
        if (declaration.status === "FAILED") {
          if (
            !Array.isArray(declaration.submittedPayloadJson) ||
            declaration.submittedPayloadJson.length !== 1
          ) {
            throw new BadRequestException("Hồ sơ lỗi không có snapshot an toàn để gửi lại.");
          }
          payload = declaration.submittedPayloadJson;
        } else {
          const draft = (declaration.draftPayloadJson ?? {}) as Record<string, unknown>;
          const parsed =
            declaration.declarationKind === "VIETNAMESE"
              ? kbttVietnameseReadySchema.safeParse(draft)
              : kbttForeignReadySchema.safeParse(draft);
          if (!parsed.success) {
            throw new BadRequestException({
              code: "DECLARATION_BATCH_NOT_READY",
              message: `Hồ sơ của ${occupant.fullName} chưa đủ điều kiện gửi.`,
            });
          }
          payload = [parsed.data];
        }

        const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        if (
          declaration.status === "FAILED" &&
          declaration.submittedPayloadFingerprint !== fingerprint
        ) {
          throw new BadRequestException("Snapshot gửi lại không khớp dấu vân tay đã lưu.");
        }
        return [{ occupant, declaration, payload, fingerprint }];
      });

      if (targets.length === 0) {
        return {
          stayId,
          roomId: occupants[0].roomId,
          roomNumber: occupants[0].roomNumber,
          totalGuests: occupants.length,
          submittedCount: 0,
          alreadySubmittedCount: occupants.length,
          declarations: occupants.map((occupant) =>
            this.viewDeclaration(latestByOccupant.get(occupant.id)!),
          ),
        };
      }

      const connection = await this.repository.find(hotelId);
      if (!connection) {
        throw new NotFoundException({
          code: "KBTT_NOT_CONFIGURED",
          message: "Khách sạn chưa cấu hình kết nối KBTT.",
        });
      }

      const sending = await this.repository.prepareStaySubmissionBatch({
        hotelId,
        stayId,
        expectedOccupantIds: occupants.map((occupant) => occupant.id),
        declarations: targets.map((target) => ({
          id: target.declaration.id,
          expectedVersion: target.declaration.version,
          allowedStatuses: ["READY", "FAILED"],
          submittedPayloadJson: target.payload as Prisma.InputJsonValue,
          submittedPayloadFingerprint: target.fingerprint,
        })),
      });
      const sendingById = new Map(sending.map((declaration) => [declaration.id, declaration]));

      let session: KbttSession;
      try {
        session = await this.getOrRefreshSession(hotelId, connection);
      } catch (error) {
        await this.repository.finalizeSubmissionBatch({
          hotelId,
          declarations: sending.map((declaration) => ({
            id: declaration.id,
            expectedVersion: declaration.version,
          })),
          data: {
            status: "FAILED",
            providerCode: "KBTT_AUTH_FAILED",
            providerMessage: sanitizeProviderText(KBTT_AUTH_FAILED_MESSAGE),
          },
        });
        throw error;
      }

      let hasFailure = false;
      let hasUnknown = false;
      for (const kind of ["VIETNAMESE", "FOREIGN"] as const) {
        const group = targets.filter((target) => target.declaration.declarationKind === kind);
        if (group.length === 0) continue;
        const result = await this.provider.submitDeclaration(
          kind,
          group.flatMap((target) => target.payload),
          session.AccessToken,
        );
        const groupSending = group.map((target) => sendingById.get(target.declaration.id)!);
        const common = {
          providerCode: result.code.slice(0, 32),
          providerMessage: sanitizeProviderText(result.message || "Không có thông báo"),
          providerResponseJson: result.data
            ? (sanitizeProviderData(result.data) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        };
        if (result.outcome === "SUCCESS") {
          await this.repository.finalizeSubmissionBatch({
            hotelId,
            declarations: groupSending.map((declaration) => ({
              id: declaration.id,
              expectedVersion: declaration.version,
            })),
            data: { ...common, status: "SUBMITTED", submittedAt: new Date() },
          });
        } else if (result.outcome === "BUSINESS_REJECTION") {
          hasFailure = true;
          await this.repository.finalizeSubmissionBatch({
            hotelId,
            declarations: groupSending.map((declaration) => ({
              id: declaration.id,
              expectedVersion: declaration.version,
            })),
            data: { ...common, status: "FAILED", submittedAt: null },
          });
        } else {
          hasUnknown = true;
          await this.repository.finalizeSubmissionBatch({
            hotelId,
            declarations: groupSending.map((declaration) => ({
              id: declaration.id,
              expectedVersion: declaration.version,
            })),
            data: { ...common, status: "UNKNOWN", submittedAt: null },
          });
        }
      }

      if (hasUnknown || hasFailure) {
        throw new HttpException(
          {
            code: hasUnknown ? "DECLARATION_BATCH_UNKNOWN" : "DECLARATION_BATCH_REJECTED",
            message: hasUnknown
              ? "Có nhóm hồ sơ chưa xác định được kết quả. Không tự gửi lại."
              : "Có nhóm hồ sơ bị cơ quan quản lý từ chối.",
          },
          hasUnknown ? 409 : 422,
        );
      }

      const completed = await this.repository.findDeclarationsByHotel(
        hotelId,
        occupants.map((occupant) => occupant.id),
      );
      const completedLatest = new Map<string, KbttGuestDeclaration>();
      for (const declaration of completed) {
        if (!completedLatest.has(declaration.occupantId)) {
          completedLatest.set(declaration.occupantId, declaration);
        }
      }
      return {
        stayId,
        roomId: occupants[0].roomId,
        roomNumber: occupants[0].roomNumber,
        totalGuests: occupants.length,
        submittedCount: targets.length,
        alreadySubmittedCount: occupants.length - targets.length,
        declarations: occupants.map((occupant) =>
          this.viewDeclaration(completedLatest.get(occupant.id)!),
        ),
      };
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
      status: decl.status,
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
