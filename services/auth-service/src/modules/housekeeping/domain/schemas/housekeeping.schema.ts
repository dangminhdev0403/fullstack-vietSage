import { z } from "zod";

export const housekeepingTaskStatusValues = [
  "QUEUED",
  "CLAIMED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type HousekeepingTaskStatusType = (typeof housekeepingTaskStatusValues)[number];

export const housekeepingTaskPriorityValues = ["NORMAL", "URGENT"] as const;
export type HousekeepingTaskPriorityType = (typeof housekeepingTaskPriorityValues)[number];

export const housekeepingNotificationStatusValues = ["UNREAD", "READ", "DISMISSED"] as const;
export type HousekeepingNotificationStatusType = (typeof housekeepingNotificationStatusValues)[number];

export const taskIdParamSchema = z.string().trim().min(1, "Mã công việc không được để trống");
export const notificationIdParamSchema = z
  .string()
  .trim()
  .min(1, "Mã thông báo không được để trống");

export const listHousekeepingTasksQuerySchema = z
  .object({
    status: z.enum(housekeepingTaskStatusValues).optional(),
    priority: z.enum(housekeepingTaskPriorityValues).optional(),
    roomId: z.string().trim().min(1).optional(),
    assignedToUserId: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListHousekeepingTasksQueryInput = z.infer<typeof listHousekeepingTasksQuerySchema>;

export const createHousekeepingTaskBodySchema = z
  .object({
    roomId: z.string().trim().min(1, "Mã phòng không được để trống"),
    priority: z.enum(housekeepingTaskPriorityValues).default("NORMAL"),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateHousekeepingTaskBodyInput = z.infer<typeof createHousekeepingTaskBodySchema>;

export const claimHousekeepingTaskBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type ClaimHousekeepingTaskBodyInput = z.infer<typeof claimHousekeepingTaskBodySchema>;

export const startHousekeepingTaskBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type StartHousekeepingTaskBodyInput = z.infer<typeof startHousekeepingTaskBodySchema>;

export const blockHousekeepingTaskBodySchema = z
  .object({
    reason: z.string().trim().min(1, "Lý do tạm dừng không được để trống").max(500),
    notes: z.string().trim().max(1000).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type BlockHousekeepingTaskBodyInput = z.infer<typeof blockHousekeepingTaskBodySchema>;

export const completeHousekeepingTaskBodySchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type CompleteHousekeepingTaskBodyInput = z.infer<typeof completeHousekeepingTaskBodySchema>;

export const reopenHousekeepingTaskBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type ReopenHousekeepingTaskBodyInput = z.infer<typeof reopenHousekeepingTaskBodySchema>;

export const listHousekeepingNotificationsQuerySchema = z
  .object({
    status: z.enum(housekeepingNotificationStatusValues).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListHousekeepingNotificationsQueryInput = z.infer<
  typeof listHousekeepingNotificationsQuerySchema
>;
