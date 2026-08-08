import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const clientSourcePath = path.join(
  process.cwd(),
  "src/app/(vietsage)/admin/billing/admin-billing-client.tsx"
);

test("AdminBillingClient source contract for debt and settlement invariants", async (t) => {
  const code = fs.readFileSync(clientSourcePath, "utf-8");

  await t.test("does not infer payment status from lifecycle p.status === 'PAID'", () => {
    assert.equal(
      code.includes('p.status === "PAID"'),
      false,
      "Found invalid lifecycle status check p.status === 'PAID'"
    );
    assert.equal(
      code.includes('p.status !== "PAID"'),
      false,
      "Found invalid lifecycle status check p.status !== 'PAID'"
    );
    assert.ok(
      code.includes("paymentState"),
      "Must reference backend paymentState projection property"
    );
  });

  await t.test("modal defaults settlement amount to outstandingAmount", () => {
    assert.ok(
      code.includes("outstandingAmount"),
      "Must default settlement amount using outstandingAmount"
    );
  });

  await t.test("renders KPI metrics: finalizedAmount, collectedAmount, outstandingAmount, overduePeriodCount", () => {
    assert.ok(code.includes("finalizedAmount"), "KPI must include finalizedAmount");
    assert.ok(code.includes("collectedAmount"), "KPI must include collectedAmount");
    assert.ok(code.includes("outstandingAmount"), "KPI must include outstandingAmount");
    assert.ok(code.includes("overduePeriodCount"), "KPI must include overduePeriodCount");
    assert.equal(
      code.includes("totalFinalizedRevenue"),
      false,
      "Must not reference deprecated totalFinalizedRevenue"
    );
  });

  await t.test("generates and preserves idempotency key per modal session across retries", () => {
    assert.ok(
      code.includes("settlementIdempotencyKey") || code.includes("idempotencyKey"),
      "Must track settlement idempotency key in modal state"
    );
    assert.equal(
      code.includes("Date.now()") && code.includes("idempotencyKey: `settle_"),
      false,
      "Must not generate new idempotencyKey using Date.now() directly inside submit handler"
    );
  });
});
