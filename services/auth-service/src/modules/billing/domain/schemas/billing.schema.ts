import {
  BookingPaymentIntent,
  FolioStatus,
  PaymentMethod,
  PaymentProvider,
  ReceivableDebtorType,
  ReceivableStatus,
} from "@prisma/client";
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

export const addFolioItemBodySchema = z
  .object({
    itemType: z.enum(["MANUAL_CHARGE", "DISCOUNT", "ADJUSTMENT", "SERVICE"]).default("ADJUSTMENT"),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    amount: z.preprocess(
      (val) => (typeof val === "string" ? Number(val) : val),
      z.number().nonnegative(),
    ),
    quantity: z.preprocess(
      (val) => (typeof val === "string" ? Number(val) : val),
      z.number().int().positive().default(1),
    ),
  })
  .strict();

export const voidFolioItemBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const invoiceAdjustmentSchema = z
  .object({
    clientRequestId: z.string().trim().min(1),
    itemType: z.enum(["MANUAL_CHARGE", "DISCOUNT"]),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    amount: z.preprocess(
      (val) => (typeof val === "string" ? Number(val) : val),
      z.number().nonnegative(),
    ),
    quantity: z.preprocess(
      (val) => (typeof val === "string" ? Number(val) : val),
      z.number().int().positive().default(1),
    ),
  })
  .strict();

export const issueInvoiceBodySchema = z
  .object({
    reconciliations: z
      .array(
        z.object({
          requestId: billingIdParamSchema,
          action: z.enum(["provided", "cancelled"]),
          cancelReason: z.string().trim().max(500).optional(),
        }),
      )
      .default([]),
    isEarlyDeparture: z.boolean().optional(),
    adjustments: z.array(invoiceAdjustmentSchema).optional(),
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
    amount: z
      .preprocess(
        (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
        z.number().positive(),
      )
      .optional(),
    cashReceived: z
      .preprocess(
        (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
        z.number().nonnegative(),
      )
      .optional(),
    clientRequestId: z.string().trim().min(1).optional(),
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
export type InvoiceAdjustmentInput = z.infer<typeof invoiceAdjustmentSchema>;
export type IssueInvoiceBodyInput = z.infer<typeof issueInvoiceBodySchema>;

export const createBookingPaymentBodySchema = z
  .object({
    hotelId: z.string().trim().min(1).optional(),
    reservationId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
    groupCode: z.string().trim().min(1).optional(),
    paymentType: z.string().optional(),
    intent: z.nativeEnum(BookingPaymentIntent).default(BookingPaymentIntent.DEPOSIT),
    inputMode: z.enum(["PERCENT", "AMOUNT", "FULL"]).optional().default("AMOUNT"),
    percentValue: z.coerce.number().min(0.01).max(100).optional(),
    amount: z.coerce.number().positive().optional(),
    receivedAmount: z.coerce.number().positive().optional(),
    paymentMethod: z
      .enum([
        PaymentMethod.CASH,
        PaymentMethod.CARD,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.MANUAL,
      ])
      .default(PaymentMethod.CASH),
    notes: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.reservationId || data.groupId || data.groupCode), {
    message: "Phải cung cấp reservationId hoặc groupId cho khoản thanh toán đặt phòng",
    path: ["reservationId"],
  })
  .refine(
    (data) => {
      if (data.inputMode === "PERCENT") {
        return data.percentValue !== undefined && data.percentValue > 0 && data.percentValue <= 100;
      }
      if (data.inputMode === "AMOUNT") {
        const val = data.amount ?? data.receivedAmount;
        return val !== undefined && val > 0;
      }
      return true;
    },
    {
      message: "Vui lòng nhập số tiền hoặc tỷ lệ phần trăm hợp lệ theo phương thức đã chọn",
      path: ["amount"],
    },
  );

export const transferToReceivableBodySchema = z
  .object({
    debtorName: z.string().trim().min(1).max(120).optional(),
    debtorType: z.nativeEnum(ReceivableDebtorType).default(ReceivableDebtorType.GUEST),
    debtorPartnerId: z.string().trim().min(1).optional(),
    dueDate: z.preprocess(
      (val) => (typeof val === "string" && val.trim() !== "" ? new Date(val) : val),
      z.date().optional(),
    ),
    assigneeUserId: z.string().trim().min(1).optional(),
    amount: z.preprocess(
      (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
      z.number().positive().optional(),
    ),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const collectReceivableBodySchema = z
  .object({
    collectedAmount: z.preprocess(
      (val) => (typeof val === "string" ? Number(val) : val),
      z.number().positive(),
    ),
    paymentMethod: z
      .enum([
        PaymentMethod.CASH,
        PaymentMethod.CARD,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.MANUAL,
      ])
      .default(PaymentMethod.CASH),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateBookingPaymentInput = {
  hotelId?: string;
  reservationId?: string;
  groupId?: string;
  groupCode?: string;
  paymentType?: string;
  intent?: BookingPaymentIntent;
  inputMode?: "PERCENT" | "AMOUNT" | "FULL";
  percentValue?: number;
  amount?: number;
  receivedAmount?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
  idempotencyKey?: string;
};

export type TransferToReceivableInput = {
  debtorName?: string;
  debtorType?: ReceivableDebtorType;
  debtorPartnerId?: string;
  dueDate?: Date | string | null;
  assigneeUserId?: string;
  amount?: number;
  notes?: string;
};

export type CollectReceivableInput = {
  collectedAmount: number;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
};

