import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  GuestStayStatus,
  HotelStatus,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { CodesService } from "../../codes/codes-public";
import { ReservationRoomAllocationService } from "../../property/application/reservation-room-allocation.service";
import {
  CreateHoldDto,
  DirectBookingStatusQueryDto,
} from "../domain/schemas/direct-booking.schema";

export interface DirectBookingHold {
  holdId: string;
  hotelId: string;
  roomTypeId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  roomsCount: number;
  guest?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  ttlMinutes: number;
  expiresAt: Date;
  status: "HELD" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  createdAt: Date;
  idempotencyKey?: string;
  operationKey?: string;
  reservationId?: string;
  reservationCode?: string;
  bookingId?: string;
  confirmedAt?: string;
  assignedRoom?: {
    room_number: string;
    floor: number | string | null;
  };
}

export interface DirectBookingConfirmResult {
  reservation_id: string;
  reservation_code: string;
  hold_id: string;
  booking_id: string;
  status: "CONFIRMED";
  room_status: "RESERVED";
  assigned_room: {
    room_number: string;
    floor: number | string | null;
  };
  confirmed_at: string;
}

const NON_SELLABLE_ROOM_STATUSES: RoomStatus[] = [
  RoomStatus.BLOCKED,
  RoomStatus.MAINTENANCE,
  RoomStatus.OUT_OF_SERVICE,
];

function parseVietnamDate(dateStr: string, timeStr = "14:00:00"): Date {
  if (dateStr.includes("T")) {
    return new Date(dateStr);
  }
  return new Date(`${dateStr}T${timeStr}+07:00`);
}

