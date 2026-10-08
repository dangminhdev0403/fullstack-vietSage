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

  await t.test(
    "preserves workspace boundaries and uses in-place tab switches instead of hardcoded cross-workspace Links",
    () => {
      assert.equal(
        code.includes('<Link href="/finance/'),
        false,
        "Must not hardcode cross-workspace Link components to /finance in billing navigation",
      );
      assert.ok(
        code.includes("handleTabChange"),
        "Must use handleTabChange to support in-place tab switching and URL synchronization",
      );
    },
  );

  await t.test(
    "integrates LocalMate platform fee configuration and live commission simulator",
    () => {
      assert.ok(
        code.includes('handleTabChange("localmate")'),
        "Must have tab switch handler for LocalMate fee configuration",
      );
      assert.ok(
        code.includes("Biểu phí LocalMate"),
        "Must render Biểu phí LocalMate tab button in segmented control tab bar",
      );
      assert.ok(
        code.includes("localMateAdminRepository") &&
        code.includes("pricingConfig") &&
        code.includes("updatePricingConfig"),
        "Must interact with localMateAdminRepository to fetch and persist fee rate",
      );
      assert.ok(
        code.includes("localmate-fee-input"),
        "Must provide input field for LocalMate platform fee rate",
      );
      assert.ok(
        code.includes("simTourPrice") && code.includes("sim-tour-price-input"),
        "Must include live commission simulator for LocalMate tour bookings",
      );
      assert.ok(
        code.includes("Phân định rõ ràng 3 luồng doanh thu trên nền tảng VietSage"),
        "Must explicitly separate LocalMate, Marketplace, and Hotel SaaS revenue streams",
      );
    },
  );
});

