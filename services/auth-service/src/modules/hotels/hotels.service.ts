import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CategoryPriceUpdateMode,
  GuestRequestPriority,
  GuestRequestStatus,
  GuestStayStatus,
  HotelStatus,
  Prisma,
  RoomQRCodeStatus,
  RoomStatus,
  ServiceCatalogStatus,
} from "@prisma/client";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../common/security/token-hash.util";
import { AppLogger } from "../../common/logging/app-logger.service";
import { RequestRealtimeEmitter } from "../../request-realtime.emitter";
import { CodesService } from "../codes/codes.service";
import { HotelAccessService } from "./hotel-access.service";
import {
  HotelsRepository,
  type HotelDetailRow,
  type RoomListRow,
  type ServiceItemRow,
  type StaffRequestListRow,
} from "./hotels.repository";
import type {
  CheckOutBodyInput,
  CreateRequestEventBodyInput,
  CreateHotelBodyInput,
  CreateRoomBodyInput,
  CreateRoomsBodyInput,
  CreateServiceCategoryBodyInput,
  CreateServiceItemBodyInput,
  CreateStayBodyInput,
  ListHotelsQueryInput,
  ListRoomsQueryInput,
  ListServiceCategoriesQueryInput,
  ListServiceItemsQueryInput,
  ListStaffRequestsQueryInput,
  QrReasonBodyInput,
  RequestSummaryQueryInput,
  UpdateHotelBodyInput,
  UpdateRequestAssignmentBodyInput,
  UpdateRequestStatusBodyInput,
  UpdateRoomBodyInput,
  UpdateServiceCategoryBodyInput,
  UpdateServiceItemBodyInput,
} from "./schemas/hotels.schema";

export interface StaffRequestListItemResponse {
  id: string;
  displayName: string;
  status: GuestRequestStatus;
  priority: "NORMAL" | "URGENT";
  quantity: number;
  description: string | null;
  latestNote: string | null;
  createdAt: string;
  roomNumber: string;
  guestName: string | null;
  categoryName: string | null;
  assignedToName: string | null;
  stayStatus: string | null;
  checkedOutAt: string | null;
  actions: StaffRequestAction[];
}

type StaffRequestAction = "ACCEPT" | "START" | "COMPLETE" | "CANCEL" | "FAIL";

type RequestStatusSummary = Record<GuestRequestStatus, number>;

export interface RequestSummaryResponse {
  total: number;
  statuses: RequestStatusSummary;
}

const activeRequestStatuses = [
  GuestRequestStatus.CREATED,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.IN_PROGRESS,
];

const completedRequestStatuses = [
  GuestRequestStatus.COMPLETED,
  GuestRequestStatus.CANCELLED,
  GuestRequestStatus.FAILED,
];

const activeStayRequestFilter = {
  stay: {
    is: {
      status: { in: [GuestStayStatus.CHECKED_IN, GuestStayStatus.ACTIVE] },
      checkedOutAt: null,
    },
  },
} satisfies Prisma.GuestRequestWhereInput;

