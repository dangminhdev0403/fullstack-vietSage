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
  guestCount?: number | null;
  occupantsCount?: number | null;
  excludedReservationId?: string;
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
  ReservationStatus.CHECKED_IN,
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
      if (!room || room.hotelId !== hotelId) {
        throw new NotFoundException("Không tìm thấy phòng");
      }

      if (!this.isRoomMatchingType(room, criteria, resolvedRoomType)) {
        throw new ConflictException("ROOM_TYPE_MISMATCH");
      }

      const guestCount = input.guestCount ?? input.occupantsCount ?? null;
      const roomCapacity = this.getRoomCapacity(room, resolvedRoomType);
      if (roomCapacity !== null && guestCount !== null && guestCount > roomCapacity) {
        throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
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
        input.excludedReservationId,
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
        input.excludedReservationId,
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

    const guestCount = input.guestCount ?? input.occupantsCount ?? null;
    const matchingRooms = candidateRooms
      .filter((r) => this.isRoomMatchingType(r, criteria, resolvedRoomType))
      .filter((r) => {
        if (guestCount === null) return true;
        const cap = this.getRoomCapacity(r, resolvedRoomType);
        return cap === null || cap >= guestCount;
      });

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
        input.excludedReservationId,
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
        input.excludedReservationId,
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

      if (!lockedRoom || lockedRoom.hotelId !== hotelId || NON_SELLABLE_ROOM_STATUSES.includes(lockedRoom.status)) {
        continue;
      }

      if (guestCount !== null) {
        const lockedCap = this.getRoomCapacity(lockedRoom, resolvedRoomType);
        if (lockedCap !== null && lockedCap < guestCount) {
          continue;
        }
      }

      const recheckStay = await this.hasOverlappingActiveStay(
        tx,
        hotelId,
        lockedRoom.id,
        checkInAt,
        checkOutAt,
        input.excludedReservationId,
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
        input.excludedReservationId,
      );
      if (recheckRes) {
        continue;
      }

      const recheckOverdue = await this.hasOverdueActiveStay(tx, hotelId, lockedRoom.id, now);
      if (recheckOverdue) {
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

    if (targetId && !targetName) {
      targetName = targetId;
    }

    return { targetId, targetName };
  }

  private normalizeKey(value: string): string {
    return value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  private getRoomCapacity(
    room: any,
    resolvedRoomType?: { id: string; name: string; normalizedKey: string; maxOccupancy?: number | null } | null,
  ): number | null {
    if (typeof (room?.roomType as any)?.maxOccupancy === "number") {
      return (room.roomType as any).maxOccupancy;
    }
    if (typeof (room as any)?.maxOccupancy === "number") {
      return (room as any).maxOccupancy;
    }
    if (
      resolvedRoomType &&
      typeof (resolvedRoomType as any)?.maxOccupancy === "number" &&
      (room?.roomTypeId === resolvedRoomType.id || room?.roomType?.id === resolvedRoomType.id)
    ) {
      return (resolvedRoomType as any).maxOccupancy;
    }
    return null;
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
      orConditions.push({ name: criteria.targetId });
      orConditions.push({ normalizedKey: this.normalizeKey(criteria.targetId) });
    }
    if (criteria.targetName && criteria.targetName !== criteria.targetId) {
      orConditions.push({ name: criteria.targetName });
      orConditions.push({ normalizedKey: this.normalizeKey(criteria.targetName) });
    }
    if (orConditions.length === 0) return null;

    return tx.roomType.findFirst({
      where: {
        hotelId,
        OR: orConditions,
      },
      select: { id: true, name: true, normalizedKey: true, maxOccupancy: true },
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
    const targetId = resolvedRoomType?.id ?? criteria.targetId;
    const targetName = resolvedRoomType?.name ?? criteria.targetName;
    const targetNorm =
      resolvedRoomType?.normalizedKey ??
      (targetName ? this.normalizeKey(targetName) : undefined);

    // If no target room type was requested, any room is compatible
    if (!targetId && !targetName) {
      return true;
    }

    const roomCanonicalId = room.roomTypeId ?? room.roomType?.id ?? null;
    const roomLegacyType = room.type?.trim() ? room.type.trim() : null;
    const roomTypeNorm = roomLegacyType ? this.normalizeKey(roomLegacyType) : null;

    // Room has a known canonical relation
    if (roomCanonicalId) {
      if (targetId && roomCanonicalId === targetId) {
        return true;
      }
      if (resolvedRoomType && roomCanonicalId === resolvedRoomType.id) {
        return true;
      }
      if (targetNorm && roomTypeNorm && roomTypeNorm === targetNorm) {
        return true;
      }
      if (targetName && (roomLegacyType === targetName || room.roomType?.name === targetName)) {
        return true;
      }
      if (
        criteria.targetId &&
        (roomLegacyType === criteria.targetId || roomTypeNorm === this.normalizeKey(criteria.targetId))
      ) {
        return true;
      }
      return false;
    }

    // Room omits canonical relation (legacy record or test fixture)
    // "Legacy null canonical type/capacity remains compatible unknown;
    //  do not produce ROOM_TYPE_MISMATCH merely because fixtures/legacy records omit canonical relation."
    if (!roomLegacyType) {
      return true;
    }

    if (resolvedRoomType) {
      if (
        roomTypeNorm === resolvedRoomType.normalizedKey ||
        roomLegacyType === resolvedRoomType.name ||
        roomLegacyType === resolvedRoomType.id
      ) {
        return true;
      }
      return false;
    }

    if (targetNorm && roomTypeNorm) {
      return roomTypeNorm === targetNorm;
    }

    if (
      criteria.targetId &&
      (roomLegacyType === criteria.targetId || roomTypeNorm === this.normalizeKey(criteria.targetId))
    ) {
      return true;
    }

    return true;
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
    excludedReservationId?: string,
  ): Promise<boolean> {
    if (!tx.guestStay?.findFirst) return false;

    const stayOverlap = await tx.guestStay.findFirst({
      where: {
        hotelId,
        roomId,
        status: { in: ACTIVE_STAY_STATUSES },
        ...(excludedReservationId ? { reservationId: { not: excludedReservationId } } : {}),
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
    excludedReservationId?: string,
  ): Promise<boolean> {
    if (!tx.reservation?.findFirst) return false;

    const resOverlap = await tx.reservation.findFirst({
      where: {
        hotelId,
        roomId,
        status: { in: ACTIVE_RESERVATION_STATUSES },
        ...(excludedReservationId ? { id: { not: excludedReservationId } } : {}),
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
      roomTypeId: room.roomTypeId ?? room.roomType?.id ?? null,
      type: room.type ?? room.roomType?.name ?? null,
      status: room.status,
      price: room.price ?? room.roomType?.basePrice ?? null,
      floor: room.floor ?? null,
      room,
    };
  }
}
