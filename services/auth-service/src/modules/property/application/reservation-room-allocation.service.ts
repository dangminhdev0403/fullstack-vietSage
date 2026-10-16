import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { GuestStayStatus, Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export type RoomAllocationMode = "manual" | "auto";

export interface RoomAllocationInterval {
  checkInAt: Date;
  checkOutAt: Date;
}

export interface AllocateRoomInput {
  hotelId: string;
  roomTypeId?: string;
  roomType?: string | { id?: string; name?: string; roomTypeId?: string };
  interval?:
    | RoomAllocationInterval
    | { checkIn: Date; checkOut: Date }
    | { checkInAt: Date; checkOutAt: Date }
    | { start: Date; end: Date };
  checkInAt?: Date;
  checkOutAt?: Date;
  excludedRoomIds?: string[];
  mode: RoomAllocationMode | "manual" | "auto";
  requestedRoomId?: string;
  roomId?: string;
  targetRoomId?: string;
}

export interface AllocatedRoomResult {
  id: string;
  roomId: string;
  roomNumber: string;
  hotelId: string;
  roomTypeId: string | null;
  type: string | null;
  status: RoomStatus;
  price: Prisma.Decimal | number | null;
  floor: string | null;
  room: any;
}

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

const NON_SELLABLE_ROOM_STATUSES: RoomStatus[] = [
  RoomStatus.BLOCKED,
  RoomStatus.MAINTENANCE,
  RoomStatus.OUT_OF_SERVICE,
];

@Injectable()
export class ReservationRoomAllocationService {
  constructor(
    @Optional()
    private readonly prisma?: PrismaService,
  ) {}

  async allocateRoom(
    tx: Prisma.TransactionClient,
    hotelIdOrInput: string | AllocateRoomInput,
    roomType?: string | { id?: string; name?: string; roomTypeId?: string },
    interval?:
      | RoomAllocationInterval
      | { checkIn: Date; checkOut: Date }
      | { checkInAt: Date; checkOutAt: Date }
      | { start: Date; end: Date },
    excludedRoomIds?: string[],
    mode?: RoomAllocationMode | "manual" | "auto",
    requestedRoomId?: string,
  ): Promise<AllocatedRoomResult> {
    const input: AllocateRoomInput =
      typeof hotelIdOrInput === "string"
        ? {
            hotelId: hotelIdOrInput,
            roomType,
            interval,
            excludedRoomIds,
            mode: mode ?? "auto",
            requestedRoomId,
          }
        : hotelIdOrInput;

    try {
      return await this.executeAllocation(tx, input);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (this.isRetryableConcurrencyError(error)) {
        throw new ConflictException("RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
      }
      throw error;
    }
  }

  isRetryableConflict(error: unknown): boolean {
    return this.isRetryableConcurrencyError(error);
  }

  private async executeAllocation(
    tx: Prisma.TransactionClient,
    input: AllocateRoomInput,
  ): Promise<AllocatedRoomResult> {
    const hotelId = input.hotelId;
    if (!hotelId) {
      throw new BadRequestException("hotelId là bắt buộc");
    }

    const { checkInAt, checkOutAt } = this.parseInterval(input);
    const mode = input.mode;
    if (mode !== "manual" && mode !== "auto") {
      throw new BadRequestException(
        "Chế độ phân bổ phòng không hợp lệ. Chỉ chấp nhận 'manual' hoặc 'auto'",
      );
    }

    const excludedSet = new Set<string>(input.excludedRoomIds ?? []);
    const criteria = this.extractRoomTypeCriteria(input);
    const resolvedRoomType = await this.resolveRoomTypeRecord(tx, hotelId, criteria);
    const now = new Date();

    if (mode === "manual") {
      const targetRoomId = input.requestedRoomId ?? input.roomId ?? input.targetRoomId;
      if (!targetRoomId) {
        throw new BadRequestException("Phòng yêu cầu là bắt buộc trong chế độ chỉ định thủ công");
      }

      await this.lockRoomRow(tx, hotelId, targetRoomId);

      const room = await tx.room.findFirst({
        where: { id: targetRoomId, hotelId },
        include: { roomType: true },
      });
      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng");
      }

      if (!this.isRoomMatchingType(room, criteria, resolvedRoomType)) {
        throw new ConflictException("ROOM_TYPE_MISMATCH");
      }

      if (NON_SELLABLE_ROOM_STATUSES.includes(room.status)) {
        throw new ConflictException("ROOM_NOT_AVAILABLE");
      }

      if (excludedSet.has(room.id)) {
        throw new ConflictException("ROOM_NOT_AVAILABLE");
      }

      const hasStayOverlap = await this.hasOverlappingActiveStay(
        tx,
        hotelId,
        room.id,
        checkInAt,
        checkOutAt,
      );
      if (hasStayOverlap) {
        throw new ConflictException("ROOM_RESERVATION_OVERLAP");
      }

      const isOverdue = await this.hasOverdueActiveStay(tx, hotelId, room.id, now);
      if (isOverdue) {
        throw new ConflictException("ROOM_OVERDUE_STAY_CONFLICT");
      }

      const hasResOverlap = await this.hasOverlappingReservation(
        tx,
        hotelId,
        room.id,
        checkInAt,
        checkOutAt,
      );
      if (hasResOverlap) {
        throw new ConflictException("ROOM_RESERVATION_OVERLAP");
      }

      return this.formatAllocatedRoom(room);
    }

    // Auto allocation mode
    const candidateRooms = await tx.room.findMany({
      where: {
        hotelId,
        status: { notIn: NON_SELLABLE_ROOM_STATUSES },
        ...(excludedSet.size > 0 ? { id: { notIn: Array.from(excludedSet) } } : {}),
      },
      orderBy: [{ roomNumber: "asc" }, { id: "asc" }],
      include: { roomType: true },
    });

    const matchingRooms = candidateRooms.filter((r) =>
      this.isRoomMatchingType(r, criteria, resolvedRoomType),
    );

    let selectedRoom: any = null;

    for (const candidate of matchingRooms) {
      // Overdue active stays are excluded from automatic allocation rather than pretending they are free
      const isOverdue = await this.hasOverdueActiveStay(tx, hotelId, candidate.id, now);
      if (isOverdue) {
        continue;
      }

      // Overlapping active stays block
      const hasStayOverlap = await this.hasOverlappingActiveStay(
        tx,
        hotelId,
        candidate.id,
        checkInAt,
        checkOutAt,
      );
      if (hasStayOverlap) {
        continue;
      }

      // Overlapping active reservations block (cancelled reservations do not hold inventory)
      const hasResOverlap = await this.hasOverlappingReservation(
        tx,
        hotelId,
        candidate.id,
        checkInAt,
        checkOutAt,
      );
      if (hasResOverlap) {
        continue;
      }

      await this.lockRoomRow(tx, hotelId, candidate.id);

      // Re-verify room under lock
      const lockedRoom = await tx.room.findFirst({
        where: { id: candidate.id, hotelId },
        include: { roomType: true },
      });

      if (!lockedRoom || NON_SELLABLE_ROOM_STATUSES.includes(lockedRoom.status)) {
        continue;
      }

      const recheckStay = await this.hasOverlappingActiveStay(
        tx,
        hotelId,
        lockedRoom.id,
        checkInAt,
        checkOutAt,
      );
      if (recheckStay) {
        continue;
      }

      const recheckRes = await this.hasOverlappingReservation(
        tx,
        hotelId,
        lockedRoom.id,
        checkInAt,
        checkOutAt,
      );
      if (recheckRes) {
        continue;
      }

      selectedRoom = lockedRoom;
      break;
    }

    if (!selectedRoom) {
      throw new ConflictException("NO_AVAILABLE_ROOM");
    }

    return this.formatAllocatedRoom(selectedRoom);
  }

  private parseInterval(input: AllocateRoomInput): { checkInAt: Date; checkOutAt: Date } {
    const checkIn =
      input.checkInAt ??
      (input.interval as any)?.checkInAt ??
      (input.interval as any)?.checkIn ??
      (input.interval as any)?.start;
    const checkOut =
      input.checkOutAt ??
      (input.interval as any)?.checkOutAt ??
      (input.interval as any)?.checkOut ??
      (input.interval as any)?.end;

    if (!checkIn || !checkOut) {
      throw new BadRequestException("Khoảng thời gian nhận và trả phòng không hợp lệ");
    }

    const checkInAt = new Date(checkIn);
    const checkOutAt = new Date(checkOut);

    if (isNaN(checkInAt.getTime()) || isNaN(checkOutAt.getTime())) {
      throw new BadRequestException("Ngày nhận hoặc trả phòng không hợp lệ");
    }

    if (checkInAt.getTime() >= checkOutAt.getTime()) {
      throw new BadRequestException("Ngày trả phòng phải sau ngày nhận phòng");
    }

    return { checkInAt, checkOutAt };
  }

  private extractRoomTypeCriteria(input: AllocateRoomInput): {
    targetId?: string;
    targetName?: string;
  } {
    let targetId: string | undefined = input.roomTypeId;
    let targetName: string | undefined;

    if (typeof input.roomType === "string") {
      if (!targetId) targetId = input.roomType;
      targetName = input.roomType;
    } else if (typeof input.roomType === "object" && input.roomType !== null) {
      targetId = input.roomType.roomTypeId ?? input.roomType.id ?? targetId;
      targetName = input.roomType.name;
    }

    return { targetId, targetName };
  }

  private async resolveRoomTypeRecord(
    tx: Prisma.TransactionClient,
    hotelId: string,
    criteria: { targetId?: string; targetName?: string },
  ) {
    if (!tx.roomType?.findFirst) return null;
    const orConditions: Prisma.RoomTypeWhereInput[] = [];
    if (criteria.targetId) {
      orConditions.push({ id: criteria.targetId });
    }
    if (criteria.targetName) {
      orConditions.push({ name: criteria.targetName });
      const normalizedKey = criteria.targetName
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      orConditions.push({ normalizedKey });
    }
    if (orConditions.length === 0) return null;

    return tx.roomType.findFirst({
      where: {
        hotelId,
        OR: orConditions,
      },
      select: { id: true, name: true, normalizedKey: true },
    });
  }

  private isRoomMatchingType(
    room: {
      roomTypeId?: string | null;
      type?: string | null;
      roomType?: { id: string; name: string; normalizedKey?: string } | null;
    },
    criteria: { targetId?: string; targetName?: string },
    resolvedRoomType: { id: string; name: string; normalizedKey: string } | null,
  ): boolean {
    if (resolvedRoomType) {
      if (room.roomTypeId && room.roomTypeId === resolvedRoomType.id) {
        return true;
      }
      if (room.roomType && room.roomType.id === resolvedRoomType.id) {
        return true;
      }
      if (room.type) {
        const roomNorm = room.type.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
        if (roomNorm === resolvedRoomType.normalizedKey || room.type === resolvedRoomType.name) {
          return true;
        }
      }
      return false;
    }

    if (criteria.targetId && room.roomTypeId === criteria.targetId) {
      return true;
    }
    if (criteria.targetId && room.roomType?.id === criteria.targetId) {
      return true;
    }
    if (criteria.targetName && room.type === criteria.targetName) {
      return true;
    }
    if (criteria.targetId && room.type === criteria.targetId) {
      return true;
    }
    return false;
  }

  private async hasOverdueActiveStay(
    tx: Prisma.TransactionClient,
    hotelId: string,
    roomId: string,
    now: Date,
  ): Promise<boolean> {
    if (!tx.guestStay?.findFirst) return false;

    const overdue = await tx.guestStay.findFirst({
      where: {
        hotelId,
        roomId,
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
      select: { id: true },
    });

    return Boolean(overdue);
  }

  private async hasOverlappingActiveStay(
    tx: Prisma.TransactionClient,
    hotelId: string,
    roomId: string,
    checkInAt: Date,
    checkOutAt: Date,
  ): Promise<boolean> {
    if (!tx.guestStay?.findFirst) return false;

    const stayOverlap = await tx.guestStay.findFirst({
      where: {
        hotelId,
        roomId,
        status: { in: ACTIVE_STAY_STATUSES },
        plannedCheckInAt: { lt: checkOutAt },
        plannedCheckOutAt: { gt: checkInAt },
      },
      select: { id: true },
    });

    return Boolean(stayOverlap);
  }

  private async hasOverlappingReservation(
    tx: Prisma.TransactionClient,
    hotelId: string,
    roomId: string,
    checkInAt: Date,
    checkOutAt: Date,
  ): Promise<boolean> {
    if (!tx.reservation?.findFirst) return false;

    const resOverlap = await tx.reservation.findFirst({
      where: {
        hotelId,
        roomId,
        status: { in: ACTIVE_RESERVATION_STATUSES },
        plannedCheckInAt: { lt: checkOutAt },
        plannedCheckOutAt: { gt: checkInAt },
      },
      select: { id: true },
    });

    return Boolean(resOverlap);
  }

  private async lockRoomRow(
    tx: Prisma.TransactionClient,
    hotelId: string,
    roomId: string,
  ): Promise<void> {
    if (typeof (tx as any).$queryRawUnsafe === "function") {
      await (tx as any).$queryRawUnsafe(
        'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        roomId,
        hotelId,
      );
    } else if (typeof (tx as any).$queryRaw === "function") {
      await (tx as any)
        .$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} AND "hotelId" = ${hotelId} FOR UPDATE`;
    }
  }

  private isRetryableConcurrencyError(error: unknown): boolean {
    if (error instanceof ConflictException) {
      const response = error.getResponse();
      const message = typeof response === "string" ? response : (response as any)?.message;
      if (
        message === "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT" ||
        message === "ROOM_ALLOCATION_CONFLICT" ||
        message === "ROOM_RESERVATION_OVERLAP"
      ) {
        return true;
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return true;
      if (error.code === "P2002") return true;
      if (error.code === "P2028") return true;
    }
    const err = error as any;
    if (err?.code === "40001" || err?.code === "40P01") return true;
    return false;
  }

  private formatAllocatedRoom(room: any): AllocatedRoomResult {
    return {
      id: room.id,
      roomId: room.id,
      roomNumber: room.roomNumber,
      hotelId: room.hotelId,
      roomTypeId: room.roomTypeId ?? null,
      type: room.type ?? room.roomType?.name ?? null,
      status: room.status,
      price: room.price ?? room.roomType?.basePrice ?? null,
      floor: room.floor ?? null,
      room,
    };
  }
}