@Injectable()
export class HotelsService {
  constructor(
    private readonly hotelsRepository: HotelsRepository,
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

    const hotel = await this.hotelsRepository.createHotel({
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

    const [total, rows] = await this.hotelsRepository.listHotels(where, (page - 1) * limit, limit);
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
      const hotel = await this.hotelsRepository.updateHotelScoped(
        hotelId,
        Array.from(actor.tenantIds),
        data,
      );
      if (!hotel) {
        throw new NotFoundException("Không tìm thấy khách sạn");
      }

      return this.toHotelData(hotel);
    }

    const hotel = await this.hotelsRepository.updateHotel(hotelId, data);

    this.logBusinessEvent("Hotel updated", "HOTEL_UPDATED", "updateHotel", {
      actorUserId,
      hotelId,
      changedFields: Object.keys(data).filter(
        (key) => data[key as keyof typeof data] !== undefined,
      ),
    });
    return this.toHotelData(hotel);
  }

  async createRoom(actorUserId: string, hotelId: string, dto: CreateRoomBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    return this.createRoomRecord(hotelId, dto);
  }

  async createRooms(actorUserId: string, hotelId: string, dto: CreateRoomsBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const items: Array<Awaited<ReturnType<typeof this.createRoomRecord>>> = [];

    for (const item of dto.items) {
      items.push(await this.createRoomRecord(hotelId, item));
    }

    return { total: items.length, items };
  }

  private async createRoomRecord(hotelId: string, dto: CreateRoomBodyInput) {
    const roomCode = await this.codesService.generateEntityCode("ROOM");
    const publicCode = this.generateQrCode();
    const room = await this.hotelsRepository.createRoomWithQr({
      hotelId,
      code: roomCode,
      roomNumber: dto.roomNumber.trim(),
      floor: dto.floor?.trim(),
      type: dto.type?.trim(),
      price: dto.price,
      maxActiveGuestDevices: dto.maxActiveGuestDevices,
      publicCode,
    });

    this.logBusinessEvent("Room created with initial QR code", "ROOM_CREATED", "createRoomRecord", {
      hotelId,
      roomId: room.id,
      roomNumber: room.roomNumber,
      qrCodeId: room.qrCodes[0]?.id,
    });
    return this.toRoomData(room);
  }

  async listRooms(actorUserId: string, hotelId: string, query: ListRoomsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.RoomWhereInput = {
      hotelId,
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.roomNumber = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelsRepository.listRooms(where, (page - 1) * limit, limit);
    return { page, limit, total, items: rows.map((row) => this.toRoomData(row)) };
  }

  async updateRoom(actorUserId: string, hotelId: string, roomId: string, dto: UpdateRoomBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const room = await this.hotelsRepository.updateRoomInHotel(hotelId, roomId, {
      roomNumber: dto.roomNumber?.trim(),
      floor: dto.floor === null ? null : dto.floor?.trim(),
      type: dto.type === null ? null : dto.type?.trim(),
      price: dto.price,
      maxActiveGuestDevices: dto.maxActiveGuestDevices,
      status: dto.status,
    } satisfies Prisma.RoomUpdateInput);

    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    this.logBusinessEvent("Room updated", "ROOM_UPDATED", "updateRoom", {
      actorUserId,
      hotelId,
      roomId,
      status: room.status,
    });
    return this.toRoomData(room);
  }

  async listServiceCategories(
    actorUserId: string,
    hotelId: string,
    query: ListServiceCategoriesQueryInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelServiceCategoryWhereInput = {
      hotelId,
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelsRepository.listServiceCategories(
      where,
      (page - 1) * limit,
      limit,
    );

    return { page, limit, total, items: rows.map((row) => this.toServiceCategoryData(row)) };
  }

  async createServiceCategory(
    actorUserId: string,
    hotelId: string,
    dto: CreateServiceCategoryBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const category = await this.hotelsRepository.createServiceCategory({
      hotelId,
      tenantId: hotel.tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      defaultPrice: dto.defaultPrice,
      currency: dto.currency?.trim().toUpperCase(),
      sortOrder: dto.sortOrder,
      status: dto.status,
      translations: dto.translations,
    });

    return this.toServiceCategoryData(category);
  }

  async updateServiceCategory(
    actorUserId: string,
    hotelId: string,
    categoryId: string,
    dto: UpdateServiceCategoryBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceCategoryInHotel(hotelId, categoryId);

    const priceUpdateMode = dto.priceUpdateMode ?? CategoryPriceUpdateMode.CATEGORY_ONLY;

    const category = await this.hotelsRepository.updateServiceCategory({
      hotelId,
      tenantId: hotel.tenantId,
      categoryId,
      data: {
        name: dto.name?.trim(),
        description: dto.description === null ? null : dto.description?.trim(),
          defaultPrice: dto.defaultPrice,
        currency: dto.currency?.trim().toUpperCase(),
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
      translations: dto.translations,
      overrideAllItems: priceUpdateMode === CategoryPriceUpdateMode.OVERRIDE_ALL_ITEMS,
      overridePrice: dto.defaultPrice,
    });

    return this.toServiceCategoryData(category);
  }

  async listServiceItems(actorUserId: string, hotelId: string, query: ListServiceItemsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelServiceItemWhereInput = {
      hotelId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelsRepository.listServiceItems(
      where,
      (page - 1) * limit,
      limit,
    );

    return { page, limit, total, items: rows.map((row) => this.toServiceItemData(row)) };
  }

  async createServiceItem(actorUserId: string, hotelId: string, dto: CreateServiceItemBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceCategoryInHotel(hotelId, dto.categoryId);

    const item = await this.hotelsRepository.createServiceItem({
      hotelId,
      tenantId: hotel.tenantId,
      categoryId: dto.categoryId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      priceOverride: dto.priceOverride,
      quantityEnabled: dto.quantityEnabled,
      minQuantity: dto.minQuantity,
      maxQuantity: dto.maxQuantity,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      sortOrder: dto.sortOrder,
      status: dto.status,
      translations: dto.translations,
    });

    return this.toServiceItemData(item);
  }

  async updateServiceItem(
    actorUserId: string,
    hotelId: string,
    itemId: string,
    dto: UpdateServiceItemBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceItemInHotel(hotelId, itemId);

    if (dto.categoryId) {
      await this.assertServiceCategoryInHotel(hotelId, dto.categoryId);
    }

    const item = await this.hotelsRepository.updateServiceItem({
      hotelId,
      tenantId: hotel.tenantId,
      itemId,
      data: {
        categoryId: dto.categoryId,
        name: dto.name?.trim(),
        description: dto.description === null ? null : dto.description?.trim(),
        priceOverride: dto.priceOverride,
        quantityEnabled: dto.quantityEnabled,
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity,
        metadata:
          dto.metadata === null
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue | undefined),
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
      translations: dto.translations,
    });

    return this.toServiceItemData(item);
  }

  async createStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const room = await this.hotelsRepository.findRoomInHotel(hotelId, dto.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.AVAILABLE && room.status !== RoomStatus.PROCESSING) {
      throw new BadRequestException("Phòng không khả dụng để đặt giữ chỗ");
    }

    const stay = await this.hotelsRepository.createStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      tenantId: hotel.tenantId,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return this.toStayData(stay);
  }

  async checkInStay(actorUserId: string, hotelId: string, stayId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const stay = await this.hotelsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }

    if (stay.status !== GuestStayStatus.RESERVED && stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-in lượt lưu trú từ trạng thái hiện tại");
    }

    const room = await this.hotelsRepository.findRoomInHotel(hotelId, stay.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.PROCESSING && room.status !== RoomStatus.AVAILABLE) {
      throw new ConflictException("Phòng chưa sẵn sàng để check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelsRepository.checkInStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async createAndCheckInStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    if (!dto.guestDisplayName?.trim()) {
      throw new BadRequestException("Tên khách là bắt buộc để check-in");
    }

    if (dto.plannedCheckOutAt <= dto.plannedCheckInAt) {
      throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelsRepository.createAndCheckInStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async checkOutStay(actorUserId: string, hotelId: string, stayId: string, dto: CheckOutBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const stay = await this.hotelsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }

    if (stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-out lượt lưu trú từ trạng thái hiện tại");
    }

    const blockingFolio = await this.hotelsRepository.findBlockingBillingFolio(hotelId, stayId);
    if (blockingFolio) {
      throw new ConflictException("Please complete billing checkout before closing the stay.");
    }

    const checkedOut = await this.hotelsRepository.checkOutStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      tenantId: hotel.tenantId,
      nextRoomStatus: dto.nextRoomStatus ?? RoomStatus.AVAILABLE,
    });

    return this.toStayData(checkedOut);
  }

  async rotateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);

    const publicCode = this.generateQrCode();
    const qr = await this.hotelsRepository.rotateQr({
      hotelId,
      roomId,
      publicCode,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return this.toQrData(qr);
  }

  async activateQr(actorUserId: string, hotelId: string, roomId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);
    const qr = await this.hotelsRepository.activateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      publicCode: this.generateQrCode(),
    });
    return this.toQrData(qr);
  }

