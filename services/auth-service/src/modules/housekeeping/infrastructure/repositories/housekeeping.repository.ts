import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  HousekeepingNotificationStatus,
  HousekeepingTaskPriority,
  HousekeepingTaskStatus,
  Prisma,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { RequestRealtimeEmitter } from "../../../../request-realtime.emitter";

const taskInclude = {
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      status: true,
      roomType: {
        select: {
          name: true,
        },
      },
    },
  },
  assignedTo: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

const taskWithHistoryInclude = {
  ...taskInclude,
  history: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actor: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },
} as const;

function toHousekeepingTaskEventPayload(
  task: any,
  previousStatus?: string | null,
  extras?: { reason?: string | null; notes?: string | null },
) {
  return {
    hotelId: task.hotelId,
    taskId: task.id,
    roomId: task.roomId ?? null,
    roomNumber: task.room?.roomNumber ?? null,
    status: task.status,
    previousStatus: previousStatus ?? null,
    priority: task.priority ?? null,
    assignedStaffId: task.assignedToUserId ?? null,
    assignedStaffName: task.assignedTo?.fullName ?? null,
    reason: extras?.reason ?? null,
    notes: extras?.notes ?? task.notes ?? null,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
  };
}

function emitHousekeepingTaskRealtime(emit: () => void): void {
  try {
    emit();
  } catch {
    // A socket delivery failure must not turn a committed task transition into an API failure.
  }
}

