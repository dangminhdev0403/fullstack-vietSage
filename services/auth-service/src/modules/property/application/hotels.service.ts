import { Injectable, NotFoundException } from "@nestjs/common";
import { HotelStatus, Prisma } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { CodesService } from "../../codes/codes.service";
import { HotelAccessService } from "./hotel-access.service";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import type { HotelDetailRow } from "../infrastructure/repositories/hotel-repository.types";
import type {
  CreateHotelBodyInput,
  ListHotelsQueryInput,
  UpdateHotelBodyInput,
} from "../domain/schemas/hotel.schema";

@Injectable()
export class HotelsService {
  constructor(
    private readonly hotelCoreRepository: HotelCoreRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}
  async createHotel(actorUserId: string, dto: CreateHotelBodyInput, tenantHeader?: string) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId);
    this.hotelAccessService.rejectTenantOwnerTenantHint(actor, dto.tenantId ?? tenantHeader);
    const tenantId = await this.hotelAccessService.resolveTenantId(actor, dto.tenantId);
    await this.hotelAccessService.assertTenantExists(tenantId);
    const hotelCode = await this.codesService.generateEntityCode("HOTEL");

    const hotel = await this.hotelCoreRepository.createHotel({
      tenant: { connect: { id: tenantId } },
      name: dto.name.trim(),
      code: hotelCode,
      timezone: dto.timezone?.trim() || "Asia/Saigon",
      brandSettings: dto.brandSettings as Prisma.InputJsonValue | undefined,
      status: HotelStatus.ACTIVE,
    });

    this.logBusinessEvent("Hotel created", "HOTEL_CREATED", "createHotel", {
      actorUserId,
      tenantId,
      hotelId: hotel.id,
      hotelCode: hotel.code,
    });
    return this.toHotelData(hotel);
  }

  async listHotels(actorUserId: string, query: ListHotelsQueryInput, tenantHeader?: string) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId);
    this.hotelAccessService.rejectTenantOwnerTenantHint(actor, query.tenantId ?? tenantHeader);
    const tenantId = actor.isTenantOwner
      ? undefined
      : actor.isSuperAdmin
        ? query.tenantId?.trim()
        : await this.hotelAccessService.resolveTenantId(actor, query.tenantId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelWhereInput = {
      ...(actor.isTenantOwner
        ? { tenantId: { in: Array.from(actor.tenantIds) } }
        : tenantId
          ? { tenantId }
          : actor.isSuperAdmin
            ? {}
            : { tenantId: { in: Array.from(actor.tenantIds) } }),
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

  async getHotel(actorUserId: string, hotelId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    return this.toHotelData(hotel);
  }

  async updateHotel(actorUserId: string, hotelId: string, dto: UpdateHotelBodyInput) {
    const actor = await this.hotelAccessService.loadActorContext(actorUserId);
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const data = {
      name: dto.name?.trim(),
      timezone: dto.timezone?.trim(),
      brandSettings:
        dto.brandSettings === null
          ? Prisma.JsonNull
          : (dto.brandSettings as Prisma.InputJsonValue | undefined),
      status: dto.status,
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tenant: row.tenant,
    };
  }
}
