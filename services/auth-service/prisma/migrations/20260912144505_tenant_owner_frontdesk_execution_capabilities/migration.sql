-- AGY 00: Additive capability contract for tenant owner and frontdesk execution.
-- Establish new fine-grained coordinate and execution business permissions.

WITH new_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('hotel.rooms.status.manage', 'hotel-rooms', 'Quản lý trạng thái buồng phòng'),
    ('hotel.stays.check-in', 'hotel-stays', 'Thực hiện check-in và nhận phòng'),
    ('hotel.stays.check-out', 'hotel-stays', 'Thực hiện check-out và trả phòng'),
    ('hotel.requests.coordinate', 'hotel-requests', 'Điều phối và phân công yêu cầu khách'),
    ('hotel.requests.execute', 'hotel-requests', 'Xử lý thực thi yêu cầu khách'),
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
FROM new_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Additive role permission grants:
-- - SUPER_ADMIN: all 6 capabilities
-- - TENANT_OWNER / HOTEL_OWNER: coordinate
-- - HOTEL_FRONTDESK: execution capabilities + billing checkout
-- - HOTEL_FINANCE: billing checkout
-- Never targets all noncanonical/custom roles; preserves existing grants; idempotent.

WITH role_presets("roleCode", "permissionKey") AS (
  VALUES
    ('SUPER_ADMIN', 'hotel.rooms.status.manage'),
    ('SUPER_ADMIN', 'hotel.stays.check-in'),
    ('SUPER_ADMIN', 'hotel.stays.check-out'),
    ('SUPER_ADMIN', 'hotel.requests.coordinate'),
    ('SUPER_ADMIN', 'hotel.requests.execute'),
    ('SUPER_ADMIN', 'hotel.billing.checkout'),
    ('TENANT_OWNER', 'hotel.requests.coordinate'),
    ('HOTEL_OWNER', 'hotel.requests.coordinate'),
    ('HOTEL_FRONTDESK', 'hotel.rooms.status.manage'),
    ('HOTEL_FRONTDESK', 'hotel.stays.check-in'),
    ('HOTEL_FRONTDESK', 'hotel.stays.check-out'),
    ('HOTEL_FRONTDESK', 'hotel.requests.execute'),
    ('HOTEL_FRONTDESK', 'hotel.billing.checkout'),
    ('HOTEL_FINANCE', 'hotel.billing.checkout')
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
