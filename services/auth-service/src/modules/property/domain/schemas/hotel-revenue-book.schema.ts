import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có định dạng YYYY-MM-DD").refine((value) => {
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
}, "Ngày không hợp lệ");
const money = z.number().finite().positive("Số tiền phải lớn hơn 0").max(9_999_999_999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Số tiền chỉ có tối đa hai chữ số thập phân");
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const revenueBookCategorySchema = z.enum(["ROOM", "MINIBAR", "LAUNDRY", "OTHER"]);
export const revenueBookCategoryFilterSchema = z.enum(["ROOM", "CHANNEL", "MINIBAR", "LAUNDRY", "OTHER"]);
export const revenueBookPaymentMethodFilterSchema = z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]);
export const revenueBookSourceFilterSchema = z.enum(["FOLIO", "MANUAL", "DEPOSIT", "RECEIVABLE"]);
export const revenueBookSettlementStatusFilterSchema = z.enum(["SETTLED", "UNPAID", "OVERPAID"]);
export const revenueBookSplitItemSchema = z.object({
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  amount: money,
  destinationAccount: optionalText(120),
}).strict();
function sumRevenueSplits(splits: Array<{ amount: number }>): number {
  return Math.round(splits.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}
function isValidRevenueCollection(value: { amount?: number; method?: string; splits?: Array<{ method: string; amount: number }> }): boolean {
  if (value.splits && value.splits.length > 0) {
    if (new Set(value.splits.map((item) => item.method)).size !== value.splits.length) return false;
    const total = sumRevenueSplits(value.splits);
    if (total <= 0) return false;
    if (value.amount !== undefined && Math.abs(total - value.amount) >= 0.01) return false;
    return true;
  }
  return value.amount !== undefined && value.amount > 0 && Boolean(value.method);
}
export function resolveRevenueCollectionAmount(value: { amount?: number; splits?: Array<{ amount: number }> }): number {
  if (value.splits && value.splits.length > 0) return sumRevenueSplits(value.splits);
  return value.amount ?? 0;
}
const revenueBookCollectionBaseSchema = z.object({
  receivedAt: z.iso.datetime({ offset: true }),
  amount: money.optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
  destinationAccount: optionalText(120),
  splits: z.array(revenueBookSplitItemSchema).min(1).max(4).optional(),
  reference: optionalText(120),
}).strict();
export const revenueBookCollectionSchema = revenueBookCollectionBaseSchema.refine(
  isValidRevenueCollection,
  "Vui lòng nhập phương thức và số tiền thu hợp lệ",
);
const fields = {
  date,
  description: text(300),
  category: revenueBookCategorySchema,
  amount: money,
  roomId: optionalText(120),
  documentNumber: optionalText(80),
  notes: optionalText(1000),
};
export const revenueBookQuerySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  category: revenueBookCategoryFilterSchema.optional(),
  paymentMethod: revenueBookPaymentMethodFilterSchema.optional(),
  source: revenueBookSourceFilterSchema.optional(),
  settlementStatus: revenueBookSettlementStatusFilterSchema.optional(),
}).strict().refine((value) => Boolean(value.from) === Boolean(value.to), "Vui lòng chọn đủ ngày bắt đầu và kết thúc").refine((value) => !value.from || !value.to || value.from <= value.to, "Ngày bắt đầu không được sau ngày kết thúc").refine((value) => {
  if (!value.from || !value.to) return true;
  try { return Temporal.PlainDate.from(value.from).until(Temporal.PlainDate.from(value.to)).days <= 365; } catch { return false; }
}, "Vui lòng chọn khoảng báo cáo không quá 366 ngày");
export const createRevenueEntrySchema = z.object({
  ...fields,
  idempotencyKey: text(120),
  collection: revenueBookCollectionSchema.optional(),
}).strict().refine((value) => !value.collection || resolveRevenueCollectionAmount(value.collection) <= value.amount, "Số tiền thu vượt quá khoản phát sinh");
export const updateRevenueEntrySchema = z.object({ ...fields, version: z.number().int().nonnegative() }).strict();
export const collectRevenueEntrySchema = revenueBookCollectionBaseSchema
  .extend({ idempotencyKey: text(120), version: z.number().int().nonnegative() })
  .strict()
  .refine(isValidRevenueCollection, "Vui lòng nhập phương thức và số tiền thu hợp lệ");
export const voidRevenueEntrySchema = z.object({ reason: text(500), version: z.number().int().nonnegative() }).strict();
export const updateRevenueNoteSchema = z.object({
  accountKey: text(160),
  notes: z.string().trim().max(1000).nullable().optional(),
  roomId: optionalText(120),
  expectedPriorNote: z.string().trim().max(1000).nullable().optional(),
}).strict();
export const revenueEntryIdSchema = text(120);
export type RevenueBookCategory = z.infer<typeof revenueBookCategorySchema>;
export type RevenueBookCategoryFilter = z.infer<typeof revenueBookCategoryFilterSchema>;
export type RevenueBookPaymentMethodFilter = z.infer<typeof revenueBookPaymentMethodFilterSchema>;
export type RevenueBookSourceFilter = z.infer<typeof revenueBookSourceFilterSchema>;
export type RevenueBookSettlementStatusFilter = z.infer<typeof revenueBookSettlementStatusFilterSchema>;
export type RevenueBookQuery = z.infer<typeof revenueBookQuerySchema>;
export type CreateRevenueEntry = z.infer<typeof createRevenueEntrySchema>;
export type UpdateRevenueEntry = z.infer<typeof updateRevenueEntrySchema>;
export type CollectRevenueEntry = z.infer<typeof collectRevenueEntrySchema>;
export type VoidRevenueEntry = z.infer<typeof voidRevenueEntrySchema>;
export type UpdateRevenueNote = z.infer<typeof updateRevenueNoteSchema>;
