# Guest Catalog Realtime + Room Message Unread Implementation Plan

> **For Hermes:** Sau khi user duyệt plan: probe Antigravity A/B; Antigravity triển khai một lần theo scope; Hermes kiểm diff, hoàn thiện, chạy gates và review độc lập. Không commit/push/deploy nếu chưa có phê duyệt riêng.

**Goal:** Sau đồng bộ Google Sheet thành công, GuestOS đang mở cập nhật danh mục dịch vụ ngay; khi khách gửi tin nhắn, mục **Tin nhắn phòng** hiển thị tổng số tin chưa đọc theo khách sạn và cập nhật realtime.

**Architecture:** DB là source of truth. Reuse Socket.IO `/request-realtime`; thêm event catalog riêng theo hotel. Unread summary lấy từ backend, quản lý bằng `@dangminhdev04032005/query-resource`; socket chỉ patch/invalidate cache, reconnect refetch. Sidebar chỉ render badge; không tự gọi API, không giữ server state trong Zustand.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Socket.IO, Next.js App Router, TanStack Query, `@dangminhdev04032005/query-resource`, Node/Jest tests.

---

## 1. Hiện trạng đã xác minh

- HEAD: `88fcc8cd51b675c80060dcbbc375a28577a1df66`.
- Không có source diff từ lần Antigravity trước; chỉ có generated `graphify-out/` dirty/untracked.
- Guest catalog tại `frontends/front-end-vietsage/src/app/(vietsage)/g/services/page.tsx:80-120` chỉ reload khi mount, reconnect, hoặc event vòng đời **guest request**. Google Sheet sync không phát event catalog.
- Google Sheet sync commit DB tại `services/auth-service/src/modules/property/infrastructure/imports/google-sheets-service-catalog-sync.service.ts:149-188`; đây là điểm duy nhất được phép phát event thành công.
- Backend message thread đã tính đúng unread DB: `GuestMessagesRepository` đếm `senderType=GUEST AND readAt IS NULL`; `GuestMessagesService.thread()` trả `unreadCount`.
- Tổng unread hiện chỉ được cộng cục bộ trong `room-messages-client.tsx:158-166`; sidebar không có nguồn dữ liệu.
- `VsDashboardSidebar` và mobile nav chỉ render `DashboardNavItem`; chưa hỗ trợ badge.
- Owner realtime manager đã dùng một socket dùng chung theo hotel, fan-out `guest_message.created`; có thể reuse, không tạo socket thứ hai.

## 2. Acceptance criteria

### Catalog guest realtime

1. Owner bấm đồng bộ Sheet; chỉ sau DB commit thành công mới phát `service_catalog.updated`.
2. Event mang tối thiểu `{ hotelId, syncedAt }`; không chứa nội dung Sheet, credential, row lỗi.
3. Guest session chỉ nhận event đúng hotel của session.
4. Guest đang ở `/g/services` reload catalog im lặng; không trắng danh sách, không popup.
5. Item thêm/sửa/ngưng hoạt động phản ánh ngay; selected item bị disable/removed đóng sheet và hiện lỗi tiếng Việt inline/toast hiện hữu.
6. Sync fail/validation fail không phát event; UI guest giữ catalog cũ.
7. Socket reconnect vẫn refetch làm fallback.
8. Cron sync và manual sync cùng phát event sau commit thành công.

### Tin nhắn phòng unread badge

1. Badge là tổng **tin nhắn GUEST chưa đọc** của các stay đang active, đúng hotel.
2. Guest gửi tin khi staff ở bất kỳ trang workspace nào: badge tăng realtime.
3. Staff đang mở đúng thread: message được mark read; badge không tăng hoặc quay về tổng DB đúng.
4. Staff mở thread chưa đọc: badge giảm đúng số đã đọc sau API success; rollback/refetch nếu API fail.
5. Reload/reconnect: số khôi phục từ DB, không từ memory/browser storage.
6. Badge ẩn khi `0`; `1..99`; `99+` khi lớn hơn 99.
7. Desktop badge đặt sau nhãn **Tin nhắn phòng**; mobile badge ở góc icon/nhãn, không che icon.
8. Có `aria-label`, ví dụ `Tin nhắn phòng, 3 tin chưa đọc`; màu đạt contrast.
9. Hotel A không nhận count/event hotel B; user thiếu `hotel.requests.view/manage` không gọi endpoint summary và không thấy nav/badge.

