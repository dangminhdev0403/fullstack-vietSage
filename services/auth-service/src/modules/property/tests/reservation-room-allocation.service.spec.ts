import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { GuestStayStatus, Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { ReservationRoomAllocationService } from "../application/reservation-room-allocation.service";

describe("ReservationRoomAllocationService", () => {
  let service: ReservationRoomAllocationService;

  beforeEach(() => {
    service = new ReservationRoomAllocationService();
  });

  const hotelId = "hotel-test-1";
  const deluxeType = { id: "type-deluxe", name: "Deluxe Double", normalizedKey: "deluxe double" };
  const standardType = {
    id: "type-standard",
    name: "Standard Single",
    normalizedKey: "standard single",
  };

  const createMockTx = (overrides: {
    roomTypes?: any[];
    rooms?: any[];
    reservations?: any[];
    guestStays?: any[];
    rawQueryError?: Error;
  }) => {
    const roomTypes = overrides.roomTypes ?? [deluxeType, standardType];
    const rooms = overrides.rooms ?? [];
    const reservations = overrides.reservations ?? [];
    const guestStays = overrides.guestStays ?? [];

    const queryRawUnsafeMock = jest
      .fn()
      .mockImplementation(async (query: string, ...params: any[]) => {
        if (overrides.rawQueryError) {
          throw overrides.rawQueryError;
        }
        return [];
      });

    return {
      $queryRawUnsafe: queryRawUnsafeMock,
      roomType: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          if (!where) return null;
          return (
            roomTypes.find((rt) => {
              if (where.id && rt.id === where.id) return true;
              if (where.name && rt.name === where.name) return true;
              if (where.normalizedKey && rt.normalizedKey === where.normalizedKey) return true;
              if (where.OR) {
                return where.OR.some(
                  (cond: any) =>
                    (cond.id && rt.id === cond.id) ||
                    (cond.name && rt.name === cond.name) ||
                    (cond.normalizedKey && rt.normalizedKey === cond.normalizedKey),
                );
              }
              return false;
            }) ?? null
          );
        }),
      },
      room: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          return (
            rooms.find(
              (r) => r.id === where.id && (!where.hotelId || r.hotelId === where.hotelId),
            ) ?? null
          );
        }),
        findMany: jest
          .fn()
          .mockImplementation(async ({ where, orderBy }: { where: any; orderBy?: any[] }) => {
            let list = rooms.filter((r) => {
              if (where.hotelId && r.hotelId !== where.hotelId) return false;
              if (where.status?.notIn && where.status.notIn.includes(r.status)) return false;
              if (where.id?.notIn && where.id.notIn.includes(r.id)) return false;
              return true;
            });
            if (orderBy) {
              list = [...list].sort((a, b) => {
                if (a.roomNumber < b.roomNumber) return -1;
                if (a.roomNumber > b.roomNumber) return 1;
                return a.id.localeCompare(b.id);
              });
            }
            return list;
          }),
      },
      reservation: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          return (
            reservations.find((res) => {
              if (where.hotelId && res.hotelId !== where.hotelId) return false;
              if (where.roomId && res.roomId !== where.roomId) return false;
              if (where.id?.not && res.id === where.id.not) return false;
              if (where.status?.in && !where.status.in.includes(res.status)) return false;
              // Check half-open overlap: plannedCheckInAt < checkOutAt && plannedCheckOutAt > checkInAt
              const checkInAt = where.plannedCheckOutAt?.gt;
              const checkOutAt = where.plannedCheckInAt?.lt;
              if (checkInAt && checkOutAt) {
                const resIn = new Date(res.plannedCheckInAt);
                const resOut = new Date(res.plannedCheckOutAt);
                const overlaps =
                  resIn.getTime() < checkOutAt.getTime() && resOut.getTime() > checkInAt.getTime();
                return overlaps;
              }
              return true;
            }) ?? null
          );
        }),
      },
      guestStay: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          return (
            guestStays.find((stay) => {
              if (where.hotelId && stay.hotelId !== where.hotelId) return false;
              if (where.roomId && stay.roomId !== where.roomId) return false;
              if (where.reservationId?.not && stay.reservationId === where.reservationId.not)
                return false;
              if (where.status?.in && !where.status.in.includes(stay.status)) return false;
              if (where.checkedOutAt === null && stay.checkedOutAt !== null) return false;
              if (where.plannedCheckOutAt?.lt) {
                const cutoff = where.plannedCheckOutAt.lt;
                if (new Date(stay.plannedCheckOutAt).getTime() >= cutoff.getTime()) return false;
              }
              const checkInAt = where.plannedCheckOutAt?.gt;
              const checkOutAt = where.plannedCheckInAt?.lt;
              if (checkInAt && checkOutAt) {
                const sIn = new Date(stay.plannedCheckInAt);
                const sOut = new Date(stay.plannedCheckOutAt);
                const overlaps =
                  sIn.getTime() < checkOutAt.getTime() && sOut.getTime() > checkInAt.getTime();
                return overlaps;
              }
              return true;
            }) ?? null
          );
        }),
      },
    };
  };

  describe("Exact room type matching", () => {
    it("auto mode selects a room strictly matching the exact room type by ID", async () => {
      const roomDeluxe = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
        floor: "1",
      };
      const roomStandard = {
        id: "room-102",
        hotelId,
        roomNumber: "102",
        roomTypeId: standardType.id,
        type: standardType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("80.00"),
        floor: "1",
      };

      const tx = createMockTx({ rooms: [roomDeluxe, roomStandard] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-101");
      expect(result.roomNumber).toBe("101");
      expect(result.roomTypeId).toBe(deluxeType.id);
    });

    it("manual mode throws ROOM_TYPE_MISMATCH if requested room does not match target room type", async () => {
      const roomStandard = {
        id: "room-102",
        hotelId,
        roomNumber: "102",
        roomTypeId: standardType.id,
        type: standardType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("80.00"),
        floor: "1",
      };

      const tx = createMockTx({ rooms: [roomStandard] });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          requestedRoomId: "room-102",
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new ConflictException("ROOM_TYPE_MISMATCH"));
    });
  });

  describe("Half-open interval [checkIn, checkOut)", () => {
    it("allows back-to-back bookings where checkout of earlier reservation equals checkin of new reservation", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
      };
      // Existing reservation: ends at 2026-11-03T12:00:00Z
      const existingRes = {
        id: "res-1",
        hotelId,
        roomId: "room-101",
        status: ReservationStatus.CONFIRMED,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-03T12:00:00Z"),
      };

      const tx = createMockTx({ rooms: [room], reservations: [existingRes] });

      // New reservation starts exactly when existing ends: 2026-11-03T12:00:00Z
      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: new Date("2026-11-03T12:00:00Z"),
          checkOutAt: new Date("2026-11-05T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-101");
    });

    it("rejects when intervals overlap by even a minute", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
      };
      // Existing reservation ends at 2026-11-03T12:00:00Z
      const existingRes = {
        id: "res-1",
        hotelId,
        roomId: "room-101",
        status: ReservationStatus.CONFIRMED,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-03T12:00:00Z"),
      };

      const tx = createMockTx({ rooms: [room], reservations: [existingRes] });

      // New reservation starts at 11:59:00Z (overlaps by 1 minute)
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          interval: {
            checkInAt: new Date("2026-11-03T11:59:00Z"),
            checkOutAt: new Date("2026-11-05T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new ConflictException("NO_AVAILABLE_ROOM"));
    });
  });

  describe("Cancelled and No-Show reservations do not hold inventory", () => {
    it("allocates room even if an overlapping CANCELLED or NO_SHOW reservation exists", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
      };
      const cancelledRes = {
        id: "res-cancelled",
        hotelId,
        roomId: "room-101",
        status: ReservationStatus.CANCELLED,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-05T12:00:00Z"),
      };
      const noShowRes = {
        id: "res-noshow",
        hotelId,
        roomId: "room-101",
        status: ReservationStatus.NO_SHOW,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-05T12:00:00Z"),
      };

      const tx = createMockTx({ rooms: [room], reservations: [cancelledRes, noShowRes] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: new Date("2026-11-02T14:00:00Z"),
          checkOutAt: new Date("2026-11-04T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-101");
    });
  });

  describe("Active overlapping stays block inventory", () => {
    it("blocks room when active stay overlaps requested interval", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.OCCUPIED,
        price: new Prisma.Decimal("100.00"),
      };
      const activeStay = {
        id: "stay-active",
        hotelId,
        roomId: "room-101",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-04T12:00:00Z"),
        checkedOutAt: null,
      };

      const tx = createMockTx({ rooms: [room], guestStays: [activeStay] });

      // Manual mode surfaces ROOM_RESERVATION_OVERLAP
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          requestedRoomId: "room-101",
          interval: {
            checkInAt: new Date("2026-11-02T14:00:00Z"),
            checkOutAt: new Date("2026-11-05T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new ConflictException("ROOM_RESERVATION_OVERLAP"));

      // Auto mode with no other room surfaces NO_AVAILABLE_ROOM
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          interval: {
            checkInAt: new Date("2026-11-02T14:00:00Z"),
            checkOutAt: new Date("2026-11-05T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new ConflictException("NO_AVAILABLE_ROOM"));
    });
  });

  describe("Overdue active stays excluded from automatic allocation", () => {
    it("auto mode excludes room with overdue active stay even if requested interval is after planned checkout", async () => {
      const now = new Date();
      const pastCheckIn = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const pastCheckOut = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours overdue

      // Room 101 has an overdue active stay
      const room101 = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.OCCUPIED,
        price: new Prisma.Decimal("100.00"),
      };
      // Room 102 is completely free
      const room102 = {
        id: "room-102",
        hotelId,
        roomNumber: "102",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
      };

      const overdueStay = {
        id: "stay-overdue",
        hotelId,
        roomId: "room-101",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: pastCheckIn,
        plannedCheckOutAt: pastCheckOut,
        checkedOutAt: null, // Still physically in room!
      };

      const tx = createMockTx({ rooms: [room101, room102], guestStays: [overdueStay] });

      // Request for tonight / tomorrow
      const futureCheckIn = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const futureCheckOut = new Date(now.getTime() + 26 * 60 * 60 * 1000);

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: futureCheckIn,
          checkOutAt: futureCheckOut,
        },
        mode: "auto",
      });

      // Must bypass room-101 and choose room-102!
      expect(result.id).toBe("room-102");
    });
  });

  describe("Hard room blocks win", () => {
    it("rooms with BLOCKED, MAINTENANCE, or OUT_OF_SERVICE are never allocated", async () => {
      const blockedRoom = {
        id: "room-blocked",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.BLOCKED,
      };
      const maintenanceRoom = {
        id: "room-maint",
        hotelId,
        roomNumber: "102",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.MAINTENANCE,
      };
      const outOfServiceRoom = {
        id: "room-oos",
        hotelId,
        roomNumber: "103",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.OUT_OF_SERVICE,
      };

      const tx = createMockTx({
        rooms: [blockedRoom, maintenanceRoom, outOfServiceRoom],
      });

      // Manual mode requesting BLOCKED room throws ROOM_NOT_AVAILABLE
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          requestedRoomId: "room-blocked",
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new ConflictException("ROOM_NOT_AVAILABLE"));

      // Auto mode throws NO_AVAILABLE_ROOM
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new ConflictException("NO_AVAILABLE_ROOM"));
    });
  });

  describe("Deterministic stable choice and locking query", () => {
    it("auto mode deterministically picks room with lowest roomNumber", async () => {
      const room202 = {
        id: "room-202",
        hotelId,
        roomNumber: "202",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };
      const room101 = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };
      const room305 = {
        id: "room-305",
        hotelId,
        roomNumber: "305",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [room202, room101, room305] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-101");
      expect(result.roomNumber).toBe("101");

      // Verify row lock query was issued for room-101
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
        'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
        "room-101",
        hotelId,
      );
    });
  });

  describe("Retryable conflict surfacing", () => {
    it("surfaces ConflictException with RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT when row lock fails with P2034", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };

      const p2034Error = new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
        code: "P2034",
        clientVersion: "7.9.1",
      });

      const tx = createMockTx({
        rooms: [room],
        rawQueryError: p2034Error,
      });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new ConflictException("RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT"));
    });

    it("isRetryableConflict accurately detects retryable errors", () => {
      const p2034Error = new Prisma.PrismaClientKnownRequestError("Write conflict", {
        code: "P2034",
        clientVersion: "7.9.1",
      });
      const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique conflict", {
        code: "P2002",
        clientVersion: "7.9.1",
      });
      const conflictEx = new ConflictException("RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT");
      const badReq = new BadRequestException("Invalid date");

      expect(service.isRetryableConflict(p2034Error)).toBe(true);
      expect(service.isRetryableConflict(p2002Error)).toBe(true);
      expect(service.isRetryableConflict(conflictEx)).toBe(true);
      expect(service.isRetryableConflict(badReq)).toBe(false);
    });
  });

  describe("Excluded room IDs and input validation", () => {
    it("excludes rooms specified in excludedRoomIds", async () => {
      const room101 = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };
      const room102 = {
        id: "room-102",
        hotelId,
        roomNumber: "102",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [room101, room102] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        excludedRoomIds: ["room-101"],
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-102");
    });

    it("throws BadRequestException when checkIn >= checkOut", async () => {
      const tx = createMockTx({});
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          interval: {
            checkInAt: new Date("2026-11-05T14:00:00Z"),
            checkOutAt: new Date("2026-11-01T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new BadRequestException("Ngày trả phòng phải sau ngày nhận phòng"));
    });

    it("throws NotFoundException when manual mode targets non-existent room", async () => {
      const tx = createMockTx({ rooms: [] });
      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          roomTypeId: deluxeType.id,
          requestedRoomId: "room-does-not-exist",
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new NotFoundException("Không tìm thấy phòng"));
    });
  });

  describe("Legacy null canonical type and unknown target handling", () => {
    it("does not produce ROOM_TYPE_MISMATCH when target room is a legacy record omitting canonical relation", async () => {
      const legacyRoom = {
        id: "room-legacy-1",
        hotelId,
        roomNumber: "101",
        roomTypeId: null,
        type: null,
        status: RoomStatus.AVAILABLE,
        price: new Prisma.Decimal("100.00"),
      };

      const tx = createMockTx({ rooms: [legacyRoom] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        requestedRoomId: "room-legacy-1",
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "manual",
      });

      expect(result.id).toBe("room-legacy-1");
      expect(result.roomNumber).toBe("101");
    });

    it("auto mode allocates legacy room with omitted canonical relation as compatible unknown", async () => {
      const legacyRoom = {
        id: "room-legacy-1",
        hotelId,
        roomNumber: "101",
        roomTypeId: null,
        type: null,
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [legacyRoom] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-legacy-1");
    });

    it("matches room when requested type is unknown/omitted", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        type: deluxeType.name,
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [room] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-101");
    });

    it("matches legacy room when room.type matches resolved canonical room type name", async () => {
      const legacyRoom = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: null,
        type: "Deluxe Double",
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [legacyRoom] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        roomTypeId: deluxeType.id,
        requestedRoomId: "room-101",
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "manual",
      });

      expect(result.id).toBe("room-101");
    });
  });

  describe("Room capacity validation and legacy null capacity", () => {
    it("manual mode throws ROOM_CAPACITY_OVERFLOW when guestCount exceeds room capacity", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        roomType: { ...deluxeType, maxOccupancy: 2 },
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [room] });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          requestedRoomId: "room-101",
          guestCount: 3,
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new ConflictException("ROOM_CAPACITY_OVERFLOW"));
    });

    it("auto mode filters out rooms with insufficient capacity and selects one with adequate capacity", async () => {
      const smallRoom = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: deluxeType.id,
        roomType: { ...deluxeType, maxOccupancy: 2 },
        status: RoomStatus.AVAILABLE,
      };
      const largeRoom = {
        id: "room-102",
        hotelId,
        roomNumber: "102",
        roomTypeId: deluxeType.id,
        roomType: { ...deluxeType, maxOccupancy: 4 },
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [smallRoom, largeRoom] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        guestCount: 3,
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "auto",
      });

      expect(result.id).toBe("room-102");
    });

    it("legacy room with null capacity remains compatible unknown when guestCount is specified", async () => {
      const legacyRoom = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        roomTypeId: null,
        roomType: null,
        maxOccupancy: null,
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [legacyRoom] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        guestCount: 4,
        requestedRoomId: "room-101",
        interval: {
          checkInAt: new Date("2026-11-01T14:00:00Z"),
          checkOutAt: new Date("2026-11-03T12:00:00Z"),
        },
        mode: "manual",
      });

      expect(result.id).toBe("room-101");
    });
  });

  describe("Hotel scope validation", () => {
    it("manual mode throws NotFoundException if room belongs to another hotel", async () => {
      const foreignRoom = {
        id: "room-other-hotel",
        hotelId: "hotel-test-2",
        roomNumber: "101",
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [foreignRoom] });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId: "hotel-test-1",
          requestedRoomId: "room-other-hotel",
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new NotFoundException("Không tìm thấy phòng"));
    });

    it("auto mode excludes rooms from different hotel", async () => {
      const foreignRoom = {
        id: "room-other-hotel",
        hotelId: "hotel-test-2",
        roomNumber: "101",
        status: RoomStatus.AVAILABLE,
      };

      const tx = createMockTx({ rooms: [foreignRoom] });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId: "hotel-test-1",
          interval: {
            checkInAt: new Date("2026-11-01T14:00:00Z"),
            checkOutAt: new Date("2026-11-03T12:00:00Z"),
          },
          mode: "auto",
        }),
      ).rejects.toThrow(new ConflictException("NO_AVAILABLE_ROOM"));
    });
  });

  describe("Overdue active stay in manual mode", () => {
    it("manual mode throws ROOM_OVERDUE_STAY_CONFLICT when requested room has an overdue active stay", async () => {
      const now = new Date();
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        status: RoomStatus.OCCUPIED,
      };
      const overdueStay = {
        id: "stay-overdue",
        hotelId,
        roomId: "room-101",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: new Date(now.getTime() - 48 * 3600000),
        plannedCheckOutAt: new Date(now.getTime() - 2 * 3600000),
        checkedOutAt: null,
      };

      const tx = createMockTx({ rooms: [room], guestStays: [overdueStay] });

      await expect(
        service.allocateRoom(tx as any, {
          hotelId,
          requestedRoomId: "room-101",
          interval: {
            checkInAt: new Date(now.getTime() + 3600000),
            checkOutAt: new Date(now.getTime() + 24 * 3600000),
          },
          mode: "manual",
        }),
      ).rejects.toThrow(new ConflictException("ROOM_OVERDUE_STAY_CONFLICT"));
    });
  });

  describe("Excluded reservation ID handling", () => {
    it("does not conflict with existing reservation when excludedReservationId matches", async () => {
      const room = {
        id: "room-101",
        hotelId,
        roomNumber: "101",
        status: RoomStatus.AVAILABLE,
      };
      const existingRes = {
        id: "res-self",
        hotelId,
        roomId: "room-101",
        status: ReservationStatus.CONFIRMED,
        plannedCheckInAt: new Date("2026-11-01T14:00:00Z"),
        plannedCheckOutAt: new Date("2026-11-05T12:00:00Z"),
      };

      const tx = createMockTx({ rooms: [room], reservations: [existingRes] });

      const result = await service.allocateRoom(tx as any, {
        hotelId,
        requestedRoomId: "room-101",
        excludedReservationId: "res-self",
        interval: {
          checkInAt: new Date("2026-11-02T14:00:00Z"),
          checkOutAt: new Date("2026-11-04T12:00:00Z"),
        },
        mode: "manual",
      });

      expect(result.id).toBe("room-101");
    });
  });
});
