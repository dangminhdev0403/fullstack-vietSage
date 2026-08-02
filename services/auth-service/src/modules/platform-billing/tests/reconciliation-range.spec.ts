import { assertReconciliationRange } from "../application/platform-billing.service";

describe("assertReconciliationRange", () => {
  it("accepts a bounded 31-day catch-up window", () => {
    expect(() => assertReconciliationRange("2026-01-01", "2026-02-01", 31)).not.toThrow();
  });

  it("rejects empty, reversed, and oversized windows", () => {
    expect(() => assertReconciliationRange("2026-01-01", "2026-01-01", 31)).toThrow(
      "PLATFORM_BILLING_INVALID_RECONCILIATION_RANGE",
    );
    expect(() => assertReconciliationRange("2026-01-02", "2026-01-01", 31)).toThrow(
      "PLATFORM_BILLING_INVALID_RECONCILIATION_RANGE",
    );
    expect(() => assertReconciliationRange("2026-01-01", "2026-02-02", 31)).toThrow(
      "PLATFORM_BILLING_RECONCILIATION_RANGE_TOO_LARGE",
    );
  });
});
