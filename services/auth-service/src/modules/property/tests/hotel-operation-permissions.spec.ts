jest.mock("../../../common/config/env.config", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public",
    PORT: 3000,
    JWT_ACCESS_SECRET: "test-access-secret-with-32-characters",
    JWT_REFRESH_SECRET: "test-refresh-secret-with-32-characters",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
  },
  validateEnv: jest.fn(),
}));

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { RoomStatus } from "@prisma/client";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { BiometricWorkstationsController } from "../../biometric-workstations/api/biometric-workstations.controller";
import { HotelRoomsController } from "../api/hotel-rooms.controller";
import { ReservationsController } from "../api/reservations.controller";
import { HotelRoomsService } from "../application/hotel-rooms.service";
import { updateRoomBodySchema, updateRoomStatusBodySchema } from "../domain/schemas/rooms.schema";

describe("Hotel operation permissions and command boundary enforcement", () => {
  describe("Controller permission metadata contracts", () => {
    it("enforces distinct check-in, checkout, status, and metadata permissions on HotelRoomsController", () => {
      // Walk-in and existing-stay check-in require hotel.stays.check-in
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRoomsController.prototype.createAndCheckInStay,
        ),
      ).toBe("hotel.stays.check-in");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.checkInStay),
      ).toBe("hotel.stays.check-in");

      // Direct checkout requires hotel.stays.check-out
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.checkOutStay),
      ).toBe("hotel.stays.check-out");

      // Operational room status requires hotel.rooms.status.manage
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRoomsController.prototype.updateRoomStatus,
        ),
      ).toBe("hotel.rooms.status.manage");

      // Dedicated atomic ready endpoint requires hotel.rooms.ready.confirm
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRoomsController.prototype.confirmRoomReady,
        ),
      ).toBe("hotel.rooms.ready.confirm");

      // Metadata update remains under hotel.rooms.manage
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.updateRoom),
      ).toBe("hotel.rooms.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.createRoom),
      ).toBe("hotel.rooms.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.createRooms),
      ).toBe("hotel.rooms.manage");

      // Read endpoints require view
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.listRooms),
      ).toBe("hotel.rooms.view");

      // Stay lifecycle management
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.createStay),
      ).toBe("hotel.stays.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.updateStay),
      ).toBe("hotel.stays.manage");

      // QR policies remain unchanged under hotel.rooms.qr.manage
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.rotateQr),
      ).toBe("hotel.rooms.qr.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.activateQr),
      ).toBe("hotel.rooms.qr.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRoomsController.prototype.deactivateQr),
      ).toBe("hotel.rooms.qr.manage");
    });

    it("enforces reservation check-in requires hotel.stays.check-in while preserving reservation management", () => {
      // Reservation check-in requires the same execution key as stay check-in
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, ReservationsController.prototype.checkIn),
      ).toBe("hotel.stays.check-in");

      // Reservation configuration and views remain unchanged
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ReservationsController.prototype.createReservation,
        ),
      ).toBe("hotel.reservations.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, ReservationsController.prototype.assignRoom),
      ).toBe("hotel.reservations.manage");

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, ReservationsController.prototype.listArrivals),
      ).toBe("hotel.reservations.view");
    });

    it("enforces biometric workstation endpoints follow check-in execution capability, not owner role", () => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          BiometricWorkstationsController.prototype.issuePairing,
        ),
      ).toEqual(["hotel.stays.manage", "hotel.stays.check-in"]);

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          BiometricWorkstationsController.prototype.status,
        ),
      ).toEqual(["hotel.stays.manage", "hotel.stays.check-in"]);

      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          BiometricWorkstationsController.prototype.disconnect,
        ),
      ).toEqual(["hotel.stays.manage", "hotel.stays.check-in"]);
    });
  });

  describe("Schema separation and strict boundary validation", () => {
    it("updateRoomBodySchema accepts metadata fields and rejects status", () => {
      const validMetadata = parseWithZod(updateRoomBodySchema, {
        roomNumber: "201",
        floor: "2",
        type: "Deluxe Ocean",
        price: 1800000,
        maxActiveGuestDevices: 4,
      });
      expect(validMetadata).toEqual({
        roomNumber: "201",
        floor: "2",
        type: "Deluxe Ocean",
        price: 1800000,
        maxActiveGuestDevices: 4,
      });

      // Status must be rejected on metadata endpoint
      expect(() =>
        parseWithZod(updateRoomBodySchema, {
          status: "AVAILABLE",
        }),
      ).toThrow();

      expect(() =>
        parseWithZod(updateRoomBodySchema, {
          roomNumber: "201",
          status: "AVAILABLE",
        }),
      ).toThrow();
    });

    it("updateRoomStatusBodySchema strictly requires status and the observed room version", () => {
      const expectedUpdatedAt = "2026-10-15T00:00:00.000Z";
      const validStatus = parseWithZod(updateRoomStatusBodySchema, {
        status: "PROCESSING",
        expectedUpdatedAt,
      });
      expect(validStatus).toEqual({
        status: RoomStatus.PROCESSING,
        expectedUpdatedAt: new Date(expectedUpdatedAt),
      });

      expect(
        parseWithZod(updateRoomStatusBodySchema, { status: "clean", expectedUpdatedAt }),
      ).toEqual({
        status: RoomStatus.AVAILABLE,
        expectedUpdatedAt: new Date(expectedUpdatedAt),
      });

      expect(() =>
        parseWithZod(updateRoomStatusBodySchema, {
          status: "INVALID_STATUS",
          expectedUpdatedAt,
        }),
      ).toThrow();
      expect(() => parseWithZod(updateRoomStatusBodySchema, { status: "PROCESSING" })).toThrow();
      expect(() =>
        parseWithZod(updateRoomStatusBodySchema, {
          status: "AVAILABLE",
          expectedUpdatedAt,
          roomNumber: "201",
        }),
      ).toThrow();
    });
  });

  describe("HotelRoomsService.updateRoomStatus operational behavior", () => {
    function createMockRepository(overrides: Record<string, unknown> = {}) {
      return {
        findRoomInHotel: jest.fn().mockResolvedValue({
          id: "room-1",
          hotelId: "hotel-1",
          roomNumber: "101",
          floor: "1",
          type: "Standard",
          price: 1000000,
          status: RoomStatus.AVAILABLE,
          updatedAt: new Date("2026-10-15T00:00:00.000Z"),
          guestStays: [],
          qrCodes: [],
          ...overrides,
        }),
        updateRoomInHotel: jest.fn().mockImplementation((_hotelId, _roomId, data) => ({
          id: "room-1",
          hotelId: "hotel-1",
          roomNumber: "101",
          floor: "1",
          type: "Standard",
          price: 1000000,
          status: data.status ?? RoomStatus.AVAILABLE,
          guestStays: [],
          qrCodes: [],
        })),
      };
    }

    function createMockAccessService() {
      return {
        assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      };
    }

    function createService(
      repository = createMockRepository(),
      accessService = createMockAccessService(),
    ) {
      return new HotelRoomsService(repository as any, {} as any, accessService as any);
    }

    it("updates room status to PROCESSING successfully", async () => {
      const repository = createMockRepository();
      const accessService = createMockAccessService();
      const service = createService(repository, accessService);

      const result = await service.updateRoomStatus(
        "user-1",
        "role-frontdesk",
        "hotel-1",
        "room-1",
        {
          status: RoomStatus.PROCESSING,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        },
      );

      expect(accessService.assertHotelAccess).toHaveBeenCalledWith(
        "user-1",
        "role-frontdesk",
        "hotel-1",
      );
      expect(repository.updateRoomInHotel).toHaveBeenCalledWith(
        "hotel-1",
        "room-1",
        expect.objectContaining({ status: RoomStatus.PROCESSING }),
        expect.objectContaining({
          status: RoomStatus.AVAILABLE,
          updatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      );
      expect(result.status).toBe(RoomStatus.PROCESSING);
    });

    it("refuses to block a room that has an active guest stay", async () => {
      const repository = createMockRepository({
        guestStays: [{ id: "stay-1", status: "ACTIVE" }],
      });
      const service = createService(repository);

      await expect(
        service.updateRoomStatus("user-1", "role-frontdesk", "hotel-1", "room-1", {
          status: RoomStatus.BLOCKED,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.updateRoomInHotel).not.toHaveBeenCalled();
    });

    it("refuses manual lifecycle-only statuses like OCCUPIED", async () => {
      const repository = createMockRepository();
      const service = createService(repository);

      await expect(
        service.updateRoomStatus("user-1", "role-frontdesk", "hotel-1", "room-1", {
          status: RoomStatus.OCCUPIED,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.updateRoomInHotel).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when room does not exist", async () => {
      const repository = createMockRepository();
      repository.findRoomInHotel.mockResolvedValue(null);
      const service = createService(repository);

      await expect(
        service.updateRoomStatus("user-1", "role-frontdesk", "hotel-1", "room-999", {
          status: RoomStatus.AVAILABLE,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repository.updateRoomInHotel).not.toHaveBeenCalled();
    });

    it("propagates a concurrent status conflict instead of overwriting newer work", async () => {
      const repository = createMockRepository();
      repository.updateRoomInHotel.mockRejectedValue(
        new ConflictException("Trạng thái phòng đã thay đổi. Vui lòng tải lại trước khi thao tác."),
      );
      const service = createService(repository);

      await expect(
        service.updateRoomStatus("user-frontdesk", "role-frontdesk", "hotel-1", "room-1", {
          status: RoomStatus.PROCESSING,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects bypassing housekeeping confirmation via manual PROCESSING to AVAILABLE", async () => {
      const repository = createMockRepository({ status: RoomStatus.PROCESSING });
      const service = createService(repository);

      await expect(
        service.updateRoomStatus("user-frontdesk", "role-frontdesk", "hotel-1", "room-1", {
          status: RoomStatus.AVAILABLE,
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.updateRoomInHotel).not.toHaveBeenCalled();
    });
  });

  describe("HotelRoomsService.confirmRoomReady operational behavior", () => {
    function createMockRepository() {
      return {
        confirmRoomReady: jest.fn().mockResolvedValue({
          id: "room-1",
          hotelId: "hotel-1",
          roomNumber: "101",
          floor: "1",
          type: "Standard",
          price: 1000000,
          status: RoomStatus.AVAILABLE,
          guestStays: [],
          qrCodes: [],
          activeGuestDeviceCount: 0,
        }),
      };
    }

    function createMockAccessService() {
      return {
        assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
        assertRoomAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      };
    }

    it("confirms room ready atomically for PROCESSING room", async () => {
      const repository = createMockRepository();
      const accessService = createMockAccessService();
      const service = new HotelRoomsService(repository as any, {} as any, accessService as any);

      const result = await service.confirmRoomReady(
        "user-housekeeping",
        "role-housekeeping",
        "hotel-1",
        "room-1",
        { expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z") },
      );

      expect(accessService.assertRoomAccess).toHaveBeenCalledWith(
        "user-housekeeping",
        "role-housekeeping",
        "hotel-1",
        "room-1",
      );
      expect(repository.confirmRoomReady).toHaveBeenCalledWith(
        "hotel-1",
        "room-1",
        new Date("2026-10-15T00:00:00.000Z"),
      );
      expect(result.status).toBe(RoomStatus.AVAILABLE);
    });

    it("propagates ConflictException on replay/conflict from repository", async () => {
      const repository = createMockRepository();
      repository.confirmRoomReady.mockRejectedValue(
        new ConflictException(
          "Chỉ có thể xác nhận sẵn sàng cho phòng đang ở trạng thái CHỜ DỌN (PROCESSING)",
        ),
      );
      const accessService = createMockAccessService();
      const service = new HotelRoomsService(repository as any, {} as any, accessService as any);

      await expect(
        service.confirmRoomReady("user-housekeeping", "role-housekeeping", "hotel-1", "room-1", {
          expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("allows frontdesk staff to confirm room ready to AVAILABLE", async () => {
      const repository = createMockRepository();
      const accessService = createMockAccessService();
      const service = new HotelRoomsService(repository as any, {} as any, accessService as any);

      const result = await service.confirmRoomReady(
        "user-frontdesk",
        "role-frontdesk",
        "hotel-1",
        "room-1",
        { expectedUpdatedAt: new Date("2026-10-15T00:00:00.000Z") },
      );

      expect(accessService.assertRoomAccess).toHaveBeenCalledWith(
        "user-frontdesk",
        "role-frontdesk",
        "hotel-1",
        "room-1",
      );
      expect(repository.confirmRoomReady).toHaveBeenCalledWith(
        "hotel-1",
        "room-1",
        new Date("2026-10-15T00:00:00.000Z"),
      );
      expect(result.status).toBe(RoomStatus.AVAILABLE);
    });
  });
});
