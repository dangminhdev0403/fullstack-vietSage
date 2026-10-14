import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
  CheckInReservationBodyInput,
  CreateReservationBodyInput,
  ListArrivalsQueryInput,
} from "../domain/schemas/reservations.schema";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";
import { getBusinessDateRange } from "../infrastructure/repositories/hotel-rooms.repository";
import { HotelAccessService } from "./hotel-access.service";

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    @Optional()
    @Inject(STAY_CHECK_IN_EVENT_PUBLISHER)
    private readonly stayCheckInPublisher?: StayCheckInEventPublisher,
  ) {}

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
    const reservationCode = await this.codesService.generateEntityCode("RESERVATION");
    const rawRate = dto.rate !== undefined ? dto.rate : dto.nightlyRateSnapshot;
    const nightlyRateSnapshot =
      rawRate !== undefined && rawRate !== null
        ? new Prisma.Decimal(rawRate).toFixed(2)
        : null;

    return this.reservationsRepository.createReservation({
      hotelId,
      reservationCode,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      roomId,
      nightlyRateSnapshot,
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
    const from = getBusinessDateRange(
      query.from.toISOString().slice(0, 10),
      scope.hotel.timezone,
    ).start;
    const to = getBusinessDateRange(
      query.to.toISOString().slice(0, 10),
      scope.hotel.timezone,
    ).start;
    const [total, items] = await this.reservationsRepository.listArrivals({
      hotelId,
      from,
      to,
      skip: (page - 1) * limit,
      take: limit,
      roomId: scope.allowedRoomId ?? undefined,
      q: query.q,
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
}
