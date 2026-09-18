-- Give hotel owners a hotel-scoped profile contract, then remove daily-operation grants.
WITH profile_permissions("path", "description") AS (
  VALUES
    ('hotel.profile.view', 'Xem hồ sơ khách sạn'),
    ('hotel.profile.manage', 'Quản lý hồ sơ khách sạn')
)
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
SELECT
  'bp_' || md5("path"),
  'OPTIONS'::"HttpMethod",
  'hotel-profile',
  "path",
  "description",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM profile_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_OWNER')
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN ('hotel.profile.view', 'hotel.profile.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "RolePermission" owner_grant
USING "Role" role, "Permission" permission
WHERE owner_grant."roleId" = role."id"
  AND owner_grant."permissionId" = permission."id"
  AND role."code" IN ('TENANT_OWNER', 'HOTEL_OWNER')
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN (
    'platform.hotels.view',
    'platform.hotels.manage',
    'hotel.rooms.status.manage',
    'hotel.stays.manage',
    'hotel.stays.check-in',
    'hotel.stays.check-out',
    'hotel.reservations.manage',
    'hotel.requests.manage',
    'hotel.requests.coordinate',
    'hotel.requests.execute',
    'hotel.billing.manage',
    'hotel.billing.checkout',
    'hotel.kbtt.declarations.manage'
  );