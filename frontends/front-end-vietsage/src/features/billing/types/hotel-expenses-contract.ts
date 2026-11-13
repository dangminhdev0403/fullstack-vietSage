export type ExpenseCategory =
  | "PAYROLL"
  | "UTILITIES"
  | "SUPPLIES"
  | "MAINTENANCE"
  | "MARKETING_OTA"
  | "RENT_FIXED"
  | "TAX_FEE"
  | "OTHER";

export type ExpensePaymentStatus = "PAID" | "PARTIAL" | "UNPAID";
export type ExpensePaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";

export const EXPENSE_CATEGORY_OPTIONS: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "PAYROLL", label: "Nhân sự & Lương thưởng" },
  { value: "UTILITIES", label: "Điện, Nước & Internet" },
  { value: "SUPPLIES", label: "Vật tư, Buồng phòng & F&B" },
  { value: "MAINTENANCE", label: "Bảo trì & Sửa chữa" },
  { value: "MARKETING_OTA", label: "Hoa hồng OTA & Marketing" },
  { value: "RENT_FIXED", label: "Thuê mặt bằng & Cố định" },
  { value: "TAX_FEE", label: "Thuế, Phí & Pháp lý" },
  { value: "OTHER", label: "Chi phí khác" },
];

export const EXPENSE_PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> = {
  PAID: "Đã thanh toán",
  PARTIAL: "Thanh toán một phần",
  UNPAID: "Chưa thanh toán",
};

export const EXPENSE_PAYMENT_METHOD_OPTIONS: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "CASH", label: "Tiền mặt" },
  { value: "CARD", label: "Thẻ / Ví điện tử" },
  { value: "OTHER", label: "Hình thức khác" },
];

export type HotelExpensesQuery = {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  paymentStatus?: ExpensePaymentStatus;
  includeVoided?: boolean;
};

export type HotelExpenseItem = {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  categoryLabel: string;
  title: string;
  vendorName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  amount: number;
  paidAmount: number;
  unpaidAmount: number;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod: ExpensePaymentMethod | null;
  paidAt: string | null;
  documentNumber: string | null;
  notes: string | null;
  version: number;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type ExpenseCategorySummaryItem = {
  category: ExpenseCategory | "SAAS_FEE";
  categoryLabel: string;
  amount: number;
  paidAmount: number;
  unpaidAmount: number;
  count: number;
  sharePercent: number;
};

export type HotelExpenseSummary = {
  totalExpense: number;
  paidExpense: number;
  unpaidExpense: number;
  saasFeeInPeriod: number;
  totalWithSaas: number;
  entryCount: number;
  unpaidCount: number;
};

export type HotelExpensesResponse = {
  hotelId: string;
  hotelName: string;
  currency: string;
  timeZone: string;
  from: string;
  to: string;
  summary: HotelExpenseSummary;
  byCategory: ExpenseCategorySummaryItem[];
  items: HotelExpenseItem[];
  rooms: Array<{ id: string; roomNumber: string }>;
};

export type CreateHotelExpenseInput = {
  expenseDate: string;
  category: ExpenseCategory;
  title: string;
  vendorName?: string | null;
  roomId?: string | null;
  amount: number;
  paidAmount?: number;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: ExpensePaymentMethod | null;
  paidAt?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
  idempotencyKey: string;
};

export type UpdateHotelExpenseInput = Omit<CreateHotelExpenseInput, "idempotencyKey"> & {
  version: number;
};

export type PayHotelExpenseInput = {
  version: number;
  markFull?: boolean;
  payAmount?: number;
  paymentMethod: ExpensePaymentMethod;
  paidAt?: string | null;
  notes?: string | null;
};

export type VoidHotelExpenseInput = {
  version: number;
  reason: string;
};
