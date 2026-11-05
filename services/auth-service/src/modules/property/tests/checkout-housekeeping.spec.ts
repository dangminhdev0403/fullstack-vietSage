import { ConflictException } from "@nestjs/common";
import {
  GuestSessionStatus,
  GuestStayStatus,
  HousekeepingNotificationStatus,
  HousekeepingTaskPriority,
  HousekeepingTaskStatus,
  RoomStatus,
} from "@prisma/client";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";

describe("Checkout Housekeeping Integration", () => {
  let repository: HotelRoomsRepository;
  let mockPrisma: any;
  let mockTx: any;

  const hotelId = "hotel-123";
  const stayId = "stay-456";
  const roomId = "room-789";
  const actorUserId = "user-001";
  const tenantId = "tenant-999";

  beforeEach(() => {
    mockTx = {
      guestStay: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: stayId,
          hotelId,
          roomId,
          status: GuestStayStatus.CHECKED_OUT,
        }),
      },
      room: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: roomId, roomNumber: "101", status: RoomStatus.PROCESSING, guestStays: [] }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: roomId, roomNumber: "101", status: RoomStatus.AVAILABLE, guestStays: [] }),
        findFirst: jest.fn().mockResolvedValue({ id: roomId, roomNumber: "101", status: RoomStatus.PROCESSING }),
      },
      guestSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      folio: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      domainEvent: {
        create: jest.fn().mockResolvedValue({ id: "evt-1" }),
      },
      housekeepingTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: "task-001",
          hotelId,
          roomId,
          stayId,
          status: HousekeepingTaskStatus.QUEUED,
          priority: HousekeepingTaskPriority.NORMAL,
          version: 1,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      housekeepingTaskHistory: {
        create: jest.fn().mockResolvedValue({ id: "hist-001" }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      housekeepingNotification: {
        create: jest.fn().mockResolvedValue({ id: "notif-001" }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => callback(mockTx)),
    };

    repository = new HotelRoomsRepository(mockPrisma);
  });

  describe("checkOutStay with PROCESSING", () => {
    it("creates exactly one active cleaning task on checkout with PROCESSING", async () => {
      const result = await repository.checkOutStay({
        hotelId,
        stayId,
        roomId,
        actorUserId,
        tenantId,
        nextRoomStatus: RoomStatus.PROCESSING,
        cleaningPriority: "NORMAL",
        notes: "Khách dọn đồ sạch sẽ",
      });

      expect(result).toBeDefined();
      expect(mockTx.room.updateMany).toHaveBeenCalledWith({
        where: {
          id: roomId,
          hotelId,
          status: RoomStatus.OCCUPIED,
        },
        data: { status: RoomStatus.PROCESSING },
      });

      expect(mockTx.housekeepingTask.findFirst).toHaveBeenCalledWith({
        where: {
          hotelId,
          roomId,
          status: {
            in: [
              HousekeepingTaskStatus.QUEUED,
              HousekeepingTaskStatus.CLAIMED,
              HousekeepingTaskStatus.IN_PROGRESS,
              HousekeepingTaskStatus.BLOCKED,
            ],
          },
        },
        select: { id: true },
      });

      expect(mockTx.housekeepingTask.create).toHaveBeenCalledWith({
        data: {
          hotelId,
          roomId,
          stayId,
          status: HousekeepingTaskStatus.QUEUED,
          priority: HousekeepingTaskPriority.NORMAL,
          notes: "Khách dọn đồ sạch sẽ",
          version: 1,
        },
      });

      expect(mockTx.housekeepingTaskHistory.create).toHaveBeenCalledWith({
        data: {
          taskId: "task-001",
          fromStatus: null,
          toStatus: HousekeepingTaskStatus.QUEUED,
          actorUserId,
          reason: "CHECKOUT",
          notes: "Khách dọn đồ sạch sẽ",
        },
      });

      expect(mockTx.housekeepingNotification.create).toHaveBeenCalledWith({
        data: {
          hotelId,
          taskId: "task-001",
          title: "Yêu cầu dọn phòng mới",
          message: "Phòng 101 vừa check-out, cần dọn dẹp",
          status: HousekeepingNotificationStatus.UNREAD,
        },
      });
    });

    it("does not create a duplicate task if an active task already exists for this room", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({ id: "existing-task-999" });

      await repository.checkOutStay({
        hotelId,
        stayId,
        roomId,
        actorUserId,
        tenantId,
        nextRoomStatus: RoomStatus.PROCESSING,
      });

      expect(mockTx.housekeepingTask.create).not.toHaveBeenCalled();
      expect(mockTx.housekeepingTaskHistory.create).not.toHaveBeenCalled();
      expect(mockTx.housekeepingNotification.create).not.toHaveBeenCalled();
    });

    it("creates an URGENT task when cleaningPriority is URGENT", async () => {
      await repository.checkOutStay({
        hotelId,
        stayId,
        roomId,
        actorUserId,
        tenantId,
        nextRoomStatus: RoomStatus.PROCESSING,
        cleaningPriority: "URGENT",
      });

      expect(mockTx.housekeepingTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: HousekeepingTaskPriority.URGENT,
          }),
        }),
      );
    });
  });

  describe("checkOutStay with MAINTENANCE", () => {
    it("does not create a cleaning task when checking out to MAINTENANCE", async () => {
      await repository.checkOutStay({
        hotelId,
        stayId,
        roomId,
        actorUserId,
        tenantId,
        nextRoomStatus: RoomStatus.MAINTENANCE,
      });

      expect(mockTx.room.updateMany).toHaveBeenCalledWith({
        where: {
          id: roomId,
          hotelId,
          status: RoomStatus.OCCUPIED,
        },
        data: { status: RoomStatus.MAINTENANCE },
      });

      expect(mockTx.housekeepingTask.create).not.toHaveBeenCalled();
      expect(mockTx.housekeepingTaskHistory.create).not.toHaveBeenCalled();
      expect(mockTx.housekeepingNotification.create).not.toHaveBeenCalled();
    });
  });

  describe("confirmRoomReady closes active housekeeping tasks", () => {
    it("completes active cleaning tasks when confirming room ready", async () => {
      mockTx.housekeepingTask.findMany.mockResolvedValueOnce([
        { id: "task-active-1", status: HousekeepingTaskStatus.IN_PROGRESS },
      ]);

      await repository.confirmRoomReady(hotelId, roomId);

      expect(mockTx.room.updateMany).toHaveBeenCalledWith({
        where: {
          id: roomId,
          hotelId,
          status: RoomStatus.PROCESSING,
        },
        data: {
          status: RoomStatus.AVAILABLE,
        },
      });

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith({
        where: {
          hotelId,
          roomId,
          status: {
            in: [
              HousekeepingTaskStatus.QUEUED,
              HousekeepingTaskStatus.CLAIMED,
              HousekeepingTaskStatus.IN_PROGRESS,
              HousekeepingTaskStatus.BLOCKED,
            ],
          },
        },
        data: {
          status: HousekeepingTaskStatus.COMPLETED,
          completedAt: expect.any(Date),
        },
      });

      expect(mockTx.housekeepingTaskHistory.createMany).toHaveBeenCalledWith({
        data: [
          {
            taskId: "task-active-1",
            fromStatus: HousekeepingTaskStatus.IN_PROGRESS,
            toStatus: HousekeepingTaskStatus.COMPLETED,
            reason: "ROOM_READY_CONFIRMED",
          },
        ],
      });
    });
  });
});
