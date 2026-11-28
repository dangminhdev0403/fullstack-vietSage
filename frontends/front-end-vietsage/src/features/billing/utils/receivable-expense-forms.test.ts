import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { generateExpenseIdempotencyKey, generateReceivableCollectionIdempotencyKey } from "./idempotency.ts";
// @ts-expect-error Node strip-types requires explicit extensions.
import { createPaymentSplitState, resolvePaymentSplit } from "./payment-split.ts";

test("R2 Scenario: Repeated submission with identical payload produces exact same idempotencyKey", () => {
  const submission1 = {
    receivableId: "rec-agoda-2000000",
    amount: 400000,
    collectedAtDate: "2026-11-26",
    method: "BANK_TRANSFER",
    destinationAccount: "Techcombank",
  };

  const key1 = generateReceivableCollectionIdempotencyKey(submission1);
  const key2 = generateReceivableCollectionIdempotencyKey(submission1);

  // Exact same key ensures backend recognizes idempotent retry and prevents double-collecting 800k instead of 400k
  assert.equal(key1, key2);
  assert.ok(key1.length <= 120);
});

test("R2 Scenario: Different amount or date produces distinct idempotencyKey", () => {
  const base = {
    receivableId: "rec-agoda-2000000",
    amount: 400000,
    collectedAtDate: "2026-11-26",
    method: "BANK_TRANSFER",
    destinationAccount: "Techcombank",
  };

  const keyBase = generateReceivableCollectionIdempotencyKey(base);
  const keySecondCollection = generateReceivableCollectionIdempotencyKey({
    ...base,
    amount: 1600000,
    collectedAtDate: "2026-11-27",
  });

  assert.notEqual(keyBase, keySecondCollection);
});

test("R6 Scenario: Explicit unknown account produces defined idempotency key without guessing Vietcombank", () => {
  const collectionWithExplicitUnknown = {
    receivableId: "rec-legacy-001",
    amount: 500000,
    collectedAtDate: "2026-11-26",
    method: "BANK_TRANSFER",
    destinationAccount: null, // explicit unknown
  };

  const keyUnknown = generateReceivableCollectionIdempotencyKey(collectionWithExplicitUnknown);
  assert.ok(keyUnknown.length > 0);
  assert.ok(keyUnknown.length <= 120);

  // Different from when a bank account is specified
  const keyWithBank = generateReceivableCollectionIdempotencyKey({
    ...collectionWithExplicitUnknown,
    destinationAccount: "Vietcombank",
  });
  assert.notEqual(keyUnknown, keyWithBank);
});

test("R6 Scenario: Mixed payment split with per-leg receivingAccount", () => {
  const splitState = {
    mode: "MIXED" as const,
    cashAmount: "200000",
    bankTransferAmount: "300000",
  };
  const resolved = resolvePaymentSplit(splitState, 500000, "VND");
  assert.equal(resolved.ok, true);

  if (resolved.ok && resolved.splits) {
    const splitsWithAccounts = resolved.splits.map((s) => ({
      method: s.method,
      amount: s.amount,
      receivingAccount: s.method === "CASH" ? "Két tiền mặt lễ tân" : "Techcombank",
    }));

    const key = generateReceivableCollectionIdempotencyKey({
      receivableId: "rec-split-001",
      amount: 500000,
      collectedAtDate: "2026-11-26",
      method: "MIXED",
      splits: splitsWithAccounts,
    });

    assert.ok(key.startsWith("rc-"));
    assert.ok(key.includes("500000"));
    assert.ok(key.length <= 120);
  }
});

test("R6 Scenario: Expense creation with explicit unknown account and dated payment", () => {
  const expensePayload = {
    hotelId: "hotel-001",
    expenseDate: "2026-11-26",
    category: "UTILITIES",
    title: "Tiền điện tháng 11/2026",
    amount: 600000,
    paymentStatus: "UNPAID",
    paymentMethod: null,
    paymentAccount: null,
  };

  const key1 = generateExpenseIdempotencyKey(expensePayload);
  const key2 = generateExpenseIdempotencyKey(expensePayload);
  assert.equal(key1, key2);
  assert.ok(key1.startsWith("exp-"));
  assert.ok(key1.length <= 120);
});
