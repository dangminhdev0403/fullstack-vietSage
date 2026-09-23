-- Preserve historical billable rows. New charges use one immutable GUEST_STAY row per check-in.
ALTER TABLE "PlatformBillableDay"
  DROP CONSTRAINT IF EXISTS "PlatformBillableDay_money_check";

ALTER TABLE "PlatformBillableDay"
  ADD CONSTRAINT "PlatformBillableDay_money_check"
  CHECK (quantity = 1 AND "unitPrice" >= 0 AND amount >= 0);

DROP TRIGGER IF EXISTS "GuestStay_platform_usage_sync" ON "GuestStay";

CREATE OR REPLACE FUNCTION sync_platform_usage_from_stay() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  hotel_timezone TEXT;
BEGIN
  IF NEW."checkedInAt" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE
    WHEN timezone = 'Asia/Saigon' OR timezone IS NULL THEN 'Asia/Ho_Chi_Minh'
    ELSE timezone
  END
  INTO hotel_timezone
  FROM "Hotel"
  WHERE id = NEW."hotelId";

  INSERT INTO "PlatformUsage" (
    id, "hotelId", "subjectType", "subjectId", "usageKind", "sourceType", "sourceId",
    occurrence, "startedAt", "endedAt", "durationMinutes", "hotelTimezoneSnapshot", "createdAt", "closedAt"
  ) VALUES (
    'pu_' || md5(NEW.id || ':1'), NEW."hotelId", 'GUEST_STAY', NEW.id,
    'CHECK_IN', 'GUEST_STAY', NEW.id, 1, NEW."checkedInAt", NEW."checkedOutAt",
    CASE
      WHEN NEW."checkedOutAt" IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW."checkedOutAt" - NEW."checkedInAt")) / 60))::integer
    END,
    hotel_timezone, NOW(), NEW."checkedOutAt"
  )
  ON CONFLICT ("sourceType", "sourceId", occurrence) DO UPDATE
    SET "endedAt" = EXCLUDED."endedAt",
        "durationMinutes" = EXCLUDED."durationMinutes",
        "closedAt" = EXCLUDED."closedAt"
    WHERE "PlatformUsage"."endedAt" IS NULL AND EXCLUDED."endedAt" IS NOT NULL;

  IF TG_OP = 'INSERT' OR OLD."checkedInAt" IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "PlatformBillingContract" c
      JOIN "Room" room ON room.id = NEW."roomId" AND room."hotelId" = NEW."hotelId"
      JOIN LATERAL (
        SELECT revision.*
        FROM "PlatformBillingContractRevision" revision
        WHERE revision."contractId" = c.id
          AND revision."effectiveFrom" <= (NEW."checkedInAt" AT TIME ZONE hotel_timezone)::date
        ORDER BY revision."effectiveFrom" DESC
        LIMIT 1
      ) r ON TRUE
      WHERE c."hotelId" = NEW."hotelId"
        AND c.status = 'ACTIVE'
        AND c."billingStartedAt" <= NEW."checkedInAt"
        AND r."pricingModel" = 'PERCENTAGE'
        AND room.price IS NULL
    ) THEN
      RAISE EXCEPTION 'PLATFORM_BILLING_ROOM_PRICE_REQUIRED';
    END IF;

    INSERT INTO "PlatformBillableDay" (
      id, "contractId", "contractRevisionId", "hotelId", "subjectType", "subjectId", "serviceDate",
      "hotelTimezoneSnapshot", "starTierSnapshot", "unitPrice", quantity, amount, currency,
      "calculationVersion", "sourceWindowStart", "sourceWindowEnd", "createdAt"
    )
    SELECT
      'pbd_' || md5(c.id || ':GUEST_STAY:' || NEW.id),
      c.id,
      r.id,
      NEW."hotelId",
      'GUEST_STAY',
      NEW.id,
      local_day,
      hotel_timezone,
      r."starTierSnapshot",
      r."roomDayUnitPrice",
      1,
      CASE
        WHEN r."pricingModel" = 'PERCENTAGE'
          THEN ROUND(room.price * r."roomDayUnitPrice" / 100, 2)
        ELSE r."roomDayUnitPrice"
      END,
      r.currency,
      2,
      NEW."checkedInAt",
      NEW."checkedInAt" + interval '1 second',
      NOW()
    FROM "PlatformBillingContract" c
    JOIN "Room" room ON room.id = NEW."roomId" AND room."hotelId" = NEW."hotelId"
    CROSS JOIN LATERAL (
      SELECT (NEW."checkedInAt" AT TIME ZONE hotel_timezone)::date AS local_day
    ) d
    JOIN LATERAL (
      SELECT revision.*
      FROM "PlatformBillingContractRevision" revision
      WHERE revision."contractId" = c.id
        AND revision."effectiveFrom" <= d.local_day
      ORDER BY revision."effectiveFrom" DESC
      LIMIT 1
    ) r ON TRUE
    WHERE c."hotelId" = NEW."hotelId"
      AND c.status = 'ACTIVE'
      AND c."billingStartedAt" <= NEW."checkedInAt"
      AND NOT EXISTS (
        SELECT 1
        FROM "PlatformBillingPeriod" p
        WHERE p."contractId" = c.id
          AND p.status = 'FINALIZED'
          AND d.local_day >= p."periodStart"
          AND d.local_day < p."periodEnd"
      )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "GuestStay_platform_usage_sync"
AFTER INSERT OR UPDATE OF "checkedInAt", "checkedOutAt" ON "GuestStay"
FOR EACH ROW EXECUTE FUNCTION sync_platform_usage_from_stay();