## 3. Thiết kế chi tiết

### 3.1 Event catalog

Mở rộng event port hiện có thay vì tạo bus/module mới:

- `ServiceCatalogUpdatedEventInput = { hotelId: string; syncedAt: string }`.
- `GuestRequestEventPublisher.publishServiceCatalogUpdated(...)`.
- `RequestRealtimeEventPublisher` forward sang `RequestRealtimeEmitter.emitServiceCatalogUpdated(...)`.
- Thêm room `guest-hotel:<hotelId>`; guest socket join room này sau `authenticateGuestToken`.
- Emit `service_catalog.updated` vào guest-hotel room. Owner room không cần nhận vì màn owner đã nhận response sync và tự refresh local.
- Gọi publisher sau `await importService.commit(preview)` thành công. Không emit trong `catch/finally`.

Lưu ý multi-instance: emitter hiện process-local giống các request/message event hiện hữu. Scope này không thêm Redis adapter. `ponytail:` giới hạn realtime theo topology một backend instance hiện tại; khi scale backend nhiều instance, thêm Socket.IO Redis adapter/shared event transport.

### 3.2 Guest catalog refresh

- Mở rộng `GuestRealtimeHandlers`/guest manager/hook với `onServiceCatalogUpdated`.
- `GuestServicesPage` đăng ký handler mới, xác minh event đúng shape, gọi `loadServices({ silent: true })`.
- Giữ request-generation guard để response cũ không ghi đè response mới.
- Không dùng request-event như tín hiệu catalog nữa. Có thể giữ các callback hiện tại nếu chúng phục vụ fallback, nhưng plan ưu tiên xóa reload thừa nếu test chứng minh không cần.
- Không chuyển catalog vào Zustand. Không thêm dependency.

### 3.3 Unread summary backend

Thêm truy vấn aggregate tối thiểu:

- Repository method `countUnreadGuestMessagesForHotel(hotelId)`:
  - `hotelId` đúng scope;
  - `senderType=GUEST`;
  - `readAt=null`;
  - thread stay `ACTIVE`, `checkedOutAt=null`.
- Service method kiểm `HotelAccessService.assertHotelAccess(...)` rồi trả `{ unreadCount }`.
- Controller endpoint: `GET /hotels/:hotelId/messages/unread-summary`.
- Permission: `hotel.requests.view` (đọc badge); `@ApiDescript`, `@SuccessMessage`, OpenAPI response schema.
- Đặt static route trước `:threadId` hoặc dùng tên route không xung đột; regression test route metadata/bootstrap.

### 3.4 Unread resource + shell

Tạo lớp đúng architecture:

1. Repository frontend gọi BFF summary bằng `requestInternalApi`.
2. Resource `hotel-message-unread-resource.ts` với scope `{ hotelId }`, query `summary`; stable generated key.
3. Hook/component client `HotelMessageUnreadBadgeProvider`:
   - query summary khi có hotelId và nav chứa `room-messages`;
   - subscribe bằng owner manager dùng chung;
   - `guest_message.created`: nếu sender `GUEST`, tăng count bằng resource key hoặc invalidate/refetch khi payload không hợp lệ;
   - reconnect: invalidate exact summary key;
   - mark-read: trang message cập nhật/invalidate cùng exact key sau API success.
4. `WorkspaceShell` nhận `hotelId?: string`; hotel layout truyền hotelId. Owner hotel layout cũng truyền hotelId nếu nav có Tin nhắn phòng. Global/admin shell không query.
5. Không mở socket mới: nhiều subscriber cùng hotel reuse `ownerRequestRealtimeManager` hiện có.

