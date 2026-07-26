# VietSage API Endpoints

```java
public static final String DOMAIN = "http://localhost:3000";
```

---

## 1. Health (Kiểm tra hệ thống)
```java
// Kiểm tra trạng thái hệ thống (Health Check)
public static final String HEALTH_CHECK = "/health";
```

## 2. Authentication & Identity (Xác thực & Thẻ định danh)
```java
// Đăng nhập hệ thống
public static final String AUTH_LOGIN = "/auth/login";

// Làm mới token xác thực
public static final String AUTH_REFRESH = "/auth/refresh";

// Đăng xuất phiên hiện tại
public static final String AUTH_LOGOUT = "/auth/logout";

// Đăng xuất tất cả các phiên
public static final String AUTH_LOGOUT_ALL = "/auth/logout-all";

// Lấy thông tin tài khoản hiện tại
public static final String AUTH_GET_ME = "/auth/me";
```

## 3. Roles & Permissions (Quản lý Vai trò & Quyền hạn)
```java
// Tạo vai trò mới
public static final String ROLES_CREATE = "/roles";

// Danh sách vai trò
public static final String ROLES_LIST = "/roles";

// Lấy thông tin vai trò theo tên
public static final String ROLES_GET_BY_NAME = "/roles/by-name/{name}";

// Danh sách menu thuộc vai trò
public static final String ROLES_GET_MENUS = "/roles/menus";

// Lấy thông tin chi tiết vai trò theo ID
public static final String ROLES_GET_BY_ID = "/roles/{id}";

// Cập nhật thông tin vai trò
public static final String ROLES_UPDATE = "/roles/{id}";

// Xóa vai trò
public static final String ROLES_DELETE = "/roles/{id}";

// Vô hiệu hóa vai trò
public static final String ROLES_DISABLE = "/roles/{id}/disable";

// Danh sách quyền hạn của vai trò
public static final String ROLES_LIST_PERMISSIONS = "/roles/{id}/permissions";

// Thay thế tập quyền hạn của vai trò
public static final String ROLES_REPLACE_PERMISSIONS = "/roles/{id}/permissions";

// Danh sách module quyền của tài khoản hiện tại
public static final String ROLES_MY_PERMISSION_MODULES = "/roles/me/permission-modules";

// Chi tiết quyền theo module của tài khoản hiện tại
public static final String ROLES_MY_PERMISSION_MODULE_PERMISSIONS = "/roles/me/permission-modules/{moduleKey}/permissions";

// Danh sách module quyền của một vai trò
public static final String ROLES_PERMISSION_MODULES = "/roles/{id}/permission-modules";

// Chi tiết quyền theo module của một vai trò
public static final String ROLES_PERMISSION_MODULE_PERMISSIONS = "/roles/{id}/permission-modules/{moduleKey}/permissions";

// Gán thêm quyền module cho vai trò
public static final String ROLES_GRANT_PERMISSION_MODULE_PERMISSIONS = "/roles/{roleId}/modules/{moduleKey}/permissions/grant";

// Thu hồi quyền module của vai trò
public static final String ROLES_REVOKE_PERMISSION_MODULE_PERMISSIONS = "/roles/{roleId}/modules/{moduleKey}/permissions/revoke";

// Danh sách tất cả quyền hạn hệ thống
public static final String PERMISSIONS_LIST = "/permissions";

// Lấy chi tiết quyền hạn theo ID
public static final String PERMISSIONS_GET_BY_ID = "/permissions/{id}";
```

## 4. Hotel Users (Quản lý Nhân viên Khách sạn)
```java
// Tạo tài khoản nhân viên khách sạn
public static final String HOTEL_USERS_CREATE = "/hotel-users";

// Danh sách nhân viên khách sạn
public static final String HOTEL_USERS_LIST = "/hotel-users";

// Danh sách vai trò có thể quản lý
public static final String HOTEL_USERS_LIST_MANAGED_ROLES = "/hotel-users/managed-roles";

// Lấy thông tin nhân viên theo ID
public static final String HOTEL_USERS_GET_BY_ID = "/hotel-users/{id}";

// Cập nhật trạng thái hoạt động nhân viên
public static final String HOTEL_USERS_UPDATE_STATUS = "/hotel-users/{id}/status";

// Phân vai trò cho nhân viên
public static final String HOTEL_USERS_ASSIGN_ROLES = "/hotel-users/{id}/roles";

// Thu hồi vai trò của nhân viên
public static final String HOTEL_USERS_REVOKE_ROLE = "/hotel-users/{id}/roles/{roleId}";
```

