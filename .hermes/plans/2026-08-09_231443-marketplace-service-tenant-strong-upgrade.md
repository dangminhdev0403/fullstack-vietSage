# Marketplace Service Tenant — Strong Upgrade Implementation Plan

> **For Hermes:** triển khai theo TDD từng lát dọc; không sửa code trước phê duyệt.

**Goal:** Thay prototype Local Partners bằng Marketplace multi-tenant thật: Service Tenant tự quản lý catalog/capacity/waiting time; Admin liên kết Hotel ↔ Service; Guest đặt Order; Service xử lý; Guest/Hotel nhận realtime; Hotel xem doanh thu thu hộ ghi nhận.

**Architecture:** Keep the existing NestJS/Prisma/Next.js monolith. Extend `Tenant` with `TenantType`; reuse `TenantUser`, RBAC, guest sessions, BFF, query-resource, and Socket.IO. Store Hotel and Service coordinates, then rank mapped services with server-side Haversine distance. No Merchant entity, map SDK, guest GPS, payment, commission, or settlement. Stop extending legacy Local Partners; do not delete its data in this release.

**Tech Stack:** PostgreSQL, Prisma, NestJS, Zod, OpenAPI, Next.js App Router, TanStack Query + `@dangminhdev04032005/query-resource`, Socket.IO hiện có.

---

## 1. Kết luận nghiệp vụ đã chốt

1. `SERVICE` là một `Tenant`, không phải `LocalPartner` do Hotel nhập tay.
2. Một Service Tenant có nhiều nhân viên qua `TenantUser` hiện có.
3. Admin/Sale tạo Service Tenant và liên kết Service Tenant với Hotel.
4. Hotel/Guest only sees Service Tenants with an `ACTIVE` mapping to the current Hotel.
5. Service Tenant tự quản lý dịch vụ, giá, ảnh, capacity khả dụng, waiting time, trạng thái.
6. Guest hotel scope lấy từ `GuestSessionGuard`; không nhận `hotelId`, `stayId`, room hoặc guest identity từ body.
7. Mỗi Order thuộc đúng một Hotel, GuestStay, Service Tenant và Service Item.
8. Capacity giữ chỗ ngay khi tạo Order bằng cập nhật có điều kiện trong transaction; hủy trước hoàn tất trả capacity đúng một lần.
9. Trạng thái: `PENDING → ACCEPTED → PREPARING → DELIVERING|READY → COMPLETED`; `CANCELLED` chỉ từ trạng thái cho phép.
10. Hoàn tất Order tạo một bản ghi doanh thu Marketplace bất biến để đối soát. Không tự ghi Folio, không thu tiền online, không chia commission.
11. Categories are Platform Admin-managed taxonomy referenced by Service Items; never runtime-seeded from an arbitrary list.
12. Distance is measured from the physical `Hotel` location, not from the Hotel owner Tenant. Hotel and Service coordinates are stored by trusted staff; discovery ranks only mapped services with complete coordinates.

## 2. Phạm vi MVP

### Có

- Platform Admin: taxonomy, Service Tenant, mapping Hotel ↔ Service.
- Service Portal: nhiều nhân viên; CRUD/publish dịch vụ; capacity; waiting time; nhận và xử lý Order.
- Guest Marketplace: xem Service đã liên kết, lọc category, xem item, đặt Order, xem trạng thái realtime.
- Hotel workspace: xem Order phát sinh từ Hotel; dashboard doanh thu thu hộ theo ngày/tháng/Service Tenant.
- Audit, tenant isolation, idempotency, optimistic concurrency/state transition, pagination.

### Không

- Google Maps SDK, browser GPS, geofence, route ETA, and road-distance calculation.
- Broadcast/dispatch nhiều Service Tenant.
- Rating/review, voucher, claim, analytics clickstream.
- Online payment, commission, settlement, payout.
- Auto Folio charge.
- Kafka/RabbitMQ/Redis/outbox worker.
- Xóa bảng Local Partners hoặc tự động chuyển Local Partner thành account Service Tenant.

