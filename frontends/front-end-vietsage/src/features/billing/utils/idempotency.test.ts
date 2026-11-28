import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { generateExpenseIdempotencyKey, generateReceivableCollectionIdempotencyKey } from "./idempotency.ts";

test("generateReceivableCollectionIdempotencyKey produces deterministic keys for identical payloads", () => {
  const payload = {
    receivableId: "cmq2k2lm0003f2oui3ifqp808",
    amount: 400000,
    collectedAtDate: "2026-11-26",
    method: "BANK_TRANSFER",
    destinationAccount: "Techcombank",
  };

  const key1 = generateReceivableCollectionIdempotencyKey(payload);
  const key2 = generateReceivableCollectionIdempotencyKey(payload);
  assert.equal(key1, key2);
  assert.ok(key1.length <= 120);
  assert.ok(key1.startsWith("rc-"));
  assert.ok(key1.includes("2026-11-26"));
  assert.ok(key1.includes("400000"));
});

test("generateReceivableCollectionIdempotencyKey varies when amount or date changes", () => {
  const base = {
    receivableId: "cmq2k2lm0003f2oui3ifqp808",
    amount: 400000,
    collectedAtDate: "2026-11-26",
    method: "BANK_TRANSFER",
    destinationAccount: "Techcombank",
  };

  const keyBase = generateReceivableCollectionIdempotencyKey(base);
  const keyDiffAmount = generateReceivableCollectionIdempotencyKey({ ...base, amount: 800000 });
  const keyDiffDate = generateReceivableCollectionIdempotencyKey({ ...base, collectedAtDate: "2026-11-27" });
  const keyDiffAccount = generateReceivableCollectionIdempotencyKey({ ...base, destinationAccount: "Vietcombank" });

  assert.notEqual(keyBase, keyDiffAmount);
  assert.notEqual(keyBase, keyDiffDate);
  assert.notEqual(keyBase, keyDiffAccount);
});

test("generateReceivableCollectionIdempotencyKey takes split legs into account", () => {
  const base = {
    receivableId: "cmq2k2lm0003f2oui3ifqp808",
    amount: 1000000,
    collectedAtDate: "2026-11-26",
    method: "MIXED",
    splits: [
      { method: "CASH", amount: 400000, receivingAccount: "Két tiền mặt" },
      { method: "BANK_TRANSFER", amount: 600000, receivingAccount: "Vietcombank" },
    ],
  };

  const key1 = generateReceivableCollectionIdempotencyKey(base);
  const keyDiffSplits = generateReceivableCollectionIdempotencyKey({
    ...base,
    splits: [
      { method: "CASH", amount: 500000, receivingAccount: "Két tiền mặt" },
      { method: "BANK_TRANSFER", amount: 500000, receivingAccount: "Vietcombank" },
    ],
  });

  assert.notEqual(key1, keyDiffSplits);
});

test("generateExpenseIdempotencyKey produces deterministic keys conforming to max 120 chars", () => {
  const expense = {
    hotelId: "hotel-cmq2k2lm0003f2oui3ifqp808",
    expenseDate: "2026-11-26",
    category: "UTILITIES",
    title: "Tiền điện EVN tháng 11/2026",
    amount: 600000,
    paymentStatus: "PAID",
    paymentMethod: "BANK_TRANSFER",
    paymentAccount: "Techcombank",
  };

  const k1 = generateExpenseIdempotencyKey(expense);
  const k2 = generateExpenseIdempotencyKey(expense);
  assert.equal(k1, k2);
  assert.ok(k1.length <= 120);
  assert.ok(k1.startsWith("exp-"));
  assert.ok(k1.includes("2026-11-26"));
  assert.ok(k1.includes("600000"));

  const kDiffDate = generateExpenseIdempotencyKey({ ...expense, expenseDate: "2026-11-27" });
  assert.notEqual(k1, kDiffDate);
});
