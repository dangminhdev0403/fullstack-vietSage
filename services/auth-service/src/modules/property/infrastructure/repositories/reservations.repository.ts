import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventStatus,
  FolioStatus,
  GuestStayStatus,
  Prisma,
  ReservationStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { CheckInReservationBodyInput } from "../../domain/schemas/reservations.schema";
import { inferCitizenshipKind } from "../../domain/infer-citizenship-kind";
import { ReservationRoomAllocationService } from "../../application/reservation-room-allocation.service";

const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.ARRIVAL_READY,
];

const ACTIVE_STAY_STATUSES: GuestStayStatus[] = [
  GuestStayStatus.CHECKED_IN,
  GuestStayStatus.ACTIVE,
  GuestStayStatus.CHECKOUT_PENDING,
];

const NON_SELLABLE_ROOM_STATUSES: RoomStatus[] = [
  RoomStatus.BLOCKED,
  RoomStatus.MAINTENANCE,
  RoomStatus.OUT_OF_SERVICE,
];

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createBulkReservations(input: {
    hotelId: string;
    groupCode: string;
    leadGuestName: string;
    leadGuestPhone?: string;
    checkInDate: Date;
    checkOutDate: Date;
    roomIds?: string[];
    allocations?: Array<{
      roomTypeId: string;
      quantity: number;
      rate?: Prisma.Decimal | number | string | null;
      nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    }>;
    autoAssign?: boolean;
    createdByUserId: string;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    roomRates?: Record<string, Prisma.Decimal | number | string | null | undefined>;
    idempotencyKey?: string;
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    roomAllocationService?: any;
  }) {
    return this.runSerializable(async (tx) => {
      let resolvedRoomIds = input.roomIds ? [...input.roomIds] : [];
      const allocatedRoomRates = new Map<string, Prisma.Decimal | number | string | null>();
      if (input.allocations && input.allocations.length > 0) {
        if (!input.roomAllocationService) {
          throw new BadRequestException("Dá»‹ch vá»¥ tá»± Ä‘á»™ng phÃ¢n bá»• phÃ²ng khÃ´ng kháº£ dá»¥ng");
        }
        for (const alloc of input.allocations) {
          const allocRate = alloc.rate !== undefined ? alloc.rate : alloc.nightlyRateSnapshot;
          for (let i = 0; i < alloc.quantity; i++) {
            const allocated = await input.roomAllocationService.allocateRoom(tx, {
              hotelId: input.hotelId,
              roomTypeId: alloc.roomTypeId,
              interval: { checkInAt: input.checkInDate, checkOutAt: input.checkOutDate },
              excludedRoomIds: resolvedRoomIds,
              mode: "auto",
            });
            resolvedRoomIds.push(allocated.roomId);
            if (allocRate !== undefined) {
              allocatedRoomRates.set(allocated.roomId, allocRate);
            }
          }
        }
      }

      const uniqueRoomIds = Array.from(new Set(resolvedRoomIds));
      if (uniqueRoomIds.length < 1 || uniqueRoomIds.length > 50) {
        throw new BadRequestException("Sá»‘ lÆ°á»£ng phÃ²ng Ä‘áº·t pháº£i tá»« 1 Ä‘áº¿n 50 phÃ²ng");
      }

      // Sorted locking to eliminate deadlock risks across concurrent transactions
      const sortedRoomIds = [...uniqueRoomIds].sort();

      for (const roomId of sortedRoomIds) {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          roomId,
          input.hotelId,
        );
      }

      const rooms = await tx.room.findMany({
        where: { id: { in: sortedRoomIds }, hotelId: input.hotelId },
        select: { id: true, status: true, price: true },
      });

      if (rooms.length !== sortedRoomIds.length) {
        throw new NotFoundException("Má»™t hoáº·c nhiá»u phÃ²ng khÃ´ng tá»“n táº¡i trong khÃ¡ch sáº¡n");
      }

      for (const room of rooms) {
        if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
          throw new ConflictException("ROOM_NOT_AVAILABLE");
        }
      }

      // Check overlapping active reservations [checkInDate, checkOutDate)
      // Cancelled reservations release inventory and are not in ACTIVE_RESERVATION_STATUSES
      const resOverlap = await tx.reservation.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: { in: sortedRoomIds },
          status: { in: ACTIVE_RESERVATION_STATUSES },
          plannedCheckInAt: { lt: input.checkOutDate },
          plannedCheckOutAt: { gt: input.checkInDate },
        },
        select: { id: true, roomId: true },
      });
      if (resOverlap) {
        throw new ConflictException("ROOM_RESERVATION_OVERLAP");
      }

      // Check overlapping active stays [checkInDate, checkOutDate)
      if (tx.guestStay?.findFirst) {
        const stayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: { in: sortedRoomIds },
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: input.checkOutDate },
            plannedCheckOutAt: { gt: input.checkInDate },
          },
          select: { id: true, roomId: true },
        });
        if (stayOverlap) {
          throw new ConflictException("ROOM_RESERVATION_OVERLAP");
        }

        const now = new Date();
        if (input.checkInDate <= now) {
          const overdueStay = await tx.guestStay.findFirst({
            where: {
              hotelId: input.hotelId,
              roomId: { in: sortedRoomIds },
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
              checkedOutAt: null,
              plannedCheckOutAt: { lt: now },
            },
            select: { id: true, roomId: true },
          });
          if (overdueStay) {
            throw new ConflictException("ROOM_RESERVATION_OVERLAP");
          }
        }
      }

      const reservations: any[] = [];
      const now = new Date();

      for (const roomId of uniqueRoomIds) {
        const reservationCode = await input.generateReservationCode(tx);
        const specificRate = input.roomRates?.[roomId] ?? allocatedRoomRates.get(roomId);
        const effectiveRaw =
          specificRate !== undefined
            ? specificRate
            : input.nightlyRateSnapshot !== undefined
              ? input.nightlyRateSnapshot
              : null;

        const nightlyRateSnapshot =
          effectiveRaw !== undefined && effectiveRaw !== null
            ? new Prisma.Decimal(effectiveRaw).toFixed(2)
            : null;

        const reservationData: any = {
          hotelId: input.hotelId,
          roomId,
          reservationCode,
          groupCode: input.groupCode,
          guestDisplayName: input.leadGuestName,
          guestPhone: input.leadGuestPhone,
          plannedCheckInAt: input.checkInDate,
          plannedCheckOutAt: input.checkOutDate,
          createdByUserId: input.createdByUserId,
          status: ReservationStatus.ARRIVAL_READY,
          assignedAt: now,
          assignedByUserId: input.createdByUserId,
          nightlyRateSnapshot,
        };

        const reservation = await (tx.reservation.create as any)({
          data: reservationData,
          include: { room: true },
        });
        reservations.push(reservation);
      }

      return {
        groupCode: input.groupCode,
        reservations,
      };
    }, "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
  }

  async createReservation(input: {
    hotelId: string;
    reservationCode: string;
    guestDisplayName: string;
    guestPhone?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    createdByUserId: string;
    roomId?: string | null;
    roomTypeId?: string | null;
    guestCount?: number | null;
    notes?: string | null;
    autoAssign?: boolean;
    roomAllocationService?: any;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
  }) {
    if (input.roomId || ((input.autoAssign || input.roomTypeId) && input.roomAllocationService)) {
      return this.runSerializable(async (tx) => {
        let roomId = input.roomId;
        if (!roomId && (input.autoAssign || input.roomTypeId) && input.roomAllocationService) {
          const allocated = await input.roomAllocationService.allocateRoom(tx, {
            hotelId: input.hotelId,
            roomTypeId: input.roomTypeId ?? undefined,
            interval: { checkInAt: input.plannedCheckInAt, checkOutAt: input.plannedCheckOutAt },
            guestCount: input.guestCount,
            mode: "auto",
          });
          roomId = allocated.roomId;
        }

        if (!roomId) {
          throw new BadRequestException("Không thể xác định phòng");
        }

        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          roomId,
          input.hotelId,
        );
        const room = await tx.room.findFirst({
          where: { id: roomId, hotelId: input.hotelId },
          select: {
            id: true,
            status: true,
            price: true,
            roomTypeId: true,
            type: true,
            roomType: { select: { id: true, name: true, maxOccupancy: true } },
          },
        });
        if (!room) {
          throw new NotFoundException("Không tìm thấy phòng");
        }
        if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
          throw new ConflictException("ROOM_NOT_AVAILABLE");
        }

        if (input.roomTypeId && room.roomTypeId && room.roomTypeId !== input.roomTypeId) {
          throw new ConflictException("ROOM_TYPE_MISMATCH");
        }

        const roomCapacity = (room as any)?.roomType?.maxOccupancy;
        if (
          roomCapacity != null &&
          input.guestCount != null &&
          input.guestCount > roomCapacity
        ) {
          throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
        }

        const overlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId,
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: input.plannedCheckOutAt },
            plannedCheckOutAt: { gt: input.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException("ROOM_RESERVATION_OVERLAP");
        }

        const stayOverlap = tx.guestStay?.findFirst
          ? await tx.guestStay.findFirst({
              where: {
                hotelId: input.hotelId,
                roomId,
                status: { in: ACTIVE_STAY_STATUSES },
                plannedCheckInAt: { lt: input.plannedCheckOutAt },
                plannedCheckOutAt: { gt: input.plannedCheckInAt },
              },
              select: { id: true },
            })
          : null;
        if (stayOverlap) {
          throw new ConflictException("ROOM_RESERVATION_OVERLAP");
        }

        return tx.reservation.create({
          data: {
            hotelId: input.hotelId,
            roomId,
            roomTypeId: input.roomTypeId ?? room.roomTypeId ?? null,
            guestCount: input.guestCount ?? null,
            notes: input.notes ?? null,
            reservationCode: input.reservationCode,
            guestDisplayName: input.guestDisplayName,
            guestPhone: input.guestPhone,
            plannedCheckInAt: input.plannedCheckInAt,
            plannedCheckOutAt: input.plannedCheckOutAt,
            createdByUserId: input.createdByUserId,
            status: ReservationStatus.ARRIVAL_READY,
            assignedAt: new Date(),
            assignedByUserId: input.createdByUserId,
            nightlyRateSnapshot:
              input.nightlyRateSnapshot !== undefined ? input.nightlyRateSnapshot : null,
          },
          include: { room: true, roomType: true },
        });
      }, "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
    }

    return this.prisma.reservation.create({
      data: {
        hotelId: input.hotelId,
        roomId: null,
        roomTypeId: input.roomTypeId ?? null,
        guestCount: input.guestCount ?? null,
        notes: input.notes ?? null,
        reservationCode: input.reservationCode,
        guestDisplayName: input.guestDisplayName,
        guestPhone: input.guestPhone,
        plannedCheckInAt: input.plannedCheckInAt,
        plannedCheckOutAt: input.plannedCheckOutAt,
        createdByUserId: input.createdByUserId,
        status: ReservationStatus.CONFIRMED,
        nightlyRateSnapshot:
          input.nightlyRateSnapshot !== undefined ? input.nightlyRateSnapshot : null,
      },
      include: { roomType: true },
    });
  }

  async findReservationById(hotelId: string, reservationId: string) {
    return this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId },
      include: {
        room: true,
        roomType: true,
      },
    });
  }

  async listArrivals(input: {
    hotelId: string;
    from: Date;
    to: Date;
    skip: number;
    take: number;
    roomId?: string;
    q?: string;
  }) {
    const q = input.q?.trim();
    const where: Prisma.ReservationWhereInput = {
      hotelId: input.hotelId,
      status: { in: ACTIVE_RESERVATION_STATUSES },
      plannedCheckInAt: { gte: input.from, lt: input.to },
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(q
        ? {
            OR: [
              { guestDisplayName: { contains: q, mode: "insensitive" } },
              { guestPhone: { contains: q } },
              { reservationCode: { contains: q, mode: "insensitive" } },
              { room: { roomNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: { room: true, stay: true },
        orderBy: [{ plannedCheckInAt: "asc" }, { reservationCode: "asc" }],
        skip: input.skip,
        take: input.take,
      }),
    ]);
    return [total, items] as const;
  }

  async assignRoom(input: {
    hotelId: string;
    reservationId: string;
    roomId: string;
    actorUserId: string;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    expectedUpdatedAt?: Date | string | null;
    expectedRoomId?: string | null;
    roomAllocationService?: any;
  }) {
    return this.runSerializable(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.reservationId,
        input.hotelId,
      );
      const reservation = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { roomType: true },
      });
      if (!reservation) return null;
      if (reservation.status === ReservationStatus.CANCELLED) {
        throw new ConflictException("RESERVATION_CANCELLED");
      }
      if (reservation.status === ReservationStatus.NO_SHOW) {
        throw new ConflictException("RESERVATION_NO_SHOW");
      }
      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
        throw new ConflictException("RESERVATION_NOT_ASSIGNABLE");
      }

      if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== null) {
        const expectedDate = new Date(input.expectedUpdatedAt).getTime();
        const actualDate = new Date(reservation.updatedAt).getTime();
        if (expectedDate !== actualDate) {
          throw new ConflictException("STALE_RESERVATION_RECORD");
        }
      }

      if (input.expectedRoomId !== undefined) {
        const expectedRoom = input.expectedRoomId === "" ? null : input.expectedRoomId;
        if (reservation.roomId !== expectedRoom) {
          throw new ConflictException("STALE_ROOM_ASSIGNMENT");
        }
      }

      if (input.roomAllocationService) {
        let roomTypeId = reservation.roomTypeId ?? undefined;
        if (!roomTypeId) {
          const targetRoom = await tx.room.findFirst({
            where: { id: input.roomId, hotelId: input.hotelId },
            select: { roomTypeId: true, type: true },
          });
          roomTypeId = targetRoom?.roomTypeId ?? targetRoom?.type ?? undefined;
        }

        await input.roomAllocationService.allocateRoom(tx, {
          hotelId: input.hotelId,
          mode: "manual",
          requestedRoomId: input.roomId,
          roomTypeId,
          interval: {
            checkInAt: reservation.plannedCheckInAt,
            checkOutAt: reservation.plannedCheckOutAt,
          },
          guestCount: reservation.guestCount,
          excludedReservationId: reservation.id,
        });
      } else {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          input.roomId,
          input.hotelId,
        );
        const room = await tx.room.findFirst({
          where: { id: input.roomId, hotelId: input.hotelId },
          select: {
            id: true,
            status: true,
            price: true,
            roomTypeId: true,
            type: true,
            roomType: { select: { id: true, name: true, maxOccupancy: true } },
          },
        });
        if (!room) {
          throw new NotFoundException("Không tìm thấy phòng");
        }
        if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
          throw new ConflictException("ROOM_NOT_AVAILABLE");
        }

        if (
          reservation.roomTypeId &&
          room.roomTypeId &&
          room.roomTypeId !== reservation.roomTypeId
        ) {
          throw new ConflictException("ROOM_TYPE_MISMATCH");
        }

        const roomCapacity =
          (room as any)?.roomType?.maxOccupancy ?? (room as any)?.maxOccupancy;
        if (
          roomCapacity != null &&
          reservation.guestCount != null &&
          reservation.guestCount > roomCapacity
        ) {
          throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
        }

        const overlap = await tx.reservation.findFirst({
          where: {
            id: { not: reservation.id },
            hotelId: input.hotelId,
            roomId: input.roomId,
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: reservation.plannedCheckOutAt },
            plannedCheckOutAt: { gt: reservation.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException("ROOM_RESERVATION_OVERLAP");
        }

        if (tx.guestStay?.findFirst) {
          const stayOverlap = await tx.guestStay.findFirst({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: { in: ACTIVE_STAY_STATUSES },
              plannedCheckInAt: { lt: reservation.plannedCheckOutAt },
              plannedCheckOutAt: { gt: reservation.plannedCheckInAt },
            },
            select: { id: true },
          });
          if (stayOverlap) {
            throw new ConflictException("ROOM_RESERVATION_OVERLAP");
          }
        }
      }

      return tx.reservation.update({
        where: { id: reservation.id },
        data: {
          roomId: input.roomId,
          status: ReservationStatus.ARRIVAL_READY,
          assignedAt: new Date(),
          assignedByUserId: input.actorUserId,
          ...(input.nightlyRateSnapshot !== undefined
            ? { nightlyRateSnapshot: input.nightlyRateSnapshot }
            : {}),
        },
        include: { room: true, roomType: true },
      });
    }, "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
  }

  async checkInReservation(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    actorUserId: string;
    accessCodeHash: string;
    accessCodeExpiresAt: Date;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
    timezone?: string;
    now?: Date;
    dto?: CheckInReservationBodyInput;
  }) {
    return this.runSerializable(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.reservationId,
        input.hotelId,
      );
      const reservation = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { hotel: { select: { timezone: true } }, roomType: true },
      });
      if (!reservation) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }

      if (reservation.status === ReservationStatus.CHECKED_IN) {
        const stay = await tx.guestStay.findUnique({
          where: { reservationId: reservation.id },
        });
        if (!stay) {
          throw new ConflictException("CHECKED_IN_RESERVATION_MISSING_STAY");
        }
        const folio = await tx.folio.findFirst({
          where: { hotelId: input.hotelId, stayId: stay.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (!folio) {
          throw new ConflictException("CHECKED_IN_RESERVATION_MISSING_FOLIO");
        }
        return { idempotent: true, reservation, stay, folio };
      }

      if (reservation.status === ReservationStatus.CANCELLED) {
        throw new ConflictException("RESERVATION_CANCELLED");
      }
      if (reservation.status === ReservationStatus.NO_SHOW) {
        throw new ConflictException("RESERVATION_NO_SHOW");
      }

      if (input.dto?.expectedUpdatedAt !== undefined && input.dto?.expectedUpdatedAt !== null) {
        const expectedDate = new Date(input.dto.expectedUpdatedAt).getTime();
        const actualDate = new Date(reservation.updatedAt).getTime();
        if (expectedDate !== actualDate) {
          throw new ConflictException("STALE_RESERVATION_RECORD");
        }
      }

      if (input.dto?.expectedRoomId !== undefined) {
        const expectedRoom = input.dto.expectedRoomId === "" ? null : input.dto.expectedRoomId;
        if (reservation.roomId !== expectedRoom) {
          throw new ConflictException("STALE_ROOM_ASSIGNMENT");
        }
      }

      const hotelTimezone =
        input.timezone || (reservation as any).hotel?.timezone || "Asia/Ho_Chi_Minh";
      const formatHotelDate = (date: Date) => {
        try {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: hotelTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(date);
        } catch {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(date);
        }
      };

      const now = input.now ?? new Date();
      const todayStr = formatHotelDate(now);
      const reservationDateStr = reservation.plannedCheckInAt
        ? formatHotelDate(reservation.plannedCheckInAt)
        : todayStr;

      if (
        todayStr < reservationDateStr &&
        !input.dto?.allowEarlyCheckIn &&
        !input.dto?.confirmEarlyCheckIn
      ) {
        throw new ConflictException("EARLY_CHECK_IN_CONFIRMATION_REQUIRED");
      }

      if (
        todayStr > reservationDateStr &&
        !input.dto?.allowLateCheckIn &&
        !input.dto?.confirmLateCheckIn
      ) {
        throw new ConflictException("LATE_CHECK_IN_CONFIRMATION_REQUIRED");
      }

      if (
        (reservation.status !== ReservationStatus.ARRIVAL_READY &&
          reservation.status !== ReservationStatus.CONFIRMED) ||
        !reservation.roomId
      ) {
        throw new ConflictException("RESERVATION_NOT_READY_FOR_CHECK_IN");
      }

      await tx.$queryRawUnsafe(
        'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        reservation.roomId,
        input.hotelId,
      );
      const room = await tx.room.findFirst({
        where: { id: reservation.roomId, hotelId: input.hotelId },
        select: {
          id: true,
          status: true,
          price: true,
          roomType: { select: { id: true, name: true, maxOccupancy: true } },
        },
      });
      if (
        !room ||
        (room.status !== RoomStatus.AVAILABLE && room.status !== RoomStatus.RESERVED)
      ) {
        throw new ConflictException("ROOM_NOT_READY_FOR_CHECK_IN");
      }

      const [activeStayCount, blockingFolioCount] = await Promise.all([
        tx.guestStay.count({
          where: {
            hotelId: input.hotelId,
            roomId: room.id,
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
            roomId: room.id,
            status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
          },
        }),
      ]);
      if (activeStayCount > 0 || blockingFolioCount > 0) {
        throw new ConflictException("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO");
      }

      const qr = await tx.roomQRCode.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: room.id,
          status: { in: [RoomQRCodeStatus.INACTIVE, RoomQRCodeStatus.ACTIVE] },
        },
        orderBy: { version: "desc" },
      });
      if (!qr) {
        throw new BadRequestException("Phòng chưa có QR khả dụng để check-in.");
      }

      const occupiedRoom = await tx.room.updateMany({
        where: {
          id: room.id,
          hotelId: input.hotelId,
          status: room.status === RoomStatus.RESERVED ? RoomStatus.RESERVED : RoomStatus.AVAILABLE,
        },
        data: { status: RoomStatus.OCCUPIED },
      });
      if (occupiedRoom.count !== 1) {
        throw new ConflictException("ROOM_CHECK_IN_CONFLICT");
      }

      const stayRate =
        reservation.nightlyRateSnapshot !== null && reservation.nightlyRateSnapshot !== undefined
          ? reservation.nightlyRateSnapshot
          : room.price !== null && room.price !== undefined
            ? room.price
            : null;

      const primaryName =
        input.dto?.guestDisplayName?.trim() || reservation.guestDisplayName.trim();
      const primaryPhone = input.dto?.guestPhone?.trim() || reservation.guestPhone?.trim() || null;
      const plannedCheckOutAt = input.dto?.plannedCheckOutAt || reservation.plannedCheckOutAt;

      const primaryOccupant = {
        hotelId: input.hotelId,
        fullName: primaryName,
        phone: primaryPhone,
        identityNumber: input.dto?.guestIdentityNumber?.trim() || null,
        dateOfBirth: input.dto?.guestDateOfBirth?.trim() || null,
        gender: input.dto?.guestGender?.trim() || null,
        nationality: input.dto?.guestNationality?.trim() || null,
        residencePlace: input.dto?.guestResidencePlace?.trim() || null,
        citizenshipKind: inferCitizenshipKind({
          identityNumber: input.dto?.guestIdentityNumber,
          nationality: input.dto?.guestNationality,
        }),
        isPrimary: true,
      };

      const extraOccupants = (input.dto?.occupants ?? [])
        .filter(
          (occ) =>
            occ.fullName?.trim() &&
            !(
              occ.fullName.trim() === primaryName &&
              (!occ.identityNumber?.trim() ||
                occ.identityNumber?.trim() === (primaryOccupant.identityNumber ?? ""))
            ),
        )
        .map((occ) => ({
          hotelId: input.hotelId,
          fullName: occ.fullName.trim(),
          phone: occ.phone?.trim() || null,
          identityNumber: occ.identityNumber?.trim() || null,
          dateOfBirth: occ.dateOfBirth?.trim() || null,
          gender: occ.gender?.trim() || null,
          nationality: occ.nationality?.trim() || null,
          residencePlace: occ.residencePlace?.trim() || null,
          citizenshipKind: inferCitizenshipKind(occ),
          isPrimary: false,
        }));

      const totalOccupants = 1 + extraOccupants.length;
      const roomCapacity =
        (room.roomType as any)?.maxOccupancy ??
        (room as any)?.maxOccupancy ??
        (reservation.roomType as any)?.maxOccupancy;
      if (
        roomCapacity != null &&
        (totalOccupants > roomCapacity ||
          (reservation.guestCount != null && reservation.guestCount > roomCapacity))
      ) {
        throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
      }

      const stay = await tx.guestStay.create({
        data: {
          reservationId: reservation.id,
          hotelId: input.hotelId,
          roomId: room.id,
          reservationCode: reservation.reservationCode,
          guestDisplayName: primaryName,
          guestPhone: primaryPhone,
          guestIdentityNumber: primaryOccupant.identityNumber,
          guestDateOfBirth: primaryOccupant.dateOfBirth,
          guestGender: primaryOccupant.gender,
          guestNationality: primaryOccupant.nationality,
          guestResidencePlace: primaryOccupant.residencePlace,
          status: GuestStayStatus.ACTIVE,
          plannedCheckInAt: reservation.plannedCheckInAt,
          plannedCheckOutAt,
          nightlyRateSnapshot: stayRate,
          checkedInAt: now,
          activatedAt: now,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
          createdByUserId: input.actorUserId,
          occupants: {
            create: [primaryOccupant, ...extraOccupants],
          },
        },
      });

      const folioNumber = await input.generateFolioNumber(tx);
      const folio = await tx.folio.create({
        data: {
          hotelId: input.hotelId,
          stayId: stay.id,
          roomId: room.id,
          folioNumber,
          status: FolioStatus.OPEN,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.roomQRCode.updateMany({
        where: {
          roomId: room.id,
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
          expiresAt: null,
        },
      });

      const checkedInReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CHECKED_IN,
          checkedInAt: now,
          checkedInByUserId: input.actorUserId,
        },
      });

      await tx.domainEvent.create({
        data: {
          eventType: "GUEST_CHECKED_IN",
          aggregateType: "GuestStay",
          aggregateId: stay.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: { stayId: stay.id, roomId: room.id, actorUserId: input.actorUserId },
          status: DomainEventStatus.PENDING,
        },
      });
      await tx.domainEvent.create({
        data: {
          eventType: "ROOM_QR_ACTIVATED",
          aggregateType: "RoomQRCode",
          aggregateId: activeQr.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: { roomQrCodeId: activeQr.id, roomId: room.id, stayId: stay.id },
          status: DomainEventStatus.PENDING,
        },
      });

      if (tx.auditLog?.create) {
        let tenantId = input.tenantId;
        if (!tenantId && tx.hotel?.findUnique) {
          const hotel = await tx.hotel.findUnique({
            where: { id: input.hotelId },
            select: { tenantId: true },
          });
          tenantId = hotel?.tenantId ?? input.tenantId;
        }
        if (tenantId) {
          await tx.auditLog.create({
            data: {
              actorId: input.actorUserId,
              tenantId,
              action: "GUEST_CHECKED_IN",
              entityType: "GuestStay",
              entityId: stay.id,
              metadata: {
                stayId: stay.id,
                roomId: room.id,
                reservationId: reservation.id,
                checkedInAt: now.toISOString(),
                actorUserId: input.actorUserId,
              },
            },
          });
        }
      }

      return {
        idempotent: false,
        reservation: checkedInReservation,
        stay,
        folio,
        roomQrCode: activeQr,
      };
    }, "RESERVATION_CHECK_IN_CONCURRENCY_CONFLICT");
  }

  async cancelReservation(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    actorUserId: string;
    reason?: string;
  }) {
    return this.runSerializable(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.reservationId,
        input.hotelId,
      );
      const reservation = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
      });
      if (!reservation) {
        throw new NotFoundException("KhÃ´ng tÃ¬m tháº¥y Ä‘áº·t phÃ²ng");
      }
      if (reservation.status === ReservationStatus.CHECKED_IN) {
        throw new ConflictException("KhÃ´ng thá»ƒ há»§y Ä‘áº·t phÃ²ng Ä‘Ã£ check-in");
      }
      if (
        reservation.status === ReservationStatus.CANCELLED ||
        reservation.status === ReservationStatus.NO_SHOW
      ) {
        throw new ConflictException("Äáº·t phÃ²ng Ä‘Ã£ bá»‹ há»§y hoáº·c bÃ¡o váº¯ng máº·t");
      }
      if (
        reservation.status !== ReservationStatus.CONFIRMED &&
        reservation.status !== ReservationStatus.ARRIVAL_READY
      ) {
        throw new ConflictException("Tráº¡ng thÃ¡i Ä‘áº·t phÃ²ng khÃ´ng há»£p lá»‡ Ä‘á»ƒ há»§y");
      }

      const now = new Date();
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CANCELLED,
          roomId: null,
        },
        include: { room: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          tenantId: input.tenantId,
          action: "RESERVATION_CANCELLED",
          entityType: "Reservation",
          entityId: reservation.id,
          metadata: {
            cancelledAt: now.toISOString(),
            actorUserId: input.actorUserId,
            reason: input.reason ?? null,
            previousStatus: reservation.status,
            previousRoomId: reservation.roomId,
          },
        },
      });

      await tx.domainEvent.create({
        data: {
          eventType: "RESERVATION_CANCELLED",
          aggregateType: "Reservation",
          aggregateId: reservation.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: {
            reservationId: reservation.id,
            cancelledAt: now.toISOString(),
            actorUserId: input.actorUserId,
            reason: input.reason ?? null,
            previousStatus: reservation.status,
            previousRoomId: reservation.roomId,
          },
          status: DomainEventStatus.PENDING,
        },
      });

      return updatedReservation;
    }, "RESERVATION_CANCEL_CONCURRENCY_CONFLICT");
  }

  async markNoShow(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    actorUserId: string;
    reason?: string;
  }) {
    return this.runSerializable(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.reservationId,
        input.hotelId,
      );
      const reservation = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
      });
      if (!reservation) {
        throw new NotFoundException("KhÃ´ng tÃ¬m tháº¥y Ä‘áº·t phÃ²ng");
      }
      if (reservation.status === ReservationStatus.CHECKED_IN) {
        throw new ConflictException("KhÃ´ng thá»ƒ bÃ¡o váº¯ng máº·t Ä‘áº·t phÃ²ng Ä‘Ã£ check-in");
      }
      if (
        reservation.status === ReservationStatus.CANCELLED ||
        reservation.status === ReservationStatus.NO_SHOW
      ) {
        throw new ConflictException("Äáº·t phÃ²ng Ä‘Ã£ bá»‹ há»§y hoáº·c bÃ¡o váº¯ng máº·t");
      }
      if (
        reservation.status !== ReservationStatus.CONFIRMED &&
        reservation.status !== ReservationStatus.ARRIVAL_READY
      ) {
        throw new ConflictException("Tráº¡ng thÃ¡i Ä‘áº·t phÃ²ng khÃ´ng há»£p lá»‡ Ä‘á»ƒ bÃ¡o váº¯ng máº·t");
      }

      const now = new Date();
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.NO_SHOW,
          roomId: null,
        },
        include: { room: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          tenantId: input.tenantId,
          action: "RESERVATION_NO_SHOW",
          entityType: "Reservation",
          entityId: reservation.id,
          metadata: {
            noShowAt: now.toISOString(),
            actorUserId: input.actorUserId,
            reason: input.reason ?? null,
            previousStatus: reservation.status,
            previousRoomId: reservation.roomId,
          },
        },
      });

      await tx.domainEvent.create({
        data: {
          eventType: "RESERVATION_NO_SHOW",
          aggregateType: "Reservation",
          aggregateId: reservation.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: {
            reservationId: reservation.id,
            noShowAt: now.toISOString(),
            actorUserId: input.actorUserId,
            reason: input.reason ?? null,
            previousStatus: reservation.status,
            previousRoomId: reservation.roomId,
          },
          status: DomainEventStatus.PENDING,
        },
      });

      return updatedReservation;
    }, "RESERVATION_NO_SHOW_CONCURRENCY_CONFLICT");
  }

  async getRoomPlan(input: {
    hotelId: string;
    from: Date;
    to: Date;
    roomScopeIds?: string[] | null;
  }) {
    const whereRooms: Prisma.RoomWhereInput = {
      hotelId: input.hotelId,
      ...(input.roomScopeIds && input.roomScopeIds.length > 0
        ? { id: { in: input.roomScopeIds } }
        : {}),
    };

    const rooms = await this.prisma.room.findMany({
      where: whereRooms,
      select: {
        id: true,
        roomNumber: true,
        floor: true,
        roomTypeId: true,
        type: true,
        status: true,
        price: true,
        roomType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
    });

    const roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) {
      return {
        hotelId: input.hotelId,
        timezone: "Asia/Ho_Chi_Minh",
        from: input.from.toISOString().slice(0, 10),
        to: input.to.toISOString().slice(0, 10),
        rooms: [],
        blocks: [],
      };
    }

    const [reservations, stays] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          hotelId: input.hotelId,
          roomId: { in: roomIds },
          status: { in: ACTIVE_RESERVATION_STATUSES },
          plannedCheckInAt: { lte: input.to },
          plannedCheckOutAt: { gte: input.from },
        },
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
          stay: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { plannedCheckInAt: "asc" },
      }),
      this.prisma.guestStay.findMany({
        where: {
          hotelId: input.hotelId,
          roomId: { in: roomIds },
          status: { in: ACTIVE_STAY_STATUSES },
          plannedCheckInAt: { lte: input.to },
          plannedCheckOutAt: { gte: input.from },
        },
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
          occupants: {
            select: { id: true },
          },
        },
        orderBy: { plannedCheckInAt: "asc" },
      }),
    ]);

    const staysByResId = new Set(
      stays.map((s) => s.reservationId).filter((id): id is string => Boolean(id)),
    );

    const blocks: Array<{
      id: string;
      kind: "RESERVATION" | "STAY";
      reservationId: string | null;
      stayId: string | null;
      guestStayId: string | null;
      roomId: string;
      roomNumber: string;
      roomTypeId: string | null;
      roomTypeName: string | null;
      reservationCode: string | null;
      guestName: string;
      guestDisplayName: string;
      phone: string | null;
      guestPhone: string | null;
      guestCount: number;
      status: string;
      source: "OTA" | "DIRECT" | "UNKNOWN";
      channel: string;
      channelName: string | null;
      startDate: string;
      endDate: string;
      startAt: string;
      endAt: string;
      nights: number;
      nightlyRate: number | null;
      nightlyRateSnapshot: string | null;
      updatedAt: string;
      expectedUpdatedAt: string;
      movable: boolean;
    }> = [];

    for (const r of reservations) {
      if (r.roomId && !staysByResId.has(r.id)) {
        const isOta = Boolean(r.groupCode && r.groupCode.startsWith("OTA"));
        const channelName = isOta
          ? (r.groupCode?.replace(/^OTA-?/i, "").trim() || "OTA")
          : "Trực tiếp";
        const checkIn = r.plannedCheckInAt;
        const checkOut = r.plannedCheckOutAt;
        const nights = Math.max(
          1,
          Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
        );
        const nightlyRate = r.nightlyRateSnapshot
          ? Number(r.nightlyRateSnapshot)
          : r.room?.price
            ? Number(r.room.price)
            : null;

        blocks.push({
          id: `res-${r.id}`,
          kind: "RESERVATION",
          reservationId: r.id,
          stayId: null,
          guestStayId: null,
          roomId: r.roomId,
          roomNumber: r.room?.roomNumber ?? "",
          roomTypeId: r.room?.roomTypeId ?? null,
          roomTypeName: r.room?.roomType?.name ?? r.room?.type ?? null,
          reservationCode: r.reservationCode,
          guestName: r.guestDisplayName,
          guestDisplayName: r.guestDisplayName,
          phone: r.guestPhone,
          guestPhone: r.guestPhone,
          guestCount: 1,
          status: r.status,
          source: isOta ? "OTA" : "DIRECT",
          channel: channelName,
          channelName,
          startDate: checkIn.toISOString().slice(0, 10),
          endDate: checkOut.toISOString().slice(0, 10),
          startAt: checkIn.toISOString(),
          endAt: checkOut.toISOString(),
          nights,
          nightlyRate,
          nightlyRateSnapshot: r.nightlyRateSnapshot ? r.nightlyRateSnapshot.toString() : null,
          updatedAt: r.updatedAt.toISOString(),
          expectedUpdatedAt: r.updatedAt.toISOString(),
          movable: ACTIVE_RESERVATION_STATUSES.includes(r.status),
        });
      }
    }

    for (const s of stays) {
      const checkIn = s.checkedInAt ?? s.plannedCheckInAt;
      const checkOut = s.plannedCheckOutAt;
      const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const isOta = Boolean(s.reservationCode?.startsWith("OTA"));
      const channelName = isOta
        ? (s.reservationCode?.replace(/^OTA-?/i, "").trim() || "OTA")
        : "Trực tiếp";
      const nightlyRate = s.nightlyRateSnapshot
        ? Number(s.nightlyRateSnapshot)
        : s.room?.price
          ? Number(s.room.price)
          : null;
      const guestCount = 1 + (s.occupants?.length ?? 0);

      blocks.push({
        id: `stay-${s.id}`,
        kind: "STAY",
        reservationId: s.reservationId,
        stayId: s.id,
        guestStayId: s.id,
        roomId: s.roomId,
        roomNumber: s.room?.roomNumber ?? "",
        roomTypeId: s.room?.roomTypeId ?? null,
        roomTypeName: s.room?.roomType?.name ?? s.room?.type ?? null,
        reservationCode: s.reservationCode,
        guestName: s.guestDisplayName,
        guestDisplayName: s.guestDisplayName,
        phone: s.guestPhone,
        guestPhone: s.guestPhone,
        guestCount,
        status: s.status,
        source: isOta ? "OTA" : "DIRECT",
        channel: channelName,
        channelName,
        startDate: checkIn.toISOString().slice(0, 10),
        endDate: checkOut.toISOString().slice(0, 10),
        startAt: checkIn.toISOString(),
        endAt: checkOut.toISOString(),
        nights,
        nightlyRate,
        nightlyRateSnapshot: s.nightlyRateSnapshot ? s.nightlyRateSnapshot.toString() : null,
        updatedAt: s.updatedAt.toISOString(),
        expectedUpdatedAt: s.updatedAt.toISOString(),
        movable: false,
      });
    }

    return {
      hotelId: input.hotelId,
      timezone: "Asia/Ho_Chi_Minh",
      from: input.from.toISOString().slice(0, 10),
      to: input.to.toISOString().slice(0, 10),
      rooms: rooms.map((r) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor,
        roomTypeId: r.roomTypeId,
        roomTypeName: r.roomType?.name ?? r.type ?? null,
        status: r.status,
        price: r.price ? Number(r.price) : null,
      })),
      blocks,
    };
  }

  async updateReservationPlacement(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    targetRoomId: string;
    expectedUpdatedAt: string;
    swapWithReservationId?: string;
    swapExpectedUpdatedAt?: string;
    actorUserId: string;
  }) {
    return this.runSerializable(async (tx) => {
      const mode = input.swapWithReservationId ? "SWAP" : "MOVE";
      const resIds = [input.reservationId, input.swapWithReservationId]
        .filter((id): id is string => Boolean(id))
        .sort();

      for (const id of resIds) {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          id,
          input.hotelId,
        );
      }

      const sourceRes = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { room: true },
      });
      if (!sourceRes) {
        throw new NotFoundException("KhÃ´ng tÃ¬m tháº¥y Ä‘áº·t phÃ²ng");
      }

      if (sourceRes.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ConflictException("Dá»¯ liá»‡u Ä‘áº·t phÃ²ng Ä‘Ã£ thay Ä‘á»•i, vui lÃ²ng lÃ m má»›i");
      }

      if (!ACTIVE_RESERVATION_STATUSES.includes(sourceRes.status)) {
        throw new ConflictException("Chá»‰ cÃ³ thá»ƒ chuyá»ƒn Ä‘áº·t phÃ²ng chÆ°a nháº­n phÃ²ng");
      }

      if (!sourceRes.roomId) {
        throw new BadRequestException("Äáº·t phÃ²ng chÆ°a cÃ³ phÃ²ng Ä‘Æ°á»£c gÃ¡n trÆ°á»›c Ä‘Ã³");
      }
      const sourceRoomId = sourceRes.roomId;

      const sourceStay = await tx.guestStay.findFirst({
        where: {
          reservationId: sourceRes.id,
          status: { in: ACTIVE_STAY_STATUSES },
        },
        select: { id: true },
      });
      if (sourceStay) {
        throw new ConflictException("KhÃ´ng thá»ƒ chuyá»ƒn Ä‘áº·t phÃ²ng Ä‘Ã£ cÃ³ lÆ°á»£t lÆ°u trÃº Ä‘ang hoáº¡t Ä‘á»™ng");
      }

      let swapRes: any = null;
      if (input.swapWithReservationId) {
        swapRes = await tx.reservation.findFirst({
          where: { id: input.swapWithReservationId, hotelId: input.hotelId },
          include: { room: true },
        });
        if (!swapRes) {
          throw new NotFoundException("KhÃ´ng tÃ¬m tháº¥y Ä‘áº·t phÃ²ng Ä‘á»‘i á»©ng");
        }
        if (
          input.swapExpectedUpdatedAt &&
          swapRes.updatedAt.toISOString() !== input.swapExpectedUpdatedAt
        ) {
          throw new ConflictException("Dá»¯ liá»‡u Ä‘áº·t phÃ²ng Ä‘á»‘i á»©ng Ä‘Ã£ thay Ä‘á»•i, vui lÃ²ng lÃ m má»›i");
        }
        if (!ACTIVE_RESERVATION_STATUSES.includes(swapRes.status)) {
          throw new ConflictException("Chá»‰ cÃ³ thá»ƒ trÃ¡o Ä‘á»•i Ä‘áº·t phÃ²ng chÆ°a nháº­n phÃ²ng");
        }
        if (!swapRes.roomId) {
          throw new BadRequestException("Äáº·t phÃ²ng Ä‘á»‘i á»©ng chÆ°a cÃ³ phÃ²ng Ä‘Æ°á»£c gÃ¡n");
        }

        const swapStay = await tx.guestStay.findFirst({
          where: {
            reservationId: swapRes.id,
            status: { in: ACTIVE_STAY_STATUSES },
          },
          select: { id: true },
        });
        if (swapStay) {
          throw new ConflictException("KhÃ´ng thá»ƒ trÃ¡o Ä‘áº·t phÃ²ng Ä‘Ã£ cÃ³ lÆ°á»£t lÆ°u trÃº Ä‘ang hoáº¡t Ä‘á»™ng");
        }
      }

      const roomIds = Array.from(new Set([sourceRoomId, input.targetRoomId])).sort();
      for (const rId of roomIds) {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          rId,
          input.hotelId,
        );
      }

      const [sourceRoom, targetRoom] = await Promise.all([
        tx.room.findFirst({
          where: { id: sourceRoomId, hotelId: input.hotelId },
          include: { roomType: true },
        }),
        tx.room.findFirst({
          where: { id: input.targetRoomId, hotelId: input.hotelId },
          include: { roomType: true },
        }),
      ]);

      if (!sourceRoom || !targetRoom) {
        throw new NotFoundException("KhÃ´ng tÃ¬m tháº¥y phÃ²ng tÆ°Æ¡ng á»©ng");
      }

      if (NON_SELLABLE_ROOM_STATUSES.includes(targetRoom.status)) {
        throw new ConflictException("PhÃ²ng Ä‘Ã­ch Ä‘ang á»Ÿ tráº¡ng thÃ¡i khÃ´ng thá»ƒ sá»­ dá»¥ng");
      }

      const sameType =
        (sourceRoom.roomTypeId &&
          targetRoom.roomTypeId &&
          sourceRoom.roomTypeId === targetRoom.roomTypeId) ||
        (sourceRoom.type && targetRoom.type && sourceRoom.type === targetRoom.type);

      if (!sameType) {
        throw new ConflictException("Chá»‰ Ä‘Æ°á»£c chuyá»ƒn hoáº·c trÃ¡o giá»¯a cÃ¡c phÃ²ng cÃ¹ng loáº¡i");
      }

      const now = new Date();

      if (mode === "MOVE") {
        const stayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.targetRoomId,
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: sourceRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: sourceRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (stayOverlap) {
          throw new ConflictException("PhÃ²ng Ä‘Ã£ cÃ³ khÃ¡ch lÆ°u trÃº trong khoáº£ng thá»i gian nÃ y");
        }

        const resOverlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.targetRoomId,
            id: { not: sourceRes.id },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: sourceRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: sourceRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (resOverlap) {
          throw new ConflictException("PhÃ²ng Ä‘Ã£ cÃ³ Ä‘áº·t phÃ²ng khÃ¡c trong khoáº£ng thá»i gian nÃ y");
        }

        const updatedSource = await tx.reservation.update({
          where: { id: sourceRes.id },
          data: {
            roomId: input.targetRoomId,
            assignedAt: now,
            assignedByUserId: input.actorUserId,
          },
          include: { room: true },
        });

        await tx.auditLog.create({
          data: {
            actorId: input.actorUserId,
            tenantId: input.tenantId,
            action: "RESERVATION_PLACEMENT_MOVE",
            entityType: "Reservation",
            entityId: sourceRes.id,
            metadata: {
              mode: "MOVE",
              reservationId: sourceRes.id,
              previousRoomId: sourceRoomId,
              targetRoomId: input.targetRoomId,
            },
          },
        });

        return {
          mode: "MOVE" as const,
          reservations: [updatedSource],
        };
      } else {
        const sourceStayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: sourceRoomId,
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: swapRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: swapRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (sourceStayOverlap) {
          throw new ConflictException(
            "PhÃ²ng nguá»“n Ä‘Ã£ cÃ³ khÃ¡ch lÆ°u trÃº trÃ¹ng vá»›i lá»‹ch cá»§a Ä‘áº·t phÃ²ng Ä‘á»‘i á»©ng",
          );
        }

        const targetStayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.targetRoomId,
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: sourceRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: sourceRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (targetStayOverlap) {
          throw new ConflictException(
            "PhÃ²ng Ä‘Ã­ch Ä‘Ã£ cÃ³ khÃ¡ch lÆ°u trÃº trÃ¹ng vá»›i lá»‹ch cá»§a Ä‘áº·t phÃ²ng nguá»“n",
          );
        }

        const sourceResOverlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: sourceRoomId,
            id: { notIn: [sourceRes.id, swapRes.id] },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: swapRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: swapRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (sourceResOverlap) {
          throw new ConflictException("Xung Ä‘á»™t lá»‹ch Ä‘áº·t phÃ²ng táº¡i phÃ²ng nguá»“n khi trÃ¡o Ä‘á»•i");
        }

        const targetResOverlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.targetRoomId,
            id: { notIn: [sourceRes.id, swapRes.id] },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: sourceRes.plannedCheckOutAt },
            plannedCheckOutAt: { gt: sourceRes.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (targetResOverlap) {
          throw new ConflictException("Xung Ä‘á»™t lá»‹ch Ä‘áº·t phÃ²ng táº¡i phÃ²ng Ä‘Ã­ch khi trÃ¡o Ä‘á»•i");
        }

        const [updatedSource, updatedSwap] = await Promise.all([
          tx.reservation.update({
            where: { id: sourceRes.id },
            data: {
              roomId: input.targetRoomId,
              assignedAt: now,
              assignedByUserId: input.actorUserId,
            },
            include: { room: true },
          }),
          tx.reservation.update({
            where: { id: swapRes.id },
            data: {
              roomId: sourceRoomId,
              assignedAt: now,
              assignedByUserId: input.actorUserId,
            },
            include: { room: true },
          }),
        ]);

        await tx.auditLog.create({
          data: {
            actorId: input.actorUserId,
            tenantId: input.tenantId,
            action: "RESERVATION_PLACEMENT_SWAP",
            entityType: "Reservation",
            entityId: sourceRes.id,
            metadata: {
              mode: "SWAP",
              reservationId: sourceRes.id,
              previousRoomId: sourceRoomId,
              newRoomId: input.targetRoomId,
              swapWithReservationId: swapRes.id,
              swapPreviousRoomId: swapRes.roomId,
              swapNewRoomId: sourceRoomId,
            },
          },
        });

        return {
          mode: "SWAP" as const,
          reservations: [updatedSource, updatedSwap],
        };
      }
    }, "RESERVATION_PLACEMENT_CONCURRENCY_CONFLICT");
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    conflictCode: string,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableConcurrencyError(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw new ConflictException(conflictCode);
        }
      }
    }
    throw new ConflictException(conflictCode);
  }

  private isRetryableConcurrencyError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === "P2034") return true;
    if (error.code !== "P2002") return false;

    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((field): field is string => typeof field === "string")
      : typeof target === "string"
        ? [target]
        : [];
    return fields.some((field) => field.includes("reservationId") || field.includes("folioNumber"));
  }
}
