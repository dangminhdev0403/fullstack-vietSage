import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { GuestStayStatus, Prisma, ReservationStatus, RoomQRCodeStatus, RoomStatus } from "@prisma/client";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../common/security/token-hash.util";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  STAY_CHECK_IN_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
  type StayCheckInEventPublisher,
} from "../../../shared/events";
import { CodesService } from "../../codes/codes-public";
import { HotelAccessService } from "./hotel-access.service";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";
import type { RoomListRow } from "../infrastructure/repositories/hotel-repository.types";
import type {
  CheckOutBodyInput,
  ConfirmRoomReadyBodyInput,
  CreateRoomTypeBodyInput,
  CreateRoomBodyInput,
  CreateRoomsBodyInput,
  CreateStayBodyInput,
  ListRoomsQueryInput,
  QrReasonBodyInput,
  UpdateRoomBodyInput,
  UpdateRoomStatusBodyInput,
  UpdateStayBodyInput,
} from "../domain/schemas/rooms.schema";

import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

const MANUAL_ROOM_STATUSES = new Set<RoomStatus>([
  RoomStatus.AVAILABLE,
  RoomStatus.PROCESSING,
  RoomStatus.MAINTENANCE,
  RoomStatus.BLOCKED,
]);

const MANUAL_ROOM_STATUS_TRANSITIONS: Partial<Record<RoomStatus, ReadonlySet<RoomStatus>>> = {
  [RoomStatus.AVAILABLE]: new Set([
    RoomStatus.PROCESSING,
    RoomStatus.MAINTENANCE,
    RoomStatus.BLOCKED,
  ]),
  [RoomStatus.PROCESSING]: new Set([RoomStatus.MAINTENANCE, RoomStatus.BLOCKED]),
  [RoomStatus.MAINTENANCE]: new Set([
    RoomStatus.AVAILABLE,
    RoomStatus.PROCESSING,
    RoomStatus.BLOCKED,
  ]),
  [RoomStatus.BLOCKED]: new Set([
    RoomStatus.AVAILABLE,
    RoomStatus.PROCESSING,
    RoomStatus.MAINTENANCE,
  ]),
};

