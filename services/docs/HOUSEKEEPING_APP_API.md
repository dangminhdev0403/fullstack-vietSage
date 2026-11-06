# Tích hợp Housekeeping vào ứng dụng mobile

Đối chiếu mã nguồn ngày 06/11/2026, từ mốc `aa8cf5b1` và thay đổi hiện tại. Đây là hướng dẫn dùng API đang có; các giới hạn ở cuối tài liệu cần được giữ khi triển khai app.

## 1. Kết nối trực tiếp NestJS

```text
Mobile app ── HTTPS Bearer ──> NestJS core API
           └─ Socket.IO ────> /request-realtime
Next.js web ── BFF /api/... ─> cùng NestJS core API
```

App dùng API của `services/auth-service`; không cần chạy Next.js hoặc gọi các đường `/api/hotel-ops/...` của web. Backend sở hữu xác thực, tenant/hotel/phòng được phân công, chuyển trạng thái, transaction và phát sự kiện.

Cấu hình theo môi trường:

| Giá trị phía app | Ý nghĩa |
| --- | --- |
| `API_BASE_URL` | Origin/prefix HTTPS công khai trỏ tới NestJS, do môi trường triển khai cung cấp |
| `SOCKET_ORIGIN` | Origin phục vụ Socket.IO; thường cùng origin API |
| `SOCKET_PATH` | Mặc định NestJS hiện tại là `/socket.io`; chỉ đổi nếu reverse proxy của môi trường quy định khác |

Các route HTTP dưới đây là đường dẫn **tương đối với NestJS**, hiện không có global `/api` prefix trong `app.bootstrap.ts`. Không hardcode port từ máy phát triển; `PORT` là cấu hình runtime backend. Điện thoại thật không dùng `localhost` để truy cập máy phát triển. App chỉ cần URL công khai và token người dùng; không đưa khóa ký JWT, ticket secret, DB URL hay provider credentials vào app.

## 2. Đăng nhập, token và khách sạn

### Luồng khởi tạo

1. `POST /auth/login` với `{ "email": "<email>", "password": "<password>" }`.
2. Lưu token bằng kho bảo mật của nền tảng, rồi gọi `GET /auth/me` với `Authorization: Bearer <accessToken>`.
3. Chọn khách sạn từ `data.accessibleHotels`. Danh sách này đã theo tài khoản/tenant/phân công; không yêu cầu nhân viên nhập ID.
4. Nhận diện housekeeping khi `activeRole.code === "HOTEL_HOUSEKEEPING"` **hoặc** `activeRole.baseRoleCode === "HOTEL_HOUSEKEEPING"` với role tùy chỉnh. `permissions` của active role quyết định nút khả dụng; không gộp quyền từ `roles`.
5. Với khách sạn đã chọn, tải scope, phòng/task, thông báo và lấy ticket realtime.

Token response `data` của login/refresh:

```ts
type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTtl: string;
  refreshTtl: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  sessionId: string;
};
```

`GET /auth/me` trả `id`, `email`, `fullName`, `status`, `roles`, `activeRole: {id, code, name, baseRoleCode?}`, `permissions`, `menus`, `tenants`, `accessibleHotels`. Một hotel gồm `id`, `tenantId`, `code`, `name`, `enabledFeatures`.

`GET /hotels?page=1&limit=20` cũng tồn tại nhưng cần `platform.hotels.view` **hoặc** `hotel.profile.view`; housekeeping không nên phụ thuộc endpoint này nếu `/auth/me` đã đủ. Khi API đó yêu cầu chọn tenant, dùng `x-tenant-id` trong phạm vi tài khoản; header không cấp thêm quyền.

### Refresh và hết phiên

```http
POST /auth/refresh
Content-Type: application/json
Idempotency-Key: <stable-key-for-this-refresh-attempt>

{"refreshToken":"<refreshToken>"}
```