## 5. Tenant Owners (Quản lý Chủ sở hữu Chuỗi / Tenant)
```java
// Danh sách chủ sở hữu tenant
public static final String TENANT_OWNERS_LIST = "/tenant-owners";

// Tạo mới chủ sở hữu tenant
public static final String TENANT_OWNERS_CREATE = "/tenant-owners";

// Danh sách tùy chọn tenant
public static final String TENANT_OWNERS_LIST_OPTIONS = "/tenant-owners/tenant-options";

// Lấy chi tiết chủ sở hữu tenant theo ID
public static final String TENANT_OWNERS_GET_BY_ID = "/tenant-owners/{id}";

// Cập nhật thông tin chủ sở hữu tenant
public static final String TENANT_OWNERS_UPDATE = "/tenant-owners/{id}";
```

## 6. Hotels (Quản lý Khách sạn / Cơ sở)
```java
// Tạo khách sạn mới
public static final String HOTELS_CREATE = "/hotels";

// Danh sách khách sạn
public static final String HOTELS_LIST = "/hotels";

// Lấy thông tin chi tiết khách sạn
public static final String HOTELS_GET_BY_ID = "/hotels/{hotelId}";

// Cập nhật thông tin khách sạn
public static final String HOTELS_UPDATE = "/hotels/{hotelId}";
```

## 7. Hotel Rooms & Stays (Quản lý Phòng & Lượt ở)
```java
// Tạo phòng mới trong khách sạn
public static final String HOTEL_ROOMS_CREATE = "/hotels/{hotelId}/rooms";

// Danh sách phòng trong khách sạn
public static final String HOTEL_ROOMS_LIST = "/hotels/{hotelId}/rooms";

// Tạo nhiều phòng cùng lúc (Bulk)
public static final String HOTEL_ROOMS_BULK_CREATE = "/hotels/{hotelId}/rooms/bulk";

// Cập nhật thông tin phòng
public static final String HOTEL_ROOMS_UPDATE = "/hotels/{hotelId}/rooms/{roomId}";

// Tạo lượt lưu trú (Stay) mới
public static final String HOTEL_STAYS_CREATE = "/hotels/{hotelId}/stays";

// Tạo lượt lưu trú và nhận phòng ngay (Check-in)
public static final String HOTEL_STAYS_CREATE_CHECK_IN = "/hotels/{hotelId}/stays/check-in";

// Nhận phòng cho lượt lưu trú đã có
public static final String HOTEL_STAYS_CHECK_IN = "/hotels/{hotelId}/stays/{stayId}/check-in";

// Trả phòng (Check-out)
public static final String HOTEL_STAYS_CHECK_OUT = "/hotels/{hotelId}/stays/{stayId}/check-out";

// Xoay mã QR phòng
public static final String HOTEL_ROOMS_QR_ROTATE = "/hotels/{hotelId}/rooms/{roomId}/qr/rotate";

// Kích hoạt mã QR phòng
public static final String HOTEL_ROOMS_QR_ACTIVATE = "/hotels/{hotelId}/rooms/{roomId}/qr/activate";

// Vô hiệu hóa mã QR phòng
public static final String HOTEL_ROOMS_QR_DEACTIVATE = "/hotels/{hotelId}/rooms/{roomId}/qr/deactivate";
```

## 8. Hotel Services & Catalog (Danh mục Dịch vụ Khách sạn)
```java
// Đồng bộ danh mục dịch vụ từ Google Sheets
public static final String HOTEL_SERVICES_SYNC_SHEETS = "/hotels/{hotelId}/service-catalog/sync";

// Danh sách danh mục dịch vụ
public static final String HOTEL_SERVICE_CATEGORIES_LIST = "/hotels/{hotelId}/service-categories";

// Tạo danh mục dịch vụ mới
public static final String HOTEL_SERVICE_CATEGORIES_CREATE = "/hotels/{hotelId}/service-categories";

// Cập nhật danh mục dịch vụ
public static final String HOTEL_SERVICE_CATEGORIES_UPDATE = "/hotels/{hotelId}/service-categories/{categoryId}";

// Danh sách món / dịch vụ chi tiết
public static final String HOTEL_SERVICE_ITEMS_LIST = "/hotels/{hotelId}/service-items";

// Tạo mới món / dịch vụ chi tiết
public static final String HOTEL_SERVICE_ITEMS_CREATE = "/hotels/{hotelId}/service-items";

// Cập nhật món / dịch vụ chi tiết
public static final String HOTEL_SERVICE_ITEMS_UPDATE = "/hotels/{hotelId}/service-items/{itemId}";
```

