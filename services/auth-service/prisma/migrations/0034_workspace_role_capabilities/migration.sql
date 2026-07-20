-- Establish one-time business capability presets for the built-in workspaces.
-- Administrators may still customize these grants later; application startup does not restore revoked grants.

WITH business_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('platform.users.view', 'platform-users', 'Xem danh sách người dùng'),
    ('platform.users.manage', 'platform-users', 'Quản lý người dùng'),
    ('platform.roles.view', 'platform-roles', 'Xem danh sách vai trò'),
    ('platform.roles.manage', 'platform-roles', 'Quản lý vai trò'),
    ('platform.permissions.manage', 'platform-permissions', 'Quản lý phân quyền'),
    ('platform.hotels.view', 'platform-hotels', 'Xem danh sách khách sạn'),
    ('platform.hotels.manage', 'platform-hotels', 'Quản lý khách sạn'),
    ('hotel.dashboard.view', 'hotel-dashboard', 'Xem tổng quan khách sạn'),
    ('hotel.rooms.view', 'hotel-rooms', 'Xem danh sách phòng'),
    ('hotel.rooms.manage', 'hotel-rooms', 'Quản lý phòng'),
    ('hotel.rooms.qr.manage', 'hotel-room-qr', 'Quản lý mã QR'),
    ('hotel.stays.view', 'hotel-stays', 'Xem danh sách khách lưu trú'),
    ('hotel.stays.manage', 'hotel-stays', 'Quản lý khách lưu trú'),
    ('hotel.reservations.view', 'hotel-reservations', 'Xem đặt phòng và danh sách khách đến'),
    ('hotel.reservations.manage', 'hotel-reservations', 'Quản lý đặt phòng, gán phòng và check-in'),
    ('hotel.staff.view', 'hotel-staff', 'Xem nhân viên và phân công khách sạn'),
    ('hotel.staff.manage', 'hotel-staff', 'Quản lý nhân viên, vai trò và phân công khách sạn'),
    ('hotel.requests.view', 'hotel-requests', 'Xem danh sách yêu cầu khách'),
    ('hotel.requests.manage', 'hotel-requests', 'Quản lý yêu cầu khách'),
    ('hotel.billing.view', 'hotel-billing', 'Xem danh sách thanh toán'),
    ('hotel.billing.manage', 'hotel-billing', 'Quản lý thanh toán'),
    ('hotel.services.view', 'hotel-services', 'Xem danh mục và dịch vụ'),
    ('hotel.services.manage', 'hotel-services', 'Quản lý danh mục và dịch vụ'),
    ('guest.experience.use', 'guest-experience', 'Quản lý GuestOS'),
    ('system.health.view', 'system-health', 'Xem trạng thái hệ thống')
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
FROM business_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH built_in_roles("code", "name", "description") AS (
  VALUES
    ('SUPER_ADMIN', 'Quản trị viên cấp cao', 'Quản trị toàn bộ nền tảng'),
    ('VIETSAGE_OPERATION', 'Vận hành VietSage', 'Vận hành nền tảng VietSage'),
    ('TENANT_OWNER', 'Chủ đơn vị', 'Quản lý các khách sạn thuộc đơn vị'),
    ('HOTEL_OWNER', 'Chủ khách sạn', 'Quản lý khách sạn'),
    ('HOTEL_MANAGER', 'Quản lý khách sạn', 'Điều hành hoạt động khách sạn'),
    ('HOTEL_FRONTDESK', 'Lễ tân khách sạn', 'Xử lý khách đến, lưu trú và yêu cầu tại quầy'),
    ('HOTEL_HOUSEKEEPING', 'Buồng phòng khách sạn', 'Xử lý công việc buồng phòng'),
    ('HOTEL_MAINTENANCE', 'Kỹ thuật khách sạn', 'Xử lý yêu cầu kỹ thuật'),
    ('HOTEL_FNB', 'Ẩm thực khách sạn', 'Xử lý yêu cầu ẩm thực'),
    ('HOTEL_FINANCE', 'Tài chính khách sạn', 'Quản lý nghiệp vụ tài chính khách sạn')
)
INSERT INTO "Role" ("id", "code", "name", "description", "status", "createdAt", "updatedAt")
SELECT
  'role_' || md5("code"),
  "code",
  "name",
  "description",
  'ACTIVE'::"RoleStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM built_in_roles
ON CONFLICT ("code") DO NOTHING;

-- Platform super administrators retain the complete business-capability surface even when
-- runtime route synchronization is disabled in production.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'SUPER_ADMIN'
  AND permission."method" = 'OPTIONS'::"HttpMethod"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