- Chỉ chạy một refresh tại một thời điểm; những request cùng gặp `401` chờ kết quả đó.
- Refresh xoay cả access/refresh token: thay cặp token nguyên tử, dùng `accessExpiresAt`/`refreshExpiresAt` để theo dõi hạn.
- Giữ cùng `Idempotency-Key` khi retry **cùng một lần refresh**; key dài 1–64 ký tự ASCII thuộc `A–Z a–z 0–9 . _ : -`. Không dùng lại key đó cho một lần refresh mới.
- Refresh thất bại vì phiên bị thu hồi/hết hạn: xóa phiên, ngắt socket và yêu cầu đăng nhập; không retry vô hạn.
- `POST /auth/logout` có Bearer token đăng xuất phiên hiện tại. App cũng phải tự đóng socket và xóa cache/token của phiên.

Login không nhận `roleId`; role hiệu lực là active role do phiên backend xác định.

## 3. Quy ước HTTP và phân quyền

Request private gửi `Authorization: Bearer <accessToken>`, body JSON gửi `Content-Type: application/json`. Có thể gửi `Accept-Language: vi` để nhận nội dung được dịch. Encode từng ID/public code khi ghép URL.

Response thành công có envelope:

```json
{
  "status": 200,
  "error": null,
  "message": "Lấy trạng thái phòng thành công",
  "data": {
    "id": "room-101",
    "hotelId": "hotel-a",
    "roomNumber": "101",
    "floor": "1",
    "status": "PROCESSING",
    "updatedAt": "2026-11-06T03:00:00.000Z",
    "roomTypeName": "Standard"
  }
}
```

Ví dụ ID là dữ liệu minh họa. Parse `data` một lần; `message` dùng để hiển thị, không dùng để suy luận trạng thái. GET/PATCH/PUT thường `200`; nhiều POST housekeeping hiện dùng mặc định NestJS `201` dù Swagger ghi `ApiOkResponse`. Client chấp nhận mã `2xx` thực tế, không khóa cứng mutation vào `200`.

Lỗi có shape khác envelope thành công:

```json
{
  "status": 409,
  "message": "CONFLICT",
  "data": {"detail": "Phiên bản công việc đã cũ, vui lòng tải lại"}
}
```

`data.detail` có thể là chuỗi hoặc mảng chuỗi; một số lỗi có thêm `data.code`/metadata. Dùng HTTP status để phân nhánh, nội dung lỗi để giải thích. Không giả định lỗi luôn có `error` hay `data`.

Quyền trong một ô bên dưới nối bằng `|` nghĩa là **một trong các quyền**. Ngoài quyền endpoint, server kiểm tra active role, tenant, hotel assignment còn hiệu lực và room scope; biết ID không cấp quyền.

| Nhóm thao tác | Quyền |
| --- | --- |
| Scope, minimal room/QR, task list/detail/summary, notification list/read | `hotel.rooms.view` \| `hotel.rooms.ready.confirm` |
| Danh sách phòng chung | `hotel.rooms.view` |
| Tạo/claim/start/block/complete/reopen task | `hotel.rooms.ready.confirm` \| `hotel.rooms.status.manage` \| `hotel.rooms.manage` |
| Legacy đánh dấu phòng sạch `/ready` | `hotel.rooms.ready.confirm` |
| Ticket realtime | `hotel.requests.view` \| `hotel.rooms.view` \| `hotel.dashboard.view` \| `hotel.stays.view` |
| Phân công nhân viên theo tầng/phòng | `hotel.staff.manage` và active role tương ứng `TENANT_OWNER` |

Thiếu token/phiên không hợp lệ trả `401`; thiếu quyền/phân công hoặc stored scope sai trả `403`; phòng/task ngoài phạm vi có thể trả `404` để không lộ tài nguyên. App không tự chuyển `403/404` thành quyền toàn khách sạn.

## 4. Phạm vi được phân công

```http
GET /hotels/{hotelId}/housekeeping/scope
```

`data`:

```json
{
  "mode": "FLOORS",
  "floors": ["1", "2"],
  "roomIds": [],
  "label": null,
  "allowedRoomIds": ["room-101", "room-102", "room-201"]
}
```

