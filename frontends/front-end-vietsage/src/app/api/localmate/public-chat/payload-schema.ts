import { z } from "zod";

export const proposalKeySchema = z
  .string()
  .trim()
  .regex(/^(trip|prop)_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/);
export const candidateKeySchema = z
  .string()
  .trim()
  .regex(/^cand_[A-Za-z0-9][A-Za-z0-9_-]{0,74}$/);

export const historyEntrySchema = z.object({
  role: z.enum(["guest", "localmate"]),
  text: z
    .string()
    .trim()
    .max(4_000)
    .default("")
    .transform((value) => value.slice(0, 1_000)),
});

export const payloadSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  location: z.string().trim().min(2).max(120),
  language: z.enum(["vi", "en", "zh", "ko", "ru", "hi"]).default("vi"),
  history: z
    .array(historyEntrySchema)
    .max(16)
    .optional()
    .default([])
    .transform((items) => items.filter((item) => item.text.trim().length > 0).slice(-8)),
  selection: z
    .object({
      proposalKey: proposalKeySchema.optional(),
      candidateKey: candidateKeySchema.optional(),
    })
    .optional(),
  actionType: z
    .enum(["SELECT_PROPOSAL", "REFINE_PROPOSAL", "SHOW_ALTERNATIVES", "SELECT_GUIDE"])
    .optional(),
});

export const n8nResponseSchema = z
  .object({
    status: z.coerce.number().optional(),
    reply: z.string().trim().min(1).max(5_000),
    suggestions: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            query: z.string().trim().min(1).max(300),
          })
          .passthrough(),
      )
      .max(3)
      .optional()
      .default([]),
    action: z.unknown().nullish(),
    proposalRefs: z
      .array(z.object({ tourCode: z.string().trim().min(1).max(80) }).passthrough())
      .max(5)
      .optional()
      .default([]),
    knowledgeVersion: z.string().trim().min(1).max(100).optional().default("unknown"),
    cached: z.boolean().optional().default(false),
  })
  .passthrough();

export const publicProposalSchema = z
  .object({
    proposalKey: proposalKeySchema,
    title: z.string().trim().min(1).max(255),
    location: z.string().trim().min(1).max(120),
    duration: z.string().trim().min(1).max(80),
    highlights: z.array(z.string().trim().min(1).max(300)).max(12),
    bookable: z.boolean(),
    availableGuideCount: z.number().int().min(0),
    selected: z.boolean().optional(),
  })
  .passthrough();

export const publicActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("SELECT_PROPOSAL"),
      proposalKey: proposalKeySchema,
      label: z.string().trim().min(1).max(300),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("SELECT_GUIDE"),
      proposalKey: proposalKeySchema,
      candidateKey: candidateKeySchema,
      label: z.string().trim().min(1).max(300),
      guideName: z.string().trim().min(1).max(120).optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("REFINE_PROPOSAL"),
      proposalKey: proposalKeySchema,
      label: z.string().trim().min(1).max(300),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("SHOW_ALTERNATIVES"),
      label: z.string().trim().min(1).max(300),
    })
    .passthrough(),
]);

export const mintedProposalsSchema = z
  .object({
    stage: z.enum(["DISCOVERY", "PROPOSALS"]),
    proposals: z.array(publicProposalSchema).max(3),
    actions: z.array(publicActionSchema).max(8),
    knowledgeVersion: z.string().trim().min(1).max(100),
  })
  .passthrough();

export const selectedProposalSchema = z
  .object({
    stage: z.literal("GUIDE_SELECTION"),
    proposal: publicProposalSchema,
    actions: z.array(publicActionSchema).max(12),
  })
  .passthrough();

export type ValidatedPublicChatPayload = z.infer<typeof payloadSchema>;
