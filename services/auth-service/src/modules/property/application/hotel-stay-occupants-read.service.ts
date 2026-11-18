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
  groupCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActiveStayOccupantsPagedOptions {
  cursor?: string;
  take?: number;
  stayIds?: string[];
  roomIds?: string[];
  /** Inclusive UTC start instant for authoritative stay arrival (`checkedInAt ?? plannedCheckInAt >= arrivalStart`) */
  arrivalStart?: Date;
  /** Exclusive UTC end instant for authoritative stay arrival (`checkedInAt ?? plannedCheckInAt < arrivalEnd`) */
  arrivalEnd?: Date;
  /**
   * Filter directly in PostgreSQL by KBTT declaration status:
   * - `"UNSYNCHRONIZED"`: occupants that do NOT have any `kbttGuestDeclarations` with `status: { in: ["SUBMITTED", "UNKNOWN", "CANCELLED"] }` (i.e. `kbttGuestDeclarations: { none: { status: { in: ["SUBMITTED", "UNKNOWN", "CANCELLED"] } } }`), so that even if a hotel has 5,000 already-SUBMITTED guests on early pages, a single DB query immediately returns only unsent/failed/draft/missing-profile guests!
   * - `"UNKNOWN_ONLY"`: occupants that have `kbttGuestDeclarations: { some: { status: "UNKNOWN" } }`.
   */
  kbttFilter?: "UNSYNCHRONIZED" | "UNKNOWN_ONLY";
}

@Injectable()
export class HotelStayOccupantsReadService {
  constructor(private readonly hotelRoomsRepository: HotelRoomsRepository) {}

  async getActiveStayOccupants(
    hotelId: string,
    options?: Pick<ActiveStayOccupantsPagedOptions, "stayIds" | "roomIds" | "arrivalStart" | "arrivalEnd" | "kbttFilter">,
  ): Promise<ActiveStayOccupantRow[]> {
    if (!hotelId || typeof hotelId !== "string" || !hotelId.trim()) {
      return [];
    }

    const normalizedHotelId = hotelId.trim();
    const hasFilterOptions =
      options?.stayIds !== undefined ||
      options?.roomIds !== undefined ||
      options?.arrivalStart !== undefined ||
      options?.arrivalEnd !== undefined ||
      options?.kbttFilter !== undefined;
    const rows = await (hasFilterOptions
      ? this.hotelRoomsRepository.findActiveStayOccupantsByHotel(normalizedHotelId, options)
      : this.hotelRoomsRepository.findActiveStayOccupantsByHotel(normalizedHotelId));

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
      groupCode: row.stay.reservation?.groupCode ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listActiveStayOccupants(hotelId: string): Promise<ActiveStayOccupantRow[]> {
    return this.getActiveStayOccupants(hotelId);
  }

  static readonly MAX_PAGE_SIZE = 500;
  static readonly DEFAULT_PAGE_SIZE = 50;

  async getActiveStayOccupantsPaged(
    hotelId: string,
    options?: ActiveStayOccupantsPagedOptions,
  ): Promise<{ items: ActiveStayOccupantRow[]; nextCursor: string | null }> {
    if (!hotelId || typeof hotelId !== "string" || !hotelId.trim()) {
      return { items: [], nextCursor: null };
    }

    const normalizedHotelId = hotelId.trim();
    const take =
      options?.take !== undefined && Number.isFinite(options.take)
        ? Math.min(Math.max(Math.trunc(options.take), 1), HotelStayOccupantsReadService.MAX_PAGE_SIZE)
        : HotelStayOccupantsReadService.DEFAULT_PAGE_SIZE;
    const rows = await this.hotelRoomsRepository.findActiveStayOccupantsByHotel(normalizedHotelId, {
      cursor: options?.cursor,
      take: take + 1,
      ...(options?.stayIds !== undefined ? { stayIds: options.stayIds } : {}),
      ...(options?.roomIds !== undefined ? { roomIds: options.roomIds } : {}),
      ...(options?.arrivalStart !== undefined ? { arrivalStart: options.arrivalStart } : {}),
      ...(options?.arrivalEnd !== undefined ? { arrivalEnd: options.arrivalEnd } : {}),
      ...(options?.kbttFilter !== undefined ? { kbttFilter: options.kbttFilter } : {}),
    });

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
      groupCode: row.stay.reservation?.groupCode ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return { items, nextCursor };
  }

  async getDailyMovements(
    hotelId: string,
    params: {
      kind: "ARRIVAL" | "DEPARTURE";
      start: Date;
      end: Date;
      q?: string;
      allowedRoomId?: string | null;
      page: number;
      limit: number;
    },
  ) {
    if (!hotelId || typeof hotelId !== "string" || !hotelId.trim()) {
      return { items: [], total: 0 };
    }
    return this.hotelRoomsRepository.findDailyMovementsByHotel(hotelId.trim(), params);
  }
}