## 9. Hotel Dashboard (Bảng điều khiển Khách sạn)
```java
// Lấy dữ liệu tổng quan bảng điều khiển khách sạn
public static final String HOTEL_DASHBOARD_GET = "/hotels/{hotelId}/dashboard";
```

## 10. Reservations (Quản lý Đặt phòng)
```java
// Tạo đơn đặt phòng mới
public static final String RESERVATIONS_CREATE = "/hotels/{hotelId}/reservations";

// Danh sách lượt khách sắp đến (Arrivals)
public static final String RESERVATIONS_LIST_ARRIVALS = "/hotels/{hotelId}/arrivals";

// Gán phòng cho đơn đặt phòng
public static final String RESERVATIONS_ASSIGN_ROOM = "/hotels/{hotelId}/reservations/{reservationId}/room";

// Làm thủ tục nhận phòng cho đơn đặt
public static final String RESERVATIONS_CHECK_IN = "/hotels/{hotelId}/reservations/{reservationId}/check-in";
```

## 11. Hotel Staff Assignments (Phân công Nhân sự Khách sạn)
```java
// Danh sách phân công nhân sự tại khách sạn
public static final String HOTEL_STAFF_ASSIGNMENTS_LIST = "/hotels/{hotelId}/staff-assignments";

// Phân công nhân sự vào khách sạn
public static final String HOTEL_STAFF_ASSIGNMENTS_ASSIGN = "/hotels/{hotelId}/staff-assignments/{userId}";

// Gỡ phân công nhân sự khỏi khách sạn
public static final String HOTEL_STAFF_ASSIGNMENTS_REVOKE = "/hotels/{hotelId}/staff-assignments/{userId}";
```

## 12. Folio & Billing (Quản lý Hóa đơn & Tài khoản Phòng)
```java
// Danh sách Folio của khách sạn
public static final String FOLIO_LIST = "/hotels/{hotelId}/folios";

// Lấy Folio đang hoạt động theo lượt ở
public static final String FOLIO_GET_ACTIVE_BY_STAY = "/hotels/{hotelId}/stays/{stayId}/active-folio";

// Lấy tóm tắt chi phí Folio
public static final String FOLIO_GET_SUMMARY = "/hotels/{hotelId}/folios/{folioId}/summary";

// Phát hành hóa đơn khi thanh toán checkout
public static final String FOLIO_ISSUE_INVOICE = "/hotels/{hotelId}/folios/{folioId}/checkout/issue-invoice";

// Danh sách mục chi phí trong Folio
public static final String FOLIO_LIST_ITEMS = "/hotels/{hotelId}/folios/{folioId}/items";

// Xem chi tiết thông tin Folio
public static final String FOLIO_GET_DETAIL = "/hotels/{hotelId}/folios/{folioId}";
```

## 13. Invoices & Payments (Thanh toán & Hóa đơn)
```java
// Xem chi tiết hóa đơn
public static final String INVOICE_GET_DETAIL = "/hotels/{hotelId}/invoices/{invoiceId}";

// Tạo phiên thanh toán (VNPay / Online)
public static final String PAYMENT_CREATE_SESSION = "/hotels/{hotelId}/invoices/{invoiceId}/payments/session";

// Xác nhận thanh toán thủ công (Tiền mặt / Chuyển khoản)
public static final String PAYMENT_CONFIRM_MANUAL = "/hotels/{hotelId}/invoices/{invoiceId}/payments/manual-confirm";

// Kiểm tra trạng thái giao dịch thanh toán
public static final String PAYMENT_GET_STATUS = "/hotels/{hotelId}/payments/{paymentId}/status";

// Webhook xử lý phản hồi từ cổng thanh toán
public static final String PAYMENT_PROCESS_WEBHOOK = "/payments/webhook/{provider}";
```