| Giá trị | Ý nghĩa |
| --- | --- |
| `mode: ALL`, `allowedRoomIds: null` | Phạm vi toàn khách sạn được cấp |
| `mode: FLOORS` | Chọn tầng; server tính room IDs hiện thuộc các tầng đó |
| `mode: ROOMS` | Chọn trực tiếp các phòng |
| `allowedRoomIds: []` | Hiện không có phòng được phép; không phải toàn khách sạn |

Phân công cũ có `housekeepingScope = null` giữ tương thích toàn khách sạn. Stored scope không hợp lệ bị từ chối. App khi đang tải/lỗi scope không hiển thị dữ liệu cache như thể có quyền ALL. Sau đăng nhập lại, đổi hotel, reconnect, foreground trở lại hoặc nhận `SCOPE_CHANGED`, tải lại scope và dữ liệu đang hiển thị.

### Tenant cấu hình phân công

```http
PUT /hotels/{hotelId}/staff-assignments/{userId}/housekeeping-scope

{"mode":"FLOORS","floors":["1","2"],"roomIds":[],"label":null}
```

Hoặc `{"mode":"ROOMS","floors":[],"roomIds":["room-101","room-102"],"label":null}`; ALL dùng hai mảng rỗng. Phải có hotel assignment ACTIVE, user/tenant membership/role housekeeping canonical hoặc custom còn hoạt động. Server từ chối tầng/phòng không thuộc khách sạn; không tự phân công chính mình.

Giới hạn: tối đa 100 tầng, mỗi tên 1–80 ký tự; tối đa 2.000 room IDs; FLOORS/ROOMS không nhận danh sách rỗng và không trộn hai kiểu chọn. UI/app mới chọn tầng hoặc phòng trực tiếp, gửi `label: null`; backend vẫn đọc nhãn cũ để tương thích. Không cần luồng đặt tên nhóm/khu vực phụ cho payload này.

Tenant dùng `PUT /hotels/{hotelId}/staff-assignments/{userId}` để cấp hotel assignment trước; `DELETE` cùng đường dẫn thu hồi assignment. Đây là thao tác quản trị, không đặt trên màn hình tác nghiệp của nhân viên. Cập nhật scope/thu hồi assignment làm các owner socket của nhân viên tại hotel bị ngắt và yêu cầu xác thực phạm vi lại.

## 5. Phòng và quét QR

| API | Dùng cho |
| --- | --- |
| `GET /hotels/{hotelId}/housekeeping/rooms/{roomId}` | Chi tiết tối thiểu của một phòng |
| `GET /hotels/housekeeping/rooms/by-qr/{qrCode}` | Resolve public code QR và kiểm tra quyền; không cần hotelId trước |
| `GET /hotels/{hotelId}/rooms?page=1&limit=100` | Sơ đồ/danh sách phòng theo scope server |

Hai endpoint minimal room/QR trả đúng các field trong ví dụ phòng ở mục 3. `roomNumber`, `floor`, `roomTypeName` có thể thiếu/null theo dữ liệu; dùng `id` làm identity. Không cần kéo hồ sơ khách để đánh dấu sạch.

QR dùng public code của `RoomQRCode`, phải ACTIVE, chưa thu hồi và chưa hết hạn. Nếu camera đọc URL web `/g/{qrCode}`, app lấy **đúng public code** từ URL được tin cậy rồi gọi API staff by-qr. Sau resolve, mở cùng màn hình chi tiết phòng từ sơ đồ. Với housekeeping đã đăng nhập, không gọi guest QR scan để tạo guest session, kể cả khi staff API trả lỗi.

Ví dụ camera đọc `https://<trusted-web-host>/g/<public-code>`:

```js
// qrCode đã được lấy từ đúng path /g/{code} của host được cho phép.
const response = await authenticatedFetch(
  `${API_BASE_URL}/hotels/housekeeping/rooms/by-qr/${encodeURIComponent(qrCode)}`
);
if (!response.ok) throw await parseApiError(response);
const { data: room } = await response.json();
openHousekeepingRoomDetail({ hotelId: room.hotelId, roomId: room.id });
```

