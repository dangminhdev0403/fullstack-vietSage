-- CAUTION: Immutable canonical RBAC migration.
-- REQUIRES HOST BACKUP before applying outside a disposable database environment.
-- Retains custom roles with base-role constraints and validates canonical templates.
-- Do not apply without manual host verification.

-- 1. Add baseRoleId self-reference to Role
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "baseRoleId" TEXT;

-- 2. Create index on baseRoleId
CREATE INDEX IF NOT EXISTS "Role_baseRoleId_idx" ON "Role"("baseRoleId");

-- 3. Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Role_baseRoleId_fkey'
  ) THEN
    ALTER TABLE "Role"
    ADD CONSTRAINT "Role_baseRoleId_fkey"
    FOREIGN KEY ("baseRoleId") REFERENCES "Role"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Set all canonical access classes to SYSTEM_TEMPLATE
UPDATE "Role"
SET "type" = 'SYSTEM_TEMPLATE'
WHERE "code" IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_FRONTDESK', 'SERVICE_STAFF');

-- 5. Fail closed if any canonical role is missing
DO $$
DECLARE
  v_missing_count INTEGER;
  v_missing_codes TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(expected_code, ', '), '')
  INTO v_missing_count, v_missing_codes
  FROM (
    VALUES ('SUPER_ADMIN'), ('TENANT_OWNER'), ('HOTEL_FRONTDESK'), ('SERVICE_STAFF')
  ) AS expected(expected_code)
  WHERE NOT EXISTS (
    SELECT 1 FROM "Role" WHERE "code" = expected.expected_code
  );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Missing canonical access classes: %', v_missing_codes;
  END IF;
END $$;