### Location scope included in MVP

- Add nullable `googleMapsUrl`, `latitude`, and `longitude` to both `Hotel` and `ServiceTenantProfile`.
- Hotel side: Owner/Admin updates the physical Hotel location.
- Service side: Service Tenant staff updates the physical Service location.
- Reuse one shared location form on both sides: `Use current location` + Google Maps URL + latitude + longitude.
- `Use current location` calls native `navigator.geolocation.getCurrentPosition` only after an explicit click, using `{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }`. Never request location on page load and never request Guest location.
- Browser Geolocation is available only in secure contexts (`HTTPS`, with localhost allowed for development). Show permission-denied, unavailable, and timeout errors inline; preserve manually entered values on failure.
- Save `latitude`, `longitude`, optional `locationAccuracyMeters`, `locationSource`, and `locationVerifiedAt`. Sources: `DEVICE_GEOLOCATION`, `GOOGLE_MAPS_URL`, `MANUAL`.
- Display captured accuracy before save. Warn when accuracy exceeds `100m`, but allow trusted staff to correct/confirm because the device may not be physically at the business.
- Parse coordinates client-side only from recognized full Google Maps URLs (`@lat,lng`, `?q=lat,lng`); always allow manual correction.
- After coordinates are captured, offer `Verify on Google Maps` using `https://www.google.com/maps/search/?api=1&query={lat},{lng}`. This opens the pin without SDK/API key and lets staff correct a device reading taken away from the business.
- Do not resolve shortened map URLs server-side; this avoids SSRF and provider coupling. Users can paste coordinates from Google Maps when the URL contains no coordinates.
- Backend validates HTTP/HTTPS URL, latitude `[-90, 90]`, longitude `[-180, 180]`, non-negative accuracy, and requires the coordinate pair together.
- Backend computes straight-line distance with the existing Haversine helper; no new dependency. Query only the bounded mapped Service set (maximum 100) and calculate O(n) in application code.
- Marketplace ranks `ACTIVE` mapped Service Tenants by explicit mapping priority, then known distance, then stable ID.
- Missing coordinates remain `null`, sort last, and never become `0 km`.
- Mapping remains the authorization/service-area gate. Distance affects ordering only; it never exposes an unmapped Service Tenant.

## 3. Data model tối thiểu

### 3.1 Mở rộng Tenant

Modify: `services/auth-service/prisma/schema.prisma`

```prisma
enum TenantType {
  HOTEL
  SERVICE
}

model Tenant {
  // existing fields
  type TenantType @default(HOTEL)
  serviceProfile ServiceTenantProfile?
  offeredServices MarketplaceService[]
  hotelServiceLinks HotelServiceLink[] @relation("ServiceTenantLinks")
  marketplaceOrders MarketplaceOrder[]
}
```

- Existing Tenant mặc định `HOTEL`; migration additive.
- Không đổi quan hệ Hotel hiện hữu trong migration này.
- Trust boundary luôn kiểm tra `Tenant.type` trước API Service Portal/Admin mapping.

Also extend the physical Hotel record:

```prisma
enum MarketplaceLocationSource {
  DEVICE_GEOLOCATION
  GOOGLE_MAPS_URL
  MANUAL
}

model Hotel {
  // existing fields
  googleMapsUrl String?  @db.VarChar(500)
  latitude  Decimal? @db.Decimal(9, 6)
  longitude Decimal? @db.Decimal(9, 6)
  locationAccuracyMeters Float?
  locationSource MarketplaceLocationSource?
  locationVerifiedAt DateTime?
}
```

Coordinates belong to `Hotel`, not `Tenant`, because one Hotel Tenant may own multiple physical Hotels.

### 3.2 Taxonomy platform-managed

```prisma
model MarketplaceCategory {
  id        String   @id @default(cuid())
  code      String   @unique @db.VarChar(80)
  nameVi    String   @db.VarChar(120)
  nameEn    String   @db.VarChar(120)
  icon      String?  @db.VarChar(80)
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  services  MarketplaceService[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive, sortOrder])
}
```