`authenticatedFetch`, `parseApiError` và `openHousekeepingRoomDetail` là helper phía app, không phải API mới. Dữ liệu vừa resolve chỉ dùng khởi tạo màn hình; tải task/version mới trước khi cho đánh dấu sạch.

Danh sách `/rooms` hỗ trợ `page >= 1`, `limit 1..100` (mặc định service `1/20`), `q` tối đa 80 ký tự, `status`, `floor`; các bộ lọc khác thuộc schema phòng. Các field phân trang chính trong `data`: `items`, `total`, `totalItems`, `page`, `limit`, `totalPages`; có metadata `floors`, `types`, `summary`, `businessDate`. App chỉ cần số phòng, tầng, `status`, `updatedAt` và field hiển thị đã được cấp. Nếu dựng toàn bộ sơ đồ, đọc đủ `totalPages`; không tính tổng từ một trang đầu.

### Room status và task status là hai trạng thái khác nhau

| Room status | Hiển thị tác nghiệp |
| --- | --- |
| `PROCESSING` | Cần dọn |
| `AVAILABLE` | Sạch/sẵn sàng đón khách |
| `OCCUPIED` | Có khách |
| `RESERVED` | Đã đặt |
| `MAINTENANCE`, `OUT_OF_SERVICE`, `BLOCKED` | Không sẵn sàng, cần xử lý theo nghiệp vụ |

`Đang dọn` lấy từ task `CLAIMED/IN_PROGRESS`; không gửi room status `CLEANING` vì enum phòng không có giá trị đó. Khi checkout hoàn tất, backend đưa phòng vào `PROCESSING`, tạo task `QUEUED` và thông báo trong transaction; app không tự suy luận checkout từ đồng hồ hoặc tự tạo task trùng.

## 6. Task API và đánh dấu sạch

Tiền tố `H = /hotels/{hotelId}/housekeeping`:

| Method/path | Body/query chính |
| --- | --- |
| `GET H/tasks` | `page` mặc định 1, `limit` mặc định 20/tối đa 100; `status`, `priority`, `roomId`, `assignedToUserId` tùy chọn |
| `GET H/tasks/summary` | Không body; trả `queued`, `claimed`, `inProgress`, `blocked`, `completed`, `totalActive` |
| `GET H/tasks/{taskId}` | Task kèm `history` |
| `POST H/tasks` | `{roomId, priority?: "NORMAL"|"URGENT", notes?}` |
| `POST H/tasks/{taskId}/claim` | `{expectedVersion?}`; nhận cho chính người gọi |
| `POST H/tasks/{taskId}/start` | `{expectedVersion?}` |
| `POST H/tasks/{taskId}/block` | `{reason, notes?, expectedVersion?}` |
| `POST H/tasks/{taskId}/complete` | `{notes?, expectedVersion?}` |
| `POST H/tasks/{taskId}/reopen` | `{reason?, expectedVersion?}` |

Body được validate strict; không thêm `assignedToUserId` vào claim hoặc field ngoài schema. `expectedVersion` là số nguyên >=1; API cho phép bỏ để tương thích nhưng app mới nên **luôn gửi version đã đọc**. `notes` tối đa 1.000 ký tự; block reason bắt buộc 1–500 ký tự, reopen reason tối đa 500.

Task list `data = {items, total, page, limit, totalPages}`. Mỗi task:

```ts
type HousekeepingTask = {
  id: string; hotelId: string; roomId: string;
  roomNumber?: string; roomFloor?: string | null; roomTypeName?: string | null;
  stayId: string | null;
  status: "QUEUED" | "CLAIMED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
  priority: "NORMAL" | "URGENT";
  assignedToUserId: string | null; assignedToName?: string | null;
  assignedAt: string | null; startedAt: string | null; completedAt: string | null;
  blockedAt: string | null; blockReason: string | null; notes: string | null;
  version: number; createdAt: string; updatedAt: string;
  history?: Array<{
    id: string; taskId: string; fromStatus: string | null; toStatus: string;
    actorUserId: string | null; actorName?: string | null;
    reason: string | null; notes: string | null; createdAt: string;
  }>;
};
```