  async deactivateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);
    const result = await this.hotelsRepository.deactivateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return { deactivated: result.count };
  }

  async listRequests(actorUserId: string, hotelId: string, query: ListStaffRequestsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...(query.roomNumber ? { room: { is: { roomNumber: query.roomNumber } } } : {}),
      ...(query.serviceItemId ? { serviceItemId: query.serviceItemId } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(query.status ? { status: query.status } : { status: { in: activeRequestStatuses } }),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
    };

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [total, rows] = await this.hotelsRepository.listRequests(
      where,
      (page - 1) * limit,
      limit,
    );
    const completedSummary = await this.hotelsRepository.summarizeRequests({
      ...where,
      status: { in: completedRequestStatuses },
    });
    const items = rows.map((row) => this.toStaffRequestListItem(row));

    return {
      page,
      limit,
      total,
      items,
      groups: {
        active: { total, items },
        completed: { total: completedSummary.total, items: [] },
      },
    };
  }

  async getRequestsSummary(
    actorUserId: string,
    hotelId: string,
    query: RequestSummaryQueryInput,
  ): Promise<RequestSummaryResponse> {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...(query.roomNumber ? { room: { is: { roomNumber: query.roomNumber } } } : {}),
      ...(query.serviceItemId ? { serviceItemId: query.serviceItemId } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
    };

    const summary = await this.hotelsRepository.summarizeRequests(where);

    return {
      total: summary.total,
      statuses: this.toRequestStatusSummary(summary.statuses),
    };
  }

  async getRequestDetail(actorUserId: string, hotelId: string, requestId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const request = await this.hotelsRepository.findRequestDetailInHotel(hotelId, requestId);
    if (!request) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    return this.withProductRequestPriority(request);
  }

  async updateRequestStatus(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestStatusBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    this.assertRequestTransition(existing.status, dto.status);

    const updated = await this.hotelsRepository.updateRequestStatus({
      hotelId,
      requestId,
      actorUserId,
      status: dto.status,
      note: dto.note?.trim(),
      assignedToUserId: dto.assignedToUserId,
      priority: dto.priority,
      tenantId: hotel.tenantId,
    });

    RequestRealtimeEmitter.emitGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: Boolean(dto.note?.trim()),
    });

    return this.withProductRequestPriority(updated);
  }

  async updateRequestAssignment(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestAssignmentBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const assignedToUserId = dto.assignedToUserId ?? null;
    if (assignedToUserId) {
      const assignee = await this.hotelsRepository.findAssignableStaffInTenant(
        assignedToUserId,
        hotel.tenantId,
      );
      if (!assignee) {
        throw new BadRequestException("Người dùng được phân công không khả dụng cho khách sạn này");
      }
    }

    const updated = await this.hotelsRepository.updateRequestAssignment({
      hotelId,
      requestId,
      actorUserId,
      assignedToUserId,
      note: dto.note?.trim(),
      tenantId: hotel.tenantId,
    });

    RequestRealtimeEmitter.emitGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: Boolean(dto.note?.trim()),
    });

    return this.withProductRequestPriority(updated);
  }

  async createRequestEvent(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: CreateRequestEventBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const event = await this.hotelsRepository.createRequestEvent({
      hotelId,
      requestId,
      actorUserId,
      note: dto.note.trim(),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      tenantId: hotel.tenantId,
    });

    const updated = await this.hotelsRepository.findRequestDetailInHotel(hotelId, requestId);
    if (!updated) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    RequestRealtimeEmitter.emitGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: true,
    });

    return event;
  }

  private async assertRoomInHotel(hotelId: string, roomId: string) {
    const room = await this.hotelsRepository.findRoomInHotel(hotelId, roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    return room;
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

  private async assertServiceCategoryInHotel(hotelId: string, categoryId: string) {
    const category = await this.hotelsRepository.findServiceCategoryInHotel(hotelId, categoryId);
    if (!category) {
      throw new NotFoundException("Không tìm thấy danh mục dịch vụ");
    }

    return category;
  }

  private async assertServiceItemInHotel(hotelId: string, itemId: string) {
    const item = await this.hotelsRepository.findServiceItemInHotel(hotelId, itemId);
    if (!item) {
      throw new NotFoundException("Không tìm thấy dịch vụ");
    }

    return item;
  }

  private assertRequestTransition(from: GuestRequestStatus, to: GuestRequestStatus) {
    const allowed: Record<GuestRequestStatus, GuestRequestStatus[]> = {
      NEW: [GuestRequestStatus.CONFIRMED, GuestRequestStatus.CANCELLED],
      CONFIRMED: [GuestRequestStatus.IN_PROGRESS, GuestRequestStatus.CANCELLED],
      PENDING: [GuestRequestStatus.ACCEPTED, GuestRequestStatus.REJECTED],
      ACCEPTED: [GuestRequestStatus.ON_THE_WAY],
      ON_THE_WAY: [GuestRequestStatus.IN_PROGRESS],
      CREATED: [GuestRequestStatus.ACKNOWLEDGED, GuestRequestStatus.CANCELLED],
      ACKNOWLEDGED: [GuestRequestStatus.IN_PROGRESS, GuestRequestStatus.CANCELLED],
      IN_PROGRESS: [GuestRequestStatus.COMPLETED, GuestRequestStatus.FAILED],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      FAILED: [],
    };

    if (from === to) {
      return;
    }

    if (!allowed[from].includes(to)) {
      throw new BadRequestException(`Yêu cầu không thể chuyển từ ${from} sang ${to}`);
    }
  }

  private toStaffRequestListItem(row: StaffRequestListRow): StaffRequestListItemResponse {
    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: row.status,
      priority: this.toStaffRequestListPriority(row.priority),
      quantity: row.quantity,
      description: row.description,
      latestNote: row.events?.[0]?.note ?? null,
      createdAt: row.createdAt.toISOString(),
      roomNumber: row.room.roomNumber,
      guestName: row.stay.guestDisplayName,
      categoryName: row.serviceItem?.category.name ?? null,
      assignedToName: row.assignedTo?.fullName ?? row.assignedTo?.email ?? null,
      stayStatus: row.stay.status ?? null,
      checkedOutAt: row.stay.checkedOutAt?.toISOString() ?? null,
      actions: this.getStaffRequestActions(row.status),
    };
  }

  private getStaffRequestActions(status: GuestRequestStatus): StaffRequestAction[] {
    switch (status) {
      case GuestRequestStatus.NEW:
      case GuestRequestStatus.PENDING:
      case GuestRequestStatus.CREATED:
        return ["ACCEPT", "CANCEL"];
      case GuestRequestStatus.CONFIRMED:
      case GuestRequestStatus.ACCEPTED:
      case GuestRequestStatus.ACKNOWLEDGED:
        return ["START", "CANCEL"];
      case GuestRequestStatus.ON_THE_WAY:
      case GuestRequestStatus.IN_PROGRESS:
        return ["COMPLETE", "FAIL"];
      case GuestRequestStatus.COMPLETED:
      case GuestRequestStatus.REJECTED:
      case GuestRequestStatus.CANCELLED:
      case GuestRequestStatus.FAILED:
        return [];
    }
  }

  private toStaffRequestListPriority(
    priority: StaffRequestListRow["priority"],
  ): "NORMAL" | "URGENT" {
    return String(priority) === "URGENT" || String(priority) === "HIGH" ? "URGENT" : "NORMAL";
  }

  private withProductRequestPriority<T extends { priority: unknown }>(
    request: T,
  ): Omit<T, "priority"> & { priority: "NORMAL" | "URGENT" } {
    return {
      ...request,
      priority: this.toStaffRequestListPriority(
        request.priority as StaffRequestListRow["priority"],
      ),
    };
  }

  private toInternalRequestPriorities(priority: "NORMAL" | "URGENT"): GuestRequestPriority[] {
    switch (priority) {
      case "NORMAL":
        return [GuestRequestPriority.NORMAL];
      case "URGENT":
        return [GuestRequestPriority.URGENT];
    }
  }

  private toRequestStatusSummary(
    rows: Array<{ status: GuestRequestStatus; _count: { _all: number } }>,
  ): RequestStatusSummary {
    const statuses = Object.fromEntries(
      Object.values(GuestRequestStatus).map((status) => [status, 0]),
    ) as RequestStatusSummary;

    for (const row of rows) {
      statuses[row.status] = row._count._all;
    }

    return statuses;
  }

  private toGuestRequestRealtimeItem(row: StaffRequestListRow) {
    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: this.toGuestPortalRequestStatus(row.status),
      quantity: row.quantity,
      description: row.description,
      answer: row.events[0]?.note ?? null,
      createdAt: row.createdAt.toISOString(),
      canCancel: row.status === GuestRequestStatus.CREATED,
    };
  }

  private toGuestPortalRequestStatus(status: GuestRequestStatus) {
    switch (status) {
      case GuestRequestStatus.COMPLETED:
        return "COMPLETED";
      case GuestRequestStatus.CANCELLED:
        return "CANCELLED";
      case GuestRequestStatus.FAILED:
        return "FAILED";
      case GuestRequestStatus.CREATED:
      case GuestRequestStatus.ACKNOWLEDGED:
      case GuestRequestStatus.IN_PROGRESS:
        return "PENDING";
    }
  }

  private generateQrCode(): string {
    return generateOpaqueToken(24);
  }

  private generateAccessCode(): string {
    return generateOpaqueToken(9).slice(0, 12).toUpperCase();
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

  private toRoomData(row: RoomListRow) {
    const latestQr = row.qrCodes[0] ?? null;
    const activeStay = row.guestStays[0] ?? null;

    return {
      id: row.id,
      hotelId: row.hotelId,
      code: row.code,
      roomNumber: row.roomNumber,
      floor: row.floor,
      type: row.type,
      price: row.price,
      maxActiveGuestDevices: row.maxActiveGuestDevices ?? 3,
      activeGuestDeviceCount: row.activeGuestDeviceCount,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      qr: latestQr ? this.toQrData(latestQr) : null,
      activeStay: activeStay ? this.toStayData(activeStay) : null,
    };
  }

  private toServiceCategoryData(row: {
    id: string;
    hotelId: string;
    name: string;
    description: string | null;
    defaultPrice: Prisma.Decimal;
    currency: string;
    sortOrder: number;
    status: ServiceCatalogStatus;
    createdAt: Date;
    updatedAt: Date;
    translations?: Array<{ locale: string; name: string; description: string | null }>;
  }) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      name: row.name,
      description: row.description,
      defaultPrice: row.defaultPrice,
      currency: row.currency,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      translations: this.toTranslationsObject(row.translations),
    };
  }

  private toServiceItemData(row: ServiceItemRow) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      priceOverride: row.priceOverride,
      effectivePrice: row.priceOverride ?? row.category.defaultPrice,
      effectiveCurrency: row.category.currency,
      quantityEnabled: row.quantityEnabled,
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
      metadata: row.metadata,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      translations: this.toTranslationsObject(row.translations),
      category: {
        ...row.category,
        translations: this.toTranslationsObject(row.category.translations),
      },
    };
  }

  private toTranslationsObject(
    translations?: Array<{ locale: string; name: string; description: string | null }>,
  ) {
    return Object.fromEntries(
      (translations ?? []).map((translation) => [
        translation.locale,
        { name: translation.name, description: translation.description },
      ]),
    );
  }

  private toStayData(row: {
    id: string;
    hotelId: string;
    roomId: string;
    reservationCode: string;
    guestDisplayName: string;
    guestPhone?: string | null;
    guestPhoneMasked?: string | null;
    status: GuestStayStatus;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    checkedInAt: Date | null;
    activatedAt: Date | null;
    checkedOutAt: Date | null;
    accessCodeExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      reservationCode: row.reservationCode,
      guestDisplayName: row.guestDisplayName,
      guestPhone: row.guestPhone ?? row.guestPhoneMasked ?? null,
      status: row.status,
      plannedCheckInAt: row.plannedCheckInAt,
      plannedCheckOutAt: row.plannedCheckOutAt,
      checkedInAt: row.checkedInAt,
      activatedAt: row.activatedAt,
      checkedOutAt: row.checkedOutAt,
      accessCodeExpiresAt: row.accessCodeExpiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toQrData(row: {
    id: string;
    hotelId: string;
    roomId: string;
    publicCode: string;
    status: RoomQRCodeStatus;
    version: number;
    activatedAt: Date | null;
    deactivatedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      publicCode: row.publicCode,
      status: row.status,
      version: row.version,
      activatedAt: row.activatedAt,
      deactivatedAt: row.deactivatedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
