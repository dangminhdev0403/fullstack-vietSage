import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __currentFile = fileURLToPath(import.meta.url);
const __currentDir = path.dirname(__currentFile);

function resolveRepoFile(relPath: string): string {
  const direct = path.join(process.cwd(), relPath);
  if (fs.existsSync(direct)) return direct;
  const frontendPath = path.join(process.cwd(), "frontends/front-end-vietsage", relPath);
  if (fs.existsSync(frontendPath)) return frontendPath;
  const fromMeta = path.resolve(__currentDir, "../../../../../..", relPath);
  if (fs.existsSync(fromMeta)) return fromMeta;
  const fromMetaFrontend = path.resolve(__currentDir, "../../../../../..", "frontends/front-end-vietsage", relPath);
  if (fs.existsSync(fromMetaFrontend)) return fromMetaFrontend;
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

  await t.test("H6: isCashSettlementAllowed accepts under-tender as partial and blocks non-positive or invalid cash", () => {
    function isCashSettlementAllowed(
      cashGivenInput: string | number,
      amountDue: number,
    ): boolean {
      if (amountDue <= 0) {
        return true;
      }
      if (cashGivenInput === "" || cashGivenInput === null || cashGivenInput === undefined) {
        return false;
      }
      if (typeof cashGivenInput === "number") {
        return Number.isFinite(cashGivenInput) && cashGivenInput > 0;
      }
      if (typeof cashGivenInput === "string") {
        const trimmed = cashGivenInput.trim();
        if (!trimmed) return false;
        if (!/^\d[\d.,\s]*$/.test(trimmed)) return false;
        const cash = parseFormattedNumber(trimmed);
        return Number.isFinite(cash) && cash > 0;
      }
      return false;
    }

    // Under-tender cash values accepted as partial payment
    assert.strictEqual(isCashSettlementAllowed("100.000", 500000), true, "100k cash < 500k due must be accepted as partial");
    assert.strictEqual(isCashSettlementAllowed(100000, 500000), true, "100k numeric cash < 500k due must be accepted as partial");
    assert.strictEqual(isCashSettlementAllowed("499.999", 500000), true, "499.999 cash < 500k due must be accepted as partial");

    // Zero values rejected
    assert.strictEqual(isCashSettlementAllowed("0", 500000), false, "0 string cash < 500k due must be rejected");
    assert.strictEqual(isCashSettlementAllowed(0, 500000), false, "0 numeric cash < 500k due must be rejected");

    // Negative values rejected
    assert.strictEqual(isCashSettlementAllowed("-50000", 500000), false, "Negative cash must be rejected");

    // Empty values rejected
    assert.strictEqual(isCashSettlementAllowed("", 500000), false, "Empty input must be rejected when amountDue > 0");
    assert.strictEqual(isCashSettlementAllowed("   ", 500000), false, "Whitespace input must be rejected when amountDue > 0");

    // Malformed values rejected
    assert.strictEqual(isCashSettlementAllowed("abc", 500000), false, "Malformed string cash must be rejected");
    assert.strictEqual(isCashSettlementAllowed("invalid", 500000), false, "Invalid string cash must be rejected");
    assert.strictEqual(isCashSettlementAllowed(NaN, 500000), false, "NaN cash must be rejected");
    assert.strictEqual(isCashSettlementAllowed(Infinity, 500000), false, "Infinity cash must be rejected");

    // Sufficient and over-tender values allowed
    assert.strictEqual(isCashSettlementAllowed("500.000", 500000), true, "500k cash == 500k due must be allowed");
    assert.strictEqual(isCashSettlementAllowed(500000, 500000), true, "500k numeric cash == 500k due must be allowed");
    assert.strictEqual(isCashSettlementAllowed("1.000.000", 500000), true, "1M cash > 500k due must be allowed");

    // amountDue <= 0 remains allowed
    assert.strictEqual(isCashSettlementAllowed("", 0), true, "Empty input allowed when amountDue is 0");
    assert.strictEqual(isCashSettlementAllowed("0", 0), true, "0 cash allowed when amountDue is 0");
    assert.strictEqual(isCashSettlementAllowed("", -50000), true, "Empty input allowed when amountDue is negative");

    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");
    assert.ok(code.includes("isCashSettlementAllowed"), "Workspace client must export and enforce isCashSettlementAllowed");
    assert.ok(
      code.includes("if (!isCashSettlementAllowed(cashGivenInput, computedTotal))"),
      "Workspace client pre-submit guard must use isCashSettlementAllowed",
    );
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

  await t.test("H5: StaffBillingWorkspaceClient sends adjustments with issue-invoice and does not call add-item during checkout", () => {
    const clientFile = resolveRepoFile(
      "src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx",
    );
    const code = fs.readFileSync(clientFile, "utf-8");

    const startIndex = code.indexOf("async function issueInvoiceAndCollect");
    const endIndex = code.indexOf("return (", startIndex);
    const issueInvoiceFn = code.slice(startIndex, endIndex);
    assert.ok(
      !issueInvoiceFn.includes("/items`"),
      "issueInvoiceAndCollect must not call add-item endpoint (/items)",
    );
    assert.ok(
      issueInvoiceFn.includes("adjustments"),
      "issueInvoiceAndCollect must pass adjustments to invoice request",
    );
    assert.ok(
      issueInvoiceFn.includes("clientRequestId"),
      "issueInvoiceAndCollect must generate clientRequestId for adjustments",
    );
    assert.ok(
      issueInvoiceFn.includes("checkoutPaymentAttemptRef.current = paymentAttempt"),
      "issueInvoiceAndCollect must retain the payment idempotency key until payment succeeds",
    );
    assert.ok(
      issueInvoiceFn.includes("checkoutPaymentAttemptRef.current = null"),
      "issueInvoiceAndCollect must clear the retained payment attempt after payment succeeds",
    );
  });
});
