WITH new_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('hotel.notifications.view', 'hotel-notifications', 'Xem cấu hình thông báo khách sạn'),
    ('hotel.notifications.manage', 'hotel-notifications', 'Quản lý cấu hình thông báo khách sạn')
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

WITH route_capabilities("method", "routePath", "permissionKey") AS (
  VALUES
    ('GET'::"HttpMethod", '/hotels', 'platform.hotels.view'),
    ('POST'::"HttpMethod", '/hotels', 'platform.hotels.manage'),
    ('GET'::"HttpMethod", '/hotels/:hotelId', 'platform.hotels.view'),
    ('PATCH'::"HttpMethod", '/hotels/:hotelId', 'platform.hotels.manage'),
    ('GET'::"HttpMethod", '/tenant-owners', 'platform.users.view'),
    ('POST'::"HttpMethod", '/tenant-owners', 'platform.users.manage'),
    ('GET'::"HttpMethod", '/tenant-owners/:id', 'platform.users.view'),
    ('PATCH'::"HttpMethod", '/tenant-owners/:id', 'platform.users.manage'),
    ('POST'::"HttpMethod", '/tenant-owners/:id/reset-password', 'platform.users.manage'),
    ('GET'::"HttpMethod", '/tenant-owners/tenant-options', 'platform.users.view'),
    ('GET'::"HttpMethod", '/roles/:id', 'platform.roles.view'),
    ('GET'::"HttpMethod", '/hotels/:hotelId/service-catalog/import/template', 'hotel.services.view'),
    ('GET'::"HttpMethod", '/hotels/:hotelId/service-categories', 'hotel.services.view'),
    ('POST'::"HttpMethod", '/hotels/:hotelId/service-categories', 'hotel.services.manage'),
    ('PATCH'::"HttpMethod", '/hotels/:hotelId/service-categories/:categoryId', 'hotel.services.manage'),
    ('GET'::"HttpMethod", '/hotels/:hotelId/service-items', 'hotel.services.view'),
    ('POST'::"HttpMethod", '/hotels/:hotelId/service-items', 'hotel.services.manage'),
    ('PATCH'::"HttpMethod", '/hotels/:hotelId/service-items/:itemId', 'hotel.services.manage'),
    ('GET'::"HttpMethod", '/hotels/:hotelId/notification-routes', 'hotel.notifications.view'),
    ('POST'::"HttpMethod", '/hotels/:hotelId/notification-routes', 'hotel.notifications.manage'),
    ('PATCH'::"HttpMethod", '/hotels/:hotelId/notification-routes/:routeId', 'hotel.notifications.manage')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT DISTINCT
  'rp_' || md5(existing_grant."roleId" || ':' || business_permission."id"),
  existing_grant."roleId",
  business_permission."id"
FROM route_capabilities mapping
JOIN "Permission" route_permission
  ON route_permission."method" = mapping."method"
 AND route_permission."path" = mapping."routePath"
JOIN "RolePermission" existing_grant
  ON existing_grant."permissionId" = route_permission."id"
JOIN "Permission" business_permission
  ON business_permission."method" = 'OPTIONS'::"HttpMethod"
 AND business_permission."path" = mapping."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
