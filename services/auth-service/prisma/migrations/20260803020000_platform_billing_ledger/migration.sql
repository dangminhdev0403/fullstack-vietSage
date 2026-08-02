CREATE TYPE "PlatformBillingContractStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "PlatformBillingPeriodStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOID');

CREATE TABLE "PlatformBillingContract" (
  "id" TEXT PRIMARY KEY,
  "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE RESTRICT,
  "status" "PlatformBillingContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "onboardedAt" TIMESTAMP(3) NOT NULL,
  "billingStartedAt" TIMESTAMP(3) NOT NULL,
  "reconciledThroughDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PlatformBillingContract_hotelId_status_idx" ON "PlatformBillingContract"("hotelId", "status");
CREATE INDEX "PlatformBillingContract_status_reconciledThroughDate_id_idx" ON "PlatformBillingContract"("status", "reconciledThroughDate", "id");
CREATE UNIQUE INDEX "PlatformBillingContract_one_active_hotel_idx" ON "PlatformBillingContract"("hotelId") WHERE "status" = 'ACTIVE';

CREATE TABLE "PlatformBillingContractRevision" (
  "id" TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT,
  "effectiveFrom" DATE NOT NULL,
  "starTierSnapshot" INTEGER NOT NULL,
  "roomDayUnitPrice" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "paymentTermDays" INTEGER NOT NULL DEFAULT 7,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformBillingContractRevision_price_check" CHECK ("roomDayUnitPrice" >= 0),
  CONSTRAINT "PlatformBillingContractRevision_tier_check" CHECK ("starTierSnapshot" >= 1),
  CONSTRAINT "PlatformBillingContractRevision_term_check" CHECK ("paymentTermDays" >= 0)
);
CREATE UNIQUE INDEX "PlatformBillingContractRevision_contractId_effectiveFrom_key" ON "PlatformBillingContractRevision"("contractId", "effectiveFrom");
CREATE INDEX "PlatformBillingContractRevision_contractId_effectiveFrom_idx" ON "PlatformBillingContractRevision"("contractId", "effectiveFrom");

CREATE TABLE "PlatformUsage" (
  "id" TEXT PRIMARY KEY,
  "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE RESTRICT,
  "subjectType" VARCHAR(32) NOT NULL DEFAULT 'ROOM',
  "subjectId" VARCHAR(120) NOT NULL,
  "usageKind" VARCHAR(32) NOT NULL DEFAULT 'STAY',
  "sourceType" VARCHAR(32) NOT NULL DEFAULT 'GUEST_STAY',
  "sourceId" VARCHAR(120) NOT NULL,
  "occurrence" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "hotelTimezoneSnapshot" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "PlatformUsage_interval_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "PlatformUsage_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" >= 0)
);
CREATE UNIQUE INDEX "PlatformUsage_sourceType_sourceId_occurrence_key" ON "PlatformUsage"("sourceType", "sourceId", "occurrence");
CREATE INDEX "PlatformUsage_hotelId_startedAt_endedAt_idx" ON "PlatformUsage"("hotelId", "startedAt", "endedAt");
CREATE INDEX "PlatformUsage_subjectType_subjectId_startedAt_idx" ON "PlatformUsage"("subjectType", "subjectId", "startedAt");

CREATE TABLE "PlatformBillingPeriod" (
  "id" TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "PlatformBillingPeriodStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformBillingPeriod_dates_check" CHECK ("periodEnd" > "periodStart")
);
CREATE UNIQUE INDEX "PlatformBillingPeriod_contractId_periodStart_periodEnd_key" ON "PlatformBillingPeriod"("contractId", "periodStart", "periodEnd");
CREATE INDEX "PlatformBillingPeriod_contractId_status_periodStart_periodEnd_idx" ON "PlatformBillingPeriod"("contractId", "status", "periodStart", "periodEnd");

CREATE TABLE "PlatformBillableDay" (
  "id" TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT,
  "contractRevisionId" TEXT NOT NULL REFERENCES "PlatformBillingContractRevision"("id") ON DELETE RESTRICT,
  "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE RESTRICT,
  "subjectType" VARCHAR(32) NOT NULL DEFAULT 'ROOM',
  "subjectId" VARCHAR(120) NOT NULL,
  "serviceDate" DATE NOT NULL,
  "hotelTimezoneSnapshot" VARCHAR(80) NOT NULL,
  "starTierSnapshot" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "calculationVersion" INTEGER NOT NULL DEFAULT 1,
  "sourceWindowStart" TIMESTAMP(3) NOT NULL,
  "sourceWindowEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformBillableDay_money_check" CHECK ("quantity" = 1 AND "unitPrice" >= 0 AND "amount" = "unitPrice"),
  CONSTRAINT "PlatformBillableDay_window_check" CHECK ("sourceWindowEnd" > "sourceWindowStart")
);
CREATE UNIQUE INDEX "PlatformBillableDay_contract_subject_date_key" ON "PlatformBillableDay"("contractId", "subjectType", "subjectId", "serviceDate");
CREATE INDEX "PlatformBillableDay_contractId_serviceDate_idx" ON "PlatformBillableDay"("contractId", "serviceDate");
CREATE INDEX "PlatformBillableDay_hotelId_serviceDate_idx" ON "PlatformBillableDay"("hotelId", "serviceDate");
CREATE INDEX "PlatformBillableDay_contractRevisionId_serviceDate_idx" ON "PlatformBillableDay"("contractRevisionId", "serviceDate");

CREATE FUNCTION reject_platform_billing_immutable_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PLATFORM_BILLING_IMMUTABLE_ROW';
END;
$$;
CREATE TRIGGER "PlatformBillableDay_immutable" BEFORE UPDATE OR DELETE ON "PlatformBillableDay" FOR EACH ROW EXECUTE FUNCTION reject_platform_billing_immutable_mutation();
CREATE TRIGGER "PlatformBillingContractRevision_immutable" BEFORE UPDATE OR DELETE ON "PlatformBillingContractRevision" FOR EACH ROW EXECUTE FUNCTION reject_platform_billing_immutable_mutation();

CREATE FUNCTION sync_platform_usage_from_stay() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hotel_timezone TEXT;
BEGIN
  IF NEW."checkedInAt" IS NULL THEN RETURN NEW; END IF;
  SELECT timezone INTO hotel_timezone FROM "Hotel" WHERE id = NEW."hotelId";
  INSERT INTO "PlatformUsage" (
    id, "hotelId", "subjectType", "subjectId", "usageKind", "sourceType", "sourceId",
    occurrence, "startedAt", "endedAt", "durationMinutes", "hotelTimezoneSnapshot", "createdAt", "closedAt"
  ) VALUES (
    'pu_' || md5(NEW.id || ':1'), NEW."hotelId", 'ROOM', NEW."roomId", 'STAY', 'GUEST_STAY', NEW.id,
    1, NEW."checkedInAt", NEW."checkedOutAt",
    CASE WHEN NEW."checkedOutAt" IS NULL THEN NULL ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW."checkedOutAt" - NEW."checkedInAt")) / 60))::integer END,
    hotel_timezone, NOW(), NEW."checkedOutAt"
  ) ON CONFLICT ("sourceType", "sourceId", occurrence) DO UPDATE
    SET "endedAt" = EXCLUDED."endedAt", "durationMinutes" = EXCLUDED."durationMinutes", "closedAt" = EXCLUDED."closedAt"
    WHERE "PlatformUsage"."endedAt" IS NULL AND EXCLUDED."endedAt" IS NOT NULL;

  INSERT INTO "PlatformBillableDay" (
    id, "contractId", "contractRevisionId", "hotelId", "subjectType", "subjectId", "serviceDate",
    "hotelTimezoneSnapshot", "starTierSnapshot", "unitPrice", quantity, amount, currency,
    "calculationVersion", "sourceWindowStart", "sourceWindowEnd", "createdAt"
  )
  SELECT 'pbd_' || md5(c.id || ':ROOM:' || NEW."roomId" || ':' || local_day::text),
         c.id, r.id, NEW."hotelId", 'ROOM', NEW."roomId", local_day, hotel_timezone,
         r."starTierSnapshot", r."roomDayUnitPrice", 1, r."roomDayUnitPrice", r.currency, 1,
         local_day::timestamp AT TIME ZONE hotel_timezone,
         (local_day + 1)::timestamp AT TIME ZONE hotel_timezone, NOW()
  FROM "PlatformBillingContract" c
  CROSS JOIN LATERAL (SELECT (NEW."checkedInAt" AT TIME ZONE hotel_timezone)::date AS local_day) d
  JOIN LATERAL (
    SELECT revision.* FROM "PlatformBillingContractRevision" revision
    WHERE revision."contractId" = c.id AND revision."effectiveFrom" <= d.local_day
    ORDER BY revision."effectiveFrom" DESC LIMIT 1
  ) r ON TRUE
  WHERE c."hotelId" = NEW."hotelId" AND c.status = 'ACTIVE'
    AND c."billingStartedAt" <= NEW."checkedInAt"
    AND NOT EXISTS (
      SELECT 1 FROM "PlatformBillingPeriod" p WHERE p."contractId" = c.id AND p.status = 'FINALIZED'
        AND d.local_day >= p."periodStart" AND d.local_day < p."periodEnd"
    )
  ON CONFLICT ("contractId", "subjectType", "subjectId", "serviceDate") DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "GuestStay_platform_usage_sync"
AFTER INSERT OR UPDATE OF "checkedInAt", "checkedOutAt" ON "GuestStay"
FOR EACH ROW EXECUTE FUNCTION sync_platform_usage_from_stay();
