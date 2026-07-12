import { CategoryPriceUpdateMode, ServiceCatalogStatus } from "@prisma/client";
import { z } from "zod";
import { jsonRecordSchema } from "./shared.schema";

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

export type ListServiceCategoriesQueryInput = z.infer<typeof listServiceCategoriesQuerySchema>;
export type CreateServiceCategoryBodyInput = z.infer<typeof createServiceCategoryBodySchema>;
export type UpdateServiceCategoryBodyInput = z.infer<typeof updateServiceCategoryBodySchema>;
export type ListServiceItemsQueryInput = z.infer<typeof listServiceItemsQuerySchema>;
export type CreateServiceItemBodyInput = z.infer<typeof createServiceItemBodySchema>;
export type UpdateServiceItemBodyInput = z.infer<typeof updateServiceItemBodySchema>;
