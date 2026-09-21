BEGIN;

-- 1. Ensure PLATFORM_FINANCE role exists as an active SYSTEM_TEMPLATE
INSERT INTO "Role" ("id", "code", "name", "description", "status", "type", "createdAt", "updatedAt")
VALUES (
  'role_' || md5('PLATFORM_FINANCE'),
  'PLATFORM_FINANCE',
  'Quản trị tài chính nền tảng',
  'Vai trò quản trị hợp đồng SaaS, chốt kỳ, ghi nhận nhắc nợ và đối soát công nợ',
  'ACTIVE'::"RoleStatus",
  'SYSTEM_TEMPLATE'::"RoleType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE'::"RoleStatus",
  "type" = 'SYSTEM_TEMPLATE'::"RoleType",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 2. Ensure the required business permissions exist
WITH target_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('platform.billing.view', 'platform-billing', 'Xem công nợ và hợp đồng nền tảng'),
    ('platform.billing.manage', 'platform-billing', 'Quản lý công nợ và chu kỳ thanh toán nền tảng'),
    ('platform.hotels.view', 'platform-hotels', 'Xem danh sách cơ sở lưu trú')
)
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
SELECT
  'bp_' || md5("path"),
  'OPTIONS'::"HttpMethod",
  "moduleKey",
  "path",
  "description",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM target_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3. Grant exactly the 3 permissions to PLATFORM_FINANCE
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'PLATFORM_FINANCE'
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN (
    'platform.billing.view',
    'platform.billing.manage',
    'platform.hotels.view'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Revoke any non-canonical permissions from PLATFORM_FINANCE
DELETE FROM "RolePermission"
WHERE "roleId" = (SELECT "id" FROM "Role" WHERE "code" = 'PLATFORM_FINANCE')
  AND "permissionId" NOT IN (
    SELECT "id" FROM "Permission"
    WHERE "method" = 'OPTIONS'::"HttpMethod"
      AND "path" IN (
        'platform.billing.view',
        'platform.billing.manage',
        'platform.hotels.view'
      )
  );

-- 4. Hard-delete HOTEL_FINANCE after blocking every live reference.
-- Historical REVOKED assignments/sessions are intentionally deleted by product decision.
DO $$
DECLARE
  v_hotel_finance_id TEXT;
  v_live_user_role_count INT;
  v_live_session_count INT;
  v_subrole_count INT;
BEGIN
  SELECT id INTO v_hotel_finance_id FROM "Role" WHERE "code" = 'HOTEL_FINANCE';

  IF v_hotel_finance_id IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_live_user_role_count
    FROM "UserRole"
    WHERE "roleId" = v_hotel_finance_id
      AND "status" <> 'REVOKED'::"UserRoleStatus";
    IF v_live_user_role_count > 0 THEN
      RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % live UserRole reference(s) exist', v_live_user_role_count;
    END IF;

    SELECT COUNT(*)
    INTO v_live_session_count
    FROM "AuthSession"
    WHERE "roleId" = v_hotel_finance_id
      AND "status" <> 'REVOKED'::"AuthSessionStatus";
    IF v_live_session_count > 0 THEN
      RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % live AuthSession reference(s) exist', v_live_session_count;
    END IF;

    SELECT COUNT(*)
    INTO v_subrole_count
    FROM "Role"
    WHERE "baseRoleId" = v_hotel_finance_id;
    IF v_subrole_count > 0 THEN
      RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % Role.baseRoleId reference(s) exist', v_subrole_count;
    END IF;

    DELETE FROM "AuthSession"
    WHERE "roleId" = v_hotel_finance_id
      AND "status" = 'REVOKED'::"AuthSessionStatus";

    DELETE FROM "UserRole"
    WHERE "roleId" = v_hotel_finance_id
      AND "status" = 'REVOKED'::"UserRoleStatus";

    DELETE FROM "RolePermission" WHERE "roleId" = v_hotel_finance_id;
    DELETE FROM "Role" WHERE "id" = v_hotel_finance_id;
  END IF;
END $$;

COMMIT;
