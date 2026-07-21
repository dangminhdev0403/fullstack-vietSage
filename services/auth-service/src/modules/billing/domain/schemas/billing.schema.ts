import { FolioStatus, PaymentMethod, PaymentProvider } from "@prisma/client";
import { z } from "zod";

export const billingIdParamSchema = z.string().trim().min(1);

const numberFromQuery = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return value;
}, z.number().int().positive());

export const listFoliosQuerySchema = z
  .object({
    status: z.nativeEnum(FolioStatus).optional(),
    page: numberFromQuery.optional(),
    limit: numberFromQuery.optional(),
  })
  .strict();

export const listFolioItemsQuerySchema = z
  .object({
    page: numberFromQuery.optional(),
    limit: numberFromQuery.optional(),
  })
  .strict();

export const paymentProviderParamSchema = z.nativeEnum(PaymentProvider);

export const createPaymentSessionBodySchema = z
  .object({
    provider: z.nativeEnum(PaymentProvider).default(PaymentProvider.MANUAL),
    providerSessionId: z.string().trim().min(1).optional(),
    providerPaymentId: z.string().trim().min(1).optional(),
    metadataReference: z.string().trim().min(1).optional(),
  })
  .strict();

export const confirmManualPaymentBodySchema = z
  .object({
    method: z
      .enum([
        PaymentMethod.CASH,
        PaymentMethod.CARD,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.MANUAL,
      ])
      .default(PaymentMethod.CASH),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const paymentWebhookBodySchema = z
  .object({
    providerEventId: z.string().trim().min(1).optional(),
    eventId: z.string().trim().min(1).optional(),
    invoiceId: z.string().trim().min(1).optional(),
    paymentId: z.string().trim().min(1).optional(),
    providerSessionId: z.string().trim().min(1).optional(),
    providerPaymentId: z.string().trim().min(1).optional(),
    metadataReference: z.string().trim().min(1).optional(),
    amount: z
      .preprocess(
        (value) => (typeof value === "string" ? Number(value) : value),
        z.number().nonnegative(),
      )
      .optional(),
    providerTransactionId: z.string().trim().min(1).optional(),
    eventType: z.string().trim().min(1).optional(),
    signatureVerified: z.boolean().optional(),
  })
  .passthrough();

export type ListFoliosQueryInput = z.infer<typeof listFoliosQuerySchema>;
export type ListFolioItemsQueryInput = z.infer<typeof listFolioItemsQuerySchema>;
