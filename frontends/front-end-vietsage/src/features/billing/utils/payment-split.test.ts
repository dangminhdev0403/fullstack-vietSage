import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { allocateGroupPaymentForInvoice, applyBankTransferInput, applyCashInput, createPaymentSplitState, rebalanceSplitToTotal, resolvePaymentSplit, splitEvenly } from "./payment-split.ts";

test("auto-complements bank transfer when entering cash against a fixed total", () => {
  const initial = { ...createPaymentSplitState("CASH"), mode: "MIXED" as const };
  const afterCash = applyCashInput(initial, "400000", 1_000_000);
  assert.equal(afterCash.cashAmount, "400000");
  assert.equal(afterCash.bankTransferAmount, "600000");

  const resolved = resolvePaymentSplit(afterCash, 1_000_000);
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.isMixed, true);
    assert.deepEqual(resolved.splits, [
      { method: "CASH", amount: 400_000 },
      { method: "BANK_TRANSFER", amount: 600_000 },
    ]);
  }
});

test("auto-complements cash when entering bank transfer against a fixed total", () => {
  const initial = { ...createPaymentSplitState("BANK_TRANSFER"), mode: "MIXED" as const };
  const afterBank = applyBankTransferInput(initial, "750000", 1_000_000);
  assert.equal(afterBank.cashAmount, "250000");
  assert.equal(afterBank.bankTransferAmount, "750000");
});

test("rejects mixed payment if either leg is zero or sum mismatches total", () => {
  const zeroBank = { mode: "MIXED" as const, cashAmount: "1000000", bankTransferAmount: "0" };
  assert.equal(resolvePaymentSplit(zeroBank, 1_000_000).ok, false);

  const mismatch = { mode: "MIXED" as const, cashAmount: "400000", bankTransferAmount: "500000" };
  const res = resolvePaymentSplit(mismatch, 1_000_000);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.delta, -100_000);
  }
});

test("splitEvenly and rebalanceSplitToTotal always sum to exact total", () => {
  const even = splitEvenly(1_333_000);
  assert.equal(Number(even.cashAmount) + Number(even.bankTransferAmount), 1_333_000);
  assert.ok(Number(even.cashAmount) > 0 && Number(even.bankTransferAmount) > 0);

  const rebalanced = rebalanceSplitToTotal(
    { mode: "MIXED", cashAmount: "400000", bankTransferAmount: "600000" },
    900_000,
  );
  assert.equal(rebalanced.cashAmount, "400000");
  assert.equal(rebalanced.bankTransferAmount, "500000");
});

test("allocateGroupPaymentForInvoice preserves exact cash and bank totals across group rooms", () => {
  const budgets = { cash: 1_500_000, bank: 1_500_000 };
  const alloc1 = allocateGroupPaymentForInvoice(1_000_000, budgets);
  const alloc2 = allocateGroupPaymentForInvoice(1_200_000, budgets);
  const alloc3 = allocateGroupPaymentForInvoice(800_000, budgets);

  assert.deepEqual(alloc1, { method: "CASH", amount: 1_000_000 });
  assert.deepEqual(alloc2, {
    method: "CASH",
    amount: 1_200_000,
    splits: [
      { method: "CASH", amount: 500_000 },
      { method: "BANK_TRANSFER", amount: 700_000 },
    ],
  });
  assert.deepEqual(alloc3, { method: "BANK_TRANSFER", amount: 800_000 });
  assert.deepEqual(budgets, { cash: 0, bank: 0 });
});
