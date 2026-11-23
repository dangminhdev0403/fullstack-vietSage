"use client";

import { useId } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  applyBankTransferInput,
  applyCashInput,
  formatMoneyDigits,
  formatVndCompact,
  parseMoneyDigits,
  rebalanceSplitToTotal,
  resolvePaymentSplit,
  SINGLE_METHOD_LABELS,
  splitEvenly,
  type PaymentSelectionMode,
  type PaymentSingleMethod,
  type PaymentSplitState,
} from "../utils/payment-split";

export type PaymentMethodSplitInputProps = {
  label?: string;
  value: PaymentSplitState;
  onChange: (next: PaymentSplitState) => void;
  /** Expected total amount to collect. When > 0, cash & bank inputs auto-complement each other. */
  totalAmount: number;
  /** Optional callback to sync total amount when user edits split inputs while totalAmount <= 0. */
  onTotalChange?: (nextTotal: number) => void;
  /** Single methods shown alongside "TM + CK". Defaults to CASH, BANK_TRANSFER, CARD. */
  allowedMethods?: PaymentSingleMethod[];
  currency?: string;
  variant?: "light" | "gold-dark";
  compact?: boolean;
  disabled?: boolean;
  required?: boolean;
  idPrefix?: string;
};

type MethodOption = {
  value: PaymentSelectionMode;
  label: string;
  icon: string;
};

const METHOD_META: Record<PaymentSelectionMode, { label: string; icon: string }> = {
  CASH: { label: SINGLE_METHOD_LABELS.CASH, icon: "payments" },
  BANK_TRANSFER: { label: SINGLE_METHOD_LABELS.BANK_TRANSFER, icon: "account_balance" },
  CARD: { label: SINGLE_METHOD_LABELS.CARD, icon: "credit_card" },
  OTHER: { label: SINGLE_METHOD_LABELS.OTHER, icon: "more_horiz" },
  MIXED: { label: "TM + CK", icon: "call_split" },
};