- Không reuse `HotelServiceCategory`: đó là catalog nội bộ từng Hotel.
- Không seed 6 category cũ trong runtime.
- Migration có thể seed taxonomy được duyệt bằng SQL rõ ràng; chưa có danh sách phê duyệt thì để trống, Admin tạo qua UI.

### 3.3 Service profile/catalog/mapping

```prisma
enum MarketplaceServiceMode { DELIVERY_TO_HOTEL CUSTOMER_AT_SERVICE }
enum MarketplaceRecordStatus { DRAFT ACTIVE DISABLED }
enum HotelServiceLinkStatus { ACTIVE DISABLED }

model ServiceTenantProfile {
  tenantId       String   @id
  displayName    String   @db.VarChar(160)
  description    String?  @db.VarChar(1000)
  phone          String?  @db.VarChar(40)
  address        String?  @db.VarChar(255)
  googleMapsUrl  String?  @db.VarChar(500)
  latitude       Decimal? @db.Decimal(9, 6)
  longitude      Decimal? @db.Decimal(9, 6)
  locationAccuracyMeters Float?
  locationSource MarketplaceLocationSource?
  locationVerifiedAt DateTime?
  coverImageUrl  String?  @db.VarChar(500)
  status         MarketplaceRecordStatus @default(DRAFT)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model MarketplaceService {
  id                String   @id @default(cuid())
  serviceTenantId   String
  categoryId        String
  name              String   @db.VarChar(160)
  description       String?  @db.VarChar(1000)
  unitPrice         Decimal  @db.Decimal(12, 2)
  currency          String   @default("VND") @db.Char(3)
  imageUrls         String[]
  mode              MarketplaceServiceMode
  capacityAvailable Int?
  waitingMinutes    Int      @default(0)
  status            MarketplaceRecordStatus @default(DRAFT)
  version           Int      @default(1)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  serviceTenant     Tenant   @relation(fields: [serviceTenantId], references: [id], onDelete: Cascade)
  category          MarketplaceCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  orders            MarketplaceOrder[]

  @@index([serviceTenantId, status, updatedAt])
  @@index([categoryId, status])
}

model HotelServiceLink {
  id               String   @id @default(cuid())
  hotelId          String
  serviceTenantId  String
  status           HotelServiceLinkStatus @default(ACTIVE)
  sortOrder        Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  hotel            Hotel    @relation(fields: [hotelId], references: [id], onDelete: Cascade)
  serviceTenant    Tenant   @relation("ServiceTenantLinks", fields: [serviceTenantId], references: [id], onDelete: Cascade)

  @@unique([hotelId, serviceTenantId])
  @@index([serviceTenantId, status])
  @@index([hotelId, status, sortOrder])
}
```

`capacityAvailable = null` means unlimited. Require `waitingMinutes >= 0`, `unitPrice >= 0`, and HTTP/HTTPS URLs at the Zod boundary.

Coordinate validation: latitude `[-90, 90]`; longitude `[-180, 180]`; both supplied together or both `null`. Use `Decimal`, not `Float`, for stable persisted coordinates.

### 3.4 Order, event, revenue

