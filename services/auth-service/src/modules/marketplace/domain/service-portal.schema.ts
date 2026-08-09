import { z } from "zod";

const httpUrl = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const profileFields = {
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullish(),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(255).nullish(),
  googleMapsUrl: httpUrl.nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  locationAccuracyMeters: z.number().nonnegative().nullish(),
  locationSource: z.enum(["DEVICE_GEOLOCATION", "GOOGLE_MAPS_URL", "MANUAL"]).nullish(),
  coverImageUrl: httpUrl.nullish(),
};
export const serviceProfileBodySchema = z.object(profileFields).partial().superRefine((value, context) => {
  if ((value.latitude == null) !== (value.longitude == null)) context.addIssue({ code: "custom", message: "latitude and longitude must be provided together" });
});
const serviceFields = {
  categoryId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullish(),
  unitPrice: z.number().nonnegative(),
  imageUrls: z.array(httpUrl).max(10).default([]),
  mode: z.enum(["DELIVERY_TO_HOTEL", "CUSTOMER_AT_SERVICE"]),
  capacityAvailable: z.number().int().nonnegative().nullish(),
  waitingMinutes: z.number().int().nonnegative().default(0),
  status: z.enum(["DRAFT", "ACTIVE", "DISABLED"]).default("DRAFT"),
};
export const marketplaceServiceBodySchema = z.object(serviceFields);
export const marketplaceServiceUpdateSchema = z.object(serviceFields).partial().refine((value) => Object.keys(value).length > 0);
export const marketplaceAvailabilitySchema = z.object({ capacityAvailable: z.number().int().nonnegative().nullish(), waitingMinutes: z.number().int().nonnegative() });
export const servicePortalIdSchema = z.string().trim().min(1).max(80);
export type ServiceProfileBody = z.infer<typeof serviceProfileBodySchema>;
export type MarketplaceServiceBody = z.infer<typeof marketplaceServiceBodySchema>;
export type MarketplaceServiceUpdate = z.infer<typeof marketplaceServiceUpdateSchema>;
export type MarketplaceAvailability = z.infer<typeof marketplaceAvailabilitySchema>;
