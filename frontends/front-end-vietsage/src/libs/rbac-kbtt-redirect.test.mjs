import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit TypeScript extension.
import {
  resolveAdminBillingEquivalent,
  resolveFinanceBillingEquivalent,
  resolveTenantOwnerKbttEquivalent,
} from "../features/auth/utils/cross-workspace-equivalent.ts";

test("staff-KBTT URL resolves to the equivalent owner KBTT page", () => {
  assert.equal(
    resolveTenantOwnerKbttEquivalent("/hotels/hotel-1/kbtt?from=sidebar"),
    "/owner/hotels/hotel-1/kbtt?from=sidebar",
  );
  assert.equal(resolveTenantOwnerKbttEquivalent("/hotels/hotel-1/rooms"), null);
});

test("finance billing URLs resolve to equivalent admin billing tabs", () => {
  assert.equal(
    resolveAdminBillingEquivalent("/finance/finalize"),
    "/admin/billing?tab=finalize",
  );
  assert.equal(
    resolveAdminBillingEquivalent("/finance/contracts"),
    "/admin/billing?tab=contracts",
  );
  assert.equal(
    resolveAdminBillingEquivalent("/finance/billing"),
    "/admin/billing",
  );
  assert.equal(
    resolveAdminBillingEquivalent("/finance/finalize?period=2026-09"),
    "/admin/billing?period=2026-09&tab=finalize",
  );
  assert.equal(
    resolveAdminBillingEquivalent("/admin/dashboard"),
    null,
  );
});

test("admin billing URLs resolve to equivalent finance billing pages", () => {
  assert.equal(
    resolveFinanceBillingEquivalent("/admin/billing?tab=finalize"),
    "/finance/finalize",
  );
  assert.equal(
    resolveFinanceBillingEquivalent("/admin/billing?tab=contracts"),
    "/finance/contracts",
  );
  assert.equal(
    resolveFinanceBillingEquivalent("/admin/billing"),
    "/finance/billing",
  );
  assert.equal(
    resolveFinanceBillingEquivalent("/admin/billing?month=2026-09&tab=finalize"),
    "/finance/finalize?month=2026-09",
  );
  assert.equal(
    resolveFinanceBillingEquivalent("/admin/dashboard"),
    null,
  );
});

