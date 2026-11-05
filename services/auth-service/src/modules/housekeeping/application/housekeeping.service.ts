import { Injectable, NotFoundException } from "@nestjs/common";
import { HotelAccessService } from "../../property/property-public";
import type {
  BlockHousekeepingTaskBodyInput,
  ClaimHousekeepingTaskBodyInput,
  CompleteHousekeepingTaskBodyInput,
  CreateHousekeepingTaskBodyInput,
  ListHousekeepingNotificationsQueryInput,
  ListHousekeepingTasksQueryInput,
  ReopenHousekeepingTaskBodyInput,
  StartHousekeepingTaskBodyInput,
} from "../domain/schemas/housekeeping.schema";
import type {
  HousekeepingNotificationDto,
  HousekeepingTaskDto,
  HousekeepingTasksSummaryDto,
  PaginatedHousekeepingTasksDto,
} from "../domain/housekeeping.types";
import { HousekeepingRepository } from "../infrastructure/repositories/housekeeping.repository";

@Injectable()
export class HousekeepingService {
  constructor(
    private readonly housekeepingRepository: HousekeepingRepository,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async getScope(actorUserId: string, activeRoleId: string, hotelId: string) {
    return this.hotelAccessService.resolveHousekeepingScope(actorUserId, activeRoleId, hotelId);
  }

  private toRoomDto(room: NonNullable<Awaited<ReturnType<HousekeepingRepository["findRoom"]>>>) {
    return { id: room.id, hotelId: room.hotelId, roomNumber: room.roomNumber, floor: room.floor,
      status: room.status, updatedAt: room.updatedAt.toISOString(), roomTypeName: room.roomType?.name ?? null };
  }

  async getRoom(actorUserId: string, activeRoleId: string, hotelId: string, roomId: string) {
    await this.hotelAccessService.assertHousekeepingRoomAccess(actorUserId, activeRoleId, hotelId, roomId);
    const room = await this.housekeepingRepository.findRoom(hotelId, roomId);
    if (!room) throw new NotFoundException("Không tìm thấy phòng");
    return this.toRoomDto(room);
  }

  async getRoomByQr(actorUserId: string, activeRoleId: string, publicCode: string) {
    const room = await this.housekeepingRepository.findRoomByQr(publicCode);
    if (!room) throw new NotFoundException("Mã QR phòng không còn hiệu lực");
    await this.hotelAccessService.assertHousekeepingRoomAccess(actorUserId, activeRoleId, room.hotelId, room.id);
    return this.toRoomDto(room);
  }

  private async assertTaskAccess(actorUserId: string, activeRoleId: string, hotelId: string, taskId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const task = await this.housekeepingRepository.findById(hotelId, taskId);
    if (!task) throw new NotFoundException("Không tìm thấy công việc buồng phòng");
    await this.hotelAccessService.assertHousekeepingRoomAccess(actorUserId, activeRoleId, hotelId, task.roomId);
    return task;
  }

  private toTaskDto(task: any): HousekeepingTaskDto {
    return {
      id: task.id,
      hotelId: task.hotelId,
      roomId: task.roomId,
      roomNumber: task.room?.roomNumber,
      roomFloor: task.room?.floor ?? null,
      roomTypeName: task.room?.roomType?.name ?? null,
      stayId: task.stayId ?? null,
      status: task.status,
      priority: task.priority,
      assignedToUserId: task.assignedToUserId ?? null,
      assignedToName: task.assignedTo?.fullName ?? null,
      assignedAt: task.assignedAt ? new Date(task.assignedAt).toISOString() : null,
      startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : null,
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
      blockedAt: task.blockedAt ? new Date(task.blockedAt).toISOString() : null,
      blockReason: task.blockReason ?? null,
      notes: task.notes ?? null,
      version: task.version,
      createdAt: new Date(task.createdAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString(),
      history: task.history
        ? task.history.map((h: any) => ({
            id: h.id,
            taskId: h.taskId,
            fromStatus: h.fromStatus ?? null,
            toStatus: h.toStatus,
            actorUserId: h.actorUserId ?? null,
            actorName: h.actor?.fullName ?? null,
            reason: h.reason ?? null,
            notes: h.notes ?? null,
            createdAt: new Date(h.createdAt).toISOString(),
          }))
        : undefined,
    };
  }

  private toNotificationDto(notification: any): HousekeepingNotificationDto {
    return {
      id: notification.id,
      hotelId: notification.hotelId,
      taskId: notification.taskId,
      recipientUserId: notification.recipientUserId ?? null,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
      createdAt: new Date(notification.createdAt).toISOString(),
      updatedAt: new Date(notification.updatedAt).toISOString(),
    };
  }

  async listTasks(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListHousekeepingTasksQueryInput,
  ): Promise<PaginatedHousekeepingTasksDto> {
    const scope = await this.getScope(actorUserId, activeRoleId, hotelId);
    const result = await this.housekeepingRepository.listTasks(
      hotelId,
      {
        status: query.status,
        priority: query.priority,
        roomId: query.roomId,
        assignedToUserId: query.assignedToUserId,
        allowedRoomIds: scope.allowedRoomIds,
      },
      query.page,
      query.limit,
    );

    return {
      items: result.items.map((t) => this.toTaskDto(t)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  async getTasksSummary(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
  ): Promise<HousekeepingTasksSummaryDto> {
    const scope = await this.getScope(actorUserId, activeRoleId, hotelId);
    return this.housekeepingRepository.getSummary(hotelId, scope.allowedRoomIds);
  }

  async getTaskDetail(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
  ): Promise<HousekeepingTaskDto> {
    const task = await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    return this.toTaskDto(task);
  }

  async createTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    dto: CreateHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.hotelAccessService.assertHousekeepingRoomAccess(actorUserId, activeRoleId, hotelId, dto.roomId);
    const task = await this.housekeepingRepository.createTask({
      hotelId,
      roomId: dto.roomId,
      priority: dto.priority,
      notes: dto.notes,
      actorUserId,
    });
    return this.toTaskDto(task);
  }

  async claimTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
    dto: ClaimHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    const task = await this.housekeepingRepository.claimTask({
      hotelId,
      taskId,
      actorUserId,
      expectedVersion: dto.expectedVersion,
    });
    return this.toTaskDto(task);
  }

  async startTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
    dto: StartHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    const task = await this.housekeepingRepository.startTask({
      hotelId,
      taskId,
      actorUserId,
      expectedVersion: dto.expectedVersion,
    });
    return this.toTaskDto(task);
  }

  async blockTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
    dto: BlockHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    const task = await this.housekeepingRepository.blockTask({
      hotelId,
      taskId,
      actorUserId,
      reason: dto.reason,
      notes: dto.notes,
      expectedVersion: dto.expectedVersion,
    });
    return this.toTaskDto(task);
  }

  async completeTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
    dto: CompleteHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    const task = await this.housekeepingRepository.completeTask({
      hotelId,
      taskId,
      actorUserId,
      notes: dto.notes,
      expectedVersion: dto.expectedVersion,
    });
    return this.toTaskDto(task);
  }

