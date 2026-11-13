import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có định dạng YYYY-MM-DD").refine((value) => {
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
}, "Ngày không hợp lệ");
const money = z.number().finite().positive("Số tiền phải lớn hơn 0").max(9_999_999_999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Số tiền chỉ có tối đa hai chữ số thập phân");
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const revenueBookCategorySchema = z.enum(["ROOM", "MINIBAR", "LAUNDRY", "OTHER"]);
export const revenueBookCollectionSchema = z.object({
  receivedAt: z.iso.datetime({ offset: true }),
  amount: money,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  reference: optionalText(120),
}).strict();
const fields = {
  date,
  description: text(300),
  category: revenueBookCategorySchema,
  amount: money,
  roomId: optionalText(120),
  documentNumber: optionalText(80),
  notes: optionalText(1000),
};
export const revenueBookQuerySchema = z.object({ from: date.optional(), to: date.optional() }).strict().refine((value) => Boolean(value.from) === Boolean(value.to), "Vui lòng chọn đủ ngày bắt đầu và kết thúc").refine((value) => !value.from || !value.to || value.from <= value.to, "Ngày bắt đầu không được sau ngày kết thúc").refine((value) => {
  if (!value.from || !value.to) return true;
  try { return Temporal.PlainDate.from(value.from).until(Temporal.PlainDate.from(value.to)).days <= 365; } catch { return false; }
}, "Vui lòng chọn khoảng báo cáo không quá 366 ngày");
export const createRevenueEntrySchema = z.object({
  ...fields,
  idempotencyKey: text(120),
  collection: revenueBookCollectionSchema.optional(),
}).strict().refine((value) => !value.collection || value.collection.amount <= value.amount, "Số tiền thu vượt quá khoản phát sinh");
export const updateRevenueEntrySchema = z.object({ ...fields, version: z.number().int().nonnegative() }).strict();
export const collectRevenueEntrySchema = revenueBookCollectionSchema.extend({ idempotencyKey: text(120), version: z.number().int().nonnegative() }).strict();
export const voidRevenueEntrySchema = z.object({ reason: text(500), version: z.number().int().nonnegative() }).strict();
export const revenueEntryIdSchema = text(120);
export type RevenueBookCategory = z.infer<typeof revenueBookCategorySchema>;
export type RevenueBookQuery = z.infer<typeof revenueBookQuerySchema>;
export type CreateRevenueEntry = z.infer<typeof createRevenueEntrySchema>;
export type UpdateRevenueEntry = z.infer<typeof updateRevenueEntrySchema>;
export type CollectRevenueEntry = z.infer<typeof collectRevenueEntrySchema>;
export type VoidRevenueEntry = z.infer<typeof voidRevenueEntrySchema>;