## 14. Guest Operations / Guest OS (Dành cho Khách hàng sử dụng)
```java
// Quét mã QR phòng để bắt đầu phiên truy cập
public static final String GUEST_SCAN_QR = "/guest/qr/scan";

// Lấy thông tin phiên làm việc hiện tại của khách
public static final String GUEST_GET_CURRENT_SESSION = "/guest/session/me";

// Danh sách dịch vụ khả dụng cho khách
public static final String GUEST_LIST_SERVICES = "/guest/services";

// Danh sách dịch vụ theo danh mục cho khách
public static final String GUEST_LIST_CATEGORY_SERVICES = "/guest/service-categories/{categoryId}/services";

// Khách gửi yêu cầu dịch vụ / đồ đạc
public static final String GUEST_CREATE_REQUEST = "/guest/requests";

// Danh sách yêu cầu đã gửi của khách
public static final String GUEST_LIST_REQUESTS = "/guest/requests";

// Khách hủy yêu cầu dịch vụ
public static final String GUEST_CANCEL_REQUEST = "/guest/requests/{requestId}/cancel";

// Lấy danh sách tin nhắn giữa khách và lễ tân
public static final String GUEST_LIST_MESSAGES = "/guest/messages";

// Khách gửi tin nhắn đến lễ tân
public static final String GUEST_SEND_MESSAGE = "/guest/messages";

// Đánh dấu đã đọc các tin nhắn từ lễ tân
public static final String GUEST_MARK_MESSAGES_READ = "/guest/messages/read";

// Kết thúc phiên làm việc của khách (Trả phòng/Thoát)
public static final String GUEST_CLOSE_SESSION = "/guest/session/close";
```

## 15. Hotel Requests & Messages - Staff Operations (Quản lý Yêu cầu & Tin nhắn từ Phía Nhân viên)
```java
// Danh sách tất cả cuộc hội thoại nhắn tin với khách
public static final String HOTEL_MESSAGES_LIST = "/hotels/{hotelId}/messages";

// Lấy chi tiết chuỗi tin nhắn theo Thread ID
public static final String HOTEL_MESSAGES_GET_THREAD = "/hotels/{hotelId}/messages/{threadId}";

// Lễ tân trả lời tin nhắn của khách
public static final String HOTEL_MESSAGES_REPLY = "/hotels/{hotelId}/messages/{threadId}/reply";

// Đánh dấu chuỗi tin nhắn đã đọc
public static final String HOTEL_MESSAGES_MARK_READ = "/hotels/{hotelId}/messages/{threadId}/read";

// Danh sách các yêu cầu của khách hàng gửi tới khách sạn
public static final String HOTEL_REQUESTS_LIST = "/hotels/{hotelId}/requests";

// Tóm tắt thống kê trạng thái các yêu cầu
public static final String HOTEL_REQUESTS_GET_SUMMARY = "/hotels/{hotelId}/requests/summary";

// Xem chi tiết yêu cầu của khách
public static final String HOTEL_REQUESTS_GET_DETAIL = "/hotels/{hotelId}/requests/{requestId}";

// Cập nhật trạng thái yêu cầu (Đang xử lý, Hoàn thành, Hủy)
public static final String HOTEL_REQUESTS_UPDATE_STATUS = "/hotels/{hotelId}/requests/{requestId}/status";

// Phân công nhân viên xử lý yêu cầu
public static final String HOTEL_REQUESTS_UPDATE_ASSIGNMENT = "/hotels/{hotelId}/requests/{requestId}/assignment";

// Ghi nhận sự kiện / nhật ký xử lý yêu cầu
public static final String HOTEL_REQUESTS_CREATE_EVENT = "/hotels/{hotelId}/requests/{requestId}/events";
```

## 16. Integrations & Notifications (Tích hợp & Thông báo)
```java
// Webhook nhận dữ liệu từ Telegram Bot
public static final String INTEGRATIONS_TELEGRAM_WEBHOOK = "/integrations/telegram/webhook";

// Danh sách tuyến thông báo (Notification Routes)
public static final String HOTEL_NOTIFICATION_ROUTES_LIST = "/hotels/{hotelId}/notification-routes";

// Tạo mới tuyến thông báo
public static final String HOTEL_NOTIFICATION_ROUTES_CREATE = "/hotels/{hotelId}/notification-routes";

// Cập nhật tuyến thông báo
public static final String HOTEL_NOTIFICATION_ROUTES_UPDATE = "/hotels/{hotelId}/notification-routes/{routeId}";
```

## 17. Emergency (Cuộc gọi Khẩn cấp)
```java
// Tạo cuộc gọi / tín hiệu báo động khẩn cấp từ khách
public static final String EMERGENCY_CREATE_GUEST_CALL = "/emergency/guest/calls";
```

## 18. Realtime Ticket (Cấp vé kết nối Realtime Socket)
```java
// Cấp ticket xác thực kết nối Realtime WebSocket cho yêu cầu
public static final String REQUEST_REALTIME_ISSUE_TICKET = "/hotels/{hotelId}/request-realtime-ticket";
```
