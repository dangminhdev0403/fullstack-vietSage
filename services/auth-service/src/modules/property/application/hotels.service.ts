import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HotelStatus, Prisma } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { CodesService } from "../../codes/codes-public";
import { HotelAccessService } from "./hotel-access.service";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import type { HotelDetailRow } from "../infrastructure/repositories/hotel-repository.types";
import type {
  CreateHotelBodyInput,
  ListHotelsQueryInput,
  UpdateHotelBodyInput,
} from "../domain/schemas/hotel.schema";
import { GoogleSheetsServiceCatalogSyncService } from "../infrastructure/imports/google-sheets-service-catalog-sync.service";

@Injectable()
export class HotelsService {
  constructor(
    private readonly hotelCoreRepository: HotelCoreRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly googleSheetsSyncService: GoogleSheetsServiceCatalogSyncService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}
  async createHotel(actorUserId: string, activeRoleId: string, dto: CreateHotelBodyInput) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId, activeRoleId);

    if (actor.isTenantOwner) {
      throw new ForbiddenException("TENANT_OWNER không thể tạo khách sạn");
    }

    const tenantId = await this.hotelAccessService.resolveTenantId(actor, dto.tenantId);
    await this.hotelAccessService.assertTenantExists(tenantId);
    const tenantHotel = await this.hotelCoreRepository.findHotelByTenantId(tenantId);
    if (tenantHotel) {
      throw new ConflictException(`Tenant đã có khách sạn ${tenantHotel.name}`);
    }

    if (dto.googleSheetUrl) {
      if (!actor.isSuperAdmin) {
        throw new ForbiddenException(
          "Chỉ quản trị viên nền tảng được cấu hình Google Sheets cho khách sạn",
        );
      }
      const existingHotel = await this.hotelCoreRepository.findHotelByGoogleSheetId(
        dto.googleSheetUrl,
      );
      if (existingHotel) {
        throw new ConflictException(
          `Google Sheets này đã được gán cho khách sạn ${existingHotel.name}`,
        );
      }
      await this.googleSheetsSyncService.validateSpreadsheet(dto.googleSheetUrl);
    }

    const hotelCode = await this.codesService.generateEntityCode("HOTEL");

    let hotel: HotelDetailRow;
    try {
      hotel = await this.hotelCoreRepository.createHotel({
        tenant: { connect: { id: tenantId } },
        name: dto.name.trim(),
        code: hotelCode,
        timezone: dto.timezone?.trim() || "Asia/Ho_Chi_Minh",
        brandSettings: dto.brandSettings as Prisma.InputJsonValue | undefined,
        googleSheetId: dto.googleSheetUrl,
        status: HotelStatus.ACTIVE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        String(error.meta?.target).includes("tenantId")
      ) {
        throw new ConflictException("Tenant đã có khách sạn");
      }
      throw error;
    }

    this.logBusinessEvent("Hotel created", "HOTEL_CREATED", "createHotel", {
      actorUserId,
      tenantId,
      hotelId: hotel.id,
      hotelCode: hotel.code,
    });
    return this.toHotelData(hotel);
  }

  async listHotels(actorUserId: string, activeRoleId: string, query: ListHotelsQueryInput) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId, activeRoleId);

    const canEnumerateAll = Boolean(actor.isSuperAdmin || actor.canEnumeratePlatformHotels);

    const tenantId = canEnumerateAll
      ? query.tenantId?.trim()
      : query.tenantId?.trim()
        ? await this.hotelAccessService.resolveTenantId(actor, query.tenantId)
        : actor.tenantIds.size === 1
          ? Array.from(actor.tenantIds)[0]
          : undefined;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelWhereInput = {
      ...(tenantId
        ? { tenantId }
        : canEnumerateAll
          ? {}
          : { tenantId: { in: Array.from(actor.tenantIds) } }),
      ...(!canEnumerateAll && actor.requiresHotelAssignment
        ? { id: { in: Array.from(actor.assignedHotelIds ?? []) } }
        : {}),
      status: HotelStatus.ACTIVE,
    };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await this.hotelCoreRepository.listHotels(
      where,
      (page - 1) * limit,
      limit,
    );
    return { page, limit, total, items: rows.map((row) => this.toHotelData(row)) };
  }

  async getHotel(actorUserId: string, activeRoleId: string, hotelId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    return this.toHotelData(hotel);
  }

  async updateHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: UpdateHotelBodyInput,
  ) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId, activeRoleId);
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    if (actor.isTenantOwner && dto.status !== undefined) {
      throw new ForbiddenException("TENANT_OWNER không thể thay đổi trạng thái khách sạn");
    }

    if (dto.googleSheetUrl !== undefined && !actor.isSuperAdmin) {
      throw new ForbiddenException(
        "Chỉ quản trị viên nền tảng được cấu hình Google Sheets cho khách sạn",
      );
    }

    if (dto.googleSheetUrl) {
      const existingHotel = await this.hotelCoreRepository.findHotelByGoogleSheetId(
        dto.googleSheetUrl,
      );
      if (existingHotel && existingHotel.id !== hotelId) {
        throw new ConflictException(
          `Google Sheets này đã được gán cho khách sạn ${existingHotel.name}`,
        );
      }
      await this.googleSheetsSyncService.validateSpreadsheet(dto.googleSheetUrl);
    }

    const data = {
      name: dto.name?.trim(),
      timezone: dto.timezone?.trim(),
      brandSettings:
        dto.brandSettings === null
          ? Prisma.JsonNull
          : (dto.brandSettings as Prisma.InputJsonValue | undefined),
      status: dto.status,
      googleSheetId: dto.googleSheetUrl === null ? null : dto.googleSheetUrl,
      googleMapsUrl: dto.googleMapsUrl,
      latitude: dto.latitude,
      longitude: dto.longitude,
      locationAccuracyMeters: dto.locationAccuracyMeters,
      locationSource: dto.locationSource,
      locationVerifiedAt:
        dto.latitude === undefined ? undefined : dto.latitude === null ? null : new Date(),
    } satisfies Prisma.HotelUpdateInput;

    if (actor.isTenantOwner) {
      const hotel = await this.hotelCoreRepository.updateHotelScoped(
        hotelId,
        Array.from(actor.tenantIds),
        data,
      );
      if (!hotel) {
        throw new NotFoundException("Không tìm thấy khách sạn");
      }

      return this.toHotelData(hotel);
    }

    const hotel = await this.hotelCoreRepository.updateHotel(hotelId, data);

    this.logBusinessEvent("Hotel updated", "HOTEL_UPDATED", "updateHotel", {
      actorUserId,
      hotelId,
      changedFields: Object.keys(data).filter(
        (key) => data[key as keyof typeof data] !== undefined,
      ),
    });
    return this.toHotelData(hotel);
  }

  async resetOperationalData(actorUserId: string, activeRoleId: string, hotelId: string) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId, activeRoleId);
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    if (!actor.isTenantOwner && !actor.isSuperAdmin) {
      throw new ForbiddenException(
        "Chỉ chủ khách sạn hoặc quản trị viên cấp cao mới có quyền thiết lập lại dữ liệu vận hành",
      );
    }

    const hotel = await this.hotelCoreRepository.findHotelById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Khách sạn không tồn tại");
    }

    const currentBrandSettings =
      hotel.brandSettings && typeof hotel.brandSettings === "object"
        ? (hotel.brandSettings as Record<string, unknown>)
        : {};

    const currentCount =
      typeof currentBrandSettings.operationalResetCount === "number"
        ? currentBrandSettings.operationalResetCount
        : 0;

    const MAX_RESETS = 2;
    if (!actor.isSuperAdmin && currentCount >= MAX_RESETS) {
      throw new ForbiddenException(
        `Khách sạn đã sử dụng hết số lần thiết lập lại dữ liệu vận hành (tối đa ${MAX_RESETS} lần).`,
      );
    }

    const result = await this.hotelCoreRepository.resetHotelOperationalData(hotelId);

    this.logBusinessEvent(
      "Đã thiết lập lại dữ liệu vận hành khách sạn",
      "HOTEL_OPERATIONAL_DATA_RESET",
      "resetOperationalData",
      {
        actorUserId,
        activeRoleId,
        hotelId,
        operationalResetCount: result.operationalResetCount,
        remainingResets: result.remainingResets,
      },
    );

    return {
      hotelId,
      operationalResetCount: result.operationalResetCount,
      remainingResets: actor.isSuperAdmin ? 999 : result.remainingResets,
      message: actor.isSuperAdmin
        ? "Thiết lập lại dữ liệu vận hành thành công (Đặc quyền Quản trị viên cấp cao)."
        : `Thiết lập lại dữ liệu vận hành thành công. Bạn còn ${result.remainingResets} lượt.`,
    };
  }

  private logBusinessEvent(
    message: string,
    event: string,
    operation: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.info(message, {
      module: "hotels",
      service: "HotelsService",
      operation,
      event,
      ...metadata,
    });
  }

  private toHotelData(row: HotelDetailRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      code: row.code,
      timezone: row.timezone,
      status: row.status,
      brandSettings: row.brandSettings,
      googleSheetId: row.googleSheetId,
      googleMapsUrl: row.googleMapsUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      locationAccuracyMeters: row.locationAccuracyMeters,
      locationSource: row.locationSource,
      locationVerifiedAt: row.locationVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tenant: row.tenant,
    };
  }
}
