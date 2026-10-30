import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventStatus,
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  Prisma,
  ReservationStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { getDayBounds } from "../../../../common/time/vietnam-temporal";
import { countDistinctGuestDevicesByStay } from "../../../../shared/guest-device-identity";
import { PrismaService } from "../../../../prisma/prisma.service";
import { inferCitizenshipKind } from "../../domain/infer-citizenship-kind";
import { roomListInclude, type RoomListRow } from "./hotel-repository.types";

/** Local business-day bounds for `YYYY-MM-DD`: `start` inclusive, `end` = next local midnight (exclusive). */
export function getBusinessDateRange(
  dateStr: string,
  timeZone?: string | null,
): { start: Date; end: Date } {
  return getDayBounds(dateStr, timeZone);
}

@Injectable()
export class HotelRoomsRepository {
  constructor(private readonly prisma: PrismaService) {}
  static normalizeType(name: string) {
    const display = name.normalize("NFKC").trim().replace(/\s+/g, " ");
    return { name: display, normalizedKey: display.toLowerCase() };
  }

  async listRoomTypes(hotelId: string) {
    const [types, rooms] = await Promise.all([
      this.prisma.roomType.findMany({ where: { hotelId }, orderBy: { name: "asc" } }),
      this.prisma.room.findMany({ where: { hotelId }, select: { type: true, roomTypeId: true } }),
    ]);
    const known = new Set(types.map((type) => type.normalizedKey));
    const legacy = new Map<string, { name: string; count: number }>();
    for (const room of rooms) {
      if (!room.type || room.roomTypeId) continue;
      const { name, normalizedKey } = HotelRoomsRepository.normalizeType(room.type);
      if (!name || known.has(normalizedKey)) continue;
      const current = legacy.get(normalizedKey);
      legacy.set(normalizedKey, { name: current?.name ?? name, count: (current?.count ?? 0) + 1 });
    }
    return [
      ...types.map((type) => ({
        id: type.id,
        name: type.name,
        basePrice: type.basePrice === null ? null : Number(type.basePrice),
        maxOccupancy: (type as any).maxOccupancy ?? null,
        readiness:
          type.basePrice !== null && Number(type.basePrice) > 0
            ? ("READY" as const)
            : ("MISSING_PRICE" as const),
        roomCount: rooms.filter(
          (room) =>
            room.roomTypeId === type.id ||
            (!room.roomTypeId &&
              room.type &&
              HotelRoomsRepository.normalizeType(room.type).normalizedKey === type.normalizedKey),
        ).length,
      })),
      ...Array.from(legacy, ([key, value]) => ({
        id: `legacy:${key}`,
        name: value.name,
        basePrice: null,
        maxOccupancy: null,
        readiness: "MISSING_PRICE" as const,
        roomCount: value.count,
      })),
    ];
  }

  async createRoomType(
    hotelId: string,
    name: string,
    basePrice: number,
    maxOccupancy?: number | null,
  ) {
    const normalized = HotelRoomsRepository.normalizeType(name);
    if (!normalized.name) throw new BadRequestException("Tên loại phòng không được để trống");
    if (normalized.name.length > 80 || normalized.normalizedKey.length > 80) {
      throw new BadRequestException("Tên loại phòng tối đa 80 ký tự sau chuẩn hóa");
    }
    if (!basePrice || basePrice <= 0) {
      throw new BadRequestException("Giá gốc loại phòng phải lớn hơn 0");
    }

    return await this.prisma.$transaction(async (tx) => {
      let item = await tx.roomType.findUnique({
        where: { hotelId_normalizedKey: { hotelId, normalizedKey: normalized.normalizedKey } },
      });
      let created = false;

      if (!item) {
        item = await tx.roomType.create({
          data: {
            hotelId,
            ...normalized,
            basePrice,
            ...(maxOccupancy !== undefined ? { maxOccupancy } : {}),
          },
        });
        created = true;
      } else {
        item = await tx.roomType.update({
          where: { id: item.id },
          data: {
            basePrice,
            ...(maxOccupancy !== undefined ? { maxOccupancy } : {}),
          },
        });
      }

      const legacyRooms = await tx.room.findMany({
        where: { hotelId, roomTypeId: null, type: { not: null } },
        select: { id: true, type: true },
      });
      const matchingIds = legacyRooms
        .filter(
          (room) =>
            room.type &&
            HotelRoomsRepository.normalizeType(room.type).normalizedKey ===
              normalized.normalizedKey,
        )
        .map((room) => room.id);

      if (matchingIds.length > 0) {
        await tx.room.updateMany({
          where: { id: { in: matchingIds } },
          data: {
            roomTypeId: item.id,
            price: basePrice,
          },
        });
      }

      return { item: await this.roomTypeItem(item), created };
    });
  }

  async updateRoomTypePrice(
    hotelId: string,
    roomTypeId: string,
    basePrice?: number,
    maxOccupancy?: number | null,
  ) {
    if (basePrice !== undefined && (!basePrice || basePrice <= 0)) {
      throw new BadRequestException("Giá gốc loại phòng phải lớn hơn 0");
    }
    return await this.prisma.$transaction(async (tx) => {
      const type = await tx.roomType.findFirst({
        where: { hotelId, id: roomTypeId },
      });
      if (!type) throw new NotFoundException("Không tìm thấy loại phòng trong khách sạn");

      const updatedType = await tx.roomType.update({
        where: { id: roomTypeId },
        data: {
          ...(basePrice !== undefined ? { basePrice } : {}),
          ...(maxOccupancy !== undefined ? { maxOccupancy } : {}),
        },
      });

      if (basePrice !== undefined) {
        await tx.room.updateMany({
          where: { hotelId, roomTypeId },
          data: { price: basePrice },
        });

        const legacyRooms = await tx.room.findMany({
          where: { hotelId, roomTypeId: null, type: { not: null } },
          select: { id: true, type: true },
        });
        const matchingIds = legacyRooms
          .filter(
            (room) =>
              room.type &&
              HotelRoomsRepository.normalizeType(room.type).normalizedKey === type.normalizedKey,
          )
          .map((room) => room.id);

        if (matchingIds.length > 0) {
          await tx.room.updateMany({
            where: { id: { in: matchingIds } },
            data: { roomTypeId: type.id, price: basePrice },
          });
        }
      }

      return { ...(await this.roomTypeItem(updatedType)), channexSync: "NOT_PUSHED" as const };
    });
  }

  private async roomTypeItem(type: {
    id: string;
    hotelId: string;
    name: string;
    normalizedKey: string;
    basePrice: Prisma.Decimal | null;
    maxOccupancy?: number | null;
  }) {
    return {
      id: type.id,
      name: type.name,
      basePrice: type.basePrice === null ? null : Number(type.basePrice),
      maxOccupancy: type.maxOccupancy ?? null,
      readiness:
        type.basePrice !== null && Number(type.basePrice) > 0
          ? ("READY" as const)
          : ("MISSING_PRICE" as const),
      roomCount: await this.prisma.room.count({
        where: {
          hotelId: type.hotelId,
          OR: [
            { roomTypeId: type.id },
            { roomTypeId: null, type: { equals: type.name, mode: "insensitive" } },
          ],
        },
      }),
    };
  }

  async resolveRoomType(hotelId: string, input: { roomTypeId?: string; type?: string | null }) {
    const type = input.roomTypeId
      ? await this.prisma.roomType.findFirst({ where: { hotelId, id: input.roomTypeId } })
      : await this.prisma.roomType.findUnique({
          where: {
            hotelId_normalizedKey: {
              hotelId,
              normalizedKey: HotelRoomsRepository.normalizeType(input.type ?? "").normalizedKey,
            },
          },
        });
    if (!type) {
      if (input.roomTypeId) throw new NotFoundException("Loại phòng không thuộc khách sạn này");
      throw new BadRequestException(
        "Tên loại phòng chưa có trong khách sạn. Tạo loại phòng và giá gốc trước",
      );
    }
    return type;
  }