```prisma
enum MarketplaceOrderStatus {
  PENDING ACCEPTED PREPARING DELIVERING READY COMPLETED CANCELLED
}

enum MarketplaceOrderActorType { GUEST SERVICE_STAFF HOTEL_STAFF SYSTEM }

enum CapacityReservationStatus { RESERVED RELEASED CONSUMED NOT_REQUIRED }

model MarketplaceOrder {
  id                        String   @id @default(cuid())
  orderNumber               String   @unique @db.VarChar(32)
  idempotencyKey            String   @db.VarChar(120)
  hotelId                   String
  stayId                    String
  serviceTenantId           String
  serviceId                 String
  quantity                  Int
  unitPriceSnapshot         Decimal  @db.Decimal(12, 2)
  totalAmount               Decimal  @db.Decimal(12, 2)
  currency                  String   @db.Char(3)
  serviceNameSnapshot       String   @db.VarChar(160)
  serviceModeSnapshot       MarketplaceServiceMode
  waitingMinutesSnapshot    Int
  guestNote                 String?  @db.VarChar(500)
  status                    MarketplaceOrderStatus @default(PENDING)
  capacityReservationStatus CapacityReservationStatus
  version                   Int      @default(1)
  completedAt               DateTime?
  cancelledAt               DateTime?
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  hotel                     Hotel    @relation(fields: [hotelId], references: [id], onDelete: Restrict)
  stay                      GuestStay @relation(fields: [stayId], references: [id], onDelete: Restrict)
  serviceTenant             Tenant   @relation(fields: [serviceTenantId], references: [id], onDelete: Restrict)
  service                   MarketplaceService @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  events                    MarketplaceOrderEvent[]
  revenue                   MarketplaceRevenueEntry?

  @@unique([stayId, idempotencyKey])
  @@index([serviceTenantId, status, createdAt])
  @@index([hotelId, status, createdAt])
  @@index([stayId, createdAt])
}

model MarketplaceOrderEvent {
  id          String   @id @default(cuid())
  orderId     String
  actorType   MarketplaceOrderActorType
  actorId     String?
  fromStatus  MarketplaceOrderStatus?
  toStatus    MarketplaceOrderStatus
  note        String?  @db.VarChar(500)
  createdAt   DateTime @default(now())
  order       MarketplaceOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, createdAt])
}

model MarketplaceRevenueEntry {
  id               String   @id @default(cuid())
  orderId          String   @unique
  hotelId          String
  serviceTenantId  String
  grossAmount      Decimal  @db.Decimal(12, 2)
  currency         String   @db.Char(3)
  recognizedAt     DateTime
  createdAt        DateTime @default(now())
  order            MarketplaceOrder @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@index([hotelId, recognizedAt])
  @@index([serviceTenantId, recognizedAt])
}
```

## 4. Invariants và state machine

### Tạo Order — một transaction

1. Guest session hợp lệ, stay đang active.
2. Mapping `(hotelId, serviceTenantId)` phải `ACTIVE`.
3. Service/profile/category phải `ACTIVE`.
4. `quantity` nguyên dương, giới hạn hợp lý; note có max length.
5. Với finite capacity: atomic `updateMany where id/serviceTenant/status/capacityAvailable >= quantity`, decrement đúng một lần.
6. Tạo Order snapshot giá/tên/mode/waiting time.
7. Tạo event đầu `PENDING`.
8. Unique `(stayId, idempotencyKey)` trả lại Order cũ khi retry; không trừ capacity lần hai.

### Transition matrix duy nhất

```text
PENDING   → ACCEPTED | CANCELLED
ACCEPTED  → PREPARING | CANCELLED
PREPARING → DELIVERING | READY | CANCELLED
DELIVERING→ COMPLETED | CANCELLED
READY     → COMPLETED | CANCELLED
COMPLETED → terminal
CANCELLED → terminal
```

- `DELIVERING` chỉ cho `DELIVERY_TO_HOTEL`.
- `READY` chỉ cho `CUSTOMER_AT_SERVICE`.
- Transition + event + capacity release/consume + revenue recognition chạy trong một transaction.
- `COMPLETED`: reservation thành `CONSUMED`, insert revenue unique `orderId`.
- `CANCELLED`: `RESERVED → RELEASED` và increment capacity đúng một lần.
- Dùng `version` hoặc conditional status update để hai staff không transition đồng thời.
- Realtime emit chỉ sau commit; API đọc vẫn là nguồn chuẩn.

## 5. Module/API boundaries

### Backend module mới

Create under `services/auth-service/src/modules/marketplace/`:

