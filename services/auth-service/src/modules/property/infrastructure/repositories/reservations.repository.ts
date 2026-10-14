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

  async createReservation(input: {
    hotelId: string;
    reservationCode: string;
    guestDisplayName: string;
    guestPhone?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    createdByUserId: string;
    roomId?: string | null;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
  }) {
    if (input.roomId) {
      const roomId = input.roomId;
      return this.runSerializable(async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          roomId,
          input.hotelId,
        );
        const room = await tx.room.findFirst({
          where: { id: roomId, hotelId: input.hotelId },
          select: { id: true, status: true, price: true },
        });
        if (!room) {
          throw new NotFoundException("Không tìm thấy phòng");
        }
        if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
          throw new ConflictException("ROOM_NOT_AVAILABLE");
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
          include: { room: true },
        });
      }, "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
    }

    return this.prisma.reservation.create({
      data: {
        hotelId: input.hotelId,
        roomId: null,
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
    });
  }

  async findReservationById(hotelId: string, reservationId: string) {
    return this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId },
      select: { id: true, hotelId: true, roomId: true, status: true },
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
      if (!reservation) return null;
      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
        throw new ConflictException("RESERVATION_NOT_ASSIGNABLE");
      }

      await tx.$queryRawUnsafe(
        'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.roomId,
        input.hotelId,
      );
      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: { id: true, status: true, price: true },
      });
      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng");
      }
      if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
        throw new ConflictException("ROOM_NOT_AVAILABLE");
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

      const stayOverlap = tx.guestStay?.findFirst
        ? await tx.guestStay.findFirst({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: { in: ACTIVE_STAY_STATUSES },
              ...(reservation.id ? { reservationId: { not: reservation.id } } : {}),
              plannedCheckInAt: { lt: reservation.plannedCheckOutAt },
              plannedCheckOutAt: { gt: reservation.plannedCheckInAt },
            },
            select: { id: true },
          })
        : null;
      if (stayOverlap) {
        throw new ConflictException("ROOM_RESERVATION_OVERLAP");
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
        include: { room: true },
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
  }) {
    return this.runSerializable(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        input.reservationId,
        input.hotelId,
      );
      const reservation = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { hotel: { select: { timezone: true } } },
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

      const now = new Date();
      const todayStr = formatHotelDate(now);
      const reservationDateStr = formatHotelDate(reservation.plannedCheckInAt);
      if (todayStr < reservationDateStr) {
        throw new ConflictException("EARLY_CHECK_IN_NOT_ALLOWED");
      }

      if (reservation.status !== ReservationStatus.ARRIVAL_READY || !reservation.roomId) {
        throw new ConflictException("RESERVATION_NOT_READY_FOR_CHECK_IN");
      }

      await tx.$queryRawUnsafe(
        'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        reservation.roomId,
        input.hotelId,
      );
      const room = await tx.room.findFirst({
        where: { id: reservation.roomId, hotelId: input.hotelId },
        select: { id: true, status: true, price: true },
      });
      if (!room || room.status !== RoomStatus.AVAILABLE) {
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
        where: { id: room.id, hotelId: input.hotelId, status: RoomStatus.AVAILABLE },
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

      const stay = await tx.guestStay.create({
        data: {
          reservationId: reservation.id,
          hotelId: input.hotelId,
          roomId: room.id,
          reservationCode: reservation.reservationCode,
          guestDisplayName: reservation.guestDisplayName,
          guestPhone: reservation.guestPhone,
          status: GuestStayStatus.ACTIVE,
          plannedCheckInAt: reservation.plannedCheckInAt,
          plannedCheckOutAt: reservation.plannedCheckOutAt,
          nightlyRateSnapshot: stayRate,
          checkedInAt: now,
          activatedAt: now,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
          createdByUserId: input.actorUserId,
          occupants: {
            create: [
              {
                hotelId: input.hotelId,
                fullName: reservation.guestDisplayName.trim(),
                phone: reservation.guestPhone?.trim(),
                citizenshipKind: "VIETNAMESE",
                isPrimary: true,
              },
            ],
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

      return {
        idempotent: false,
        reservation: checkedInReservation,
        stay,
        folio,
        roomQrCode: activeQr,
      };
    }, "RESERVATION_CHECK_IN_CONCURRENCY_CONFLICT");
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
