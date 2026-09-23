import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260923120000_platform_billing_per_check_in/migration.sql",
);
const servicePath = join(
  process.cwd(),
  "src/modules/platform-billing/application/platform-billing.service.ts",
);

describe("platform billing per-check-in charge", () => {
  it("charges one immutable row per GuestStay check-in without periodic reconciliation", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    const service = readFileSync(servicePath, "utf8");

    expect(migration).toContain('DROP TRIGGER IF EXISTS "GuestStay_platform_usage_sync"');
    expect(migration).toContain("':GUEST_STAY:' || NEW.id");
    expect(migration).toContain("'GUEST_STAY', NEW.id");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("r.\"pricingModel\" = 'PERCENTAGE'");
    expect(migration).toContain('room.price * r."roomDayUnitPrice" / 100');
    expect(migration).toContain("PLATFORM_BILLING_ROOM_PRICE_REQUIRED");
    expect(service).not.toContain("@Interval(300_000)");
    expect(service).not.toContain("generate_series");
    expect(service).toContain("b.\"subjectType\" IN ('ROOM', 'GUEST_STAY')");
    expect(service).toContain("COALESCE(bs.\"roomId\", b.\"subjectId\")");
  });
});