Luồng task chuẩn: `QUEUED → CLAIMED → IN_PROGRESS → COMPLETED`; API complete cũng cho phép `QUEUED/CLAIMED → COMPLETED` để phục vụ nút “Đánh dấu sạch” trực tiếp. `BLOCKED` cần reopen trước complete. Reopen từ `BLOCKED/COMPLETED` trả `IN_PROGRESS` nếu còn người phụ trách, ngược lại `QUEUED`; reopen task hoàn tất có thể đưa phòng `AVAILABLE → PROCESSING`. Không có endpoint cancel task riêng trong controller hiện tại.

### Đánh dấu sạch và khôi phục sau lỗi mạng

1. Mở minimal room, tải `GET H/tasks?roomId={roomId}`; ưu tiên task đang hoạt động (`QUEUED/CLAIMED/IN_PROGRESS/BLOCKED`) của phòng.
2. Khi phòng đang `PROCESSING` và task cho phép hoàn tất, xác nhận “Phòng … đã sạch?”, rồi gửi:

```http
POST /hotels/{hotelId}/housekeeping/tasks/{taskId}/complete
Authorization: Bearer <accessToken>
Content-Type: application/json

{"expectedVersion":7}
```

3. Chỉ hiển thị thành công sau response `2xx`. Server hoàn tất task, tăng version, cập nhật phòng sang `AVAILABLE` và phát event sau transaction.
4. Tải lại room/task để hiển thị trạng thái chuẩn. Socket là tín hiệu đồng bộ, không thay response mutation.
5. Nếu timeout/mất mạng sau gửi, **đọc lại chính task và room trước khi gửi lại**. Cùng task đã `COMPLETED` và room vẫn `AVAILABLE` được complete trả thành công idempotent; không tạo task khác hay đánh dấu sạch một lượt checkout mới.
6. Nếu `409`, tải room + task + scope mới. Nếu thao tác đã hoàn tất thì kết thúc; nếu đã có khách, bị khóa/tạm dừng, đổi người hoặc đổi phạm vi thì giải thích và dừng. Chỉ retry với version mới khi người dùng vẫn muốn thao tác và điều kiện còn đúng.

Complete không được chuyển phòng `OCCUPIED/RESERVED/MAINTENANCE/BLOCKED/OUT_OF_SERVICE` thành sạch; task `BLOCKED/CANCELLED` cũng không phải đường bypass. Nếu UI thấy nhân viên khác đang phụ trách, hiện người đó và tránh đưa nút thao tác gây nhầm lẫn; backend hiện chưa có endpoint phân công task cho một người khác.

### Fallback cho phòng cũ chưa có task

```http
PATCH /hotels/{hotelId}/rooms/{roomId}/ready

{"expectedUpdatedAt":"2026-11-06T03:00:00.000Z"}
```

Dùng timestamp **nguyên bản lấy từ room**, không tạo timestamp bằng giờ thiết bị. Endpoint chỉ chuyển `PROCESSING → AVAILABLE`, kiểm tra timestamp và concurrent updates, từ chối task đang BLOCKED; nếu có task hoạt động thì hoàn tất và tăng version trong transaction. Room đã AVAILABLE vẫn phải khớp `expectedUpdatedAt`; retry cũ có thể trả `409`, nên đọc lại trước. Không dùng fallback để né lỗi task/scope/permission. Payload trả về là projection phòng của API property, rộng hơn minimal room.

### Ưu tiên và nhận việc hiện có

`priority` chỉ có `NORMAL/URGENT`, được nhận khi tạo task; checkout hỗ trợ `cleaningPriority` trong nghiệp vụ trả phòng. App hiển thị ưu tiên từ server. Controller housekeeping chưa có route riêng để chỉnh priority task đã tạo hoặc gán task cho người khác. Claim là tự nhận; phân công theo tầng/phòng là scope do tenant quản lý, khác với người đang nhận một task.

## 7. Thông báo lưu trong DB

```http
GET /hotels/{hotelId}/housekeeping/notifications?status=UNREAD&limit=20
PATCH /hotels/{hotelId}/housekeeping/notifications/{notificationId}/read
```

