import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260803020000_platform_billing_ledger/migration.sql"),
  "utf8",
);

describe("platform billing database invariants", () => {
  it("enforces exactly-once immutable room-day charges", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "PlatformBillableDay_contract_subject_date_key"',
    );
    expect(migration).toContain('CREATE TRIGGER "PlatformBillableDay_immutable"');
    expect(migration).toContain(
      'ON CONFLICT ("contractId", "subjectType", "subjectId", "serviceDate") DO NOTHING',
    );
  });

  it("captures every GuestStay check-in and checkout path at the database boundary", () => {
    expect(migration).toContain('CREATE TRIGGER "GuestStay_platform_usage_sync"');
    expect(migration).toContain(
      'AFTER INSERT OR UPDATE OF "checkedInAt", "checkedOutAt" ON "GuestStay"',
    );
  });

  it("provides indexed bounded reconciliation access paths", () => {
    expect(migration).toContain('"PlatformBillableDay_contractId_serviceDate_idx"');
    expect(migration).toContain('"PlatformUsage_hotelId_startedAt_endedAt_idx"');
    expect(migration).toContain('"PlatformBillingContract_status_reconciledThroughDate_id_idx"');
  });
});
