import type {
  HousekeepingNotificationStatus,
  HousekeepingTaskPriority,
  HousekeepingTaskStatus,
} from "@prisma/client";

export interface HousekeepingTaskHistoryDto {
  id: string;
  taskId: string;
  fromStatus: HousekeepingTaskStatus | null;
  toStatus: HousekeepingTaskStatus;
  actorUserId: string | null;
  actorName?: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface HousekeepingTaskDto {
  id: string;
  hotelId: string;
  roomId: string;
  roomNumber?: string;
  roomFloor?: string | null;
  roomTypeName?: string | null;
  stayId: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  assignedToUserId: string | null;
  assignedToName?: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  history?: HousekeepingTaskHistoryDto[];
}

export interface HousekeepingTasksSummaryDto {
  queued: number;
  claimed: number;
  inProgress: number;
  blocked: number;
  completed: number;
  totalActive: number;
}

export interface PaginatedHousekeepingTasksDto {
  items: HousekeepingTaskDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HousekeepingNotificationDto {
  id: string;
  hotelId: string;
  taskId: string;
  recipientUserId: string | null;
  title: string;
  message: string;
  status: HousekeepingNotificationStatus;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}
