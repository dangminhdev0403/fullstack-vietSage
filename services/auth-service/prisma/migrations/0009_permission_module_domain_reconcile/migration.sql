-- Reconcile databases that applied an older PermissionModule grouping shape
-- before modules were flattened to PermissionDomain.
ALTER TABLE "PermissionModule"
  ADD COLUMN IF NOT EXISTS "domain" "PermissionDomain" NOT NULL DEFAULT 'SYSTEM';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'PermissionModule'
      AND column_name = 'groupId'
  ) THEN
    EXECUTE $reconcile$
      UPDATE "PermissionModule"
      SET "domain" = CASE
        WHEN "groupId" = 'perm_group_platform' OR "moduleKey" IN ('auth', 'roles', 'permissions') THEN 'PLATFORM'::"PermissionDomain"
        WHEN "groupId" = 'perm_group_hotel' OR "moduleKey" IN ('hotels', 'bookings') THEN 'HOTEL'::"PermissionDomain"
        WHEN "groupId" = 'perm_group_users' OR "moduleKey" IN ('users', 'hotel-users') THEN 'USERS'::"PermissionDomain"
        WHEN "groupId" = 'perm_group_guest' OR "moduleKey" = 'guest' THEN 'GUEST'::"PermissionDomain"
        ELSE 'SYSTEM'::"PermissionDomain"
      END
    $reconcile$;

    ALTER TABLE "PermissionModule"
      ALTER COLUMN "groupId" DROP NOT NULL;
  ELSE
    UPDATE "PermissionModule"
    SET "domain" = CASE
      WHEN "moduleKey" IN ('auth', 'roles', 'permissions') THEN 'PLATFORM'::"PermissionDomain"
      WHEN "moduleKey" IN ('hotels', 'bookings') THEN 'HOTEL'::"PermissionDomain"
      WHEN "moduleKey" IN ('users', 'hotel-users') THEN 'USERS'::"PermissionDomain"
      WHEN "moduleKey" = 'guest' THEN 'GUEST'::"PermissionDomain"
      ELSE "domain"
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PermissionModule_domain_sortOrder_idx"
  ON "PermissionModule"("domain", "sortOrder");