```text
api/
  admin-marketplace.controller.ts
  service-portal.controller.ts
  guest-marketplace.controller.ts
  hotel-marketplace.controller.ts
application/
  marketplace-admin.service.ts
  service-catalog.service.ts
  marketplace-query.service.ts
  marketplace-order.service.ts
  marketplace-revenue.service.ts
domain/
  marketplace-order-transitions.ts
  schemas/marketplace.schema.ts
infrastructure/
  marketplace.repository.ts
tests/
  marketplace-order.service.spec.ts
  marketplace-isolation.spec.ts
marketplace.module.ts
marketplace-public.ts
```

Không tạo repository/interface một-implementation. Một Prisma repository đủ cho MVP; tách khi file vượt trách nhiệm thực tế.

### API surface

Platform Admin:

```text
POST   /admin/marketplace/categories
PATCH  /admin/marketplace/categories/:categoryId
GET    /admin/marketplace/service-tenants
POST   /admin/marketplace/service-tenants
PATCH  /admin/marketplace/service-tenants/:tenantId
GET    /admin/marketplace/hotel-links?hotelId=...
PUT    /admin/marketplace/hotel-links/:hotelId/:serviceTenantId
DELETE /admin/marketplace/hotel-links/:hotelId/:serviceTenantId   # soft disable
```

Service Portal:

```text
GET    /service-portal/profile
PATCH  /service-portal/profile
GET    /service-portal/categories
GET    /service-portal/services
POST   /service-portal/services
PATCH  /service-portal/services/:serviceId
PATCH  /service-portal/services/:serviceId/availability
GET    /service-portal/orders
GET    /service-portal/orders/:orderId
POST   /service-portal/orders/:orderId/transitions
POST   /service-portal/realtime-ticket
```

Guest:

```text
GET    /guest/marketplace/categories
GET    /guest/marketplace/services?categoryId=&serviceTenantId=&page=&limit=
GET    /guest/marketplace/services/:serviceId
POST   /guest/marketplace/orders
GET    /guest/marketplace/orders
GET    /guest/marketplace/orders/:orderId
```

Guest service results include `distanceMeters: number | null`, calculated from the current Hotel coordinates to the Service profile coordinates. Default ordering: explicit Hotel mapping `sortOrder`, then known `distanceMeters`, then stable `serviceId`; unknown distances last.

Hotel:

```text
GET /hotels/:hotelId/marketplace/orders
GET /hotels/:hotelId/marketplace/orders/:orderId
GET /hotels/:hotelId/marketplace/revenue?from=&to=&serviceTenantId=
```

### Security

- Admin routes: `platform.marketplace.view/manage`.
- Service Portal: tenant scope lấy từ authenticated `TenantUser`; body/query không được override `serviceTenantId`.
- Guest: hotel/stay/session scope lấy từ `GuestSessionGuard`.
- Hotel: `HotelAccessService` tại controller; mọi repository query vẫn chứa `hotelId`.
- Order detail/transition query luôn chứa `orderId + serviceTenantId` hoặc `orderId + hotelId/stayId` theo actor.
- Không dùng wildcard public allowlist; chỉ guest read/order endpoints cần GuestSessionGuard.

## 6. Realtime tối thiểu

Reuse:

- `services/auth-service/src/request-realtime.gateway.ts`
- `services/auth-service/src/request-realtime.emitter.ts`
- ticket/config/socket client hiện hữu.

Bổ sung Service mode/ticket và room:

```text
marketplace:service:{serviceTenantId}
marketplace:hotel:{hotelId}
marketplace:stay:{stayId}
```

Events:

```text
marketplace.order.created
marketplace.order.updated
```

Payload chỉ chứa order summary cần invalidate/upsert; không gửi token/PII thừa. Realtime publish sau transaction commit. Không thêm broker/outbox trong MVP.

## 7. Frontend workspaces

### Platform Admin

Create:

```text
frontends/front-end-vietsage/src/app/(vietsage)/admin/marketplace/page.tsx
frontends/front-end-vietsage/src/app/api/admin/marketplace/**
frontends/front-end-vietsage/src/features/marketplace-admin/**
```

