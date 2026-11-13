import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "PAYROLL",
  "UTILITIES",
  "SUPPLIES",
  "MAINTENANCE",
  "MARKETING_OTA",
  "RENT_FIXED",
  "TAX_FEE",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory | "SAAS_FEE", string> = {
  PAYROLL: "Nhân sự & Lương thưởng",
  UTILITIES: "Điện, Nước & Internet",
  SUPPLIES: "Vật tư, Buồng phòng & F&B",
  MAINTENANCE: "Bảo trì & Sửa chữa",
  MARKETING_OTA: "Hoa hồng OTA & Marketing",
  RENT_FIXED: "Thuê mặt bằng & Cố định",
  TAX_FEE: "Thuế, Phí & Pháp lý",
  OTHER: "Chi phí khác",
  SAAS_FEE: "Phí nền tảng VietSage SaaS",
};

export const EXPENSE_PAYMENT_STATUSES = ["PAID", "PARTIAL", "UNPAID"] as const;
export type ExpensePaymentStatus = (typeof EXPENSE_PAYMENT_STATUSES)[number];

export const EXPENSE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (val) => (typeof val === "string" ? (val.trim() === "" ? null : val.trim()) : val),
    z.string().max(max).nullable().optional(),
  );

const positiveMoney = z.preprocess(
  (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
  z
    .number()
    .finite("Số tiền chi phí phải là số hợp lệ")
    .positive("Số tiền chi phí phải lớn hơn 0")
    .max(999_999_999_999, "Số tiền vượt giới hạn cho phép"),
);

const nonNegativeMoney = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    return typeof val === "string" ? Number(val) : val;
  },
  z
    .number()
    .finite("Số tiền đã trả phải là số hợp lệ")
    .nonnegative("Số tiền đã trả không được âm")
    .max(999_999_999_999, "Số tiền vượt giới hạn cho phép")
    .optional(),
);

const booleanFromQuery = z.preprocess((val) => {
  if (val === "true" || val === true) return true;
  if (val === "false" || val === false || val === undefined || val === "") return false;
  return val;
}, z.boolean().optional().default(false));

const isoDateTimeOptional = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.string().datetime({ offset: true, message: "Thời điểm thanh toán không hợp lệ" }).nullable().optional(),
);

export const expenseIdParamSchema = z
  .string()
  .trim()
  .min(1, "Mã khoản chi không hợp lệ")
  .max(80, "Mã khoản chi không hợp lệ");

export const listHotelExpensesQuerySchema = z
  .object({
    from: z.string().trim().regex(YMD_REGEX, "Ngày bắt đầu phải có định dạng YYYY-MM-DD").optional(),
    to: z.string().trim().regex(YMD_REGEX, "Ngày kết thúc phải có định dạng YYYY-MM-DD").optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES).optional(),
    includeVoided: booleanFromQuery,
  })
  .strict()
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: "Ngày bắt đầu không được lớn hơn ngày kết thúc",
    path: ["from"],
  });

function validateExpensePaymentConsistency(
  data: {
    amount: number;
    paidAmount?: number;
    paymentStatus: ExpensePaymentStatus;
  },
  ctx: z.RefinementCtx,
) {
  if (data.paymentStatus === "PARTIAL") {
    if (data.paidAmount === undefined || data.paidAmount <= 0 || data.paidAmount >= data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Thanh toán một phần cần số tiền đã trả lớn hơn 0 và nhỏ hơn tổng chi phí",
        path: ["paidAmount"],
      });
    }
  } else if (data.paidAmount !== undefined && data.paidAmount > data.amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Số tiền đã trả không được lớn hơn tổng chi phí",
      path: ["paidAmount"],
    });
  }
}

const baseExpensePayloadShape = {
  expenseDate: z.string().trim().regex(YMD_REGEX, "Ngày phát sinh chi phí phải có định dạng YYYY-MM-DD"),
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().trim().min(1, "Vui lòng nhập nội dung khoản chi").max(240, "Nội dung tối đa 240 ký tự"),
  vendorName: optionalTrimmed(160),
  roomId: optionalTrimmed(80),
  amount: positiveMoney,
  paidAmount: nonNegativeMoney,
  paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES).default("PAID"),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).nullable().optional(),
  paidAt: isoDateTimeOptional,
  documentNumber: optionalTrimmed(80),
  notes: optionalTrimmed(1000),
};

export const createHotelExpenseSchema = z
  .object({
    ...baseExpensePayloadShape,
    idempotencyKey: z.string().trim().min(1, "Thiếu mã chống trùng lặp").max(120),
  })
  .strict()
  .superRefine(validateExpensePaymentConsistency);

export const updateHotelExpenseSchema = z
  .object({
    ...baseExpensePayloadShape,
    version: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(validateExpensePaymentConsistency);

export const payHotelExpenseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    markFull: z.boolean().optional().default(false),
    payAmount: positiveMoney.optional(),
    paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).default("BANK_TRANSFER"),
    paidAt: isoDateTimeOptional,
    notes: optionalTrimmed(1000),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.markFull && (data.payAmount === undefined || data.payAmount <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập số tiền thanh toán hoặc chọn tất toán toàn bộ",
        path: ["payAmount"],
      });
    }
  });

export const voidHotelExpenseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    reason: z
      .string()
      .trim()
      .min(2, "Vui lòng nhập lý do hủy khoản chi")
      .max(500, "Lý do hủy tối đa 500 ký tự"),
  })
  .strict();

export type ListHotelExpensesQuery = z.infer<typeof listHotelExpensesQuerySchema>;
export type CreateHotelExpenseInput = z.infer<typeof createHotelExpenseSchema>;
export type UpdateHotelExpenseInput = z.infer<typeof updateHotelExpenseSchema>;
export type PayHotelExpenseInput = z.infer<typeof payHotelExpenseSchema>;
export type VoidHotelExpenseInput = z.infer<typeof voidHotelExpenseSchema>;
