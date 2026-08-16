-- Keep the canonical tenant-owner workspace aligned with owner Marketplace and revenue pages.
-- One-time preset only; later administrator revocations remain authoritative.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'TENANT_OWNER'
  AND role."status" = 'ACTIVE'::"RoleStatus"
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN (
    'hotel.marketplace.view',
    'hotel.marketplace.revenue.view',
    'hotel.revenue-protection.view'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