Một màn hình tabs: taxonomy, Service Tenants, Hotel mappings. Reuse internal API client, auth refresh, DataTable, forms hiện hữu.

### Service Portal

Create:

```text
frontends/front-end-vietsage/src/app/(vietsage)/service/**
frontends/front-end-vietsage/src/app/api/service-portal/**
frontends/front-end-vietsage/src/features/service-portal/**
```

Workspace persona `service_partner`; navigation: Tổng quan, Dịch vụ, Đơn hàng, Hồ sơ. Dùng `TenantUser` hiện hữu; không tạo auth stack riêng.

### Guest Marketplace

Replace navigation target, không copy Local Partners components:

```text
frontends/front-end-vietsage/src/app/(vietsage)/g/marketplace/page.tsx
frontends/front-end-vietsage/src/app/(vietsage)/g/marketplace/orders/page.tsx
frontends/front-end-vietsage/src/app/api/guest/marketplace/**
frontends/front-end-vietsage/src/features/marketplace/**
```

Flow mobile-first: category → service item → quantity/note/confirm → order status. Home preview tối đa 3 active services; null/empty/error/retry; keyboard/focus/touch target ≥44px.

### Hotel Workspace

```text
frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/marketplace/**
frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/marketplace/**
```

Shared capability UI: Order monitor + revenue read-only. Không duplicate Owner/Staff business client.

### Data chain bắt buộc

```text
Component → feature hook → query-resource → repository → Next BFF → backend
```

Không giữ access token trong client props. Không raw `fetch` trong component/resource.

## 8. Legacy Local Partners migration/rollback

### Không làm destructive migration

- Giữ bảng/API/code Local Partners trong giai đoạn chạy song song.
- Sau Marketplace acceptance: navigation Guest/Owner/Staff chuyển sang Marketplace.
- Local Partners route trở thành read-only/unlinked; không tạo dữ liệu mới.
- Không tự chuyển row LocalPartner thành Service Tenant vì thiếu account, ownership, catalog, capacity và mapping chuẩn.
- Nếu cần chuyển dữ liệu: Admin tạo Service Tenant trước, sau đó chạy script import idempotent có file mapping được duyệt. Đây là task riêng.

### Rollback

- Rollback application commit để menu quay về Local Partners.
- Giữ bảng Marketplace additive; không drop table trong rollback vận hành.
- Tắt mapping/status thay vì xóa record.
- Migration cleanup legacy chỉ làm ở release riêng sau backup và xác nhận không còn traffic.

## 9. TDD implementation sequence

### Slice 0 — Approval/data gate

Files: plan này, `schema.prisma`, migration history.

1. Chốt semantic “thu hộ”: MVP chỉ accounting revenue, không payment/folio.
2. Chốt taxonomy ban đầu hoặc cho Admin tạo trống.
3. Bật local PostgreSQL; chạy `npm run prisma:status`.
4. Nếu migration state không khớp: dừng schema work; không dùng `db push/reset`.
5. Ghi baseline HEAD + scoped dirty files; không stage 352 unrelated entries.

### Slice 1 — Tenant type + migration

1. RED: test existing tenant defaults `HOTEL`; Service API rejects HOTEL tenant.
2. Add `TenantType`, Marketplace tables/enums/indexes/check constraints review.
3. Create reviewable migration only: `npm run prisma:create--create-only`.
4. Inspect SQL: additive only, no DROP, existing Tenant backfill/default safe.
5. Run `npm run prisma:generate`, `npm run prisma:status`, build.
6. Commit schema/migration only.

### Slice 2 — Admin taxonomy/tenant/mapping

1. RED: only Admin permission can mutate; mapping rejects HOTEL target, duplicate idempotent, disabled mapping hidden.
2. Implement smallest controller/service/repository.
3. Add OpenAPI, BFF, Admin resource/UI.
4. Verify list pagination/index, hotel isolation.
5. Commit.

