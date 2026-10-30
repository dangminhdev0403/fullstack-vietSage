import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../common/security/token-hash.util";
import {
  STAY_CHECK_IN_EVENT_PUBLISHER,
  type StayCheckInEventPublisher,
} from "../../../shared/events";
import { CodesService } from "../../codes/codes-public";
import type {
  AssignReservationRoomBodyInput,
  CancelReservationBodyInput,
  CancelReservationDto,
  CheckInReservationBodyInput,
  CreateBulkReservationsBodyInput,
  CreateReservationBodyInput,
  ListArrivalsQueryInput,
  MarkNoShowBodyInput,
  MarkNoShowDto,
  RoomPlanQueryInput,
  UpdateReservationPlacementBodyInput,
  UpdateReservationDatesBodyInput,
  UpdateReservationBodyInput,
  UpdateGroupReservationBodyInput,
  CreateBookingSourcePartnerBodyInput,
  UpdateBookingSourcePartnerBodyInput,
  ListBookingSourcePartnersQueryInput,
  UpsertConfirmationTemplateBodyInput,
} from "../domain/schemas/reservations.schema";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";
import { getBusinessDateRange } from "../infrastructure/repositories/hotel-rooms.repository";
import { HotelAccessService } from "./hotel-access.service";
import {
  addDaysYmd,
  diffCalendarDays,
  plainDateAtTime,
  resolveTimeZone,
  startOfPlainDate,
  toPlainDate,
  toYmd,
  VIETNAM_TIME_ZONE,
} from "../../../common/time/vietnam-temporal";