export function PaymentMethodSplitInput({
  label = "Phương thức thanh toán",
  value,
  onChange,
  totalAmount,
  onTotalChange,
  allowedMethods = ["CASH", "BANK_TRANSFER", "CARD"],
  currency = "VND",
  variant = "light",
  compact = false,
  disabled = false,
  required = false,
  idPrefix,
}: PaymentMethodSplitInputProps) {
  const autoId = useId();
  const prefix = idPrefix ?? autoId;
  const isDark = variant === "gold-dark";

  // Build ordered options placing MIXED right after BANK_TRANSFER (or at index 2) so Cash / Transfer / Mixed sit together naturally.
  const options: MethodOption[] = [];
  let mixedInserted = false;
  for (const method of allowedMethods) {
    options.push({ value: method, ...METHOD_META[method] });
    if (method === "BANK_TRANSFER" && !mixedInserted) {
      options.push({ value: "MIXED", ...METHOD_META.MIXED });
      mixedInserted = true;
    }
  }
  if (!mixedInserted) {
    options.push({ value: "MIXED", ...METHOD_META.MIXED });
  }

  const normalizedTotal = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0;
  const resolution = value.mode === "MIXED" ? resolvePaymentSplit(value, normalizedTotal, currency) : null;
  const cashNum = parseMoneyDigits(value.cashAmount);
  const bankNum = parseMoneyDigits(value.bankTransferAmount);
  const enteredSum = cashNum + bankNum;

  const gridColsClass = compact
    ? "grid-cols-2"
    : options.length <= 3
      ? "grid-cols-3"
      : options.length === 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-5";

  function handleSelectMode(mode: PaymentSelectionMode) {
    if (disabled) return;
    if (mode === value.mode) return;
    onChange({
      ...value,
      mode,
    });
  }

  function handleCashChange(raw: string) {
    if (disabled) return;
    if (normalizedTotal > 0) {
      onChange(applyCashInput(value, raw, normalizedTotal));
      return;
    }
    const digits = raw.replace(/\D/g, "");
    const nextState = { ...value, cashAmount: digits };
    onChange(nextState);
    if (onTotalChange) {
      onTotalChange(parseMoneyDigits(digits) + parseMoneyDigits(nextState.bankTransferAmount));
    }
  }

  function handleBankChange(raw: string) {
    if (disabled) return;
    if (normalizedTotal > 0) {
      onChange(applyBankTransferInput(value, raw, normalizedTotal));
      return;
    }
    const digits = raw.replace(/\D/g, "");
    const nextState = { ...value, bankTransferAmount: digits };
    onChange(nextState);
    if (onTotalChange) {
      onTotalChange(parseMoneyDigits(nextState.cashAmount) + parseMoneyDigits(digits));
    }
  }

  function handleSplitHalf() {
    if (disabled || normalizedTotal <= 0) return;
    onChange({
      ...value,
      mode: "MIXED",
      ...splitEvenly(normalizedTotal),
    });
  }

  function handleRebalance() {
    if (disabled || normalizedTotal <= 0) return;
    onChange(rebalanceSplitToTotal(value, normalizedTotal));
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2.5"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={
            isDark
              ? "block text-xs font-extrabold text-amber-100"
              : "block text-xs font-bold text-slate-700"
          }
        >
          {label}
          {required ? (
            <span className={isDark ? "text-amber-300 ml-0.5" : "text-rose-600 ml-0.5"}>*</span>
          ) : null}
        </span>

        {value.mode === "MIXED" && normalizedTotal > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleSplitHalf}
            className={
              isDark
                ? "rounded-lg border border-[#d4af37]/50 bg-[#d4af37]/20 px-2 py-0.5 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/35 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                : "rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
            }
          >
            Chia đôi 50/50
          </button>
        ) : null}
      </div>

      {/* Unified stable segmented selector */}
      <div
        role="radiogroup"
        aria-label={label}
        className={`grid ${gridColsClass} gap-1.5`}
      >
        {options.map((opt) => {
          const isActive = value.mode === opt.value;
          const activeClasses = isDark
            ? "border-[#fbbf24] bg-[#d4af37]/30 text-[#fef08a] ring-1 ring-[#fbbf24]/60 shadow-xs"
            : opt.value === "MIXED"
              ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30 shadow-2xs"
              : "border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600/30 shadow-2xs";
          const inactiveClasses = isDark
            ? "border-[#d4af37]/35 bg-[#1c1204]/90 text-amber-100/80 hover:border-[#d4af37]/70 hover:text-[#fef08a]"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400";

          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => handleSelectMode(opt.value)}
              className={`inline-flex ${compact ? "min-h-[34px] px-2 py-1" : "min-h-[38px] px-2.5 py-1.5"} items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive ? activeClasses : inactiveClasses
              }`}
            >
              <VsIcon name={opt.icon} className="text-sm shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mixed payment split panel (Cash + Bank Transfer) */}
      {value.mode === "MIXED" ? (
        <div
          className={
            isDark
              ? "rounded-xl border border-[#d4af37]/50 bg-[#1c1204]/95 p-3 space-y-2.5"
              : "rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5"
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor={`${prefix}-cash`}
                className={
                  isDark
                    ? "block text-xs font-bold text-amber-100"
                    : "block text-xs font-bold text-slate-700"
                }
              >
                Tiền mặt ({currency === "VND" ? "₫" : currency})
              </label>
              <div className="relative">
                <input
                  id={`${prefix}-cash`}
                  type="text"
                  inputMode="numeric"
                  disabled={disabled}
                  value={formatMoneyDigits(value.cashAmount)}
                  onChange={(e) => handleCashChange(e.target.value)}
                  placeholder="0"
                  className={
                    isDark
                      ? "h-9 w-full rounded-xl border border-[#d4af37]/60 bg-[#140c03] pl-3 pr-7 text-right text-xs sm:text-sm font-black tabular-nums text-[#fef08a] placeholder-[#fef08a]/50 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24] disabled:opacity-50"
                      : "h-9 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-7 text-right text-xs sm:text-sm font-bold tabular-nums text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
                  }
                />
                <span
                  className={
                    isDark
                      ? "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-200/70"
                      : "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400"
                  }
                >
                  ₫
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${prefix}-bank`}
                className={
                  isDark
                    ? "block text-xs font-bold text-amber-100"
                    : "block text-xs font-bold text-slate-700"
                }
              >
                Chuyển khoản ({currency === "VND" ? "₫" : currency})
              </label>
              <div className="relative">
                <input
                  id={`${prefix}-bank`}
                  type="text"
                  inputMode="numeric"
                  disabled={disabled}
                  value={formatMoneyDigits(value.bankTransferAmount)}
                  onChange={(e) => handleBankChange(e.target.value)}
                  placeholder="0"
                  className={
                    isDark
                      ? "h-9 w-full rounded-xl border border-[#d4af37]/60 bg-[#140c03] pl-3 pr-7 text-right text-xs sm:text-sm font-black tabular-nums text-[#fef08a] placeholder-[#fef08a]/50 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24] disabled:opacity-50"
                      : "h-9 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-7 text-right text-xs sm:text-sm font-bold tabular-nums text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100"
                  }
                />
                <span
                  className={
                    isDark
                      ? "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-200/70"
                      : "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400"
                  }
                >
                  ₫
                </span>
              </div>
            </div>
          </div>

          {/* Live reconciliation status */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
            {resolution?.ok ? (
              <span
                className={
                  isDark
                    ? "inline-flex items-center gap-1 font-bold text-emerald-300"
                    : "inline-flex items-center gap-1 font-bold text-emerald-700"
                }
              >
                <VsIcon name="check_circle" className="text-sm shrink-0" />
                <span>
                  Đã chia khớp: {formatVndCompact(enteredSum, currency)}
                </span>
              </span>
            ) : (
              <span
                className={
                  isDark
                    ? "inline-flex items-center gap-1 font-semibold text-amber-200 text-pretty"
                    : "inline-flex items-center gap-1 font-semibold text-amber-800 text-pretty"
                }
              >
                <VsIcon name="info" className="text-sm shrink-0" />
                <span>
                  {cashNum <= 0 || bankNum <= 0
                    ? normalizedTotal > 0
                      ? "Nhập 1 ô bất kỳ, ô còn lại tự tính theo tổng thu."
                      : "Nhập số tiền lớn hơn 0 cho cả Tiền mặt và Chuyển khoản."
                    : resolution?.error}
                </span>
              </span>
            )}

            {normalizedTotal > 0 &&
            resolution &&
            !resolution.ok &&
            enteredSum > 0 &&
            Math.abs(resolution.delta) >= 0.01 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={handleRebalance}
                className={
                  isDark
                    ? "rounded-lg border border-[#d4af37]/60 bg-[#d4af37]/25 px-2 py-0.5 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/40 transition cursor-pointer whitespace-nowrap"
                    : "rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition cursor-pointer whitespace-nowrap"
                }
              >
                Cân bằng lại
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
