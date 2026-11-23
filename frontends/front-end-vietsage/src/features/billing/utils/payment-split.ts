export type PaymentSingleMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export type PaymentSelectionMode = PaymentSingleMethod | "MIXED";

export type PaymentSplitLeg = {
  method: "CASH" | "BANK_TRANSFER";
  amount: number;
};

export type PaymentSplitState = {
  mode: PaymentSelectionMode;
  cashAmount: string;
  bankTransferAmount: string;
};

export type PaymentSplitResolution =
  | {
      ok: true;
      isMixed: boolean;
      method: PaymentSingleMethod;
      total: number;
      cashAmount: number;
      bankTransferAmount: number;
      splits?: PaymentSplitLeg[];
      summaryLabel: string;
    }
  | {
      ok: false;
      error: string;
      cashAmount: number;
      bankTransferAmount: number;
      enteredTotal: number;
      delta: number;
    };

export const SINGLE_METHOD_LABELS: Record<PaymentSingleMethod, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Quẹt thẻ",
  OTHER: "Khác",
};

export function createPaymentSplitState(
  defaultMode: PaymentSingleMethod = "CASH",
): PaymentSplitState {
  return {
    mode: defaultMode,
    cashAmount: "",
    bankTransferAmount: "",
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseMoneyDigits(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const num = Number(digits);
  return Number.isFinite(num) ? num : 0;
}

export function formatMoneyDigits(value: string | number): string {
  const num = typeof value === "number" ? value : parseMoneyDigits(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(num));
}

export function formatVndCompact(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "VND" ? 0 : 2,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(amount);
}

export function splitEvenly(totalAmount: number): {
  cashAmount: string;
  bankTransferAmount: string;
} {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { cashAmount: "", bankTransferAmount: "" };
  }
  const roundedTotal = roundMoney(totalAmount);
  let cash: number;
  if (Number.isInteger(roundedTotal) && roundedTotal >= 2000) {
    cash = Math.round(roundedTotal / 2 / 1000) * 1000;
    if (cash <= 0 || cash >= roundedTotal) {
      cash = Math.floor(roundedTotal / 2);
    }
  } else {
    cash = Math.floor((roundedTotal * 100) / 2) / 100;
  }
  const bank = roundMoney(roundedTotal - cash);
  return {
    cashAmount: cash > 0 ? String(cash) : "",
    bankTransferAmount: bank > 0 ? String(bank) : "",
  };
}

export function applyCashInput(
  state: PaymentSplitState,
  rawInput: string,
  totalAmount: number,
): PaymentSplitState {
  const digits = rawInput.replace(/\D/g, "");
  const cash = digits ? Number(digits) : 0;
  if (totalAmount > 0) {
    const remaining = roundMoney(Math.max(0, totalAmount - cash));
    return {
      ...state,
      cashAmount: digits,
      bankTransferAmount: remaining > 0 ? String(remaining) : digits ? "0" : "",
    };
  }
  return {
    ...state,
    cashAmount: digits,
  };
}

export function applyBankTransferInput(
  state: PaymentSplitState,
  rawInput: string,
  totalAmount: number,
): PaymentSplitState {
  const digits = rawInput.replace(/\D/g, "");
  const bank = digits ? Number(digits) : 0;
  if (totalAmount > 0) {
    const remaining = roundMoney(Math.max(0, totalAmount - bank));
    return {
      ...state,
      bankTransferAmount: digits,
      cashAmount: remaining > 0 ? String(remaining) : digits ? "0" : "",
    };
  }
  return {
    ...state,
    bankTransferAmount: digits,
  };
}

export function rebalanceSplitToTotal(
  state: PaymentSplitState,
  totalAmount: number,
): PaymentSplitState {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { ...state, cashAmount: "", bankTransferAmount: "" };
  }
  const currentCash = parseMoneyDigits(state.cashAmount);
  if (currentCash > 0 && currentCash < totalAmount) {
    const nextBank = roundMoney(totalAmount - currentCash);
    return {
      ...state,
      cashAmount: String(currentCash),
      bankTransferAmount: String(nextBank),
    };
  }
  const even = splitEvenly(totalAmount);
  return {
    ...state,
    ...even,
  };
}

