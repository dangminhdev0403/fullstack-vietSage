import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
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
import { ReservationRoomAllocationService } from "../../property/property-public";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import {
  CatalogExportDto,
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
    room_id?: string;
    room_number: string;
    floor: number | string | null;
  };
  guestCount?: number;
}

export interface DirectBookingConfirmResult {
  reservation_id: string;
  reservation_code: string;
  hold_id: string;
  booking_id: string;
  status: "CONFIRMED";
  room_status: RoomStatus | string;
  assigned_room: {
    room_id?: string;
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
  private readonly logger = new Logger(DirectBookingService.name);
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

  private pruneExpiredHolds(now = Date.now()): void {
    for (const [holdId, hold] of this.holds.entries()) {
      if (hold.expiresAt.getTime() <= now) {
        this.holds.delete(holdId);
      }
    }
  }

  private async resolveEffectiveHotelAndRoomType(
    rawHotelId: string,
    rawRoomTypeId: string,
  ): Promise<{ hotelId: string; roomTypeId: string; candidateRoomIds: string[] }> {
    let hotel: any = null;
    const trimmedHotelId = rawHotelId?.trim() ?? "";
    if (this.prisma.hotel?.findFirst) {
      if (trimmedHotelId && trimmedHotelId.includes("@")) {
        hotel = await this.prisma.hotel.findFirst({
          where: {
            OR: [
              {
                staffAssignments: {
                  some: {
                    user: {
                      email: { equals: trimmedHotelId, mode: "insensitive" },
                    },
                  },
                },
              },
              {
                tenant: {
                  tenantUsers: {
                    some: {
                      user: {
                        email: { equals: trimmedHotelId, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
            ],
          },
        });
      }

      if (!hotel && trimmedHotelId) {
        hotel = await this.prisma.hotel.findFirst({
          where: {
            OR: [{ id: rawHotelId }, { code: rawHotelId }],
          },
        });
      }

      if (!hotel) {
        if (trimmedHotelId) {
          throw new NotFoundException(`Hotel '${rawHotelId}' not found`);
        }
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
    this.pruneExpiredHolds(now);
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

    const rawPartySize =
      (dto as any).guest_count ??
      (dto as any).guestCount ??
      (dto as any).party_size ??
      (dto as any).partySize ??
      (dto as any).occupantsCount;
    const holdGuestCount =
      typeof rawPartySize === "number" && rawPartySize > 0 ? rawPartySize : undefined;

    const holdRecord: DirectBookingHold = {
      holdId,
      hotelId,
      roomTypeId,
      checkInDate,
      checkOutDate,
      roomsCount: requestedRoomsCount,
      guest,
      guestCount: holdGuestCount,
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
    fallbackMeta?: {
      hotel_id?: string;
      room_type_id?: string;
      check_in_date?: string;
      check_out_date?: string;
      guest?: { name?: string; email?: string; phone?: string };
      amount?: number;
      currency?: string;
    },
    amount?: number,
    currency?: string,
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

    let hold = this.holds.get(holdId);

    // On-the-fly hold reconstruction: when hold is not in memory (server restart,
    // or booking-manager created booking without calling createHold first),
    // reconstruct from fallback metadata and proceed with confirmation
    if (!hold && fallbackMeta?.hotel_id && fallbackMeta?.room_type_id && fallbackMeta?.check_in_date && fallbackMeta?.check_out_date) {
      const {
        hotelId: effectiveHotelId,
        roomTypeId: effectiveRoomTypeId,
      } = await this.resolveEffectiveHotelAndRoomType(
        fallbackMeta.hotel_id,
        fallbackMeta.room_type_id,
      );

      const rawFallbackPartySize =
        (fallbackMeta as any).guest_count ??
        (fallbackMeta as any).guestCount ??
        (fallbackMeta as any).party_size;
      const fallbackGuestCount =
        typeof rawFallbackPartySize === "number" && rawFallbackPartySize > 0
          ? rawFallbackPartySize
          : undefined;

      const reconstructedHold: DirectBookingHold = {
        holdId,
        hotelId: effectiveHotelId,
        roomTypeId: effectiveRoomTypeId,
        checkInDate: fallbackMeta.check_in_date,
        checkOutDate: fallbackMeta.check_out_date,
        roomsCount: 1,
        guest: fallbackMeta.guest,
        guestCount: fallbackGuestCount,
        ttlMinutes: 30,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // extend TTL for reconstruction
        status: 'HELD',
        createdAt: new Date(),
      };
      this.holds.set(holdId, reconstructedHold);
      hold = reconstructedHold;
    }

    if (!hold) {
      throw new NotFoundException(`Không tìm thấy hold với mã: ${holdId}`);
    }

    // Ensure effective hotelId and roomTypeId in case hold was created with external raw IDs
    const {
      hotelId: effectiveHotelId,
      roomTypeId: effectiveRoomTypeId,
    } = await this.resolveEffectiveHotelAndRoomType(hold.hotelId, hold.roomTypeId);
    hold.hotelId = effectiveHotelId;
    hold.roomTypeId = effectiveRoomTypeId;

    if (hold.status === "RELEASED") {
      throw new ConflictException("Hold đã bị giải phóng trước đó");
    }

    // Skip expiry check for reconstructed holds (they were just created)
    if (Date.now() > hold.expiresAt.getTime() && !fallbackMeta) {
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
    const effectiveAmount = fallbackMeta?.amount ?? amount;
    const effectiveCurrency = (fallbackMeta?.currency ?? currency ?? "VND").toUpperCase();
    if (effectiveCurrency !== "VND") {
      throw new BadRequestException("UNSUPPORTED_BOOKING_CURRENCY");
    }
    const nights = Math.max(1, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 86400000));
    const nightlyRateSnapshot =
      effectiveAmount !== undefined
        ? new Prisma.Decimal(effectiveAmount)
            .div(nights)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        : null;

    const effectivePartySize =
      hold.guestCount ??
      ((fallbackMeta as any)?.guest_count ?? (fallbackMeta as any)?.guestCount);

    // Thực thi transaction xác nhận đặt phòng và tự gán phòng
    const confirmResult = await this.prisma.$transaction(async (tx) => {
      // Gọi ReservationRoomAllocationService với mode: 'auto'
      const allocated = await this.roomAllocationService.allocateRoom(tx, {
        hotelId: hold.hotelId,
        roomTypeId: hold.roomTypeId,
        interval: { checkInAt, checkOutAt },
        mode: "auto",
        ...(effectivePartySize ? { guestCount: effectivePartySize } : {}),
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

      // Resolve canonical roomTypeId if possible
      let canonicalRoomTypeId: string | null = allocated.roomTypeId || null;
      if (!canonicalRoomTypeId && tx.roomType?.findFirst) {
        const rt = await tx.roomType.findFirst({
          where: {
            hotelId: hold.hotelId,
            OR: [
              { id: hold.roomTypeId },
              { normalizedKey: hold.roomTypeId.toLowerCase().trim() },
              { name: { equals: hold.roomTypeId.trim(), mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        if (rt) {
          canonicalRoomTypeId = rt.id;
        }
      }
      // Legacy allocations may not have a canonical room-type row yet. Keep the
      // nullable FK empty instead of persisting an external/type-name identifier.

      // Tạo bản ghi Reservation trong Prisma với status: ARRIVAL_READY
      const reservation = await tx.reservation.create({
        data: {
          hotelId: hold.hotelId,
          roomId: allocated.roomId,
          roomTypeId: canonicalRoomTypeId,
          reservationCode,
          guestDisplayName: hold.guest?.name || "OTA Guest",
          guestPhone: hold.guest?.phone || null,
          plannedCheckInAt: checkInAt,
          plannedCheckOutAt: checkOutAt,
          baseNightlyRateSnapshot: allocated.price ?? null,
          nightlyRateSnapshot: nightlyRateSnapshot ?? allocated.price ?? null,
          status: ReservationStatus.ARRIVAL_READY,
          assignedAt: new Date(),
          roomTypeSnapshot: allocated.type || hold.roomTypeId,
          ...(effectivePartySize ? { guestCount: effectivePartySize } : {}),
        },
        include: { room: true },
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
        room_status: allocated.status || "AVAILABLE",
        assigned_room: {
          room_id: allocated.roomId,
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

    // Phát sự kiện realtime thông báo tức thì cho Tenant/Owner và Frontdesk/Lễ tân
    try {
      const effectiveAmount = fallbackMeta?.amount ?? amount ?? null;
      const effectiveCurrency = fallbackMeta?.currency ?? currency ?? "VND";

      RequestRealtimeEmitter.emitChannelBookingCreated({
        hotelId: hold.hotelId,
        bookingId,
        reservationId: confirmResult.reservation_id,
        otaName: "Booking Engine (VietSage Direct)",
        reservationCode: confirmResult.reservation_code,
        guestName: hold.guest?.name || "Khách đặt trực tiếp",
        roomNumber: confirmResult.assigned_room?.room_number ?? null,
        roomType: hold.roomTypeId,
        checkInDate: hold.checkInDate,
        checkOutDate: hold.checkOutDate,
        amount: effectiveAmount,
        currency: effectiveCurrency,
      });
    } catch (emitErr) {
      this.logger.warn(`[DirectBooking] Lỗi khi phát realtime event cho booking ${bookingId}: ${emitErr}`);
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
          room_status: dbReservation.room?.status || "AVAILABLE",
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

  /**
   * Xuất danh mục phòng và giá cơ sở từ VietSage PMS cho OTA Booking Manager
   */
  async exportRoomCatalog(dto: CatalogExportDto) {
    const rawHotelId = dto.hotel_id;
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

      if (!hotel && rawHotelId?.trim()) {
        hotel = await this.prisma.hotel.findFirst({
          where: {
            OR: [{ id: rawHotelId }, { code: rawHotelId }],
          },
        });
      }

      if (!hotel) {
        if (rawHotelId && rawHotelId.trim().length > 0) {
          throw new NotFoundException(`Hotel '${rawHotelId}' not found`);
        }
        hotel = await this.prisma.hotel.findFirst({
          where: { status: HotelStatus.ACTIVE },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    if (!hotel) {
      throw new NotFoundException("Không tìm thấy khách sạn tương ứng trên VietSage PMS");
    }

    const roomTypes = await this.prisma.roomType.findMany({
      where: { hotelId: hotel.id },
      include: {
        rooms: {
          select: {
            id: true,
            roomNumber: true,
            floor: true,
            price: true,
            status: true,
          },
        },
      },
    });

    const unassignedRooms = await this.prisma.room.findMany({
      where: {
        hotelId: hotel.id,
        roomTypeId: null,
      },
      select: {
        id: true,
        type: true,
        roomNumber: true,
        floor: true,
        price: true,
      },
    });

    const catalogMap = new Map<string, any>();

    for (const rt of roomTypes) {
      const avgPrice = rt.basePrice
        ? Number(rt.basePrice)
        : rt.rooms[0]?.price
        ? Number(rt.rooms[0].price)
        : 1500000;

      const isSuite = rt.name.toLowerCase().includes("suite") || rt.normalizedKey.includes("suite");
      const isSingle = rt.name.toLowerCase().includes("single") || rt.normalizedKey.includes("single");

      catalogMap.set(rt.normalizedKey, {
        name: rt.name,
        normalized_key: rt.normalizedKey,
        base_price: avgPrice,
        total_rooms: rt.rooms.length,
        max_guests: isSuite ? 4 : isSingle ? 1 : 2,
        bed_type: isSuite ? "1 Giường King-size" : isSingle ? "1 Giường Đơn Twin" : "1 Giường King hoặc 2 Twin",
        area_sqm: isSuite ? 65 : isSingle ? 28 : 42,
        has_sea_view: false,
        sample_room_numbers: rt.rooms.slice(0, 5).map((r) => r.roomNumber),
        amenities: [
          "Wifi tốc độ cao miễn phí",
          "Điều hòa không khí 2 chiều",
          "Phòng tắm nước nóng & vòi sen",
          "Smart TV màn hình phẳng",
          "Két an toàn điện tử",
        ],
      });
    }

    for (const r of unassignedRooms) {
      const typeKey = (r.type || "Standard").toLowerCase().replace(/\s+/g, "_");
      if (!catalogMap.has(typeKey)) {
        catalogMap.set(typeKey, {
          name: r.type || "Phòng Tiêu Chuẩn",
          normalized_key: typeKey,
          base_price: r.price ? Number(r.price) : 1200000,
          total_rooms: 1,
          max_guests: 2,
          bed_type: "1 Giường Đôi",
          area_sqm: 35,
          has_sea_view: false,
          sample_room_numbers: [r.roomNumber],
          amenities: [
            "Wifi tốc độ cao miễn phí",
            "Điều hòa không khí",
            "Smart TV màn hình phẳng",
          ],
        });
      } else {
        const item = catalogMap.get(typeKey);
        item.total_rooms += 1;
        if (item.sample_room_numbers.length < 5) {
          item.sample_room_numbers.push(r.roomNumber);
        }
      }
    }

    return {
      hotel_id: hotel.id,
      hotel_name: hotel.name,
      hotel_code: hotel.code,
      room_types: Array.from(catalogMap.values()),
    };
  }
}
