process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { ConflictException } from "@nestjs/common";
import { Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import {
  ChannexBookingIngestionService,
  ReservationRoomAllocationServiceContract,
  AllocateRoomInput,
  AllocatedRoomResult,
} from "./channex-booking-ingestion.service";
import type { ChannexRevisionItem } from "./channex-api-client.service";

describe("ChannexBookingIngestionService - Automatic Room Allocation & Ingestion Specification", () => {
  let prisma: any;
  let channexClient: any;
  let ariSyncService: any;
  let allocationService: jest.Mocked<ReservationRoomAllocationServiceContract>;
  let service: ChannexBookingIngestionService;

  const hotelId = "hotel-test-1";
  const propertyChannexId = "prop-channex-1";
  const roomTypeChannexId = "rt-channex-deluxe";
  const deluxeLocalId = "room-type-deluxe";

  const sampleSingleRoomRevision: ChannexRevisionItem = {
    id: "rev-single-1",
    type: "booking_revision",
    attributes: {
      booking_id: "book-uuid-single",
      property_id: propertyChannexId,
      status: "new",
      ota_name: "Booking.com",
      ota_reservation_code: "BK-12345",
      arrival_date: "2026-11-01",
      departure_date: "2026-11-05",
      amount: "2500000",
      currency: "VND",
      customer: {
        name: "Nguyen",
        surname: "Van A",
        phone: "0901234567",
      },
      rooms: [
        {
          room_type_id: roomTypeChannexId,
          rate_plan_id: "rp-1",
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-05",
          amount: "2500000",
        },
      ],
    },
  };

  const sampleMultiRoomRevision: ChannexRevisionItem = {
    id: "rev-multi-1",
    type: "booking_revision",
    attributes: {
      booking_id: "book-uuid-multi",
      property_id: propertyChannexId,
      status: "new",
      ota_name: "Agoda",
      ota_reservation_code: "AG-998877",
      arrival_date: "2026-11-01",
      departure_date: "2026-11-05",
      amount: "5000000",
      currency: "VND",
      customer: {
        name: "Tran",
        surname: "Thi B",
        phone: "0912345678",
      },
      rooms: [
        {
          room_type_id: roomTypeChannexId,
          rate_plan_id: "rp-1",
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-05",
          amount: "2500000",
        },
        {
          room_type_id: roomTypeChannexId,
          rate_plan_id: "rp-1",
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-05",
          amount: "2500000",
        },
      ],
    },
  };

  beforeEach(() => {
    const createdReservations: any[] = [];
    let mappingCreated: any = null;
    let syncLogCreated: any = null;

    prisma = {
      channexMapping: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          if (where.kind === "property" && where.channexId === propertyChannexId) {
            return { hotelId };
          }
          if (where.kind === "booking") {
            if (mappingCreated && mappingCreated.channexId === where.channexId) {
              return mappingCreated;
            }
            return null;
          }
          if (where.kind === "room_type" && where.channexId === roomTypeChannexId) {
            return {
              hotelId,
              kind: "room_type",
              channexId: roomTypeChannexId,
              localId: deluxeLocalId,
              metadata: { title: "Deluxe King" },
            };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
          mappingCreated = { ...data, id: "mapping-created-id" };
          return mappingCreated;
        }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      hotel: {
        findUnique: jest.fn(),
      },
      roomType: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: any }) => {
          if (where.hotelId === hotelId) {
            return { id: deluxeLocalId, name: "Deluxe King" };
          }
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reservation: {
        create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
          const res = {
            id: `res-${createdReservations.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdReservations.push(res);
          return res;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          return createdReservations.find((r) => r.id === where.id) ?? null;
        }),
        updateMany: jest
          .fn()
          .mockImplementation(async ({ where, data }: { where: any; data: any }) => {
            const ids: string[] = where.id?.in ?? [];
            let count = 0;
            for (const res of createdReservations) {
              if (ids.includes(res.id)) {
                Object.assign(res, data);
                count++;
              }
            }
            return { count };
          }),
      },
      channelSyncLog: {
        create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
          syncLogCreated = { id: "log-created-id", ...data };
          return syncLogCreated;
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<any>, _options?: any) => {
        return fn(prisma);
      }),
    };

    channexClient = {
      ackBookingRevision: jest.fn().mockResolvedValue({ data: { acknowledged: true } }),
      getBookingFeed: jest.fn(),
      getBookingRevision: jest.fn(),
    };

    ariSyncService = {
      pushAri: jest.fn().mockResolvedValue({ success: true }),
    };

    allocationService = {
      allocateRoom: jest.fn(),
      isRetryableConflict: jest.fn().mockReturnValue(false),
    };

    service = new ChannexBookingIngestionService(
      prisma,
      channexClient,
      ariSyncService,
      allocationService,
    );
  });

  describe("1. Distinct exact-type room assignment across OTA segments", () => {
    it("allocates a distinct exact-type room for each safely assignable OTA segment", async () => {
      allocationService.allocateRoom
        .mockResolvedValueOnce({
          id: "room-101",
          roomId: "room-101",
          roomNumber: "101",
          hotelId,
          roomTypeId: deluxeLocalId,
          type: "Deluxe King",
          status: RoomStatus.AVAILABLE,
          price: 2500000,
          floor: "1",
          room: null,
        })
        .mockResolvedValueOnce({
          id: "room-102",
          roomId: "room-102",
          roomNumber: "102",
          hotelId,
          roomTypeId: deluxeLocalId,
          type: "Deluxe King",
          status: RoomStatus.AVAILABLE,
          price: 2500000,
          floor: "1",
          room: null,
        });

      const outcome = await service.processSingleRevision(sampleMultiRoomRevision);

      expect(outcome.action).toBe("CREATED");
      expect(allocationService.allocateRoom).toHaveBeenCalledTimes(2);

      // Verify second allocation call received excludedRoomIds containing the first allocated room
      const secondCallInput = (allocationService.allocateRoom as jest.Mock).mock
        .calls[1][1] as AllocateRoomInput;
      expect(secondCallInput.excludedRoomIds).toEqual(["room-101"]);
      expect(secondCallInput.mode).toBe("auto");
      expect(secondCallInput.hotelId).toBe(hotelId);

      // Verify created reservations have distinct rooms assigned
      expect(prisma.reservation.create).toHaveBeenCalledTimes(2);
      const firstResData = prisma.reservation.create.mock.calls[0][0].data;
      const secondResData = prisma.reservation.create.mock.calls[1][0].data;

      expect(firstResData.roomId).toBe("room-101");
      expect(firstResData.assignedAt).toBeInstanceOf(Date);
      expect(secondResData.roomId).toBe("room-102");
      expect(secondResData.assignedAt).toBeInstanceOf(Date);
      expect(firstResData.roomId).not.toBe(secondResData.roomId);

      // Verify mapping metadata reflects all assigned
      expect(prisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              requiresRoomAssignment: false,
              assignmentSummary: {
                totalSegments: 2,
                assignedCount: 2,
                unassignedCount: 0,
                assignedRooms: ["101", "102"],
                allAssigned: true,
              },
            }),
          }),
        }),
      );
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-multi-1", undefined);
    });
  });

  describe("2. Provider-qualified groupCode shared across segments", () => {
    it("assigns provider-qualified groupCode CHANNEX:<booking_id> shared across all segment reservations", async () => {
      allocationService.allocateRoom
        .mockResolvedValueOnce({
          id: "room-101",
          roomId: "room-101",
          roomNumber: "101",
          hotelId,
          roomTypeId: deluxeLocalId,
          type: "Deluxe King",
          status: RoomStatus.AVAILABLE,
          price: null,
          floor: null,
          room: null,
        })
        .mockResolvedValueOnce({
          id: "room-102",
          roomId: "room-102",
          roomNumber: "102",
          hotelId,
          roomTypeId: deluxeLocalId,
          type: "Deluxe King",
          status: RoomStatus.AVAILABLE,
          price: null,
          floor: null,
          room: null,
        });

      await service.processSingleRevision(sampleMultiRoomRevision);

      const expectedGroupCode = `CHANNEX:${sampleMultiRoomRevision.attributes.booking_id}`;

      const firstResData = prisma.reservation.create.mock.calls[0][0].data;
      const secondResData = prisma.reservation.create.mock.calls[1][0].data;

      expect(firstResData.groupCode).toBe(expectedGroupCode);
      expect(secondResData.groupCode).toBe(expectedGroupCode);
      expect(firstResData.groupCode).toBe(secondResData.groupCode);

      // Verify mapping metadata stores shared groupCode
      expect(prisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              groupCode: expectedGroupCode,
            }),
          }),
        }),
      );
    });

    it("assigns groupCode for single-room reservation as well", async () => {
      allocationService.allocateRoom.mockResolvedValueOnce({
        id: "room-101",
        roomId: "room-101",
        roomNumber: "101",
        hotelId,
        roomTypeId: deluxeLocalId,
        type: "Deluxe King",
        status: RoomStatus.AVAILABLE,
        price: null,
        floor: null,
        room: null,
      });

      await service.processSingleRevision(sampleSingleRoomRevision);

      const expectedGroupCode = `CHANNEX:${sampleSingleRoomRevision.attributes.booking_id}`;
      const resData = prisma.reservation.create.mock.calls[0][0].data;
      expect(resData.groupCode).toBe(expectedGroupCode);
    });
  });

  describe("3. Overdue active stay excluded & capacity fallback", () => {
    it("excludes rooms with overdue active stays from auto-assignment, selecting next room", async () => {
      // First attempt for room 101 encounters overdue stay in allocation service
      // Allocation policy skips 101 and returns 102
      allocationService.allocateRoom.mockResolvedValueOnce({
        id: "room-102",
        roomId: "room-102",
        roomNumber: "102",
        hotelId,
        roomTypeId: deluxeLocalId,
        type: "Deluxe King",
        status: RoomStatus.AVAILABLE,
        price: null,
        floor: null,
        room: null,
      });

      const outcome = await service.processSingleRevision(sampleSingleRoomRevision);

      expect(outcome.action).toBe("CREATED");
      const resData = prisma.reservation.create.mock.calls[0][0].data;
      expect(resData.roomId).toBe("room-102");
      expect(resData.roomId).not.toBe("room-101");
    });

    it("persists valid unassigned reservation when allocation throws due to overdue stay and no alternate room", async () => {
      allocationService.allocateRoom.mockRejectedValueOnce(
        new ConflictException("ROOM_OVERDUE_STAY_CONFLICT"),
      );

      const outcome = await service.processSingleRevision(sampleSingleRoomRevision);

      expect(outcome.action).toBe("CREATED");
      const resData = prisma.reservation.create.mock.calls[0][0].data;
      expect(resData.roomId).toBeNull();
      expect(resData.assignedAt).toBeNull();
      expect(resData.status).toBe(ReservationStatus.CONFIRMED);

      // Verify revision is still acknowledged because reservation was safely persisted in PMS
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-single-1", undefined);
      expect(prisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              requiresRoomAssignment: true,
              assignmentSummary: expect.objectContaining({
                totalSegments: 1,
                assignedCount: 0,
                unassignedCount: 1,
                allAssigned: false,
              }),
            }),
          }),
        }),
      );
    });
  });

  describe("4. Future departure allows later assignment over [checkIn, checkOut)", () => {
    it("passes exact checkInAt/checkOutAt interval to allocation policy so future departure allows assignment", async () => {
      allocationService.allocateRoom.mockResolvedValueOnce({
        id: "room-101",
        roomId: "room-101",
        roomNumber: "101",
        hotelId,
        roomTypeId: deluxeLocalId,
        type: "Deluxe King",
        status: RoomStatus.AVAILABLE,
        price: null,
        floor: null,
        room: null,
      });

      await service.processSingleRevision(sampleSingleRoomRevision);

      const allocCall = (allocationService.allocateRoom as jest.Mock).mock
        .calls[0][1] as AllocateRoomInput;
      expect(allocCall.checkInAt).toBeInstanceOf(Date);
      expect(allocCall.checkOutAt).toBeInstanceOf(Date);
      expect(allocCall.checkInAt!.getTime()).toBeLessThan(allocCall.checkOutAt!.getTime());
      expect(allocCall.interval).toEqual({
        checkInAt: allocCall.checkInAt,
        checkOutAt: allocCall.checkOutAt,
      });
    });
  });

  describe("5. Concurrency handling & double-claim prevention", () => {
    it("retries on serialization conflict error and successfully persists on subsequent attempt", async () => {
      let attempts = 0;
      prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<any>) => {
        attempts++;
        if (attempts === 1) {
          const conflict = new ConflictException(
            "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT",
          );
          throw conflict;
        }
        return fn(prisma);
      });

      allocationService.allocateRoom.mockResolvedValueOnce({
        id: "room-101",
        roomId: "room-101",
        roomNumber: "101",
        hotelId,
        roomTypeId: deluxeLocalId,
        type: "Deluxe King",
        status: RoomStatus.AVAILABLE,
        price: null,
        floor: null,
        room: null,
      });

      const outcome = await service.processSingleRevision(sampleSingleRoomRevision);

      expect(attempts).toBe(2);
      expect(outcome.action).toBe("CREATED");
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-single-1", undefined);
    });
  });

  describe("6. Insufficient capacity persists valid unassigned reservations plus metadata", () => {
    it("persists valid reservations unassigned when safe capacity is insufficient across multi-segment booking", async () => {
      // Segment 1 gets room 101, Segment 2 has no room available
      allocationService.allocateRoom
        .mockResolvedValueOnce({
          id: "room-101",
          roomId: "room-101",
          roomNumber: "101",
          hotelId,
          roomTypeId: deluxeLocalId,
          type: "Deluxe King",
          status: RoomStatus.AVAILABLE,
          price: null,
          floor: null,
          room: null,
        })
        .mockRejectedValueOnce(new ConflictException("NO_AVAILABLE_ROOM"));

      const outcome = await service.processSingleRevision(sampleMultiRoomRevision);

      expect(outcome.action).toBe("CREATED");
      expect(prisma.reservation.create).toHaveBeenCalledTimes(2);

      const firstResData = prisma.reservation.create.mock.calls[0][0].data;
      const secondResData = prisma.reservation.create.mock.calls[1][0].data;

      expect(firstResData.roomId).toBe("room-101");
      expect(secondResData.roomId).toBeNull();
      expect(secondResData.status).toBe(ReservationStatus.CONFIRMED);
      expect(secondResData.groupCode).toBe(
        `CHANNEX:${sampleMultiRoomRevision.attributes.booking_id}`,
      );

      // Verify mapping metadata notes incomplete assignment
      expect(prisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              requiresRoomAssignment: true,
              assignmentSummary: {
                totalSegments: 2,
                assignedCount: 1,
                unassignedCount: 1,
                assignedRooms: ["101"],
                allAssigned: false,
              },
            }),
          }),
        }),
      );

      // Revision MUST be acknowledged because all valid reservations were persisted
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-multi-1", undefined);
    });
  });

  describe("7. Idempotency: dedup, revision re-processing, and cancellation", () => {
    it("deduplicates already ingested booking revision idempotently and ACKs", async () => {
      prisma.channexMapping.findFirst.mockImplementation(async ({ where }: { where: any }) => {
        if (where.kind === "property") return { hotelId };
        if (where.kind === "booking") {
          return {
            localId: "existing-res-id",
            hotelId,
            channexId: sampleSingleRoomRevision.attributes.booking_id,
          };
        }
        return null;
      });

      const outcome = await service.processSingleRevision(sampleSingleRoomRevision);

      expect(outcome.action).toBe("DEDUPLICATED");
      expect(outcome.reservationId).toBe("existing-res-id");
      expect(prisma.reservation.create).not.toHaveBeenCalled();
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-single-1", undefined);
    });

    it("cancels all reservations of an OTA booking and pushes ARI availability", async () => {
      const cancelRevision: ChannexRevisionItem = {
        id: "rev-cancel-1",
        type: "booking_revision",
        attributes: {
          booking_id: "book-uuid-multi",
          property_id: propertyChannexId,
          status: "cancelled",
          arrival_date: "2026-11-01",
          departure_date: "2026-11-05",
          amount: "5000000",
          currency: "VND",
        },
      };

      prisma.channexMapping.findFirst.mockImplementation(async ({ where }: { where: any }) => {
        if (where.kind === "property") return { hotelId };
        if (where.kind === "booking") {
          return {
            localId: "res-1",
            hotelId,
            channexId: "book-uuid-multi",
            metadata: {
              reservationIds: ["res-1", "res-2"],
              otaReservationCode: "AG-998877",
            },
          };
        }
        return null;
      });

      const outcome = await service.processSingleRevision(cancelRevision);

      expect(outcome.action).toBe("CANCELLED");
      expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["res-1", "res-2"] },
          hotelId,
          status: { not: ReservationStatus.CHECKED_IN },
        },
        data: { status: ReservationStatus.CANCELLED },
      });
      expect(ariSyncService.pushAri).toHaveBeenCalledWith(hotelId, { availabilityOnly: true });
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-cancel-1", undefined);
    });

    it("re-processing cancellation is idempotent", async () => {
      const cancelRevision: ChannexRevisionItem = {
        id: "rev-cancel-2",
        type: "booking_revision",
        attributes: {
          booking_id: "book-uuid-multi",
          property_id: propertyChannexId,
          status: "cancelled",
          arrival_date: "2026-11-01",
          departure_date: "2026-11-05",
          amount: "5000000",
          currency: "VND",
        },
      };

      prisma.channexMapping.findFirst.mockImplementation(async ({ where }: { where: any }) => {
        if (where.kind === "property") return { hotelId };
        if (where.kind === "booking") {
          return {
            localId: "res-1",
            hotelId,
            channexId: "book-uuid-multi",
            metadata: {
              reservationIds: ["res-1", "res-2"],
              otaReservationCode: "AG-998877",
            },
          };
        }
        return null;
      });

      const outcome = await service.processSingleRevision(cancelRevision);
      expect(outcome.action).toBe("CANCELLED");
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-cancel-2", undefined);
    });
  });

  describe("8. Adapter / wiring gap isolation", () => {
    it("safely persists reservations unassigned without crashing when roomAllocationService is undefined", async () => {
      const unassignedService = new ChannexBookingIngestionService(
        prisma,
        channexClient,
        ariSyncService,
        undefined, // simulates runtime before Lane A2 is merged
      );

      const outcome = await unassignedService.processSingleRevision(sampleMultiRoomRevision);

      expect(outcome.action).toBe("CREATED");
      expect(prisma.reservation.create).toHaveBeenCalledTimes(2);

      const firstResData = prisma.reservation.create.mock.calls[0][0].data;
      const secondResData = prisma.reservation.create.mock.calls[1][0].data;

      expect(firstResData.roomId).toBeNull();
      expect(secondResData.roomId).toBeNull();
      expect(firstResData.groupCode).toBe(
        `CHANNEX:${sampleMultiRoomRevision.attributes.booking_id}`,
      );
      expect(secondResData.groupCode).toBe(
        `CHANNEX:${sampleMultiRoomRevision.attributes.booking_id}`,
      );

      expect(prisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              requiresRoomAssignment: true,
              assignmentSummary: {
                totalSegments: 2,
                assignedCount: 0,
                unassignedCount: 2,
                assignedRooms: [],
                allAssigned: false,
              },
            }),
          }),
        }),
      );
      expect(channexClient.ackBookingRevision).toHaveBeenCalledWith("rev-multi-1", undefined);
    });
  });

  describe("9. Fail-close semantics: no ACK on unpersisted failure", () => {
    it("does not call ackBookingRevision when database transaction throws an unhandled error", async () => {
      prisma.$transaction = jest.fn().mockRejectedValueOnce(new Error("Fatal database crash"));

      await expect(service.processSingleRevision(sampleSingleRoomRevision)).rejects.toThrow(
        "Fatal database crash",
      );

      expect(channexClient.ackBookingRevision).not.toHaveBeenCalled();
    });
  });

  describe("10. Case-insensitive room-type collision resolution in simulateOtaBooking", () => {
    beforeEach(() => {
      prisma.hotel.findUnique.mockResolvedValue({ id: hotelId, rooms: [] });
      prisma.channexMapping.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.hotelId_kind_localId?.kind === "property") {
          return { hotelId, kind: "property", localId: hotelId, channexId: propertyChannexId };
        }
        return null;
      });
      channexClient.getBookingFeed.mockResolvedValue({ data: [] });
    });

    it("prioritizes exact-case match over first-in-list case-insensitive collision and does not silently select wrong mapping", async () => {
      // Mapping 1 is lowercase "deluxe" (first in array)
      // Mapping 2 is uppercase "DELUXE" (second in array)
      const mappings = [
        { id: "m-1", hotelId, kind: "room_type", localId: "deluxe", channexId: "chx-deluxe-lower" },
        { id: "m-2", hotelId, kind: "room_type", localId: "DELUXE", channexId: "chx-deluxe-upper" },
      ];
      prisma.channexMapping.findMany.mockResolvedValue(mappings);
      prisma.channexMapping.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.kind === "property") return { hotelId };
        if (where.kind === "booking") return null;
        if (where.kind === "room_type") {
          return mappings.find((m) => m.channexId === where.channexId) ?? null;
        }
        return null;
      });
      prisma.roomType.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.id === "DELUXE" || where.name === "DELUXE") {
          return { id: "DELUXE", name: "DELUXE" };
        }
        if (where.id === "deluxe" || where.name === "deluxe") {
          return { id: "deluxe", name: "deluxe" };
        }
        return null;
      });
      prisma.roomType.findMany.mockResolvedValue([
        { id: "deluxe", name: "deluxe", normalizedKey: "deluxe", basePrice: 1000000 },
        { id: "DELUXE", name: "DELUXE", normalizedKey: "deluxe", basePrice: 2000000 },
      ]);

      const res = await service.simulateOtaBooking(hotelId, {
        otaName: "Agoda",
        roomType: "DELUXE",
      });

      expect(res.success).toBe(true);
      expect(res.roomType).toBe("DELUXE");
      // Reservation created with DELUXE snapshot and basePrice * 2 = 4000000
      expect(res.amount).toBe(4000000);
      expect(prisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomTypeSnapshot: "DELUXE",
          }),
        }),
      );
    });

    it("rejects with BadRequestException when multiple mappings collide case-insensitively without unique exact match", async () => {
      // Catalog has "Deluxe" and "DELUXE"
      prisma.channexMapping.findMany.mockResolvedValue([
        { id: "m-1", hotelId, kind: "room_type", localId: "rt-1", channexId: "chx-1" },
        { id: "m-2", hotelId, kind: "room_type", localId: "rt-2", channexId: "chx-2" },
      ]);
      prisma.roomType.findMany.mockResolvedValue([
        { id: "rt-1", name: "Deluxe", normalizedKey: "deluxe", basePrice: 1000000 },
        { id: "rt-2", name: "DELUXE", normalizedKey: "deluxe", basePrice: 2000000 },
      ]);

      // Caller requests "DeLuXe" which matches both case-insensitively, but neither exactly
      await expect(
        service.simulateOtaBooking(hotelId, {
          otaName: "Agoda",
          roomType: "DeLuXe",
        }),
      ).rejects.toThrow("Phát hiện xung đột hạng phòng (case-insensitive collision)");
    });
  });
});
