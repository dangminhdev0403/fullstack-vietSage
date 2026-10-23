import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function resolveRepoFile(relPath: string): string {
  const direct = path.join(process.cwd(), relPath);
  if (fs.existsSync(direct)) return direct;
  const frontendPath = path.join(process.cwd(), "frontends/front-end-vietsage", relPath);
  if (fs.existsSync(frontendPath)) return frontendPath;
  return direct;
}

function parseFormattedNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    // Plain integer string: "500000", "-50000"
    if (/^-?\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      return Number.isFinite(num) ? num : 0;
    }

    // Database / API Decimal with 1-2 decimal places: e.g. "500000.00", "-50000.00"
    if (/^-?\d+\.\d{1,2}$/.test(trimmed)) {
      const num = Math.round(Number(trimmed));
      return Number.isFinite(num) ? num : 0;
    }

    // Formatted Vietnamese string with thousand dots or commas (e.g. "500.000", "-50.000", "1.000.000")
    const isNegative = trimmed.startsWith("-");
    const cleanDigits = trimmed.replace(/[^\d]/g, "");
    const parsed = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    return isNegative ? -parsed : parsed;
  }
  return 0;
}

test("Billing parseFormattedNumber and calculation regression tests", async (t) => {
  await t.test("parseFormattedNumber handles integers, negative values, and decimal strings correctly", () => {
    assert.strictEqual(parseFormattedNumber(500000), 500000);
    assert.strictEqual(parseFormattedNumber(-50000), -50000);
    assert.strictEqual(parseFormattedNumber("500000"), 500000);
    assert.strictEqual(parseFormattedNumber("-50000"), -50000);
    assert.strictEqual(parseFormattedNumber("500000.00"), 500000);
    assert.strictEqual(parseFormattedNumber("-50000.00"), -50000);
    assert.strictEqual(parseFormattedNumber("500.000"), 500000);
    assert.strictEqual(parseFormattedNumber("-50.000"), -50000);
    assert.strictEqual(parseFormattedNumber("1.000.000"), 1000000);
    assert.strictEqual(parseFormattedNumber(""), 0);
    assert.strictEqual(parseFormattedNumber(null), 0);
    assert.strictEqual(parseFormattedNumber(undefined), 0);
  });

  await t.test("StaffBillingWorkspaceClient preserves existing folio discount in computed total", () => {
    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");

    // Must define existingDiscountTotal
    assert.ok(code.includes("existingDiscountTotal"), "Must define existingDiscountTotal");
    // Must deduct existing discount from open folios or use authoritative total for closed
    assert.ok(code.includes("subtotal + tax - existingDiscountTotal"), "Must subtract existingDiscountTotal from computed total");
    // Must display negative formatting for DISCOUNT items
    assert.ok(code.includes('item.itemType === "DISCOUNT"'), "Must distinguish DISCOUNT itemType in table");
    // Must display applied discount row in golden checkout card
    assert.ok(code.includes("Giảm giá đã áp dụng"), "Must display applied discount breakdown row");
    assert.ok(code.includes("Giá gốc tiền phòng"), "Must display the snapshotted base room charge");
    assert.ok(
      code.includes("Tăng so với giá gốc") && code.includes("Giảm so với giá gốc"),
      "Must label room-rate increase and decrease clearly",
    );
  });

  await t.test("Invoice detail pages display discount with negative indicator", () => {
    const staffInvoiceFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx",
    );
    const ownerInvoiceFile = resolveRepoFile(
      "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx",
    );
    const staffCode = fs.readFileSync(staffInvoiceFile, "utf-8");
    const ownerCode = fs.readFileSync(ownerInvoiceFile, "utf-8");

    assert.ok(staffCode.includes("`-${formatMoney(invoice.discountAmount"), "Staff invoice must show - for discount");
    assert.ok(ownerCode.includes("`-${formatMoney(invoice.discountAmount"), "Owner invoice must show - for discount");
  });

  await t.test("H6: isCashSettlementAllowed blocks settlement when received cash is below amount due", () => {
    function isCashSettlementAllowed(
      cashGivenInput: string | number,
      amountDue: number,
    ): boolean {
      if (cashGivenInput === "" || cashGivenInput === null || cashGivenInput === undefined) {
        return true;
      }
      const cash = parseFormattedNumber(cashGivenInput);
      return cash >= amountDue;
    }

    assert.strictEqual(isCashSettlementAllowed("100.000", 500000), false, "100k cash < 500k due must be rejected");
    assert.strictEqual(isCashSettlementAllowed("0", 500000), false, "0 cash < 500k due must be rejected");
    assert.strictEqual(isCashSettlementAllowed("499.999", 500000), false, "499.999 cash < 500k due must be rejected");
    assert.strictEqual(isCashSettlementAllowed("500.000", 500000), true, "500k cash == 500k due must be allowed");
    assert.strictEqual(isCashSettlementAllowed("1.000.000", 500000), true, "1M cash > 500k due must be allowed");
    assert.strictEqual(isCashSettlementAllowed("", 500000), true, "Empty input (no change calculator) allows checkout");

    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");
    assert.ok(code.includes("isCashSettlementAllowed"), "Workspace client must export and enforce isCashSettlementAllowed");
    assert.ok(
      code.includes("!isCashSettlementAllowed(cashGivenInput, computedTotal)"),
      "Workspace client must disable button or block checkout when cash is insufficient",
    );
  });

  await t.test("H3: StaffBillingWorkspaceClient does not fall back to 500000 or current-room price", () => {
    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");
    assert.ok(!code.includes("price > 0 ? price : 500000"), "Must not fall back to 500000 in estimatedRoomChargeData");
  });

  await t.test("H4: StaffBillingWorkspaceClient rejects discounts that make total negative", () => {
    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");
    assert.ok(
      code.includes("Số tiền giảm giá không được làm tổng tiền trở thành số âm"),
      "Must validate that discount does not cause negative total",
    );
  });
});