  async createRoomWithQr(input: {
    hotelId: string;
    code: string;
    roomNumber: string;
    floor?: string;
    zone?: string | null;
    type?: string;
    roomTypeId?: string;
    newRoomType?: { name: string; basePrice: number; maxOccupancy?: number | null };
    price?: number;
    maxActiveGuestDevices?: number;
    publicCode: string;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        let roomType;
        if (input.roomTypeId) {
          roomType = await tx.roomType.findFirst({
            where: { id: input.roomTypeId, hotelId: input.hotelId },
          });
          if (!roomType) throw new NotFoundException("Loại phòng không thuộc khách sạn này");
        } else {
          const normalized = HotelRoomsRepository.normalizeType(
            input.newRoomType?.name ?? input.type ?? "",
          );
          if (
            !normalized.name ||
            normalized.name.length > 80 ||
            normalized.normalizedKey.length > 80
          ) {
            throw new BadRequestException("Tên loại phòng không hợp lệ sau chuẩn hóa");
          }
          roomType = await tx.roomType.findUnique({
            where: {
              hotelId_normalizedKey: {
                hotelId: input.hotelId,
                normalizedKey: normalized.normalizedKey,
              },
            },
          });
          if (!roomType) {
            const basePrice = input.newRoomType?.basePrice ?? input.price;
            if (!basePrice || basePrice <= 0)
              throw new BadRequestException("Loại phòng mới cần giá gốc lớn hơn 0");
            // ponytail: legacy names without a catalog row need explicit reconciliation before assigning a base price.
            const legacyNames = await tx.room.findMany({
              where: { hotelId: input.hotelId, roomTypeId: null, type: { not: null } },
              select: { type: true },
            });
            if (
              legacyNames.some(
                (room) =>
                  HotelRoomsRepository.normalizeType(room.type!).normalizedKey ===
                  normalized.normalizedKey,
              )
            ) {
              throw new ConflictException(
                "Loại phòng cũ cần xác nhận giá gốc trong danh mục trước khi tạo thêm phòng",
              );
            }
            roomType = await tx.roomType.upsert({
              where: {
                hotelId_normalizedKey: {
                  hotelId: input.hotelId,
                  normalizedKey: normalized.normalizedKey,
                },
              },
              create: {
                hotelId: input.hotelId,
                ...normalized,
                basePrice,
                ...(input.newRoomType?.maxOccupancy !== undefined
                  ? { maxOccupancy: input.newRoomType.maxOccupancy }
                  : {}),
              },
              update: {
                ...(input.newRoomType?.maxOccupancy !== undefined
                  ? { maxOccupancy: input.newRoomType.maxOccupancy }
                  : {}),
              },
            });
          }
        }
        if (!roomType.basePrice || Number(roomType.basePrice) <= 0) {
          throw new BadRequestException(
            `Loại phòng ${roomType.name} chưa có giá gốc. Cập nhật giá trước khi tạo phòng`,
          );
        }
        const room = await tx.room.create({
          data: {
            hotelId: input.hotelId,
            code: input.code,
            roomNumber: input.roomNumber,
            floor: input.floor,
            zone: input.zone ?? null,
            type: roomType.name,
            roomTypeId: roomType.id,
            price: input.price ?? roomType.basePrice,
            maxActiveGuestDevices: input.maxActiveGuestDevices,
            status: RoomStatus.AVAILABLE,
          },
        });

        await tx.roomQRCode.create({
          data: {
            hotelId: input.hotelId,
            roomId: room.id,
            publicCode: input.publicCode,
            status: RoomQRCodeStatus.INACTIVE,
            version: 1,
          },
        });

        const createdRoom = await tx.room.findUniqueOrThrow({
          where: { id: room.id },
          include: roomListInclude,
        });
        return { ...createdRoom, activeGuestDeviceCount: 0 };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "Số phòng hoặc loại phòng đã tồn tại. Vui lòng tải lại danh sách",
        );
      }
      throw error;
    }
  }

  async listAssignedRoomIds(hotelId: string): Promise<string[]> {
    const assignments = await this.prisma.hotelRoomStaffAssignment.findMany({
      where: { hotelId },
      select: { roomId: true },
    });
    return assignments.map((a) => a.roomId);
  }

  async listRooms(
    where: Prisma.RoomWhereInput,
    skip: number,
    take: number,
    projectionOptions?: { businessDate?: string; timezone?: string },
  ) {
    const hotelId = where.hotelId as string;
    const scopedBaseWhere: Prisma.RoomWhereInput = where.id
      ? { hotelId, id: where.id }
      : { hotelId };
    const [total, rows, allFloors, allTypes, availableCount, statusRows] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        include: roomListInclude,
        orderBy: [{ roomNumber: "asc" }],
        skip,
        take,
      }),
      this.prisma.room.findMany({
        where: scopedBaseWhere,
        select: { floor: true },
        distinct: ["floor"],
      }),
      this.prisma.room.findMany({
        where: scopedBaseWhere,
        select: { type: true },
        distinct: ["type"],
      }),
      this.prisma.room.count({
        where: {
          ...scopedBaseWhere,
          status: RoomStatus.AVAILABLE,
          guestStays: {
            none: {
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
        },
      }),
      this.prisma.room.groupBy({
        by: ["status"],
        where: scopedBaseWhere,
        _count: { _all: true },
      }),
    ]);

    const uniqueFloors = allFloors.map((f) => f.floor).filter((f): f is string => Boolean(f));
    const uniqueTypes = allTypes.map((t) => t.type).filter((t): t is string => Boolean(t));
    const items = await this.withActiveGuestDeviceCounts(this.prisma, rows);

    if (projectionOptions?.businessDate) {
      let timezone = projectionOptions.timezone;
      if (!timezone && this.prisma.hotel?.findUnique) {
        const hotel = await this.prisma.hotel.findUnique({
          where: { id: hotelId },
          select: { timezone: true },
        });
        timezone = hotel?.timezone ?? undefined;
      }

      const { start: dateStart, end: dateEnd } = getBusinessDateRange(
        projectionOptions.businessDate,
        timezone,
      );
      const roomIds = items.map((r) => r.id);

      const now = new Date();
      const isViewingToday = dateStart <= now && now < dateEnd;
      const isViewingTodayOrPast = dateStart <= now;

      const overlappingStays =
        roomIds.length > 0
          ? await this.prisma.guestStay.findMany({
              where: {
                hotelId,
                roomId: { in: roomIds },
                status: {
                  in: [
                    GuestStayStatus.ACTIVE,
                    GuestStayStatus.CHECKED_IN,
                    GuestStayStatus.CHECKOUT_PENDING,
                  ],
                },
                plannedCheckInAt: { lt: dateEnd },
                OR: [
                  { plannedCheckOutAt: { gt: dateStart } },
                  ...(isViewingToday ? [{ checkedOutAt: null }] : []),
                ],
              },
              select: {
                id: true,
                hotelId: true,
                roomId: true,
                reservationCode: true,
                guestDisplayName: true,
                guestPhone: true,
                guestIdentityNumber: true,
                guestDateOfBirth: true,
                guestGender: true,
                guestNationality: true,
                guestResidencePlace: true,
                status: true,
                plannedCheckInAt: true,
                plannedCheckOutAt: true,
                nightlyRateSnapshot: true,
                checkedInAt: true,
                activatedAt: true,
                checkedOutAt: true,
                accessCodeExpiresAt: true,
                createdAt: true,
                updatedAt: true,
                occupants: {
                  orderBy: { createdAt: "asc" },
                },
              },
              orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
            })
          : [];

      const staysByRoomId = new Map<string, (typeof overlappingStays)[0]>();
      for (const stay of overlappingStays) {
        const stayStart = stay.checkedInAt ?? stay.plannedCheckInAt;
        const stayEnd =
          stay.checkedOutAt ??
          (isViewingToday && stay.plannedCheckOutAt < now ? now : stay.plannedCheckOutAt);
        if (stayStart < dateEnd && stayEnd > dateStart) {
          if (!staysByRoomId.has(stay.roomId)) {
            staysByRoomId.set(stay.roomId, stay);
          }
        }
      }

      const unassignedForReservation = roomIds.filter((id) => !staysByRoomId.has(id));
      const reservationsByRoomId = new Map<string, any>();
      const reservedStaysByRoomId = new Map<string, any>();

      if (unassignedForReservation.length > 0) {
        const [reservations, reservedStays] = await Promise.all([
          this.prisma.reservation.findMany({
            where: {
              hotelId,
              roomId: { in: unassignedForReservation },
              status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
              plannedCheckInAt: { lt: dateEnd },
              plannedCheckOutAt: { gt: dateStart },
            },
            select: {
              id: true,
              hotelId: true,
              roomId: true,
              roomTypeSnapshot: true,
              reservationCode: true,
              groupCode: true,
              guestDisplayName: true,
              guestPhone: true,
              status: true,
              plannedCheckInAt: true,
              plannedCheckOutAt: true,
              nightlyRateSnapshot: true,
              assignedAt: true,
              assignedByUserId: true,
              checkedInAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
          }),
          this.prisma.guestStay.findMany({
            where: {
              hotelId,
              roomId: { in: unassignedForReservation },
              status: GuestStayStatus.RESERVED,
              plannedCheckInAt: { lt: dateEnd },
              plannedCheckOutAt: { gt: dateStart },
            },
            select: {
              id: true,
              hotelId: true,
              roomId: true,
              reservationCode: true,
              guestDisplayName: true,
              guestPhone: true,
              guestIdentityNumber: true,
              guestDateOfBirth: true,
              guestGender: true,
              guestNationality: true,
              guestResidencePlace: true,
              status: true,
              plannedCheckInAt: true,
              plannedCheckOutAt: true,
              nightlyRateSnapshot: true,
              checkedInAt: true,
              activatedAt: true,
              checkedOutAt: true,
              accessCodeExpiresAt: true,
              createdAt: true,
              updatedAt: true,
              occupants: {
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
          }),
        ]);

        for (const r of reservations) {
          if (r.roomId && !reservationsByRoomId.has(r.roomId)) {
            reservationsByRoomId.set(r.roomId, r);
          }
        }
        for (const s of reservedStays) {
          if (!reservedStaysByRoomId.has(s.roomId)) {
            reservedStaysByRoomId.set(s.roomId, s);
          }
        }
      }

      const upcomingByRoomId = new Map<string, any>();
      if (roomIds.length > 0) {
        const upcomingList = await this.prisma.reservation.findMany({
          where: {
            hotelId,
            roomId: { in: roomIds },
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
            plannedCheckInAt: { gte: dateStart },
          },
          distinct: ["roomId"],
          select: {
            id: true,
            hotelId: true,
            roomId: true,
            roomTypeSnapshot: true,
            reservationCode: true,
            groupCode: true,
            guestDisplayName: true,
            guestPhone: true,
            status: true,
            plannedCheckInAt: true,
            plannedCheckOutAt: true,
            nightlyRateSnapshot: true,
            assignedAt: true,
            assignedByUserId: true,
            checkedInAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        });

        for (const u of upcomingList) {
          if (u.roomId && !upcomingByRoomId.has(u.roomId)) {
            upcomingByRoomId.set(u.roomId, u);
          }
        }
      }

      for (const item of items) {
        let projectedStatus: RoomStatus;
        if (staysByRoomId.has(item.id)) {
          projectedStatus = RoomStatus.OCCUPIED;
          item.projectedStay = staysByRoomId.get(item.id);
          item.guestStays = [staysByRoomId.get(item.id) as any];
        } else {
          // Current occupant is absent on non-overlapping future date
          item.guestStays = [];
          item.activeGuestDeviceCount = 0;
          delete item.projectedStay;

          if (reservationsByRoomId.has(item.id)) {
            projectedStatus = RoomStatus.RESERVED;
            item.projectedReservation = {
              ...reservationsByRoomId.get(item.id),
              sourceType: "RESERVATION",
            };
          } else if (reservedStaysByRoomId.has(item.id)) {
            projectedStatus = RoomStatus.RESERVED;
            item.projectedReservation = {
              ...reservedStaysByRoomId.get(item.id),
              sourceType: "STAY",
            };
          } else if (
            item.status === RoomStatus.MAINTENANCE ||
            item.status === RoomStatus.BLOCKED ||
            item.status === RoomStatus.OUT_OF_SERVICE
          ) {
            projectedStatus = item.status;
          } else {
            projectedStatus = RoomStatus.AVAILABLE;
          }
        }
        if (upcomingByRoomId.has(item.id)) {
          item.upcomingReservation = {
            ...upcomingByRoomId.get(item.id),
            sourceType: "RESERVATION",
          };
        }
        item.physicalStatus = item.status;
        item.projectedStatus = projectedStatus;
        item.businessDate = projectionOptions.businessDate;
        item.maxOccupancy = (item as any).roomType?.maxOccupancy ?? null;
        item.zone = (item as any).zone ?? null;

        let statusConflictCode: string | null = null;
        const activeStay = item.guestStays?.[0];
        const now = new Date();
        const isOverdue =
          isViewingTodayOrPast &&
          activeStay &&
          !activeStay.checkedOutAt &&
          activeStay.plannedCheckOutAt &&
          new Date(activeStay.plannedCheckOutAt).getTime() < now.getTime() &&
          (activeStay.status === GuestStayStatus.ACTIVE ||
            activeStay.status === GuestStayStatus.CHECKED_IN ||
            activeStay.status === GuestStayStatus.CHECKOUT_PENDING);

        if (isOverdue) {
          statusConflictCode = "OVERDUE_STAY_CONFLICT";
        } else if (
          (item.status === RoomStatus.MAINTENANCE ||
            item.status === RoomStatus.BLOCKED ||
            item.status === RoomStatus.OUT_OF_SERVICE) &&
          (activeStay || item.projectedReservation)
        ) {
          statusConflictCode = "NON_SELLABLE_OCCUPIED_CONFLICT";
        } else if (item.status === RoomStatus.AVAILABLE && activeStay) {
          statusConflictCode = "AVAILABLE_WITH_ACTIVE_STAY_CONFLICT";
        } else if (
          item.status === RoomStatus.OCCUPIED &&
          !activeStay &&
          !item.projectedStay &&
          isViewingTodayOrPast
        ) {
          statusConflictCode = "OCCUPIED_WITHOUT_ACTIVE_STAY_CONFLICT";
        }
        item.statusConflictCode = statusConflictCode;
      }
    } else {
      const roomIds = items.map((i) => i.id);
      const reservationsByRoomId = new Map<string, any>();
      const reservedStaysByRoomId = new Map<string, any>();
      const upcomingByRoomId = new Map<string, any>();

      if (roomIds.length > 0) {
        const now = new Date();
        const [reservations, reservedStays, upcomingReservations] = await Promise.all([
          this.prisma.reservation?.findMany
            ? this.prisma.reservation.findMany({
                where: {
                  hotelId,
                  roomId: { in: roomIds },
                  status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
                  plannedCheckInAt: { lte: now },
                  plannedCheckOutAt: { gt: now },
                },
                select: {
                  id: true,
                  hotelId: true,
                  roomId: true,
                  roomTypeSnapshot: true,
                  reservationCode: true,
                  groupCode: true,
                  guestDisplayName: true,
                  guestPhone: true,
                  status: true,
                  plannedCheckInAt: true,
                  plannedCheckOutAt: true,
                  nightlyRateSnapshot: true,
                  assignedAt: true,
                  assignedByUserId: true,
                  checkedInAt: true,
                  createdAt: true,
                  updatedAt: true,
                },
                orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
              })
            : Promise.resolve([]),
          this.prisma.guestStay?.findMany
            ? this.prisma.guestStay.findMany({
                where: {
                  hotelId,
                  roomId: { in: roomIds },
                  status: GuestStayStatus.RESERVED,
                  plannedCheckInAt: { lte: now },
                  plannedCheckOutAt: { gt: now },
                },
                select: {
                  id: true,
                  hotelId: true,
                  roomId: true,
                  reservationCode: true,
                  guestDisplayName: true,
                  guestPhone: true,
                  guestIdentityNumber: true,
                  guestDateOfBirth: true,
                  guestGender: true,
                  guestNationality: true,
                  guestResidencePlace: true,
                  status: true,
                  plannedCheckInAt: true,
                  plannedCheckOutAt: true,
                  nightlyRateSnapshot: true,
                  checkedInAt: true,
                  activatedAt: true,
                  checkedOutAt: true,
                  accessCodeExpiresAt: true,
                  createdAt: true,
                  updatedAt: true,
                  occupants: {
                    orderBy: { createdAt: "asc" },
                  },
                },
                orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
              })
            : Promise.resolve([]),
          this.prisma.reservation?.findMany
            ? this.prisma.reservation.findMany({
                where: {
                  hotelId,
                  roomId: { in: roomIds },
                  status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
                  plannedCheckInAt: { gt: now },
                },
                distinct: ["roomId"],
                select: {
                  id: true,
                  hotelId: true,
                  roomId: true,
                  roomTypeSnapshot: true,
                  reservationCode: true,
                  groupCode: true,
                  guestDisplayName: true,
                  guestPhone: true,
                  status: true,
                  plannedCheckInAt: true,
                  plannedCheckOutAt: true,
                  nightlyRateSnapshot: true,
                  assignedAt: true,
                  assignedByUserId: true,
                  checkedInAt: true,
                  createdAt: true,
                  updatedAt: true,
                },
                orderBy: [{ plannedCheckInAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
              })
            : Promise.resolve([]),
        ]);

        for (const r of reservations) {
          if (r.roomId && !reservationsByRoomId.has(r.roomId)) {
            reservationsByRoomId.set(r.roomId, r);
          }
        }
        for (const s of reservedStays) {
          if (!reservedStaysByRoomId.has(s.roomId)) {
            reservedStaysByRoomId.set(s.roomId, s);
          }
        }
        for (const u of upcomingReservations) {
          if (u.roomId && !upcomingByRoomId.has(u.roomId)) {
            upcomingByRoomId.set(u.roomId, u);
          }
        }
      }

      for (const item of items) {
        item.physicalStatus = item.status;
        item.projectedStatus = item.status;
        item.businessDate = null;
        item.maxOccupancy = (item as any).roomType?.maxOccupancy ?? null;
        item.zone = (item as any).zone ?? null;

        if (reservationsByRoomId.has(item.id)) {
          item.projectedReservation = {
            ...reservationsByRoomId.get(item.id),
            sourceType: "RESERVATION",
          };
          if (item.status === RoomStatus.AVAILABLE) {
            item.projectedStatus = RoomStatus.RESERVED;
          }
        } else if (reservedStaysByRoomId.has(item.id)) {
          item.projectedReservation = {
            ...reservedStaysByRoomId.get(item.id),
            sourceType: "STAY",
          };
          if (item.status === RoomStatus.AVAILABLE) {
            item.projectedStatus = RoomStatus.RESERVED;
          }
        }

        if (upcomingByRoomId.has(item.id)) {
          item.upcomingReservation = {
            ...upcomingByRoomId.get(item.id),
            sourceType: "RESERVATION",
          };
        }

        let statusConflictCode: string | null = null;
        const activeStay = item.guestStays?.[0];
        const now = new Date();
        const isOverdue =
          activeStay &&
          !activeStay.checkedOutAt &&
          activeStay.plannedCheckOutAt &&
          new Date(activeStay.plannedCheckOutAt).getTime() < now.getTime() &&
          (activeStay.status === GuestStayStatus.ACTIVE ||
            activeStay.status === GuestStayStatus.CHECKED_IN ||
            activeStay.status === GuestStayStatus.CHECKOUT_PENDING);

        if (isOverdue) {
          statusConflictCode = "OVERDUE_STAY_CONFLICT";
        } else if (
          (item.status === RoomStatus.MAINTENANCE ||
            item.status === RoomStatus.BLOCKED ||
            item.status === RoomStatus.OUT_OF_SERVICE) &&
          (activeStay || item.projectedReservation)
        ) {
          statusConflictCode = "NON_SELLABLE_OCCUPIED_CONFLICT";
        } else if (item.status === RoomStatus.AVAILABLE && activeStay) {
          statusConflictCode = "AVAILABLE_WITH_ACTIVE_STAY_CONFLICT";
        } else if (item.status === RoomStatus.OCCUPIED && !activeStay && !item.projectedStay) {
          statusConflictCode = "OCCUPIED_WITHOUT_ACTIVE_STAY_CONFLICT";
        }
        item.statusConflictCode = statusConflictCode;
      }
    }

    const byStatus = {
      available: availableCount,
      occupied: 0,
      reserved: 0,
      processing: 0,
      maintenance: 0,
      blocked: 0,
    };
    for (const row of statusRows) {
      if (row.status === RoomStatus.OCCUPIED) {
        byStatus.occupied += row._count._all;
      } else if (row.status === RoomStatus.RESERVED) {
        byStatus.reserved += row._count._all;
      } else if (row.status === RoomStatus.PROCESSING) {
        byStatus.processing += row._count._all;
      } else if (
        row.status === RoomStatus.MAINTENANCE ||
        row.status === RoomStatus.OUT_OF_SERVICE
      ) {
        byStatus.maintenance += row._count._all;
      } else if (row.status === RoomStatus.BLOCKED) {
        byStatus.blocked += row._count._all;
      }
    }

    return {
      total,
      items,
      floors: [...uniqueFloors].sort((a, b) => a.localeCompare(b)),
      types: [...uniqueTypes].sort((a, b) => a.localeCompare(b)),
      totalAvailable: availableCount,
      byStatus,
    };
  }

  async confirmRoomReady(hotelId: string, roomId: string, expectedUpdatedAt?: Date) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        select: { id: true, status: true, updatedAt: true },
      });

      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng");
      }

      if (room.status === RoomStatus.AVAILABLE) {
        const updatedRoom = await tx.room.findUniqueOrThrow({
          where: { id: roomId },
          include: roomListInclude,
        });
        return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
      }

      if (room.status !== RoomStatus.PROCESSING) {
        throw new ConflictException(
          "Chỉ có thể xác nhận sẵn sàng cho phòng đang ở trạng thái CHỜ DỌN (PROCESSING)",
        );
      }

      const updated = await tx.room.updateMany({
        where: {
          id: roomId,
          hotelId,
          status: RoomStatus.PROCESSING,
        },
        data: {
          status: RoomStatus.AVAILABLE,
        },
      });

      if (updated.count !== 1) {
        const recheck = await tx.room.findFirst({
          where: { id: roomId, hotelId },
          select: { status: true },
        });
        if (recheck?.status === RoomStatus.AVAILABLE) {
          const updatedRoom = await tx.room.findUniqueOrThrow({
            where: { id: roomId },
            include: roomListInclude,
          });
          return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
        }
        throw new ConflictException(
          "Trạng thái phòng đã thay đổi hoặc đang được xử lý bởi yêu cầu khác",
        );
      }

      const updatedRoom = await tx.room.findUniqueOrThrow({
        where: { id: roomId },
        include: roomListInclude,
      });

      return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
    });
  }

  async updateRoomInHotel(
    hotelId: string,
    roomId: string,
    data: Prisma.RoomUpdateInput,
    expected?: { status: RoomStatus; updatedAt: Date },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (expected) {
        const updated = await tx.room.updateMany({
          where: {
            id: roomId,
            hotelId,
            status: expected.status,
            updatedAt: expected.updatedAt,
          },
          data,
        });
        if (updated.count !== 1) {
          const current = tx.room?.findFirst
            ? await tx.room.findFirst({
                where: { id: roomId, hotelId },
                include: roomListInclude,
              })
            : null;
          if (current && data.status && current.status === data.status) {
            return (await this.withActiveGuestDeviceCounts(tx, [current]))[0] ?? null;
          }
          throw new ConflictException(
            "Trạng thái phòng đã thay đổi. Vui lòng tải lại trước khi thao tác.",
          );
        }
        const updatedRoom = await tx.room.findUniqueOrThrow({
          where: { id: roomId },
          include: roomListInclude,
        });
        return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
      }

      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        select: { id: true },
      });

      if (!room) {
        return null;
      }

      const updatedRoom = await tx.room.update({
        where: { id: room.id },
        data,
        include: roomListInclude,
      });
      return (await this.withActiveGuestDeviceCounts(tx, [updatedRoom]))[0] ?? null;
    });
  }

  private async withActiveGuestDeviceCounts(
    tx: Pick<Prisma.TransactionClient, "guestSession">,
    rooms: Prisma.RoomGetPayload<{ include: typeof roomListInclude }>[],
  ): Promise<RoomListRow[]> {
    const activeStayIds = rooms
      .map((room) => room.guestStays[0]?.id)
      .filter((stayId): stayId is string => Boolean(stayId));

    let countByStayId: ReadonlyMap<string, number> = new Map<string, number>();
    if (activeStayIds.length > 0 && tx.guestSession?.findMany) {
      const sessions = await tx.guestSession.findMany({
        where: {
          stayId: { in: activeStayIds },
          status: { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
          closedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          stayId: true,
          deviceFingerprintHash: true,
          ipHash: true,
          userAgent: true,
        },
      });
      countByStayId = countDistinctGuestDevicesByStay(sessions);
    }

    return rooms.map((room) => {
      const activeStay = room.guestStays[0];
      const now = new Date();
      const isOverdue =
        activeStay &&
        !activeStay.checkedOutAt &&
        activeStay.plannedCheckOutAt &&
        new Date(activeStay.plannedCheckOutAt).getTime() < now.getTime() &&
        (activeStay.status === GuestStayStatus.ACTIVE ||
          activeStay.status === GuestStayStatus.CHECKED_IN ||
          activeStay.status === GuestStayStatus.CHECKOUT_PENDING);

      let statusConflictCode: string | null = null;
      if (isOverdue) {
        statusConflictCode = "OVERDUE_STAY_CONFLICT";
      } else if (
        (room.status === RoomStatus.MAINTENANCE ||
          room.status === RoomStatus.BLOCKED ||
          room.status === RoomStatus.OUT_OF_SERVICE) &&
        activeStay
      ) {
        statusConflictCode = "NON_SELLABLE_OCCUPIED_CONFLICT";
      } else if (room.status === RoomStatus.AVAILABLE && activeStay) {
        statusConflictCode = "AVAILABLE_WITH_ACTIVE_STAY_CONFLICT";
      } else if (room.status === RoomStatus.OCCUPIED && !activeStay) {
        statusConflictCode = "OCCUPIED_WITHOUT_ACTIVE_STAY_CONFLICT";
      }

      return {
        ...room,
        physicalStatus: (room as any).physicalStatus ?? room.status,
        projectedStatus: (room as any).projectedStatus ?? room.status,
        statusConflictCode: (room as any).statusConflictCode ?? statusConflictCode,
        zone: (room as any).zone ?? null,
        maxOccupancy: (room as any).roomType?.maxOccupancy ?? null,
        activeGuestDeviceCount: countByStayId.get(room.guestStays[0]?.id ?? "") ?? 0,
      };
    });
  }

  async findRoomInHotel(hotelId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, hotelId },
      include: roomListInclude,
    });
    if (!room) return null;
    return (await this.withActiveGuestDeviceCounts(this.prisma, [room]))[0] ?? null;
  }

  async createStay(input: {
    hotelId: string;
    roomId: string;
    guestDisplayName: string;
    guestPhone?: string;
    guestIdentityNumber?: string;
    guestDateOfBirth?: string;
    guestGender?: string;
    guestNationality?: string;
    guestResidencePlace?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    createdByUserId: string;
    tenantId: string;
    occupants?: Array<{
      fullName: string;
      phone?: string;
      identityNumber?: string;
      dateOfBirth?: string;
      gender?: string;
      nationality?: string;
      residencePlace?: string;
      isPrimary?: boolean;
    }>;
    reservationCode?: string;
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.plannedCheckOutAt <= input.plannedCheckInAt) {
        throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
      }

      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: {
          id: true,
          status: true,
          price: true,
          roomTypeId: true,
          roomType: { select: { id: true, maxOccupancy: true } },
        },
      });

      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng");
      }

      const primaryName = input.guestDisplayName.trim();
      const rawExtraOccupants = (input.occupants ?? []).filter(
        (occ) =>
          occ.fullName.trim() &&
          !(
            occ.fullName.trim() === primaryName &&
            (!occ.identityNumber?.trim() ||
              occ.identityNumber?.trim() === (input.guestIdentityNumber?.trim() ?? ""))
          ),
      );
      const totalOccupants = 1 + rawExtraOccupants.length;
      const roomCapacity = (room as any)?.roomType?.maxOccupancy;
      if (roomCapacity != null && totalOccupants > roomCapacity) {
        throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
      }

      const reservationCode =
        input.reservationCode?.trim() || (await input.generateReservationCode(tx));
      const appliedNightlyRate =
        input.nightlyRateSnapshot !== undefined ? input.nightlyRateSnapshot : room.price;
      const stay = await tx.guestStay.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          reservationCode,
          guestDisplayName: input.guestDisplayName,
          guestPhone: input.guestPhone,
          guestIdentityNumber: input.guestIdentityNumber,
          guestDateOfBirth: input.guestDateOfBirth,
          guestGender: input.guestGender,
          guestNationality: input.guestNationality,
          guestResidencePlace: input.guestResidencePlace,
          plannedCheckInAt: input.plannedCheckInAt,
          plannedCheckOutAt: input.plannedCheckOutAt,
          baseNightlyRateSnapshot: room.price,
          nightlyRateSnapshot: appliedNightlyRate,
          createdByUserId: input.createdByUserId,
          status: GuestStayStatus.RESERVED,
          occupants: {
            create: [
              {
                hotelId: input.hotelId,
                fullName: input.guestDisplayName.trim(),
                phone: input.guestPhone,
                identityNumber: input.guestIdentityNumber,
                dateOfBirth: input.guestDateOfBirth,
                gender: input.guestGender,
                nationality: input.guestNationality,
                residencePlace: input.guestResidencePlace,
                citizenshipKind: inferCitizenshipKind({
                  identityNumber: input.guestIdentityNumber,
                  nationality: input.guestNationality,
                }),
                isPrimary: true,
              },
              ...(input.occupants ?? [])
                .filter(
                  (occ) =>
                    occ.fullName.trim() &&
                    !(
                      occ.fullName.trim() === input.guestDisplayName.trim() &&
                      (!occ.identityNumber?.trim() ||
                        occ.identityNumber?.trim() === input.guestIdentityNumber?.trim())
                    ),
                )
                .map((occ) => ({
                  hotelId: input.hotelId,
                  fullName: occ.fullName.trim(),
                  phone: occ.phone?.trim(),
                  identityNumber: occ.identityNumber?.trim(),
                  dateOfBirth: occ.dateOfBirth?.trim(),
                  gender: occ.gender?.trim(),
                  nationality: occ.nationality?.trim(),
                  residencePlace: occ.residencePlace?.trim(),
                  citizenshipKind: inferCitizenshipKind(occ),
                  isPrimary: false,
                })),
            ],
          },
        },
        include: {
          occupants: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.createdByUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      const now = new Date();
      const isFuture = input.plannedCheckInAt > now;
      if (!isFuture && tx.room?.updateMany) {
        const reservedRoom = await tx.room.updateMany({
          where: { id: input.roomId, hotelId: input.hotelId, status: RoomStatus.AVAILABLE },
          data: { status: RoomStatus.RESERVED },
        });
        if (reservedRoom.count !== 1) {
          throw new ConflictException("Phòng đã thay đổi trạng thái trong lúc đặt giữ chỗ");
        }
      }

      await this.createDomainEvent(tx, {
        eventType: "ROOM_RESERVED",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId },
      });

      return stay;
    });
  }

  async findStayInHotel(hotelId: string, stayId: string) {
    return this.prisma.guestStay.findFirst({
      where: { id: stayId, hotelId },
      include: { occupants: { orderBy: { createdAt: "asc" } } },
    });
  }

  async findNextReservationInRoom(
    hotelId: string,
    roomId: string,
    afterDate: Date,
    beforeDate: Date,
  ) {
    return this.prisma.reservation.findFirst({
      where: {
        hotelId,
        roomId,
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
        plannedCheckInAt: {
          gte: afterDate,
          lt: beforeDate,
        },
      },
      select: {
        id: true,
        guestDisplayName: true,
        plannedCheckInAt: true,
      },
    });
  }

  async findBlockingBillingFolio(hotelId: string, stayId: string) {
    return this.prisma.folio.findFirst({
      where: {
        hotelId,
        stayId,
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      },
      select: { id: true, status: true, folioNumber: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async checkInStay(input: {
    hotelId: string;
    stayId: string;
    roomId: string;
    accessCodeHash: string;
    accessCodeExpiresAt: Date;
    actorUserId: string;
    tenantId: string;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const stayForCheckIn = await tx.guestStay.findFirst({
        where: { id: input.stayId, hotelId: input.hotelId },
      });

      if (!stayForCheckIn) {
        throw new BadRequestException("Không tìm thấy lượt lưu trú");
      }

      if (
        stayForCheckIn.status !== GuestStayStatus.RESERVED &&
        stayForCheckIn.status !== GuestStayStatus.ACTIVE
      ) {
        throw new BadRequestException("Không thể check-in lượt lưu trú từ trạng thái hiện tại");
      }

      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: { id: true, status: true, price: true },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      if (room.status !== RoomStatus.RESERVED && room.status !== RoomStatus.AVAILABLE) {
        throw new ConflictException("Phòng chưa sẵn sàng để check-in");
      }

      const qr = await this.findUsableQr(tx, {
        hotelId: input.hotelId,
        roomId: input.roomId,
      });

      const guardedRoomUpdate = await tx.room.updateMany({
        where: {
          id: input.roomId,
          hotelId: input.hotelId,
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.RESERVED] },
        },
        data: { status: RoomStatus.OCCUPIED },
      });

      if (guardedRoomUpdate.count !== 1) {
        throw new ConflictException("Phòng đang được check-in bởi yêu cầu khác");
      }

      const unclassifiedOccupants = await tx.guestStayOccupant.findMany({
        where: {
          hotelId: input.hotelId,
          stayId: input.stayId,
          citizenshipKind: null,
        },
        select: { id: true, identityNumber: true, nationality: true },
      });
      for (const occupant of unclassifiedOccupants) {
        const citizenshipKind = inferCitizenshipKind(occupant);
        if (citizenshipKind) {
          await tx.guestStayOccupant.update({
            where: { id: occupant.id },
            data: { citizenshipKind },
          });
        }
      }

      const stay = await tx.guestStay.update({
        where: { id: input.stayId },
        data: {
          status: GuestStayStatus.ACTIVE,
          checkedInAt: now,
          activatedAt: now,
          baseNightlyRateSnapshot:
            stayForCheckIn.baseNightlyRateSnapshot ??
            room.price ??
            stayForCheckIn.nightlyRateSnapshot,
          nightlyRateSnapshot: stayForCheckIn.nightlyRateSnapshot ?? room.price,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
        },
        include: {
          occupants: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.actorUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          deactivatedAt: now,
        },
      });

      const activeQr = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_IN",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activeQr.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomQrCodeId: activeQr.id, roomId: input.roomId, stayId: stay.id },
      });

      if (tx.auditLog?.create) {
        let tenantId: string | undefined = input.tenantId;
        if (!tenantId && tx.hotel?.findUnique) {
          const hotel = await tx.hotel.findUnique({
            where: { id: input.hotelId },
            select: { tenantId: true },
          });
          tenantId = hotel?.tenantId ?? undefined;
        }
        if (tenantId) {
          await tx.auditLog.create({
            data: {
              actorId: input.actorUserId,
              tenantId,
              action: "GUEST_CHECKED_IN",
              entityType: "GuestStay",
              entityId: stay.id,
              metadata: {
                stayId: stay.id,
                roomId: input.roomId,
                checkedInAt: now.toISOString(),
                actorUserId: input.actorUserId,
              },
            },
          });
        }
      }

      return { stay, roomQrCode: activeQr };
    });
  }

  async createAndCheckInStay(input: {
    hotelId: string;
    roomId: string;
    guestDisplayName: string;
    guestPhone?: string;
    guestIdentityNumber?: string;
    guestDateOfBirth?: string;
    guestGender?: string;
    guestNationality?: string;
    guestResidencePlace?: string;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
    createdByUserId: string;
    accessCodeHash: string;
    accessCodeExpiresAt: Date;
    actorUserId: string;
    tenantId?: string;
    occupants?: Array<{
      fullName: string;
      phone?: string;
      identityNumber?: string;
      dateOfBirth?: string;
      gender?: string;
      nationality?: string;
      residencePlace?: string;
      isPrimary?: boolean;
    }>;
    reservationCode?: string;
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (!input.guestDisplayName.trim()) {
        throw new BadRequestException("Tên khách là bắt buộc để check-in");
      }

      if (input.plannedCheckOutAt <= input.plannedCheckInAt) {
        throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
      }

      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: {
          id: true,
          status: true,
          price: true,
          roomTypeId: true,
          roomType: { select: { id: true, maxOccupancy: true } },
        },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      if (room.status !== RoomStatus.AVAILABLE) {
        throw new ConflictException("Phòng không khả dụng để check-in");
      }

      const primaryName = input.guestDisplayName.trim();
      const rawExtraOccupants = (input.occupants ?? []).filter(
        (occ) =>
          occ.fullName.trim() &&
          !(
            occ.fullName.trim() === primaryName &&
            (!occ.identityNumber?.trim() ||
              occ.identityNumber?.trim() === (input.guestIdentityNumber?.trim() ?? ""))
          ),
      );
      const totalOccupants = 1 + rawExtraOccupants.length;
      const roomCapacity = (room as any)?.roomType?.maxOccupancy;
      if (roomCapacity != null && totalOccupants > roomCapacity) {
        throw new ConflictException("ROOM_CAPACITY_OVERFLOW");
      }

      if (tx.reservation?.findFirst) {
        const overlappingReservation = await tx.reservation.findFirst({
          where: {
            hotelId: input.hotelId,
            roomId: input.roomId,
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
            plannedCheckInAt: { lt: input.plannedCheckOutAt },
            plannedCheckOutAt: { gt: input.plannedCheckInAt },
          },
          select: { id: true },
        });
        if (overlappingReservation) {
          throw new ConflictException("Phòng đã có đặt trước trong khoảng thời gian này");
        }
      }

      const qr = await this.findUsableQr(tx, {
        hotelId: input.hotelId,
        roomId: input.roomId,
      });

      const reservationCode =
        input.reservationCode?.trim() || (await input.generateReservationCode(tx));
      const appliedNightlyRate =
        input.nightlyRateSnapshot !== undefined ? input.nightlyRateSnapshot : room.price;
      const stay = await tx.guestStay.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          reservationCode,
          guestDisplayName: input.guestDisplayName.trim(),
          guestPhone: input.guestPhone,
          guestIdentityNumber: input.guestIdentityNumber,
          guestDateOfBirth: input.guestDateOfBirth,
          guestGender: input.guestGender,
          guestNationality: input.guestNationality,
          guestResidencePlace: input.guestResidencePlace,
          plannedCheckInAt: input.plannedCheckInAt,
          plannedCheckOutAt: input.plannedCheckOutAt,
          baseNightlyRateSnapshot: room.price,
          nightlyRateSnapshot: appliedNightlyRate,
          createdByUserId: input.createdByUserId,
          status: GuestStayStatus.ACTIVE,
          checkedInAt: now,
          activatedAt: now,
          accessCodeHash: input.accessCodeHash,
          accessCodeExpiresAt: input.accessCodeExpiresAt,
          occupants: {
            create: [
              {
                hotelId: input.hotelId,
                fullName: input.guestDisplayName.trim(),
                phone: input.guestPhone,
                identityNumber: input.guestIdentityNumber,
                dateOfBirth: input.guestDateOfBirth,
                gender: input.guestGender,
                nationality: input.guestNationality,
                residencePlace: input.guestResidencePlace,
                citizenshipKind: inferCitizenshipKind({
                  identityNumber: input.guestIdentityNumber,
                  nationality: input.guestNationality,
                }),
                isPrimary: true,
              },
              ...(input.occupants ?? [])
                .filter(
                  (occ) =>
                    occ.fullName.trim() &&
                    !(
                      occ.fullName.trim() === input.guestDisplayName.trim() &&
                      (!occ.identityNumber?.trim() ||
                        occ.identityNumber?.trim() === input.guestIdentityNumber?.trim())
                    ),
                )
                .map((occ) => ({
                  hotelId: input.hotelId,
                  fullName: occ.fullName.trim(),
                  phone: occ.phone?.trim(),
                  identityNumber: occ.identityNumber?.trim(),
                  dateOfBirth: occ.dateOfBirth?.trim(),
                  gender: occ.gender?.trim(),
                  nationality: occ.nationality?.trim(),
                  residencePlace: occ.residencePlace?.trim(),
                  citizenshipKind: inferCitizenshipKind(occ),
                  isPrimary: false,
                })),
            ],
          },
        },
        include: {
          occupants: true,
        },
      });

      await this.createOpenFolioForStay(tx, {
        hotelId: input.hotelId,
        stayId: stay.id,
        roomId: input.roomId,
        createdByUserId: input.createdByUserId,
        generateFolioNumber: input.generateFolioNumber,
      });

      const guardedRoomUpdate = await tx.room.updateMany({
        where: {
          id: input.roomId,
          hotelId: input.hotelId,
          status: RoomStatus.AVAILABLE,
        },
        data: { status: RoomStatus.OCCUPIED },
      });

      if (guardedRoomUpdate.count !== 1) {
        throw new ConflictException("Phòng đang được check-in bởi yêu cầu khác");
      }

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
      });

      const activeQr = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_IN",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activeQr.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomQrCodeId: activeQr.id, roomId: input.roomId, stayId: stay.id },
      });

      if (tx.auditLog?.create) {
        let tenantId: string | undefined = input.tenantId;
        if (!tenantId && tx.hotel?.findUnique) {
          const hotel = await tx.hotel.findUnique({
            where: { id: input.hotelId },
            select: { tenantId: true },
          });
          tenantId = hotel?.tenantId ?? undefined;
        }
        if (tenantId) {
          await tx.auditLog.create({
            data: {
              actorId: input.actorUserId,
              tenantId,
              action: "GUEST_CHECKED_IN",
              entityType: "GuestStay",
              entityId: stay.id,
              metadata: {
                stayId: stay.id,
                roomId: input.roomId,
                checkedInAt: now.toISOString(),
                actorUserId: input.actorUserId,
              },
            },
          });
        }
      }

      return { stay, roomQrCode: activeQr };
    });
  }

  async updateStay(
    hotelId: string,
    stayId: string,
    input: {
      plannedCheckOutAt?: Date;
      guestDisplayName?: string;
      guestPhone?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existingStay = await tx.guestStay.findFirst({
        where: { id: stayId, hotelId },
      });
      if (!existingStay) return null;

      const primaryOccupantUpdates: { fullName?: string; phone?: string | null } = {};
      if (input.guestDisplayName !== undefined) {
        primaryOccupantUpdates.fullName = input.guestDisplayName.trim();
      }
      if (input.guestPhone !== undefined) {
        primaryOccupantUpdates.phone = input.guestPhone;
      }

      if (Object.keys(primaryOccupantUpdates).length > 0) {
        await tx.guestStayOccupant.updateMany({
          where: {
            hotelId,
            stayId,
            isPrimary: true,
          },
          data: primaryOccupantUpdates,
        });
      }

      return tx.guestStay.update({
        where: { id: stayId },
        data: {
          ...(input.plannedCheckOutAt ? { plannedCheckOutAt: input.plannedCheckOutAt } : {}),
          ...(input.guestDisplayName ? { guestDisplayName: input.guestDisplayName } : {}),
          ...(input.guestPhone !== undefined ? { guestPhone: input.guestPhone } : {}),
        },
        include: {
          occupants: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
    });
  }

  async checkOutStay(input: {
    hotelId: string;
    stayId: string;
    roomId: string;
    actorUserId: string;
    tenantId: string;
    nextRoomStatus: RoomStatus;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const checkedOut = await tx.guestStay.updateMany({
        where: {
          id: input.stayId,
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: GuestStayStatus.ACTIVE,
        },
        data: {
          status: GuestStayStatus.CHECKED_OUT,
          checkedOutAt: now,
          closedByUserId: input.actorUserId,
          accessCodeHash: null,
          accessCodeExpiresAt: null,
        },
      });
      if (checkedOut.count !== 1) {
        throw new ConflictException("Lượt lưu trú đã thay đổi trong lúc check-out");
      }

      const roomTransition = await tx.room.updateMany({
        where: {
          id: input.roomId,
          hotelId: input.hotelId,
          status: RoomStatus.OCCUPIED,
        },
        data: { status: input.nextRoomStatus },
      });
      if (roomTransition.count !== 1) {
        throw new ConflictException("Trạng thái phòng đã thay đổi trong lúc check-out");
      }

      await tx.guestSession.updateMany({
        where: {
          stayId: input.stayId,
          status: {
            in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE, GuestSessionStatus.CREATED],
          },
        },
        data: {
          status: GuestSessionStatus.CLOSED,
          closedAt: now,
        },
      });

      if (typeof tx.folio?.updateMany === "function") {
        await tx.folio.updateMany({
          where: {
            stayId: input.stayId,
            hotelId: input.hotelId,
            status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
          },
          data: {
            status: FolioStatus.CLOSED,
            closedAt: now,
          },
        });
      }

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_OUT",
        aggregateType: "GuestStay",
        aggregateId: input.stayId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: input.stayId, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_SESSION_REVOKED",
        aggregateType: "GuestStay",
        aggregateId: input.stayId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: input.stayId, reason: "CHECKOUT" },
      });

      return tx.guestStay.findUniqueOrThrow({ where: { id: input.stayId } });
    });
  }

  async rotateQr(input: {
    hotelId: string;
    roomId: string;
    publicCode: string;
    tenantId: string;
    reason?: string;
  }) {
    const hotelId = input.hotelId?.trim();
    const roomId = input.roomId?.trim();
    const publicCode = input.publicCode?.trim();
    const tenantId = input.tenantId?.trim();

    if (!hotelId) {
      throw new BadRequestException("Thiếu khách sạn khi xoay mã QR");
    }

    if (!roomId) {
      throw new BadRequestException("Thiếu phòng khi xoay mã QR");
    }

    if (!publicCode) {
      throw new BadRequestException("Thiếu token QR khi xoay mã QR");
    }

    if (!tenantId) {
      throw new BadRequestException("Thiếu tenant khi xoay mã QR");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.roomQRCode.findFirst({
        where: { hotelId, roomId },
        orderBy: { version: "desc" },
      });

      await tx.roomQRCode.updateMany({
        where: {
          hotelId,
          roomId,
          status: { not: RoomQRCodeStatus.REVOKED },
        },
        data: {
          status: RoomQRCodeStatus.REVOKED,
          deactivatedAt: now,
          revokedAt: now,
        },
      });

      const rotated = await tx.roomQRCode.create({
        data: {
          hotelId,
          roomId,
          publicCode,
          status:
            latest?.status === RoomQRCodeStatus.ACTIVE
              ? RoomQRCodeStatus.ACTIVE
              : RoomQRCodeStatus.INACTIVE,
          version: (latest?.version ?? 0) + 1,
          activatedAt: latest?.status === RoomQRCodeStatus.ACTIVE ? now : null,
          deactivatedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ROTATED",
        aggregateType: "RoomQRCode",
        aggregateId: rotated.id,
        hotelId,
        tenantId,
        payload: { roomId, reason: input.reason ?? "ROTATED", previousQrCodeId: latest?.id },
      });

      return rotated;
    });
  }

  async activateQr(input: {
    hotelId: string;
    roomId: string;
    tenantId: string;
    publicCode: string;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const activeStay = await tx.guestStay.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: GuestStayStatus.ACTIVE,
        },
      });

      const latestQr = await tx.roomQRCode.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: { not: RoomQRCodeStatus.REVOKED },
        },
        orderBy: { version: "desc" },
      });

      const qr =
        latestQr ??
        (await tx.roomQRCode.create({
          data: {
            hotelId: input.hotelId,
            roomId: input.roomId,
            publicCode: input.publicCode,
            status: RoomQRCodeStatus.INACTIVE,
            version: 1,
          },
        }));

      await tx.roomQRCode.updateMany({
        where: {
          roomId: input.roomId,
          id: { not: qr.id },
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
      });

      const activated = await tx.roomQRCode.update({
        where: { id: qr.id },
        data: {
          status: RoomQRCodeStatus.ACTIVE,
          activatedAt: now,
          deactivatedAt: null,
          expiresAt: null,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_ACTIVATED",
        aggregateType: "RoomQRCode",
        aggregateId: activated.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomId: input.roomId, stayId: activeStay?.id ?? null },
      });

      return activated;
    });
  }

  async deactivateQr(input: {
    hotelId: string;
    roomId: string;
    tenantId: string;
    reason?: string;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.roomQRCode.updateMany({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          deactivatedAt: now,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "ROOM_QR_DEACTIVATED",
        aggregateType: "Room",
        aggregateId: input.roomId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { roomId: input.roomId, reason: input.reason ?? "MANUAL" },
      });

      return result;
    });
  }

  private async createOpenFolioForStay(
    tx: Prisma.TransactionClient,
    input: {
      hotelId: string;
      stayId: string;
      roomId: string;
      createdByUserId: string;
      generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
    },
  ) {
    const existing = await tx.folio.findFirst({
      where: {
        hotelId: input.hotelId,
        stayId: input.stayId,
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return tx.folio.create({
      data: {
        hotelId: input.hotelId,
        stayId: input.stayId,
        roomId: input.roomId,
        folioNumber: await input.generateFolioNumber(tx),
        status: FolioStatus.OPEN,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
  }

  private async createDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      hotelId?: string;
      tenantId?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return tx.domainEvent.create({
      data: {
        ...input,
        status: DomainEventStatus.PENDING,
      },
    });
  }

  private async findUsableQr(
    tx: Prisma.TransactionClient,
    input: {
      hotelId: string;
      roomId: string;
    },
  ) {
    const existingQr = await tx.roomQRCode.findFirst({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        status: { not: RoomQRCodeStatus.REVOKED },
      },
      orderBy: { version: "desc" },
    });

    if (!existingQr) {
      throw new BadRequestException("Phòng chưa có QR. Vui lòng tạo QR trước khi check-in.");
    }

    return existingQr;
  }

  async findActiveStayOccupantsByHotel(
    hotelId: string,
    options?: { cursor?: string; take?: number },
  ) {
    const take = options?.take ? Math.min(Math.max(options.take, 1), 500) : undefined;
    return this.prisma.guestStayOccupant.findMany({
      where: {
        hotelId,
        stay: {
          hotelId,
          status: {
            in: [
              GuestStayStatus.ACTIVE,
              GuestStayStatus.CHECKED_IN,
              GuestStayStatus.CHECKOUT_PENDING,
            ],
          },
        },
      },
      take,
      skip: options?.cursor ? 1 : undefined,
      cursor: options?.cursor ? { id: options.cursor } : undefined,
      include: {
        stay: {
          select: {
            id: true,
            hotelId: true,
            roomId: true,
            reservationCode: true,
            status: true,
            plannedCheckInAt: true,
            plannedCheckOutAt: true,
            checkedInAt: true,
            room: {
              select: {
                id: true,
                roomNumber: true,
              },
            },
          },
        },
      },
      orderBy:
        options?.cursor || options?.take
          ? [{ id: "asc" }]
          : [
              { stay: { room: { roomNumber: "asc" } } },
              { stayId: "asc" },
              { isPrimary: "desc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
    });
  }

  async findDailyMovementsByHotel(
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
  ): Promise<{
    items: Array<{
      kind: "ARRIVAL" | "DEPARTURE";
      reservationId: string | null;
      stayId: string | null;
      reservationCode: string | null;
      groupCode: string | null;
      roomId: string | null;
      roomNumber: string | null;
      guestDisplayName: string;
      guestPhone: string | null;
      status: string;
      plannedCheckInAt: Date | null;
      plannedCheckOutAt: Date | null;
      checkedInAt: Date | null;
      checkedOutAt: Date | null;
      occupantCount: number;
      canCheckIn: boolean;
      canCheckOut: boolean;
    }>;
    total: number;
  }> {
    const { kind, start, end, q, allowedRoomId, page, limit } = params;
    const skip = (page - 1) * limit;

    if (kind === "ARRIVAL") {
      let matchingRoomIds: string[] | undefined;
      if (q) {
        const matchingRooms = await this.prisma.room.findMany({
          where: {
            hotelId,
            roomNumber: { contains: q, mode: "insensitive" },
          },
          select: { id: true },
        });
        matchingRoomIds = matchingRooms.map((r) => r.id);
      }

      const searchConditions: Prisma.ReservationWhereInput[] = q
        ? [
            { guestDisplayName: { contains: q, mode: "insensitive" } },
            { guestPhone: { contains: q, mode: "insensitive" } },
            { reservationCode: { contains: q, mode: "insensitive" } },
            { groupCode: { contains: q, mode: "insensitive" } },
            {
              group: {
                OR: [
                  { groupCode: { contains: q, mode: "insensitive" } },
                  { groupName: { contains: q, mode: "insensitive" } },
                  { leadGuestName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
            ...(matchingRoomIds && matchingRoomIds.length > 0
              ? [{ roomId: { in: matchingRoomIds } }]
              : []),
          ]
        : [];

      const where: Prisma.ReservationWhereInput = {
        AND: [
          { hotelId },
          {
            status: {
              in: [
                ReservationStatus.CONFIRMED,
                ReservationStatus.ARRIVAL_READY,
                ReservationStatus.CHECKED_IN,
              ],
            },
          },
          { plannedCheckInAt: { gte: start, lt: end } },
          ...(allowedRoomId ? [{ roomId: allowedRoomId }] : []),
          ...(searchConditions.length > 0 ? [{ OR: searchConditions }] : []),
        ],
      };

      const [total, reservations] = await Promise.all([
        this.prisma.reservation.count({ where }),
        this.prisma.reservation.findMany({
          where,
          select: {
            id: true,
            hotelId: true,
            roomId: true,
            reservationCode: true,
            groupCode: true,
            guestDisplayName: true,
            guestPhone: true,
            guestCount: true,
            status: true,
            plannedCheckInAt: true,
            plannedCheckOutAt: true,
            checkedInAt: true,
            stay: {
              select: {
                id: true,
                checkedInAt: true,
                _count: {
                  select: {
                    occupants: true,
                  },
                },
              },
            },
          },
          orderBy: [{ plannedCheckInAt: "asc" }, { reservationCode: "asc" }, { id: "asc" }],
          skip,
          take: limit,
        }),
      ]);

      const roomIdsToFetch = reservations
        .map((r) => r.roomId)
        .filter((id): id is string => Boolean(id));

      const rooms =
        roomIdsToFetch.length > 0
          ? await this.prisma.room.findMany({
              where: { id: { in: roomIdsToFetch } },
              select: { id: true, roomNumber: true },
            })
          : [];
      const roomMap = new Map(rooms.map((r) => [r.id, r.roomNumber]));

      const items = reservations.map((res: any) => {
        const activeStay = res.stay ?? res.guestStays?.[0] ?? null;
        const stayCheckInDate =
          activeStay?.checkedInAt ?? activeStay?.checkInAt ?? res.checkedInAt ?? null;
        const stayOccupantCount =
          activeStay?._count?.occupants ??
          activeStay?._count?.stayOccupants ??
          (Array.isArray(activeStay?.occupants) ? activeStay.occupants.length : undefined);

        return {
          kind: "ARRIVAL" as const,
          reservationId: res.id,
          stayId: activeStay?.id ?? null,
          reservationCode: res.reservationCode ?? null,
          groupCode: res.groupCode ?? null,
          roomId: res.roomId ?? null,
          roomNumber: res.roomId ? (roomMap.get(res.roomId) ?? null) : null,
          guestDisplayName: res.guestDisplayName,
          guestPhone: res.guestPhone ?? null,
          status: res.status,
          plannedCheckInAt: res.plannedCheckInAt ?? null,
          plannedCheckOutAt: res.plannedCheckOutAt ?? null,
          checkedInAt: stayCheckInDate ? new Date(stayCheckInDate) : null,
          actualCheckInAt: stayCheckInDate ? new Date(stayCheckInDate).toISOString() : null,
          checkedOutAt: null,
          occupantCount:
            stayOccupantCount && stayOccupantCount > 0 ? stayOccupantCount : (res.guestCount ?? 1),
          canCheckIn:
            res.status === ReservationStatus.CONFIRMED ||
            res.status === ReservationStatus.ARRIVAL_READY,
          canCheckOut: false,
        };
      });

      return { items, total };
    }

    // DEPARTURE
    const departureConditions: Prisma.GuestStayWhereInput[] = [
      {
        plannedCheckOutAt: { gte: start, lt: end },
        status: {
          in: [
            GuestStayStatus.ACTIVE,
            GuestStayStatus.CHECKED_IN,
            GuestStayStatus.CHECKOUT_PENDING,
          ],
        },
      },
      {
        checkedOutAt: { gte: start, lt: end },
      },
    ];

    const searchConditions: Prisma.GuestStayWhereInput[] = q
      ? [
          { guestDisplayName: { contains: q, mode: "insensitive" } },
          { guestPhone: { contains: q, mode: "insensitive" } },
          { reservationCode: { contains: q, mode: "insensitive" } },
          { room: { roomNumber: { contains: q, mode: "insensitive" } } },
          {
            reservation: {
              OR: [
                { reservationCode: { contains: q, mode: "insensitive" } },
                { groupCode: { contains: q, mode: "insensitive" } },
                {
                  group: {
                    OR: [
                      { groupCode: { contains: q, mode: "insensitive" } },
                      { groupName: { contains: q, mode: "insensitive" } },
                      { leadGuestName: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            },
          },
        ]
      : [];

    const where: Prisma.GuestStayWhereInput = {
      AND: [
        { hotelId },
        ...(allowedRoomId ? [{ roomId: allowedRoomId }] : []),
        { OR: departureConditions },
        ...(searchConditions.length > 0 ? [{ OR: searchConditions }] : []),
      ],
    };

    const [total, stays] = await Promise.all([
      this.prisma.guestStay.count({ where }),
      this.prisma.guestStay.findMany({
        where,
        select: {
          id: true,
          hotelId: true,
          roomId: true,
          reservationCode: true,
          guestDisplayName: true,
          guestPhone: true,
          status: true,
          plannedCheckInAt: true,
          plannedCheckOutAt: true,
          checkedInAt: true,
          checkedOutAt: true,
          room: {
            select: {
              id: true,
              roomNumber: true,
            },
          },
          occupants: {
            select: {
              id: true,
            },
          },
        },
        orderBy: [{ plannedCheckOutAt: "asc" }, { reservationCode: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    const items = stays.map((stay) => {
      const isOperationallyActive =
        (stay.status === GuestStayStatus.ACTIVE ||
          stay.status === GuestStayStatus.CHECKED_IN ||
          stay.status === GuestStayStatus.CHECKOUT_PENDING) &&
        !stay.checkedOutAt;

      return {
        kind: "DEPARTURE" as const,
        reservationId: null,
        stayId: stay.id,
        reservationCode: stay.reservationCode ?? null,
        groupCode: null,
        roomId: stay.roomId ?? null,
        roomNumber: stay.room?.roomNumber ?? null,
        guestDisplayName: stay.guestDisplayName,
        guestPhone: stay.guestPhone ?? null,
        status: stay.status,
        plannedCheckInAt: stay.plannedCheckInAt ?? null,
        plannedCheckOutAt: stay.plannedCheckOutAt ?? null,
        checkedInAt: stay.checkedInAt ?? null,
        checkedOutAt: stay.checkedOutAt ?? null,
        occupantCount: stay.occupants && stay.occupants.length > 0 ? stay.occupants.length : 1,
        canCheckIn: false,
        canCheckOut: Boolean(isOperationallyActive),
      };
    });

    return { items, total };
  }
}