@Injectable()
export class HousekeepingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listTasks(
    hotelId: string,
    filter: {
      status?: HousekeepingTaskStatus;
      priority?: HousekeepingTaskPriority;
      roomId?: string;
      assignedToUserId?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.HousekeepingTaskWhereInput = {
      hotelId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.roomId ? { roomId: filter.roomId } : {}),
      ...(filter.assignedToUserId ? { assignedToUserId: filter.assignedToUserId } : {}),
    };

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.housekeepingTask.findMany({
        where,
        include: taskInclude,
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }),
      this.prisma.housekeepingTask.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getSummary(hotelId: string) {
    const [queued, claimed, inProgress, blocked, completed] = await Promise.all([
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: HousekeepingTaskStatus.QUEUED },
      }),
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: HousekeepingTaskStatus.CLAIMED },
      }),
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: HousekeepingTaskStatus.IN_PROGRESS },
      }),
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: HousekeepingTaskStatus.BLOCKED },
      }),
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: HousekeepingTaskStatus.COMPLETED },
      }),
    ]);

    return {
      queued,
      claimed,
      inProgress,
      blocked,
      completed,
      totalActive: queued + claimed + inProgress + blocked,
    };
  }

  async findById(hotelId: string, taskId: string) {
    return this.prisma.housekeepingTask.findFirst({
      where: { id: taskId, hotelId },
      include: taskWithHistoryInclude,
    });
  }

  async findActiveTaskByRoom(hotelId: string, roomId: string) {
    return this.prisma.housekeepingTask.findFirst({
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
      include: taskInclude,
    });
  }

  async createTask(input: {
    hotelId: string;
    roomId: string;
    stayId?: string;
    priority?: HousekeepingTaskPriority;
    notes?: string;
    actorUserId?: string;
  }) {
    const task = await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: input.roomId, hotelId: input.hotelId },
        select: { id: true, roomNumber: true, status: true },
      });
      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng tương ứng tại khách sạn này");
      }
      if (room.status !== RoomStatus.PROCESSING) {
        throw new ConflictException(
          "Chỉ có thể tạo công việc dọn phòng cho phòng đang ở trạng thái CHỜ DỌN (PROCESSING)",
        );
      }

      const activeExisting = await tx.housekeepingTask.findFirst({
        where: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          status: {
            in: [
              HousekeepingTaskStatus.QUEUED,
              HousekeepingTaskStatus.CLAIMED,
              HousekeepingTaskStatus.IN_PROGRESS,
              HousekeepingTaskStatus.BLOCKED,
            ],
          },
        },
      });
      if (activeExisting) {
        throw new ConflictException("Phòng này hiện đã có công việc dọn phòng đang hoạt động");
      }

      const task = await tx.housekeepingTask.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          stayId: input.stayId ?? null,
          status: HousekeepingTaskStatus.QUEUED,
          priority: input.priority ?? HousekeepingTaskPriority.NORMAL,
          notes: input.notes ?? null,
          version: 1,
        },
        include: taskInclude,
      });

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: task.id,
          fromStatus: null,
          toStatus: HousekeepingTaskStatus.QUEUED,
          actorUserId: input.actorUserId ?? null,
          reason: "MANUAL_CREATION",
          notes: input.notes ?? null,
        },
      });

      await tx.housekeepingNotification.create({
        data: {
          hotelId: input.hotelId,
          taskId: task.id,
          title: "Yêu cầu dọn phòng mới",
          message: `Phòng ${room.roomNumber} cần dọn dẹp`,
          status: HousekeepingNotificationStatus.UNREAD,
        },
      });

      return task;
    });

    emitHousekeepingTaskRealtime(() =>
      RequestRealtimeEmitter.emitHousekeepingTaskCreated(
        toHousekeepingTaskEventPayload(task, null, {
          reason: "MANUAL_CREATION",
          notes: input.notes ?? null,
        }),
      ),
    );
    return task;
  }

  async claimTask(input: {
    hotelId: string;
    taskId: string;
    actorUserId: string;
    expectedVersion?: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({
        where: { id: input.taskId, hotelId: input.hotelId },
        include: taskInclude,
      });
      if (!task) {
        throw new NotFoundException("Không tìm thấy công việc buồng phòng");
      }

      // Idempotency: if already claimed by this actor
      if (
        task.status === HousekeepingTaskStatus.CLAIMED &&
        task.assignedToUserId === input.actorUserId
      ) {
        return { task, changed: false as const };
      }

      // Stale state / version conflict
      if (input.expectedVersion !== undefined && task.version !== input.expectedVersion) {
        throw new ConflictException(
          "Công việc buồng phòng đã bị thay đổi bởi người khác (xung đột phiên bản)",
        );
      }

      if (task.status === HousekeepingTaskStatus.CLAIMED) {
        throw new ConflictException("Công việc này đã được nhận bởi nhân viên khác");
      }
      if (task.status === HousekeepingTaskStatus.IN_PROGRESS) {
        throw new ConflictException("Công việc đang trong tiến trình xử lý");
      }
      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        throw new ConflictException("Công việc đã hoàn thành");
      }
      if (task.status === HousekeepingTaskStatus.BLOCKED) {
        throw new ConflictException("Công việc đang bị tạm dừng (BLOCKED)");
      }
      if (task.status !== HousekeepingTaskStatus.QUEUED) {
        throw new ConflictException(`Không thể nhận việc từ trạng thái ${task.status}`);
      }

      const now = new Date();
      const updated = await tx.housekeepingTask.updateMany({
        where: {
          id: input.taskId,
          hotelId: input.hotelId,
          status: HousekeepingTaskStatus.QUEUED,
          ...(input.expectedVersion ? { version: input.expectedVersion } : {}),
        },
        data: {
          status: HousekeepingTaskStatus.CLAIMED,
          assignedToUserId: input.actorUserId,
          assignedAt: now,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException("Xung đột đồng thời khi nhận việc");
      }

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: input.taskId,
          fromStatus: HousekeepingTaskStatus.QUEUED,
          toStatus: HousekeepingTaskStatus.CLAIMED,
          actorUserId: input.actorUserId,
          reason: "CLAIMED",
        },
      });

      return {
        task: await tx.housekeepingTask.findUniqueOrThrow({
          where: { id: input.taskId },
          include: taskInclude,
        }),
        changed: true as const,
        previousStatus: HousekeepingTaskStatus.QUEUED,
      };
    });

    if (result.changed) {
      emitHousekeepingTaskRealtime(() =>
        RequestRealtimeEmitter.emitHousekeepingTaskClaimed(
          toHousekeepingTaskEventPayload(result.task, result.previousStatus, {
            reason: "CLAIMED",
          }),
        ),
      );
    }
    return result.task;
  }

  async startTask(input: {
    hotelId: string;
    taskId: string;
    actorUserId: string;
    expectedVersion?: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({
        where: { id: input.taskId, hotelId: input.hotelId },
        include: taskInclude,
      });
      if (!task) {
        throw new NotFoundException("Không tìm thấy công việc buồng phòng");
      }

      // Idempotency: if already in progress by this actor
      if (
        task.status === HousekeepingTaskStatus.IN_PROGRESS &&
        task.assignedToUserId === input.actorUserId
      ) {
        return { task, changed: false as const };
      }

      // Stale state / version conflict
      if (input.expectedVersion !== undefined && task.version !== input.expectedVersion) {
        throw new ConflictException("Phiên bản công việc đã cũ, vui lòng tải lại");
      }

      if (task.status === HousekeepingTaskStatus.BLOCKED) {
        throw new ConflictException(
          "Công việc đang bị tạm dừng (BLOCKED), cần mở lại trước khi bắt đầu",
        );
      }
      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        throw new ConflictException("Công việc đã hoàn thành");
      }
      if (
        task.assignedToUserId &&
        task.assignedToUserId !== input.actorUserId &&
        task.status === HousekeepingTaskStatus.CLAIMED
      ) {
        throw new ConflictException("Công việc đã được nhận bởi nhân viên khác");
      }

      const now = new Date();
      const updated = await tx.housekeepingTask.updateMany({
        where: {
          id: input.taskId,
          hotelId: input.hotelId,
          status: { in: [HousekeepingTaskStatus.CLAIMED, HousekeepingTaskStatus.QUEUED] },
          ...(input.expectedVersion ? { version: input.expectedVersion } : {}),
        },
        data: {
          status: HousekeepingTaskStatus.IN_PROGRESS,
          assignedToUserId: task.assignedToUserId ?? input.actorUserId,
          assignedAt: task.assignedAt ?? now,
          startedAt: now,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException("Xung đột đồng thời khi bắt đầu công việc");
      }

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: input.taskId,
          fromStatus: task.status,
          toStatus: HousekeepingTaskStatus.IN_PROGRESS,
          actorUserId: input.actorUserId,
          reason: "STARTED",
        },
      });

      return {
        task: await tx.housekeepingTask.findUniqueOrThrow({
          where: { id: input.taskId },
          include: taskInclude,
        }),
        changed: true as const,
        previousStatus: task.status,
        reason: "STARTED",
      };
    });

    if (result.changed) {
      emitHousekeepingTaskRealtime(() =>
        RequestRealtimeEmitter.emitHousekeepingTaskStarted(
          toHousekeepingTaskEventPayload(result.task, result.previousStatus, {
            reason: result.reason,
          }),
        ),
      );
    }
    return result.task;
  }

  async blockTask(input: {
    hotelId: string;
    taskId: string;
    actorUserId: string;
    reason: string;
    notes?: string;
    expectedVersion?: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({
        where: { id: input.taskId, hotelId: input.hotelId },
        include: taskInclude,
      });
      if (!task) {
        throw new NotFoundException("Không tìm thấy công việc buồng phòng");
      }

      // Idempotency: if already blocked with same reason
      if (
        task.status === HousekeepingTaskStatus.BLOCKED &&
        task.blockReason === input.reason
      ) {
        return { task, changed: false as const };
      }

      // Stale state / version conflict
      if (input.expectedVersion !== undefined && task.version !== input.expectedVersion) {
        throw new ConflictException("Phiên bản công việc đã cũ, vui lòng tải lại");
      }

      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        throw new ConflictException("Không thể tạm dừng công việc đã hoàn thành");
      }
      if (task.status === HousekeepingTaskStatus.CANCELLED) {
        throw new ConflictException("Không thể tạm dừng công việc đã bị hủy");
      }

      const now = new Date();
      const updated = await tx.housekeepingTask.updateMany({
        where: {
          id: input.taskId,
          hotelId: input.hotelId,
          status: {
            in: [
              HousekeepingTaskStatus.QUEUED,
              HousekeepingTaskStatus.CLAIMED,
              HousekeepingTaskStatus.IN_PROGRESS,
            ],
          },
          ...(input.expectedVersion ? { version: input.expectedVersion } : {}),
        },
        data: {
          status: HousekeepingTaskStatus.BLOCKED,
          blockedAt: now,
          blockReason: input.reason,
          notes: input.notes ?? task.notes,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException("Xung đột đồng thời khi tạm dừng công việc");
      }

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: input.taskId,
          fromStatus: task.status,
          toStatus: HousekeepingTaskStatus.BLOCKED,
          actorUserId: input.actorUserId,
          reason: input.reason,
          notes: input.notes ?? null,
        },
      });

      return {
        task: await tx.housekeepingTask.findUniqueOrThrow({
          where: { id: input.taskId },
          include: taskInclude,
        }),
        changed: true as const,
        previousStatus: task.status,
      };
    });

    if (result.changed) {
      emitHousekeepingTaskRealtime(() =>
        RequestRealtimeEmitter.emitHousekeepingTaskBlocked(
          toHousekeepingTaskEventPayload(result.task, result.previousStatus, {
            reason: input.reason,
            notes: input.notes ?? null,
          }),
        ),
      );
    }
    return result.task;
  }

  async completeTask(input: {
    hotelId: string;
    taskId: string;
    actorUserId: string;
    notes?: string;
    expectedVersion?: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({
        where: { id: input.taskId, hotelId: input.hotelId },
        include: taskInclude,
      });
      if (!task) {
        throw new NotFoundException("Không tìm thấy công việc buồng phòng");
      }

      // Idempotency: if already completed and room is AVAILABLE
      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        const room = await tx.room.findUnique({ where: { id: task.roomId } });
        if (room?.status === RoomStatus.AVAILABLE) {
          return { task, changed: false as const };
        }
        throw new ConflictException(
          `Công việc đã hoàn thành nhưng phòng hiện đang ở trạng thái ${room?.status}`,
        );
      }

      // Stale state / version conflict
      if (input.expectedVersion !== undefined && task.version !== input.expectedVersion) {
        throw new ConflictException("Phiên bản công việc đã cũ, vui lòng tải lại");
      }

      if (task.status === HousekeepingTaskStatus.BLOCKED) {
        throw new ConflictException(
          "Công việc đang bị tạm dừng (BLOCKED), vui lòng mở lại trước khi hoàn tất",
        );
      }

      // Invariant: Completion only changes PROCESSING -> AVAILABLE; it must not bypass blocked/maintenance/occupied/reserved conflicts.
      const room = await tx.room.findFirst({
        where: { id: task.roomId, hotelId: input.hotelId },
        select: { id: true, status: true, roomNumber: true },
      });
      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng liên kết với công việc");
      }
      if (room.status !== RoomStatus.PROCESSING) {
        throw new ConflictException(
          `Không thể hoàn thành dọn phòng: phòng đang ở trạng thái ${room.status}, chỉ được phép hoàn thành khi phòng ở trạng thái CHỜ DỌN (PROCESSING)`,
        );
      }

      const roomUpdate = await tx.room.updateMany({
        where: {
          id: task.roomId,
          hotelId: input.hotelId,
          status: RoomStatus.PROCESSING,
        },
        data: {
          status: RoomStatus.AVAILABLE,
        },
      });
      if (roomUpdate.count !== 1) {
        throw new ConflictException(
          "Trạng thái phòng đã thay đổi trong quá trình hoàn tất dọn phòng",
        );
      }

      const now = new Date();
      const updated = await tx.housekeepingTask.updateMany({
        where: {
          id: input.taskId,
          hotelId: input.hotelId,
          status: {
            in: [
              HousekeepingTaskStatus.QUEUED,
              HousekeepingTaskStatus.CLAIMED,
              HousekeepingTaskStatus.IN_PROGRESS,
            ],
          },
          ...(input.expectedVersion ? { version: input.expectedVersion } : {}),
        },
        data: {
          status: HousekeepingTaskStatus.COMPLETED,
          completedAt: now,
          notes: input.notes ?? task.notes,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException("Xung đột đồng thời khi hoàn thành công việc");
      }

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: input.taskId,
          fromStatus: task.status,
          toStatus: HousekeepingTaskStatus.COMPLETED,
          actorUserId: input.actorUserId,
          reason: "COMPLETED",
          notes: input.notes ?? null,
        },
      });

      return {
        task: await tx.housekeepingTask.findUniqueOrThrow({
          where: { id: input.taskId },
          include: taskInclude,
        }),
        changed: true as const,
        previousStatus: task.status,
      };
    });

    if (result.changed) {
      emitHousekeepingTaskRealtime(() =>
        RequestRealtimeEmitter.emitHousekeepingTaskCompleted(
          toHousekeepingTaskEventPayload(result.task, result.previousStatus, {
            reason: "COMPLETED",
            notes: input.notes ?? null,
          }),
        ),
      );
    }
    return result.task;
  }

  async reopenTask(input: {
    hotelId: string;
    taskId: string;
    actorUserId: string;
    reason?: string;
    expectedVersion?: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({
        where: { id: input.taskId, hotelId: input.hotelId },
        include: taskInclude,
      });
      if (!task) {
        throw new NotFoundException("Không tìm thấy công việc buồng phòng");
      }

      // Stale state / version conflict
      if (input.expectedVersion !== undefined && task.version !== input.expectedVersion) {
        throw new ConflictException("Phiên bản công việc đã cũ, vui lòng tải lại");
      }

      if (
        task.status !== HousekeepingTaskStatus.BLOCKED &&
        task.status !== HousekeepingTaskStatus.COMPLETED
      ) {
        throw new ConflictException(
          `Chỉ có thể mở lại công việc đang ở trạng thái BLOCKED hoặc COMPLETED (trạng thái hiện tại: ${task.status})`,
        );
      }

      // If reopening from COMPLETED, check room status: must not bypass occupied/reserved/maintenance/blocked conflicts
      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        const room = await tx.room.findFirst({
          where: { id: task.roomId, hotelId: input.hotelId },
          select: { id: true, status: true },
        });
        if (
          room &&
          room.status !== RoomStatus.AVAILABLE &&
          room.status !== RoomStatus.PROCESSING
        ) {
          throw new ConflictException(
            `Không thể mở lại công việc khi phòng đang ở trạng thái ${room.status}`,
          );
        }
        if (room && room.status === RoomStatus.AVAILABLE) {
          await tx.room.updateMany({
            where: { id: task.roomId, hotelId: input.hotelId, status: RoomStatus.AVAILABLE },
            data: { status: RoomStatus.PROCESSING },
          });
        }
      }

      const targetStatus = task.assignedToUserId
        ? HousekeepingTaskStatus.IN_PROGRESS
        : HousekeepingTaskStatus.QUEUED;

      const updated = await tx.housekeepingTask.updateMany({
        where: {
          id: input.taskId,
          hotelId: input.hotelId,
          status: task.status,
          ...(input.expectedVersion ? { version: input.expectedVersion } : {}),
        },
        data: {
          status: targetStatus,
          completedAt: null,
          blockedAt: null,
          blockReason: null,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException("Xung đột đồng thời khi mở lại công việc");
      }

      await tx.housekeepingTaskHistory.create({
        data: {
          taskId: input.taskId,
          fromStatus: task.status,
          toStatus: targetStatus,
          actorUserId: input.actorUserId,
          reason: input.reason ?? "REOPENED",
        },
      });

      return {
        task: await tx.housekeepingTask.findUniqueOrThrow({
          where: { id: input.taskId },
          include: taskInclude,
        }),
        changed: true as const,
        previousStatus: task.status,
      };
    });

    emitHousekeepingTaskRealtime(() =>
      RequestRealtimeEmitter.emitHousekeepingTaskReopened(
        toHousekeepingTaskEventPayload(result.task, result.previousStatus, {
          reason: input.reason ?? "REOPENED",
        }),
      ),
    );
    return result.task;
  }

  async listNotifications(
    hotelId: string,
    filter: { status?: HousekeepingNotificationStatus },
    limit = 20,
  ) {
    return this.prisma.housekeepingNotification.findMany({
      where: {
        hotelId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async markNotificationRead(hotelId: string, notificationId: string) {
    const notification = await this.prisma.housekeepingNotification.findFirst({
      where: { id: notificationId, hotelId },
    });
    if (!notification) {
      throw new NotFoundException("Không tìm thấy thông báo");
    }

    return this.prisma.housekeepingNotification.update({
      where: { id: notificationId },
      data: {
        status: HousekeepingNotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }
}