WITH role_presets("roleCode", "permissionKey") AS (
  VALUES
    ('TENANT_OWNER', 'hotel.dashboard.view'),
    ('TENANT_OWNER', 'hotel.rooms.view'),
    ('TENANT_OWNER', 'hotel.rooms.manage'),
    ('TENANT_OWNER', 'hotel.rooms.qr.manage'),
    ('TENANT_OWNER', 'hotel.stays.view'),
    ('TENANT_OWNER', 'hotel.stays.manage'),
    ('TENANT_OWNER', 'hotel.reservations.view'),
    ('TENANT_OWNER', 'hotel.reservations.manage'),
    ('TENANT_OWNER', 'hotel.staff.view'),
    ('TENANT_OWNER', 'hotel.staff.manage'),
    ('TENANT_OWNER', 'hotel.requests.view'),
    ('TENANT_OWNER', 'hotel.requests.manage'),
    ('TENANT_OWNER', 'hotel.billing.view'),
    ('TENANT_OWNER', 'hotel.billing.manage'),
    ('TENANT_OWNER', 'hotel.services.view'),
    ('TENANT_OWNER', 'hotel.services.manage'),
    ('HOTEL_OWNER', 'hotel.dashboard.view'),
    ('HOTEL_OWNER', 'hotel.rooms.view'),
    ('HOTEL_OWNER', 'hotel.rooms.manage'),
    ('HOTEL_OWNER', 'hotel.rooms.qr.manage'),
    ('HOTEL_OWNER', 'hotel.stays.view'),
    ('HOTEL_OWNER', 'hotel.stays.manage'),
    ('HOTEL_OWNER', 'hotel.reservations.view'),
    ('HOTEL_OWNER', 'hotel.reservations.manage'),
    ('HOTEL_OWNER', 'hotel.staff.view'),
    ('HOTEL_OWNER', 'hotel.staff.manage'),
    ('HOTEL_OWNER', 'hotel.requests.view'),
    ('HOTEL_OWNER', 'hotel.requests.manage'),
    ('HOTEL_OWNER', 'hotel.billing.view'),
    ('HOTEL_OWNER', 'hotel.billing.manage'),
    ('HOTEL_OWNER', 'hotel.services.view'),
    ('HOTEL_OWNER', 'hotel.services.manage'),
    ('HOTEL_MANAGER', 'hotel.dashboard.view'),
    ('HOTEL_MANAGER', 'hotel.rooms.view'),
    ('HOTEL_MANAGER', 'hotel.rooms.manage'),
    ('HOTEL_MANAGER', 'hotel.stays.view'),
    ('HOTEL_MANAGER', 'hotel.stays.manage'),
    ('HOTEL_MANAGER', 'hotel.reservations.view'),
    ('HOTEL_MANAGER', 'hotel.reservations.manage'),
    ('HOTEL_MANAGER', 'hotel.requests.view'),
    ('HOTEL_MANAGER', 'hotel.requests.manage'),
    ('HOTEL_MANAGER', 'hotel.billing.view'),
    ('HOTEL_MANAGER', 'hotel.services.view'),
    ('HOTEL_MANAGER', 'hotel.services.manage'),
    ('HOTEL_FRONTDESK', 'hotel.dashboard.view'),
    ('HOTEL_FRONTDESK', 'hotel.rooms.view'),
    ('HOTEL_FRONTDESK', 'hotel.stays.view'),
    ('HOTEL_FRONTDESK', 'hotel.stays.manage'),
    ('HOTEL_FRONTDESK', 'hotel.reservations.view'),
    ('HOTEL_FRONTDESK', 'hotel.reservations.manage'),
    ('HOTEL_FRONTDESK', 'hotel.requests.view'),
    ('HOTEL_FRONTDESK', 'hotel.requests.manage'),
    ('HOTEL_HOUSEKEEPING', 'hotel.dashboard.view'),
    ('HOTEL_HOUSEKEEPING', 'hotel.rooms.view'),
    ('HOTEL_HOUSEKEEPING', 'hotel.requests.view'),
    ('HOTEL_HOUSEKEEPING', 'hotel.requests.manage'),
    ('HOTEL_MAINTENANCE', 'hotel.dashboard.view'),
    ('HOTEL_MAINTENANCE', 'hotel.requests.view'),
    ('HOTEL_MAINTENANCE', 'hotel.requests.manage'),
    ('HOTEL_FNB', 'hotel.dashboard.view'),
    ('HOTEL_FNB', 'hotel.requests.view'),
    ('HOTEL_FNB', 'hotel.requests.manage'),
    ('HOTEL_FNB', 'hotel.services.view'),
    ('HOTEL_FINANCE', 'hotel.dashboard.view'),
    ('HOTEL_FINANCE', 'hotel.billing.view'),
    ('HOTEL_FINANCE', 'hotel.billing.manage'),
    ('HOTEL_FINANCE', 'hotel.services.view')
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
