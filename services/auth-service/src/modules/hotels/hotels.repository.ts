import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  DomainEventStatus,
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  GuestRequestActorType,
  GuestRequestPriority,
  GuestRequestStatus,
  GuestSessionStatus,
  GuestStayStatus,
  Prisma,
  RoleStatus,
  RoomQRCodeStatus,
  RoomStatus,
  ServiceCatalogStatus,
  TenantUserStatus,
  UserRoleStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { mapPrismaRecordNotFound } from "../../common/prisma/prisma-record-not-found.util";

export const hotelDetailInclude = {
  tenant: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.HotelInclude;

export const roomListInclude = {
  qrCodes: {
    orderBy: {
      version: "desc",
    },
    take: 1,
  },
  guestStays: {
    where: {
      status: {
        in: [GuestStayStatus.ACTIVE],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} satisfies Prisma.RoomInclude;

export type HotelDetailRow = Prisma.HotelGetPayload<{ include: typeof hotelDetailInclude }>;
export type RoomListRow = Prisma.RoomGetPayload<{ include: typeof roomListInclude }> & {
  activeGuestDeviceCount: number;
};

export const serviceItemInclude = {
  translations: true,
  category: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      defaultPrice: true,
      currency: true,
      translations: true,
    },
  },
} satisfies Prisma.HotelServiceItemInclude;

type ServiceCatalogTranslationInput = Record<
  string,
  { name: string; description?: string | null } | undefined
>;

export type ServiceItemRow = Prisma.HotelServiceItemGetPayload<{
  include: typeof serviceItemInclude;
}>;

export const requestListInclude = {
  room: { select: { id: true, roomNumber: true } },
  stay: {
    select: {
      id: true,
      reservationCode: true,
      guestDisplayName: true,
      status: true,
      checkedOutAt: true,
    },
  },
  assignedTo: { select: { id: true, fullName: true, email: true } },
  serviceItem: {
    select: {
      id: true,
      hotelId: true,
      categoryId: true,
      name: true,
      description: true,
      priceOverride: true,
      quantityEnabled: true,
      minQuantity: true,
      maxQuantity: true,
      metadata: true,
      sortOrder: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      translations: true,
      category: {
        select: {
          id: true,
          hotelId: true,
          name: true,
          description: true,
          defaultPrice: true,
          currency: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          translations: true,
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.GuestRequestInclude;

export type StaffRequestListRow = Prisma.GuestRequestGetPayload<{
  include: typeof requestListInclude;
}>;

export const requestDetailInclude = {
  ...requestListInclude,
  events: {
    orderBy: { createdAt: "asc" },
    include: { actorUser: { select: { id: true, fullName: true, email: true } } },
  },
  session: {
    select: { id: true, status: true, createdAt: true, lastSeenAt: true, closedAt: true },
  },
} satisfies Prisma.GuestRequestInclude;

@Injectable()
export class HotelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActorById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE,
            role: { status: RoleStatus.ACTIVE },
          },
          select: {
            role: {
              select: { code: true },
            },
          },
        },
        tenantUsers: {
          where: { status: TenantUserStatus.ACTIVE },
          select: { tenantId: true },
        },
      },
    });
  }

  async findTenantById(tenantId: string) {
    return this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  }

  async createHotel(data: Prisma.HotelCreateInput) {
    return this.prisma.hotel.create({ data, include: hotelDetailInclude });
  }

  async listHotels(where: Prisma.HotelWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotel.count({ where });
      const rows = await tx.hotel.findMany({
        where,
        include: hotelDetailInclude,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async findHotelById(hotelId: string) {
    return this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: hotelDetailInclude,
    });
  }

  async findHotelByIdAndTenantIds(hotelId: string, tenantIds: string[]) {
    return this.prisma.hotel.findFirst({
      where: { id: hotelId, tenantId: { in: tenantIds } },
      include: hotelDetailInclude,
    });
  }

  async updateHotel(hotelId: string, data: Prisma.HotelUpdateInput) {
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data,
      include: hotelDetailInclude,
    });
  }

  async updateHotelScoped(hotelId: string, tenantIds: string[], data: Prisma.HotelUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findFirst({
        where: { id: hotelId, tenantId: { in: tenantIds } },
        select: { id: true },
      });

      if (!hotel) {
        return null;
      }

      return tx.hotel.update({
        where: { id: hotel.id },
        data,
        include: hotelDetailInclude,
      });
    });
  }

  async createRoomWithQr(input: {
    hotelId: string;
    code: string;
    roomNumber: string;
    floor?: string;
    type?: string;
    price?: number;
    maxActiveGuestDevices?: number;
    publicCode: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          hotelId: input.hotelId,
          code: input.code,
          roomNumber: input.roomNumber,
          floor: input.floor,
          type: input.type,
          price: input.price,
          maxActiveGuestDevices: input.maxActiveGuestDevices,
          status: RoomStatus.AVAILABLE,
        },
      });

      await tx.roomQRCode.create({
        data: {
          hotelId: input.hotelId,
          roomId: room.id,
          publicCode: input.publicCode,
          status: RoomQRCodeStatus.INACTIVE,
          version: 1,
        },
      });

      const createdRoom = await tx.room.findUniqueOrThrow({
        where: { id: room.id },
        include: roomListInclude,
      });
      return { ...createdRoom, activeGuestDeviceCount: 0 };
    });
  }

  async listRooms(where: Prisma.RoomWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.room.count({ where });
      const rows = await tx.room.findMany({
        where,
        include: roomListInclude,
        orderBy: [{ roomNumber: "asc" }],
        skip,
        take,
      });

      return [total, await this.withActiveGuestDeviceCounts(tx, rows)] as const;
    });
  }

  async updateRoomInHotel(hotelId: string, roomId: string, data: Prisma.RoomUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        select: { id: true },
      });

      if (!room) {
        return null;
      }

      const updatedRoom = await tx.room.update({
        where: { id: room.id },
        data,
        include: roomListInclude,
      });
      return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
    });
  }

  private async withActiveGuestDeviceCounts(
    tx: Prisma.TransactionClient,
    rooms: Prisma.RoomGetPayload<{ include: typeof roomListInclude }>[],
  ): Promise<RoomListRow[]> {
    const activeStayIds = rooms
      .map((room) => room.guestStays[0]?.id)
      .filter((stayId): stayId is string => Boolean(stayId));

    if (activeStayIds.length === 0) {
      return rooms.map((room) => ({ ...room, activeGuestDeviceCount: 0 }));
    }

    const counts = await tx.guestSession.groupBy({
      by: ["stayId"],
      where: {
        stayId: { in: activeStayIds },
        status: GuestSessionStatus.ACTIVE,
      },
      _count: { _all: true },
    });
    const countByStayId = new Map(counts.map((count) => [count.stayId, count._count._all]));

    return rooms.map((room) => ({
      ...room,
      activeGuestDeviceCount: countByStayId.get(room.guestStays[0]?.id ?? "") ?? 0,
    }));
  }

  async listServiceCategories(
    where: Prisma.HotelServiceCategoryWhereInput,
    skip: number,
    take: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotelServiceCategory.count({ where });
      const rows = await tx.hotelServiceCategory.findMany({
        where,
        include: { translations: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async getServiceCategoryTelegramGroup(hotelId: string, serviceCategoryId: string) {
    const route = await this.prisma.notificationRoute.findFirst({
      where: { hotelId, serviceCategoryId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { telegramChatId: true },
    });

    return route?.telegramChatId ?? null;
  }

  async syncServiceCategoryTelegramGroup(input: {
    hotelId: string;
    serviceCategoryId: string;
    telegramChatId?: string | null;
  }) {
    const telegramChatId = input.telegramChatId?.trim();

    if (!telegramChatId) {
      await this.prisma.notificationRoute.updateMany({
        where: {
          hotelId: input.hotelId,
          serviceCategoryId: input.serviceCategoryId,
          isActive: true,
        },
        data: { isActive: false },
      });
      return;
    }

    const existing = await this.prisma.notificationRoute.findFirst({
      where: { hotelId: input.hotelId, serviceCategoryId: input.serviceCategoryId, isActive: true },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.notificationRoute.update({
        where: { id: existing.id },
        data: { telegramChatId },
      });
      return;
    }

    await this.prisma.notificationRoute.create({
      data: {
        hotelId: input.hotelId,
        serviceCategoryId: input.serviceCategoryId,
        telegramChatId,
        isActive: true,
      },
    });
  }

  async createServiceCategory(input: {
    hotelId: string;
    tenantId: string;
    name: string;
    description?: string;
    defaultPrice: Prisma.Decimal | number;
    currency?: string;
    sortOrder?: number;
    status?: ServiceCatalogStatus;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.hotelServiceCategory.create({
        data: {
          hotelId: input.hotelId,
          name: input.name,
          description: input.description,
          defaultPrice: input.defaultPrice,
          currency: input.currency ?? "VND",
          sortOrder: input.sortOrder ?? 0,
          status: input.status ?? ServiceCatalogStatus.ACTIVE,
          translations: this.toCategoryTranslationsCreate(input.translations),
        },
        include: { translations: true },
      });

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_CATEGORY_CREATED",
        aggregateType: "HotelServiceCategory",
        aggregateId: category.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { categoryId: category.id },
      });

      return category;
    });
  }

  async findServiceCategoryInHotel(hotelId: string, categoryId: string) {
    return this.prisma.hotelServiceCategory.findFirst({ where: { id: categoryId, hotelId } });
  }

  async updateServiceCategory(input: {
    hotelId: string;
    tenantId: string;
    categoryId: string;
    data: Prisma.HotelServiceCategoryUpdateInput;
    translations?: ServiceCatalogTranslationInput;
    overrideAllItems?: boolean;
    overridePrice?: Prisma.Decimal | number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.hotelServiceCategory.update({
        where: { id: input.categoryId },
        data: input.data,
        include: { translations: true },
      });

      await this.upsertCategoryTranslations(tx, input.categoryId, input.translations);

      if (input.overrideAllItems && input.overridePrice !== undefined) {
        await tx.hotelServiceItem.updateMany({
          where: { hotelId: input.hotelId, categoryId: input.categoryId },
          data: { priceOverride: input.overridePrice },
        });
      }

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_CATEGORY_UPDATED",
        aggregateType: "HotelServiceCategory",
        aggregateId: category.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { categoryId: category.id },
      });

      return category;
    });
  }

  async listServiceItems(where: Prisma.HotelServiceItemWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotelServiceItem.count({ where });
      const rows = await tx.hotelServiceItem.findMany({
        where,
        include: serviceItemInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async createServiceItem(input: {
    hotelId: string;
    tenantId: string;
    categoryId: string;
    name: string;
    description?: string;
    priceOverride?: Prisma.Decimal | number;
    quantityEnabled?: boolean;
    minQuantity?: number;
    maxQuantity?: number | null;
    metadata?: Prisma.InputJsonValue;
    sortOrder?: number;
    status?: ServiceCatalogStatus;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.hotelServiceItem.create({
        data: {
          hotelId: input.hotelId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          priceOverride: input.priceOverride,
          quantityEnabled: input.quantityEnabled ?? false,
          minQuantity: input.minQuantity ?? 1,
          maxQuantity: input.maxQuantity,
          metadata: input.metadata,
          sortOrder: input.sortOrder ?? 0,
          status: input.status ?? ServiceCatalogStatus.ACTIVE,
          translations: this.toItemTranslationsCreate(input.translations),
        },
        include: serviceItemInclude,
      });

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_ITEM_CREATED",
        aggregateType: "HotelServiceItem",
        aggregateId: item.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { itemId: item.id, categoryId: input.categoryId },
      });

      return item;
    });
  }

  async findServiceItemInHotel(hotelId: string, itemId: string) {
    return this.prisma.hotelServiceItem.findFirst({ where: { id: itemId, hotelId } });
  }

  async updateServiceItem(input: {
    hotelId: string;
    tenantId: string;
    itemId: string;
    data: Prisma.HotelServiceItemUncheckedUpdateInput;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.hotelServiceItem.update({
        where: { id: input.itemId },
        data: input.data,
        include: serviceItemInclude,
      });

      await this.upsertItemTranslations(tx, input.itemId, input.translations);

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_ITEM_UPDATED",
        aggregateType: "HotelServiceItem",
        aggregateId: item.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { itemId: item.id, categoryId: item.categoryId },
      });

      return item;
    });
  }

  async findRoomInHotel(hotelId: string, roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        include: roomListInclude,
      });
      if (!room) return null;
      return (await this.withActiveGuestDeviceCounts(tx, [room]))[0] ?? null;
    });
  }

  async createStay(input: {
    hotelId: string;
    roomId: string;
    guestDisplayName: string;
    guestPhone?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    createdByUserId: string;
    tenantId: string;
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reservationCode = await input.generateReservationCode(tx);
      const stay = await tx.guestStay.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          reservationCode,
          guestDisplayName: input.guestDisplayName,
          guestPhone: input.guestPhone,
          plannedCheckInAt: input.plannedCheckInAt,
          plannedCheckOutAt: input.plannedCheckOutAt,
          createdByUserId: input.createdByUserId,
          status: GuestStayStatus.RESERVED,
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.createdByUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      await tx.room.update({
        where: { id: input.roomId },
        data: { status: RoomStatus.PROCESSING },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_RESERVED",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId },
      });

      return stay;
    });
  }

  async findStayInHotel(hotelId: string, stayId: string) {
    return this.prisma.guestStay.findFirst({ where: { id: stayId, hotelId } });
  }

  async findBlockingBillingFolio(hotelId: string, stayId: string) {
    return this.prisma.folio.findFirst({
      where: {
        hotelId,
        stayId,
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      },
      select: { id: true, status: true, folioNumber: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async checkInStay(input: {
    hotelId: string;
    stayId: string;
    roomId: string;
    accessCodeHash: string;
    accessCodeExpiresAt: Date;
    actorUserId: string;
    tenantId: string;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const stayForCheckIn = await tx.guestStay.findFirst({
        where: { id: input.stayId, hotelId: input.hotelId },
      });

      if (!stayForCheckIn) {
        throw new BadRequestException("Không tìm thấy lượt lưu trú");
      }

      if (
        stayForCheckIn.status !== GuestStayStatus.RESERVED &&
        stayForCheckIn.status !== GuestStayStatus.ACTIVE
      ) {
        throw new BadRequestException("Không thể check-in lượt lưu trú từ trạng thái hiện tại");
      }

      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: { id: true, status: true },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      let roomStatus = room.status;

      if (roomStatus === RoomStatus.OCCUPIED) {
        const [activeStayCount, openFolioCount] = await Promise.all([
          tx.guestStay.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
            },
          }),
          tx.folio.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: FolioStatus.OPEN,
            },
          }),
        ]);

        if (activeStayCount > 0 || openFolioCount > 0) {
          throw new ConflictException("Phòng chưa sẵn sàng để check-in");
        }

        await tx.room.update({
          where: { id: input.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
        roomStatus = RoomStatus.AVAILABLE;
      }

      if (roomStatus !== RoomStatus.PROCESSING && roomStatus !== RoomStatus.AVAILABLE) {
        throw new ConflictException("Phòng chưa sẵn sàng để check-in");
      }

      const qr = await this.findUsableQr(tx, {
        hotelId: input.hotelId,
        roomId: input.roomId,
      });

      const guardedRoomUpdate = await tx.room.updateMany({
        where: {
          id: input.roomId,
          hotelId: input.hotelId,
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.PROCESSING] },
        },
        data: { status: RoomStatus.OCCUPIED },
      });

      if (guardedRoomUpdate.count !== 1) {
        throw new ConflictException("Phòng đang được check-in bởi yêu cầu khác");
      }

      const stay = await tx.guestStay.update({
        where: { id: input.stayId },
        data: {
          status: GuestStayStatus.ACTIVE,
          checkedInAt: now,
          activatedAt: now,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.actorUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          deactivatedAt: now,
        },
      });

      const activeQr = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: stay.plannedCheckOutAt,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_IN",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activeQr.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomQrCodeId: activeQr.id, roomId: input.roomId, stayId: stay.id },
      });

      return { stay, roomQrCode: activeQr };
    });
  }

  async createAndCheckInStay(input: {
    hotelId: string;
    roomId: string;
    guestDisplayName: string;
    guestPhone?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    createdByUserId: string;
    accessCodeHash: string;
    accessCodeExpiresAt: Date;
    actorUserId: string;
    tenantId: string;
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (!input.guestDisplayName.trim()) {
        throw new BadRequestException("Tên khách là bắt buộc để check-in");
      }

      if (input.plannedCheckOutAt <= input.plannedCheckInAt) {
        throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
      }

      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: { id: true, status: true },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      let roomStatus = room.status;

      if (roomStatus === RoomStatus.OCCUPIED || roomStatus === RoomStatus.RESERVED) {
        const [activeStayCount, openFolioCount] = await Promise.all([
          tx.guestStay.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
            },
          }),
          tx.folio.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
            },
          }),
        ]);

        if (activeStayCount > 0 || openFolioCount > 0) {
          throw new ConflictException("Phòng không khả dụng để check-in");
        }

        await tx.room.update({
          where: { id: input.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
        roomStatus = RoomStatus.AVAILABLE;
      }

      if (roomStatus !== RoomStatus.AVAILABLE && roomStatus !== RoomStatus.PROCESSING) {
        throw new ConflictException("Phòng không khả dụng để check-in");
      }

      const qr = await this.findUsableQr(tx, {
        hotelId: input.hotelId,
        roomId: input.roomId,
      });

      const reservationCode = await input.generateReservationCode(tx);
      const stay = await tx.guestStay.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          reservationCode,
          guestDisplayName: input.guestDisplayName.trim(),
          guestPhone: input.guestPhone,
          plannedCheckInAt: input.plannedCheckInAt,
          plannedCheckOutAt: input.plannedCheckOutAt,
          createdByUserId: input.createdByUserId,
          status: GuestStayStatus.ACTIVE,
          checkedInAt: now,
          activatedAt: now,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.createdByUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      const guardedRoomUpdate = await tx.room.updateMany({
        where: {
          id: input.roomId,
          hotelId: input.hotelId,
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.PROCESSING] },
        },
        data: { status: RoomStatus.OCCUPIED },
      });

      if (guardedRoomUpdate.count !== 1) {
        throw new ConflictException("Phòng đang được check-in bởi yêu cầu khác");
      }

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
      });

      const activeQr = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: stay.plannedCheckOutAt,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_IN",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activeQr.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomQrCodeId: activeQr.id, roomId: input.roomId, stayId: stay.id },
      });

      return { stay, roomQrCode: activeQr };
    });
  }

  async checkOutStay(input: {
    hotelId: string;
    stayId: string;
    roomId: string;
    actorUserId: string;
    tenantId: string;
    nextRoomStatus: RoomStatus;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const stay = await tx.guestStay.update({
        where: { id: input.stayId },
        data: {
          status: GuestStayStatus.CHECKED_OUT,
          checkedOutAt: now,
          closedByUserId: input.actorUserId,
          accessCodeHash: null,
          accessCodeExpiresAt: null,
        },
      });

      await tx.room.update({
        where: { id: input.roomId },
        data: { status: input.nextRoomStatus },
      });

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          deactivatedAt: now,
        },
      });

      await tx.guestSession.updateMany({
        where: {
          stayId: input.stayId,
          status: {
            in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE, GuestSessionStatus.CREATED],
          },
        },
        data: {
          status: GuestSessionStatus.CLOSED,
          closedAt: now,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_OUT",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_DEACTIVATED",
        aggregateType: "Room",
        aggregateId: input.roomId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomId: input.roomId, stayId: stay.id },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_SESSION_REVOKED",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, reason: "CHECKOUT" },
      });

      return stay;
    });
  }

  async rotateQr(input: {
    hotelId: string;
    roomId: string;
    publicCode: string;
    tenantId: string;
    reason?: string;
  }) {
    const hotelId = input.hotelId?.trim();
    const roomId = input.roomId?.trim();
    const publicCode = input.publicCode?.trim();
    const tenantId = input.tenantId?.trim();

    if (!hotelId) {
      throw new BadRequestException("Thiếu khách sạn khi xoay mã QR");
    }

    if (!roomId) {
      throw new BadRequestException("Thiếu phòng khi xoay mã QR");
    }

    if (!publicCode) {
      throw new BadRequestException("Thiếu token QR khi xoay mã QR");
    }

    if (!tenantId) {
      throw new BadRequestException("Thiếu tenant khi xoay mã QR");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.roomQRCode.findFirst({
        where: { hotelId, roomId },
        orderBy: { version: "desc" },
      });

      await tx.roomQRCode.updateMany({
        where: {
          hotelId,
          roomId,
          status: { not: RoomQRCodeStatus.REVOKED },
        },
        data: {
          status: RoomQRCodeStatus.REVOKED,
          deactivatedAt: now,
          revokedAt: now,
        },
      });

      const rotated = await tx.roomQRCode.create({
        data: {
          hotelId,
          roomId,
          publicCode,
          status:
            latest?.status === RoomQRCodeStatus.ACTIVE
              ? RoomQRCodeStatus.ACTIVE
              : RoomQRCodeStatus.INACTIVE,
          version: (latest?.version ?? 0) + 1,
          activatedAt: latest?.status === RoomQRCodeStatus.ACTIVE ? now : null,
          deactivatedAt: null,
          expiresAt: latest?.status === RoomQRCodeStatus.ACTIVE ? (latest.expiresAt ?? null) : null,
          revokedAt: null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ROTATED",
        aggregateType: "RoomQRCode",
        aggregateId: rotated.id,
        hotelId,
        tenantId,
        payload: { roomId, reason: input.reason ?? "ROTATED", previousQrCodeId: latest?.id },
      });

      return rotated;
    });
  }

  async activateQr(input: {
    hotelId: string;
    roomId: string;
    tenantId: string;
    publicCode: string;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const activeStay = await tx.guestStay.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: GuestStayStatus.ACTIVE,
        },
      });

      const latestQr = await tx.roomQRCode.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: { not: RoomQRCodeStatus.REVOKED },
        },
        orderBy: { version: "desc" },
      });

      const qr =
        latestQr ??
        (await tx.roomQRCode.create({
          data: {
            hotelId: input.hotelId,
            roomId: input.roomId,
            publicCode: input.publicCode,
            status: RoomQRCodeStatus.INACTIVE,
            version: 1,
          },
        }));

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
      });

      const activated = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: activeStay?.plannedCheckOutAt ?? null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activated.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomId: input.roomId, stayId: activeStay?.id ?? null },
      });

      return activated;
    });
  }

  async deactivateQr(input: {
    hotelId: string;
    roomId: string;
    tenantId: string;
    reason?: string;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.roomQRCode.updateMany({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          deactivatedAt: now,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_DEACTIVATED",
        aggregateType: "Room",
        aggregateId: input.roomId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomId: input.roomId, reason: input.reason ?? "MANUAL" },
      });

      return result;
    });
  }

  async listRequests(where: Prisma.GuestRequestWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.guestRequest.count({ where });
      const rows = await tx.guestRequest.findMany({
        where,
        include: requestListInclude,
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async summarizeRequests(where: Prisma.GuestRequestWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.guestRequest.count({ where });
      const statuses = await tx.guestRequest.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      });

      return { total, statuses };
    });
  }

  async summarizeOperationalRequests(where: Prisma.GuestRequestWhereInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const activeStatuses = [
      GuestRequestStatus.CREATED,
      GuestRequestStatus.ACKNOWLEDGED,
      GuestRequestStatus.IN_PROGRESS,
    ];

    return this.prisma.$transaction(async (tx) => {
      const [pending, urgent, unassigned, completedToday] = await Promise.all([
        tx.guestRequest.count({ where: { ...where, status: { in: activeStatuses } } }),
        tx.guestRequest.count({
          where: {
            ...where,
            status: { in: activeStatuses },
            priority: GuestRequestPriority.URGENT,
          },
        }),
        tx.guestRequest.count({
          where: { ...where, status: { in: activeStatuses }, assignedToUserId: null },
        }),
        tx.guestRequest.count({
          where: {
            ...where,
            status: GuestRequestStatus.COMPLETED,
            completedAt: { gte: today, lt: tomorrow },
          },
        }),
      ]);

      return { pending, urgent, unassigned, completedToday };
    });
  }

  async findRequestInHotel(hotelId: string, requestId: string) {
    return this.prisma.guestRequest.findFirst({ where: { id: requestId, hotelId } });
  }

  async findRequestDetailInHotel(hotelId: string, requestId: string) {
    return this.prisma.guestRequest.findFirst({
      where: { id: requestId, hotelId },
      include: requestDetailInclude,
    });
  }

  async findAssignableStaffInTenant(userId: string, tenantId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantUsers: { some: { tenantId, status: TenantUserStatus.ACTIVE } },
      },
      select: { id: true },
    });
  }

  async updateRequestStatus(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    status: GuestRequestStatus;
    note?: string;
    assignedToUserId?: string;
    priority?: Prisma.GuestRequestUpdateInput["priority"];
    tenantId: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.guestRequest.findFirstOrThrow({
          where: { id: input.requestId, hotelId: input.hotelId },
        });

        let billingFolioItemId: string | undefined;
        const completedAt = input.status === GuestRequestStatus.COMPLETED ? new Date() : undefined;

        if (input.status === GuestRequestStatus.COMPLETED) {
          const folioItem = await this.createServiceFolioItemFromGuestRequest(tx, {
            hotelId: input.hotelId,
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            completedAt: completedAt ?? new Date(),
          });
          billingFolioItemId = folioItem.id;
        }

        const updated = await tx.guestRequest.update({
          where: { id: input.requestId },
          data: {
            status: input.status,
            assignedToUserId: input.assignedToUserId,
            priority: input.priority,
            completedAt,
            cancelledAt: input.status === GuestRequestStatus.CANCELLED ? new Date() : undefined,
            billingPostStatus: input.status === GuestRequestStatus.COMPLETED ? "POSTED" : undefined,
            billingPostedAt: input.status === GuestRequestStatus.COMPLETED ? new Date() : undefined,
            billingFolioItemId,
          },
          include: requestDetailInclude,
        });

        await tx.guestRequestEvent.create({
          data: {
            requestId: input.requestId,
            hotelId: input.hotelId,
            actorType: GuestRequestActorType.STAFF,
            actorUserId: input.actorUserId,
            eventType: "REQUEST_UPDATED",
            fromStatus: existing.status,
            toStatus: updated.status,
            note: input.note,
          },
        });

        await this.createDomainEvent(tx, {
          eventType: "REQUEST_UPDATED",
          aggregateType: "GuestRequest",
          aggregateId: updated.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: { requestId: updated.id, fromStatus: existing.status, toStatus: updated.status },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateRequestAssignment(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    assignedToUserId: string | null;
    note?: string;
    tenantId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.guestRequest.findFirstOrThrow({
        where: { id: input.requestId, hotelId: input.hotelId },
      });

      const updated = await tx.guestRequest.update({
        where: { id: input.requestId },
        data: { assignedToUserId: input.assignedToUserId },
        include: requestDetailInclude,
      });

      await tx.guestRequestEvent.create({
        data: {
          requestId: input.requestId,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.STAFF,
          actorUserId: input.actorUserId,
          eventType: "REQUEST_ASSIGNMENT_UPDATED",
          note: input.note,
          metadata: {
            fromAssignedToUserId: existing.assignedToUserId,
            toAssignedToUserId: input.assignedToUserId,
          },
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_ASSIGNMENT_UPDATED",
        aggregateType: "GuestRequest",
        aggregateId: updated.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: {
          requestId: updated.id,
          fromAssignedToUserId: existing.assignedToUserId,
          toAssignedToUserId: input.assignedToUserId,
        },
      });

      return updated;
    });
  }

  async createRequestEvent(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    note: string;
    metadata?: Prisma.InputJsonValue;
    tenantId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.guestRequestEvent.create({
        data: {
          requestId: input.requestId,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.STAFF,
          actorUserId: input.actorUserId,
          eventType: "REQUEST_NOTE_ADDED",
          note: input.note,
          metadata: input.metadata,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_NOTE_ADDED",
        aggregateType: "GuestRequest",
        aggregateId: input.requestId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { requestId: input.requestId, eventId: event.id },
      });

      return event;
    });
  }

  private async findExistingFolioItemByGuestRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ) {
    return tx.folioItem.findUnique({
      where: { guestRequestId: requestId },
      select: { id: true, folioId: true },
    });
  }

  private async createServiceFolioItemFromGuestRequest(
    tx: Prisma.TransactionClient,
    input: { hotelId: string; requestId: string; actorUserId: string; completedAt: Date },
  ) {
    const existingFolioItem = await this.findExistingFolioItemByGuestRequest(tx, input.requestId);

    if (existingFolioItem) {
      await this.recalculateFolioTotals(tx, existingFolioItem.folioId);
      return existingFolioItem;
    }

    const request = await tx.guestRequest.findFirstOrThrow({
      where: { id: input.requestId, hotelId: input.hotelId },
      include: {
        stay: { select: { id: true, status: true } },
        serviceItem: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                defaultPrice: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (request.stay.status !== GuestStayStatus.ACTIVE) {
      throw new ConflictException("Không thể ghi nhận phí dịch vụ cho lượt lưu trú chưa hoạt động");
    }

    if (!request.serviceItem) {
      throw new BadRequestException("Yêu cầu không có dịch vụ để ghi nhận tính phí");
    }

    const folio = await tx.folio.findFirst({
      where: { hotelId: input.hotelId, stayId: request.stayId, status: FolioStatus.OPEN },
      select: { id: true, currency: true },
    });

    if (!folio) {
      throw new ConflictException("Không tìm thấy folio đang mở cho lượt lưu trú");
    }

    const unitPrice =
      request.serviceItem.priceOverride ?? request.serviceItem.category.defaultPrice;
    const quantity = Math.max(request.quantity ?? 1, 1);
    const subtotal = new Prisma.Decimal(unitPrice).mul(quantity);
    const zero = new Prisma.Decimal(0);

    const folioItem = await tx.folioItem.create({
      data: {
        hotelId: input.hotelId,
        folioId: folio.id,
        stayId: request.stayId,
        itemType: FolioItemType.SERVICE,
        sourceType: FolioItemSourceType.GUEST_REQUEST,
        sourceId: request.id,
        roomId: request.roomId,
        serviceItemId: request.serviceItemId,
        guestRequestId: request.id,
        codeSnapshot: request.serviceItem.id,
        nameSnapshot: request.serviceItem.name,
        descriptionSnapshot: request.description ?? request.title,
        quantity,
        unitPriceSnapshot: unitPrice,
        taxRateSnapshot: zero,
        taxAmountSnapshot: zero,
        discountAmountSnapshot: zero,
        subtotalSnapshot: subtotal,
        totalSnapshot: subtotal,
        currency: request.serviceItem.category.currency ?? folio.currency,
        billingSourceSnapshot: {
          guestRequestId: request.id,
          serviceItemId: request.serviceItem.id,
          serviceName: request.serviceItem.name,
          categoryId: request.serviceItem.category.id,
          categoryName: request.serviceItem.category.name,
          priceSource: request.serviceItem.priceOverride ? "SERVICE_OVERRIDE" : "CATEGORY_DEFAULT",
          originalUnitPrice: unitPrice.toString(),
          quantity,
        },
        serviceCompletedAt: input.completedAt,
        postedAt: input.completedAt,
        postedByUserId: input.actorUserId,
      },
      select: { id: true, folioId: true },
    });

    await this.recalculateFolioTotals(tx, folio.id);
    return folioItem;
  }

  private async recalculateFolioTotals(tx: Prisma.TransactionClient, folioId: string) {
    const totals = await tx.folioItem.aggregate({
      where: { folioId, voidedAt: null },
      _sum: {
        subtotalSnapshot: true,
        taxAmountSnapshot: true,
        discountAmountSnapshot: true,
        totalSnapshot: true,
      },
    });

    await tx.folio.update({
      where: { id: folioId },
      data: {
        subtotalAmount: totals._sum.subtotalSnapshot ?? new Prisma.Decimal(0),
        taxAmount: totals._sum.taxAmountSnapshot ?? new Prisma.Decimal(0),
        discountAmount: totals._sum.discountAmountSnapshot ?? new Prisma.Decimal(0),
        totalAmount: totals._sum.totalSnapshot ?? new Prisma.Decimal(0),
      },
    });
  }

  private async createOpenFolioForStay(
    tx: Prisma.TransactionClient,
    input: {
      hotelId: string;
      stayId: string;
      roomId: string;
      createdByUserId: string;
      generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
    },
  ) {
    const existing = await tx.folio.findFirst({
      where: {
        hotelId: input.hotelId,
        stayId: input.stayId,
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return tx.folio.create({
      data: {
        hotelId: input.hotelId,
        stayId: input.stayId,
        roomId: input.roomId,
        folioNumber: await input.generateFolioNumber(tx),
        status: FolioStatus.OPEN,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
  }

  private toCategoryTranslationsCreate(translations?: ServiceCatalogTranslationInput) {
    const data = this.toTranslationsCreateData(translations);
    return data.length ? { create: data } : undefined;
  }

  private toItemTranslationsCreate(translations?: ServiceCatalogTranslationInput) {
    const data = this.toTranslationsCreateData(translations);
    return data.length ? { create: data } : undefined;
  }

  private toTranslationsCreateData(translations?: ServiceCatalogTranslationInput) {
    return Object.entries(translations ?? {})
      .filter((entry): entry is [string, { name: string; description?: string | null }] =>
        Boolean(entry[1]),
      )
      .map(([locale, value]) => ({
        locale,
        name: value.name.trim(),
        description: value.description === null ? null : value.description?.trim(),
      }));
  }

  private async upsertCategoryTranslations(
    tx: Prisma.TransactionClient,
    categoryId: string,
    translations?: ServiceCatalogTranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations ?? {})) {
      if (!value) continue;
      await tx.hotelServiceCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale } },
        create: {
          categoryId,
          locale,
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
        update: {
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
      });
    }
  }

  private async upsertItemTranslations(
    tx: Prisma.TransactionClient,
    itemId: string,
    translations?: ServiceCatalogTranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations ?? {})) {
      if (!value) continue;
      await tx.hotelServiceItemTranslation.upsert({
        where: { itemId_locale: { itemId, locale } },
        create: {
          itemId,
          locale,
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
        update: {
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
      });
    }
  }

  private async createDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      hotelId?: string;
      tenantId?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return tx.domainEvent.create({
      data: {
        ...input,
        status: DomainEventStatus.PENDING,
      },
    });
  }

  private async findUsableQr(
    tx: Prisma.TransactionClient,
    input: {
      hotelId: string;
      roomId: string;
    },
  ) {
    const existingQr = await tx.roomQRCode.findFirst({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        status: { not: RoomQRCodeStatus.REVOKED },
      },
      orderBy: { version: "desc" },
    });

    if (!existingQr) {
      throw new BadRequestException("Phòng chưa có QR. Vui lòng tạo QR trước khi check-in.");
    }

    return existingQr;
  }
}
