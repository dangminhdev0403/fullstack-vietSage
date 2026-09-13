DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Hotel"
    GROUP BY "tenantId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one hotel per tenant: duplicate Hotel.tenantId values exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "Hotel_tenantId_code_key";
DROP INDEX IF EXISTS "Hotel_tenantId_status_idx";
CREATE UNIQUE INDEX "Hotel_tenantId_key" ON "Hotel"("tenantId");