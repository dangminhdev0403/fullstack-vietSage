import { z } from "zod";

export const emergencyLocationSourceSchema = z.enum([
  "GPS",
  "QR",
  "INVITE",
  "HOST_SELECTED",
  "GUEST_SELECTED",
  "MANUAL_ADDRESS",
  "TENANT_DEFAULT",
  "IP_DERIVED",
  "UNKNOWN",
]);
export const emergencyLocationConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);

export const createEmergencyCallBodySchema = z
  .object({
    dialedNumber: z.string().trim().min(1).max(40),
    callbackNumber: z.string().trim().max(40).optional(),
    callerReference: z.string().trim().max(160).optional(),
    location: z
      .object({
        emergencyLocationId: z.string().trim().min(1).optional(),
        dispatchableAddress: z.string().trim().max(500).optional(),
        source: emergencyLocationSourceSchema.optional(),
        confidence: emergencyLocationConfidenceSchema.optional(),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateEmergencyCallBodyInput = z.infer<typeof createEmergencyCallBodySchema>;
