import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  HousekeepingNotificationStatus,
  HousekeepingTaskPriority,
  HousekeepingTaskStatus,
  RoomStatus,
} from "@prisma/client";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { HousekeepingController } from "../api/housekeeping.controller";
import { HousekeepingService } from "../application/housekeeping.service";
import { HousekeepingRepository } from "../infrastructure/repositories/housekeeping.repository";

describe("Housekeeping Workflow & Concurrency Spec", () => {
  let repository: HousekeepingRepository;
  let service: HousekeepingService;
  let mockPrisma: any;
  let mockTx: any;
  let mockHotelAccessService: any;

  const hotelId = "hotel-abc";
  const roomId = "room-101";
  const taskId = "task-555";
  const actorUserId = "staff-001";
  const otherUserId = "staff-002";
  const activeRoleId = "role-housekeeping";

  beforeEach(() => {
    mockTx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: roomId,
          hotelId,
          roomNumber: "101",
          status: RoomStatus.PROCESSING,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: roomId,
          hotelId,
          roomNumber: "101",
          status: RoomStatus.PROCESSING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      housekeepingTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: taskId,
          hotelId,
          roomId,
          status: HousekeepingTaskStatus.QUEUED,
          priority: HousekeepingTaskPriority.NORMAL,
          assignedToUserId: null,
          version: 1,
          room: { id: roomId, roomNumber: "101", floor: "1", status: RoomStatus.PROCESSING },
          assignedTo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: taskId,
            hotelId,
            roomId,
            status: HousekeepingTaskStatus.CLAIMED,
            priority: HousekeepingTaskPriority.NORMAL,
            assignedToUserId: actorUserId,
            version: 2,
            room: { id: roomId, roomNumber: "101", floor: "1", status: RoomStatus.PROCESSING },
            assignedTo: { id: actorUserId, fullName: "Staff One" },
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: taskId,
          hotelId,
          roomId,
          status: HousekeepingTaskStatus.QUEUED,
          priority: HousekeepingTaskPriority.NORMAL,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      housekeepingTaskHistory: {
        create: jest.fn().mockResolvedValue({ id: "hist-1" }),
      },
      housekeepingNotification: {
        create: jest.fn().mockResolvedValue({ id: "notif-1" }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockTx)),
      housekeepingTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      housekeepingNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockHotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue({ id: hotelId, tenantId: "tenant-1" }),
      assertRoomAccess: jest.fn().mockResolvedValue({ id: hotelId, tenantId: "tenant-1" }),
    };

    repository = new HousekeepingRepository(mockPrisma);
    service = new HousekeepingService(repository, mockHotelAccessService);
  });

  describe("Claim Command", () => {
    it("successfully claims a QUEUED task and increments version", async () => {
      const result = await repository.claimTask({
        hotelId,
        taskId,
        actorUserId,
      });

      expect(result).toBeDefined();
      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: taskId,
            hotelId,
            status: HousekeepingTaskStatus.QUEUED,
          },
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.CLAIMED,
            assignedToUserId: actorUserId,
            version: { increment: 1 },
          }),
        }),
      );
      expect(mockTx.housekeepingTaskHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskId,
            fromStatus: HousekeepingTaskStatus.QUEUED,
            toStatus: HousekeepingTaskStatus.CLAIMED,
            actorUserId,
            reason: "CLAIMED",
          }),
        }),
      );
    });

    it("is idempotent when claimed again by the same actor", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.CLAIMED,
        assignedToUserId: actorUserId,
        version: 2,
      });

      const result = await repository.claimTask({
        hotelId,
        taskId,
        actorUserId,
      });

      expect(result.status).toBe(HousekeepingTaskStatus.CLAIMED);
      expect(mockTx.housekeepingTask.updateMany).not.toHaveBeenCalled();
    });

    it("rejects duplicate claim by a different actor with ConflictException", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.CLAIMED,
        assignedToUserId: otherUserId,
        version: 2,
      });

      await expect(
        repository.claimTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects claim when expectedVersion does not match current version (stale conflict)", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.QUEUED,
        version: 5,
      });

      await expect(
        repository.claimTask({
          hotelId,
          taskId,
          actorUserId,
          expectedVersion: 4,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects claim when concurrent update races (update count === 0)", async () => {
      mockTx.housekeepingTask.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        repository.claimTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Start Command", () => {
    it("successfully starts a CLAIMED task", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.CLAIMED,
        assignedToUserId: actorUserId,
        version: 2,
      });

      await repository.startTask({
        hotelId,
        taskId,
        actorUserId,
      });

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.IN_PROGRESS,
            startedAt: expect.any(Date),
            version: { increment: 1 },
          }),
        }),
      );
    });

    it("is idempotent when start is called again by the same actor in IN_PROGRESS", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        assignedToUserId: actorUserId,
        version: 3,
      });

      const result = await repository.startTask({
        hotelId,
        taskId,
        actorUserId,
      });

      expect(result.status).toBe(HousekeepingTaskStatus.IN_PROGRESS);
      expect(mockTx.housekeepingTask.updateMany).not.toHaveBeenCalled();
    });

    it("rejects start when task is BLOCKED", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.BLOCKED,
        version: 2,
      });

      await expect(
        repository.startTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects start when stale expectedVersion is provided", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.CLAIMED,
        assignedToUserId: actorUserId,
        version: 3,
      });

      await expect(
        repository.startTask({
          hotelId,
          taskId,
          actorUserId,
          expectedVersion: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Block Command", () => {
    it("successfully blocks an IN_PROGRESS task with a reason", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        assignedToUserId: actorUserId,
        version: 3,
      });

      await repository.blockTask({
        hotelId,
        taskId,
        actorUserId,
        reason: "Khách để quên đồ, cần xin ý kiến quản lý",
      });

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.BLOCKED,
            blockReason: "Khách để quên đồ, cần xin ý kiến quản lý",
            blockedAt: expect.any(Date),
            version: { increment: 1 },
          }),
        }),
      );
    });

    it("is idempotent when already blocked with the same reason", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.BLOCKED,
        blockReason: "Khóa phòng bị hỏng",
        version: 4,
      });

      const result = await repository.blockTask({
        hotelId,
        taskId,
        actorUserId,
        reason: "Khóa phòng bị hỏng",
      });

      expect(result.status).toBe(HousekeepingTaskStatus.BLOCKED);
      expect(mockTx.housekeepingTask.updateMany).not.toHaveBeenCalled();
    });

    it("rejects block on an already COMPLETED task", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.COMPLETED,
        version: 4,
      });

      await expect(
        repository.blockTask({
          hotelId,
          taskId,
          actorUserId,
          reason: "Thử block task đã xong",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Complete Command & Room Status Invariant", () => {
    it("atomically transitions task to COMPLETED and room to AVAILABLE when room is PROCESSING", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        assignedToUserId: actorUserId,
        version: 3,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        roomNumber: "101",
        status: RoomStatus.PROCESSING,
      });

      await repository.completeTask({
        hotelId,
        taskId,
        actorUserId,
        notes: "Đã dọn sạch và thay ga",
      });

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

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.COMPLETED,
            completedAt: expect.any(Date),
            notes: "Đã dọn sạch và thay ga",
            version: { increment: 1 },
          }),
        }),
      );
    });

    it("rejects completion when room status is NOT PROCESSING (e.g. MAINTENANCE)", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        assignedToUserId: actorUserId,
        version: 3,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        roomNumber: "101",
        status: RoomStatus.MAINTENANCE,
      });

      await expect(
        repository.completeTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.room.updateMany).not.toHaveBeenCalled();
    });

    it("rejects completion when room status is OCCUPIED", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        version: 3,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        roomNumber: "101",
        status: RoomStatus.OCCUPIED,
      });

      await expect(
        repository.completeTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects completion when room status is BLOCKED", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        version: 3,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        roomNumber: "101",
        status: RoomStatus.BLOCKED,
      });

      await expect(
        repository.completeTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects completion when task is in BLOCKED state", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.BLOCKED,
        version: 3,
      });

      await expect(
        repository.completeTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("is idempotent when task is COMPLETED and room is already AVAILABLE", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.COMPLETED,
        version: 4,
      });

      mockTx.room.findUnique.mockResolvedValueOnce({
        id: roomId,
        status: RoomStatus.AVAILABLE,
      });

      const result = await repository.completeTask({
        hotelId,
        taskId,
        actorUserId,
      });

      expect(result.status).toBe(HousekeepingTaskStatus.COMPLETED);
      expect(mockTx.room.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("Reopen Command", () => {
    it("successfully reopens a BLOCKED task", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.BLOCKED,
        assignedToUserId: actorUserId,
        version: 4,
      });

      await repository.reopenTask({
        hotelId,
        taskId,
        actorUserId,
        reason: "Sự cố phòng đã được giải quyết",
      });

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.IN_PROGRESS,
            blockedAt: null,
            blockReason: null,
            version: { increment: 1 },
          }),
        }),
      );
    });

    it("reopens a COMPLETED task and moves room back to PROCESSING if AVAILABLE", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.COMPLETED,
        assignedToUserId: actorUserId,
        version: 4,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        status: RoomStatus.AVAILABLE,
      });

      await repository.reopenTask({
        hotelId,
        taskId,
        actorUserId,
        reason: "Khách phản ánh phòng chưa được dọn sạch rèm cửa",
      });

      expect(mockTx.room.updateMany).toHaveBeenCalledWith({
        where: { id: roomId, hotelId, status: RoomStatus.AVAILABLE },
        data: { status: RoomStatus.PROCESSING },
      });

      expect(mockTx.housekeepingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: HousekeepingTaskStatus.IN_PROGRESS,
            completedAt: null,
            version: { increment: 1 },
          }),
        }),
      );
    });

    it("rejects reopening a COMPLETED task if room is already OCCUPIED", async () => {
      mockTx.housekeepingTask.findFirst.mockResolvedValueOnce({
        id: taskId,
        hotelId,
        roomId,
        status: HousekeepingTaskStatus.COMPLETED,
        assignedToUserId: actorUserId,
        version: 4,
      });

      mockTx.room.findFirst.mockResolvedValueOnce({
        id: roomId,
        hotelId,
        status: RoomStatus.OCCUPIED,
      });

      await expect(
        repository.reopenTask({
          hotelId,
          taskId,
          actorUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Summary Metrics", () => {
    it("aggregates task counts by status", async () => {
      mockPrisma.housekeepingTask.count
        .mockResolvedValueOnce(3) // queued
        .mockResolvedValueOnce(2) // claimed
        .mockResolvedValueOnce(4) // inProgress
        .mockResolvedValueOnce(1) // blocked
        .mockResolvedValueOnce(10); // completed

      const summary = await repository.getSummary(hotelId);

      expect(summary).toEqual({
        queued: 3,
        claimed: 2,
        inProgress: 4,
        blocked: 1,
        completed: 10,
        totalActive: 10, // 3 + 2 + 4 + 1
      });
    });
  });

  describe("Service & Hotel Access Checks", () => {
    it("calls assertHotelAccess before executing listTasks", async () => {
      jest.spyOn(repository, "listTasks").mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      await service.listTasks(actorUserId, activeRoleId, hotelId, { page: 1, limit: 20 });
      expect(mockHotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
        actorUserId,
        activeRoleId,
        hotelId,
      );
    });
  });

  describe("Controller Permissions Metadata", () => {
    it("declares expected business permissions on routes", () => {
      const getMeta = (methodName: string) =>
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HousekeepingController.prototype[methodName]);

      expect(getMeta("listTasks")).toEqual(["hotel.rooms.view", "hotel.rooms.ready.confirm"]);
      expect(getMeta("getTasksSummary")).toEqual(["hotel.rooms.view", "hotel.rooms.ready.confirm"]);
      expect(getMeta("getTaskDetail")).toEqual(["hotel.rooms.view", "hotel.rooms.ready.confirm"]);
      expect(getMeta("claimTask")).toEqual([
        "hotel.rooms.ready.confirm",
        "hotel.rooms.status.manage",
        "hotel.rooms.manage",
      ]);
      expect(getMeta("startTask")).toEqual([
        "hotel.rooms.ready.confirm",
        "hotel.rooms.status.manage",
        "hotel.rooms.manage",
      ]);
      expect(getMeta("blockTask")).toEqual([
        "hotel.rooms.ready.confirm",
        "hotel.rooms.status.manage",
        "hotel.rooms.manage",
      ]);
      expect(getMeta("completeTask")).toEqual([
        "hotel.rooms.ready.confirm",
        "hotel.rooms.status.manage",
        "hotel.rooms.manage",
      ]);
      expect(getMeta("reopenTask")).toEqual([
        "hotel.rooms.ready.confirm",
        "hotel.rooms.status.manage",
        "hotel.rooms.manage",
      ]);
    });
  });
});
