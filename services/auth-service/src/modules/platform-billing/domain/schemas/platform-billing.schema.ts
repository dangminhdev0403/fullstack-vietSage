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

const pricingSchema = z
  .object({
    pricingModel: z.enum(["FIXED", "PERCENTAGE"]),
    pricingValue: z.number().nonnegative("Giá trị tính phí không được là số âm"),
  })
  .superRefine((value, context) => {
    if (value.pricingModel === "PERCENTAGE" && value.pricingValue > 100) {
      context.addIssue({
        code: "custom",
        path: ["pricingValue"],
        message: "Tỷ lệ phí phải từ 0 đến 100%",
      });
    }
  });

export const createContractBodySchema = z
  .object({
    hotelId: z.string().trim().min(1, "hotelId không được để trống"),
    starTierSnapshot: z.number().int().optional(),
    currency: z.string().trim().optional(),
    billingStartedAt: z.string().trim().min(1, "billingStartedAt không được để trống"),
  })
  .and(pricingSchema);

export const addRevisionBodySchema = z
  .object({
    effectiveFrom: z.string().trim().min(1, "effectiveFrom không được để trống"),
    starTierSnapshot: z.number().int().optional(),
    currency: z.string().trim().optional(),
  })
  .and(pricingSchema);

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

export const ownerAnalyticsQuerySchema = z.object({
  // Accepts YYYY-MM or YYYY-MM-DD; the service normalizes to the month window.
  monthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, "monthDate phải theo dạng YYYY-MM hoặc YYYY-MM-DD")
    .optional(),
  periodPage: z.coerce.number().int().positive().default(1),
  periodLimit: z.coerce.number().int().positive().max(50).default(10),
});
