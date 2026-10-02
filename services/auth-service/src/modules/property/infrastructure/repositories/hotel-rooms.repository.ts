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
import { countDistinctGuestDevicesByStay } from "../../../../shared/guest-device-identity";
import { PrismaService } from "../../../../prisma/prisma.service";
import { inferCitizenshipKind } from "../../domain/infer-citizenship-kind";
import { roomListInclude, type RoomListRow } from "./hotel-repository.types";

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
        readiness: "MISSING_PRICE" as const,
        roomCount: value.count,
      })),
    ];
  }

  async createRoomType(hotelId: string, name: string, basePrice: number) {
    const normalized = HotelRoomsRepository.normalizeType(name);
    if (!normalized.name) throw new BadRequestException("Tên loại phòng không được để trống");
    if (normalized.name.length > 80 || normalized.normalizedKey.length > 80) {
      throw new BadRequestException("Tên loại phòng tối đa 80 ký tự sau chuẩn hóa");
    }
    const existing = await this.prisma.roomType.findUnique({
      where: { hotelId_normalizedKey: { hotelId, normalizedKey: normalized.normalizedKey } },
    });
    if (existing) return { item: await this.roomTypeItem(existing), created: false };
    const legacyRooms = await this.prisma.room.findMany({
      where: { hotelId, roomTypeId: null, type: { not: null } },
      select: { type: true, price: true },
    });
    const legacyPrices = new Set(
      legacyRooms
        .filter(
          (room) =>
            room.type &&
            HotelRoomsRepository.normalizeType(room.type).normalizedKey ===
              normalized.normalizedKey,
        )
        .map((room) => (room.price === null ? null : Number(room.price))),
    );
    if (
      legacyPrices.size > 1 ||
      legacyPrices.has(null) ||
      Array.from(legacyPrices).some(
        (price) => price !== null && (price <= 0 || price !== basePrice),
      )
    ) {
      throw new ConflictException(
        "Giá phòng cũ không đồng nhất hoặc thiếu. Đối soát loại phòng trước khi lưu giá gốc",
      );
    }
    try {
      const item = await this.prisma.roomType.create({
        data: { hotelId, ...normalized, basePrice },
      });
      return { item: await this.roomTypeItem(item), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.prisma.roomType.findUnique({
          where: { hotelId_normalizedKey: { hotelId, normalizedKey: normalized.normalizedKey } },
        });
        if (winner) return { item: await this.roomTypeItem(winner), created: false };
      }
      throw error;
    }
  }

  async updateRoomTypePrice(hotelId: string, roomTypeId: string, basePrice: number) {
    const updated = await this.prisma.roomType.updateMany({
      where: { hotelId, id: roomTypeId },
      data: { basePrice },
    });
    if (!updated.count) throw new NotFoundException("Không tìm thấy loại phòng trong khách sạn");
    const type = await this.prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
    return { ...(await this.roomTypeItem(type)), channexSync: "NOT_PUSHED" as const };
  }

  private async roomTypeItem(type: {
    id: string;
    hotelId: string;
    name: string;
    normalizedKey: string;
    basePrice: Prisma.Decimal | null;
  }) {
    return {
      id: type.id,
      name: type.name,
      basePrice: type.basePrice === null ? null : Number(type.basePrice),
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
    type?: string;
    roomTypeId?: string;
    newRoomType?: { name: string; basePrice: number };
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
              create: { hotelId: input.hotelId, ...normalized, basePrice },
              update: {},
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

  async listRooms(where: Prisma.RoomWhereInput, skip: number, take: number) {
    const hotelId = where.hotelId as string;
    const scopedBaseWhere: Prisma.RoomWhereInput = where.id
      ? { hotelId, id: where.id }
      : { hotelId };
    const [total, rows, allFloors, allTypes, availableCount] = await Promise.all([
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
        where: { ...scopedBaseWhere, status: RoomStatus.AVAILABLE },
      }),
    ]);

    const uniqueFloors = allFloors.map((f) => f.floor).filter((f): f is string => Boolean(f));
    const uniqueTypes = allTypes.map((t) => t.type).filter((t): t is string => Boolean(t));

    return {
      total,
      items: await this.withActiveGuestDeviceCounts(this.prisma, rows),
      floors: [...uniqueFloors].sort((a, b) => a.localeCompare(b)),
      types: [...uniqueTypes].sort((a, b) => a.localeCompare(b)),
      totalAvailable: availableCount,
    };
  }

  async updateRoomInHotel(hotelId: string, roomId: string, data: Prisma.RoomUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
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

    if (activeStayIds.length === 0) {
      return rooms.map((room) => ({ ...room, activeGuestDeviceCount: 0 }));
    }

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
    const countByStayId = countDistinctGuestDevicesByStay(sessions);

    return rooms.map((room) => ({
      ...room,
      activeGuestDeviceCount: countByStayId.get(room.guestStays[0]?.id ?? "") ?? 0,
    }));
  }

  async findRoomInHotel(hotelId: string, roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        include: roomListInclude,
      });
      if (!room) return null;
      return (await this.withActiveGuestDeviceCounts(tx, [room]))[0] ?? null;
    });
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
    generateReservationCode: (tx: Prisma.TransactionClient) => Promise<string>;
    generateFolioNumber: (tx: Prisma.TransactionClient) => Promise<string>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reservationCode = await input.generateReservationCode(tx);
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

      await tx.room.update({
        where: { id: input.roomId },
        data: { status: RoomStatus.PROCESSING },
      });

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
        select: { id: true, status: true },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      let roomStatus = room.status;

      if (roomStatus === RoomStatus.OCCUPIED) {
        const [activeStayCount, openFolioCount] = await Promise.all([
          tx.guestStay.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
            },
          }),
          tx.folio.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: FolioStatus.OPEN,
            },
          }),
        ]);

        if (activeStayCount > 0 || openFolioCount > 0) {
          throw new ConflictException("Phòng chưa sẵn sàng để check-in");
        }

        await tx.room.update({
          where: { id: input.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
        roomStatus = RoomStatus.AVAILABLE;
      }

      if (roomStatus !== RoomStatus.PROCESSING && roomStatus !== RoomStatus.AVAILABLE) {
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
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.PROCESSING] },
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
        select: { id: true, status: true },
      });

      if (!room) {
        throw new BadRequestException("Không tìm thấy phòng");
      }

      let roomStatus = room.status;

      if (roomStatus === RoomStatus.OCCUPIED || roomStatus === RoomStatus.RESERVED) {
        const [activeStayCount, openFolioCount] = await Promise.all([
          tx.guestStay.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: {
                in: [
                  GuestStayStatus.ACTIVE,
                  GuestStayStatus.CHECKED_IN,
                  GuestStayStatus.CHECKOUT_PENDING,
                ],
              },
            },
          }),
          tx.folio.count({
            where: {
              hotelId: input.hotelId,
              roomId: input.roomId,
              status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
            },
          }),
        ]);

        if (activeStayCount > 0 || openFolioCount > 0) {
          throw new ConflictException("Phòng không khả dụng để check-in");
        }

        await tx.room.update({
          where: { id: input.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
        roomStatus = RoomStatus.AVAILABLE;
      }

      if (roomStatus !== RoomStatus.AVAILABLE && roomStatus !== RoomStatus.PROCESSING) {
        throw new ConflictException("Phòng không khả dụng để check-in");
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

      const reservationCode = await input.generateReservationCode(tx);
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
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.PROCESSING] },
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
      const stay = await tx.guestStay.update({
        where: { id: input.stayId },
        data: {
          status: GuestStayStatus.CHECKED_OUT,
          checkedOutAt: now,
          closedByUserId: input.actorUserId,
          accessCodeHash: null,
          accessCodeExpiresAt: null,
        },
      });

      await tx.room.update({
        where: { id: input.roomId },
        data: { status: input.nextRoomStatus },
      });

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

      await this.createDomainEvent(tx, {
        eventType: "GUEST_CHECKED_OUT",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, roomId: input.roomId, actorUserId: input.actorUserId },
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_SESSION_REVOKED",
        aggregateType: "GuestStay",
        aggregateId: stay.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { stayId: stay.id, reason: "CHECKOUT" },
      });

      return stay;
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
}
