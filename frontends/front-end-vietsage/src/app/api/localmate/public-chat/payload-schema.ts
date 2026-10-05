import { z } from "zod";

export const historyEntrySchema = z.object({
  role: z.enum(["guest", "localmate"]),
  text: z
    .string()
    .trim()
    .min(1)
    .max(4_000)
    .transform((val) => val.slice(0, 1_000)),
});

export const payloadSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  location: z.string().trim().max(120).optional().default(""),
  language: z.enum(["vi", "en", "zh", "ko", "ru", "hi"]).default("vi"),
  history: z
    .array(historyEntrySchema)
    .max(16)
    .optional()
    .default([])
    .transform((items) => items.slice(-8)),
});

export type ValidatedPublicChatPayload = z.infer<typeof payloadSchema>;
