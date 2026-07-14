import { z } from "zod";

export const guestRequestStatusValues = [
  "CREATED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export const guestRequestStatusSchema = z.enum(guestRequestStatusValues);
export const guestRequestStatusFilterValues = guestRequestStatusValues;
export const guestRequestStatusFilterSchema = z.enum(guestRequestStatusFilterValues);
export const guestRequestPriorityValues = ["NORMAL", "URGENT"] as const;
export const guestRequestPrioritySchema = z.enum(guestRequestPriorityValues);

export const scanQrBodySchema = z
  .object({
    qrCode: z.string().trim().min(1).max(120),
    deviceFingerprint: z.string().trim().max(255).optional(),
    currentSessionToken: z.string().trim().min(1).max(255).optional(),
    forceSwitch: z.boolean().optional(),
  })
  .strict();

export const scanQrBodyOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["qrCode"],
  properties: {
    qrCode: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Opaque random room QR token. Not a JWT and does not encode IDs.",
    },
    deviceFingerprint: {
      type: "string",
      maxLength: 255,
      description: "Optional client/device identifier used for abuse correlation.",
    },
    currentSessionToken: {
      type: "string",
      maxLength: 255,
      description:
        "Existing guest session token on this device. Used to prevent silent room switching.",
    },
    forceSwitch: {
      type: "boolean",
      description:
        "When true, closes the current session and switches this device to the scanned room.",
    },
  },
};

export const createGuestRequestBodySchema = z
  .object({
    serviceItemId: z.string().trim().min(1),
    description: z.string().trim().max(1000).optional(),
    details: z.string().trim().max(1000).optional(),
    quantity: z.coerce.number().int().min(1).optional(),
    priority: guestRequestPrioritySchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listGuestRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: guestRequestStatusFilterSchema.optional(),
    priority: guestRequestPrioritySchema.optional(),
    id: z.string().trim().min(1).optional(),
    search: z.string().trim().max(160).optional(),
  })
  .strict();

export const serviceCategoryIdParamSchema = z.string().trim().min(1, "categoryId là bắt buộc");

export const guestRequestIdParamSchema = z.string().trim().min(1, "requestId is required");

export const listGuestCategoryServicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type ScanQrBodyInput = z.infer<typeof scanQrBodySchema>;
export type CreateGuestRequestBodyInput = z.infer<typeof createGuestRequestBodySchema>;
export type GuestPortalRequestStatus = z.infer<typeof guestRequestStatusSchema>;
export type GuestPortalRequestStatusFilter = z.infer<typeof guestRequestStatusFilterSchema>;
export type GuestPortalRequestPriority = z.infer<typeof guestRequestPrioritySchema>;
export type ListGuestRequestsQueryInput = z.infer<typeof listGuestRequestsQuerySchema>;
export type ListGuestCategoryServicesQueryInput = z.infer<
  typeof listGuestCategoryServicesQuerySchema
>;
