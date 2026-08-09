import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(path.resolve(__dirname, "../../../../prisma/migrations/20260810030000_add_marketplace_orders/migration.sql"), "utf8");

describe("marketplace orders migration", () => {
  it("is additive, idempotency-safe, and capacity/revenue constrained", () => {
    for (const table of ["MarketplaceOrder", "MarketplaceOrderEvent", "MarketplaceRevenueEntry"]) expect(sql).toContain(`CREATE TABLE "${table}"`);
    expect(sql).toContain('CREATE UNIQUE INDEX "MarketplaceOrder_stayId_idempotencyKey_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "MarketplaceRevenueEntry_orderId_key"');
    expect(sql).toContain('CONSTRAINT "chk_marketplace_order_quantity_positive"');
    expect(sql).toContain('CONSTRAINT "chk_marketplace_order_amounts_non_negative"');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
  });
});
