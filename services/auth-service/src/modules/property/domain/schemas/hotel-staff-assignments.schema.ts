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
