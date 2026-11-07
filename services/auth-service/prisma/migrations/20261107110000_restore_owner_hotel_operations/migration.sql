-- Restore the explicit hotel-operation capabilities required by the owner hotel workspace.
-- This is intentionally limited to hotel operations; it does not grant KBTT/BCA or staff-account CRUD.
CREATE TEMP TABLE "_CanonicalOwnerCleanupUser" AS
SELECT DISTINCT ur."userId"
FROM "UserRole" ur
JOIN "Role" role ON role."id" = ur."roleId"
WHERE ur."status" = 'ACTIVE'
  AND role."code" = 'HOTEL_OWNER';

WITH owner_role AS (
  SELECT "id" FROM "Role" WHERE "code" = 'TENANT_OWNER'
)
INSERT INTO "UserRole" (
  "id", "userId", "roleId", "status", "assignedAt", "assignedById", "revokedAt", "revokedById"
)
SELECT
  'ur_' || md5(cleanup."userId" || ':' || owner_role."id"),
  cleanup."userId",
  owner_role."id",
  'ACTIVE'::"UserRoleStatus",
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL
FROM "_CanonicalOwnerCleanupUser" cleanup
CROSS JOIN owner_role
ON CONFLICT ("userId", "roleId") DO UPDATE SET
  "status" = 'ACTIVE',
  "revokedAt" = NULL,
  "revokedById" = NULL;

UPDATE "UserRole" ur
SET
  "status" = 'REVOKED',
  "revokedAt" = CURRENT_TIMESTAMP
FROM "Role" role
WHERE ur."roleId" = role."id"
  AND ur."status" = 'ACTIVE'
  AND role."code" = 'HOTEL_OWNER';

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
    FROM "_CanonicalOwnerCleanupUser" cleanup
    WHERE cleanup."userId" = session."userId"
  );

DELETE FROM "RefreshToken" token
WHERE EXISTS (
  SELECT 1
  FROM "_CanonicalOwnerCleanupUser" cleanup
  WHERE cleanup."userId" = token."userId"
);

DELETE FROM "RolePermission" role_permission
USING "Role" role
WHERE role_permission."roleId" = role."id"
  AND role."code" = 'HOTEL_OWNER';

UPDATE "Role"
SET "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'HOTEL_OWNER';

DROP TABLE "_CanonicalOwnerCleanupUser";

WITH required_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('hotel.rooms.status.manage', 'hotel-rooms', 'Quản lý trạng thái buồng phòng'),
    ('hotel.stays.manage', 'hotel-stays', 'Quản lý khách lưu trú'),
    ('hotel.stays.check-in', 'hotel-stays', 'Thực hiện check-in và nhận phòng'),
    ('hotel.stays.check-out', 'hotel-stays', 'Thực hiện check-out và trả phòng'),
    ('hotel.reservations.manage', 'hotel-reservations', 'Quản lý đặt phòng, gán phòng và check-in'),
    ('hotel.requests.manage', 'hotel-requests', 'Quản lý yêu cầu khách'),
    ('hotel.requests.coordinate', 'hotel-requests', 'Điều phối và phân công yêu cầu khách'),
    ('hotel.requests.execute', 'hotel-requests', 'Xử lý thực thi yêu cầu khách'),
    ('hotel.billing.manage', 'hotel-billing', 'Quản lý thanh toán'),
    ('hotel.billing.checkout', 'hotel-billing', 'Quyết toán và hoàn tất thanh toán trả phòng')
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
FROM required_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH role_presets("roleCode", "permissionKey") AS (
  VALUES
    ('TENANT_OWNER', 'hotel.rooms.status.manage'),
    ('TENANT_OWNER', 'hotel.stays.manage'),
    ('TENANT_OWNER', 'hotel.stays.check-in'),
    ('TENANT_OWNER', 'hotel.stays.check-out'),
    ('TENANT_OWNER', 'hotel.reservations.manage'),
    ('TENANT_OWNER', 'hotel.requests.manage'),
    ('TENANT_OWNER', 'hotel.requests.coordinate'),
    ('TENANT_OWNER', 'hotel.requests.execute'),
    ('TENANT_OWNER', 'hotel.billing.manage'),
    ('TENANT_OWNER', 'hotel.billing.checkout')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM role_presets preset
JOIN "Role" role ON role."code" = preset."roleCode"
JOIN "Permission" permission
  ON permission."method" = 'OPTIONS'::"HttpMethod"
 AND permission."path" = preset."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
