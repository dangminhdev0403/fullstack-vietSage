import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const clientSourcePath = path.join(
  process.cwd(),
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx"
);

test("OwnerSaasBillingClient source contract for debt and projected payment visibility", async (t) => {
  const code = fs.readFileSync(clientSourcePath, "utf-8");

  await t.test("type DTO uses projected debt fields and omits raw settlements", () => {
    assert.ok(code.includes("settledAmount"), "Period DTO must include settledAmount");
    assert.ok(code.includes("outstandingAmount"), "Period DTO must include outstandingAmount");
    assert.ok(code.includes("paymentState"), "Period DTO must include paymentState");
    assert.ok(code.includes("isOverdue"), "Period DTO must include isOverdue");
    assert.equal(
      code.includes("settlements?:"),
      false,
      "Period DTO must omit raw settlements field"
    );
  });

  await t.test("renders Vietnamese labels: Đã thanh toán, Còn phải trả, Quá hạn", () => {
    assert.ok(code.includes("Đã thanh toán"), "Must render label 'Đã thanh toán'");
    assert.ok(code.includes("Còn phải trả"), "Must render label 'Còn phải trả'");
    assert.ok(code.includes("Quá hạn"), "Must render label 'Quá hạn'");
  });

  await t.test("does not infer payment status from p.status === 'PAID' or reduce settlements", () => {
    assert.equal(
      code.includes('p.status === "PAID"'),
      false,
      "Must not check p.status === 'PAID'"
    );
    assert.equal(
      code.includes("settlements.reduce"),
      false,
      "Must not sum settlements locally with reduce"
    );
  });

  await t.test("remains read-only without mutation actions or buttons", () => {
    assert.equal(
      code.includes("handleRecordSettlement"),
      false,
      "Owner client must remain read-only without settlement mutation handlers"
    );
  });
});