GET trả `data` là **mảng**, mới nhất trước; `limit` mặc định 20, tối đa 100. Không có `page/cursor/total` trên endpoint này. Status filter: `UNREAD`, `READ`, `DISMISSED`; controller chưa có thao tác dismiss.

Một item gồm `id`, `hotelId`, `taskId`, `recipientUserId: string|null`, `title`, `message`, `status`, `readAt: string|null`, `createdAt`, `updatedAt`. Các timestamp truyền ISO string. Dùng `taskId` để mở task, rồi mở cùng chi tiết room. PATCH không cần body và trả item đã đọc.

**Giới hạn hiện tại:** notification được lọc theo hotel và room scope thông qua task; repository không lọc theo `recipientUserId` người gọi. `READ/readAt` nằm trên bản ghi thông báo dùng chung, chưa phải unread riêng cho từng nhân viên/thiết bị. Không hứa “hộp thư cá nhân” hoặc tổng unread toàn bộ khi chỉ tải 20/100 item. Task/check-out tạo thông báo, nhưng không có cam kết mọi lifecycle event đều có một notification record tương ứng.

## 8. Realtime Socket.IO

### Ticket và handshake

```http
POST /hotels/{hotelId}/request-realtime-ticket
Authorization: Bearer <accessToken>
```

`data = {ticket: string, expiresAt: ISO string}`. Không có body. Ticket ngắn hạn (mặc định cấu hình backend 60 giây); lấy ticket mới khi kết nối lại, không lưu dài hạn hay truyền access token thay ticket.

Ví dụ Socket.IO client (minh họa, tách xử lý token/retry vào lớp kết nối dùng chung của app):

```js
const socket = io(`${SOCKET_ORIGIN}/request-realtime`, {
  path: SOCKET_PATH, // mặc định "/socket.io"
  transports: ["websocket"],
  auth: { mode: "owner", ticket },
  autoConnect: false,
  reconnection: false // app lấy ticket mới rồi tạo lại kết nối
});
socket.on("request_realtime.ready", ({ mode, scope }) => {
  // mode="owner"; scope hotel-wide hoặc có roomId/roomIds, kể cả []
  refreshScopeAndVisibleData();
});
// Đăng ký thêm error/lifecycle listeners rồi mới kết nối.
socket.connect();
```

Đây là **Socket.IO**, không phải WebSocket JSON thuần. Namespace là `/request-realtime`; transport path là `/socket.io`. Gateway không nhận danh sách phòng từ app để cấp quyền. Ticket ký active role và gateway đọc lại scope hiện tại trước khi join room channels; reuse ticket cũ không khôi phục phòng bị thu hồi. `roomIds: []` không join kênh toàn hotel.

| Event | Payload/tác dụng |
| --- | --- |
| `request_realtime.ready` | `{mode:"owner", scope:{hotelId, roomId? hoặc roomIds?}}` |
| `request_realtime.error` | `{code, retryable}`; lỗi auth/expired/invalid thường `retryable:false` |
| `room_status.updated` | `{eventId,hotelId,roomId,roomNumber?,status,previousStatus?,updatedAt}` |
| `housekeeping_task.created` | Task mới; thường do checkout hoặc tạo thủ công |
| `housekeeping_task.claimed` | Đã nhận task |
| `housekeeping_task.started` | Đã bắt đầu |
| `housekeeping_task.blocked` | Tạm dừng, có thể có reason |
| `housekeeping_task.completed` | Hoàn tất |
| `housekeeping_task.reopened` | Mở lại |

`room_status.updated` cũng được phát sau khi admin thực hiện reset vận hành phòng thành công; payload giữ nguyên hợp đồng ở trên. Event và notification là hậu xử lý best-effort: nếu gửi thất bại, mutation đã commit không bị rollback. Khi socket mất kết nối hoặc bỏ lỡ event, reconnect/foreground phải tải lại HTTP để khôi phục trạng thái chuẩn.

Task events là object trực tiếp, **không có HTTP envelope**:

