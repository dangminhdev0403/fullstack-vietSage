import { z } from "zod";

const id = z.string().trim().min(1).max(80);
const httpUrl = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const location = {
  googleMapsUrl: httpUrl.nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  locationAccuracyMeters: z.number().nonnegative().nullish(),
  locationSource: z.enum(["DEVICE_GEOLOCATION", "GOOGLE_MAPS_URL", "MANUAL"]).nullish(),
};


export const marketplaceIdSchema = id;
export const marketplaceCategoryBodySchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  nameVi: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(80).nullish(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const marketplaceCategoryUpdateSchema = marketplaceCategoryBodySchema.partial().refine((v) => Object.keys(v).length > 0);
export const serviceTenantBodySchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullish(),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(255).nullish(),
  coverImageUrl: httpUrl.nullish(),
  owner: z.object({
    email: z.string().trim().email().max(320),
    fullName: z.string().trim().min(2).max(120),
    password: z.string().min(8).max(128),
  }),
  ...location,
}).superRefine((value, context) => {
  if ((value.latitude == null) !== (value.longitude == null)) {
    context.addIssue({ code: "custom", message: "latitude and longitude must be provided together" });
  }
});
export const hotelServiceLinkBodySchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  sortOrder: z.number().int().min(0).default(0),
});
export const hotelLinksQuerySchema = z.object({ hotelId: id });

export type MarketplaceCategoryBody = z.infer<typeof marketplaceCategoryBodySchema>;
export type ServiceTenantBody = z.infer<typeof serviceTenantBodySchema>;
export type HotelServiceLinkBody = z.infer<typeof hotelServiceLinkBodySchema>;
