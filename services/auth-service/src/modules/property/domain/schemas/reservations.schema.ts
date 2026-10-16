import { z } from "zod";
import {
  identityNumberSchema,
  normalizeDateStringToIso,
  stayOccupantInputSchema,
} from "./rooms.schema";

export const nightlyRateSnapshotSchema = z
  .union([
    z.number().finite().nonnegative("Giá không được là số âm").max(999_999_999_999.99),
    z
      .string()
      .trim()
      .refine(
        (val) => {
          if (!val) return false;
          const num = Number(val);
          return !isNaN(num) && num >= 0 && num <= 999_999_999_999.99;
        },
        { message: "Giá không được là số âm" },
      ),
  ])
  .nullable()
  .optional();

export const createReservationBodySchema = z
  .object({
    guestDisplayName: z.string().trim().min(2).max(120),
    guestPhone: z.string().trim().max(40).optional(),
    plannedCheckInAt: z.coerce.date(),
    plannedCheckOutAt: z.coerce.date(),
    roomId: z.string().trim().min(1).nullable().optional(),
    rate: nightlyRateSnapshotSchema,
    nightlyRateSnapshot: nightlyRateSnapshotSchema,
  })
  .strict()
  .refine((value) => value.plannedCheckOutAt > value.plannedCheckInAt, {
    message: "plannedCheckOutAt phải sau plannedCheckInAt",
    path: ["plannedCheckOutAt"],
  });

export const listArrivalsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((value) => value.to > value.from, {
    message: "to phải sau from",
    path: ["to"],
  });

export const assignReservationRoomBodySchema = z
  .object({
    roomId: z.string().trim().min(1),
    rate: nightlyRateSnapshotSchema,
    nightlyRateSnapshot: nightlyRateSnapshotSchema,
  })
  .strict();

export const checkInReservationBodySchema = z
  .object({
    guestDisplayName: z.string().trim().min(2).max(120).optional(),
    guestPhone: z.string().trim().max(40).optional(),
    guestIdentityNumber: identityNumberSchema.optional(),
    guestDateOfBirth: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((v) => (v ? (normalizeDateStringToIso(v) ?? v) : v)),
    guestGender: z.string().trim().max(20).optional(),
    guestNationality: z.string().trim().max(80).optional(),
    guestResidencePlace: z.string().trim().max(500).optional(),
    plannedCheckOutAt: z.coerce.date().optional(),
    occupants: z.array(stayOccupantInputSchema).optional(),
  })
  .strict();

export const createBulkReservationsBodySchema = z
  .object({
    leadGuestName: z
      .string()
      .trim()
      .min(2, "Tên khách đại diện tối thiểu 2 ký tự")
      .max(120, "Tên khách đại diện tối đa 120 ký tự")
      .optional(),
    guestDisplayName: z.string().trim().min(2).max(120).optional(),
    leadGuestPhone: z.string().trim().max(40).optional(),
    guestPhone: z.string().trim().max(40).optional(),
    checkInDate: z.coerce.date().optional(),
    checkOutDate: z.coerce.date().optional(),
    plannedCheckInAt: z.coerce.date().optional(),
    plannedCheckOutAt: z.coerce.date().optional(),
    roomIds: z
      .array(z.string().trim().min(1, "roomId không được để trống"))
      .min(2, "Số lượng phòng đặt theo đoàn tối thiểu là 2")
      .max(50, "Số lượng phòng đặt theo đoàn tối đa là 50")
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "Danh sách roomIds không được chứa phòng trùng lặp",
      }),
    groupCode: z.string().trim().max(80).optional(),
    idempotencyKey: z.string().trim().max(120).optional(),
    rate: nightlyRateSnapshotSchema,
    nightlyRateSnapshot: nightlyRateSnapshotSchema,
  })
  .strict()
  .refine(
    (data) =>
      Boolean(
        (data.leadGuestName && data.leadGuestName.length >= 2) ||
        (data.guestDisplayName && data.guestDisplayName.length >= 2),
      ),
    {
      message: "leadGuestName hoặc guestDisplayName là bắt buộc và tối thiểu 2 ký tự",
      path: ["leadGuestName"],
    },
  )
  .refine((data) => Boolean(data.checkInDate || data.plannedCheckInAt), {
    message: "checkInDate hoặc plannedCheckInAt là bắt buộc",
    path: ["checkInDate"],
  })
  .refine((data) => Boolean(data.checkOutDate || data.plannedCheckOutAt), {
    message: "checkOutDate hoặc plannedCheckOutAt là bắt buộc",
    path: ["checkOutDate"],
  })
  .refine(
    (data) => {
      const checkIn = data.checkInDate ?? data.plannedCheckInAt;
      const checkOut = data.checkOutDate ?? data.plannedCheckOutAt;
      if (!checkIn || !checkOut) return false;
      return checkOut.getTime() > checkIn.getTime();
    },
    {
      message: "Ngày trả phòng phải sau ngày nhận phòng",
      path: ["checkOutDate"],
    },
  );

export type CreateReservationBodyInput = z.infer<typeof createReservationBodySchema>;
export type ListArrivalsQueryInput = z.infer<typeof listArrivalsQuerySchema>;
export type AssignReservationRoomBodyInput = z.infer<typeof assignReservationRoomBodySchema>;
export type CheckInReservationBodyInput = z.infer<typeof checkInReservationBodySchema>;
export type CreateBulkReservationsBodyInput = z.infer<typeof createBulkReservationsBodySchema>;
export const createGroupReservationsBodySchema = createBulkReservationsBodySchema;
export type CreateGroupReservationsBodyInput = CreateBulkReservationsBodyInput;
