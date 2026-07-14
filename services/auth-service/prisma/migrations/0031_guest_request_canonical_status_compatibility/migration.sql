DO $$
DECLARE
  status_row RECORD;
BEGIN
  RAISE NOTICE 'GuestRequest status counts before canonical normalization:';
  FOR status_row IN
    SELECT "status"::text AS status, count(*) AS row_count
    FROM "GuestRequest"
    GROUP BY "status"
    ORDER BY "status"::text
  LOOP
    RAISE NOTICE '  %: %', status_row.status, status_row.row_count;
  END LOOP;
END $$;

UPDATE "GuestRequest"
SET "status" = CASE "status"::text
  WHEN 'NEW' THEN 'CREATED'::"GuestRequestStatus"
  WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'PENDING' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'ON_THE_WAY' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'REJECTED' THEN 'FAILED'::"GuestRequestStatus"
  ELSE "status"
END
WHERE "status"::text IN ('NEW', 'CONFIRMED', 'ACCEPTED', 'PENDING', 'ON_THE_WAY', 'REJECTED');

UPDATE "GuestRequestEvent"
SET "fromStatus" = CASE "fromStatus"::text
  WHEN 'NEW' THEN 'CREATED'::"GuestRequestStatus"
  WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'PENDING' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'ON_THE_WAY' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'REJECTED' THEN 'FAILED'::"GuestRequestStatus"
  ELSE "fromStatus"
END
WHERE "fromStatus"::text IN ('NEW', 'CONFIRMED', 'ACCEPTED', 'PENDING', 'ON_THE_WAY', 'REJECTED');

UPDATE "GuestRequestEvent"
SET "toStatus" = CASE "toStatus"::text
  WHEN 'NEW' THEN 'CREATED'::"GuestRequestStatus"
  WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus"
  WHEN 'PENDING' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'ON_THE_WAY' THEN 'IN_PROGRESS'::"GuestRequestStatus"
  WHEN 'REJECTED' THEN 'FAILED'::"GuestRequestStatus"
  ELSE "toStatus"
END
WHERE "toStatus"::text IN ('NEW', 'CONFIRMED', 'ACCEPTED', 'PENDING', 'ON_THE_WAY', 'REJECTED');

ALTER TABLE "GuestRequest" ALTER COLUMN "status" SET DEFAULT 'CREATED';

DO $$
DECLARE
  status_row RECORD;
BEGIN
  RAISE NOTICE 'GuestRequest status counts after canonical normalization:';
  FOR status_row IN
    SELECT "status"::text AS status, count(*) AS row_count
    FROM "GuestRequest"
    GROUP BY "status"
    ORDER BY "status"::text
  LOOP
    RAISE NOTICE '  %: %', status_row.status, status_row.row_count;
  END LOOP;
END $$;