### 3.5 Navigation rendering

- Không đưa runtime badge vào registry tĩnh.
- Mở rộng presentation prop riêng: `badgeByNavKey?: Readonly<Record<string, number>>` hoặc shell-owned render data.
- `VsDashboardSidebar` và mobile nav render badge cho key `room-messages`.
- Badge không thay label, href, permission filtering hay active-state logic.
- Cập nhật screenshot/component contract test cho 0, 3, 120.

## 4. TDD task sequence

### Task 1: RED — catalog event contract/backend emit

**Tests:**
- Modify: `services/auth-service/src/modules/property/tests/infrastructure/imports/google-sheets-service-catalog-sync.service.spec.ts`
- Modify/Create scoped tests for:
  - `services/auth-service/src/shared/events/request-realtime-event.publisher.ts`
  - `services/auth-service/src/request-realtime.emitter.ts`

**Assertions:**
- successful commit publishes once with hotelId;
- failed commit publishes zero;
- cron/manual path both use same post-commit behavior;
- emitter targets guest-hotel room only.

**Expected RED:** publisher method/event absent.

### Task 2: GREEN — backend catalog event

**Modify:**
- `services/auth-service/src/shared/events/guest-request-events.port.ts`
- `services/auth-service/src/shared/events/request-realtime-event.publisher.ts`
- `services/auth-service/src/request-realtime.emitter.ts`
- `services/auth-service/src/request-realtime.gateway.ts`
- `services/auth-service/src/modules/property/infrastructure/imports/google-sheets-service-catalog-sync.service.ts`

**Verify:** targeted Jest tests; backend build.

### Task 3: RED/GREEN — guest socket forwarding + catalog reload

**Tests:**
- Modify/Create `frontends/front-end-vietsage/src/features/request-realtime/guest-connection-manager.test.ts`
- Create focused source/component test around guest catalog refresh handler.

**Modify:**
- `frontends/front-end-vietsage/src/features/request-realtime/guest-connection-manager.ts`
- `frontends/front-end-vietsage/src/features/request-realtime/use-guest-request-realtime.ts`
- `frontends/front-end-vietsage/src/app/(vietsage)/g/services/page.tsx`

**Assertions:** event forwards raw once; wrong/duplicate lifecycle does not cause stale overwrite; reconnect refresh remains.

### Task 4: RED — unread DB aggregate and authorization

**Tests:**
- Modify/Create repository/service tests under `services/auth-service/src/modules/guest-operations/tests/`.
- Cover active hotel scope, read messages excluded, staff messages excluded, checked-out stay excluded, cross-hotel excluded.
- Controller metadata/permission test includes summary route.

**Expected RED:** aggregate/service/route absent.

### Task 5: GREEN — unread endpoint + contract

**Modify:**
- `services/auth-service/src/modules/guest-operations/infrastructure/repositories/guest-messages.repository.ts`
- `services/auth-service/src/modules/guest-operations/application/guest-messages.service.ts`
- `services/auth-service/src/modules/guest-operations/api/hotel-requests.controller.ts`
- contract schema/OpenAPI generator source; regenerate:
  - `shared/api-contract/openapi/v1/openapi.json`
  - `shared/api-contract/openapi/v1/openapi.yaml`
  - `shared/api-contract/docs/CONTRACT_CHANGES.md`

**Verify:** targeted backend tests; OpenAPI generation; route permission sync.

### Task 6: RED/GREEN — unread resource and realtime coordination

**Create likely:**
- `frontends/front-end-vietsage/src/features/hotel-ops/repositories/hotel-message-unread-repository.ts`
- `frontends/front-end-vietsage/src/features/hotel-ops/resources/hotel-message-unread-resource.ts`
- `frontends/front-end-vietsage/src/features/hotel-ops/hooks/use-hotel-message-unread.ts`
- focused `.test.ts` files.

