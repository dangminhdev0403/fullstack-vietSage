import { Injectable } from "@nestjs/common";
import { CitizenshipKind, GuestStayStatus } from "@prisma/client";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";

export { CitizenshipKind };

export interface ActiveStayOccupantRow {
  id: string;
  occupantId: string;
  stayId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  isPrimary: boolean;
  fullName: string;
  phone: string | null;
  identityNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  residencePlace: string | null;
  citizenshipKind: CitizenshipKind | null;
  plannedCheckInAt: Date;
  plannedCheckOutAt: Date;
  checkedInAt: Date | null;
  stayStatus: GuestStayStatus;
  reservationCode: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class HotelStayOccupantsReadService {
  constructor(private readonly hotelRoomsRepository: HotelRoomsRepository) {}

  async getActiveStayOccupants(hotelId: string): Promise<ActiveStayOccupantRow[]> {
    if (!hotelId || typeof hotelId !== "string" || !hotelId.trim()) {
      return [];
    }

    const normalizedHotelId = hotelId.trim();
    const rows = await this.hotelRoomsRepository.findActiveStayOccupantsByHotel(normalizedHotelId);

    return rows.map((row) => ({
      id: row.id,
      occupantId: row.id,
      stayId: row.stayId,
      hotelId: row.hotelId,
      roomId: row.stay.roomId,
      roomNumber: row.stay.room.roomNumber,
      isPrimary: row.isPrimary,
      fullName: row.fullName,
      phone: row.phone ?? null,
      identityNumber: row.identityNumber ?? null,
      dateOfBirth: row.dateOfBirth ?? null,
      gender: row.gender ?? null,
      nationality: row.nationality ?? null,
      residencePlace: row.residencePlace ?? null,
      citizenshipKind: row.citizenshipKind ?? null,
      plannedCheckInAt: row.stay.plannedCheckInAt,
      plannedCheckOutAt: row.stay.plannedCheckOutAt,
      checkedInAt: row.stay.checkedInAt ?? null,
      stayStatus: row.stay.status,
      reservationCode: row.stay.reservationCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listActiveStayOccupants(hotelId: string): Promise<ActiveStayOccupantRow[]> {
    return this.getActiveStayOccupants(hotelId);
  }

  async getActiveStayOccupantsPaged(
    hotelId: string,
    options?: { cursor?: string; take?: number },
  ): Promise<{ items: ActiveStayOccupantRow[]; nextCursor: string | null }> {
    if (!hotelId || typeof hotelId !== "string" || !hotelId.trim()) {
      return { items: [], nextCursor: null };
    }

    const normalizedHotelId = hotelId.trim();
    const take = options?.take ? Math.min(Math.max(options.take, 1), 500) : 50;
    const rows = await this.hotelRoomsRepository.findActiveStayOccupantsByHotel(
      normalizedHotelId,
      { cursor: options?.cursor, take: take + 1 },
    );

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;

    const items = pageRows.map((row) => ({
      id: row.id,
      occupantId: row.id,
      stayId: row.stayId,
      hotelId: row.hotelId,
      roomId: row.stay.roomId,
      roomNumber: row.stay.room.roomNumber,
      isPrimary: row.isPrimary,
      fullName: row.fullName,
      phone: row.phone ?? null,
      identityNumber: row.identityNumber ?? null,
      dateOfBirth: row.dateOfBirth ?? null,
      gender: row.gender ?? null,
      nationality: row.nationality ?? null,
      residencePlace: row.residencePlace ?? null,
      citizenshipKind: row.citizenshipKind ?? null,
      plannedCheckInAt: row.stay.plannedCheckInAt,
      plannedCheckOutAt: row.stay.plannedCheckOutAt,
      checkedInAt: row.stay.checkedInAt ?? null,
      stayStatus: row.stay.status,
      reservationCode: row.stay.reservationCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return { items, nextCursor };
  }
}
