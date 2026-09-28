import { z } from "zod";

export const channelCodeEnum = z.enum([
  "AIRBNB_ICAL",
  "BOOKING_ICAL",
  "AGODA_ICAL",
  "DIRECT_BOOKING",
]);

export const channelConnectionStatusEnum = z.enum(["ACTIVE", "PAUSED", "ERROR"]);

export const channelRoomMappingItemSchema = z.object({
  roomId: z.string().nullable().optional(),
  roomType: z.string().min(1).max(80).nullable().optional(),
  channelRoomCode: z.string().min(1).max(120),
  channelRoomName: z.string().min(1).max(160),
});

export const createChannelConnectionSchema = z.object({
  channelCode: channelCodeEnum,
  title: z.string().min(1).max(160),
  inboundIcalUrl: z
    .string()
    .url("URL iCal không hợp lệ")
    .or(z.literal(""))
    .nullable()
    .optional(),
  priceMultiplier: z.coerce.number().min(0.01).max(100).default(1.0).optional(),
  roomMappings: z.array(channelRoomMappingItemSchema).default([]).optional(),
});

export const updateChannelConnectionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  status: channelConnectionStatusEnum.optional(),
  inboundIcalUrl: z
    .string()
    .url("URL iCal không hợp lệ")
    .or(z.literal(""))
    .nullable()
    .optional(),
  priceMultiplier: z.coerce.number().min(0.01).max(100).optional(),
  roomMappings: z.array(channelRoomMappingItemSchema).optional(),
});

export const availabilityItemSchema = z.object({
  roomType: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày không hợp lệ, yêu cầu YYYY-MM-DD"),
  totalRooms: z.number().int().min(0).optional(),
  bookedRooms: z.number().int().min(0).optional(),
  blockedRooms: z.number().int().min(0).optional(),
  availableRooms: z.number().int().min(0).optional(),
  overrideAvailable: z.number().int().min(0).nullable().optional(),
});

export const updateAvailabilitySchema = z.union([
  z.object({
    items: z.array(availabilityItemSchema).min(1, "Danh sách ngày cập nhật không được rỗng"),
  }),
  z
    .array(availabilityItemSchema)
    .min(1, "Danh sách ngày cập nhật không được rỗng")
    .transform((items) => ({ items })),
]);

export const restrictionItemSchema = z.object({
  roomType: z.string().min(1).max(80),
  ratePlanCode: z.string().min(1).max(80).default("STANDARD").optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày không hợp lệ, yêu cầu YYYY-MM-DD"),
  rate: z.coerce.number().min(0, "Giá không được nhỏ hơn 0"),
  minStayArrival: z.number().int().min(1).default(1).optional(),
  minStayThrough: z.number().int().min(1).default(1).optional(),
  maxStay: z.number().int().min(0).default(0).optional(),
  stopSell: z.boolean().default(false).optional(),
  closedToArrival: z.boolean().default(false).optional(),
  closedToDeparture: z.boolean().default(false).optional(),
});

export const updateRestrictionsSchema = z.union([
  z.object({
    items: z.array(restrictionItemSchema).min(1, "Danh sách cập nhật giá/hạn chế không được rỗng"),
  }),
  z
    .array(restrictionItemSchema)
    .min(1, "Danh sách cập nhật giá/hạn chế không được rỗng")
    .transform((items) => ({ items })),
]);

export const bulkUpdateRestrictionsSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày bắt đầu không hợp lệ, yêu cầu YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày kết thúc không hợp lệ, yêu cầu YYYY-MM-DD"),
  roomTypes: z.array(z.string().min(1).max(80)).min(1, "Vui lòng chọn ít nhất một hạng phòng"),
  ratePlanCode: z.string().min(1).max(80).default("STANDARD").optional(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .default([0, 1, 2, 3, 4, 5, 6])
    .optional(),
  rate: z.coerce.number().min(0).optional(),
  minStayArrival: z.number().int().min(1).optional(),
  minStayThrough: z.number().int().min(1).optional(),
  maxStay: z.number().int().min(0).optional(),
  stopSell: z.boolean().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
});

export const inventoryQuerySchema = z
  .object({
    date_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date_from phải có định dạng YYYY-MM-DD")
      .optional(),
    date_to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date_to phải có định dạng YYYY-MM-DD")
      .optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    roomType: z.string().optional(),
  })
  .refine(
    (val) => Boolean((val.date_from && val.date_to) || (val.startDate && val.endDate)),
    {
      message: "Vui lòng cung cấp khoảng ngày date_from và date_to (hoặc startDate và endDate)",
      path: ["date_from"],
    },
  )
  .transform((val) => ({
    date_from: val.date_from ?? val.startDate!,
    date_to: val.date_to ?? val.endDate!,
    roomType: val.roomType,
  }));

export const hotelIdParamSchema = z.string().min(1, "hotelId không được rỗng");
export const connectionIdParamSchema = z.string().min(1, "id kết nối không được rỗng");
export const icalTokenParamSchema = z.string().min(1, "token không được rỗng");

export type CreateChannelConnectionDto = z.infer<typeof createChannelConnectionSchema>;
export type UpdateChannelConnectionDto = z.infer<typeof updateChannelConnectionSchema>;
export type AvailabilityItemDto = z.infer<typeof availabilityItemSchema>;
export type UpdateAvailabilityDto = z.infer<typeof updateAvailabilitySchema>;
export type RestrictionItemDto = z.infer<typeof restrictionItemSchema>;
export type UpdateRestrictionsDto = z.infer<typeof updateRestrictionsSchema>;
export type BulkUpdateRestrictionsDto = z.infer<typeof bulkUpdateRestrictionsSchema>;
export type InventoryQueryDto = z.infer<typeof inventoryQuerySchema>;