```json
{
  "eventId": "event-unique-id",
  "hotelId": "hotel-a",
  "taskId": "task-101",
  "roomId": "room-101",
  "roomNumber": "101",
  "status": "QUEUED",
  "previousStatus": null,
  "priority": "URGENT",
  "assignedStaffId": null,
  "assignedStaffName": null,
  "reason": "CHECKOUT",
  "notes": null,
  "createdAt": "2026-11-06T03:00:00.000Z",
  "updatedAt": "2026-11-06T03:00:00.000Z"
}
```

Field trong task event có thể tùy nguồn phát; không giả định event có đủ DTO hoặc `version`. `created` thường mang status `QUEUED` từ task thật; emitter có fallback `CREATED`, `reopened` có fallback `REOPENED`, nên dùng **event name** để quyết định tải lại và dùng HTTP DTO làm trạng thái chuẩn. `assignedStaffId` ở event tương ứng `assignedToUserId` trong HTTP. Dedupe theo `eventId` khi có; không dedupe lâu dài theo taskId vì một task có nhiều lần chuyển trạng thái.

Nếu app xử lý thêm yêu cầu từ khách, cùng socket có `guest_request.created`, `guest_request.updated`, `guest_request.answered`; các event này bọc bản ghi trong `{request: ...}`. Chúng là guest request, khác với HousekeepingTask và notification DB; không dùng chúng như DTO task.

### Đổi scope, mất mạng và foreground lại

- Khi tenant cập nhật scope hoặc thu hồi hotel assignment, server gửi `request_realtime.error` với `{code:"SCOPE_CHANGED",retryable:true}` rồi ngắt owner sockets của user tại hotel.
- App đóng connection cũ, lấy ticket mới bằng Bearer hiện hành, tạo lại socket với backoff và tải lại `/auth/me`, scope, room/task/notifications đang hiển thị. Scope/assignment không còn hợp lệ thì dừng kết nối hotel đó.
- Với lỗi terminal `retryable:false`, không reconnect vô hạn bằng cùng ticket; refresh/login hoặc báo kết nối chưa khả dụng tùy nguyên nhân. Ticket API có thể trả `503` khi realtime chưa bật/cấu hình chưa đủ.
- Socket events không có replay cursor/ack bền vững; reconnect/foreground luôn đọc lại HTTP. Đăng ký listener trước connect, hủy listener/socket khi logout hoặc đổi hotel; tránh nhiều socket trùng cho cùng phiên/hotel.
- Event chỉ báo dữ liệu thay đổi. Hiển thị banner/âm thanh trong app đang hoạt động tùy lựa chọn người dùng, rồi invalidate/refetch dữ liệu liên quan.

### Thông báo hệ điều hành

Housekeeping hiện có **Socket.IO khi app đang kết nối** và thông báo lưu DB. Chưa có luồng housekeeping đăng ký device token, gửi FCM/APNs hoặc bảo đảm nhận thông báo khi app bị hệ điều hành treo/đóng. Không coi kết nối socket là background push. Khi quay lại foreground phải đồng bộ HTTP; OS push cần bổ sung tích hợp riêng trước khi hứa khả năng này.

## 9. Luồng màn hình mobile đề xuất

1. **Buồng phòng:** chọn hotel được cấp, sơ đồ theo tầng, ưu tiên phòng cần dọn, bộ lọc gọn. Dữ liệu lỗi có nút tải lại; không biến lỗi thành “không có phòng”.
2. **Chi tiết phòng dùng chung:** mở từ ô phòng, notification hoặc QR; hiện số phòng/tầng/trạng thái/ưu tiên/người phụ trách và nút “Đánh dấu sạch” khi hợp lệ. Không cần checklist hoặc hồ sơ khách cho luồng này.
3. **Thông báo:** phòng cần dọn/yêu cầu liên quan và mở chi tiết; không tạo UI đặt tên nhóm hay bắt nhân viên tự cấu hình scope.
4. **Thành công:** cập nhật từ response và tải lại; giữ vị trí/bộ lọc khi về sơ đồ.

