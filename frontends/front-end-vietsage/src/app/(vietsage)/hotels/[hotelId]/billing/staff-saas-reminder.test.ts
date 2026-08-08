import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const billingServicePath = path.join(
  process.cwd(),
  "src/features/billing/service/billing-service.ts"
);

const pagePath = path.join(
  process.cwd(),
  "src/app/(vietsage)/hotels/[hotelId]/billing/page.tsx"
);

const reminderPath = path.join(
  process.cwd(),
  "src/app/(vietsage)/hotels/[hotelId]/billing/staff-saas-reminder.tsx"
);

test("Slice 5B staff SaaS due reminder security & rendering contract", async (t) => {
  const serviceCode = fs.readFileSync(billingServicePath, "utf-8");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const reminderCode = fs.readFileSync(reminderPath, "utf-8");

  await t.test("BillingService has getPlatformBillingAnalytics method accessing backend platform-billing endpoint", () => {
    assert.ok(
      serviceCode.includes("getPlatformBillingAnalytics"),
      "BillingService must expose getPlatformBillingAnalytics"
    );
    assert.ok(
      serviceCode.includes("/platform-billing/owner/analytics/"),
      "BillingService must call /platform-billing/owner/analytics/ path"
    );
  });

  await t.test("StaffBillingPage permission gate checks hotel.revenue-protection.view before calling analytics", () => {
    assert.ok(
      pageCode.includes('context.permissions.includes("hotel.revenue-protection.view")'),
      "Page must explicitly check hotel.revenue-protection.view permission before initiating analytics fetch"
    );
    assert.ok(
      pageCode.includes("getPlatformBillingAnalytics"),
      "Page must invoke getPlatformBillingAnalytics when permission is present"
    );
  });

  await t.test("StaffSaasReminder renders Vietnamese copies and Báo chủ khách sạn instruction", () => {
    assert.ok(
      reminderCode.includes("Quá hạn phí VietSage SaaS") || reminderCode.includes("Quá hạn thanh toán phí VietSage SaaS"),
      "Reminder component must render overdue title"
    );
    assert.ok(
      reminderCode.includes("Sắp đến hạn trong 7 ngày"),
      "Reminder component must render due soon title"
    );
    assert.ok(
      reminderCode.includes("Báo chủ khách sạn"),
      "Reminder component must include exact 'Báo chủ khách sạn' instruction"
    );
    assert.equal(
      reminderCode.includes("<button"),
      false,
      "Reminder component must be read-only with no interactive buttons"
    );
  });
});