function normalizeHotelReservationDate(
  date: Date,
  defaultTime: "checkIn" | "checkOut",
  timeZone: string = VIETNAM_TIME_ZONE,
): Date {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  const plain = toPlainDate(date, timeZone);
  const isLocalMidnight = date.getTime() === startOfPlainDate(plain, timeZone).getTime();

  if (isUtcMidnight || isLocalMidnight) {
    const timeStr = defaultTime === "checkIn" ? "14:00:00" : "12:00:00";
    return plainDateAtTime(plain, timeStr, timeZone);
  }
  return date;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    @Optional()
    @Inject(STAY_CHECK_IN_EVENT_PUBLISHER)
    private readonly stayCheckInPublisher?: StayCheckInEventPublisher,
    @Optional()
    @Inject("RESERVATION_ROOM_ALLOCATION_SERVICE")
    private readonly roomAllocationService?: any,
  ) {}

  async createBulkReservations(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateBulkReservationsBodyInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    if (dto.roomIds && dto.roomIds.length > 0) {
      for (const roomId of dto.roomIds) {
        this.hotelAccessService.assertRoomAccess(scope, roomId);
      }
    }
    if (scope.allowedRoomId !== null) {
      if (dto.roomIds && dto.roomIds.length > 1) {
        throw new ForbiddenException("Tài khoản chỉ được phép thao tác trên phòng được phân công");
      }
      if (dto.allocations && dto.allocations.reduce((acc, a) => acc + (a.quantity || 0), 0) > 1) {
        throw new ForbiddenException("Tài khoản chỉ được phép thao tác trên phòng được phân công");
      }
    }

    const leadGuestName = (dto.leadGuestName ?? dto.guestDisplayName)!.trim();
    const leadGuestPhone = (dto.leadGuestPhone ?? dto.guestPhone)?.trim();
    const checkInDate = normalizeHotelReservationDate(
      (dto.checkInDate ?? dto.plannedCheckInAt)!,
      "checkIn",
    );
    const checkOutDate = normalizeHotelReservationDate(
      (dto.checkOutDate ?? dto.plannedCheckOutAt)!,
      "checkOut",
    );
    const rawRate = dto.rate !== undefined ? dto.rate : dto.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined && rawRate !== null ? new Prisma.Decimal(rawRate).toFixed(2) : null;

    const groupCode =
      dto.groupCode?.trim() || (await this.codesService.generateEntityCode("GROUP"));

    return this.reservationsRepository.createBulkReservations({
      hotelId,
      groupCode,
      reservationCode: dto.reservationCode?.trim() || undefined,
      leadGuestName,
      leadGuestPhone,
      checkInDate,
      checkOutDate,
      roomIds: dto.roomIds,
      allocations: dto.allocations,
      autoAssign: dto.autoAssign,
      createdByUserId: actorUserId,
      nightlyRateSnapshot,
      roomRates: dto.roomRates,
      idempotencyKey: dto.idempotencyKey?.trim(),
      generateReservationCode: (tx: Prisma.TransactionClient) =>
        this.codesService.generateEntityCode("RESERVATION", tx),
      roomAllocationService: this.roomAllocationService,
      allowedRoomId: scope.allowedRoomId,
      assertRoomAccess: (roomId: string) =>
        this.hotelAccessService.assertRoomAccess(scope, roomId),
      chargeLines: dto.chargeLines,
      sourceCategory: dto.sourceCategory,
      sourcePartnerId: dto.sourcePartnerId,
      bookingOwnerUserId: dto.bookingOwnerUserId?.trim() || actorUserId,
    });
  }

  async createReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateReservationBodyInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const roomId = dto.roomId ?? scope.allowedRoomId ?? null;
    if (roomId) {
      await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
    }
    const reservationCode =
      dto.reservationCode?.trim() ||
      (await this.codesService.generateEntityCode("RESERVATION"));
    const rawRate = dto.rate !== undefined ? dto.rate : dto.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined && rawRate !== null ? new Prisma.Decimal(rawRate).toFixed(2) : null;

    return this.reservationsRepository.createReservation({
      hotelId,
      reservationCode,
      groupCode: dto.groupCode?.trim() || undefined,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      roomId,
      roomTypeId: dto.roomTypeId,
      guestCount: dto.guestCount,
      notes: dto.notes,
      autoAssign: dto.autoAssign,
      roomAllocationService: this.roomAllocationService,
      allowedRoomId: scope.allowedRoomId,
      assertRoomAccess: (rid: string) =>
        this.hotelAccessService.assertRoomAccess(scope, rid),
      nightlyRateSnapshot,
      chargeLines: dto.chargeLines,
      sourceCategory: dto.sourceCategory,
      sourcePartnerId: dto.sourcePartnerId,
      bookingOwnerUserId: dto.bookingOwnerUserId?.trim() || actorUserId,
    });
  }

  async listArrivals(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListArrivalsQueryInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const tz = resolveTimeZone(scope.hotel.timezone);
    const from = getBusinessDateRange(toYmd(query.from, tz), tz).start;
    const to = getBusinessDateRange(toYmd(query.to, tz), tz).start;
    const [total, rawItems] = await this.reservationsRepository.listArrivals({
      hotelId,
      from,
      to,
      skip: (page - 1) * limit,
      take: limit,
      roomId: scope.allowedRoomId ?? undefined,
      q: query.q,
    });
    const items = rawItems.map((r: any) => {
      const roomChargeLines = (r.chargeLines || []).filter((l: any) => l.lineType === "ROOM_NIGHT");
      const extraLines = (r.chargeLines || []).filter((l: any) => l.lineType !== "ROOM_NIGHT");
      const nights =
        r.plannedCheckInAt && r.plannedCheckOutAt
          ? Math.max(1, diffCalendarDays(r.plannedCheckInAt, r.plannedCheckOutAt, tz))
          : 1;
      let roomSubtotal = 0;
      if (roomChargeLines.length > 0) {
        roomSubtotal = roomChargeLines.reduce(
          (sum: number, l: any) => sum + Number(l.totalSnapshot || l.unitPriceSnapshot || 0),
          0,
        );
      } else {
        const fallbackRate = Number(
          r.nightlyRateSnapshot ??
          r.baseNightlyRateSnapshot ??
          r.room?.price ??
          (r.room as any)?.roomType?.basePrice ??
          (r.roomType as any)?.basePrice ??
          0,
        );
        roomSubtotal = fallbackRate * nights;
      }
      const serviceSubtotal = extraLines.reduce(
        (sum: number, l: any) => sum + Number(l.totalSnapshot || (Number(l.unitPriceSnapshot || 0) * Number(l.quantity || 1))),
        0,
      );
      const totalAmount = roomSubtotal + serviceSubtotal;
      const effectiveRate =
        r.nightlyRateSnapshot ??
        (nights > 0 && roomSubtotal > 0
          ? Math.round(roomSubtotal / nights)
          : r.baseNightlyRateSnapshot ?? r.room?.price ?? (r.room as any)?.roomType?.basePrice ?? (r.roomType as any)?.basePrice ?? null);

      return {
        ...r,
        nightlyRateSnapshot: effectiveRate ? String(effectiveRate) : null,
        rate: effectiveRate ? String(effectiveRate) : null,
        roomSubtotal,
        serviceSubtotal,
        totalAmount,
      };
    });
    return { page, limit, total, items };
  }

  async assignRoom(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: AssignReservationRoomBodyInput,
  ) {
    await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, dto.roomId);
    const rawRate = dto.rate !== undefined ? dto.rate : dto.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined
        ? rawRate !== null
          ? new Prisma.Decimal(rawRate).toFixed(2)
          : null
        : undefined;

    const reservation = await this.reservationsRepository.assignRoom({
      hotelId,
      reservationId,
      roomId: dto.roomId,
      actorUserId,
      ...(dto.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: dto.expectedUpdatedAt } : {}),
      ...(dto.expectedRoomId !== undefined ? { expectedRoomId: dto.expectedRoomId } : {}),
      ...(this.roomAllocationService ? { roomAllocationService: this.roomAllocationService } : {}),
      ...(nightlyRateSnapshot !== undefined ? { nightlyRateSnapshot } : {}),
    });
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    return reservation;
  }

  async checkIn(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto?: CheckInReservationBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    if (reservation) {
      if (
        reservation.status === ReservationStatus.CANCELLED ||
        reservation.status === ReservationStatus.NO_SHOW
      ) {
        throw new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt");
      }
    }
    if (reservation && reservation.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        reservation.roomId,
      );
    } else {
      const scope = await this.hotelAccessService.resolveRoomScope(
        actorUserId,
        activeRoleId,
        hotelId,
      );
      if (scope.allowedRoomId !== null) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
    }
    const accessCode = generateOpaqueToken(9).slice(0, 12).toUpperCase();
    const result = await this.reservationsRepository.checkInReservation({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      generateFolioNumber: (tx: Prisma.TransactionClient) =>
        this.codesService.generateEntityCode("FOLIO", tx),
      timezone: hotel.timezone,
      dto,
    });

    if (!result.idempotent) {
      this.stayCheckInPublisher?.publishStayCheckedIn({
        hotelId,
        stayId: result.stay.id,
        actorUserId,
      });

      if (result.stay?.roomId) {
        try {
          RequestRealtimeEmitter.emitRoomStatusUpdated({
            hotelId,
            roomId: result.stay.roomId,
            status: RoomStatus.OCCUPIED,
            previousStatus: RoomStatus.AVAILABLE,
            updatedAt: new Date(),
          });
        } catch {
          // Non-blocking realtime emission
        }
      }
    }

    return {
      idempotent: result.idempotent,
      accessCode: result.idempotent ? null : accessCode,
      reservation: {
        id: result.reservation.id,
        status: result.reservation.status,
      },
      stay: {
        id: result.stay.id,
        status: result.stay.status,
      },
      folio: {
        id: result.folio.id,
        status: result.folio.status,
      },
      roomQrCode: result.roomQrCode
        ? { id: result.roomQrCode.id, status: result.roomQrCode.status }
        : null,
    };
  }

  async cancelReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: CancelReservationBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    if (reservation.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        reservation.roomId,
      );
    }
    if (reservation.status === ReservationStatus.CHECKED_IN) {
      throw new ConflictException("Không thể hủy đặt phòng đã check-in");
    }
    if (
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt");
    }
    if (
      reservation.status !== ReservationStatus.CONFIRMED &&
      reservation.status !== ReservationStatus.ARRIVAL_READY
    ) {
      throw new ConflictException("Trạng thái đặt phòng không hợp lệ để hủy");
    }

    return this.reservationsRepository.cancelReservation({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      actorUserId,
      reason: dto.reason,
    });
  }

  async markNoShow(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: MarkNoShowBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    if (reservation.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        reservation.roomId,
      );
    }
    if (reservation.status === ReservationStatus.CHECKED_IN) {
      throw new ConflictException("Không thể báo vắng mặt đặt phòng đã check-in");
    }
    if (
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt");
    }
    if (
      reservation.status !== ReservationStatus.CONFIRMED &&
      reservation.status !== ReservationStatus.ARRIVAL_READY
    ) {
      throw new ConflictException("Trạng thái đặt phòng không hợp lệ để báo vắng mặt");
    }

    return this.reservationsRepository.markNoShow({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      actorUserId,
      reason: dto.reason,
    });
  }

  async getRoomPlan(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: RoomPlanQueryInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const roomScope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const tz = resolveTimeZone(roomScope.hotel?.timezone);
    const from = startOfPlainDate(query.from, tz);
    const to = new Date(startOfPlainDate(addDaysYmd(query.to, 1), tz).getTime() - 1);
    return this.reservationsRepository.getRoomPlan({
      hotelId,
      from,
      to,
      roomScopeIds: roomScope.allowedRoomId ? [roomScope.allowedRoomId] : null,
      timezone: tz,
    });
  }

  async updateReservationPlacement(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: UpdateReservationPlacementBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    await this.hotelAccessService.assertRoomAccess(
      actorUserId,
      activeRoleId,
      hotelId,
      dto.targetRoomId,
    );
    const result = await this.reservationsRepository.updateReservationPlacement({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      targetRoomId: dto.targetRoomId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      swapWithReservationId: dto.swapWithReservationId,
      swapExpectedUpdatedAt: dto.swapExpectedUpdatedAt,
      actorUserId,
    });
    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: dto.targetRoomId,
        status: RoomStatus.RESERVED,
        previousStatus: RoomStatus.RESERVED,
        updatedAt: new Date(),
      });
    } catch {
      // Non-blocking realtime emission
    }
    return result;
  }

  async updateReservationDates(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: UpdateReservationDatesBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const appliedNightlyRate = dto.nightlyRateSnapshot ?? dto.rate;
    const updated = await this.reservationsRepository.updateReservationDates({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      nightlyRateSnapshot: appliedNightlyRate,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      actorUserId,
    });
    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: updated.roomId || "",
        status: RoomStatus.RESERVED,
        previousStatus: RoomStatus.RESERVED,
        updatedAt: new Date(),
      });
    } catch {
      // Non-blocking realtime emission
    }
    return updated;
  }

  async updateReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: UpdateReservationBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    if (dto.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        dto.roomId,
      );
    }
    const appliedNightlyRate = dto.nightlyRateSnapshot ?? dto.rate;
    const updated = await this.reservationsRepository.updateReservation({
      hotelId,
      tenantId: hotel.tenantId,
      reservationId,
      guestDisplayName: dto.guestDisplayName,
      guestPhone: dto.guestPhone,
      guestCount: dto.guestCount,
      notes: dto.notes,
      roomId: dto.roomId,
      roomTypeId: dto.roomTypeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      nightlyRateSnapshot: appliedNightlyRate,
      chargeLines: dto.chargeLines,
      sourceCategory: dto.sourceCategory,
      sourcePartnerId: dto.sourcePartnerId,
      bookingOwnerUserId: dto.bookingOwnerUserId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      actorUserId,
      assertRoomAccess: async (roomId: string): Promise<void> => {
        await this.hotelAccessService.assertRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
      },
    });
    try {
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId,
        roomId: updated.roomId || "",
        status: RoomStatus.RESERVED,
        previousStatus: RoomStatus.RESERVED,
        updatedAt: new Date(),
      });
    } catch {
      // Non-blocking realtime emission
    }
    return updated;
  }

  async getReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    return reservation;
  }

  async getGroupReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    groupCode: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(actorUserId, activeRoleId, hotelId);
    const group = await this.reservationsRepository.findGroupByCode(hotelId, groupCode);
    if (scope.allowedRoomId !== null) {
      const hasUnauthorizedRoom = group?.reservations?.some(
        (r: any) => (r.roomId ?? r.assignedRoomId) !== scope.allowedRoomId,
      );
      if (hasUnauthorizedRoom || !group?.reservations || group.reservations.length === 0) {
        throw new ForbiddenException("Tài khoản không có quyền truy cập thông tin đoàn có phòng ngoài phạm vi phân công");
      }
    }
    return group;
  }

  async getGroupDetails(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    groupCode: string,
  ) {
    return this.getGroupReservation(actorUserId, activeRoleId, hotelId, groupCode);
  }

  async updateGroupReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    groupCode: string,
    dto: UpdateGroupReservationBodyInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(actorUserId, activeRoleId, hotelId);
    if (scope.allowedRoomId !== null) {
      const group = await this.reservationsRepository.findGroupByCode(hotelId, groupCode);
      const hasUnauthorizedRoom = group?.reservations?.some(
        (r: any) => (r.roomId ?? r.assignedRoomId) !== scope.allowedRoomId,
      );
      if (hasUnauthorizedRoom || !group?.reservations || group.reservations.length === 0) {
        throw new ForbiddenException("Tài khoản chỉ được phép thao tác trên phòng được phân công");
      }
    }
    return this.reservationsRepository.updateGroupByCode(hotelId, groupCode, dto);
  }

  async getReservationConfirmation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(actorUserId, activeRoleId, hotelId);
    const reservation = await this.reservationsRepository.findReservationConfirmation(
      hotelId,
      reservationId,
    );
    if (reservation.roomId) {
      this.hotelAccessService.assertRoomAccess(scope, reservation.roomId);
    } else if (scope.allowedRoomId !== null) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    return this.projectReservationConfirmation(reservation);
  }

  async getGroupConfirmation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    groupCode: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(actorUserId, activeRoleId, hotelId);
    const data = await this.reservationsRepository.findGroupConfirmation(hotelId, groupCode);
    if (scope.allowedRoomId !== null) {
      const hasUnauthorizedRoom = data?.reservations?.some(
        (r: any) => (r.roomId ?? r.assignedRoomId) !== scope.allowedRoomId,
      );
      if (hasUnauthorizedRoom || !data?.reservations || data.reservations.length === 0) {
        throw new ForbiddenException("Tài khoản không có quyền truy cập thông tin đoàn có phòng ngoài phạm vi phân công");
      }
    }
    return this.projectGroupConfirmation(data);
  }

  async getConfirmationTemplate(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.findConfirmationTemplate(hotelId);
  }

  async upsertConfirmationTemplate(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: UpsertConfirmationTemplateBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.upsertConfirmationTemplate(hotelId, dto);
  }

  private projectReservationConfirmation(data: any) {
    const hotel = data.hotel;
    const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
    const brandSettings =
      hotel?.brandSettings && typeof hotel.brandSettings === "object"
        ? (hotel.brandSettings as Record<string, any>)
        : {};
    const template =
      (hotel as any)?.confirmationTemplate ??
      (hotel as any)?.confirmationTemplates?.[0] ??
      null;
    const nonEmpty = (val: unknown): string | undefined =>
      typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;

    const sanitizeContact = (val: unknown): string | null => {
      if (typeof val !== "string") return null;
      const trimmed = val.trim();
      if (!trimmed) return null;
      const lower = trimmed.toLowerCase();
      if (
        lower.includes("liên hệ") ||
        lower.includes("chưa xác định") ||
        lower.includes("địa chỉ khách sạn")
      ) {
        return null;
      }
      return trimmed;
    };

    const hotelProjection = {
      id: hotel.id,
      name: hotel.name,
      code: hotel.code,
      address:
        sanitizeContact(template?.hotelAddress) ||
        sanitizeContact(template?.contactInfo) ||
        sanitizeContact(brandSettings.address) ||
        [hotel.area, hotel.province].filter(Boolean).join(", ") ||
        "Địa chỉ khách sạn",
      phone:
        sanitizeContact(template?.hotelPhone) ||
        sanitizeContact(brandSettings.phone) ||
        sanitizeContact(brandSettings.hotline) ||
        null,
      email:
        sanitizeContact(template?.hotelEmail) ||
        sanitizeContact(brandSettings.email) ||
        null,
      logoUrl:
        template?.showLogo === false
          ? null
          : brandSettings.logoUrl || brandSettings.logo || null,
      checkInTimePolicy:
        nonEmpty(template?.checkInPolicy) ||
        nonEmpty(template?.checkInTimeText) ||
        brandSettings.checkInTime ||
        "14:00",
      checkOutTimePolicy:
        nonEmpty(template?.checkOutPolicy) ||
        nonEmpty(template?.checkOutTimeText) ||
        brandSettings.checkOutTime ||
        "12:00",
    };

    const checkInDate = new Date(data.plannedCheckInAt);
    const checkOutDate = new Date(data.plannedCheckOutAt);
    const nights = Math.max(1, diffCalendarDays(checkInDate, checkOutDate, tz));

    const roomChargeLines = (data.chargeLines || []).filter(
      (l: any) => l.lineType === "ROOM_NIGHT",
    );
    let nightlyBreakdown: Array<{
      date: string;
      description: string;
      rate: number;
      lineType: string;
    }> = [];

    if (roomChargeLines.length > 0) {
      nightlyBreakdown = roomChargeLines.map((l: any, idx: number) => ({
        date: l.serviceDate ? toYmd(new Date(l.serviceDate), tz) : toYmd(checkInDate, tz),
        description: l.nameSnapshot || `Đêm ${idx + 1}`,
        rate: Number(l.unitPriceSnapshot ?? l.totalSnapshot ?? 0),
        lineType: "ROOM_NIGHT",
      }));
    } else {
      const nightlyRate = Number(
        data.nightlyRateSnapshot ?? data.room?.price ?? data.roomType?.basePrice ?? 0,
      );
      for (let i = 0; i < nights; i++) {
        const nightDate = addDaysYmd(toYmd(checkInDate, tz), i);
        nightlyBreakdown.push({
          date: nightDate,
          description: `Đêm ${i + 1}`,
          rate: nightlyRate,
          lineType: "ROOM_NIGHT",
        });
      }
    }

    const roomSubtotal = nightlyBreakdown.reduce((sum, item) => sum + item.rate, 0);
    const extraLines = (data.chargeLines || []).filter((l: any) => l.lineType !== "ROOM_NIGHT");
    const serviceBreakdown = extraLines.map((l: any) => ({
      name: l.nameSnapshot || "Dịch vụ",
      quantity: Number(l.quantity || 1),
      unitPrice: Number(l.unitPriceSnapshot ?? l.totalSnapshot ?? 0),
      total: Number(l.totalSnapshot ?? (Number(l.unitPriceSnapshot || 0) * Number(l.quantity || 1))),
    }));
    const serviceAmount = serviceBreakdown.reduce(
      (sum: number, l: any) => sum + l.total,
      0,
    );
    const taxAmount = (data.chargeLines || []).reduce(
      (sum: number, l: any) => sum + Number(l.taxAmountSnapshot || 0),
      0,
    );
    const discountAmount = (data.chargeLines || []).reduce(
      (sum: number, l: any) => sum + Number(l.discountAmountSnapshot || 0),
      0,
    );
    const totalAmount = roomSubtotal + serviceAmount + taxAmount - discountAmount;

    const paidPayments = (data.bookingPayments || []).filter(
      (p: any) => p.status === "COMPLETED" || p.status === "ALLOCATED",
    );
    const paidAmount = paidPayments.reduce(
      (sum: number, p: any) => sum + Number(p.receivedAmount || 0),
      0,
    );
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    const cancellationPolicy =
      nonEmpty(template?.paymentTerms) ||
      nonEmpty(template?.cancellationPolicyText) ||
      brandSettings.cancellationPolicy ||
      "Miễn phí hủy phòng trước 24 giờ so với giờ nhận phòng tiêu chuẩn. Hủy phòng muộn hoặc vắng mặt sẽ chịu phí đêm đầu tiên.";
    const footerNote = nonEmpty(template?.footerNotes) || nonEmpty(template?.footerNoteText);
    const terms = [
      "Quý khách vui lòng xuất trình giấy tờ tùy thân hợp lệ (CMND/CCCD hoặc Hộ chiếu) khi làm thủ tục nhận phòng.",
      `Thời gian nhận phòng tiêu chuẩn từ ${hotelProjection.checkInTimePolicy} và trả phòng trước ${hotelProjection.checkOutTimePolicy}.`,
      "Trường hợp nhận phòng sớm hoặc trả phòng trễ tùy thuộc vào tình trạng phòng sẵn có của khách sạn và có thể áp dụng phụ thu theo quy định.",
      footerNote ||
        "Mọi thắc mắc hoặc yêu cầu dịch vụ đặc biệt, quý khách vui lòng liên hệ quầy lễ tân để được hỗ trợ tốt nhất.",
    ];

    return {
      hotel: hotelProjection,
      template: template
        ? {
            title: template.title || "PHIẾU XÁC NHẬN ĐẶT PHÒNG",
            subtitle: template.subtitle ?? null,
            contactInfo: template.contactInfo ?? null,
            checkInPolicy: template.checkInPolicy ?? null,
            checkOutPolicy: template.checkOutPolicy ?? null,
            paymentTerms: template.paymentTerms ?? null,
            footerNotes: template.footerNotes ?? null,
            showLogo: template.showLogo ?? true,
            showPriceBreakdown: template.showPriceBreakdown ?? true,
          }
        : null,
      reservation: {
        id: data.id,
        reservationCode: data.reservationCode,
        groupCode: data.groupCode || null,
        status: data.status,
        guestDisplayName: data.guestDisplayName,
        guestPhone: data.guestPhone || null,
        guestCount: data.guestCount || 1,
        roomType: data.roomType
          ? { id: data.roomType.id, name: data.roomType.name, code: data.roomType.normalizedKey }
          : data.roomTypeSnapshot
            ? { id: null, name: data.roomTypeSnapshot, code: data.roomTypeSnapshot }
            : null,
        room: data.room
          ? { id: data.room.id, roomNumber: data.room.roomNumber, floor: data.room.floor || null }
          : null,
        plannedCheckInAt: checkInDate.toISOString(),
        plannedCheckOutAt: checkOutDate.toISOString(),
        nights,
        notes: data.notes || null,
        sourceCategory: data.sourceCategory ?? null,
        sourcePartnerId: data.sourcePartnerId ?? null,
        sourcePartnerName: data.sourcePartner?.name ?? null,
        bookingOwnerUserId: data.bookingOwnerUserId ?? null,
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
      },
      pricing: {
        nightlyBreakdown,
        serviceBreakdown,
        roomSubtotal,
        taxAmount,
        serviceAmount,
        discountAmount,
        totalAmount,
        paidAmount,
        balanceAmount,
        currency: "VND",
      },
      policies: {
        checkInTime: hotelProjection.checkInTimePolicy,
        checkOutTime: hotelProjection.checkOutTimePolicy,
        cancellationPolicy,
        footerNoteText: footerNote ?? null,
        terms,
      },
    };
  }

  private projectGroupConfirmation(data: { hotel: any; reservations: any[]; groupRecord?: any }) {
    const hotel = data.hotel;
    const tz = hotel?.timezone || VIETNAM_TIME_ZONE;
    const brandSettings =
      hotel?.brandSettings && typeof hotel.brandSettings === "object"
        ? (hotel.brandSettings as Record<string, any>)
        : {};
    const template =
      (hotel as any)?.confirmationTemplate ??
      (hotel as any)?.confirmationTemplates?.[0] ??
      null;
    const nonEmpty = (val: unknown): string | undefined =>
      typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;

    const sanitizeContact = (val: unknown): string | null => {
      if (typeof val !== "string") return null;
      const trimmed = val.trim();
      if (!trimmed) return null;
      const lower = trimmed.toLowerCase();
      if (
        lower.includes("liên hệ") ||
        lower.includes("chưa xác định") ||
        lower.includes("địa chỉ khách sạn")
      ) {
        return null;
      }
      return trimmed;
    };

    const hotelProjection = {
      id: hotel.id,
      name: hotel.name,
      code: hotel.code,
      address:
        sanitizeContact(template?.hotelAddress) ||
        sanitizeContact(template?.contactInfo) ||
        sanitizeContact(brandSettings.address) ||
        [hotel.area, hotel.province].filter(Boolean).join(", ") ||
        "Địa chỉ khách sạn",
      phone:
        sanitizeContact(template?.hotelPhone) ||
        sanitizeContact(brandSettings.phone) ||
        sanitizeContact(brandSettings.hotline) ||
        null,
      email:
        sanitizeContact(template?.hotelEmail) ||
        sanitizeContact(brandSettings.email) ||
        null,
      logoUrl:
        template?.showLogo === false
          ? null
          : brandSettings.logoUrl || brandSettings.logo || null,
      checkInTimePolicy:
        nonEmpty(template?.checkInPolicy) ||
        nonEmpty(template?.checkInTimeText) ||
        brandSettings.checkInTime ||
        "14:00",
      checkOutTimePolicy:
        nonEmpty(template?.checkOutPolicy) ||
        nonEmpty(template?.checkOutTimeText) ||
        brandSettings.checkOutTime ||
        "12:00",
    };

    const firstRes = data.reservations[0];
    const groupCode = data.groupRecord?.groupCode || firstRes?.groupCode || "GROUP";
    const leadGuestName =
      data.groupRecord?.leadGuestName || firstRes?.guestDisplayName || "Trưởng đoàn";
    const leadGuestPhone =
      data.groupRecord?.leadGuestPhone || firstRes?.guestPhone || null;
    const groupName = data.groupRecord?.groupName || `Đoàn ${leadGuestName}`;

    let earliestCheckIn = new Date(firstRes?.plannedCheckInAt || new Date());
    let latestCheckOut = new Date(firstRes?.plannedCheckOutAt || new Date());

    const rooms = data.reservations.map((r: any) => {
      const cIn = new Date(r.plannedCheckInAt ?? r.checkInDate);
      const cOut = new Date(r.plannedCheckOutAt ?? r.checkOutDate);
      if (cIn < earliestCheckIn) earliestCheckIn = cIn;
      if (cOut > latestCheckOut) latestCheckOut = cOut;

      const rNights = Math.max(1, diffCalendarDays(cIn, cOut, tz));
      const roomChargeLines = (r.chargeLines || []).filter(
        (l: any) => l.lineType === "ROOM_NIGHT",
      );

      let rRoomSubtotal = 0;
      if (roomChargeLines.length > 0) {
        rRoomSubtotal = roomChargeLines.reduce(
          (sum: number, l: any) => sum + Number(l.totalSnapshot || l.unitPriceSnapshot || 0),
          0,
        );
      } else {
        const fallbackRate = Number(
          r.nightlyRateSnapshot ?? r.room?.price ?? r.roomType?.basePrice ?? 0,
        );
        rRoomSubtotal = fallbackRate * rNights;
      }

      const rNightlyRate = rNights > 0 ? Math.round(rRoomSubtotal / rNights) : 0;

      const rPaid = (r.bookingPayments || [])
        .filter((p: any) => p.status === "COMPLETED" || p.status === "ALLOCATED")
        .reduce((sum: number, p: any) => sum + Number(p.receivedAmount || 0), 0);
      const rBalance = Math.max(0, rRoomSubtotal - rPaid);

      const rawStay = r.stay;
      const rawGuestStays = r.guestStays;
      const activeStay =
        rawStay &&
        (!rawStay.status ||
          rawStay.status === "ACTIVE" ||
          rawStay.status === "CHECKED_IN" ||
          rawStay.status === "CHECKOUT_PENDING" ||
          rawStay.status === "OPEN")
          ? rawStay
          : Array.isArray(rawGuestStays) && rawGuestStays.length > 0
            ? rawGuestStays[0]
            : null;

      const resolvedRoomTypeName =
        r.roomType?.name ||
        r.room?.roomType?.name ||
        r.room?.type ||
        r.roomTypeSnapshot ||
        "Tiêu chuẩn";

      return {
        reservationId: r.id,
        reservationCode: r.reservationCode,
        activeStayId: activeStay?.id ?? null,
        stayId: activeStay?.id ?? null,
        assignedRoomId:
          r.roomId ??
          r.assignedRoomId ??
          r.room?.id ??
          r.assignedRoom?.id ??
          activeStay?.roomId ??
          null,
        roomTypeId: r.roomTypeId ?? r.roomType?.id ?? null,
        roomTypeCode: r.roomType?.code ?? r.roomType?.normalizedKey ?? null,
        guestDisplayName: r.guestDisplayName,
        guestName: r.guestDisplayName ?? r.guestName,
        guestPhone: r.guestPhone || null,
        guestEmail: r.guestEmail ?? null,
        guestCount: r.guestCount ?? 1,
        roomNumber: r.room?.roomNumber ? `P.${r.room.roomNumber}` : "Chưa gán phòng",
        assignedRoomNumber: r.room?.roomNumber ?? r.assignedRoom?.roomNumber ?? null,
        floor: r.room?.floor || null,
        roomTypeName: resolvedRoomTypeName,
        plannedCheckInAt: cIn.toISOString(),
        plannedCheckOutAt: cOut.toISOString(),
        checkInDate: cIn.toISOString(),
        checkOutDate: cOut.toISOString(),
        nights: rNights,
        nightlyRate: rNightlyRate,
        ratePerNight: rNightlyRate,
        roomSubtotal: rRoomSubtotal,
        totalAmount: rRoomSubtotal,
        paidAmount: rPaid,
        depositAmount: rPaid,
        balanceAmount: rBalance,
        specialRequests: r.notes ?? r.specialRequests ?? null,
        status: r.status,
      };
    });

    const extraLines = data.reservations.flatMap((r: any) =>
      (r.chargeLines || []).filter((l: any) => l.lineType !== "ROOM_NIGHT"),
    );
    const serviceBreakdown = extraLines.map((l: any) => ({
      name: l.nameSnapshot || "Dịch vụ",
      quantity: Number(l.quantity || 1),
      unitPrice: Number(l.unitPriceSnapshot ?? l.totalSnapshot ?? 0),
      total: Number(l.totalSnapshot ?? (Number(l.unitPriceSnapshot || 0) * Number(l.quantity || 1))),
    }));
    const totalServiceAmount = serviceBreakdown.reduce((sum: number, l: any) => sum + l.total, 0);
    const totalTaxAmount = data.reservations.reduce((acc: number, r: any) => {
      return (
        acc +
        (r.chargeLines || []).reduce(
          (sum: number, l: any) => sum + Number(l.taxAmountSnapshot || 0),
          0,
        )
      );
    }, 0);
    const totalDiscountAmount = data.reservations.reduce((acc: number, r: any) => {
      return (
        acc +
        (r.chargeLines || []).reduce(
          (sum: number, l: any) => sum + Number(l.discountAmountSnapshot || 0),
          0,
        )
      );
    }, 0);

    const groupNights = Math.max(1, diffCalendarDays(earliestCheckIn, latestCheckOut, tz));
    const totalRooms = rooms.length;
    const totalGuests = rooms.reduce((s: number, r: any) => s + r.guestCount, 0);
    const roomSubtotal = rooms.reduce((s: number, r: any) => s + r.roomSubtotal, 0);
    const roomsPaid = rooms.reduce((s: number, r: any) => s + r.paidAmount, 0);
    const groupDirectPaid = (data.groupRecord?.bookingPayments || [])
      .filter((p: any) => p.status === "COMPLETED" || p.status === "ALLOCATED")
      .reduce((sum: number, p: any) => sum + Number(p.receivedAmount || 0), 0);
    const totalPaidAmount = roomsPaid + groupDirectPaid;
    const totalAmount = roomSubtotal + totalServiceAmount + totalTaxAmount - totalDiscountAmount;
    const totalBalanceAmount = Math.max(0, totalAmount - totalPaidAmount);

    const cancellationPolicy =
      nonEmpty(template?.paymentTerms) ||
      nonEmpty(template?.cancellationPolicyText) ||
      brandSettings.cancellationPolicy ||
      "Miễn phí hủy phòng đoàn trước 7 ngày so với ngày nhận phòng. Hủy phòng sau thời hạn sẽ chịu phí 50% tổng giá trị tiền phòng.";
    const footerNote = nonEmpty(template?.footerNotes) || nonEmpty(template?.footerNoteText);
    const terms = [
      "Quý khách vui lòng cung cấp danh sách đoàn và xuất trình giấy tờ tùy thân hợp lệ khi làm thủ tục nhận phòng.",
      `Thời gian nhận phòng tiêu chuẩn từ ${hotelProjection.checkInTimePolicy} và trả phòng trước ${hotelProjection.checkOutTimePolicy}.`,
      "Thanh toán toàn bộ số tiền còn lại trước hoặc tại thời điểm làm thủ tục nhận phòng cho đoàn.",
      footerNote ||
        "Mọi thay đổi về số lượng phòng hoặc thời gian lưu trú vui lòng thông báo sớm cho bộ phận đặt phòng của khách sạn.",
    ];

    return {
      hotel: hotelProjection,
      template: template
        ? {
            title: template.title || "PHIẾU XÁC NHẬN ĐẶT PHÒNG ĐOÀN",
            subtitle: template.subtitle ?? null,
            contactInfo: template.contactInfo ?? null,
            checkInPolicy: template.checkInPolicy ?? null,
            checkOutPolicy: template.checkOutPolicy ?? null,
            paymentTerms: template.paymentTerms ?? null,
            footerNotes: template.footerNotes ?? null,
            showLogo: template.showLogo ?? true,
            showPriceBreakdown: template.showPriceBreakdown ?? true,
          }
        : null,
      group: {
        groupCode,
        groupName,
        leadGuestName,
        leadGuestPhone,
        notes: data.groupRecord?.notes || null,
        totalRooms,
        checkInDate: earliestCheckIn.toISOString(),
        checkOutDate: latestCheckOut.toISOString(),
        nights: groupNights,
      },
      rooms,
      pricing: {
        totalRooms,
        totalGuests,
        roomSubtotal,
        serviceBreakdown,
        taxAmount: totalTaxAmount,
        serviceAmount: totalServiceAmount,
        discountAmount: totalDiscountAmount,
        totalAmount,
        paidAmount: totalPaidAmount,
        balanceAmount: totalBalanceAmount,
        currency: "VND",
      },
      policies: {
        checkInTime: hotelProjection.checkInTimePolicy,
        checkOutTime: hotelProjection.checkOutTimePolicy,
        cancellationPolicy,
        footerNoteText: footerNote ?? null,
        terms,
      },
    };
  }

  async listBookingSourcePartners(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListBookingSourcePartnersQueryInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.listBookingSourcePartners(hotelId, query);
  }

  async createBookingSourcePartner(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateBookingSourcePartnerBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.createBookingSourcePartner(hotelId, dto);
  }

  async updateBookingSourcePartner(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    partnerId: string,
    dto: UpdateBookingSourcePartnerBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.updateBookingSourcePartner(hotelId, partnerId, dto);
  }

  async deleteBookingSourcePartner(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    partnerId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.reservationsRepository.deleteBookingSourcePartner(hotelId, partnerId);
  }
}