@Injectable()
export class DirectBookingService {
  private readonly holds = new Map<string, DirectBookingHold>();
  private readonly confirmedBookings = new Map<string, DirectBookingConfirmResult>();
  private readonly operations = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject("RESERVATION_ROOM_ALLOCATION_SERVICE")
    private readonly roomAllocationService: ReservationRoomAllocationService,
    @Optional()
    private readonly codesService?: CodesService,
  ) {}

  private async resolveEffectiveHotelAndRoomType(
    rawHotelId: string,
    rawRoomTypeId: string,
  ): Promise<{ hotelId: string; roomTypeId: string; candidateRoomIds: string[] }> {
    let hotel: any = null;
    if (this.prisma.hotel?.findFirst) {
      if (rawHotelId && rawHotelId.includes("@")) {
        hotel = await this.prisma.hotel.findFirst({
          where: {
            OR: [
              {
                staffAssignments: {
                  some: {
                    user: {
                      email: { equals: rawHotelId.trim(), mode: "insensitive" },
                    },
                  },
                },
              },
              {
                tenant: {
                  tenantUsers: {
                    some: {
                      user: {
                        email: { equals: rawHotelId.trim(), mode: "insensitive" },
                      },
                    },
                  },
                },
              },
            ],
          },
        });
      }

      if (!hotel) {
        hotel = await this.prisma.hotel.findFirst({
          where: {
            OR: [{ id: rawHotelId }, { code: rawHotelId }],
          },
        });
      }

      if (!hotel) {
        hotel = await this.prisma.hotel.findFirst({
          where: { status: HotelStatus.ACTIVE },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    const hotelId = hotel?.id || rawHotelId;

    let rooms: any[] = [];
    if (this.prisma.room?.findMany) {
      rooms = await this.prisma.room.findMany({
        where: {
          hotelId,
          OR: [
            { roomTypeId: rawRoomTypeId },
            { type: rawRoomTypeId },
            { roomType: { id: rawRoomTypeId } },
            { roomType: { normalizedKey: rawRoomTypeId.toLowerCase().trim() } },
            { roomType: { name: { contains: rawRoomTypeId.trim(), mode: "insensitive" } } },
          ],
          status: { notIn: NON_SELLABLE_ROOM_STATUSES },
        },
        select: { id: true, roomTypeId: true },
      });

      if (rooms.length === 0) {
        rooms = await this.prisma.room.findMany({
          where: {
            hotelId,
            status: { notIn: NON_SELLABLE_ROOM_STATUSES },
          },
          select: { id: true, roomTypeId: true },
        });
      }
    }

    const candidateRoomIds = rooms.map((r) => r.id);
    const resolvedRoomTypeId = rooms[0]?.roomTypeId || rawRoomTypeId;

    return { hotelId, roomTypeId: resolvedRoomTypeId, candidateRoomIds };
  }

  /**
   * Tạo hold trong bộ nhớ / DB, khóa tạm thời tồn kho.
   */
  async createHold(dto: CreateHoldDto): Promise<{ hold_id: string; expires_at: string }> {
    const {
      hotel_id: rawHotelId,
      room_type_id: rawRoomTypeId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      rooms_count: requestedRoomsCount = 1,
      guest,
      ttl_minutes = 30,
      idempotency_key: idempotencyKey,
      operation_key: operationKey,
    } = dto;

    if (checkOutDate <= checkInDate) {
      throw new BadRequestException("check_out_date phải sau check_in_date");
    }

    // Check existing operationKey / idempotencyKey for idempotent replay
    const effectiveOpKey = operationKey || (idempotencyKey ? `hold:${idempotencyKey}` : undefined);
    if (effectiveOpKey && this.operations.has(effectiveOpKey)) {
      const existing = this.operations.get(effectiveOpKey);
      if (existing.hold_id && this.holds.has(existing.hold_id)) {
        const hold = this.holds.get(existing.hold_id)!;
        if (hold.status === "HELD" && hold.expiresAt.getTime() > Date.now()) {
          return {
            hold_id: hold.holdId,
            expires_at: hold.expiresAt.toISOString(),
          };
        }
      }
    }

    const checkInAt = parseVietnamDate(checkInDate, "14:00:00");
    const checkOutAt = parseVietnamDate(checkOutDate, "12:00:00");

    // 1. Lấy danh sách phòng khả dụng theo hạng phòng từ DB với fallback mapping
    const {
      hotelId,
      roomTypeId,
      candidateRoomIds,
    } = await this.resolveEffectiveHotelAndRoomType(rawHotelId, rawRoomTypeId);

    if (candidateRoomIds.length === 0) {
      throw new ConflictException("ROOM_NOT_AVAILABLE");
    }

    // 2. Kiểm tra reservation đang active trùng lịch [checkInAt, checkOutAt)
    const activeReservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        roomId: { in: candidateRoomIds },
        status: {
          in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY],
        },
        plannedCheckInAt: { lt: checkOutAt },
        plannedCheckOutAt: { gt: checkInAt },
      },
      select: { roomId: true },
    });

    const activeStays = this.prisma.guestStay?.findMany
      ? await this.prisma.guestStay.findMany({
          where: {
            hotelId,
            roomId: { in: candidateRoomIds },
            status: {
              in: [
                GuestStayStatus.CHECKED_IN,
                GuestStayStatus.ACTIVE,
                GuestStayStatus.CHECKOUT_PENDING,
                GuestStayStatus.RESERVED,
              ],
            },
            plannedCheckInAt: { lt: checkOutAt },
            plannedCheckOutAt: { gt: checkInAt },
          },
          select: { roomId: true },
        })
      : [];

    const reservedRoomIdSet = new Set<string>();
    for (const r of activeReservations) {
      if (r.roomId) reservedRoomIdSet.add(r.roomId);
    }
    for (const s of activeStays) {
      if (s.roomId) reservedRoomIdSet.add(s.roomId);
    }

    // 3. Tính toán các hold đang giữ chỗ chưa hết hạn trong bộ nhớ
    const now = Date.now();
    let currentHeldCount = 0;
    for (const hold of this.holds.values()) {
      if (
        hold.hotelId === hotelId &&
        hold.roomTypeId === roomTypeId &&
        hold.status === "HELD" &&
        hold.expiresAt.getTime() > now
      ) {
        // Kiểm tra overlap ngày [checkInDate, checkOutDate)
        if (hold.checkInDate < checkOutDate && hold.checkOutDate > checkInDate) {
          currentHeldCount += hold.roomsCount;
        }
      }
    }

    const availableInventory =
      candidateRoomIds.length - reservedRoomIdSet.size - currentHeldCount;

    if (availableInventory < requestedRoomsCount) {
      throw new ConflictException("ROOM_NOT_AVAILABLE");
    }

    // 4. Khởi tạo hold record
    const holdId = `hld_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const expiresAt = new Date(now + ttl_minutes * 60 * 1000);

    const holdRecord: DirectBookingHold = {
      holdId,
      hotelId,
      roomTypeId,
      checkInDate,
      checkOutDate,
      roomsCount: requestedRoomsCount,
      guest,
      ttlMinutes: ttl_minutes,
      expiresAt,
      status: "HELD",
      createdAt: new Date(),
      idempotencyKey,
      operationKey: effectiveOpKey,
    };

    this.holds.set(holdId, holdRecord);

    const result = {
      hold_id: holdId,
      expires_at: expiresAt.toISOString(),
    };

    if (effectiveOpKey) {
      this.operations.set(effectiveOpKey, result);
    }

    return result;
  }

  /**
   * Tiêu thụ hold & tự động gán phòng.
   * BẤT BIẾN: Trạng thái phòng vật lý phải là RESERVED, TUYỆT ĐỐI KHÔNG ĐƯỢC để OCCUPIED trước check-in.
   */
  async confirmHold(
    holdId: string,
    bookingId: string,
    operationKey?: string,
  ): Promise<DirectBookingConfirmResult> {
    if (!holdId) {
      throw new BadRequestException("hold_id là bắt buộc");
    }
    if (!bookingId) {
      throw new BadRequestException("booking_id là bắt buộc");
    }

    const effectiveOpKey = operationKey || `confirm-hold:${holdId}:${bookingId}`;

    // Kiểm tra idempotent replay
    if (this.confirmedBookings.has(bookingId)) {
      return this.confirmedBookings.get(bookingId)!;
    }
    if (effectiveOpKey && this.operations.has(effectiveOpKey)) {
      return this.operations.get(effectiveOpKey);
    }

    const hold = this.holds.get(holdId);
    if (!hold) {
      throw new NotFoundException(`Không tìm thấy hold với mã: ${holdId}`);
    }

    if (hold.status === "RELEASED") {
      throw new ConflictException("Hold đã bị giải phóng trước đó");
    }

    if (Date.now() > hold.expiresAt.getTime()) {
      hold.status = "EXPIRED";
      throw new ConflictException("HOLD_EXPIRED");
    }

    if (hold.status === "CONFIRMED") {
      if (hold.bookingId === bookingId && this.confirmedBookings.has(bookingId)) {
        return this.confirmedBookings.get(bookingId)!;
      }
      throw new ConflictException("Hold đã được xác nhận cho đơn đặt phòng khác");
    }

    const checkInAt = parseVietnamDate(hold.checkInDate, "14:00:00");
    const checkOutAt = parseVietnamDate(hold.checkOutDate, "12:00:00");

    // Thực thi transaction xác nhận đặt phòng và tự gán phòng
    const confirmResult = await this.prisma.$transaction(async (tx) => {
      // Gọi ReservationRoomAllocationService với mode: 'auto'
      const allocated = await this.roomAllocationService.allocateRoom(tx, {
        hotelId: hold.hotelId,
        roomTypeId: hold.roomTypeId,
        interval: { checkInAt, checkOutAt },
        mode: "auto",
      });

      // Tạo mã đặt phòng
      let reservationCode: string;
      if (this.codesService?.generateEntityCode) {
        try {
          reservationCode = await this.codesService.generateEntityCode("RESERVATION", tx);
        } catch {
          reservationCode = `VS-${bookingId.slice(0, 8).toUpperCase()}`;
        }
      } else {
        reservationCode = `VS-${bookingId.slice(0, 8).toUpperCase()}`;
      }

      // Tạo bản ghi Reservation trong Prisma với status: CONFIRMED
      const reservation = await tx.reservation.create({
        data: {
          hotelId: hold.hotelId,
          roomId: allocated.roomId,
          reservationCode,
          guestDisplayName: hold.guest?.name || "OTA Guest",
          guestPhone: hold.guest?.phone || null,
          plannedCheckInAt: checkInAt,
          plannedCheckOutAt: checkOutAt,
          status: ReservationStatus.CONFIRMED,
          assignedAt: new Date(),
          roomTypeSnapshot: allocated.type || hold.roomTypeId,
        },
        include: { room: true },
      });

      // BẮT BUỘC: Cập nhật trạng thái phòng vật lý thành RoomStatus.RESERVED
      // TUYỆT ĐỐI KHÔNG ĐƯỢC để OCCUPIED trước check-in thực tế
      await tx.room.update({
        where: { id: allocated.roomId },
        data: { status: RoomStatus.RESERVED },
      });

      let floorVal: number | string | null = null;
      if (allocated.floor !== null && allocated.floor !== undefined) {
        const parsed = parseInt(String(allocated.floor), 10);
        floorVal = !isNaN(parsed) ? parsed : String(allocated.floor);
      }

      const confirmedAt = new Date().toISOString();

      const result: DirectBookingConfirmResult = {
        reservation_id: reservation.id,
        reservation_code: reservation.reservationCode,
        hold_id: hold.holdId,
        booking_id: bookingId,
        status: "CONFIRMED",
        room_status: "RESERVED",
        assigned_room: {
          room_number: allocated.roomNumber,
          floor: floorVal,
        },
        confirmed_at: confirmedAt,
      };

      return result;
    });

    // Cập nhật trạng thái hold trong bộ nhớ
    hold.status = "CONFIRMED";
    hold.reservationId = confirmResult.reservation_id;
    hold.reservationCode = confirmResult.reservation_code;
    hold.bookingId = bookingId;
    hold.confirmedAt = confirmResult.confirmed_at;
    hold.assignedRoom = confirmResult.assigned_room;

    this.confirmedBookings.set(bookingId, confirmResult);
    if (effectiveOpKey) {
      this.operations.set(effectiveOpKey, confirmResult);
    }

    return confirmResult;
  }

  /**
   * Giải phóng hold.
   */
  async releaseHold(
    holdId: string,
    reason?: string,
  ): Promise<{ hold_id: string; status: "RELEASED" }> {
    if (!holdId) {
      throw new BadRequestException("hold_id là bắt buộc");
    }

    const hold = this.holds.get(holdId);
    if (hold && hold.status === "HELD") {
      hold.status = "RELEASED";
    }

    return {
      hold_id: holdId,
      status: "RELEASED",
    };
  }

  /**
   * Tra cứu trạng thái đơn theo operation_key hoặc booking_id phục vụ đối soát.
   */
  async getStatus(query: DirectBookingStatusQueryDto): Promise<any> {
    const { operation_key: opKey, booking_id: bookingId, hold_id: holdId } = query;

    // 1. Kiểm tra trong operations map
    if (opKey && this.operations.has(opKey)) {
      const opData = this.operations.get(opKey);
      if (opData.reservation_id || opData.status === "CONFIRMED") {
        return {
          confirmed: true,
          ...opData,
        };
      }
      return {
        confirmed: false,
        ...opData,
      };
    }

    // 2. Kiểm tra trong confirmedBookings map
    if (bookingId && this.confirmedBookings.has(bookingId)) {
      const confirmData = this.confirmedBookings.get(bookingId)!;
      return {
        confirmed: true,
        ...confirmData,
      };
    }

    // 3. Kiểm tra trong holds map
    if (holdId && this.holds.has(holdId)) {
      const hold = this.holds.get(holdId)!;
      if (hold.status === "CONFIRMED" && hold.bookingId) {
        const confirmData = this.confirmedBookings.get(hold.bookingId);
        if (confirmData) {
          return {
            confirmed: true,
            ...confirmData,
          };
        }
      }
      return {
        confirmed: false,
        hold_id: hold.holdId,
        status: hold.status,
        hold_status: hold.status,
      };
    }

    // 4. Tra cứu dự phòng trong cơ sở dữ liệu Prisma nếu đã có Reservation
    if (bookingId) {
      const dbReservation = await this.prisma.reservation.findFirst({
        where: {
          OR: [
            { reservationCode: bookingId },
            { reservationCode: `VS-${bookingId.slice(0, 8).toUpperCase()}` },
          ],
        },
        include: { room: true },
      });

      if (dbReservation) {
        let floorVal: number | string | null = null;
        if (dbReservation.room?.floor !== null && dbReservation.room?.floor !== undefined) {
          const parsed = parseInt(String(dbReservation.room.floor), 10);
          floorVal = !isNaN(parsed) ? parsed : String(dbReservation.room.floor);
        }

        return {
          confirmed: true,
          reservation_id: dbReservation.id,
          reservation_code: dbReservation.reservationCode,
          booking_id: bookingId,
          status: dbReservation.status,
          room_status: dbReservation.room?.status || "RESERVED",
          assigned_room: dbReservation.room
            ? {
                room_number: dbReservation.room.roomNumber,
                floor: floorVal,
              }
            : null,
          confirmed_at: dbReservation.createdAt.toISOString(),
        };
      }
    }

    return {
      confirmed: false,
      status: "NOT_FOUND",
    };
  }
}
