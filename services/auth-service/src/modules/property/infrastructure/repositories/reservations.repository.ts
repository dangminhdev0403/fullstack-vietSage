import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BookingPaymentStatus,
  DomainEventStatus,
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  GuestStayStatus,
  Prisma,
  ReservationChargeLineType,
  ReservationStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import {
  addDaysYmd,
  diffCalendarDays,
  resolveTimeZone,
  toYmd,
  VIETNAM_TIME_ZONE,
} from "../../../../common/time/vietnam-temporal";
import { generateOpaqueToken } from "../../../../common/security/token-hash.util";
import { PrismaService } from "../../../../prisma/prisma.service";
import type {
  CheckInReservationBodyInput,
  UpdateGroupReservationBodyInput,
} from "../../domain/schemas/reservations.schema";
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
  GuestStayStatus.RESERVED,
];

const ACTIVE_IN_HOUSE_STAY_STATUSES: GuestStayStatus[] = [
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
    reservationCode?: string;
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
    allowedRoomId?: string | null;
    assertRoomAccess?: (roomId: string) => void | Promise<void>;
    chargeLines?: any[];
    sourceCategory?: any;
    sourcePartnerId?: string | null;
    bookingOwnerUserId?: string | null;
  }) {
    return this.runSerializable(async (tx) => {
      let resolvedRoomIds = input.roomIds ? [...input.roomIds] : [];
      const allocatedRoomRates = new Map<string, Prisma.Decimal | number | string | null>();
      if (input.allocations && input.allocations.length > 0) {
        if (!input.roomAllocationService) {
          throw new BadRequestException("Dịch vụ tự động phân bổ phòng không khả dụng");
        }
        for (const alloc of input.allocations) {
          const allocRate = alloc.rate !== undefined ? alloc.rate : alloc.nightlyRateSnapshot;
          for (let i = 0; i < alloc.quantity; i++) {
            try {
              const allocationPayload: any = {
                hotelId: input.hotelId,
                roomTypeId: alloc.roomTypeId,
                interval: { checkInAt: input.checkInDate, checkOutAt: input.checkOutDate },
                excludedRoomIds: resolvedRoomIds,
                mode: input.allowedRoomId ? "manual" : "auto",
                ...(input.allowedRoomId ? { requestedRoomId: input.allowedRoomId } : {}),
              };
              const allocated = await input.roomAllocationService.allocateRoom(tx, allocationPayload);
              if (input.assertRoomAccess) {
                await input.assertRoomAccess(allocated.roomId);
              }
              resolvedRoomIds.push(allocated.roomId);
              if (allocRate !== undefined) {
                allocatedRoomRates.set(allocated.roomId, allocRate);
              }
            } catch (err) {
              if (err instanceof ConflictException && err.message === "NO_AVAILABLE_ROOM") {
                throw new ConflictException(
                  `Không đủ phòng trống thuộc loại đã chọn trong khoảng thời gian này (đã gán ${i}/${alloc.quantity} phòng). Vui lòng giảm số lượng hoặc chọn ngày khác.`,
                );
              }
              throw err;
            }
          }
        }
      }

      const uniqueRoomIds = Array.from(new Set(resolvedRoomIds));
      if (uniqueRoomIds.length < 1 || uniqueRoomIds.length > 50) {
        throw new BadRequestException("Số lượng phòng đặt phải từ 1 đến 50 phòng");
      }

      // Sorted locking to eliminate deadlock risks across concurrent transactions
      const sortedRoomIds = [...uniqueRoomIds].sort();

      for (const roomId of sortedRoomIds) {
        if (input.assertRoomAccess) {
          await input.assertRoomAccess(roomId);
        }
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          roomId,
          input.hotelId,
        );
      }

      const rooms = await tx.room.findMany({
        where: { id: { in: sortedRoomIds }, hotelId: input.hotelId },
        select: {
          id: true,
          status: true,
          price: true,
          roomNumber: true,
          roomTypeId: true,
          type: true,
          roomType: { select: { id: true, name: true } },
        },
      });

      if (rooms.length !== sortedRoomIds.length) {
        throw new NotFoundException("Má»™t hoáº·c nhiá»u phÃ²ng khÃ´ng tá»“n táº¡i trong khÃ¡ch sáº¡n");
      }

      const nonSellableRooms = rooms.filter((room) =>
        NON_SELLABLE_ROOM_STATUSES.includes(room.status),
      );
      if (nonSellableRooms.length > 0) {
        const unavailableRoomIds = nonSellableRooms.map((r) => r.id);
        const roomNumbersLabel = nonSellableRooms
          .map((r) => (r.roomNumber ? `P.${r.roomNumber}` : null))
          .filter(Boolean)
          .join(", ");

        throw new ConflictException({
          message: "ROOM_NOT_AVAILABLE",
          code: "ROOM_NOT_AVAILABLE",
          detail: roomNumbersLabel
            ? `Các phòng sau hiện đang bảo trì hoặc khóa: ${roomNumbersLabel}.`
            : "Một hoặc nhiều phòng không khả dụng để đặt phòng.",
          conflictRoomIds: unavailableRoomIds,
          unavailableRoomIds,
        });
      }

      // Check overlapping active reservations [checkInDate, checkOutDate)
      // Cancelled reservations release inventory and are not in ACTIVE_RESERVATION_STATUSES
      let conflictingReservations: Array<{ id: string; roomId: string | null }> = [];
      if (tx.reservation.findMany) {
        conflictingReservations = await tx.reservation.findMany({
          where: {
            hotelId: input.hotelId,
            roomId: { in: sortedRoomIds },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: input.checkOutDate },
            plannedCheckOutAt: { gt: input.checkInDate },
          },
          select: { id: true, roomId: true },
        });
      } else if (tx.reservation.findFirst) {
        const first = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: { in: sortedRoomIds },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: input.checkOutDate },
            plannedCheckOutAt: { gt: input.checkInDate },
          },
          select: { id: true, roomId: true },
        });
        if (first) conflictingReservations = [first];
      }

      // Check overlapping active stays [checkInDate, checkOutDate)
      let conflictingStays: Array<{ id: string; roomId: string | null }> = [];
      if (tx.guestStay?.findMany) {
        conflictingStays = await tx.guestStay.findMany({
          where: {
            hotelId: input.hotelId,
            roomId: { in: sortedRoomIds },
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: input.checkOutDate },
            plannedCheckOutAt: { gt: input.checkInDate },
          },
          select: { id: true, roomId: true },
        });
      } else if (tx.guestStay?.findFirst) {
        const first = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: { in: sortedRoomIds },
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: input.checkOutDate },
            plannedCheckOutAt: { gt: input.checkInDate },
          },
          select: { id: true, roomId: true },
        });
        if (first) conflictingStays = [first];
      }

      let overdueStays: Array<{ id: string; roomId: string | null }> = [];
      const now = new Date();
      if (input.checkInDate <= now && tx.guestStay) {
        if (tx.guestStay.findMany) {
          overdueStays = await tx.guestStay.findMany({
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
        } else if (tx.guestStay.findFirst) {
          const first = await tx.guestStay.findFirst({
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
          if (first) overdueStays = [first];
        }
      }

      const allConflictRoomIds = Array.from(
        new Set([
          ...conflictingReservations.map((r) => r.roomId).filter((id): id is string => Boolean(id)),
          ...conflictingStays.map((s) => s.roomId).filter((id): id is string => Boolean(id)),
          ...overdueStays.map((s) => s.roomId).filter((id): id is string => Boolean(id)),
        ]),
      );

      if (allConflictRoomIds.length > 0) {
        const conflictRoomNumbers = allConflictRoomIds
          .map((id) => {
            const found = rooms.find((r) => r.id === id);
            return found?.roomNumber ? `P.${found.roomNumber}` : null;
          })
          .filter(Boolean);

        const roomNumbersLabel = conflictRoomNumbers.length > 0 ? conflictRoomNumbers.join(", ") : "";

        throw new ConflictException({
          message: "ROOM_RESERVATION_OVERLAP",
          code: "ROOM_RESERVATION_OVERLAP",
          detail: roomNumbersLabel
            ? `Các phòng sau đã có lịch đặt hoặc khách lưu trú trong khoảng thời gian này: ${roomNumbersLabel}.`
            : "Một số phòng đã chọn bị trùng lịch trong khoảng thời gian này.",
          conflictRoomIds: allConflictRoomIds,
          unavailableRoomIds: allConflictRoomIds,
        });
      }

      const reservations: any[] = [];

      for (const roomId of uniqueRoomIds) {
        const reservationCode =
          input.reservationCode?.trim() || (await input.generateReservationCode(tx));
        const room = rooms.find((candidate) => candidate.id === roomId)!;
        const specificRate = input.roomRates?.[roomId] ?? allocatedRoomRates.get(roomId);
        const effectiveRaw =
          specificRate !== undefined
            ? specificRate
            : input.nightlyRateSnapshot !== undefined
              ? input.nightlyRateSnapshot
              : room.price;

        const nightlyRateSnapshot =
          effectiveRaw !== undefined && effectiveRaw !== null
            ? new Prisma.Decimal(effectiveRaw).toFixed(2)
            : null;

        const reservationData: any = {
          hotelId: input.hotelId,
          roomId,
          roomTypeId: room.roomTypeId ?? null,
          roomTypeSnapshot: (room as any).roomType?.name ?? (room as any).type ?? null,
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
          baseNightlyRateSnapshot: room.price,
          nightlyRateSnapshot,
          sourceCategory: (input.sourceCategory === "TA" ? "TRAVEL_AGENCY" : input.sourceCategory) ?? undefined,
          sourcePartnerId: input.sourcePartnerId ?? undefined,
          bookingOwnerUserId: input.bookingOwnerUserId?.trim() || input.createdByUserId || undefined,
        };

        const reservation = await (tx.reservation.create as any)({
          data: reservationData,
          include: { room: true },
        });

        const activeChargeLines: any[] = input.chargeLines ?? [];
        // Only attach group-level extra services to the lead reservation so charges are not multiplied per room!
        const isLeadReservation = reservations.length === 0;
        const linesForThisRoom = activeChargeLines.filter((line: any) => {
          if (line.lineType === "ROOM_NIGHT") return true;
          return isLeadReservation;
        });

        if (linesForThisRoom.length > 0 && tx.reservationChargeLine) {
          await tx.reservationChargeLine.createMany({
            data: linesForThisRoom.map((line: any) => ({
              hotelId: input.hotelId,
              reservationId: reservation.id,
              lineType: line.lineType,
              serviceDate: line.serviceDate ? new Date(line.serviceDate) : null,
              serviceItemId: line.serviceItemId || null,
              nameSnapshot: line.nameSnapshot,
              codeSnapshot: line.codeSnapshot || null,
              quantity: line.quantity || 1,
              unitPriceSnapshot: new Prisma.Decimal(line.unitPriceSnapshot || 0),
              taxAmountSnapshot: new Prisma.Decimal(line.taxAmountSnapshot || 0),
              discountAmountSnapshot: new Prisma.Decimal(line.discountAmountSnapshot || 0),
              totalSnapshot: new Prisma.Decimal(line.totalSnapshot || 0),
              currency: line.currency || "VND",
            })),
          });
        }

        reservations.push(reservation);
      }

      if (tx.reservationGroup?.upsert) {
        await tx.reservationGroup.upsert({
          where: {
            hotelId_groupCode: { hotelId: input.hotelId, groupCode: input.groupCode },
          },
          update: {
            leadGuestName: input.leadGuestName,
            leadGuestPhone: input.leadGuestPhone || null,
            sourceCategory: (input.sourceCategory === "TA" ? "TRAVEL_AGENCY" : input.sourceCategory) ?? undefined,
            sourcePartnerId: input.sourcePartnerId ?? undefined,
            bookingOwnerUserId: input.bookingOwnerUserId?.trim() || input.createdByUserId || undefined,
          },
          create: {
            hotelId: input.hotelId,
            groupCode: input.groupCode,
            leadGuestName: input.leadGuestName,
            leadGuestPhone: input.leadGuestPhone || null,
            sourceCategory: (input.sourceCategory === "TA" ? "TRAVEL_AGENCY" : input.sourceCategory) ?? undefined,
            sourcePartnerId: input.sourcePartnerId ?? undefined,
            bookingOwnerUserId: input.bookingOwnerUserId?.trim() || input.createdByUserId || undefined,
          },
        });
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
    groupCode?: string | null;
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
    allowedRoomId?: string | null;
    assertRoomAccess?: (roomId: string) => void | Promise<void>;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    chargeLines?: any[];
    sourceCategory?: any;
    sourcePartnerId?: string | null;
    bookingOwnerUserId?: string | null;
  }) {
    if (input.roomId || ((input.autoAssign || input.roomTypeId) && input.roomAllocationService)) {
      return this.runSerializable(async (tx) => {
        let roomId = input.roomId;
        if (!roomId && (input.autoAssign || input.roomTypeId) && input.roomAllocationService) {
          const allocationPayload: any = {
            hotelId: input.hotelId,
            roomTypeId: input.roomTypeId ?? undefined,
            interval: { checkInAt: input.plannedCheckInAt, checkOutAt: input.plannedCheckOutAt },
            guestCount: input.guestCount,
            mode: input.allowedRoomId ? "manual" : "auto",
            ...(input.allowedRoomId ? { requestedRoomId: input.allowedRoomId } : {}),
          };
          const allocated = await input.roomAllocationService.allocateRoom(tx, allocationPayload);
          roomId = allocated.roomId;
        }

        if (!roomId) {
          throw new BadRequestException("Không thể xác định phòng");
        }

        if (input.assertRoomAccess) {
          await input.assertRoomAccess(roomId);
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

        const effectiveBaseRate = room.price ?? (room as any)?.roomType?.basePrice ?? null;
        const effectiveNightlyRate =
          input.nightlyRateSnapshot !== undefined && input.nightlyRateSnapshot !== null
            ? (input.nightlyRateSnapshot instanceof Prisma.Decimal
                ? input.nightlyRateSnapshot
                : new Prisma.Decimal(input.nightlyRateSnapshot))
            : effectiveBaseRate;

        const reservation = await tx.reservation.create({
          data: {
            hotelId: input.hotelId,
            roomId,
            roomTypeId: input.roomTypeId ?? room.roomTypeId ?? null,
            guestCount: input.guestCount ?? null,
            notes: input.notes ?? null,
            reservationCode: input.reservationCode,
            groupCode: input.groupCode ?? undefined,
            guestDisplayName: input.guestDisplayName,
            guestPhone: input.guestPhone,
            plannedCheckInAt: input.plannedCheckInAt,
            plannedCheckOutAt: input.plannedCheckOutAt,
            createdByUserId: input.createdByUserId,
            status: ReservationStatus.ARRIVAL_READY,
            assignedAt: new Date(),
            assignedByUserId: input.createdByUserId,
            baseNightlyRateSnapshot: effectiveBaseRate,
            nightlyRateSnapshot: effectiveNightlyRate,
            sourceCategory: (input.sourceCategory === "TA" ? "TRAVEL_AGENCY" : input.sourceCategory) ?? undefined,
            sourcePartnerId: input.sourcePartnerId ?? undefined,
            bookingOwnerUserId: input.bookingOwnerUserId?.trim() || input.createdByUserId || undefined,
          },
          include: { room: true, roomType: true },
        });

        const activeChargeLines: any[] = input.chargeLines ?? [];
        if (activeChargeLines.length > 0 && tx.reservationChargeLine) {
          await tx.reservationChargeLine.createMany({
            data: activeChargeLines.map((line: any) => ({
              hotelId: input.hotelId,
              reservationId: reservation.id,
              lineType: line.lineType,
              serviceDate: line.serviceDate ? new Date(line.serviceDate) : null,
              serviceItemId: line.serviceItemId || null,
              nameSnapshot: line.nameSnapshot,
              codeSnapshot: line.codeSnapshot || null,
              quantity: line.quantity || 1,
              unitPriceSnapshot: new Prisma.Decimal(line.unitPriceSnapshot || 0),
              taxAmountSnapshot: new Prisma.Decimal(line.taxAmountSnapshot || 0),
              discountAmountSnapshot: new Prisma.Decimal(line.discountAmountSnapshot || 0),
              totalSnapshot: new Prisma.Decimal(line.totalSnapshot || 0),
              currency: line.currency || "VND",
            })),
          });
        } else if (tx.reservationChargeLine && effectiveNightlyRate !== null && effectiveNightlyRate !== undefined) {
          const hotel = await tx.hotel.findUnique({
            where: { id: input.hotelId },
            select: { timezone: true },
          });
          const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
          const nights = Math.max(1, diffCalendarDays(input.plannedCheckInAt, input.plannedCheckOutAt, tz));
          const linesData: any[] = [];
          const rateDec = new Prisma.Decimal(effectiveNightlyRate);
          for (let i = 0; i < nights; i++) {
            const ymd = addDaysYmd(toYmd(input.plannedCheckInAt, tz), i);
            linesData.push({
              hotelId: input.hotelId,
              reservationId: reservation.id,
              lineType: ReservationChargeLineType.ROOM_NIGHT,
              serviceDate: new Date(`${ymd}T14:00:00+07:00`),
              nameSnapshot: `Tiền phòng đêm ${ymd}`,
              quantity: 1,
              unitPriceSnapshot: rateDec,
              taxAmountSnapshot: new Prisma.Decimal(0),
              discountAmountSnapshot: new Prisma.Decimal(0),
              totalSnapshot: rateDec,
              currency: "VND",
            });
          }
          await tx.reservationChargeLine.createMany({ data: linesData });
        }

        return reservation;
      }, "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
    }

    return this.prisma.$transaction(async (tx) => {
      let defaultBaseRate: Prisma.Decimal | null = null;
      if (input.roomTypeId && tx.roomType?.findFirst) {
        const rt = await tx.roomType.findFirst({
          where: { id: input.roomTypeId, hotelId: input.hotelId },
          select: { basePrice: true },
        });
        defaultBaseRate = rt?.basePrice ?? null;
      }

      const effectiveNightlyRate =
        input.nightlyRateSnapshot !== undefined && input.nightlyRateSnapshot !== null
          ? (input.nightlyRateSnapshot instanceof Prisma.Decimal
              ? input.nightlyRateSnapshot
              : new Prisma.Decimal(input.nightlyRateSnapshot))
          : defaultBaseRate;

      const reservation = await tx.reservation.create({
        data: {
          hotelId: input.hotelId,
          roomId: null,
          roomTypeId: input.roomTypeId ?? null,
          guestCount: input.guestCount ?? null,
          notes: input.notes ?? null,
          reservationCode: input.reservationCode,
          groupCode: input.groupCode ?? undefined,
          guestDisplayName: input.guestDisplayName,
          guestPhone: input.guestPhone,
          plannedCheckInAt: input.plannedCheckInAt,
          plannedCheckOutAt: input.plannedCheckOutAt,
          createdByUserId: input.createdByUserId,
          status: ReservationStatus.CONFIRMED,
          baseNightlyRateSnapshot: defaultBaseRate,
          nightlyRateSnapshot: effectiveNightlyRate,
          sourceCategory: input.sourceCategory ?? undefined,
          sourcePartnerId: input.sourcePartnerId ?? undefined,
          bookingOwnerUserId: input.bookingOwnerUserId?.trim() || input.createdByUserId || undefined,
        },
        include: { roomType: true },
      });

      const fallbackLines = input.chargeLines;
      if (fallbackLines && fallbackLines.length > 0 && tx.reservationChargeLine) {
        await tx.reservationChargeLine.createMany({
          data: fallbackLines.map((line: any) => ({
            hotelId: input.hotelId,
            reservationId: reservation.id,
            lineType: line.lineType,
            serviceDate: line.serviceDate ? new Date(line.serviceDate) : null,
            serviceItemId: line.serviceItemId || null,
            nameSnapshot: line.nameSnapshot,
            codeSnapshot: line.codeSnapshot || null,
            quantity: line.quantity || 1,
            unitPriceSnapshot: new Prisma.Decimal(line.unitPriceSnapshot || 0),
            taxAmountSnapshot: new Prisma.Decimal(line.taxAmountSnapshot || 0),
            discountAmountSnapshot: new Prisma.Decimal(line.discountAmountSnapshot || 0),
            totalSnapshot: new Prisma.Decimal(line.totalSnapshot || 0),
            currency: line.currency || "VND",
          })),
        });
      } else if (tx.reservationChargeLine && effectiveNightlyRate !== null && effectiveNightlyRate !== undefined) {
        const hotel = await tx.hotel.findUnique({
          where: { id: input.hotelId },
          select: { timezone: true },
        });
        const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
        const nights = Math.max(1, diffCalendarDays(input.plannedCheckInAt, input.plannedCheckOutAt, tz));
        const linesData: any[] = [];
        const rateDec = new Prisma.Decimal(effectiveNightlyRate);
        for (let i = 0; i < nights; i++) {
          const ymd = addDaysYmd(toYmd(input.plannedCheckInAt, tz), i);
          linesData.push({
            hotelId: input.hotelId,
            reservationId: reservation.id,
            lineType: ReservationChargeLineType.ROOM_NIGHT,
            serviceDate: new Date(`${ymd}T14:00:00+07:00`),
            nameSnapshot: `Tiền phòng đêm ${ymd}`,
            quantity: 1,
            unitPriceSnapshot: rateDec,
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: rateDec,
            currency: "VND",
          });
        }
        await tx.reservationChargeLine.createMany({ data: linesData });
      }

      return reservation;
    });
  }

  async findReservationById(hotelId: string, reservationId: string) {
    return this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId },
      include: {
        room: {
          include: {
            roomType: true,
          },
        },
        roomType: true,
        chargeLines: {
          orderBy: { serviceDate: "asc" },
        },
        sourcePartner: true,
        stay: true,
      },
    });
  }

  async findReservationConfirmation(hotelId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        room: {
          include: {
            roomType: true,
          },
        },
        roomType: true,
        sourcePartner: true,
        hotel: {
          include: {
            confirmationTemplate: true,
          },
        },
        chargeLines: {
          orderBy: { serviceDate: "asc" },
        },
        bookingPayments: {
          where: {
            status: { in: [BookingPaymentStatus.COMPLETED, BookingPaymentStatus.ALLOCATED] },
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException("Không tìm thấy thông tin đặt phòng");
    }

    if (reservation.hotelId !== hotelId) {
      throw new NotFoundException("Đặt phòng không thuộc khách sạn này");
    }

    return reservation;
  }

  async findGroupConfirmation(hotelId: string, groupCode: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        confirmationTemplate: true,
      },
    });
    if (!hotel) {
      throw new NotFoundException("Không tìm thấy thông tin khách sạn");
    }

    const reservations = await this.prisma.reservation.findMany({
      where: { hotelId, groupCode },
      include: {
        room: {
          include: {
            roomType: true,
          },
        },
        roomType: true,
        sourcePartner: true,
        hotel: {
          include: {
            confirmationTemplate: true,
          },
        },
        stay: {
          select: { id: true, roomId: true, status: true },
        },
        chargeLines: {
          orderBy: { serviceDate: "asc" },
        },
        bookingPayments: {
          where: {
            status: { in: [BookingPaymentStatus.COMPLETED, BookingPaymentStatus.ALLOCATED] },
          },
        },
      },
      orderBy: { plannedCheckInAt: "asc" },
    });

    if (reservations.length === 0) {
      const crossReservation = await this.prisma.reservation.findFirst({
        where: { groupCode },
        select: { hotelId: true },
      });
      if (crossReservation && crossReservation.hotelId !== hotelId) {
        throw new NotFoundException("Đoàn đặt phòng không thuộc khách sạn này");
      }
      const crossGroup = await this.prisma.reservationGroup.findFirst({
        where: { groupCode },
        select: { hotelId: true },
      });
      if (crossGroup && crossGroup.hotelId !== hotelId) {
        throw new NotFoundException("Đoàn đặt phòng không thuộc khách sạn này");
      }
      throw new NotFoundException("Không tìm thấy thông tin đoàn đặt phòng");
    }

    const groupRecord = await this.prisma.reservationGroup.findFirst({
      where: { hotelId, groupCode },
      include: {
        bookingPayments: {
          where: {
            status: { in: [BookingPaymentStatus.COMPLETED, BookingPaymentStatus.ALLOCATED] },
          },
        },
      },
    });

    return {
      hotel,
      reservations,
      groupRecord,
    };
  }

  async findConfirmationTemplate(hotelId: string) {
    if (!(this.prisma as any).hotelConfirmationTemplate) {
      return null;
    }
    return (this.prisma as any).hotelConfirmationTemplate.findUnique({
      where: { hotelId },
    });
  }

  async upsertConfirmationTemplate(
    hotelId: string,
    dto: {
      title?: string;
      subtitle?: string | null;
      contactInfo?: string | null;
      checkInPolicy?: string | null;
      checkOutPolicy?: string | null;
      paymentTerms?: string | null;
      footerNotes?: string | null;
      showLogo?: boolean;
      showPriceBreakdown?: boolean;
    },
  ) {
    if (!(this.prisma as any).hotelConfirmationTemplate) {
      return null;
    }
    return (this.prisma as any).hotelConfirmationTemplate.upsert({
      where: { hotelId },
      create: {
        hotelId,
        title: dto.title ?? "PHIẾU XÁC NHẬN ĐẶT PHÒNG",
        subtitle: dto.subtitle ?? null,
        contactInfo: dto.contactInfo ?? null,
        checkInPolicy: dto.checkInPolicy ?? null,
        checkOutPolicy: dto.checkOutPolicy ?? null,
        paymentTerms: dto.paymentTerms ?? null,
        footerNotes: dto.footerNotes ?? null,
        showLogo: dto.showLogo ?? true,
        showPriceBreakdown: dto.showPriceBreakdown ?? true,
      },
      update: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.contactInfo !== undefined ? { contactInfo: dto.contactInfo } : {}),
        ...(dto.checkInPolicy !== undefined ? { checkInPolicy: dto.checkInPolicy } : {}),
        ...(dto.checkOutPolicy !== undefined ? { checkOutPolicy: dto.checkOutPolicy } : {}),
        ...(dto.paymentTerms !== undefined ? { paymentTerms: dto.paymentTerms } : {}),
        ...(dto.footerNotes !== undefined ? { footerNotes: dto.footerNotes } : {}),
        ...(dto.showLogo !== undefined ? { showLogo: dto.showLogo } : {}),
        ...(dto.showPriceBreakdown !== undefined ? { showPriceBreakdown: dto.showPriceBreakdown } : {}),
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
              { groupCode: { contains: q, mode: "insensitive" } },
              { room: { roomNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
          roomType: true,
          stay: true,
          chargeLines: true,
        },
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

      let assignedRoomPrice: Prisma.Decimal | number | string | null | undefined;
      if (input.roomAllocationService) {
        let roomTypeId = reservation.roomTypeId ?? undefined;
        if (!roomTypeId) {
          const targetRoom = await tx.room.findFirst({
            where: { id: input.roomId, hotelId: input.hotelId },
            select: { roomTypeId: true, type: true, price: true },
          });
          roomTypeId = targetRoom?.roomTypeId ?? targetRoom?.type ?? undefined;
          assignedRoomPrice = targetRoom?.price;
        }

        const allocated = await input.roomAllocationService.allocateRoom(tx, {
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
        assignedRoomPrice ??= allocated?.price;
        if (assignedRoomPrice === null || assignedRoomPrice === undefined) {
          const targetRoom = await tx.room.findFirst({
            where: { id: input.roomId, hotelId: input.hotelId },
            select: { price: true },
          });
          assignedRoomPrice = targetRoom?.price;
        }
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
        assignedRoomPrice = room.price;
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
          ...(reservation.baseNightlyRateSnapshot === null ||
          reservation.baseNightlyRateSnapshot === undefined
            ? { baseNightlyRateSnapshot: assignedRoomPrice ?? null }
            : {}),
          ...(input.nightlyRateSnapshot !== undefined
            ? { nightlyRateSnapshot: input.nightlyRateSnapshot }
            : reservation.nightlyRateSnapshot === null ||
                reservation.nightlyRateSnapshot === undefined
              ? { nightlyRateSnapshot: assignedRoomPrice ?? null }
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

      const hotelTimezone = resolveTimeZone(
        input.timezone || (reservation as any).hotel?.timezone,
      );
      const formatHotelDate = (date: Date) => toYmd(date, hotelTimezone);

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
      if (!room) {
        throw new ConflictException("ROOM_NOT_READY_FOR_CHECK_IN");
      }
      let hasActiveStayConflict = false;
      const trueCollidingStays: Array<{ id: string; plannedCheckOutAt: Date | null }> = [];

      if (typeof tx.guestStay.findMany === "function") {
        const activeStays = await tx.guestStay.findMany({
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
          select: {
            id: true,
            reservationId: true,
            plannedCheckOutAt: true,
            status: true,
          },
        });

        for (const existingStay of activeStays) {
          if (existingStay.reservationId === reservation.id) continue;
          const isPastOverdue =
            existingStay.plannedCheckOutAt &&
            new Date(existingStay.plannedCheckOutAt).getTime() <= now.getTime();

          if (isPastOverdue) {
            // Auto-complete overdue past stay and close associated open folios
            if (typeof tx.guestStay.update === "function") {
              await tx.guestStay.update({
                where: { id: existingStay.id },
                data: {
                  status: GuestStayStatus.CHECKED_OUT,
                  checkedOutAt: now,
                  closedByUserId: input.actorUserId,
                },
              });
            }
            if (typeof tx.folio.updateMany === "function") {
              await tx.folio.updateMany({
                where: {
                  stayId: existingStay.id,
                  status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
                },
                data: {
                  status: FolioStatus.CLOSED,
                  closedAt: now,
                },
              });
            }
          } else {
            trueCollidingStays.push(existingStay);
          }
        }
        if (trueCollidingStays.length > 0) {
          hasActiveStayConflict = true;
        }
      } else if (typeof tx.guestStay.count === "function") {
        const activeStayCount = await tx.guestStay.count({
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
        });
        if (activeStayCount > 0) {
          hasActiveStayConflict = true;
        }
      }

      // Auto-close any lingering dangling folios whose stays were already checked out or cancelled
      if (typeof tx.folio?.findMany === "function") {
        const danglingFolios = await tx.folio.findMany({
          where: {
            hotelId: input.hotelId,
            roomId: room.id,
            status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
            stay: { status: { in: [GuestStayStatus.CHECKED_OUT, GuestStayStatus.CANCELLED] } },
          },
          select: { id: true },
        });

        if (danglingFolios.length > 0 && typeof tx.folio.updateMany === "function") {
          await tx.folio.updateMany({
            where: {
              id: { in: danglingFolios.map((f) => f.id) },
            },
            data: {
              status: FolioStatus.CLOSED,
              closedAt: now,
            },
          });
        }
      }

      let blockingFolioCount = 0;
      if (typeof tx.folio?.count === "function") {
        blockingFolioCount = await tx.folio.count({
          where: {
            hotelId: input.hotelId,
            roomId: room.id,
            status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
          },
        });
      }

      if (hasActiveStayConflict || blockingFolioCount > 0) {
        throw new ConflictException("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO");
      }

      if (
        !room ||
        (room.status !== RoomStatus.AVAILABLE &&
          room.status !== RoomStatus.RESERVED &&
          !(room.status === RoomStatus.OCCUPIED && trueCollidingStays.length === 0))
      ) {
        throw new ConflictException("ROOM_NOT_READY_FOR_CHECK_IN");
      }

      let qr = await tx.roomQRCode.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: room.id,
          status: { in: [RoomQRCodeStatus.INACTIVE, RoomQRCodeStatus.ACTIVE] },
        },
        orderBy: { version: "desc" },
      });
      if (!qr) {
        if (typeof tx.roomQRCode.create === "function") {
          qr = await tx.roomQRCode.create({
            data: {
              hotelId: input.hotelId,
              roomId: room.id,
              publicCode: generateOpaqueToken(24),
              status: RoomQRCodeStatus.INACTIVE,
              version: 1,
            },
          });
        } else {
          throw new BadRequestException("Phòng chưa có QR khả dụng để check-in.");
        }
      }

      const targetRoomStatus =
        room.status === RoomStatus.RESERVED
          ? RoomStatus.RESERVED
          : room.status === RoomStatus.OCCUPIED
            ? RoomStatus.OCCUPIED
            : RoomStatus.AVAILABLE;

      const occupiedRoom = await tx.room.updateMany({
        where: {
          id: room.id,
          hotelId: input.hotelId,
          status: targetRoomStatus,
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
          baseNightlyRateSnapshot:
            reservation.baseNightlyRateSnapshot ?? room.price ?? stayRate,
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

      if (tx.reservationChargeLine && tx.folioItem) {
        const unpostedExtras = await tx.reservationChargeLine.findMany({
          where: {
            reservationId: reservation.id,
            hotelId: input.hotelId,
            lineType: "EXTRA",
            isPostedToFolio: false,
          },
        });
        for (const extra of unpostedExtras) {
          const item = await tx.folioItem.create({
            data: {
              hotelId: input.hotelId,
              folioId: folio.id,
              stayId: stay.id,
              itemType: FolioItemType.SERVICE,
              sourceType: FolioItemSourceType.ROOM,
              sourceId: extra.id,
              roomId: room.id,
              serviceItemId: extra.serviceItemId || null,
              codeSnapshot: extra.codeSnapshot || null,
              nameSnapshot: extra.nameSnapshot,
              quantity: extra.quantity,
              unitPriceSnapshot: extra.unitPriceSnapshot,
              taxAmountSnapshot: extra.taxAmountSnapshot,
              discountAmountSnapshot: extra.discountAmountSnapshot,
              subtotalSnapshot: extra.unitPriceSnapshot.mul(extra.quantity),
              totalSnapshot: extra.totalSnapshot,
              currency: extra.currency,
              billingSourceSnapshot: {
                source: "RESERVATION_CHARGE_LINE",
                chargeLineId: extra.id,
                reservationId: reservation.id,
              },
              postedAt: now,
              postedByUserId: input.actorUserId,
            },
          });
          await tx.reservationChargeLine.update({
            where: { id: extra.id },
            data: {
              isPostedToFolio: true,
              postedFolioItemId: item.id,
            },
          });
        }
      }
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
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
      if (reservation.status === ReservationStatus.CHECKED_IN) {
        throw new ConflictException("Không thể hủy đặt phòng đã check-in");
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
        throw new ConflictException("Trạng thái đặt phòng không hợp lệ để hủy");
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
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
      if (reservation.status === ReservationStatus.CHECKED_IN) {
        throw new ConflictException("Không thể báo vắng mặt đặt phòng đã check-in");
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
        throw new ConflictException("Trạng thái đặt phòng không hợp lệ để báo vắng mặt");
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
    timezone?: string | null;
  }) {
    const timeZone = resolveTimeZone(input.timezone);
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
        timezone: timeZone,
        from: toYmd(input.from, timeZone),
        to: toYmd(input.to, timeZone),
        rooms: [],
        blocks: [],
      };
    }

    const now = new Date();

    const [reservations, stays, currentActiveStays] = await Promise.all([
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
          chargeLines: {
            orderBy: { serviceDate: "asc" },
          },
          sourcePartner: true,
        },
        orderBy: { plannedCheckInAt: "asc" },
      }),
      this.prisma.guestStay.findMany({
        where: {
          hotelId: input.hotelId,
          roomId: { in: roomIds },
          OR: [
            {
              status: {
                in: [
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKOUT_PENDING,
                  GuestStayStatus.RESERVED,
                ],
              },
              plannedCheckInAt: { lte: input.to },
              plannedCheckOutAt: { gte: input.from },
            },
            {
              status: {
                in: [
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
              checkedOutAt: null,
              plannedCheckOutAt: { lt: now },
            },
          ],
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
          reservation: {
            select: { groupCode: true },
          },
        },
        orderBy: { plannedCheckInAt: "asc" },
      }),
      this.prisma.guestStay.findMany({
        where: {
          hotelId: input.hotelId,
          roomId: { in: roomIds },
          status: {
            in: [
              GuestStayStatus.CHECKED_IN,
              GuestStayStatus.ACTIVE,
              GuestStayStatus.CHECKOUT_PENDING,
            ],
          },
          checkedOutAt: null,
        },
        select: {
          id: true,
          roomId: true,
          status: true,
          plannedCheckOutAt: true,
        },
      }),
    ]);

    const staysByResId = new Set(
      stays.map((s) => s.reservationId).filter((id): id is string => Boolean(id)),
    );

    const activeStayByRoomId = new Map<string, (typeof currentActiveStays)[0]>();
    const overdueStayByRoomId = new Map<string, (typeof currentActiveStays)[0]>();
    for (const stay of currentActiveStays) {
      if (!activeStayByRoomId.has(stay.roomId)) {
        activeStayByRoomId.set(stay.roomId, stay);
      }
      if (stay.plannedCheckOutAt && stay.plannedCheckOutAt.getTime() < now.getTime()) {
        overdueStayByRoomId.set(stay.roomId, stay);
      }
    }

    const userIds = new Set<string>();
    for (const r of reservations) {
      if (r.bookingOwnerUserId) userIds.add(r.bookingOwnerUserId);
      if (r.createdByUserId) userIds.add(r.createdByUserId);
    }
    for (const s of stays) {
      if (s.createdByUserId) userIds.add(s.createdByUserId);
    }
    const users =
      userIds.size > 0 && this.prisma.user?.findMany
        ? await this.prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, fullName: true, email: true },
          })
        : [];
    const userMap = new Map<string, string>(
      users.map((u: any) => [u.id, u.fullName || u.email]),
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
      groupCode: string | null;
      guestName: string;
      guestDisplayName: string;
      phone: string | null;
      guestPhone: string | null;
      guestCount: number | null;
      status: string;
      source: string;
      channel: string;
      channelName: string | null;
      sourceCategory: string | null;
      sourcePartnerId: string | null;
      sourcePartnerName: string | null;
      bookingOwnerUserId: string | null;
      bookingOwnerName: string | null;
      startDate: string;
      endDate: string;
      startAt: string;
      endAt: string;
      nights: number;
      nightlyRate: number | null;
      nightlyRateSnapshot: string | null;
      roomSubtotal: number | null;
      serviceSubtotal: number | null;
      totalAmount: number | null;
      services?: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
      notes?: string | null;
      updatedAt: string;
      expectedUpdatedAt: string;
      movable: boolean;
    }> = [];

    for (const r of reservations) {
      if (r.roomId && !staysByResId.has(r.id)) {
        const checkIn = r.plannedCheckInAt;
        const checkOut = r.plannedCheckOutAt;
        const nights = Math.max(1, diffCalendarDays(checkIn, checkOut, timeZone));

        const roomChargeLines = (r.chargeLines || []).filter((l: any) => l.lineType === "ROOM_NIGHT");
        const extraLines = (r.chargeLines || []).filter((l: any) => l.lineType !== "ROOM_NIGHT");

        let roomSubtotal = 0;
        const fallbackRate = Number(
          r.nightlyRateSnapshot ??
          r.baseNightlyRateSnapshot ??
          r.room?.price ??
          r.room?.roomType?.basePrice ??
          (r as any).roomType?.basePrice ??
          0,
        );

        if (roomChargeLines.length > 0) {
          roomSubtotal = roomChargeLines.reduce(
            (sum: number, l: any) => sum + Number(l.totalSnapshot || l.unitPriceSnapshot || 0),
            0,
          );
        } else {
          roomSubtotal = fallbackRate * nights;
        }

        const services = extraLines.map((l: any) => ({
          name: l.nameSnapshot || "Dịch vụ",
          quantity: Number(l.quantity || 1),
          unitPrice: Number(l.unitPriceSnapshot || l.totalSnapshot || 0),
          total: Number(l.totalSnapshot || 0),
        }));
        const serviceSubtotal = services.reduce((sum: number, s: any) => sum + s.total, 0);
        const totalAmount = roomSubtotal + serviceSubtotal;
        const effectiveNightlyRate =
          nights > 0
            ? Math.round(roomSubtotal / nights)
            : fallbackRate;

        const isOta = Boolean(
          r.sourceCategory === "OTA" || (r.groupCode && r.groupCode.startsWith("OTA")),
        );
        const channelCategory = (r.sourceCategory as string) || (isOta ? "OTA" : "DIRECT");

        let channelName = "Trực tiếp";
        let channelCode = "DIRECT";
        if (r.sourcePartner?.name) {
          channelName = r.sourcePartner.name;
          channelCode = channelCategory === "CORPORATE" ? "CO" : channelCategory === "TRAVEL_AGENCY" ? "TA" : channelCategory;
        } else if (channelCategory === "CORPORATE") {
          channelName = "Doanh nghiệp (CO)";
          channelCode = "CO";
        } else if (channelCategory === "TRAVEL_AGENCY" || channelCategory === "TA") {
          channelName = "Đại lý (TA)";
          channelCode = "TA";
        } else if (channelCategory === "OTA") {
          channelName = r.groupCode?.replace(/^OTA-?/i, "").trim() || "OTA";
          channelCode = "OTA";
        }

        const bookingOwnerName =
          (r.bookingOwnerUserId ? userMap.get(r.bookingOwnerUserId) : null) ||
          (r.createdByUserId ? userMap.get(r.createdByUserId) : null) ||
          null;

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
          groupCode: r.groupCode || null,
          guestName: r.guestDisplayName,
          guestDisplayName: r.guestDisplayName,
          phone: r.guestPhone,
          guestPhone: r.guestPhone,
          guestCount: r.guestCount ?? null,
          status: r.status,
          source: channelCode,
          channel: channelName,
          channelName,
          sourceCategory: channelCategory,
          sourcePartnerId: r.sourcePartnerId ?? null,
          sourcePartnerName: r.sourcePartner?.name ?? null,
          bookingOwnerUserId: r.bookingOwnerUserId ?? null,
          bookingOwnerName,
          startDate: toYmd(checkIn, timeZone),
          endDate: toYmd(checkOut, timeZone),
          startAt: checkIn.toISOString(),
          endAt: checkOut.toISOString(),
          nights,
          nightlyRate: effectiveNightlyRate,
          nightlyRateSnapshot: r.nightlyRateSnapshot ? r.nightlyRateSnapshot.toString() : null,
          roomSubtotal,
          serviceSubtotal,
          totalAmount,
          services,
          notes: r.notes ?? null,
          updatedAt: r.updatedAt.toISOString(),
          expectedUpdatedAt: r.updatedAt.toISOString(),
          movable: ACTIVE_RESERVATION_STATUSES.includes(r.status),
        });
      }
    }

    for (const s of stays) {
      const checkIn = s.checkedInAt ?? s.plannedCheckInAt;
      const checkOut = s.plannedCheckOutAt;
      const isOverdue =
        !s.checkedOutAt &&
        s.plannedCheckOutAt &&
        s.plannedCheckOutAt.getTime() < now.getTime() &&
        (s.status === GuestStayStatus.ACTIVE ||
          s.status === GuestStayStatus.CHECKED_IN ||
          s.status === GuestStayStatus.CHECKOUT_PENDING);

      const effectiveEnd = isOverdue && checkOut.getTime() < now.getTime() ? now : checkOut;
      const nights = Math.max(1, diffCalendarDays(checkIn, effectiveEnd, timeZone));
      const isOta = Boolean(s.reservationCode?.startsWith("OTA"));
      const channelName = isOta
        ? (s.reservationCode?.replace(/^OTA-?/i, "").trim() || "OTA")
        : "Trực tiếp";
      const nightlyRate = s.nightlyRateSnapshot
        ? Number(s.nightlyRateSnapshot)
        : s.baseNightlyRateSnapshot
          ? Number(s.baseNightlyRateSnapshot)
          : s.room?.price
            ? Number(s.room.price)
            : (s.room as any)?.roomType?.basePrice
              ? Number((s.room as any).roomType.basePrice)
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
        groupCode: (s as any).reservation?.groupCode || null,
        guestName: s.guestDisplayName,
        guestDisplayName: s.guestDisplayName,
        phone: s.guestPhone,
        guestPhone: s.guestPhone,
        guestCount,
        status: isOverdue ? "OVERDUE" : s.status,
        source: isOta ? "OTA" : "DIRECT",
        channel: channelName,
        channelName,
        sourceCategory: null,
        sourcePartnerId: null,
        sourcePartnerName: null,
        bookingOwnerUserId: s.createdByUserId ?? null,
        bookingOwnerName: s.createdByUserId ? userMap.get(s.createdByUserId) ?? null : null,
        startDate: toYmd(checkIn, timeZone),
        endDate: toYmd(effectiveEnd, timeZone),
        startAt: checkIn.toISOString(),
        endAt: effectiveEnd.toISOString(),
        nights,
        nightlyRate,
        nightlyRateSnapshot: s.nightlyRateSnapshot ? s.nightlyRateSnapshot.toString() : null,
        roomSubtotal: nightlyRate ? nightlyRate * nights : null,
        serviceSubtotal: 0,
        totalAmount: nightlyRate ? nightlyRate * nights : null,
        services: [],
        updatedAt: s.updatedAt.toISOString(),
        expectedUpdatedAt: s.updatedAt.toISOString(),
        movable: false,
      });
    }

    return {
      hotelId: input.hotelId,
      timezone: timeZone,
      from: toYmd(input.from, timeZone),
      to: toYmd(input.to, timeZone),
      rooms: rooms.map((r) => {
        let statusConflictCode: string | null = null;
        const roomStay = activeStayByRoomId.get(r.id);
        const hasReservation = reservations.some((res) => res.roomId === r.id);

        if (overdueStayByRoomId.has(r.id)) {
          statusConflictCode = "OVERDUE_STAY_CONFLICT";
        } else if (
          (r.status === RoomStatus.MAINTENANCE ||
            r.status === RoomStatus.BLOCKED ||
            r.status === RoomStatus.OUT_OF_SERVICE) &&
          (roomStay || hasReservation)
        ) {
          statusConflictCode = "NON_SELLABLE_OCCUPIED_CONFLICT";
        } else if (r.status === RoomStatus.AVAILABLE && roomStay) {
          statusConflictCode = "AVAILABLE_WITH_ACTIVE_STAY_CONFLICT";
        } else if (r.status === RoomStatus.OCCUPIED && !roomStay) {
          statusConflictCode = "OCCUPIED_WITHOUT_ACTIVE_STAY_CONFLICT";
        }

        return {
          id: r.id,
          roomNumber: r.roomNumber,
          floor: r.floor,
          roomTypeId: r.roomTypeId,
          roomTypeName: r.roomType?.name ?? r.type ?? null,
          status: r.status,
          physicalStatus: r.status,
          statusConflictCode,
          price: r.price ? Number(r.price) : null,
        };
      }),
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
    const reservationId = input.reservationId.replace(/^res-/, "");
    const swapWithReservationId = input.swapWithReservationId?.replace(/^res-/, "");

    return this.runSerializable(async (tx) => {
      const mode = swapWithReservationId ? "SWAP" : "MOVE";
      const resIds = [reservationId, swapWithReservationId]
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
        where: { id: reservationId, hotelId: input.hotelId },
        include: { room: true },
      });
      if (!sourceRes) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }

      if (sourceRes.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ConflictException("Dá»¯ liá»‡u Ä‘áº·t phÃ²ng Ä‘Ã£ thay Ä‘á»•i, vui lÃ²ng lÃ m má»›i");
      }

      if (!ACTIVE_RESERVATION_STATUSES.includes(sourceRes.status)) {
        throw new ConflictException("Chỉ có thể chuyển đặt phòng chưa nhận phòng");
      }

      if (!sourceRes.roomId) {
        throw new BadRequestException("Äáº·t phÃ²ng chÆ°a cÃ³ phÃ²ng Ä‘Æ°á»£c gÃ¡n trÆ°á»›c Ä‘Ã³");
      }
      const sourceRoomId = sourceRes.roomId;

      const sourceStay = await tx.guestStay.findFirst({
        where: {
          reservationId: sourceRes.id,
          status: { in: ACTIVE_IN_HOUSE_STAY_STATUSES },
        },
        select: { id: true },
      });
      if (sourceStay) {
        throw new ConflictException("Không thể chuyển đặt phòng đã có lượt lưu trú đang hoạt động");
      }

      let swapRes: any = null;
      if (swapWithReservationId) {
        swapRes = await tx.reservation.findFirst({
          where: { id: swapWithReservationId, hotelId: input.hotelId },
          include: { room: true },
        });
        if (!swapRes) {
          throw new NotFoundException("Không tìm thấy đặt phòng đối ứng");
        }
        if (
          input.swapExpectedUpdatedAt &&
          swapRes.updatedAt.toISOString() !== input.swapExpectedUpdatedAt
        ) {
          throw new ConflictException("Dá»¯ liá»‡u Ä‘áº·t phÃ²ng Ä‘á»‘i á»©ng Ä‘Ã£ thay Ä‘á»•i, vui lÃ²ng lÃ m má»›i");
        }
        if (!ACTIVE_RESERVATION_STATUSES.includes(swapRes.status)) {
          throw new ConflictException("Chỉ có thể tráo đổi đặt phòng chưa nhận phòng");
        }
        if (!swapRes.roomId) {
          throw new BadRequestException("Äáº·t phÃ²ng Ä‘á»‘i á»©ng chÆ°a cÃ³ phÃ²ng Ä‘Æ°á»£c gÃ¡n");
        }

        const swapStay = await tx.guestStay.findFirst({
          where: {
            reservationId: swapRes.id,
            status: { in: ACTIVE_IN_HOUSE_STAY_STATUSES },
          },
          select: { id: true },
        });
        if (swapStay) {
          throw new ConflictException("Không thể tráo đặt phòng đã có lượt lưu trú đang hoạt động");
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
        throw new NotFoundException("Không tìm thấy phòng tương ứng");
      }

      if (NON_SELLABLE_ROOM_STATUSES.includes(targetRoom.status)) {
        throw new ConflictException("Phòng đích đang ở trạng thái không thể sử dụng");
      }

      const sameType =
        (sourceRoom.roomTypeId &&
          targetRoom.roomTypeId &&
          sourceRoom.roomTypeId === targetRoom.roomTypeId) ||
        (sourceRoom.type && targetRoom.type && sourceRoom.type === targetRoom.type);

      if (!sameType) {
        throw new ConflictException("Chỉ được chuyển hoặc tráo giữa các phòng cùng loại");
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

        const targetDefaultRate = targetRoom.price ?? targetRoom.roomType?.basePrice ?? null;
        const sourceUsedDefaultRate =
          sourceRes.nightlyRateSnapshot === null ||
          sourceRes.nightlyRateSnapshot === undefined ||
          (sourceRes.baseNightlyRateSnapshot !== null &&
            sourceRes.baseNightlyRateSnapshot !== undefined &&
            new Prisma.Decimal(sourceRes.nightlyRateSnapshot).equals(
              sourceRes.baseNightlyRateSnapshot,
            ));

        const updatedSource = await tx.reservation.update({
          where: { id: sourceRes.id },
          data: {
            roomId: input.targetRoomId,
            assignedAt: now,
            assignedByUserId: input.actorUserId,
            ...(targetDefaultRate !== null
              ? {
                  baseNightlyRateSnapshot: targetDefaultRate,
                  ...(sourceUsedDefaultRate ? { nightlyRateSnapshot: targetDefaultRate } : {}),
                }
              : {}),
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
          throw new ConflictException("Xung đột lịch đặt phòng tại phòng nguồn khi tráo đổi");
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
          throw new ConflictException("Xung đột lịch đặt phòng tại phòng đích khi tráo đổi");
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

  async updateReservationDates(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    startDate?: string;
    endDate?: string;
    plannedCheckInAt?: Date;
    plannedCheckOutAt?: Date;
    nightlyRateSnapshot?: number | string | Prisma.Decimal | null;
    expectedUpdatedAt: string;
    actorUserId: string;
  }) {
    return this.runSerializable(async (tx) => {
      const res = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { room: true },
      });
      if (!res) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
      if (!ACTIVE_RESERVATION_STATUSES.includes(res.status)) {
        throw new BadRequestException("Chỉ có thể điều chỉnh ngày cho đặt phòng đang hoạt động");
      }

      const currentExpected = new Date(input.expectedUpdatedAt).getTime();
      const actualUpdated = res.updatedAt.getTime();
      if (!isNaN(currentExpected) && Math.abs(actualUpdated - currentExpected) > 2000) {
        throw new ConflictException("Dữ liệu đặt phòng đã thay đổi bởi người khác, vui lòng tải lại");
      }

      let newCheckIn = input.plannedCheckInAt;
      if (!newCheckIn && input.startDate) {
        newCheckIn = input.startDate.includes("T")
          ? new Date(input.startDate)
          : new Date(`${input.startDate}T14:00:00+07:00`);
      }
      if (!newCheckIn) {
        newCheckIn = res.plannedCheckInAt;
      }

      let newCheckOut = input.plannedCheckOutAt;
      if (!newCheckOut && input.endDate) {
        newCheckOut = input.endDate.includes("T")
          ? new Date(input.endDate)
          : new Date(`${input.endDate}T12:00:00+07:00`);
      }
      if (!newCheckOut) {
        newCheckOut = res.plannedCheckOutAt;
      }

      if (newCheckIn >= newCheckOut) {
        throw new BadRequestException("Ngày trả phòng phải sau ngày nhận phòng");
      }

      // If room is assigned, verify no collisions
      if (res.roomId) {
        const stayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: res.roomId,
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: newCheckOut },
            plannedCheckOutAt: { gt: newCheckIn },
          },
          select: { id: true },
        });
        if (stayOverlap) {
          throw new ConflictException("Phòng đã có khách lưu trú trùng khoảng thời gian mới");
        }

        const resOverlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: res.roomId,
            id: { not: res.id },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: newCheckOut },
            plannedCheckOutAt: { gt: newCheckIn },
          },
          select: { id: true },
        });
        if (resOverlap) {
          throw new ConflictException("Phòng đã có đơn đặt phòng khác trùng khoảng thời gian mới");
        }
      }

      const updated = await tx.reservation.update({
        where: { id: res.id },
        data: {
          plannedCheckInAt: newCheckIn,
          plannedCheckOutAt: newCheckOut,
          ...(input.nightlyRateSnapshot !== undefined && input.nightlyRateSnapshot !== null
            ? {
                nightlyRateSnapshot:
                  input.nightlyRateSnapshot instanceof Prisma.Decimal
                    ? input.nightlyRateSnapshot
                    : new Prisma.Decimal(input.nightlyRateSnapshot),
              }
            : {}),
        },
        include: { room: true },
      });

      // Reconcile nightly ledger (ROOM_NIGHT charge lines) with the new billable dates
      if (tx.reservationChargeLine) {
        const hotel = await tx.hotel.findUnique({
          where: { id: input.hotelId },
          select: { timezone: true },
        });
        const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
        const newNights = Math.max(1, diffCalendarDays(newCheckIn, newCheckOut, tz));
        const newNightYmds = new Set<string>();
        for (let i = 0; i < newNights; i++) {
          newNightYmds.add(addDaysYmd(toYmd(newCheckIn, tz), i));
        }

        const existingLines = await tx.reservationChargeLine.findMany({
          where: { reservationId: res.id, hotelId: input.hotelId },
        });
        const roomNightLines = existingLines.filter((l) => l.lineType === "ROOM_NIGHT");

        const linesToDelete: string[] = [];
        const coveredYmds = new Set<string>();

        for (const line of roomNightLines) {
          const lineYmd = line.serviceDate ? toYmd(new Date(line.serviceDate), tz) : null;
          if (lineYmd && newNightYmds.has(lineYmd)) {
            coveredYmds.add(lineYmd);
          } else {
            linesToDelete.push(line.id);
          }
        }

        if (linesToDelete.length > 0) {
          await tx.reservationChargeLine.deleteMany({
            where: { id: { in: linesToDelete } },
          });
        }

        const missingYmds = Array.from(newNightYmds).filter((ymd) => !coveredYmds.has(ymd));
        if (missingYmds.length > 0) {
          const fallbackRate =
            input.nightlyRateSnapshot !== undefined && input.nightlyRateSnapshot !== null
              ? new Prisma.Decimal(input.nightlyRateSnapshot)
              : res.nightlyRateSnapshot ??
                res.baseNightlyRateSnapshot ??
                (res.room as any)?.price ??
                new Prisma.Decimal(0);

          await tx.reservationChargeLine.createMany({
            data: missingYmds.map((ymd) => ({
              hotelId: input.hotelId,
              reservationId: res.id,
              lineType: ReservationChargeLineType.ROOM_NIGHT,
              serviceDate: new Date(`${ymd}T14:00:00+07:00`),
              nameSnapshot: `Tiền phòng đêm ${ymd}`,
              quantity: 1,
              unitPriceSnapshot: fallbackRate,
              taxAmountSnapshot: new Prisma.Decimal(0),
              discountAmountSnapshot: new Prisma.Decimal(0),
              totalSnapshot: fallbackRate,
              currency: "VND",
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          tenantId: input.tenantId,
          action: "RESERVATION_DATES_UPDATED",
          entityType: "Reservation",
          entityId: res.id,
          metadata: {
            reservationId: res.id,
            previousCheckIn: res.plannedCheckInAt.toISOString(),
            previousCheckOut: res.plannedCheckOutAt.toISOString(),
            newCheckIn: newCheckIn.toISOString(),
            newCheckOut: newCheckOut.toISOString(),
          },
        },
      });

      return updated;
    }, "RESERVATION_DATES_CONCURRENCY_CONFLICT");
  }

  async updateReservation(input: {
    hotelId: string;
    tenantId: string;
    reservationId: string;
    guestDisplayName?: string;
    guestPhone?: string | null;
    guestCount?: number | null;
    notes?: string | null;
    roomId?: string | null;
    roomTypeId?: string | null;
    startDate?: string;
    endDate?: string;
    plannedCheckInAt?: Date;
    plannedCheckOutAt?: Date;
    nightlyRateSnapshot?: number | string | Prisma.Decimal | null;
    chargeLines?: any[];
    sourceCategory?: any;
    sourcePartnerId?: string | null;
    bookingOwnerUserId?: string | null;
    expectedUpdatedAt?: string;
    actorUserId: string;
    assertRoomAccess?: (roomId: string) => void | Promise<void> | unknown | Promise<unknown>;
  }) {
    return this.runSerializable(async (tx) => {
      const res = await tx.reservation.findFirst({
        where: { id: input.reservationId, hotelId: input.hotelId },
        include: { room: { include: { roomType: true } }, roomType: true },
      });
      if (!res) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
      if (!ACTIVE_RESERVATION_STATUSES.includes(res.status)) {
        throw new BadRequestException("Chỉ có thể điều chỉnh đặt phòng đang hoạt động");
      }

      if (input.expectedUpdatedAt) {
        const currentExpected = new Date(input.expectedUpdatedAt).getTime();
        const actualUpdated = res.updatedAt.getTime();
        if (!isNaN(currentExpected) && Math.abs(actualUpdated - currentExpected) > 2000) {
          throw new ConflictException("Dữ liệu đặt phòng đã thay đổi bởi người khác, vui lòng tải lại");
        }
      }

      let newCheckIn = input.plannedCheckInAt;
      if (!newCheckIn && input.startDate) {
        newCheckIn = input.startDate.includes("T")
          ? new Date(input.startDate)
          : new Date(`${input.startDate}T14:00:00+07:00`);
      }
      if (!newCheckIn) {
        newCheckIn = res.plannedCheckInAt;
      }

      let newCheckOut = input.plannedCheckOutAt;
      if (!newCheckOut && input.endDate) {
        newCheckOut = input.endDate.includes("T")
          ? new Date(input.endDate)
          : new Date(`${input.endDate}T12:00:00+07:00`);
      }
      if (!newCheckOut) {
        newCheckOut = res.plannedCheckOutAt;
      }

      if (newCheckIn >= newCheckOut) {
        throw new BadRequestException("Ngày trả phòng phải sau ngày nhận phòng");
      }

      const datesChanged =
        newCheckIn.getTime() !== res.plannedCheckInAt.getTime() ||
        newCheckOut.getTime() !== res.plannedCheckOutAt.getTime();

      let newRoomId = res.roomId;
      if (input.roomId !== undefined) {
        newRoomId = input.roomId?.trim() || null;
      }

      if (newRoomId) {
        if (input.assertRoomAccess) {
          await input.assertRoomAccess(newRoomId);
        }
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          newRoomId,
          input.hotelId,
        );
        const targetRoom = await tx.room.findFirst({
          where: { id: newRoomId, hotelId: input.hotelId },
          select: {
            id: true,
            status: true,
            price: true,
            roomTypeId: true,
            type: true,
            roomNumber: true,
            roomType: { select: { id: true, name: true, maxOccupancy: true } },
          },
        });
        if (!targetRoom) {
          throw new NotFoundException("Không tìm thấy phòng được chỉ định");
        }
        if (NON_SELLABLE_ROOM_STATUSES.includes(targetRoom.status)) {
          throw new ConflictException("Phòng hiện không khả dụng để đặt");
        }

        const effectiveGuestCount = input.guestCount ?? res.guestCount;
        const capacity = targetRoom.roomType?.maxOccupancy;
        if (capacity != null && effectiveGuestCount != null && effectiveGuestCount > capacity) {
          throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
        }

        const stayOverlap = await tx.guestStay.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: newRoomId,
            status: { in: ACTIVE_STAY_STATUSES },
            plannedCheckInAt: { lt: newCheckOut },
            plannedCheckOutAt: { gt: newCheckIn },
          },
          select: { id: true },
        });
        if (stayOverlap) {
          throw new ConflictException("Phòng đã có khách lưu trú trùng khoảng thời gian này");
        }

        const resOverlap = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: newRoomId,
            id: { not: res.id },
            status: { in: ACTIVE_RESERVATION_STATUSES },
            plannedCheckInAt: { lt: newCheckOut },
            plannedCheckOutAt: { gt: newCheckIn },
          },
          select: { id: true },
        });
        if (resOverlap) {
          throw new ConflictException("Phòng đã có đơn đặt phòng khác trùng khoảng thời gian này");
        }
      }

      let newNightlyRate = res.nightlyRateSnapshot;
      let rateChanged = false;
      if (input.nightlyRateSnapshot !== undefined) {
        newNightlyRate =
          input.nightlyRateSnapshot !== null
            ? (input.nightlyRateSnapshot instanceof Prisma.Decimal
                ? input.nightlyRateSnapshot
                : new Prisma.Decimal(input.nightlyRateSnapshot))
            : null;
        rateChanged = true;
      }

      let newStatus = res.status;
      if (res.status === ReservationStatus.CONFIRMED && newRoomId) {
        newStatus = ReservationStatus.ARRIVAL_READY;
      } else if (res.status === ReservationStatus.ARRIVAL_READY && !newRoomId) {
        newStatus = ReservationStatus.CONFIRMED;
      }

      const updated = await tx.reservation.update({
        where: { id: res.id },
        data: {
          guestDisplayName: input.guestDisplayName?.trim() || res.guestDisplayName,
          guestPhone: input.guestPhone !== undefined ? (input.guestPhone?.trim() || null) : res.guestPhone,
          guestCount: input.guestCount !== undefined ? input.guestCount : res.guestCount,
          notes: input.notes !== undefined ? (input.notes?.trim() || null) : res.notes,
          roomId: newRoomId,
          roomTypeId: input.roomTypeId !== undefined ? (input.roomTypeId || null) : res.roomTypeId,
          plannedCheckInAt: newCheckIn,
          plannedCheckOutAt: newCheckOut,
          status: newStatus,
          assignedAt: newRoomId && !res.roomId ? new Date() : res.assignedAt,
          assignedByUserId: newRoomId && !res.roomId ? input.actorUserId : res.assignedByUserId,
          nightlyRateSnapshot: newNightlyRate,
          sourceCategory: (input.sourceCategory === "TA" ? "TRAVEL_AGENCY" : input.sourceCategory) ?? res.sourceCategory,
          sourcePartnerId: input.sourcePartnerId !== undefined ? (input.sourcePartnerId || null) : res.sourcePartnerId,
          bookingOwnerUserId: input.bookingOwnerUserId !== undefined ? (input.bookingOwnerUserId?.trim() || null) : res.bookingOwnerUserId,
        },
        include: { room: { include: { roomType: true } }, roomType: true, chargeLines: true },
      });

      if (input.chargeLines !== undefined && tx.reservationChargeLine) {
        await tx.reservationChargeLine.deleteMany({
          where: { reservationId: res.id, hotelId: input.hotelId },
        });
        if (input.chargeLines.length > 0) {
          await tx.reservationChargeLine.createMany({
            data: input.chargeLines.map((line: any) => ({
              hotelId: input.hotelId,
              reservationId: res.id,
              lineType: line.lineType,
              serviceDate: line.serviceDate ? new Date(line.serviceDate) : null,
              serviceItemId: line.serviceItemId || null,
              nameSnapshot: line.nameSnapshot,
              codeSnapshot: line.codeSnapshot || null,
              quantity: line.quantity || 1,
              unitPriceSnapshot: new Prisma.Decimal(line.unitPriceSnapshot || 0),
              taxAmountSnapshot: new Prisma.Decimal(line.taxAmountSnapshot || 0),
              discountAmountSnapshot: new Prisma.Decimal(line.discountAmountSnapshot || 0),
              totalSnapshot: new Prisma.Decimal(line.totalSnapshot || 0),
              currency: line.currency || "VND",
            })),
          });
        }
      } else if ((datesChanged || rateChanged) && tx.reservationChargeLine) {
        const hotel = await tx.hotel.findUnique({
          where: { id: input.hotelId },
          select: { timezone: true },
        });
        const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
        const newNights = Math.max(1, diffCalendarDays(newCheckIn, newCheckOut, tz));
        const newNightYmds = new Set<string>();
        for (let i = 0; i < newNights; i++) {
          newNightYmds.add(addDaysYmd(toYmd(newCheckIn, tz), i));
        }

        const existingLines = await tx.reservationChargeLine.findMany({
          where: { reservationId: res.id, hotelId: input.hotelId },
        });
        const roomNightLines = existingLines.filter((l) => l.lineType === "ROOM_NIGHT");

        const linesToDelete: string[] = [];
        const coveredYmds = new Set<string>();

        for (const line of roomNightLines) {
          const lineYmd = line.serviceDate ? toYmd(new Date(line.serviceDate), tz) : null;
          if (lineYmd && newNightYmds.has(lineYmd) && !rateChanged) {
            coveredYmds.add(lineYmd);
          } else {
            linesToDelete.push(line.id);
          }
        }

        if (linesToDelete.length > 0) {
          await tx.reservationChargeLine.deleteMany({
            where: { id: { in: linesToDelete } },
          });
        }

        const missingYmds = Array.from(newNightYmds).filter((ymd) => !coveredYmds.has(ymd));
        if (missingYmds.length > 0) {
          const effectiveFallback =
            newNightlyRate !== null && newNightlyRate !== undefined
              ? (newNightlyRate instanceof Prisma.Decimal ? newNightlyRate : new Prisma.Decimal(newNightlyRate))
              : res.baseNightlyRateSnapshot ??
                (res.room as any)?.price ??
                new Prisma.Decimal(0);

          await tx.reservationChargeLine.createMany({
            data: missingYmds.map((ymd) => ({
              hotelId: input.hotelId,
              reservationId: res.id,
              lineType: ReservationChargeLineType.ROOM_NIGHT,
              serviceDate: new Date(`${ymd}T14:00:00+07:00`),
              nameSnapshot: `Tiền phòng đêm ${ymd}`,
              quantity: 1,
              unitPriceSnapshot: effectiveFallback,
              taxAmountSnapshot: new Prisma.Decimal(0),
              discountAmountSnapshot: new Prisma.Decimal(0),
              totalSnapshot: effectiveFallback,
              currency: "VND",
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          tenantId: input.tenantId,
          action: "RESERVATION_UPDATED",
          entityType: "Reservation",
          entityId: res.id,
          metadata: {
            reservationId: res.id,
            previousGuestName: res.guestDisplayName,
            newGuestName: updated.guestDisplayName,
            previousRoomId: res.roomId,
            newRoomId: updated.roomId,
            datesChanged,
            rateChanged,
          },
        },
      });

      return updated;
    }, "RESERVATION_CONCURRENCY_CONFLICT");
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
    if (error instanceof ConflictException) {
      const response = error.getResponse();
      const message = typeof response === "string" ? response : (response as any)?.message;
      if (message === "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT") {
        return true;
      }
    }
    const err = error as any;
    if (err?.code === "40001" || err?.code === "40P01") return true;

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

  async findGroupByCode(hotelId: string, groupCode: string) {
    const trimmedGroupCode = groupCode.trim();

    let group: any = null;
    if (this.prisma.reservationGroup?.findUnique) {
      group = await this.prisma.reservationGroup.findUnique({
        where: {
          hotelId_groupCode: { hotelId, groupCode: trimmedGroupCode },
        },
        include: {
          sourcePartner: true,
        },
      });
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        groupCode: trimmedGroupCode,
      },
      include: {
        room: true,
        roomType: true,
        stay: {
          select: {
            id: true,
            roomId: true,
            status: true,
          },
        },
      },
      orderBy: [
        { plannedCheckInAt: "asc" },
        { createdAt: "asc" },
      ],
    });

    if (!group && reservations.length === 0) {
      throw new NotFoundException(`Không tìm thấy thông tin đoàn với mã ${trimmedGroupCode}`);
    }

    let checkedInRooms = 0;
    let arrivingRooms = 0;
    let totalEstimatedAmount = 0;

    const reservationItems = reservations.map((res) => {
      const isCheckedIn = res.status === ReservationStatus.CHECKED_IN;
      const isArriving =
        res.status === ReservationStatus.CONFIRMED ||
        res.status === ReservationStatus.ARRIVAL_READY;

      if (isCheckedIn) checkedInRooms++;
      if (isArriving) arrivingRooms++;

      const checkIn = new Date(res.plannedCheckInAt);
      const checkOut = new Date(res.plannedCheckOutAt);
      const nights = Math.max(1, diffCalendarDays(checkIn, checkOut, "Asia/Ho_Chi_Minh"));

      const rawRate =
        res.nightlyRateSnapshot ??
        res.baseNightlyRateSnapshot ??
        res.room?.price ??
        res.roomType?.basePrice;
      const nightlyRate = rawRate != null ? Number(rawRate) : 0;
      const estimatedAmount =
        res.status === ReservationStatus.CANCELLED ? 0 : nights * nightlyRate;

      totalEstimatedAmount += estimatedAmount;

      const rawStay = (res as any).stay;
      const rawGuestStays = (res as any).guestStays;
      const activeStay =
        rawStay &&
        (!rawStay.status ||
          ACTIVE_IN_HOUSE_STAY_STATUSES.includes(rawStay.status) ||
          rawStay.status === "OPEN")
          ? rawStay
          : Array.isArray(rawGuestStays) && rawGuestStays.length > 0
            ? rawGuestStays[0]
            : null;

      return {
        id: res.id,
        reservationId: res.id,
        stayId: activeStay?.id ?? null,
        activeStayId: activeStay?.id ?? null,
        reservationCode: res.reservationCode,
        roomId: res.roomId ?? activeStay?.roomId ?? null,
        assignedRoomId:
          res.roomId ??
          (res as any).assignedRoomId ??
          res.room?.id ??
          (res as any).assignedRoom?.id ??
          activeStay?.roomId ??
          null,
        roomNumber: res.room?.roomNumber ?? (res as any).assignedRoom?.roomNumber ?? null,
        assignedRoomNumber: res.room?.roomNumber ?? (res as any).assignedRoom?.roomNumber ?? null,
        roomName: res.room?.roomNumber ? `P.${res.room.roomNumber}` : null,
        roomTypeId: res.roomTypeId,
        roomTypeName: res.roomType?.name ?? res.roomTypeSnapshot ?? null,
        roomTypeCode: (res.roomType as any)?.code ?? res.roomType?.normalizedKey ?? null,
        guestDisplayName: res.guestDisplayName,
        guestName: res.guestDisplayName,
        guestPhone: res.guestPhone,
        guestEmail: (res as any).guestEmail ?? null,
        status: res.status,
        plannedCheckInAt: res.plannedCheckInAt,
        plannedCheckOutAt: res.plannedCheckOutAt,
        checkInDate: checkIn.toISOString(),
        checkOutDate: checkOut.toISOString(),
        nightlyRateSnapshot:
          res.nightlyRateSnapshot != null
            ? new Prisma.Decimal(res.nightlyRateSnapshot).toFixed(2)
            : null,
        baseNightlyRateSnapshot:
          res.baseNightlyRateSnapshot != null
            ? new Prisma.Decimal(res.baseNightlyRateSnapshot).toFixed(2)
            : null,
        ratePerNight: nightlyRate,
        guestCount: res.guestCount ?? 1,
        notes: res.notes,
        specialRequests: res.notes ?? null,
        nights,
        estimatedAmount,
        totalAmount: estimatedAmount,
        depositAmount: 0,
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
      };
    });

    const first = reservations[0];

    return {
      groupCode: group?.groupCode ?? trimmedGroupCode,
      groupName: group?.groupName ?? null,
      leadGuestName: group?.leadGuestName ?? first?.guestDisplayName ?? "Khách đặt đoàn",
      leadGuestPhone: group?.leadGuestPhone ?? first?.guestPhone ?? null,
      notes: group?.notes ?? first?.notes ?? null,
      sourceCategory: group?.sourceCategory ?? first?.sourceCategory ?? null,
      sourcePartnerId: group?.sourcePartnerId ?? first?.sourcePartnerId ?? null,
      sourcePartnerName: group?.sourcePartner?.name ?? null,
      totalRooms: reservations.length,
      checkedInRooms,
      arrivingRooms,
      totalEstimatedAmount,
      reservations: reservationItems,
      rooms: reservationItems,
      createdAt: group?.createdAt ?? first?.createdAt ?? new Date(),
      updatedAt: group?.updatedAt ?? first?.updatedAt ?? new Date(),
    };
  }

  async updateGroupByCode(
    hotelId: string,
    groupCode: string,
    dto: UpdateGroupReservationBodyInput,
  ) {
    const trimmedGroupCode = groupCode.trim();

    let existingGroup: any = null;
    if (this.prisma.reservationGroup?.findUnique) {
      existingGroup = await this.prisma.reservationGroup.findUnique({
        where: {
          hotelId_groupCode: { hotelId, groupCode: trimmedGroupCode },
        },
      });
    }

    const existingReservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        groupCode: trimmedGroupCode,
      },
      select: {
        id: true,
        guestDisplayName: true,
        guestPhone: true,
        notes: true,
      },
    });

    if (!existingGroup && existingReservations.length === 0) {
      throw new NotFoundException(`Không tìm thấy thông tin đoàn với mã ${trimmedGroupCode}`);
    }

    if (this.prisma.reservationGroup?.upsert) {
      const updateData: Prisma.ReservationGroupUpdateInput = {};
      if (dto.groupName !== undefined) updateData.groupName = dto.groupName;
      if (dto.leadGuestName !== undefined) updateData.leadGuestName = dto.leadGuestName;
      if (dto.leadGuestPhone !== undefined) updateData.leadGuestPhone = dto.leadGuestPhone;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      const savedGroup = await this.prisma.reservationGroup.upsert({
        where: {
          hotelId_groupCode: { hotelId, groupCode: trimmedGroupCode },
        },
        update: updateData,
        create: {
          hotelId,
          groupCode: trimmedGroupCode,
          groupName: dto.groupName ?? null,
          leadGuestName:
            dto.leadGuestName ?? existingReservations[0]?.guestDisplayName ?? "Khách đặt đoàn",
          leadGuestPhone: dto.leadGuestPhone ?? existingReservations[0]?.guestPhone ?? null,
          notes: dto.notes ?? existingReservations[0]?.notes ?? null,
        },
      });

      if (this.prisma.reservation?.updateMany) {
        await this.prisma.reservation.updateMany({
          where: {
            hotelId,
            groupCode: trimmedGroupCode,
            groupId: null,
          },
          data: {
            groupId: savedGroup.id,
          },
        });
      }
    }

    return this.findGroupByCode(hotelId, trimmedGroupCode);
  }

  async listBookingSourcePartners(
    hotelId: string,
    query: { category?: any; isActive?: boolean; q?: string },
  ) {
    const where: any = { hotelId };
    if (query.category) where.category = query.category;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { code: { contains: query.q, mode: "insensitive" } },
        { contactPerson: { contains: query.q, mode: "insensitive" } },
      ];
    }
    return (this.prisma as any).bookingSourcePartner.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async createBookingSourcePartner(
    hotelId: string,
    dto: {
      name: string;
      code: string;
      category?: any;
      contactPerson?: string;
      contactPhone?: string;
      contactEmail?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    const existing = await (this.prisma as any).bookingSourcePartner.findFirst({
      where: { hotelId, code: dto.code.trim().toUpperCase() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Mã đối tác ${dto.code} đã tồn tại trong khách sạn`);
    }
    return (this.prisma as any).bookingSourcePartner.create({
      data: {
        hotelId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        category: (dto.category === "TA" ? "TRAVEL_AGENCY" : dto.category) ?? "DIRECT",
        contactPerson: dto.contactPerson?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateBookingSourcePartner(
    hotelId: string,
    partnerId: string,
    dto: {
      name?: string;
      code?: string;
      category?: any;
      contactPerson?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      notes?: string | null;
      isActive?: boolean;
    },
  ) {
    const partner = await (this.prisma as any).bookingSourcePartner.findFirst({
      where: { id: partnerId, hotelId },
    });
    if (!partner) {
      throw new NotFoundException("Không tìm thấy đối tác đặt phòng");
    }
    if (dto.code && dto.code.trim().toUpperCase() !== partner.code) {
      const codeConflict = await (this.prisma as any).bookingSourcePartner.findFirst({
        where: { hotelId, code: dto.code.trim().toUpperCase(), id: { not: partnerId } },
      });
      if (codeConflict) {
        throw new ConflictException(`Mã đối tác ${dto.code} đã tồn tại`);
      }
    }
    return (this.prisma as any).bookingSourcePartner.update({
      where: { id: partnerId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteBookingSourcePartner(hotelId: string, partnerId: string) {
    const partner = await (this.prisma as any).bookingSourcePartner.findFirst({
      where: { id: partnerId, hotelId },
    });
    if (!partner) {
      throw new NotFoundException("Không tìm thấy đối tác đặt phòng");
    }
    return (this.prisma as any).bookingSourcePartner.delete({
      where: { id: partnerId },
    });
  }
}
