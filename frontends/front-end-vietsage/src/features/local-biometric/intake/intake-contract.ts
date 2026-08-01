import { z } from "zod";

export const intakePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  transferId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  guest: z.object({
    displayName: z.string().trim().min(1).max(160),
    identityNumber: z.string().regex(/^\d{9,12}$/),
    dateOfBirth: z.string().date().optional(),
    gender: z.string().trim().max(32).optional(),
    nationality: z.string().trim().max(80).optional(),
    identityIssueDate: z.string().date().optional(),
    identityExpiryDate: z.string().date().optional(),
  }).strict(),
  verification: z.object({
    chipAuthenticated: z.boolean(),
    sodVerified: z.boolean(),
  }).strict(),
}).strict();

export const intakePayloadV2Schema = z.object({
  schemaVersion: z.literal(2),
  transferId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  guest: z.object({
    displayName: z.string().trim().min(1).max(160),
    identityNumber: z.string().regex(/^\d{9,12}$/),
    dateOfBirth: z.string().date().optional(),
    gender: z.string().trim().max(32).optional(),
    nationality: z.string().trim().max(80).optional(),
    identityIssueDate: z.string().date().optional(),
    identityExpiryDate: z.string().date().optional(),
    race: z.string().trim().max(80).optional(),
    residencePlace: z.string().trim().max(512).optional(),
  }).strict(),
  verification: z.object({
    chipAuthenticated: z.boolean().optional(),
    sodVerified: z.boolean().optional(),
  }).strict().optional(),
  portrait: z.object({
    mimeType: z.union([z.literal("image/jpeg"), z.literal("image/png")]),
    base64: z.string().max(699_056).refine(
      (val) => val.length > 0 && val.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(val),
      { message: "Invalid base64 string" }
    ).refine(
      (val) => (val.length * 3) / 4 - (val.endsWith("==") ? 2 : val.endsWith("=") ? 1 : 0) <= 512 * 1024,
      { message: "Portrait size must be <= 512KiB" }
    )
  }).strict().optional()
}).strict();

export const parseIntakePayload = (raw: unknown) => {
  return z.discriminatedUnion("schemaVersion", [
    intakePayloadSchema,
    intakePayloadV2Schema
  ]).parse(raw);
};

export const omitBlankOptionals = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
};

export const createIntakeSessionSchema = z.object({
  hotelId: z.string().trim().min(1).max(64),
}).strict();

export type IntakePayload = z.infer<typeof intakePayloadSchema>;
export type IntakePayloadV2 = z.infer<typeof intakePayloadV2Schema>;

export type IntakeSessionIssued = {
  sessionId: string;
  code: string;
  expiresAt: number;
};

export type IntakeSessionStatus = {
  sessionId: string;
  hotelId: string;
  expiresAt: number;
  status: "waiting" | "received";
  payload: IntakePayload | IntakePayloadV2 | null;
};
