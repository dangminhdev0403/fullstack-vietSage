-- Grant hotel.rooms.ready.confirm capability to HOTEL_FRONTDESK and HOTEL_MANAGER.
-- Retains least-privilege boundary while allowing front-desk receptionists to mark rooms TRỐNG.

-- 1. Ensure fine-grained hotel.rooms.ready.confirm business permission exists.
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

-- 2. Grant hotel.rooms.ready.confirm to HOTEL_FRONTDESK and HOTEL_MANAGER.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."method" = 'OPTIONS'::"HttpMethod"
 AND p."path" = 'hotel.rooms.ready.confirm'
WHERE r."code" IN ('HOTEL_FRONTDESK', 'HOTEL_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