export function resolvePaymentSplit(
  state: PaymentSplitState,
  totalAmount: number,
  currency = "VND",
): PaymentSplitResolution {
  const normalizedTotal = Number.isFinite(totalAmount) ? roundMoney(totalAmount) : 0;

  if (state.mode !== "MIXED") {
    const method = state.mode;
    return {
      ok: true,
      isMixed: false,
      method,
      total: normalizedTotal,
      cashAmount: method === "CASH" ? normalizedTotal : 0,
      bankTransferAmount: method === "BANK_TRANSFER" ? normalizedTotal : 0,
      summaryLabel: SINGLE_METHOD_LABELS[method],
    };
  }

  const cash = roundMoney(parseMoneyDigits(state.cashAmount));
  const bank = roundMoney(parseMoneyDigits(state.bankTransferAmount));
  const enteredTotal = roundMoney(cash + bank);
  const effectiveTarget = normalizedTotal > 0 ? normalizedTotal : enteredTotal;
  const delta = roundMoney(enteredTotal - effectiveTarget);

  if (cash <= 0 || bank <= 0) {
    return {
      ok: false,
      error: "Thanh toán kết hợp cần nhập số tiền lớn hơn 0 cho cả Tiền mặt và Chuyển khoản.",
      cashAmount: cash,
      bankTransferAmount: bank,
      enteredTotal,
      delta,
    };
  }

  if (normalizedTotal > 0 && Math.abs(delta) >= 0.01) {
    const diffLabel = formatVndCompact(Math.abs(delta), currency);
    return {
      ok: false,
      error:
        delta < 0
          ? `Tổng tiền mặt + chuyển khoản còn thiếu ${diffLabel} so với tổng thu ${formatVndCompact(normalizedTotal, currency)}.`
          : `Tổng tiền mặt + chuyển khoản vượt quá ${diffLabel} so với tổng thu ${formatVndCompact(normalizedTotal, currency)}.`,
      cashAmount: cash,
      bankTransferAmount: bank,
      enteredTotal,
      delta,
    };
  }

  return {
    ok: true,
    isMixed: true,
    method: "CASH",
    total: effectiveTarget,
    cashAmount: cash,
    bankTransferAmount: bank,
    splits: [
      { method: "CASH", amount: cash },
      { method: "BANK_TRANSFER", amount: bank },
    ],
    summaryLabel: `Tiền mặt ${formatVndCompact(cash, currency)} + Chuyển khoản ${formatVndCompact(bank, currency)}`,
  };
}

export type FolioPaymentAllocation = {
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "MANUAL";
  amount: number;
  splits?: PaymentSplitLeg[];
};

export function allocateGroupPaymentForInvoice(
  invoiceBalance: number,
  remainingBudgets: { cash: number; bank: number },
): FolioPaymentAllocation {
  const balance = roundMoney(Math.max(0, invoiceBalance));
  if (balance <= 0) {
    return { method: "CASH", amount: 0 };
  }

  const cashPortion = roundMoney(Math.min(Math.max(0, remainingBudgets.cash), balance));
  remainingBudgets.cash = roundMoney(Math.max(0, remainingBudgets.cash - cashPortion));

  const bankPortion = roundMoney(Math.max(0, balance - cashPortion));
  remainingBudgets.bank = roundMoney(Math.max(0, remainingBudgets.bank - bankPortion));

  if (cashPortion > 0 && bankPortion > 0) {
    return {
      method: "CASH",
      amount: balance,
      splits: [
        { method: "CASH", amount: cashPortion },
        { method: "BANK_TRANSFER", amount: bankPortion },
      ],
    };
  }

  if (cashPortion > 0) {
    return { method: "CASH", amount: balance };
  }

  return { method: "BANK_TRANSFER", amount: balance };
}
