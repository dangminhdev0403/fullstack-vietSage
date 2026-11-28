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
    expectedBalanceAmount: z.number().finite().nonnegative().optional(),
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

const counterPaymentMethodEnum = z.enum([
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MANUAL,
]);

export const paymentSplitItemSchema = z
  .object({
    method: counterPaymentMethodEnum,
    amount: z.preprocess(
      (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
      z.number().finite().positive(),
    ),
    destinationAccount: z.string().trim().max(120).optional(),
  })
  .strict();

export type PaymentSplitItemInput = {
  method: PaymentMethod;
  amount: number;
  destinationAccount?: string;
};

function hasUniqueSplitMethods(splits: Array<{ method: PaymentMethod }>): boolean {
  return new Set(splits.map((item) => item.method)).size === splits.length;
}

function sumSplitAmounts(splits: Array<{ amount: number }>): number {
  return Math.round(splits.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

export const confirmManualPaymentBodySchema = z
  .object({
    method: counterPaymentMethodEnum.default(PaymentMethod.MANUAL),
    note: z.string().trim().max(500).optional(),
    amount: z
      .preprocess(
        (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
        z.number().positive(),
      )
      .optional(),
    splits: z.array(paymentSplitItemSchema).min(1).max(4).optional(),
    destinationAccount: z.string().trim().max(120).optional(),
    clientRequestId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((data) => !data.splits || hasUniqueSplitMethods(data.splits), {
    message: "Không được trùng phương thức thanh toán trong cùng một lần thu kết hợp",
    path: ["splits"],
  })
  .refine(
    (data) =>
      !data.splits ||
      data.amount === undefined ||
      Math.abs(sumSplitAmounts(data.splits) - data.amount) < 0.01,
    {
      message: "Tổng số tiền chia theo phương thức phải khớp với tổng số tiền thu",
      path: ["splits"],
    },
  );

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
    paymentMethod: counterPaymentMethodEnum.default(PaymentMethod.MANUAL),
    destinationAccount: z.string().trim().max(120).optional(),
    splits: z.array(paymentSplitItemSchema).min(1).max(4).optional(),
    notes: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.reservationId || data.groupId || data.groupCode), {
    message: "Phải cung cấp reservationId hoặc groupId cho khoản thanh toán đặt phòng",
    path: ["reservationId"],
  })
  .refine((data) => !data.splits || hasUniqueSplitMethods(data.splits), {
    message: "Không được trùng phương thức thanh toán trong cùng một lần cọc kết hợp",
    path: ["splits"],
  })
  .refine(
    (data) => {
      if (data.splits && data.splits.length > 0) {
        const splitSum = sumSplitAmounts(data.splits);
        if (splitSum <= 0) return false;
        const explicitAmount = data.amount ?? data.receivedAmount;
        if (explicitAmount !== undefined && Math.abs(splitSum - explicitAmount) >= 0.01) {
          return false;
        }
        return true;
      }
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
      message: "Vui lòng nhập số tiền, tỷ lệ phần trăm hoặc chia phương thức thanh toán hợp lệ",
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
    collectedAmount: z
      .preprocess(
        (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
        z.number().finite().positive().max(9_999_999_999.99).multipleOf(0.01),
      )
      .optional(),
    amount: z
      .preprocess(
        (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
        z.number().finite().positive().max(9_999_999_999.99).multipleOf(0.01),
      )
      .optional(),
    collectedAt: z
      .string()
      .datetime({ offset: true })
      .or(z.string().date())
      .optional(),
    paymentMethod: counterPaymentMethodEnum.default(PaymentMethod.MANUAL),
    destinationAccount: z.string().trim().max(120).optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    splits: z.array(paymentSplitItemSchema.extend({ destinationAccount: z.string().trim().max(120).optional() })).min(1).max(4).optional(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((data) => !data.splits || hasUniqueSplitMethods(data.splits), {
    message: "Không được trùng phương thức thanh toán trong cùng một lần thu nợ kết hợp",
    path: ["splits"],
  })
  .refine(
    (data) => {
      if (data.amount !== undefined && data.collectedAmount !== undefined && data.collectedAmount !== data.amount) return false;
      const total = data.collectedAmount ?? data.amount;
      if (data.splits && data.splits.length > 0) {
        if (data.splits.length > 1 && data.destinationAccount) return false;
        const splitSum = sumSplitAmounts(data.splits);
        if (splitSum <= 0) return false;
        if (total !== undefined && splitSum !== total) {
          return false;
        }
        return true;
      }
      return total !== undefined && total > 0;
    },
    {
      message: "Số tiền thu nợ và phần chia phương thức thanh toán phải khớp và lớn hơn 0",
      path: ["collectedAmount"],
    },
  );

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
  destinationAccount?: string;
  splits?: PaymentSplitItemInput[];
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
  amount?: number;
  collectedAt?: string;
  collectedAmount?: number;
  paymentMethod?: PaymentMethod;
  splits?: (PaymentSplitItemInput & { destinationAccount?: string })[];
  reference?: string;
  notes?: string;
  destinationAccount?: string;
  idempotencyKey?: string;
};

export const listCashMovementsQuerySchema = z
  .object({
    from: z.string().trim().date("Ngày bắt đầu phải hợp lệ và có định dạng YYYY-MM-DD").optional(),
    to: z.string().trim().date("Ngày kết thúc phải hợp lệ và có định dạng YYYY-MM-DD").optional(),
    paymentMethod: z.string().trim().optional(),
    destinationAccount: z.string().trim().optional(),
    movementType: z.enum(["ALL", "RECEIPT", "DISBURSEMENT"]).optional().default("ALL"),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().optional(),
  })
  .strict()
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: "Ngày bắt đầu không được lớn hơn ngày kết thúc",
    path: ["from"],
  });

export type ListCashMovementsQuery = Partial<z.infer<typeof listCashMovementsQuerySchema>>;

export type CashMovementType = "RECEIPT" | "DISBURSEMENT";
export type CashMovementSourceType =
  | "FRONT_DESK_PAYMENT"
  | "ONLINE_PAYMENT"
  | "BOOKING_DEPOSIT"
  | "RECEIVABLE_COLLECTION"
  | "HOTEL_EXPENSE"
  | "MANUAL_COLLECTION"
  | "PAYMENT_REFUND"
  | "RECEIVABLE_REVERSAL";

export type CashMovementItem = {
  id: string;
  movementType: CashMovementType;
  sourceType: CashMovementSourceType;
  transactionDate: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  destinationAccount: string | null;
  referenceCode: string | null;
  description: string;
  payerOrPayee: string | null;
  roomNumber: string | null;
  bookingCode: string | null;
  stayId: string | null;
  invoiceId: string | null;
  folioId: string | null;
  isLegacyAccount: boolean;
};

export type AccountBalanceSummary = {
  accountName: string;
  isLegacy: boolean;
  cashIn: number;
  cashOut: number;
  netCash: number;
  transactionCount: number;
};

export type CashMovementsResponse = {
  hotelId: string;
  from: string;
  to: string;
  currency: string;
  timeZone: string;
  page: number;
  pageSize: number;
  totalPages: number;
  undatedExpensePayments: { amount: number; expenseCount: number };
  summary: {
    totalCashIn: number;
    totalCashOut: number;
    netCashFlow: number;
    byMethod: Record<string, { cashIn: number; cashOut: number }>;
    byAccount: AccountBalanceSummary[];
    entryCount: number;
    receiptCount: number;
    disbursementCount: number;
  };
  items: CashMovementItem[];
};
