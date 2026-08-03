import { PlatformBillingContractStatus } from "@prisma/client";
import { z } from "zod";

export const finalizePeriodBodySchema = z.object({
  periodStart: z.string().trim().min(1, "periodStart không được để trống"),
  periodEnd: z.string().trim().min(1, "periodEnd không được để trống"),
});

export const recordSettlementBodySchema = z.object({
  amount: z.number().positive("amount phải là số dương"),
  method: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1, "idempotencyKey không được để trống"),
});

export const createAdjustmentBodySchema = z.object({
  billableDayId: z.string().trim().optional(),
  periodId: z.string().trim().optional(),
  amount: z.number(),
  reasonCode: z.string().trim().min(1, "reasonCode không được để trống"),
  note: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1, "idempotencyKey không được để trống"),
});

export const createContractBodySchema = z.object({
  hotelId: z.string().trim().min(1, "hotelId không được để trống"),
  starTierSnapshot: z.number().int().optional(),
  roomDayUnitPrice: z.number().nonnegative("roomDayUnitPrice không được là số âm"),
  currency: z.string().trim().optional(),
  billingStartedAt: z.string().trim().min(1, "billingStartedAt không được để trống"),
});

export const addRevisionBodySchema = z.object({
  effectiveFrom: z.string().trim().min(1, "effectiveFrom không được để trống"),
  starTierSnapshot: z.number().int().optional(),
  roomDayUnitPrice: z.number().nonnegative(),
  currency: z.string().trim().optional(),
});

export const updateContractStatusBodySchema = z.object({
  status: z.nativeEnum(PlatformBillingContractStatus),
});

export const contractIdParamSchema = z.string().trim().min(1);
export const periodIdParamSchema = z.string().trim().min(1);

export const listContractsQuerySchema = z.object({
  status: z.nativeEnum(PlatformBillingContractStatus).optional(),
  search: z.string().trim().optional(),
});

export const dashboardSummaryQuerySchema = z.object({
  monthDate: z.string().trim().optional(),
});