### Slice 3 — Service Portal catalog

1. RED: tenant derived from auth membership; cross-tenant item ID returns 404; URL/protocol/price/capacity validation.
2. Implement profile/catalog APIs and RBAC permissions.
3. Add workspace persona/routes/BFF/resource/UI.
4. Verify multiple TenantUsers see same Service Tenant data.
5. Commit.

### Slice 4 — Guest discovery

1. RED: guest cannot provide hotel scope; only ACTIVE mapping/profile/item/category; unmapped item 404; pagination bounded; Haversine ranking is stable; missing coordinates sort last and remain null.
2. Implement query API.
3. Replace Guest Local Partners preview/page with Marketplace catalog.
4. Verify 375/768/1440px, loading/empty/error/retry/focus.
5. Commit.

### Slice 5 — Order creation/capacity

1. RED: idempotent retry creates one Order; finite capacity cannot go negative; unmapped/disabled item rejected; price snapshot immutable.
2. Implement one transaction: reserve capacity + order + first event.
3. Add Guest confirm/order history UI.
4. Concurrency test with two requests for last capacity; exactly one succeeds.
5. Commit.

### Slice 6 — Transition state machine

1. RED: every allowed edge passes; invalid edge/mode/cross-tenant fails; cancel releases once; complete recognizes revenue once.
2. Implement pure transition matrix + transactional conditional update/event/capacity/revenue.
3. Add Service Order queue/detail/actions.
4. Add Hotel read-only monitor.
5. Commit.

### Slice 7 — Realtime

1. RED: Service ticket scoped to serviceTenant; guest scoped to stay; hotel scoped to hotel; unauthorized socket rejected.
2. Extend existing gateway/emitter after-commit.
3. Add frontend query invalidation/upsert, 30-second bounded recovery polling only.
4. Verify reconnect and duplicate events idempotent.
5. Commit.

### Slice 8 — Revenue dashboard

1. RED: only COMPLETED contributes; CANCELLED excluded; timezone/date range correct; service/hotel isolation.
2. Aggregate immutable revenue entries; no transaction for reads.
3. Add Hotel cards/table by Service Tenant; clearly label “Ghi nhận thu hộ — chưa đối soát thanh toán”.
4. Commit.

### Slice 9 — Cutover

1. Contract export/type sync.
2. Replace workspace/Guest navigation with Marketplace.
3. Hide Local Partners mutation UI; keep fallback read route during acceptance.
4. Run regression gates.
5. Commit; no push/deploy until explicit approval.

## 10. Tests bắt buộc

Backend focused:

```bash
npm test -- --runInBand src/modules/marketplace/tests/marketplace-order.service.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/marketplace-isolation.spec.ts
npm run build
npm run openapi:export
node scripts/check-service-boundaries.mjs
```

Prisma:

```bash
npm run prisma:generate
npm run prisma:status
```

Frontend:

```bash
npm run sync:api:types
npx tsc --noEmit
npx eslint "src/features/marketplace*" "src/features/service-portal" \
  "src/app/(vietsage)/g/marketplace" "src/app/(vietsage)/service"
npm run build
```

Manual acceptance:

1. Admin creates a Service Tenant; two staff members can access the same Service workspace.
2. Service creates and publishes an item with finite capacity `1`.
3. Admin links the Service to Hotel A; Hotel B cannot discover it.
4. On Hotel and Service forms, test explicit Geolocation success, permission denial, timeout, unavailable API, Google Maps URL parsing, and manual correction.
5. Set Hotel A and two Service coordinates; the nearer mapped Service ranks first and shows distance.
6. Remove one coordinate; that Service stays visible, shows no fake distance, and sorts last.
7. Two Hotel A Guests order the last item concurrently; exactly one succeeds.
8. Service follows the mode-specific state machine; Guest/Hotel receive realtime updates.
9. Cancel releases capacity once; retry does not increment it again.
10. Complete creates exactly one revenue entry and no Folio item/payment.
11. Cross-tenant IDs on Admin/Service/Hotel/Guest endpoints return 403/404.

