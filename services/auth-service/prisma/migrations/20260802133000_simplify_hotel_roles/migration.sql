-- Canonical production roles: SUPER_ADMIN, TENANT_OWNER, HOTEL_FRONTDESK.
-- Legacy hotel roles remain as disabled records for rollback/audit compatibility.

UPDATE "Role"
SET
  "name" = CASE "code"
    WHEN 'SUPER_ADMIN' THEN 'Quản trị viên cấp cao'
    WHEN 'TENANT_OWNER' THEN 'Chủ khách sạn'
    WHEN 'HOTEL_FRONTDESK' THEN 'Lễ tân khách sạn'
    ELSE "name"
  END,
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_FRONTDESK');

-- Capture only users whose active legacy hotel role changes in this run.
CREATE TEMP TABLE "_RoleSimplificationTouchedUser" AS
SELECT DISTINCT ur."userId"
FROM "UserRole" ur
JOIN "Role" r ON r."id" = ur."roleId"
WHERE ur."status" = 'ACTIVE'
  AND r."code" IN (
    'HOTEL_OWNER',
    'HOTEL_MANAGER',
    'HOTEL_HOUSEKEEPING',
    'HOTEL_MAINTENANCE',
    'HOTEL_FNB',
    'HOTEL_FINANCE'
  );

-- Every hotel employee with a legacy operational role becomes front desk.
WITH legacy_users AS (
  SELECT DISTINCT ur."userId"
  FROM "UserRole" ur
  JOIN "Role" r ON r."id" = ur."roleId"
  WHERE ur."status" = 'ACTIVE'
    AND r."code" IN (
      'HOTEL_MANAGER',
      'HOTEL_HOUSEKEEPING',
      'HOTEL_MAINTENANCE',
      'HOTEL_FNB',
      'HOTEL_FINANCE'
    )
), frontdesk_role AS (
  SELECT "id" FROM "Role" WHERE "code" = 'HOTEL_FRONTDESK'
)
INSERT INTO "UserRole" (
  "id", "userId", "roleId", "status", "assignedAt", "assignedById", "revokedAt", "revokedById"
)
SELECT
  'ur_' || md5(legacy_users."userId" || ':' || frontdesk_role."id"),
  legacy_users."userId",
  frontdesk_role."id",
  'ACTIVE'::"UserRoleStatus",
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL
FROM legacy_users
CROSS JOIN frontdesk_role
ON CONFLICT ("userId", "roleId") DO UPDATE SET
  "status" = 'ACTIVE',
  "revokedAt" = NULL,
  "revokedById" = NULL;

-- Preserve legacy HOTEL_OWNER accounts as canonical tenant owners.
WITH legacy_owners AS (
  SELECT DISTINCT ur."userId"
  FROM "UserRole" ur
  JOIN "Role" r ON r."id" = ur."roleId"
  WHERE ur."status" = 'ACTIVE' AND r."code" = 'HOTEL_OWNER'
), owner_role AS (
  SELECT "id" FROM "Role" WHERE "code" = 'TENANT_OWNER'
)
INSERT INTO "UserRole" (
  "id", "userId", "roleId", "status", "assignedAt", "assignedById", "revokedAt", "revokedById"
)
SELECT
  'ur_' || md5(legacy_owners."userId" || ':' || owner_role."id"),
  legacy_owners."userId",
  owner_role."id",
  'ACTIVE'::"UserRoleStatus",
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL
FROM legacy_owners
CROSS JOIN owner_role
ON CONFLICT ("userId", "roleId") DO UPDATE SET
  "status" = 'ACTIVE',
  "revokedAt" = NULL,
  "revokedById" = NULL;

-- Revoke only active assignments belonging to legacy hotel roles.
UPDATE "UserRole" ur
SET
  "status" = 'REVOKED',
  "revokedAt" = CURRENT_TIMESTAMP
FROM "Role" r
WHERE ur."roleId" = r."id"
  AND ur."status" = 'ACTIVE'
  AND r."code" IN (
    'HOTEL_OWNER',
    'HOTEL_MANAGER',
    'HOTEL_HOUSEKEEPING',
    'HOTEL_MAINTENANCE',
    'HOTEL_FNB',
    'HOTEL_FINANCE'
  );

-- Revoke sessions/tokens of users touched by legacy role consolidation.
UPDATE "AuthSession" session
SET
  "status" = 'REVOKED',
  "revokedAt" = CURRENT_TIMESTAMP,
  "revokeReason" = 'ROLE_CHANGED',
  "version" = session."version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE session."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM "_RoleSimplificationTouchedUser" touched
    WHERE touched."userId" = session."userId"
  );

DELETE FROM "RefreshToken" token
WHERE EXISTS (
  SELECT 1
  FROM "_RoleSimplificationTouchedUser" touched
  WHERE touched."userId" = token."userId"
);

DROP TABLE "_RoleSimplificationTouchedUser";

UPDATE "Role"
SET "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN (
  'HOTEL_OWNER',
  'HOTEL_MANAGER',
  'HOTEL_HOUSEKEEPING',
  'HOTEL_MAINTENANCE',
  'HOTEL_FNB',
  'HOTEL_FINANCE'
);

-- Front desk receives only daily hotel-operation capabilities.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."code" = 'HOTEL_FRONTDESK'
  AND NOT (
    p."method" = 'OPTIONS'::"HttpMethod"
    AND p."path" IN (
      'hotel.dashboard.view',
      'hotel.rooms.view',
      'hotel.stays.view',
      'hotel.stays.manage',
      'hotel.reservations.view',
      'hotel.reservations.manage',
      'hotel.requests.view',
      'hotel.requests.manage',
      'hotel.billing.view',
      'hotel.billing.manage'
    )
  );

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."method" = 'OPTIONS'::"HttpMethod"
 AND p."path" IN (
   'hotel.dashboard.view',
   'hotel.rooms.view',
   'hotel.stays.view',
   'hotel.stays.manage',
   'hotel.reservations.view',
   'hotel.reservations.manage',
   'hotel.requests.view',
   'hotel.requests.manage',
   'hotel.billing.view',
   'hotel.billing.manage'
 )
WHERE r."code" = 'HOTEL_FRONTDESK'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