@Injectable()
export class HotelRoomsService {
  private readonly eventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly hotelRoomsRepository: HotelRoomsRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly logger: AppLogger = new AppLogger(),
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    eventPublisher?: GuestRequestEventPublisher,
    @Optional()
    @Inject(STAY_CHECK_IN_EVENT_PUBLISHER)
    private readonly stayCheckInPublisher?: StayCheckInEventPublisher,
  ) {
    this.eventPublisher = eventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }
  async listRoomTypes(actorUserId: string, activeRoleId: string, hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return { items: await this.hotelRoomsRepository.listRoomTypes(hotelId) };
  }

  async createRoomType(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateRoomTypeBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.hotelRoomsRepository.createRoomType(
      hotelId,
      dto.name,
      dto.basePrice,
      dto.maxOccupancy,
    );
  }

  async updateRoomTypePrice(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomTypeId: string,
    basePrice?: number,
    maxOccupancy?: number | null,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.hotelRoomsRepository.updateRoomTypePrice(
      hotelId,
      roomTypeId,
      basePrice,
      maxOccupancy,
    );
  }
  async createRoom(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateRoomBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.createRoomRecord(hotelId, dto);
  }

  async createRooms(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateRoomsBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const items: Array<Awaited<ReturnType<typeof this.createRoomRecord>>> = [];

    for (const item of dto.items) {
      items.push(await this.createRoomRecord(hotelId, item));
    }

    return { total: items.length, items };
  }

  private async createRoomRecord(hotelId: string, dto: CreateRoomBodyInput) {
    const roomCode = await this.codesService.generateEntityCode("ROOM");
    const publicCode = this.generateQrCode();
    const room = await this.hotelRoomsRepository.createRoomWithQr({
      hotelId,
      code: roomCode,
      roomNumber: dto.roomNumber.trim(),
      floor: dto.floor?.trim(),
      zone: dto.zone === null ? null : dto.zone?.trim(),
      type: dto.type?.trim(),
      roomTypeId: dto.roomTypeId,
      newRoomType: dto.newRoomType,
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

  async listRooms(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListRoomsQueryInput,
  ) {
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.RoomWhereInput = {
      hotelId,
    };

    if (scope.allowedRoomId !== null) {
      where.id = scope.allowedRoomId;
    }

    if (query.unassignedOnly) {
      const assignedRoomIds = await this.hotelRoomsRepository.listAssignedRoomIds(hotelId);
      if (assignedRoomIds.length > 0) {
        if (typeof where.id === "string") {
          where.id = assignedRoomIds.includes(where.id) ? { in: [] } : where.id;
        } else {
          where.id = { notIn: assignedRoomIds };
        }
      }
    }

    const conditions: Prisma.RoomWhereInput[] = [];

    if (query.status) {
      if (query.status === "AVAILABLE") {
        conditions.push({
          status: RoomStatus.AVAILABLE,
          guestStays: {
            none: {
              status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN, GuestStayStatus.CHECKOUT_PENDING] },
              checkedOutAt: null,
            },
          },
        });
      } else if (query.status === "OCCUPIED") {
        conditions.push({
          OR: [
            { status: { in: [RoomStatus.OCCUPIED, RoomStatus.RESERVED] } },
            {
              guestStays: {
                some: {
                  status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN, GuestStayStatus.CHECKOUT_PENDING] },
                  checkedOutAt: null,
                },
              },
            },
          ],
        });
      } else if (query.status === "IN_HOUSE") {
        conditions.push({
          guestStays: {
            some: {
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
              checkedOutAt: null,
            },
          },
        });
      } else if (query.status === "PROCESSING") {
        conditions.push({ status: RoomStatus.PROCESSING });
      } else if (query.status === "MAINTENANCE") {
        conditions.push({ status: { in: [RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_SERVICE] } });
      } else if (query.status === "BLOCKED") {
        conditions.push({ status: RoomStatus.BLOCKED });
      } else if (query.status === "OVERDUE") {
        conditions.push({
          guestStays: {
            some: {
              status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN, GuestStayStatus.CHECKOUT_PENDING] },
              checkedOutAt: null,
              plannedCheckOutAt: { lt: new Date() },
            },
          },
        });
      }
    }

    if (query.floor) {
      where.floor = { equals: query.floor.trim(), mode: "insensitive" };
    }

    if (query.zone) {
      (where as any).zone = { equals: query.zone.trim(), mode: "insensitive" };
    }

    if (query.type) {
      where.type = { equals: query.type.trim(), mode: "insensitive" };
    }

    if (query.vipOnly) {
      conditions.push({
        OR: [
          { type: { contains: "suite", mode: "insensitive" } },
          { type: { contains: "vip", mode: "insensitive" } },
          { type: { contains: "premium", mode: "insensitive" } },
          { type: { contains: "penthouse", mode: "insensitive" } },
        ],
      });
    }

    const q = query.q?.trim();
    if (q) {
      if (query.status === "IN_HOUSE") {
        conditions.push({
          OR: [
            { roomNumber: { contains: q, mode: "insensitive" } },
            {
              guestStays: {
                some: {
                  status: {
                    in: [
                      GuestStayStatus.ACTIVE,
                      GuestStayStatus.CHECKED_IN,
                      GuestStayStatus.CHECKOUT_PENDING,
                    ],
                  },
                  checkedOutAt: null,
                  OR: [
                    { guestDisplayName: { contains: q, mode: "insensitive" } },
                    { guestPhone: { contains: q } },
                    { reservationCode: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        });
      } else if (
        query.status === "AVAILABLE" ||
        query.status === "PROCESSING" ||
        query.status === "MAINTENANCE" ||
        query.status === "BLOCKED"
      ) {
        where.roomNumber = { contains: q, mode: "insensitive" };
      } else {
        // Universal search: roomNumber, active/checked-in guest stays (with occupants), or confirmed reservations
        conditions.push({
          OR: [
            { roomNumber: { contains: q, mode: "insensitive" } },
            {
              guestStays: {
                some: {
                  status: {
                    in: [
                      GuestStayStatus.ACTIVE,
                      GuestStayStatus.CHECKED_IN,
                      GuestStayStatus.CHECKOUT_PENDING,
                    ],
                  },
                  checkedOutAt: null,
                  OR: [
                    { guestDisplayName: { contains: q, mode: "insensitive" } },
                    { guestPhone: { contains: q } },
                    { reservationCode: { contains: q, mode: "insensitive" } },
                    {
                      occupants: {
                        some: {
                          OR: [
                            { fullName: { contains: q, mode: "insensitive" } },
                            { phone: { contains: q } },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              reservations: {
                some: {
                  status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
                  OR: [
                    { guestDisplayName: { contains: q, mode: "insensitive" } },
                    { guestPhone: { contains: q } },
                    { reservationCode: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        });
      }
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const result = query.businessDate
      ? await this.hotelRoomsRepository.listRooms(where, (page - 1) * limit, limit, {
          businessDate: query.businessDate,
          timezone: scope.hotel?.timezone,
        })
      : await this.hotelRoomsRepository.listRooms(where, (page - 1) * limit, limit);
    const actor = await this.hotelAccessService.loadActorContext(actorUserId, activeRoleId);
    const permissions = actor.permissions ?? new Set<string>();
    const canViewStayContext = [
      "hotel.stays.view",
      "hotel.stays.manage",
      "hotel.stays.check-in",
      "hotel.stays.check-out",
    ].some((permission) => permissions.has(permission));
    const canViewReservationContext = [
      "hotel.reservations.view",
      "hotel.reservations.manage",
      "hotel.stays.check-in",
    ].some((permission) => permissions.has(permission));
    const totalPages = Math.ceil(result.total / limit);
    return {
      businessDate: query.businessDate ?? null,
      page,
      limit,
      total: result.total,
      totalItems: result.total,
      totalPages,
      floors: result.floors,
      types: result.types,
      totalAvailable: result.totalAvailable,
      byStatus: result.byStatus,
      items: result.items.map((row) =>
        this.toRoomData(row, { canViewStayContext, canViewReservationContext }),
      ),
    };
  }

  async updateRoom(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomId: string,
    dto: UpdateRoomBodyInput,
  ) {
    if (this.hotelAccessService.assertRoomAccess) {
      await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
    } else {
      await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    }

    const currentRoom = await this.hotelRoomsRepository.findRoomInHotel(hotelId, roomId);
    if (!currentRoom) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    const selectedType =
      dto.roomTypeId || dto.type
        ? await this.hotelRoomsRepository.resolveRoomType(hotelId, dto)
        : null;
    const room = await this.hotelRoomsRepository.updateRoomInHotel(hotelId, roomId, {
      roomNumber: dto.roomNumber?.trim(),
      floor: dto.floor === null ? null : dto.floor?.trim(),
      zone: dto.zone === null ? null : dto.zone?.trim(),
      ...(selectedType
        ? { type: selectedType.name, roomType: { connect: { id: selectedType.id } } }
        : {}),
      price: dto.price,
      maxActiveGuestDevices: dto.maxActiveGuestDevices,
    } satisfies Prisma.RoomUpdateInput);

    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    this.logBusinessEvent("Room updated", "ROOM_UPDATED", "updateRoom", {
      actorUserId,
      hotelId,
      roomId,
    });
    return this.toRoomData(room);
  }

  async updateRoomStatus(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomId: string,
    dto: UpdateRoomStatusBodyInput,
  ) {
    if (this.hotelAccessService.assertRoomAccess) {
      await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
    } else {
      await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    }

    if (dto.status && !MANUAL_ROOM_STATUSES.has(dto.status)) {
      throw new BadRequestException(
        "Chỉ có thể đổi phòng sang TRỐNG, CHỜ DỌN, BẢO TRÌ hoặc ĐÃ KHÓA.",
      );
    }

    const currentRoom = await this.hotelRoomsRepository.findRoomInHotel(hotelId, roomId);
    if (!currentRoom) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (currentRoom.status === dto.status) {
      return this.toRoomData(currentRoom);
    }

    if (dto.status === RoomStatus.BLOCKED && currentRoom.guestStays.length > 0) {
      throw new ConflictException(
        "Không thể khóa phòng khi khách đang lưu trú. Hãy xử lý hoặc chuyển phòng cho khách trước.",
      );
    }

    if (!MANUAL_ROOM_STATUS_TRANSITIONS[currentRoom.status]?.has(dto.status)) {
      throw new ConflictException(
        dto.status === RoomStatus.AVAILABLE && currentRoom.status === RoomStatus.PROCESSING
          ? "Phòng CHỜ DỌN chỉ được chuyển sang TRỐNG bằng thao tác xác nhận đã dọn xong."
          : `Không thể chuyển trạng thái phòng từ ${currentRoom.status} sang ${dto.status}.`,
      );
    }

    const room = await this.hotelRoomsRepository.updateRoomInHotel(
      hotelId,
      roomId,
      { status: dto.status } satisfies Prisma.RoomUpdateInput,
      { status: currentRoom.status, updatedAt: dto.expectedUpdatedAt },
    );

    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    this.logBusinessEvent("Room status updated", "ROOM_STATUS_UPDATED", "updateRoomStatus", {
      actorUserId,
      hotelId,
      roomId,
      status: room.status,
    });

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        status: room.status,
        previousStatus: currentRoom.status,
        updatedAt: room.updatedAt,
      });
    } catch (emitErr) {
      this.logger.warn(`[HotelRoomsService] Realtime room status emit failed: ${emitErr}`);
    }

    return this.toRoomData(room);
  }

  async confirmRoomReady(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomId: string,
    dto: ConfirmRoomReadyBodyInput,
  ) {
    if (this.hotelAccessService.assertRoomAccess) {
      await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
    } else {
      await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    }

    const room = await this.hotelRoomsRepository.confirmRoomReady(
      hotelId,
      roomId,
      dto.expectedUpdatedAt,
    );
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    this.logBusinessEvent("Room confirmed ready", "ROOM_READY_CONFIRMED", "confirmRoomReady", {
      actorUserId,
      hotelId,
      roomId,
      previousStatus: RoomStatus.PROCESSING,
      newStatus: RoomStatus.AVAILABLE,
    });

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        status: room.status,
        previousStatus: RoomStatus.PROCESSING,
        updatedAt: room.updatedAt,
      });
    } catch (emitErr) {
      this.logger.warn(`[HotelRoomsService] Realtime room ready emit failed: ${emitErr}`);
    }

    return this.toRoomData(room);
  }

  async createStay(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateStayBodyInput,
  ) {
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        dto.roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));
    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, dto.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.AVAILABLE) {
      throw new BadRequestException("Phòng không khả dụng để đặt giữ chỗ");
    }

    const stay = await this.hotelRoomsRepository.createStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      guestIdentityNumber: dto.guestIdentityNumber,
      guestDateOfBirth: dto.guestDateOfBirth?.trim(),
      guestGender: dto.guestGender?.trim(),
      guestNationality: dto.guestNationality?.trim(),
      guestResidencePlace: dto.guestResidencePlace?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      nightlyRateSnapshot: dto.nightlyRateSnapshot,
      createdByUserId: actorUserId,
      tenantId: hotel.tenantId,
      occupants: dto.occupants,
      reservationCode: dto.reservationCode?.trim() || undefined,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return this.toStayData(stay);
  }

  async checkInStay(actorUserId: string, activeRoleId: string, hotelId: string, stayId: string) {
    const stay = await this.hotelRoomsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        stay.roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));

    if (stay.status !== GuestStayStatus.RESERVED && stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-in lượt lưu trú từ trạng thái hiện tại");
    }

    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, stay.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.RESERVED && room.status !== RoomStatus.AVAILABLE) {
      throw new ConflictException("Phòng chưa sẵn sàng để check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelRoomsRepository.checkInStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    this.stayCheckInPublisher?.publishStayCheckedIn({
      hotelId,
      stayId: result.stay.id,
      actorUserId,
    });

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: stay.roomId,
        status: RoomStatus.OCCUPIED,
        previousStatus: room.status,
        updatedAt: new Date(),
      });
    } catch (emitErr) {
      this.logger.warn(`[HotelRoomsService] Realtime room checkin emit failed: ${emitErr}`);
    }

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async updateStay(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    stayId: string,
    dto: UpdateStayBodyInput,
  ) {
    const stay = await this.hotelRoomsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }
    if (this.hotelAccessService.assertRoomAccess) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        stay.roomId,
      );
    } else {
      await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    }

    if (dto.plannedCheckOutAt && dto.plannedCheckOutAt <= stay.plannedCheckInAt) {
      throw new BadRequestException("Thời gian check-out mới phải sau thời gian check-in");
    }

    if (dto.plannedCheckOutAt && dto.plannedCheckOutAt > stay.plannedCheckOutAt) {
      const nextReservation = await this.hotelRoomsRepository.findNextReservationInRoom(
        hotelId,
        stay.roomId,
        stay.plannedCheckInAt,
        dto.plannedCheckOutAt,
      );
      if (nextReservation) {
        const nextDate = nextReservation.plannedCheckInAt.toISOString().slice(0, 10);
        throw new ConflictException(
          `Không thể gia hạn: Phòng đã có lịch đặt của khách ${nextReservation.guestDisplayName} từ ngày ${nextDate}`,
        );
      }
    }

    const updated = await this.hotelRoomsRepository.updateStay(hotelId, stayId, dto);
    if (!updated) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: stay.roomId,
        status: RoomStatus.OCCUPIED,
        previousStatus: RoomStatus.OCCUPIED,
        updatedAt: new Date(),
      });
    } catch {
      // Non-blocking realtime emission
    }

    return this.toStayData(updated);
  }

  async createAndCheckInStay(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateStayBodyInput,
  ) {
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        dto.roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));

    if (!dto.guestDisplayName?.trim()) {
      throw new BadRequestException("Tên khách là bắt buộc để check-in");
    }

    if (dto.plannedCheckOutAt <= dto.plannedCheckInAt) {
      throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelRoomsRepository.createAndCheckInStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      guestIdentityNumber: dto.guestIdentityNumber,
      guestDateOfBirth: dto.guestDateOfBirth?.trim(),
      guestGender: dto.guestGender?.trim(),
      guestNationality: dto.guestNationality?.trim(),
      guestResidencePlace: dto.guestResidencePlace?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      nightlyRateSnapshot: dto.nightlyRateSnapshot,
      createdByUserId: actorUserId,
      actorUserId,
      occupants: dto.occupants,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      reservationCode: dto.reservationCode?.trim() || undefined,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    this.stayCheckInPublisher?.publishStayCheckedIn({
      hotelId,
      stayId: result.stay.id,
      actorUserId,
    });

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: dto.roomId,
        status: RoomStatus.OCCUPIED,
        previousStatus: RoomStatus.AVAILABLE,
        updatedAt: new Date(),
      });
    } catch (emitErr) {
      this.logger.warn(`[HotelRoomsService] Realtime room checkin emit failed: ${emitErr}`);
    }

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async checkOutStay(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    stayId: string,
    dto: CheckOutBodyInput,
  ) {
    const stay = await this.hotelRoomsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        stay.roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));

    if (stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-out lượt lưu trú từ trạng thái hiện tại");
    }

    const blockingFolio = await this.hotelRoomsRepository.findBlockingBillingFolio(hotelId, stayId);
    if (blockingFolio) {
      throw new ConflictException("Please complete billing checkout before closing the stay.");
    }

    const checkedOut = await this.hotelRoomsRepository.checkOutStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      tenantId: hotel.tenantId,
      nextRoomStatus: dto.nextRoomStatus ?? RoomStatus.PROCESSING,
    });

    this.eventPublisher.publishConversationClosed({
      hotelId,
      stayId,
      roomId: stay.roomId,
    });

    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: stay.roomId,
        status: dto.nextRoomStatus ?? RoomStatus.PROCESSING,
        previousStatus: RoomStatus.OCCUPIED,
        updatedAt: new Date(),
      });
    } catch (emitErr) {
      this.logger.warn(`[HotelRoomsService] Realtime room checkout emit failed: ${emitErr}`);
    }

    return this.toStayData(checkedOut);
  }

  async rotateQr(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomId: string,
    dto: QrReasonBodyInput,
  ) {
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));

    const publicCode = this.generateQrCode();
    const qr = await this.hotelRoomsRepository.rotateQr({
      hotelId,
      roomId,
      publicCode,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return this.toQrData(qr);
  }

  async activateQr(actorUserId: string, activeRoleId: string, hotelId: string, roomId: string) {
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));
    const qr = await this.hotelRoomsRepository.activateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      publicCode: this.generateQrCode(),
    });
    return this.toQrData(qr);
  }

  async deactivateQr(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    roomId: string,
    dto: QrReasonBodyInput,
  ) {
    const hotel =
      (await this.hotelAccessService.assertRoomAccess?.(
        actorUserId,
        activeRoleId,
        hotelId,
        roomId,
      )) ?? (await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId));
    await this.assertRoomInHotel(hotelId, roomId);
    const result = await this.hotelRoomsRepository.deactivateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return { deactivated: result.count };
  }

  private async assertRoomInHotel(hotelId: string, roomId: string) {
    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, roomId);
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
      service: "HotelRoomsService",
      operation,
      event,
      ...metadata,
    });
  }

  private generateQrCode(): string {
    return generateOpaqueToken(24);
  }

  private generateAccessCode(): string {
    return generateOpaqueToken(9).slice(0, 12).toUpperCase();
  }

  private toRoomData(
    row: RoomListRow,
    visibility: { canViewStayContext: boolean; canViewReservationContext: boolean } = {
      canViewStayContext: true,
      canViewReservationContext: true,
    },
  ) {
    const latestQr = row.qrCodes[0] ?? null;
    const activeStay = row.guestStays[0] ?? null;
    const projectedStay = row.projectedStay ?? null;
    const projectedReservation = row.projectedReservation ?? null;
    const upcomingReservation = row.upcomingReservation ?? null;

    return {
      id: row.id,
      hotelId: row.hotelId,
      code: row.code,
      roomNumber: row.roomNumber,
      floor: row.floor,
      zone: (row as any).zone ?? null,
      type: row.type,
      roomTypeId: row.roomTypeId,
      maxOccupancy: (row as any).maxOccupancy ?? (row as any).roomType?.maxOccupancy ?? null,
      price: row.price,
      maxActiveGuestDevices: row.maxActiveGuestDevices ?? 3,
      activeGuestDeviceCount: row.activeGuestDeviceCount,
      status: row.status,
      physicalStatus: (row as any).physicalStatus ?? row.status,
      projectedStatus: (row as any).projectedStatus ?? row.status,
      statusConflictCode: (row as any).statusConflictCode ?? null,
      businessDate: (row as any).businessDate ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      qr: latestQr ? this.toQrData(latestQr) : null,
      activeStay: visibility.canViewStayContext && activeStay
        ? this.toStayData(activeStay)
        : visibility.canViewStayContext && projectedStay
          ? this.toStayData(projectedStay)
          : null,
      projectedStay:
        visibility.canViewStayContext && projectedStay ? this.toStayData(projectedStay) : null,
      projectedReservation: visibility.canViewReservationContext && projectedReservation
        ? this.toReservationData(projectedReservation)
        : null,
      upcomingReservation: visibility.canViewReservationContext && upcomingReservation
        ? this.toReservationData(upcomingReservation)
        : null,
    };
  }

  private toReservationData(row: {
    id: string;
    sourceType?: "RESERVATION" | "STAY";
    hotelId?: string;
    roomId?: string | null;
    roomTypeSnapshot?: string | null;
    reservationCode: string;
    groupCode?: string | null;
    guestDisplayName: string;
    guestPhone?: string | null;
    status: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    guestCount?: number | null;
    notes?: string | null;
    assignedAt?: Date | null;
    assignedByUserId?: string | null;
    checkedInAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const rawRate = row.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined && rawRate !== null ? Number(rawRate) : null;

    return {
      id: row.id,
      sourceType: row.sourceType ?? "RESERVATION",
      hotelId: row.hotelId,
      roomId: row.roomId ?? null,
      roomTypeSnapshot: row.roomTypeSnapshot ?? null,
      reservationCode: row.reservationCode,
      groupCode: (row as any).groupCode ?? null,
      guestDisplayName: row.guestDisplayName,
      guestPhone: row.guestPhone ?? null,
      status: row.status,
      plannedCheckInAt: row.plannedCheckInAt,
      plannedCheckOutAt: row.plannedCheckOutAt,
      nightlyRateSnapshot,
      guestCount: (row as any).guestCount ?? null,
      notes: (row as any).notes ?? null,
      assignedAt: row.assignedAt ?? null,
      assignedByUserId: row.assignedByUserId ?? null,
      checkedInAt: row.checkedInAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toStayData(row: {
    id: string;
    hotelId: string;
    roomId: string;
    reservationCode: string;
    guestDisplayName: string;
    guestPhone?: string | null;
    guestPhoneMasked?: string | null;
    guestIdentityNumber?: string | null;
    guestDateOfBirth?: string | null;
    guestGender?: string | null;
    guestNationality?: string | null;
    guestResidencePlace?: string | null;
    status: GuestStayStatus;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    checkedInAt: Date | null;
    activatedAt: Date | null;
    checkedOutAt: Date | null;
    accessCodeExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    occupants?: Array<{
      id: string;
      fullName: string;
      phone?: string | null;
      identityNumber?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
      nationality?: string | null;
      residencePlace?: string | null;
      isPrimary: boolean;
    }> | null;
  }) {
    const now = new Date();
    const isOverdueCheckOut =
      (row.status === GuestStayStatus.ACTIVE ||
        row.status === GuestStayStatus.CHECKED_IN ||
        row.status === GuestStayStatus.CHECKOUT_PENDING) &&
      row.checkedOutAt === null &&
      Boolean(row.plannedCheckOutAt) &&
      new Date(row.plannedCheckOutAt).getTime() < now.getTime();
    const overdueHours = isOverdueCheckOut
      ? Number(
          ((now.getTime() - new Date(row.plannedCheckOutAt).getTime()) / (1000 * 60 * 60)).toFixed(
            1,
          ),
        )
      : 0;

    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      reservationCode: row.reservationCode,
      guestDisplayName: row.guestDisplayName,
      guestPhone: row.guestPhone ?? row.guestPhoneMasked ?? null,
      guestIdentityNumber: row.guestIdentityNumber ?? null,
      guestDateOfBirth: row.guestDateOfBirth ?? null,
      guestGender: row.guestGender ?? null,
      guestNationality: row.guestNationality ?? null,
      guestResidencePlace: row.guestResidencePlace ?? null,
      status: row.status,
      plannedCheckInAt: row.plannedCheckInAt,
      plannedCheckOutAt: row.plannedCheckOutAt,
      nightlyRateSnapshot:
        (row as any).nightlyRateSnapshot !== undefined && (row as any).nightlyRateSnapshot !== null
          ? Number((row as any).nightlyRateSnapshot)
          : null,
      checkedInAt: row.checkedInAt,
      activatedAt: row.activatedAt,
      checkedOutAt: row.checkedOutAt,
      accessCodeExpiresAt: row.accessCodeExpiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isOverdueCheckOut,
      overdueHours,
      occupants: row.occupants
        ? row.occupants.map((occ) => ({
            id: occ.id,
            fullName: occ.fullName,
            phone: occ.phone ?? null,
            identityNumber: occ.identityNumber ?? null,
            dateOfBirth: occ.dateOfBirth ?? null,
            gender: occ.gender ?? null,
            nationality: occ.nationality ?? null,
            residencePlace: occ.residencePlace ?? null,
            isPrimary: occ.isPrimary,
          }))
        : [],
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
