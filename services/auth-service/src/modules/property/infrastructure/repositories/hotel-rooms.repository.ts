import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  DomainEventStatus,
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  Prisma,
  ReservationStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { roomListInclude, type RoomListRow } from "./hotel-repository.types";

@Injectable()
export class HotelRoomsRepository {
  constructor(private readonly prisma: PrismaService) {}
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

      const hotelId = where.hotelId as string;
      const allFloors = await tx.room.findMany({
        where: { hotelId },
        select: { floor: true },
        distinct: ["floor"],
      });
      const allTypes = await tx.room.findMany({
        where: { hotelId },
        select: { type: true },
        distinct: ["type"],
      });
      const availableCount = await tx.room.count({
        where: { hotelId, status: RoomStatus.AVAILABLE },
      });

      const uniqueFloors = allFloors.map((f) => f.floor).filter((f): f is string => Boolean(f));
      const uniqueTypes = allTypes.map((t) => t.type).filter((t): t is string => Boolean(t));

      return {
        total,
        items: await this.withActiveGuestDeviceCounts(tx, rows),
        floors: [...uniqueFloors].sort((a, b) => a.localeCompare(b)),
        types: [...uniqueTypes].sort((a, b) => a.localeCompare(b)),
        totalAvailable: availableCount,
      };
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

      if (tx.reservation?.findFirst) {
        const overlappingReservation = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.roomId,
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
            plannedCheckInAt: { lt: input.plannedCheckOutAt },
            plannedCheckOutAt: { gt: input.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (overlappingReservation) {
          throw new ConflictException("Phòng đã có đặt trước trong khoảng thời gian này");
        }
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
