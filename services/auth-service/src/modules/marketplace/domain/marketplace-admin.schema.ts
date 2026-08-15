import { z } from "zod";

const id = z.string().trim().min(1).max(80);
const httpUrl = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const location = {
  googleMapsUrl: httpUrl.nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  locationAccuracyMeters: z.number().nonnegative().nullish(),
  locationSource: z.enum(["DEVICE_GEOLOCATION", "GOOGLE_MAPS_URL", "MANUAL"]).nullish(),
};

export const marketplaceIdSchema = id;
export const marketplaceCategoryBodySchema = z.object({
  nameVi: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  translations: z.record(z.string(), z.string().trim().min(1).max(120)).optional(),
});
export const marketplaceCategoryUpdateSchema = marketplaceCategoryBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const serviceTenantBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    categoryId: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1000).nullish(),
    phone: z.string().trim().max(40).nullish(),
    address: z.string().trim().max(255).nullish(),
    coverImageUrl: httpUrl.nullish(),
    googleSheetsUrl: z.string().trim().max(500).nullish(),
    owner: z.object({
      email: z.string().trim().email().max(320),
      fullName: z.string().trim().min(2).max(120),
      password: z.string().min(8).max(128),
    }),
    ...location,
  })
  .superRefine((value, context) => {
    if ((value.latitude == null) !== (value.longitude == null)) {
      context.addIssue({
        code: "custom",
        message: "latitude and longitude must be provided together",
      });
    }
  });
export const hotelServiceLinkBodySchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  sortOrder: z.number().int().min(0).default(0),
  commissionRate: z.number().min(0).max(100).optional(),
});
export const hotelLinksQuerySchema = z.object({ hotelId: id });
export const marketplacePricingConfigSchema = z.object({
  deliveryServiceFeeRate: z.number().min(0).max(100),
});

export const serviceTenantUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    categoryId: z.string().trim().min(1).max(80).optional(),
    status: z.string().trim().min(1).max(40).optional(),
    googleSheetsUrl: z.string().trim().max(500).nullish(),
    owner: z
      .object({
        email: z.string().trim().email().max(320).optional(),
        fullName: z.string().trim().min(2).max(120).optional(),
        password: z.string().min(8).max(128).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

export type MarketplaceCategoryBody = z.infer<typeof marketplaceCategoryBodySchema>;
export type ServiceTenantBody = z.infer<typeof serviceTenantBodySchema>;
export type ServiceTenantUpdateBody = z.infer<typeof serviceTenantUpdateSchema>;
export type HotelServiceLinkBody = z.infer<typeof hotelServiceLinkBodySchema>;
export type MarketplacePricingConfigBody = z.infer<typeof marketplacePricingConfigSchema>;
