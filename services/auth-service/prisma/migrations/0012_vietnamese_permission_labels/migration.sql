-- Vietnamese labels for permission modules and route permission descriptions.

UPDATE "PermissionModule"
SET
  "name" = CASE "moduleKey"
    WHEN 'auth' THEN 'Xác thực'
    WHEN 'bookings' THEN 'Đặt phòng'
    WHEN 'guest' THEN 'Khách lưu trú'
    WHEN 'health' THEN 'Kiểm tra hệ thống'
    WHEN 'hotels' THEN 'Khách sạn'
    WHEN 'hotel-users' THEN 'Người dùng'
    WHEN 'permissions' THEN 'Quyền'
    WHEN 'roles' THEN 'Vai trò'
    WHEN 'root' THEN 'Hệ thống'
    WHEN 'tenant-owners' THEN 'Chủ đơn vị'
    WHEN 'users' THEN 'Người dùng'
    ELSE "name"
  END,
  "description" = CASE "moduleKey"
    WHEN 'auth' THEN 'Các quyền xác thực thuộc nhóm quản trị nền tảng.'
    WHEN 'bookings' THEN 'Các quyền đặt phòng thuộc nhóm vận hành khách sạn.'
    WHEN 'guest' THEN 'Các quyền khách lưu trú thuộc nhóm trải nghiệm khách lưu trú.'
    WHEN 'health' THEN 'Các quyền kiểm tra hệ thống thuộc nhóm tiện ích hệ thống.'
    WHEN 'hotels' THEN 'Các quyền khách sạn thuộc nhóm vận hành khách sạn.'
    WHEN 'hotel-users' THEN 'Các quyền người dùng thuộc nhóm quản lý người dùng và nhân sự.'
    WHEN 'permissions' THEN 'Các quyền quản lý quyền thuộc nhóm quản trị nền tảng.'
    WHEN 'roles' THEN 'Các quyền vai trò thuộc nhóm quản trị nền tảng.'
    WHEN 'root' THEN 'Các quyền hệ thống thuộc nhóm tiện ích hệ thống.'
    WHEN 'tenant-owners' THEN 'Các quyền chủ đơn vị thuộc nhóm quản lý người dùng và nhân sự.'
    WHEN 'users' THEN 'Các quyền người dùng thuộc nhóm quản lý người dùng và nhân sự.'
    ELSE "description"
  END
WHERE "moduleKey" IN (
  'auth',
  'bookings',
  'guest',
  'health',
  'hotels',
  'hotel-users',
  'permissions',
  'roles',
  'root',
  'tenant-owners',
  'users'
);

UPDATE "Permission"
SET "description" = CASE
  WHEN "method" = 'POST' AND "path" = '/auth/login' THEN 'Xác thực người dùng bằng email và mật khẩu'
  WHEN "method" = 'POST' AND "path" = '/auth/refresh' THEN 'Làm mới access token bằng refresh token hợp lệ'
  WHEN "method" = 'POST' AND "path" = '/auth/logout' THEN 'Thu hồi refresh token đang hoạt động'
  WHEN "method" = 'GET' AND "path" = '/auth/me' THEN 'Lấy hồ sơ người dùng đang xác thực'

  WHEN "method" = 'POST' AND "path" = '/hotels' THEN 'Tạo hồ sơ khách sạn trong phạm vi đơn vị'
  WHEN "method" = 'GET' AND "path" = '/hotels' THEN 'Liệt kê các khách sạn mà nhân sự được phép truy cập'
  WHEN "method" = 'GET' AND "path" = '/hotels/:hotelId' THEN 'Lấy chi tiết hồ sơ khách sạn'
  WHEN "method" = 'PATCH' AND "path" = '/hotels/:hotelId' THEN 'Cập nhật hồ sơ khách sạn'

  WHEN "method" = 'POST' AND "path" = '/hotel-users' THEN 'Tạo người dùng khách sạn trong đơn vị và có thể gán vai trò được quản lý'
  WHEN "method" = 'GET' AND "path" = '/hotel-users' THEN 'Liệt kê người dùng khách sạn trong phạm vi đơn vị'
  WHEN "method" = 'GET' AND "path" = '/hotel-users/:id' THEN 'Lấy chi tiết người dùng khách sạn trong phạm vi đơn vị'
  WHEN "method" = 'PATCH' AND "path" = '/hotel-users/:id/status' THEN 'Cập nhật trạng thái theo đơn vị của người dùng khách sạn mà không xóa cứng'
  WHEN "method" = 'POST' AND "path" = '/hotel-users/:id/roles' THEN 'Gán vai trò được quản lý cho người dùng khách sạn trong phạm vi đơn vị'
  WHEN "method" = 'DELETE' AND "path" = '/hotel-users/:id/roles/:roleId' THEN 'Thu hồi vai trò người dùng khách sạn bằng chuyển trạng thái mà không xóa cứng'

  WHEN "method" = 'GET' AND "path" = '/tenant-owners' THEN 'Liệt kê người dùng vai trò TENANT_OWNER được liên kết với đơn vị'
  WHEN "method" = 'POST' AND "path" = '/tenant-owners' THEN 'Tạo người dùng TENANT_OWNER và đơn vị'
  WHEN "method" = 'GET' AND "path" = '/tenant-owners/:id' THEN 'Lấy người dùng vai trò TENANT_OWNER được liên kết với đơn vị'
  WHEN "method" = 'PATCH' AND "path" = '/tenant-owners/:id' THEN 'Cập nhật người dùng TENANT_OWNER và đơn vị liên kết'

  WHEN "method" = 'GET' AND "path" = '/health' THEN 'Endpoint kiểm tra trạng thái hệ thống công khai'
  ELSE "description"
END
WHERE ("method", "path") IN (
  ('POST', '/auth/login'),
  ('POST', '/auth/refresh'),
  ('POST', '/auth/logout'),
  ('GET', '/auth/me'),
  ('POST', '/hotels'),
  ('GET', '/hotels'),
  ('GET', '/hotels/:hotelId'),
  ('PATCH', '/hotels/:hotelId'),
  ('POST', '/hotel-users'),
  ('GET', '/hotel-users'),
  ('GET', '/hotel-users/:id'),
  ('PATCH', '/hotel-users/:id/status'),
  ('POST', '/hotel-users/:id/roles'),
  ('DELETE', '/hotel-users/:id/roles/:roleId'),
  ('GET', '/tenant-owners'),
  ('POST', '/tenant-owners'),
  ('GET', '/tenant-owners/:id'),
  ('PATCH', '/tenant-owners/:id'),
  ('GET', '/health')
);
