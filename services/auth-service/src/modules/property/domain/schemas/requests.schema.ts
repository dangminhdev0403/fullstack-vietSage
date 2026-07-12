import { GuestRequestStatus } from "@prisma/client";
import { z } from "zod";
import { jsonRecordSchema } from "./shared.schema";

export const guestRequestPriorityValues = ["NORMAL", "URGENT"] as const;
export const guestRequestPrioritySchema = z.enum(guestRequestPriorityValues);

export const listStaffRequestsQuerySchema = z
  .object({
    roomNumber: z.string().trim().min(1).optional(),
    serviceItemId: z.string().trim().min(1).optional(),
    priority: guestRequestPrioritySchema.optional(),
    status: z.nativeEnum(GuestRequestStatus).optional(),
    assignedToUserId: z.string().trim().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const requestSummaryQuerySchema = z
  .object({
    roomNumber: z.string().trim().min(1).optional(),
    serviceItemId: z.string().trim().min(1).optional(),
    priority: guestRequestPrioritySchema.optional(),
    assignedToUserId: z.string().trim().min(1).optional(),
  })
  .strict();

export const updateRequestStatusBodySchema = z
  .object({
    status: z.nativeEnum(GuestRequestStatus),
    note: z.string().trim().max(1000).optional(),
    assignedToUserId: z.string().trim().min(1).optional(),
    priority: guestRequestPrioritySchema.optional(),
  })
  .strict();

export const updateRequestAssignmentBodySchema = z
  .object({
    assignedToUserId: z.string().trim().min(1).nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const createRequestEventBodySchema = z
  .object({
    note: z.string().trim().min(1).max(1000),
    metadata: jsonRecordSchema.optional(),
  })
  .strict();

export type ListStaffRequestsQueryInput = z.infer<typeof listStaffRequestsQuerySchema>;
export type RequestSummaryQueryInput = z.infer<typeof requestSummaryQuerySchema>;
export type UpdateRequestStatusBodyInput = z.infer<typeof updateRequestStatusBodySchema>;
export type UpdateRequestAssignmentBodyInput = z.infer<typeof updateRequestAssignmentBodySchema>;
export type CreateRequestEventBodyInput = z.infer<typeof createRequestEventBodySchema>;
