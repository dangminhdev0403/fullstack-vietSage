-- Candidate migration: Reactivate canonical HOTEL_HOUSEKEEPING role and add room ready confirmation capability.
-- Retains least-privilege boundary: exactly hotel.rooms.view and hotel.rooms.ready.confirm.

-- 1. Register fine-grained hotel.rooms.ready.confirm business permission.
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
VALUES (
  'bp_' || md5('hotel.rooms.ready.confirm'),
  'OPTIONS'::"HttpMethod",
  'hotel-rooms',
  'hotel.rooms.ready.confirm',
  'Xác nhận phòng sẵn sàng đón khách',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 2. Reactivate canonical HOTEL_HOUSEKEEPING role with SYSTEM_TEMPLATE type.
UPDATE "Role"
SET
  "name" = 'Nhân viên buồng phòng',
  "status" = 'ACTIVE',
  "type" = 'SYSTEM_TEMPLATE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'HOTEL_HOUSEKEEPING';

INSERT INTO "Role" ("id", "code", "name", "status", "type", "createdAt", "updatedAt")
VALUES (
  'r_hotel_housekeeping',
  'HOTEL_HOUSEKEEPING',
  'Nhân viên buồng phòng',
  'ACTIVE',
  'SYSTEM_TEMPLATE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = 'Nhân viên buồng phòng',
  "status" = 'ACTIVE',
  "type" = 'SYSTEM_TEMPLATE',
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3. Enforce exact capability grants for HOTEL_HOUSEKEEPING: hotel.rooms.view + hotel.rooms.ready.confirm.
-- Exclude all finance, billing, stay, reservation, QR, and generic room/status management.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."code" = 'HOTEL_HOUSEKEEPING'
  AND NOT (
    p."method" = 'OPTIONS'::"HttpMethod"
    AND p."path" IN ('hotel.rooms.view', 'hotel.rooms.ready.confirm')
  );

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."method" = 'OPTIONS'::"HttpMethod"
 AND p."path" IN ('hotel.rooms.view', 'hotel.rooms.ready.confirm')
WHERE r."code" = 'HOTEL_HOUSEKEEPING'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 4. Grant hotel.rooms.ready.confirm to SUPER_ADMIN as well.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."method" = 'OPTIONS'::"HttpMethod"
 AND p."path" = 'hotel.rooms.ready.confirm'
WHERE r."code" = 'SUPER_ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
