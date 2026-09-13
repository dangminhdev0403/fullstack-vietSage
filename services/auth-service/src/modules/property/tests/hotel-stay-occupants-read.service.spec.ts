import { CitizenshipKind, GuestStayStatus } from "@prisma/client";
import { HotelStayOccupantsReadService } from "../application/hotel-stay-occupants-read.service";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";
import { updateStayBodySchema } from "../domain/schemas/rooms.schema";

describe("HotelStayOccupantsReadService & Repository (AGY-10/AGY-11 KBTT Foundation)", () => {
  const mockHotelId = "hotel-viet-01";
  const otherHotelId = "hotel-other-99";

  const now = new Date("2026-09-13T10:00:00.000Z");
  const checkInTime = new Date("2026-09-13T07:00:00.000Z");
  const checkOutTime = new Date("2026-09-15T05:00:00.000Z");

  describe("HotelStayOccupantsReadService", () => {
    let mockRepo: jest.Mocked<Partial<HotelRoomsRepository>>;
    let service: HotelStayOccupantsReadService;

    beforeEach(() => {
      mockRepo = {
        findActiveStayOccupantsByHotel: jest.fn(),
      };
      service = new HotelStayOccupantsReadService(mockRepo as unknown as HotelRoomsRepository);
    });

    it("returns empty array when hotelId is missing, empty, or whitespace", async () => {
      expect(await service.getActiveStayOccupants("")).toEqual([]);
      expect(await service.getActiveStayOccupants("   ")).toEqual([]);
      expect(await service.getActiveStayOccupants(null as unknown as string)).toEqual([]);
      expect(await service.getActiveStayOccupants(undefined as unknown as string)).toEqual([]);
      expect(mockRepo.findActiveStayOccupantsByHotel).not.toHaveBeenCalled();
    });

    it("returns mixed primary and co-guests in one active stay, each exactly once", async () => {
      const mockDbRows = [
        {
          id: "occ-primary-01",
          stayId: "stay-active-01",
          hotelId: mockHotelId,
          fullName: "Nguyen Van A",
          phone: "0901234567",
          identityNumber: "001090012345",
          dateOfBirth: "1990-01-01",
          gender: "M",
          nationality: "Vietnamese",
          residencePlace: "123 Le Loi, Da Nang",
          isPrimary: true,
          citizenshipKind: CitizenshipKind.VIETNAMESE,
          createdAt: new Date("2026-09-13T07:00:00.000Z"),
          updatedAt: new Date("2026-09-13T07:00:00.000Z"),
          stay: {
            id: "stay-active-01",
            hotelId: mockHotelId,
            roomId: "room-101",
            reservationCode: "RES-101",
            status: GuestStayStatus.ACTIVE,
            plannedCheckInAt: checkInTime,
            plannedCheckOutAt: checkOutTime,
            checkedInAt: checkInTime,
            room: {
              id: "room-101",
              roomNumber: "101",
            },
          },
        },
        {
          id: "occ-co-guest-02",
          stayId: "stay-active-01",
          hotelId: mockHotelId,
          fullName: "John Doe",
          phone: null,
          identityNumber: "P12345678",
          dateOfBirth: "1988-05-12",
          gender: "M",
          nationality: "American",
          residencePlace: null,
          isPrimary: false,
          citizenshipKind: CitizenshipKind.FOREIGN,
          createdAt: new Date("2026-09-13T07:05:00.000Z"),
          updatedAt: new Date("2026-09-13T07:05:00.000Z"),
          stay: {
            id: "stay-active-01",
            hotelId: mockHotelId,
            roomId: "room-101",
            reservationCode: "RES-101",
            status: GuestStayStatus.ACTIVE,
            plannedCheckInAt: checkInTime,
            plannedCheckOutAt: checkOutTime,
            checkedInAt: checkInTime,
            room: {
              id: "room-101",
              roomNumber: "101",
            },
          },
        },
      ];

      (mockRepo.findActiveStayOccupantsByHotel as jest.Mock).mockResolvedValue(mockDbRows);

      const result = await service.getActiveStayOccupants(`  ${mockHotelId}  `);

      expect(mockRepo.findActiveStayOccupantsByHotel).toHaveBeenCalledWith(mockHotelId);
      expect(result).toHaveLength(2);

      // Verify primary guest
      expect(result[0]).toEqual({
        id: "occ-primary-01",
        occupantId: "occ-primary-01",
        stayId: "stay-active-01",
        hotelId: mockHotelId,
        roomId: "room-101",
        roomNumber: "101",
        isPrimary: true,
        fullName: "Nguyen Van A",
        phone: "0901234567",
        identityNumber: "001090012345",
        dateOfBirth: "1990-01-01",
        gender: "M",
        nationality: "Vietnamese",
        residencePlace: "123 Le Loi, Da Nang",
        citizenshipKind: CitizenshipKind.VIETNAMESE,
        plannedCheckInAt: checkInTime,
        plannedCheckOutAt: checkOutTime,
        checkedInAt: checkInTime,
        stayStatus: GuestStayStatus.ACTIVE,
        reservationCode: "RES-101",
        createdAt: new Date("2026-09-13T07:00:00.000Z"),
        updatedAt: new Date("2026-09-13T07:00:00.000Z"),
      });

      // Verify co-guest
      expect(result[1]).toEqual({
        id: "occ-co-guest-02",
        occupantId: "occ-co-guest-02",
        stayId: "stay-active-01",
        hotelId: mockHotelId,
        roomId: "room-101",
        roomNumber: "101",
        isPrimary: false,
        fullName: "John Doe",
        phone: null,
        identityNumber: "P12345678",
        dateOfBirth: "1988-05-12",
        gender: "M",
        nationality: "American",
        residencePlace: null,
        citizenshipKind: CitizenshipKind.FOREIGN,
        plannedCheckInAt: checkInTime,
        plannedCheckOutAt: checkOutTime,
        checkedInAt: checkInTime,
        stayStatus: GuestStayStatus.ACTIVE,
        reservationCode: "RES-101",
        createdAt: new Date("2026-09-13T07:05:00.000Z"),
        updatedAt: new Date("2026-09-13T07:05:00.000Z"),
      });
    });

    it("leaves legacy rows with null citizenshipKind and does not apply backfill heuristics", async () => {
      const mockDbRows = [
        {
          id: "occ-legacy-01",
          stayId: "stay-active-02",
          hotelId: mockHotelId,
          fullName: "Le Thi C",
          phone: "0987654321",
          identityNumber: "012345678901",
          dateOfBirth: "1995-03-15",
          gender: "F",
          nationality: "Việt Nam", // Free-text nationality string
          residencePlace: "Hanoi",
          isPrimary: true,
          citizenshipKind: null, // Legacy row: null
          createdAt: now,
          updatedAt: now,
          stay: {
            id: "stay-active-02",
            hotelId: mockHotelId,
            roomId: "room-202",
            reservationCode: "RES-202",
            status: GuestStayStatus.ACTIVE,
            plannedCheckInAt: checkInTime,
            plannedCheckOutAt: checkOutTime,
            checkedInAt: checkInTime,
            room: { id: "room-202", roomNumber: "202" },
          },
        },
      ];

      (mockRepo.findActiveStayOccupantsByHotel as jest.Mock).mockResolvedValue(mockDbRows);

      const result = await service.getActiveStayOccupants(mockHotelId);

      expect(result).toHaveLength(1);
      // citizenshipKind must remain strictly null - never guessed from nationality or identity length
      expect(result[0].citizenshipKind).toBeNull();
      expect(result[0].nationality).toBe("Việt Nam");
    });

    it("listActiveStayOccupants delegates to getActiveStayOccupants", async () => {
      const spy = jest.spyOn(service, "getActiveStayOccupants").mockResolvedValue([]);
      const res = await service.listActiveStayOccupants(mockHotelId);
      expect(spy).toHaveBeenCalledWith(mockHotelId);
      expect(res).toEqual([]);
    });

    it("does not expose provider-specific draft fields on the read model", async () => {
      const mockDbRows = [
        {
          id: "occ-01",
          stayId: "stay-01",
          hotelId: mockHotelId,
          fullName: "Tran Van D",
          phone: null,
          identityNumber: "123456789",
          dateOfBirth: "1992-02-02",
          gender: "M",
          nationality: null,
          residencePlace: null,
          isPrimary: true,
          citizenshipKind: CitizenshipKind.VIETNAMESE,
          createdAt: now,
          updatedAt: now,
          stay: {
            id: "stay-01",
            hotelId: mockHotelId,
            roomId: "room-103",
            reservationCode: "RES-103",
            status: GuestStayStatus.ACTIVE,
            plannedCheckInAt: checkInTime,
            plannedCheckOutAt: checkOutTime,
            checkedInAt: checkInTime,
            room: { id: "room-103", roomNumber: "103" },
          },
        },
      ];

      (mockRepo.findActiveStayOccupantsByHotel as jest.Mock).mockResolvedValue(mockDbRows);

      const result = await service.getActiveStayOccupants(mockHotelId);
      const row = result[0] as Record<string, unknown>;

      // Explicitly verify provider-specific draft fields are NOT present
      expect(row.lyDoCuTru).toBeUndefined();
      expect(row.loaiGiayTo).toBeUndefined();
      expect(row.maQT).toBeUndefined();
      expect(row.maTT).toBeUndefined();
      expect(row.soHoChieu).toBeUndefined();
      expect(row.thoiHanTamTruStr).toBeUndefined();
      expect(row.providerStatus).toBeUndefined();
    });
  });

  describe("HotelRoomsRepository.findActiveStayOccupantsByHotel query construction", () => {
    it("builds hotel-scoped, active-status, and deterministically ordered Prisma query", async () => {
      const mockPrisma = {
        guestStayOccupant: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const repository = new HotelRoomsRepository(mockPrisma as any);
      await repository.findActiveStayOccupantsByHotel(mockHotelId);

      expect(mockPrisma.guestStayOccupant.findMany).toHaveBeenCalledTimes(1);

      const callArgs = mockPrisma.guestStayOccupant.findMany.mock.calls[0][0];

      // 1. Hotel-scoped on occupant and stay
      expect(callArgs.where.hotelId).toBe(mockHotelId);
      expect(callArgs.where.stay.hotelId).toBe(mockHotelId);

      // 2. Exclude checked-out/cancelled/reserved stays - only active checked-in stays
      expect(callArgs.where.stay.status.in).toEqual([
        GuestStayStatus.ACTIVE,
        GuestStayStatus.CHECKED_IN,
        GuestStayStatus.CHECKOUT_PENDING,
      ]);
      expect(callArgs.where.stay.status.in).not.toContain(GuestStayStatus.CHECKED_OUT);
      expect(callArgs.where.stay.status.in).not.toContain(GuestStayStatus.RESERVED);
      expect(callArgs.where.stay.status.in).not.toContain(GuestStayStatus.CANCELLED);

      // 3. Deterministic ordering: room number asc, stayId asc, isPrimary desc, createdAt asc, id asc
      expect(callArgs.orderBy).toEqual([
        { stay: { room: { roomNumber: "asc" } } },
        { stayId: "asc" },
        { isPrimary: "desc" },
        { createdAt: "asc" },
        { id: "asc" },
      ]);

      // 4. Room number included
      expect(callArgs.include.stay.select.room.select.roomNumber).toBe(true);
    });

    it("excludes occupants from another hotel due to where clause filtering", async () => {
      const mockPrisma = {
        guestStayOccupant: {
          findMany: jest.fn().mockImplementation((args: any) => {
            // Simulate DB filtering
            if (args.where.hotelId === mockHotelId) {
              return [
                {
                  id: "occ-hotel-1",
                  stayId: "stay-1",
                  hotelId: mockHotelId,
                  fullName: "Guest In Target Hotel",
                  isPrimary: true,
                  stay: {
                    id: "stay-1",
                    hotelId: mockHotelId,
                    roomId: "r-1",
                    room: { id: "r-1", roomNumber: "101" },
                  },
                },
              ];
            }
            return [];
          }),
        },
      };

      const repository = new HotelRoomsRepository(mockPrisma as any);

      const targetResults = await repository.findActiveStayOccupantsByHotel(mockHotelId);
      expect(targetResults).toHaveLength(1);
      expect(targetResults[0].hotelId).toBe(mockHotelId);

      const otherResults = await repository.findActiveStayOccupantsByHotel(otherHotelId);
      expect(otherResults).toHaveLength(0);
    });
  });

  describe("AGY-12: Preserve Primary Occupant Consistency", () => {
    it("rejects an occupants payload in updateStayBodySchema", () => {
      const payloadWithOccupants = {
        guestDisplayName: "Updated Guest Name",
        occupants: [
          {
            fullName: "Co Guest",
            isPrimary: false,
          },
        ],
      };

      const result = updateStayBodySchema.safeParse(payloadWithOccupants);
      expect(result.success).toBe(false);
      if (!result.success) {
        const hasOccupantsError = result.error.issues.some(
          (issue) =>
            (issue as any).keys?.includes("occupants") || issue.message.includes("occupants"),
        );
        expect(hasOccupantsError).toBe(true);
      }

      // Valid payload without occupants succeeds
      const validPayload = {
        guestDisplayName: "Updated Guest Name",
        guestPhone: "0901234567",
        plannedCheckOutAt: new Date("2026-09-18T10:00:00.000Z"),
      };
      const validResult = updateStayBodySchema.safeParse(validPayload);
      expect(validResult.success).toBe(true);
    });

    it("performs zero occupant operations when only planned checkout changes", async () => {
      const existingStay = {
        id: "stay-update-1",
        hotelId: mockHotelId,
        guestDisplayName: "Original Primary",
        guestPhone: "0900000001",
      };

      const mockTx = {
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(existingStay),
          update: jest.fn().mockResolvedValue({ id: "stay-update-1" }),
        },
        guestStayOccupant: {
          updateMany: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockTx)),
      };

      const repository = new HotelRoomsRepository(mockPrisma as any);

      await repository.updateStay(mockHotelId, "stay-update-1", {
        plannedCheckOutAt: new Date("2026-09-18T10:00:00.000Z"),
      });

      expect(mockTx.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "stay-update-1" },
          data: {
            plannedCheckOutAt: new Date("2026-09-18T10:00:00.000Z"),
          },
        }),
      );

      // Crucial check: zero occupant operation when only plannedCheckOutAt changes
      expect(mockTx.guestStayOccupant.updateMany).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.findMany).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.findFirst).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.update).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.create).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.deleteMany).not.toHaveBeenCalled();
    });

    it("updates matching primary occupant using (hotelId, stayId, isPrimary: true) when name or phone changes", async () => {
      const existingStay = {
        id: "stay-update-2",
        hotelId: mockHotelId,
        guestDisplayName: "Original Primary",
        guestPhone: "0900000001",
      };

      const mockTx = {
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(existingStay),
          update: jest.fn().mockResolvedValue({ id: "stay-update-2" }),
        },
        guestStayOccupant: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockTx)),
      };

      const repository = new HotelRoomsRepository(mockPrisma as any);

      await repository.updateStay(mockHotelId, "stay-update-2", {
        guestDisplayName: "  Updated Primary Name  ",
        guestPhone: "0900000099",
      });

      // Stay attributes must be updated
      expect(mockTx.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "stay-update-2" },
          data: {
            guestDisplayName: "  Updated Primary Name  ",
            guestPhone: "0900000099",
          },
        }),
      );

      // Primary occupant must be updated via updateMany targeting only (hotelId, stayId, isPrimary: true)
      expect(mockTx.guestStayOccupant.updateMany).toHaveBeenCalledWith({
        where: {
          hotelId: mockHotelId,
          stayId: "stay-update-2",
          isPrimary: true,
        },
        data: {
          fullName: "Updated Primary Name",
          phone: "0900000099",
        },
      });

      // No heuristic find, create, or delete
      expect(mockTx.guestStayOccupant.findMany).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.findFirst).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.update).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.create).not.toHaveBeenCalled();
      expect(mockTx.guestStayOccupant.deleteMany).not.toHaveBeenCalled();
    });
  });
});
