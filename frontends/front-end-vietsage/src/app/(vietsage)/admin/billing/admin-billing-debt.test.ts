import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const clientSourcePath = path.join(
  process.cwd(),
  "src/app/(vietsage)/admin/billing/admin-billing-client.tsx",
);

test("AdminBillingClient source contract for debt and settlement invariants", async (t) => {
  const code = fs.readFileSync(clientSourcePath, "utf-8");

  await t.test(
    "does not infer payment status from lifecycle p.status === 'PAID'",
    () => {
      assert.equal(
        code.includes('p.status === "PAID"'),
        false,
        "Found invalid lifecycle status check p.status === 'PAID'",
      );
      assert.equal(
        code.includes('p.status !== "PAID"'),
        false,
        "Found invalid lifecycle status check p.status !== 'PAID'",
      );
      assert.ok(
        code.includes("paymentState"),
        "Must reference backend paymentState projection property",
      );
    },
  );

  await t.test("modal defaults settlement amount to outstandingAmount", () => {
    assert.ok(
      code.includes("outstandingAmount"),
      "Must default settlement amount using outstandingAmount",
    );
  });

  await t.test(
    "renders KPI metrics: finalizedAmount, collectedAmount, outstandingAmount, overduePeriodCount",
    () => {
      assert.ok(
        code.includes("finalizedAmount"),
        "KPI must include finalizedAmount",
      );
      assert.ok(
        code.includes("collectedAmount"),
        "KPI must include collectedAmount",
      );
      assert.ok(
        code.includes("outstandingAmount"),
        "KPI must include outstandingAmount",
      );
      assert.ok(
        code.includes("overduePeriodCount"),
        "KPI must include overduePeriodCount",
      );
      assert.equal(
        code.includes("totalFinalizedRevenue"),
        false,
        "Must not reference deprecated totalFinalizedRevenue",
      );
    },
  );

  await t.test(
    "generates and preserves idempotency key per modal session across retries",
    () => {
      assert.ok(
        code.includes("settlementIdempotencyKey") ||
          code.includes("idempotencyKey"),
        "Must track settlement idempotency key in modal state",
      );
      assert.equal(
        code.includes("Date.now()") &&
          code.includes("idempotencyKey: `settle_"),
        false,
        "Must not generate new idempotencyKey using Date.now() directly inside submit handler",
      );
    },
  );

  await t.test("records a manual reminder without claiming delivery", () => {
    assert.ok(code.includes('channel: "MANUAL"'));
    assert.ok(code.includes("Ghi nhận đã nhắc nợ"));
    assert.equal(code.includes("Gửi báo nợ"), false);
  });

  await t.test(
    "onboard modal validates active contracts and includes live fee estimator",
    () => {
      assert.ok(
        code.includes("activeHotelIds") || code.includes("activeContractHotelIds"),
        "Must track active hotel contract IDs to prevent duplicate contracts",
      );
      assert.ok(
        code.includes("projectedMonthlyFee") || code.includes("Mô phỏng doanh thu"),
        "Must provide live simulation/estimator for projected SaaS fees",
      );
      assert.ok(
        code.includes("onboard-hotel-select"),
        "Must use dropdown select for hotel entities",
      );
      assert.ok(
        code.includes("pricingModel: \"FIXED\"") && code.includes("pricingModel: \"PERCENTAGE\""),
        "Must support both FIXED and PERCENTAGE pricing models",
      );
    },
  );
});
