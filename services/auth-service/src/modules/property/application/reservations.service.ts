import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { calculateReservationChargeTotal } from "../../../common/pricing/reservation-charge-total";
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
import { HotelAccessService, type HotelRoomScope } from "./hotel-access.service";
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

  private async emitRoomStatusUpdated(input: {
    hotelId: string;
    roomId: string;
    fallbackStatus: RoomStatus;
    previousStatus?: RoomStatus | null;
  }) {
    try {
      const room = await this.reservationsRepository.findRoomStatusInHotel?.(
        input.hotelId,
        input.roomId,
      );
      RequestRealtimeEmitter.emitRoomStatusUpdated({
        hotelId: input.hotelId,
        roomId: input.roomId,
        roomNumber: room?.roomNumber ?? null,
        status: room?.status ?? input.fallbackStatus,
        previousStatus: input.previousStatus ?? null,
        updatedAt: room?.updatedAt ?? null,
      });
    } catch {
      // Realtime delivery must not fail a committed reservation transition.
    }
  }

  private hasRestrictedRoomScope(scope: Pick<HotelRoomScope, "allowedRoomId" | "allowedRoomIds">) {
    return (
      scope.allowedRoomId !== null ||
      (scope.allowedRoomIds !== undefined && scope.allowedRoomIds !== null)
    );
  }

  private assertReservationInScope(
    scope: HotelRoomScope,
    reservation: { roomId?: string | null } | null,
  ) {
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    if (reservation.roomId) {
      this.hotelAccessService.assertRoomAccess(scope, reservation.roomId);
      return;
    }
    if (this.hasRestrictedRoomScope(scope)) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
  }

  private assertGroupInScope(
    scope: HotelRoomScope,
    groupReservations: Array<{ roomId?: string | null; assignedRoomId?: string | null }> | undefined,
    forbiddenMessage: string,
  ) {
    if (!this.hasRestrictedRoomScope(scope)) return;
    if (!groupReservations || groupReservations.length === 0) {
      throw new ForbiddenException(forbiddenMessage);
    }
    const allowedSet = scope.allowedRoomIds ? new Set(scope.allowedRoomIds) : null;
    const hasUnauthorizedRoom = groupReservations.some((r) => {
      const targetRoomId = r.roomId ?? r.assignedRoomId;
      if (!targetRoomId) return true;
      if (scope.allowedRoomId !== null && targetRoomId !== scope.allowedRoomId) return true;
      if (allowedSet && !allowedSet.has(targetRoomId)) return true;
      return false;
    });
    if (hasUnauthorizedRoom) {
      throw new ForbiddenException(forbiddenMessage);
    }
  }

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
    const maxScopedRooms =
      scope.allowedRoomId !== null
        ? 1
        : scope.allowedRoomIds !== undefined && scope.allowedRoomIds !== null
          ? scope.allowedRoomIds.length
          : null;
    if (maxScopedRooms !== null) {
      if (dto.roomIds && dto.roomIds.length > maxScopedRooms) {
        throw new ForbiddenException("Tài khoản chỉ được phép thao tác trên phòng được phân công");
      }
      if (
        dto.allocations &&
        dto.allocations.reduce((acc, a) => acc + (a.quantity || 0), 0) > maxScopedRooms
      ) {
        throw new ForbiddenException("Tài khoản chỉ được phép thao tác trên phòng được phân công");
      }
    }

    const tz = resolveTimeZone(scope.hotel.timezone);
    const leadGuestName = (dto.leadGuestName ?? dto.guestDisplayName)!.trim();
    const leadGuestPhone = (dto.leadGuestPhone ?? dto.guestPhone)?.trim();
    const checkInDate = normalizeHotelReservationDate(
      (dto.checkInDate ?? dto.plannedCheckInAt)!,
      "checkIn",
      tz,
    );
    const checkOutDate = normalizeHotelReservationDate(
      (dto.checkOutDate ?? dto.plannedCheckOutAt)!,
      "checkOut",
      tz,
    );
    const rawRate = dto.rate !== undefined ? dto.rate : dto.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined && rawRate !== null ? new Prisma.Decimal(rawRate).toFixed(2) : null;

    const groupCode =
      dto.groupCode?.trim() || (await this.codesService.generateEntityCode("GROUP"));

    const result = await this.reservationsRepository.createBulkReservations({
      hotelId,
      groupCode,
      groupName: dto.groupName?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
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
      assertRoomAccess: (roomId: string) => this.hotelAccessService.assertRoomAccess(scope, roomId),
      chargeLines: dto.chargeLines,
      sourceCategory: dto.sourceCategory,
      sourcePartnerId: dto.sourcePartnerId,
      bookingOwnerUserId: dto.bookingOwnerUserId?.trim() || actorUserId,
    });
    for (const created of result.reservations ?? []) {
      if (created?.roomId) {
        await this.emitRoomStatusUpdated({
          hotelId,
          roomId: created.roomId,
          fallbackStatus: RoomStatus.RESERVED,
        });
      }
    }
    return result;
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
      dto.reservationCode?.trim() || (await this.codesService.generateEntityCode("RESERVATION"));
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
      assertRoomAccess: (rid: string) => this.hotelAccessService.assertRoomAccess(scope, rid),
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
    const includeOverdue = Boolean(query.includeOverdue);
    const from =
      !includeOverdue && query.from
        ? getBusinessDateRange(toYmd(query.from, tz), tz).start
        : undefined;
    const to = query.to
      ? getBusinessDateRange(toYmd(query.to, tz), tz).start
      : undefined;
    const [total, rawItems] = await this.reservationsRepository.listArrivals({
      hotelId,
      from,
      to,
      skip: (page - 1) * limit,
      take: limit,
      roomId: scope.allowedRoomId ?? undefined,
      roomIds: scope.allowedRoomIds ?? undefined,
      q: query.q,
    });
    const items = rawItems.map((r: any) => {
      let roomSubtotal = 0;
      let serviceSubtotal = 0;
      let totalAmount = 0;
      let effectiveRate: unknown = r.nightlyRateSnapshot ?? null;
      try {
        const quote = calculateReservationChargeTotal(r, tz);
        roomSubtotal = quote.roomSubtotal.toNumber();
        serviceSubtotal = quote.extraSubtotal.toNumber();
        totalAmount = quote.totalAmount.toNumber();
        effectiveRate =
          r.nightlyRateSnapshot ??
          quote.roomSubtotal.div(quote.nights).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "MISSING_AGREED_ROOM_RATE_SNAPSHOT") {
          throw err;
        }
      }

      return {
        ...r,
        nightlyRateSnapshot: effectiveRate != null ? String(effectiveRate) : null,
        rate: effectiveRate != null ? String(effectiveRate) : null,
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    let previousRoomId: string | null = null;
    if (typeof this.reservationsRepository.findReservationById === "function") {
      const existing = await this.reservationsRepository.findReservationById(hotelId, reservationId);
      if (this.hasRestrictedRoomScope(scope) && existing) {
        this.assertReservationInScope(scope, existing);
      }
      previousRoomId = existing?.roomId ?? null;
    }
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
    if (previousRoomId && previousRoomId !== dto.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: previousRoomId,
        fallbackStatus: RoomStatus.AVAILABLE,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    await this.emitRoomStatusUpdated({
      hotelId,
      roomId: dto.roomId,
      fallbackStatus: RoomStatus.RESERVED,
    });
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
      if (this.hasRestrictedRoomScope(scope)) {
        throw new NotFoundException("Không tìm thấy đặt phòng");
      }
    }
    const roomBeforeCheckIn = reservation?.roomId
      ? await this.reservationsRepository.findRoomStatusInHotel?.(hotelId, reservation.roomId)
      : null;
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
        await this.emitRoomStatusUpdated({
          hotelId,
          roomId: result.stay.roomId,
          fallbackStatus: RoomStatus.OCCUPIED,
          previousStatus: roomBeforeCheckIn?.status ?? RoomStatus.AVAILABLE,
        });
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    this.assertReservationInScope(scope, reservation);
    if (reservation!.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        reservation!.roomId,
      );
    }
    if (reservation!.status === ReservationStatus.CHECKED_IN) {
      throw new ConflictException("Không thể hủy đặt phòng đã check-in");
    }
    if (
      reservation!.status === ReservationStatus.CANCELLED ||
      reservation!.status === ReservationStatus.NO_SHOW
    ) {
      throw new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt");
    }
    if (
      reservation!.status !== ReservationStatus.CONFIRMED &&
      reservation!.status !== ReservationStatus.ARRIVAL_READY
    ) {
      throw new ConflictException("Trạng thái đặt phòng không hợp lệ để hủy");
    }

    const cancelled = await this.reservationsRepository.cancelReservation({
      hotelId,
      tenantId: scope.hotel.tenantId,
      reservationId,
      actorUserId,
      reason: dto.reason,
    });
    if (reservation!.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: reservation!.roomId,
        fallbackStatus: RoomStatus.AVAILABLE,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    return cancelled;
  }

  async markNoShow(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: MarkNoShowBodyInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    this.assertReservationInScope(scope, reservation);
    if (reservation!.roomId) {
      await this.hotelAccessService.assertRoomAccess(
        actorUserId,
        activeRoleId,
        hotelId,
        reservation!.roomId,
      );
    }
    if (reservation!.status === ReservationStatus.CHECKED_IN) {
      throw new ConflictException("Không thể báo vắng mặt đặt phòng đã check-in");
    }
    if (
      reservation!.status === ReservationStatus.CANCELLED ||
      reservation!.status === ReservationStatus.NO_SHOW
    ) {
      throw new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt");
    }
    if (
      reservation!.status !== ReservationStatus.CONFIRMED &&
      reservation!.status !== ReservationStatus.ARRIVAL_READY
    ) {
      throw new ConflictException("Trạng thái đặt phòng không hợp lệ để báo vắng mặt");
    }

    const updated = await this.reservationsRepository.markNoShow({
      hotelId,
      tenantId: scope.hotel.tenantId,
      reservationId,
      actorUserId,
      reason: dto.reason,
    });
    if (reservation!.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: reservation!.roomId,
        fallbackStatus: RoomStatus.AVAILABLE,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    return updated;
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
      roomScopeIds:
        roomScope.allowedRoomIds ??
        (roomScope.allowedRoomId ? [roomScope.allowedRoomId] : null),
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    let previousRoomId: string | null = null;
    if (typeof this.reservationsRepository.findReservationById === "function") {
      const sourceRes = await this.reservationsRepository.findReservationById(
        hotelId,
        reservationId.replace(/^res-/, ""),
      );
      if (this.hasRestrictedRoomScope(scope)) {
        this.assertReservationInScope(scope, sourceRes);
      }
      previousRoomId = sourceRes?.roomId ?? null;
      if (dto.swapWithReservationId && this.hasRestrictedRoomScope(scope)) {
        const swapRes = await this.reservationsRepository.findReservationById(
          hotelId,
          dto.swapWithReservationId.replace(/^res-/, ""),
        );
        this.assertReservationInScope(scope, swapRes);
      }
    }
    await this.hotelAccessService.assertRoomAccess(
      actorUserId,
      activeRoleId,
      hotelId,
      dto.targetRoomId,
    );
    const result = await this.reservationsRepository.updateReservationPlacement({
      hotelId,
      tenantId: scope.hotel.tenantId,
      reservationId,
      targetRoomId: dto.targetRoomId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      swapWithReservationId: dto.swapWithReservationId,
      swapExpectedUpdatedAt: dto.swapExpectedUpdatedAt,
      actorUserId,
    });
    if (previousRoomId && previousRoomId !== dto.targetRoomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: previousRoomId,
        fallbackStatus: RoomStatus.AVAILABLE,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    await this.emitRoomStatusUpdated({
      hotelId,
      roomId: dto.targetRoomId,
      fallbackStatus: RoomStatus.RESERVED,
      previousStatus: RoomStatus.RESERVED,
    });
    return result;
  }

  async updateReservationDates(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
    dto: UpdateReservationDatesBodyInput,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    if (
      this.hasRestrictedRoomScope(scope) &&
      typeof this.reservationsRepository.findReservationById === "function"
    ) {
      const existing = await this.reservationsRepository.findReservationById(hotelId, reservationId);
      this.assertReservationInScope(scope, existing);
    }
    const appliedNightlyRate = dto.nightlyRateSnapshot ?? dto.rate;
    const updated = await this.reservationsRepository.updateReservationDates({
      hotelId,
      tenantId: scope.hotel.tenantId,
      reservationId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      nightlyRateSnapshot: appliedNightlyRate,
      chargeLines: dto.chargeLines,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      actorUserId,
    });
    if (updated.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: updated.roomId,
        fallbackStatus: RoomStatus.RESERVED,
        previousStatus: RoomStatus.RESERVED,
      });
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    let previousRoomId: string | null = null;
    if (typeof this.reservationsRepository.findReservationById === "function") {
      const existing = await this.reservationsRepository.findReservationById(hotelId, reservationId);
      if (this.hasRestrictedRoomScope(scope)) {
        this.assertReservationInScope(scope, existing);
      }
      previousRoomId = existing?.roomId ?? null;
    }
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
      tenantId: scope.hotel.tenantId,
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
    if (previousRoomId && previousRoomId !== updated.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: previousRoomId,
        fallbackStatus: RoomStatus.AVAILABLE,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    if (updated.roomId) {
      await this.emitRoomStatusUpdated({
        hotelId,
        roomId: updated.roomId,
        fallbackStatus: RoomStatus.RESERVED,
        previousStatus: RoomStatus.RESERVED,
      });
    }
    return updated;
  }

  async getReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationById(
      hotelId,
      reservationId,
    );
    this.assertReservationInScope(scope, reservation);
    return reservation;
  }

  async getGroupReservation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    groupCode: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const group = await this.reservationsRepository.findGroupByCode(hotelId, groupCode);
    this.assertGroupInScope(
      scope,
      group?.reservations,
      "Tài khoản không có quyền truy cập thông tin đoàn có phòng ngoài phạm vi phân công",
    );
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    if (this.hasRestrictedRoomScope(scope)) {
      const group = await this.reservationsRepository.findGroupByCode(hotelId, groupCode);
      this.assertGroupInScope(
        scope,
        group?.reservations,
        "Tài khoản chỉ được phép thao tác trên phòng được phân công",
      );
    }
    return this.reservationsRepository.updateGroupByCode(hotelId, groupCode, dto);
  }

  async getReservationConfirmation(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    reservationId: string,
  ) {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const reservation = await this.reservationsRepository.findReservationConfirmation(
      hotelId,
      reservationId,
    );
    if (reservation.roomId) {
      this.hotelAccessService.assertRoomAccess(scope, reservation.roomId);
    } else if (this.hasRestrictedRoomScope(scope)) {
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
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const data = await this.reservationsRepository.findGroupConfirmation(hotelId, groupCode);
    this.assertGroupInScope(
      scope,
      data?.reservations,
      "Tài khoản không có quyền truy cập thông tin đoàn có phòng ngoài phạm vi phân công",
    );
    return this.projectGroupConfirmation(data);
  }

  async getConfirmationTemplate(actorUserId: string, activeRoleId: string, hotelId: string) {
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
    const tz = resolveTimeZone(hotel?.timezone);
    const brandSettings =
      hotel?.brandSettings && typeof hotel.brandSettings === "object"
        ? (hotel.brandSettings as Record<string, any>)
        : {};
    const template = hotel?.confirmationTemplate ?? hotel?.confirmationTemplates?.[0] ?? null;
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
      email: sanitizeContact(template?.hotelEmail) || sanitizeContact(brandSettings.email) || null,
      logoUrl:
        template?.showLogo === false ? null : brandSettings.logoUrl || brandSettings.logo || null,
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
    const quote = calculateReservationChargeTotal(data, tz);
    const nights = quote.nights;
    const nightlyBreakdown = quote.nightlyCharges.map((line, index) => ({
      date: line.date,
      description: `Đêm ${index + 1}`,
      rate: line.amount.toNumber(),
      lineType: "ROOM_NIGHT",
    }));
    const roomSubtotal = quote.roomSubtotal.toNumber();
    const extraLines = (data.chargeLines || []).filter((l: any) => l.lineType !== "ROOM_NIGHT");
    const serviceBreakdown = extraLines.map((l: any) => ({
      name: l.nameSnapshot || "Dịch vụ",
      quantity: Number(l.quantity || 1),
      unitPrice: Number(l.unitPriceSnapshot ?? l.totalSnapshot ?? 0),
      total: Number(l.totalSnapshot ?? Number(l.unitPriceSnapshot || 0) * Number(l.quantity || 1)),
    }));
    const serviceAmount = quote.extraSubtotal.toNumber();
    const taxAmount = (data.chargeLines || []).reduce(
      (sum: number, l: any) => sum + Number(l.taxAmountSnapshot || 0),
      0,
    );
    const discountAmount = (data.chargeLines || []).reduce(
      (sum: number, l: any) => sum + Number(l.discountAmountSnapshot || 0),
      0,
    );
    const totalAmount = quote.totalAmount.toNumber();

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
        createdAt: data.createdAt
          ? new Date(data.createdAt).toISOString()
          : new Date().toISOString(),
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
    const tz = resolveTimeZone(hotel?.timezone);
    const brandSettings =
      hotel?.brandSettings && typeof hotel.brandSettings === "object"
        ? (hotel.brandSettings as Record<string, any>)
        : {};
    const template = hotel?.confirmationTemplate ?? hotel?.confirmationTemplates?.[0] ?? null;
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
      email: sanitizeContact(template?.hotelEmail) || sanitizeContact(brandSettings.email) || null,
      logoUrl:
        template?.showLogo === false ? null : brandSettings.logoUrl || brandSettings.logo || null,
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
    const leadGuestPhone = data.groupRecord?.leadGuestPhone || firstRes?.guestPhone || null;
    const groupName = data.groupRecord?.groupName || `Đoàn ${leadGuestName}`;

    let earliestCheckIn = new Date(firstRes?.plannedCheckInAt || new Date());
    let latestCheckOut = new Date(firstRes?.plannedCheckOutAt || new Date());

    const rooms = data.reservations.map((r: any) => {
      const cIn = new Date(r.plannedCheckInAt ?? r.checkInDate);
      const cOut = new Date(r.plannedCheckOutAt ?? r.checkOutDate);
      if (cIn < earliestCheckIn) earliestCheckIn = cIn;
      if (cOut > latestCheckOut) latestCheckOut = cOut;

      let rNights = Math.max(1, diffCalendarDays(cIn, cOut, tz));
      let rRoomSubtotal = 0;
      let rTotal = 0;
      let rNightlyRate = 0;
      try {
        const quote = calculateReservationChargeTotal(
          {
            ...r,
            plannedCheckInAt: cIn,
            plannedCheckOutAt: cOut,
          },
          tz,
        );
        rNights = quote.nights;
        rRoomSubtotal = quote.roomSubtotal.toNumber();
        rTotal = quote.totalAmount.toNumber();
        rNightlyRate = quote.roomSubtotal
          .div(rNights)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          .toNumber();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "MISSING_AGREED_ROOM_RATE_SNAPSHOT") {
          throw err;
        }
      }

      const rPaid = (r.bookingPayments || [])
        .filter((p: any) => p.status === "COMPLETED" || p.status === "ALLOCATED")
        .reduce((sum: number, p: any) => sum + Number(p.receivedAmount || 0), 0);
      const rBalance = Math.max(0, rTotal - rPaid);

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
        totalAmount: rTotal,
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
      total: Number(l.totalSnapshot ?? Number(l.unitPriceSnapshot || 0) * Number(l.quantity || 1)),
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
      .filter(
        (p: any) =>
          p.reservationId == null && (p.status === "COMPLETED" || p.status === "ALLOCATED"),
      )
      .reduce((sum: number, p: any) => sum + Number(p.receivedAmount || 0), 0);
    const totalPaidAmount = roomsPaid + groupDirectPaid;
    const totalAmount = rooms
      .reduce((sum: Prisma.Decimal, room) => sum.add(room.totalAmount), new Prisma.Decimal(0))
      .toNumber();
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
