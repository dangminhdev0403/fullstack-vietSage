-- Register business permissions for hotel channel management
WITH new_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('hotel.channels.view', 'hotel-channels', 'Xem cấu hình và trạng thái kênh phân phối'),
    ('hotel.channels.manage', 'hotel-channels', 'Quản lý kết nối và đồng bộ kênh phân phối')
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
FROM new_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Grant hotel channel management permissions to canonical TENANT_OWNER role only
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
    'hotel.channels.view',
    'hotel.channels.manage'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
