import { z } from "zod";

export const serviceImportPreviewBodySchema = z
  .object({
    csv: z.string().trim().min(1, "CSV content is required"),
    fileName: z.string().trim().min(1).optional().default("service-items.csv"),
  })
  .strict();

export const serviceImportCommitBodySchema = z
  .object({
    csv: z.string().trim().min(1, "CSV content is required"),
    previewToken: z.string().trim().min(1, "previewToken is required"),
    fileName: z.string().trim().min(1).optional().default("service-items.csv"),
  })
  .strict();

export const serviceVoucherBodySchema = z
  .object({
    code: z.string().trim().min(1, "Voucher code/number is required"),
  })
  .strict();

export const verifyVoucherBodySchema = serviceVoucherBodySchema;
export const redeemVoucherBodySchema = serviceVoucherBodySchema;

export type ServiceImportPreviewBody = z.infer<typeof serviceImportPreviewBodySchema>;
export type ServiceImportCommitBody = z.infer<typeof serviceImportCommitBodySchema>;
export type ServiceVoucherBody = z.infer<typeof serviceVoucherBodySchema>;
export type VerifyVoucherBody = z.infer<typeof verifyVoucherBodySchema>;
export type RedeemVoucherBody = z.infer<typeof redeemVoucherBodySchema>;