**Modify:**
- `frontends/front-end-vietsage/src/features/request-realtime/owner-connection-manager.test.ts`
- `frontends/front-end-vietsage/src/features/hotel-ops/resources/hotel-messages-resource.ts` only if declarative cross-operation helpers are needed.
- `room-messages-client.tsx` to invalidate/update unread summary after successful mark-read and reconnect.

**Assertions:** generated key used everywhere; one shared socket; GUEST increments; STAFF does not; reconnect refetch; mark-read success decreases/refetches; failure restores truth.

### Task 7: RED/GREEN — sidebar/mobile badge

**Modify:**
- `frontends/front-end-vietsage/src/features/workspace/components/workspace-shell.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/_components/vs-dashboard-sidebar.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/layout.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/owner/_components/owner-shell.tsx`
- owner hotel layout if required.

**Tests:** rendering/utility tests for hidden zero, `3`, `99+`, aria label, desktop/mobile parity, permission-hidden nav.

### Task 8: Runtime E2E

Use ignored local UAT credentials only; never echo/screenshot secrets.

1. Open GuestOS services and owner Sheet sync in two sessions.
2. Add/rename/disable one unique catalog marker.
3. Sync; verify GuestOS changes without reload.
4. Cause sync validation error; verify GuestOS stays unchanged.
5. Guest sends unique message marker while staff is outside messages page.
6. Verify **Tin nhắn phòng (1)**/badge appears immediately.
7. Open thread; verify message appears, read API succeeds, badge returns to 0.
8. Send two messages from another room; verify aggregate 2 and hotel isolation.
9. Disconnect/reconnect socket; verify DB-derived count restored.

If authenticated two-actor setup is unavailable, mark E2E BLOCKED; do not claim static tests as E2E.

## 5. Validation gates

Backend:

```bash
cd services/auth-service
npm test -- --runInBand <targeted specs>
npm run build
npm test -- --runInBand
```

Frontend:

```bash
cd frontends/front-end-vietsage
node --test --experimental-strip-types <targeted tests>
npx eslint <changed files>
npx tsc --noEmit --pretty false --incremental false
npm run build
```

Repository/contracts:

```bash
git diff --check -- <scoped source/test/docs paths>
python scripts/verify-production-migration.py
graphify update .
npx repomix@latest . --include "<final bounded files>" --compress --style xml --output graphify-out/repomix/guest-catalog-room-message-final.xml
```

Then independent fail-closed review: security, hotel isolation, event ordering, duplicate event handling, query-resource keys, unread reconciliation, accessibility.

## 6. Risks and mitigations

- **Event emitted before commit:** emit only after `importService.commit` resolves.
- **Missed event/offline guest:** reconnect refetch.
- **Duplicate socket events:** stable message ID dedupe; DB refetch reconciles.
- **Unread overcount with open thread:** mark-read success invalidates summary; no blind decrement without reconciliation.
- **Infinite list only contains first 30 threads:** badge uses dedicated DB aggregate, never sum loaded pages.
- **Cross-hotel leak:** backend authorization + hotel-scoped room + hotel-scoped query key.
- **Multiple subscribers:** owner connection manager already shares one socket per hotel.
- **Multi-instance backend:** current Socket.IO process-local limit remains; Redis/shared adapter is separate scale task.
- **Generated artifacts:** never stage existing unrelated `graphify-out/`; final source commit only scoped files/docs/contracts.

## 7. Deliberately skipped

- No new dependency.
- No polling across entire workspace.
- No Zustand/localStorage unread mirror.
- No notification center/general badge framework.
- No Redis adapter in this scope.
- No redesign sidebar; only accessible compact badge.

## 8. Approval boundary

Plan only. No code changed. After approval:

1. Probe Antigravity A/B quota.
2. Invoke Antigravity once with this exact bounded plan; one writer; no commit/push/deploy.
3. Hermes inspects real diff, fills gaps, runs all gates + independent review.
4. Present exact results; request separate commit/push/deploy approval.