  async reopenTask(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    taskId: string,
    dto: ReopenHousekeepingTaskBodyInput,
  ): Promise<HousekeepingTaskDto> {
    await this.assertTaskAccess(actorUserId, activeRoleId, hotelId, taskId);
    const task = await this.housekeepingRepository.reopenTask({
      hotelId,
      taskId,
      actorUserId,
      reason: dto.reason,
      expectedVersion: dto.expectedVersion,
    });
    return this.toTaskDto(task);
  }

  async listNotifications(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListHousekeepingNotificationsQueryInput,
  ): Promise<HousekeepingNotificationDto[]> {
    const scope = await this.getScope(actorUserId, activeRoleId, hotelId);
    const notifications = await this.housekeepingRepository.listNotifications(
      hotelId,
      { status: query.status, allowedRoomIds: scope.allowedRoomIds },
      query.limit,
    );
    return notifications.map((n) => this.toNotificationDto(n));
  }

  async markNotificationRead(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    notificationId: string,
  ): Promise<HousekeepingNotificationDto> {
    const scope = await this.getScope(actorUserId, activeRoleId, hotelId);
    const updated = await this.housekeepingRepository.markNotificationRead(hotelId, notificationId, scope.allowedRoomIds);
    return this.toNotificationDto(updated);
  }
}
