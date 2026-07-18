import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../common/security/token-hash.util";
import { CodesService } from "../../codes/codes.service";
import type {
  AssignReservationRoomBodyInput,
  CreateReservationBodyInput,
  ListArrivalsQueryInput,
} from "../domain/schemas/reservations.schema";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";
import { HotelAccessService } from "./hotel-access.service";

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async createReservation(actorUserId: string, hotelId: string, dto: CreateReservationBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const reservationCode = await this.codesService.generateEntityCode("RESERVATION");
    return this.reservationsRepository.createReservation({
      hotelId,
      reservationCode,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
    });
  }

  async listArrivals(actorUserId: string, hotelId: string, query: ListArrivalsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [total, items] = await this.reservationsRepository.listArrivals({
      hotelId,
      from: query.from,
      to: query.to,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { page, limit, total, items };
  }

  async assignRoom(
    actorUserId: string,
    hotelId: string,
    reservationId: string,
    dto: AssignReservationRoomBodyInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const reservation = await this.reservationsRepository.assignRoom({
      hotelId,
      reservationId,
      roomId: dto.roomId,
      actorUserId,
    });
    if (!reservation) {
      throw new NotFoundException("Không tìm thấy đặt phòng");
    }
    return reservation;
  }

  async checkIn(actorUserId: string, hotelId: string, reservationId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
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
    });
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
