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
    roomTypeId: z.string().trim().min(1).optional(),
    autoAssign: z.boolean().optional(),
    guestCount: z.coerce.number().int().min(1).max(50).optional(),
    notes: z.string().trim().max(500).optional(),
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
    expectedUpdatedAt: z.coerce.date().or(z.string()).optional(),
    expectedRoomId: z.string().trim().min(1).nullable().optional(),
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
    allowEarlyCheckIn: z.boolean().optional(),
    allowLateCheckIn: z.boolean().optional(),
    confirmEarlyCheckIn: z.boolean().optional(),
    confirmLateCheckIn: z.boolean().optional(),
    expectedUpdatedAt: z.coerce.date().or(z.string()).optional(),
    expectedRoomId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const bulkAllocationItemSchema = z
  .object({
    roomTypeId: z.string().trim().min(1, "roomTypeId không được để trống"),
    quantity: z
      .number()
      .int("Số lượng phòng phải là số nguyên")
      .min(1, "Số lượng phòng tối thiểu là 1")
      .max(50, "Số lượng phòng tối đa là 50"),
    rate: nightlyRateSnapshotSchema,
    nightlyRateSnapshot: nightlyRateSnapshotSchema,
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
      .min(1, "Số lượng phòng tối thiểu là 1")
      .max(50, "Số lượng phòng đặt theo đoàn tối đa là 50")
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "Danh sách roomIds không được chứa phòng trùng lặp",
      })
      .optional(),
    allocations: z.array(bulkAllocationItemSchema).min(1).max(20).optional(),
    autoAssign: z.boolean().optional(),
    groupCode: z.string().trim().max(80).optional(),
    idempotencyKey: z.string().trim().max(120).optional(),
    rate: nightlyRateSnapshotSchema,
    nightlyRateSnapshot: nightlyRateSnapshotSchema,
    roomRates: z.record(z.string(), nightlyRateSnapshotSchema).optional(),
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
  )
  .refine(
    (data) => {
      const hasRoomIds = Boolean(data.roomIds && data.roomIds.length > 0);
      const hasAllocations = Boolean(data.allocations && data.allocations.length > 0);
      return hasRoomIds || hasAllocations;
    },
    {
      message: "Phải cung cấp danh sách roomIds hoặc allocations phân bổ loại phòng",
      path: ["roomIds"],
    },
  );

export type CreateReservationBodyInput = z.infer<typeof createReservationBodySchema>;
export type ListArrivalsQueryInput = z.infer<typeof listArrivalsQuerySchema>;
export type AssignReservationRoomBodyInput = z.infer<typeof assignReservationRoomBodySchema>;
export type CheckInReservationBodyInput = z.infer<typeof checkInReservationBodySchema>;
export type CreateBulkReservationsBodyInput = z.infer<typeof createBulkReservationsBodySchema>;
export const createGroupReservationsBodySchema = createBulkReservationsBodySchema;
export type CreateGroupReservationsBodyInput = CreateBulkReservationsBodyInput;

export const cancelReservationBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const markNoShowBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type CancelReservationBodyInput = z.infer<typeof cancelReservationBodySchema>;
export type MarkNoShowBodyInput = z.infer<typeof markNoShowBodySchema>;
export type CancelReservationDto = CancelReservationBodyInput;
export type MarkNoShowDto = MarkNoShowBodyInput;

export const roomPlanQuerySchema = z
  .object({
    from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày bắt đầu YYYY-MM-DD"),
    to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày kết thúc YYYY-MM-DD"),
  })
  .strict()
  .refine(
    (data) => {
      const fromDate = new Date(`${data.from}T00:00:00.000Z`);
      const toDate = new Date(`${data.to}T23:59:59.999Z`);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return false;
      const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 31;
    },
    {
      message: "Khoảng thời gian không hợp lệ hoặc vượt quá giới hạn 31 ngày",
      path: ["to"],
    },
  );

export type RoomPlanQueryInput = z.infer<typeof roomPlanQuerySchema>;

export const updateReservationPlacementBodySchema = z
  .object({
    targetRoomId: z.string().trim().min(1, "targetRoomId là bắt buộc"),
    expectedUpdatedAt: z.string().trim().min(1, "expectedUpdatedAt là bắt buộc"),
    swapWithReservationId: z.string().trim().min(1).optional(),
    swapExpectedUpdatedAt: z.string().trim().min(1).optional(),
  })
  .strict();

export type UpdateReservationPlacementBodyInput = z.infer<
  typeof updateReservationPlacementBodySchema
>;
