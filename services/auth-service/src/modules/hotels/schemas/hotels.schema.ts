import {
  CategoryPriceUpdateMode,
  GuestRequestStatus,
  HotelStatus,
  RoomQRCodeStatus,
  RoomStatus,
  ServiceCatalogStatus,
} from "@prisma/client";
import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const minQuantitySchema = z.coerce.number().int().min(1).optional();
const maxQuantitySchema = z.coerce.number().int().min(1).nullable().optional();

const serviceCategoryTranslationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const serviceItemTranslationSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const serviceCategoryTranslationsSchema = z
  .object({
    en: serviceCategoryTranslationSchema.optional(),
    zh: serviceCategoryTranslationSchema.optional(),
    ko: serviceCategoryTranslationSchema.optional(),
    ru: serviceCategoryTranslationSchema.optional(),
    hi: serviceCategoryTranslationSchema.optional(),
  })
  .strict()
  .optional();

const serviceItemTranslationsSchema = z
  .object({
    en: serviceItemTranslationSchema.optional(),
    zh: serviceItemTranslationSchema.optional(),
    ko: serviceItemTranslationSchema.optional(),
    ru: serviceItemTranslationSchema.optional(),
    hi: serviceItemTranslationSchema.optional(),
  })
  .strict()
  .optional();
export const guestRequestPriorityValues = ["NORMAL", "URGENT"] as const;
export const guestRequestPrioritySchema = z.enum(guestRequestPriorityValues);

export const hotelIdParamSchema = z.string().trim().min(1, "hotelId là bắt buộc");
export const roomIdParamSchema = z.string().trim().min(1, "roomId là bắt buộc");
export const stayIdParamSchema = z.string().trim().min(1, "stayId là bắt buộc");
export const requestIdParamSchema = z.string().trim().min(1, "requestId là bắt buộc");
export const serviceCategoryIdParamSchema = z.string().trim().min(1, "categoryId là bắt buộc");
export const serviceItemIdParamSchema = z.string().trim().min(1, "itemId là bắt buộc");

export const createHotelBodySchema = z
  .object({
    tenantId: z.string().max(80, "tenantId không được vượt quá 80 ký tự").optional(),
    name: z.string().trim().min(2).max(160),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.optional(),
  })
  .strict();

export const listHotelsQuerySchema = z
  .object({
    tenantId: z.string().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().max(120).optional(),
  })
  .strict();

export const updateHotelBodySchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.nullable().optional(),
    status: z.nativeEnum(HotelStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường khách sạn",
  });

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

export const listServiceCategoriesQuerySchema = z
  .object({
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export const createServiceCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    id_group: z.string().trim().min(1).max(128).nullable().optional(),
    defaultPrice: z.number().nonnegative(),
    currency: z.string().trim().length(3).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    translations: serviceCategoryTranslationsSchema,
  })
  .strict();

export const updateServiceCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    id_group: z.string().trim().min(1).max(128).nullable().optional(),
    defaultPrice: z.number().nonnegative().optional(),
    currency: z.string().trim().length(3).optional(),
    priceUpdateMode: z.nativeEnum(CategoryPriceUpdateMode).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    translations: serviceCategoryTranslationsSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.priceUpdateMode !== CategoryPriceUpdateMode.OVERRIDE_ALL_ITEMS ||
      value.defaultPrice !== undefined,
    {
      message: "defaultPrice là bắt buộc khi priceUpdateMode là OVERRIDE_ALL_ITEMS",
      path: ["defaultPrice"],
    },
  );

export const listServiceItemsQuerySchema = z
  .object({
    categoryId: z.string().trim().min(1).optional(),
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(160).optional(),
  })
  .strict();

export const createServiceItemBodySchema = z
  .object({
    categoryId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    priceOverride: z.number().nonnegative().optional(),
    quantityEnabled: z.boolean().optional(),
    minQuantity: minQuantitySchema,
    maxQuantity: maxQuantitySchema,
    metadata: jsonRecordSchema.optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    translations: serviceItemTranslationsSchema,
  })
  .strict()
  .refine((value) => value.maxQuantity == null || (value.minQuantity ?? 1) <= value.maxQuantity, {
    message: "maxQuantity phải lớn hơn hoặc bằng minQuantity",
    path: ["maxQuantity"],
  });

export const updateServiceItemBodySchema = z
  .object({
    categoryId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    priceOverride: z.number().nonnegative().nullable().optional(),
    quantityEnabled: z.boolean().optional(),
    minQuantity: minQuantitySchema,
    maxQuantity: maxQuantitySchema,
    metadata: jsonRecordSchema.nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.nativeEnum(ServiceCatalogStatus).optional(),
    translations: serviceItemTranslationsSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.maxQuantity == null ||
      value.minQuantity === undefined ||
      value.minQuantity <= value.maxQuantity,
    {
      message: "maxQuantity phải lớn hơn hoặc bằng minQuantity",
      path: ["maxQuantity"],
    },
  );

export const qrStatusQuerySchema = z
  .object({
    status: z.nativeEnum(RoomQRCodeStatus).optional(),
  })
  .strict();

export type CreateHotelBodyInput = z.infer<typeof createHotelBodySchema>;
export type ListHotelsQueryInput = z.infer<typeof listHotelsQuerySchema>;
export type UpdateHotelBodyInput = z.infer<typeof updateHotelBodySchema>;
export type CreateRoomBodyInput = z.infer<typeof createRoomBodySchema>;
export type CreateRoomsBodyInput = z.infer<typeof createRoomsBodySchema>;
export type UpdateRoomBodyInput = z.infer<typeof updateRoomBodySchema>;
export type ListRoomsQueryInput = z.infer<typeof listRoomsQuerySchema>;
export type CreateStayBodyInput = z.infer<typeof createStayBodySchema>;
export type CheckOutBodyInput = z.infer<typeof checkOutBodySchema>;
export type QrReasonBodyInput = z.infer<typeof qrReasonBodySchema>;
export type ListStaffRequestsQueryInput = z.infer<typeof listStaffRequestsQuerySchema>;
export type RequestSummaryQueryInput = z.infer<typeof requestSummaryQuerySchema>;
export type UpdateRequestStatusBodyInput = z.infer<typeof updateRequestStatusBodySchema>;
export type UpdateRequestAssignmentBodyInput = z.infer<typeof updateRequestAssignmentBodySchema>;
export type CreateRequestEventBodyInput = z.infer<typeof createRequestEventBodySchema>;
export type ListServiceCategoriesQueryInput = z.infer<typeof listServiceCategoriesQuerySchema>;
export type CreateServiceCategoryBodyInput = z.infer<typeof createServiceCategoryBodySchema>;
export type UpdateServiceCategoryBodyInput = z.infer<typeof updateServiceCategoryBodySchema>;
export type ListServiceItemsQueryInput = z.infer<typeof listServiceItemsQuerySchema>;
export type CreateServiceItemBodyInput = z.infer<typeof createServiceItemBodySchema>;
export type UpdateServiceItemBodyInput = z.infer<typeof updateServiceItemBodySchema>;
