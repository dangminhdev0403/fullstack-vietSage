INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."method" = 'OPTIONS'::"HttpMethod"
 AND p."path" IN ('hotel.billing.view', 'hotel.billing.manage')
WHERE r."code" = 'HOTEL_FRONTDESK'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