## 11. Files likely to change

Backend:

```text
services/auth-service/prisma/schema.prisma
services/auth-service/prisma/migrations/<timestamp>_add_marketplace_service_tenant/migration.sql
services/auth-service/src/app.module.ts
services/auth-service/src/common/config/business-permissions.registry.ts
services/auth-service/src/common/config/routes.config.ts
services/auth-service/src/modules/marketplace/**
services/auth-service/src/request-realtime.gateway.ts
services/auth-service/src/request-realtime.emitter.ts
services/auth-service/src/common/openapi/contract-schemas.ts
shared/api-contract/openapi/v1/openapi.json
shared/api-contract/openapi/v1/openapi.yaml
```

Frontend:

```text
frontends/front-end-vietsage/src/features/workspace/config/workspace-registry.ts
frontends/front-end-vietsage/src/features/workspace/types/workspace-registry.ts
frontends/front-end-vietsage/src/features/marketplace/**
frontends/front-end-vietsage/src/features/marketplace-admin/**
frontends/front-end-vietsage/src/features/service-portal/**
frontends/front-end-vietsage/src/app/(vietsage)/admin/marketplace/**
frontends/front-end-vietsage/src/app/(vietsage)/service/**
frontends/front-end-vietsage/src/app/(vietsage)/g/marketplace/**
frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/marketplace/**
frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/marketplace/**
frontends/front-end-vietsage/src/app/api/admin/marketplace/**
frontends/front-end-vietsage/src/app/api/service-portal/**
frontends/front-end-vietsage/src/app/api/guest/marketplace/**
frontends/front-end-vietsage/src/app/api/hotel-ops/hotels/[hotelId]/marketplace/**
frontends/front-end-vietsage/src/generated/openapi/v1.ts
```

## 12. Risks/trade-offs

- **Tenant auth assumptions:** identity code hiện tập trung Hotel. Giải pháp: mở rộng scope từ `TenantUser`, không fork auth.
- **Capacity race:** read-then-write sẽ oversell. Bắt buộc conditional update trong transaction + concurrency test.
- **Money ambiguity:** “thu hộ” chưa đồng nghĩa tiền đã thu. MVP ghi nhận gross completed only; payment/settlement đợt sau.
- **Legacy duplication:** chạy song song ngắn hạn; cutover navigation một lần, không dual-write.
- **Realtime loss:** socket chỉ UX; API + recovery polling là nguồn chuẩn.
- **Straight-line distance:** Haversine is not road distance or travel time. It is sufficient for bounded MVP ordering. Add a route provider only when ETA/road-distance accuracy becomes a product requirement; add PostGIS only when measured scale exceeds the bounded mapped-set scan.
- **Stale/manual coordinates:** Admin/Owner owns coordinate accuracy. Show unknown rather than guessing; add geocoding only after an address-to-coordinate workflow is explicitly required.
- **Migration state:** PostgreSQL previously returned `P1001`; do not create/apply migration until DB state is verified.

## 13. Approval gates

Cần duyệt bốn điểm trước code:

1. `MarketplaceRevenueEntry` chỉ ghi nhận doanh thu Order completed; **không** tự ghi Billing Folio.
2. Capacity reserve tại lúc tạo Order, không chờ Service ACCEPT.
3. Taxonomy do Platform Admin quản lý; không dùng category dịch vụ nội bộ Hotel, không seed runtime.
4. Legacy Local Partners stays read-only/unlinked during cutover; no automatic drop/migration.
5. MVP proximity uses persisted Hotel/Service coordinates plus Haversine; no browser GPS or Maps SDK.

**Status:** `APPROVED — IMPLEMENTATION IN PROGRESS`.

Approval received: 2026-08-09. Antigravity account switch confirmed; execute sequential bounded slices. On any Antigravity stop/error, pause until the user confirms another account switch.