Offline cho phép xem cache với trạng thái “Dữ liệu đã lưu” và thời điểm đồng bộ. Không đánh dấu room sạch thành công khi chưa có server xác nhận; không tự replay hàng đợi thao tác sạch sau nhiều giờ vì phòng có thể đã sang lượt lưu trú mới. Khi online lại, đọc scope/room/task và yêu cầu xác nhận lại thao tác còn phù hợp. Không dùng giờ thiết bị để tạo `expectedUpdatedAt` hoặc tự tăng `version`.

## 10. Checklist tích hợp và giới hạn hợp đồng

- [ ] Cấu hình đúng API origin, Socket.IO origin/path và HTTPS cho thiết bị thật.
- [ ] Login → secure token storage → single-flight refresh → `/auth/me`; nhận diện canonical/custom housekeeping qua base role.
- [ ] Tải scope fail-closed; kiểm tra `null` khác `[]`; UI phản ánh `401/403/404` đúng.
- [ ] Room/task đọc đủ trang cần dùng; detail và QR dùng cùng màn hình staff.
- [ ] Complete gửi version thật; fallback ready gửi timestamp thật; kiểm tra `409`, timeout sau commit và checkout mới.
- [ ] Reconnect với ticket mới; scope update/revoke ngắt dữ liệu cũ; reload HTTP khi foreground.
- [ ] Notification read hiện là chung; không tự hứa unread cá nhân hoặc pagination chưa có.
- [ ] Phân biệt socket foreground với OS push; offline không xác nhận sạch giả hoặc replay mù.

Các gap cần biết trước khi làm app: Swagger housekeeping một số response mới chỉ có description, chưa có schema DTO đầy đủ; POST success status có chênh lệch annotation/runtime như mục 3; task event chưa có version hợp đồng chung và không replay; notification list chưa có cursor và read theo từng người; chưa có endpoint chỉnh priority/assign task cho người khác; OS push housekeeping chưa triển khai. Tài liệu này không bổ sung các endpoint hay tính năng đó.

## Nguồn đối chiếu

- [HTTP bootstrap](../auth-service/src/app.bootstrap.ts), [success envelope](../auth-service/src/common/interceptors/transformation.interceptor.ts), [error filter](../auth-service/src/common/filters/global-exception.filter.ts).
- [Auth controller](../auth-service/src/modules/identity/api/auth.controller.ts), [auth schema](../auth-service/src/modules/identity/domain/schemas/auth.schema.ts), [token/profile service](../auth-service/src/modules/identity/application/authentication.service.ts).
- [Housekeeping routes](../auth-service/src/modules/housekeeping/api/housekeeping.controller.ts), [payload/query schemas](../auth-service/src/modules/housekeeping/domain/schemas/housekeeping.schema.ts), [DTOs](../auth-service/src/modules/housekeeping/domain/housekeeping.types.ts), [service mapping](../auth-service/src/modules/housekeeping/application/housekeeping.service.ts), [transitions/QR/notifications](../auth-service/src/modules/housekeeping/infrastructure/repositories/housekeeping.repository.ts).
- [Room routes](../auth-service/src/modules/property/api/hotel-rooms.controller.ts), [room schemas](../auth-service/src/modules/property/domain/schemas/rooms.schema.ts), [scope enforcement](../auth-service/src/modules/property/application/hotel-access.service.ts), [ready/checkout transaction](../auth-service/src/modules/property/infrastructure/repositories/hotel-rooms.repository.ts).
- [Assignment routes](../auth-service/src/modules/property/api/hotel-staff-assignments.controller.ts), [scope schema](../auth-service/src/modules/property/domain/schemas/hotel-staff-assignments.schema.ts), [assignment persistence/invalidation](../auth-service/src/modules/property/infrastructure/repositories/hotel-staff-assignments.repository.ts).
- [Ticket controller](../auth-service/src/modules/request-realtime/api/request-realtime.controller.ts), [ticket service](../auth-service/src/modules/request-realtime/application/request-realtime-ticket.service.ts), [Socket.IO gateway](../auth-service/src/request-realtime.gateway.ts), [event emitter](../auth-service/src/request-realtime.emitter.ts), [runtime config](../auth-service/src/common/config/env.config.ts).
