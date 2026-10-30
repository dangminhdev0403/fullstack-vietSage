process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "8080";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/vietsage_auth";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "replace-with-local-docker-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "replace-with-local-docker-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, ReservationStatus } from "@prisma/client";
import { ReservationsService } from "../application/reservations.service";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";

describe("Group Reservations Service & Repository (Lane A)", () => {
  describe("ReservationsService group reservation endpoints", () => {
    function createService(repositoryOverrides: Record<string, jest.Mock> = {}) {
      const repository = {
        findGroupByCode: jest.fn(),
        updateGroupByCode: jest.fn(),
        ...repositoryOverrides,
      };

      const accessService = {
        assertHotelAccess: jest.fn().mockImplementation((actorUserId, activeRoleId, hotelId) => {
          if (hotelId === "hotel-forbidden") {
            throw new ForbiddenException("Không có quyền truy cập khách sạn này");
          }
          return Promise.resolve({
            id: hotelId,
            tenantId: "tenant-1",
            timezone: "Asia/Ho_Chi_Minh",
          });
        }),
        resolveRoomScope: jest
          .fn()
          .mockImplementation(async (actorUserId, activeRoleId, hotelId) => {
            const hotel = await accessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
            return {
              hotel,
              allowedRoomId: null,
              mode: "HOTEL_WIDE" as const,
            };
          }),
        assertRoomAccess: jest.fn().mockImplementation((scope, roomId) => {
          if (
            typeof scope === "object" &&
            scope !== null &&
            scope.allowedRoomId !== null &&
            scope.allowedRoomId !== roomId
          ) {
            throw new NotFoundException("Không tìm thấy phòng");
          }
        }),
      };

      const codesService = {
        generateEntityCode: jest.fn().mockResolvedValue("VSH_RES_0001"),
      };

      const service = new ReservationsService(
        repository as unknown as ReservationsRepository,
        codesService as never,
        accessService as never,
      );

      return { service, repository, accessService };
    }

    it("lấy danh sách phòng theo groupCode hợp lệ và tổng hợp số liệu chính xác", async () => {
      const mockGroupDetail = {
        groupCode: "GRP-2026-001",
        groupName: "Đoàn Hội thảo VietSage",
        leadGuestName: "Nguyễn Văn Trưởng",
        leadGuestPhone: "0909123456",
        notes: "Cần hóa đơn VAT công ty",
        sourceCategory: "DIRECT",
        sourcePartnerId: null,
        sourcePartnerName: null,
        totalRooms: 3,
        checkedInRooms: 1,
        arrivingRooms: 2,
        totalEstimatedAmount: 6000000,
        reservations: [
          {
            id: "res-1",
            reservationCode: "VSH_RES_001",
            roomId: "room-101",
            roomNumber: "101",
            roomName: "P.101",
            roomTypeId: "rt-deluxe",
            roomTypeName: "Deluxe King",
            roomTypeCode: "deluxe-king",
            guestDisplayName: "Nguyễn Văn Trưởng",
            guestPhone: "0909123456",
            status: ReservationStatus.CHECKED_IN,
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
            nightlyRateSnapshot: "1000000.00",
            baseNightlyRateSnapshot: "1000000.00",
            guestCount: 2,
            notes: "Phòng trưởng đoàn",
            nights: 2,
            estimatedAmount: 2000000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "res-2",
            reservationCode: "VSH_RES_002",
            roomId: "room-102",
            roomNumber: "102",
            roomName: "P.102",
            roomTypeId: "rt-deluxe",
            roomTypeName: "Deluxe King",
            roomTypeCode: "deluxe-king",
            guestDisplayName: "Trần Thị Lan",
            guestPhone: "0909654321",
            status: ReservationStatus.ARRIVAL_READY,
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
            nightlyRateSnapshot: "1000000.00",
            baseNightlyRateSnapshot: "1000000.00",
            guestCount: 2,
            notes: null,
            nights: 2,
            estimatedAmount: 2000000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "res-3",
            reservationCode: "VSH_RES_003",
            roomId: "room-103",
            roomNumber: "103",
            roomName: "P.103",
            roomTypeId: "rt-deluxe",
            roomTypeName: "Deluxe King",
            roomTypeCode: "deluxe-king",
            guestDisplayName: "Lê Văn Hùng",
            guestPhone: "0909888999",
            status: ReservationStatus.CONFIRMED,
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
            nightlyRateSnapshot: "1000000.00",
            baseNightlyRateSnapshot: "1000000.00",
            guestCount: 1,
            notes: null,
            nights: 2,
            estimatedAmount: 2000000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { service, repository, accessService } = createService({
        findGroupByCode: jest.fn().mockResolvedValue(mockGroupDetail),
      });

      const result = await service.getGroupReservation(
        "actor-1",
        "role-reception",
        "hotel-1",
        "GRP-2026-001",
      );

      expect(accessService.assertHotelAccess).toHaveBeenCalledWith(
        "actor-1",
        "role-reception",
        "hotel-1",
      );
      expect(repository.findGroupByCode).toHaveBeenCalledWith("hotel-1", "GRP-2026-001");
      expect(result.groupCode).toBe("GRP-2026-001");
      expect(result.leadGuestName).toBe("Nguyễn Văn Trưởng");
      expect(result.totalRooms).toBe(3);
      expect(result.checkedInRooms).toBe(1);
      expect(result.arrivingRooms).toBe(2);
      expect(result.totalEstimatedAmount).toBe(6000000);
      expect(result.reservations).toHaveLength(3);
      expect(result.reservations[0].roomNumber).toBe("101");
    });

    it("trả về 404 khi không tìm thấy đoàn", async () => {
      const { service, repository } = createService({
        findGroupByCode: jest
          .fn()
          .mockRejectedValue(
            new NotFoundException("Không tìm thấy thông tin đoàn với mã NON_EXISTENT"),
          ),
      });

      await expect(
        service.getGroupReservation("actor-1", "role-reception", "hotel-1", "NON_EXISTENT"),
      ).rejects.toThrow(NotFoundException);

      expect(repository.findGroupByCode).toHaveBeenCalledWith("hotel-1", "NON_EXISTENT");
    });

    it("phân quyền đúng hotelId (không lộ dữ liệu đoàn của hotel khác)", async () => {
      const { service, repository, accessService } = createService();

      // Trường hợp 1: actor không có quyền truy cập hotel -> bị chặn ngay tại access check
      await expect(
        service.getGroupReservation("actor-1", "role-reception", "hotel-forbidden", "GRP-001"),
      ).rejects.toThrow(ForbiddenException);

      expect(accessService.assertHotelAccess).toHaveBeenCalledWith(
        "actor-1",
        "role-reception",
        "hotel-forbidden",
      );
      expect(repository.findGroupByCode).not.toHaveBeenCalled();

      // Trường hợp 2: đảm bảo query gọi xuống repository luôn mang đúng hotelId đã xác thực
      const mockResult = { groupCode: "GRP-001", reservations: [] };
      repository.findGroupByCode.mockResolvedValueOnce(mockResult);

      await service.getGroupReservation("actor-1", "role-reception", "hotel-1", "GRP-001");
      expect(repository.findGroupByCode).toHaveBeenCalledWith("hotel-1", "GRP-001");
      expect(repository.findGroupByCode).not.toHaveBeenCalledWith("hotel-2", expect.anything());
    });

    it("cập nhật thông tin đoàn an toàn", async () => {
      const updatedMock = {
        groupCode: "GRP-001",
        groupName: "Tập đoàn ABC Mới",
        leadGuestName: "Trần Văn Mới",
        leadGuestPhone: "0911000999",
        notes: "Ghi chú đã cập nhật",
        totalRooms: 2,
        checkedInRooms: 0,
        arrivingRooms: 2,
        totalEstimatedAmount: 4000000,
        reservations: [],
      };

      const { service, repository, accessService } = createService({
        updateGroupByCode: jest.fn().mockResolvedValue(updatedMock),
      });

      const updateDto = {
        groupName: "Tập đoàn ABC Mới",
        leadGuestName: "Trần Văn Mới",
        leadGuestPhone: "0911000999",
        notes: "Ghi chú đã cập nhật",
      };

      const result = await service.updateGroupReservation(
        "actor-1",
        "role-reception",
        "hotel-1",
        "GRP-001",
        updateDto,
      );

      expect(accessService.assertHotelAccess).toHaveBeenCalledWith(
        "actor-1",
        "role-reception",
        "hotel-1",
      );
      expect(repository.updateGroupByCode).toHaveBeenCalledWith("hotel-1", "GRP-001", updateDto);
      expect(result.groupName).toBe("Tập đoàn ABC Mới");
      expect(result.leadGuestName).toBe("Trần Văn Mới");
      expect(result.notes).toBe("Ghi chú đã cập nhật");
    });

    it("rejects restricted actor reading mixed A+B group to prevent data leakage (F1)", async () => {
      const mixedGroupMock = {
        groupCode: "GRP-MIXED",
        reservations: [
          { id: "res-1", roomId: "room-A", assignedRoomId: "room-A" },
          { id: "res-2", roomId: "room-B", assignedRoomId: "room-B" },
        ],
      };
      const { service, accessService } = createService({
        findGroupByCode: jest.fn().mockResolvedValue(mixedGroupMock),
      });
      accessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-A",
        mode: "ROOM_EXCLUSIVE",
      });

      await expect(
        service.getGroupReservation("actor-restricted", "role-staff", "hotel-1", "GRP-MIXED"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows restricted actor reading own-only group containing only room A (F1)", async () => {
      const ownGroupMock = {
        groupCode: "GRP-OWN",
        reservations: [{ id: "res-1", roomId: "room-A", assignedRoomId: "room-A" }],
      };
      const { service, accessService } = createService({
        findGroupByCode: jest.fn().mockResolvedValue(ownGroupMock),
      });
      accessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-A",
        mode: "ROOM_EXCLUSIVE",
      });

      const result = await service.getGroupReservation(
        "actor-restricted",
        "role-staff",
        "hotel-1",
        "GRP-OWN",
      );
      expect(result).toEqual(ownGroupMock);
    });

    it("rejects restricted actor reading mixed A+B group confirmation (F1)", async () => {
      const mixedConfirmationMock = {
        hotel: { id: "hotel-1" },
        groupRecord: { groupCode: "GRP-MIXED" },
        reservations: [
          { id: "res-1", roomId: "room-A", assignedRoomId: "room-A" },
          { id: "res-2", roomId: "room-B", assignedRoomId: "room-B" },
        ],
      };
      const { service, accessService } = createService({
        findGroupConfirmation: jest.fn().mockResolvedValue(mixedConfirmationMock),
      });
      accessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-A",
        mode: "ROOM_EXCLUSIVE",
      });

      await expect(
        service.getGroupConfirmation("actor-restricted", "role-staff", "hotel-1", "GRP-MIXED"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows restricted actor reading own-only group confirmation (F1)", async () => {
      const ownConfirmationMock = {
        hotel: { id: "hotel-1", timezone: "Asia/Ho_Chi_Minh" },
        groupRecord: { groupCode: "GRP-OWN" },
        reservations: [
          {
            id: "res-1",
            roomId: "room-A",
            assignedRoomId: "room-A",
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
            chargeLines: [],
            bookingPayments: [],
          },
        ],
      };
      const { service, accessService } = createService({
        findGroupConfirmation: jest.fn().mockResolvedValue(ownConfirmationMock),
      });
      accessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-A",
        mode: "ROOM_EXCLUSIVE",
      });

      const result = await service.getGroupConfirmation(
        "actor-restricted",
        "role-staff",
        "hotel-1",
        "GRP-OWN",
      );
      expect(result).toBeDefined();
    });
  });

  describe("ReservationsRepository findGroupByCode & updateGroupByCode data queries", () => {
    function createRepo(prismaMock: Record<string, any>) {
      return new ReservationsRepository(prismaMock as never);
    }

    it("tính toán chính xác totalRooms, checkedInRooms, arrivingRooms và totalEstimatedAmount", async () => {
      const mockReservations = [
        {
          id: "res-1",
          reservationCode: "VSH_RES_001",
          roomId: "room-1",
          roomTypeId: "rt-1",
          roomTypeSnapshot: "Deluxe",
          guestDisplayName: "Khách 1",
          guestPhone: "0901",
          status: ReservationStatus.CHECKED_IN,
          plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"), // 2 nights
          nightlyRateSnapshot: new Prisma.Decimal("1000000.00"),
          baseNightlyRateSnapshot: new Prisma.Decimal("1000000.00"),
          guestCount: 2,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          room: { id: "room-1", roomNumber: "101" },
          roomType: { id: "rt-1", name: "Deluxe King", normalizedKey: "deluxe-king" },
        },
        {
          id: "res-2",
          reservationCode: "VSH_RES_002",
          roomId: "room-2",
          roomTypeId: "rt-1",
          roomTypeSnapshot: "Deluxe",
          guestDisplayName: "Khách 2",
          guestPhone: "0902",
          status: ReservationStatus.ARRIVAL_READY,
          plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-11-04T12:00:00.000Z"), // 3 nights
          nightlyRateSnapshot: new Prisma.Decimal("1500000.00"),
          baseNightlyRateSnapshot: new Prisma.Decimal("1500000.00"),
          guestCount: 2,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          room: { id: "room-2", roomNumber: "102" },
          roomType: { id: "rt-1", name: "Deluxe King", normalizedKey: "deluxe-king" },
        },
        {
          id: "res-3",
          reservationCode: "VSH_RES_003",
          roomId: "room-3",
          roomTypeId: "rt-1",
          roomTypeSnapshot: "Deluxe",
          guestDisplayName: "Khách 3",
          guestPhone: "0903",
          status: ReservationStatus.CANCELLED, // Đã hủy -> estimatedAmount = 0
          plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
          nightlyRateSnapshot: new Prisma.Decimal("1000000.00"),
          baseNightlyRateSnapshot: new Prisma.Decimal("1000000.00"),
          guestCount: 1,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          room: { id: "room-3", roomNumber: "103" },
          roomType: { id: "rt-1", name: "Deluxe King", normalizedKey: "deluxe-king" },
        },
      ];

      const mockGroup = {
        id: "group-1",
        hotelId: "hotel-1",
        groupCode: "GRP-CALC",
        groupName: "Đoàn Test Tính Tiền",
        leadGuestName: "Trưởng Đoàn",
        leadGuestPhone: "0909000111",
        notes: "Ghi chú đoàn",
        sourceCategory: "DIRECT",
        sourcePartnerId: null,
        sourcePartner: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const prisma = {
        reservationGroup: {
          findUnique: jest.fn().mockResolvedValue(mockGroup),
        },
        reservation: {
          findMany: jest.fn().mockResolvedValue(mockReservations),
        },
      };

      const repository = createRepo(prisma);
      const result = await repository.findGroupByCode("hotel-1", "GRP-CALC");

      expect(result.totalRooms).toBe(3);
      expect(result.checkedInRooms).toBe(1); // res-1
      expect(result.arrivingRooms).toBe(1); // res-2 (ARRIVAL_READY)
      // res-1: 2 nights * 1,000,000 = 2,000,000
      // res-2: 3 nights * 1,500,000 = 4,500,000
      // res-3: CANCELLED = 0
      // total = 6,500,000
      expect(result.totalEstimatedAmount).toBe(6500000);
      expect(result.reservations[0].nights).toBe(2);
      expect(result.reservations[0].estimatedAmount).toBe(2000000);
      expect(result.reservations[1].nights).toBe(3);
      expect(result.reservations[1].estimatedAmount).toBe(4500000);
      expect(result.reservations[2].estimatedAmount).toBe(0);
    });

    it("trả về 404 khi không tìm thấy đoàn cả trong ReservationGroup và Reservation", async () => {
      const prisma = {
        reservationGroup: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const repository = createRepo(prisma);
      await expect(repository.findGroupByCode("hotel-1", "NOT_FOUND")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("cập nhật thông tin đoàn an toàn với upsert và liên kết reservation", async () => {
      const mockSavedGroup = {
        id: "grp-saved-1",
        hotelId: "hotel-1",
        groupCode: "GRP-UPDATE",
        groupName: "Tên Mới",
        leadGuestName: "Trưởng Mới",
        leadGuestPhone: "0999888777",
        notes: "Ghi chú mới",
        sourceCategory: "DIRECT",
        sourcePartnerId: null,
        sourcePartner: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const prisma = {
        reservationGroup: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: "grp-saved-1" }) // existingGroup check
            .mockResolvedValueOnce(mockSavedGroup) // findGroupByCode query
            .mockResolvedValueOnce(mockSavedGroup),
          upsert: jest.fn().mockResolvedValue(mockSavedGroup),
        },
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const repository = createRepo(prisma);
      const result = await repository.updateGroupByCode("hotel-1", "GRP-UPDATE", {
        groupName: "Tên Mới",
        leadGuestName: "Trưởng Mới",
        leadGuestPhone: "0999888777",
        notes: "Ghi chú mới",
      });

      expect(prisma.reservationGroup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hotelId_groupCode: { hotelId: "hotel-1", groupCode: "GRP-UPDATE" } },
          update: expect.objectContaining({
            groupName: "Tên Mới",
            leadGuestName: "Trưởng Mới",
          }),
        }),
      );
      expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
        where: { hotelId: "hotel-1", groupCode: "GRP-UPDATE", groupId: null },
        data: { groupId: "grp-saved-1" },
      });
      expect(result.groupName).toBe("Tên Mới");
      expect(result.leadGuestName).toBe("Trưởng Mới");
    });

    it("cho phép mã đặt phòng (reservationCode) giống nhau cho tất cả các phòng khi đặt trước theo đoàn", async () => {
      const createdReservations: any[] = [];
      const mockTx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        room: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "room-1",
              status: "AVAILABLE",
              price: "500000.00",
              roomTypeId: "rt-std",
              roomType: { name: "Standard" },
            },
            {
              id: "room-2",
              status: "AVAILABLE",
              price: "500000.00",
              roomTypeId: "rt-std",
              roomType: { name: "Standard" },
            },
          ]),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdReservations.push(data);
            return Promise.resolve({ id: `res-${createdReservations.length}`, ...data });
          }),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const repository = createRepo({
        $transaction: jest.fn().mockImplementation((cb) => cb(mockTx)),
      });

      const result = await repository.createBulkReservations({
        hotelId: "hotel-1",
        groupCode: "GRP-SHARED-2026",
        reservationCode: "SHARED-RES-CODE-001",
        leadGuestName: "Đoàn Du Lịch Vietravel",
        checkInDate: new Date("2026-11-10T14:00:00.000Z"),
        checkOutDate: new Date("2026-11-12T12:00:00.000Z"),
        roomIds: ["room-1", "room-2"],
        createdByUserId: "staff-1",
        generateReservationCode: jest.fn().mockResolvedValue("UNUSED-GENERATED-CODE"),
      });

      expect(result.groupCode).toBe("GRP-SHARED-2026");
      expect(result.reservations).toHaveLength(2);
      // All rooms in the group share the exact same reservationCode
      expect(result.reservations[0].reservationCode).toBe("SHARED-RES-CODE-001");
      expect(result.reservations[1].reservationCode).toBe("SHARED-RES-CODE-001");
      expect(createdReservations[0].reservationCode).toBe("SHARED-RES-CODE-001");
      expect(createdReservations[1].reservationCode).toBe("SHARED-RES-CODE-001");
    });
  });
});
