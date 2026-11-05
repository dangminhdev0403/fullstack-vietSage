import { HotelStaffAssignmentStatus } from "@prisma/client";
import { z } from "zod";

export const listHotelStaffAssignmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.nativeEnum(HotelStaffAssignmentStatus).default(HotelStaffAssignmentStatus.ACTIVE),
  })
  .strict();

export const hotelStaffUserIdParamSchema = z.string().trim().min(1, "userId là bắt buộc");

export const assignStaffRoomBodySchema = z
  .object({
    roomId: z.string().trim().min(1, "roomId là bắt buộc"),
  })
  .strict();

export type ListHotelStaffAssignmentsQueryInput = z.infer<
  typeof listHotelStaffAssignmentsQuerySchema
>;

export type AssignStaffRoomBodyInput = z.infer<typeof assignStaffRoomBodySchema>;

export const housekeepingScopeSchema = z.object({
  mode: z.enum(["ALL", "FLOORS", "ROOMS"]),
  floors: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  roomIds: z.array(z.string().trim().min(1)).max(2000).default([]),
  label: z.string().trim().max(80).nullable().optional().transform((value) => value || null),
}).strict().superRefine((scope, context) => {
  if (scope.mode === "FLOORS" && scope.floors.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["floors"], message: "Chọn ít nhất một tầng" });
  }
  if (scope.mode === "ROOMS" && scope.roomIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["roomIds"], message: "Chọn ít nhất một phòng" });
  }
  if ((scope.mode !== "FLOORS" && scope.floors.length > 0) || (scope.mode !== "ROOMS" && scope.roomIds.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Phạm vi phân công không hợp lệ" });
  }
});

export type HousekeepingScopeInput = z.infer<typeof housekeepingScopeSchema>;
export type EffectiveHousekeepingScope = HousekeepingScopeInput & { allowedRoomIds: string[] | null };
