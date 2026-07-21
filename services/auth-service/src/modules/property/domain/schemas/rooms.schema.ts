import { RoomQRCodeStatus, RoomStatus } from "@prisma/client";
import { z } from "zod";

export const createRoomBodySchema = z
  .object({
    roomNumber: z.string().trim().min(1).max(40),
    floor: z.string().trim().max(40).optional(),
    type: z.string().trim().max(80).optional(),
    price: z.coerce.number().nonnegative().optional(),
    maxActiveGuestDevices: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const createRoomsBodySchema = z
  .object({
    items: z.array(createRoomBodySchema).min(1).max(100),
  })
  .strict();

export const updateRoomBodySchema = z
  .object({
    roomNumber: z.string().trim().min(1).max(40).optional(),
    floor: z.string().trim().max(40).nullable().optional(),
    type: z.string().trim().max(80).nullable().optional(),
    price: z.coerce.number().nonnegative().nullable().optional(),
    maxActiveGuestDevices: z.coerce.number().int().min(1).nullable().optional(),
    status: z.nativeEnum(RoomStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường phòng",
  });

export const listRoomsQuerySchema = z
  .object({
    status: z.nativeEnum(RoomStatus).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().max(80).optional(),
    floor: z.string().max(40).optional(),
    type: z.string().max(80).optional(),
    vipOnly: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional(),
  })
  .strict();

export const createStayBodySchema = z
  .object({
    roomId: z.string().trim().min(1),
    guestDisplayName: z.string().trim().min(2).max(120),
    guestPhone: z.string().trim().max(40).optional(),
    plannedCheckInAt: z.coerce.date(),
    plannedCheckOutAt: z.coerce.date(),
  })
  .strict()
  .refine((value) => value.plannedCheckOutAt > value.plannedCheckInAt, {
    message: "plannedCheckOutAt phải sau plannedCheckInAt",
    path: ["plannedCheckOutAt"],
  });

export const checkOutBodySchema = z
  .object({
    nextRoomStatus: z
      .nativeEnum(RoomStatus)
      .refine((value) => value === RoomStatus.AVAILABLE || value === RoomStatus.MAINTENANCE, {
        message: "nextRoomStatus phải là AVAILABLE hoặc MAINTENANCE",
      })
      .optional(),
  })
  .strict();

export const qrReasonBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(255).optional(),
  })
  .strict();

export const qrStatusQuerySchema = z
  .object({
    status: z.nativeEnum(RoomQRCodeStatus).optional(),
  })
  .strict();

export type CreateRoomBodyInput = z.infer<typeof createRoomBodySchema>;
export type CreateRoomsBodyInput = z.infer<typeof createRoomsBodySchema>;
export type UpdateRoomBodyInput = z.infer<typeof updateRoomBodySchema>;
export type ListRoomsQueryInput = z.infer<typeof listRoomsQuerySchema>;
export type CreateStayBodyInput = z.infer<typeof createStayBodySchema>;
export type CheckOutBodyInput = z.infer<typeof checkOutBodySchema>;
export type QrReasonBodyInput = z.infer<typeof qrReasonBodySchema>;
