# Dịch vụ & địa điểm lân cận — kế hoạch phê duyệt

> **Trạng thái:** WAITING APPROVAL — tuyệt đối không sửa code, migration, package, lockfile, deploy hoặc push trước phê duyệt triển khai riêng.
>
> **Repo:** `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`
>
> **Baseline đã kiểm tra:** `fc4b5142cecee26052648c4bba2db15c244f8db0`

## 1. Phát hiện quan trọng

Ý tưởng không còn ở trạng thái “module mới”: commit HEAD `fc4b514 feat(local-partners)` đã thêm và commit một implementation `local-partners` gồm backend, Prisma migration, OpenAPI, Guest OS, staff UI và navigation.

Implementation hiện tại được coi là **baseline chưa được phê duyệt để triển khai**, không phải thiết kế đã chốt. Không rewrite history; không deploy baseline này. Sau phê duyệt, sửa tối thiểu trên baseline hiện có.

Các vấn đề chặn phê duyệt triển khai:

1. Guest API `guest/local-partners.*` đang public bằng regex rộng, không dùng `GuestSessionGuard`; client gửi `hotelId`, `stayId`, tên khách, phòng, điện thoại từ browser. Đây là lỗi trust-boundary và tenant/privacy blocker.
2. Controller quản trị kiểm tra capability nhưng nhiều thao tác chỉ tra `partnerId`/`offerId`/`bookingRequestId`, không chứng minh resource thuộc `hotelId` trong URL. Cross-hotel IDOR blocker.
3. Distance filter dùng `(distanceMeters ?? 0) <= max`, khiến đối tác thiếu khoảng cách luôn lọt vào mọi bán kính. Haversine tồn tại nhưng chưa nối với tọa độ khách sạn; `Hotel` hiện không có tọa độ/address canonical.
4. Frontend gọi backend trực tiếp bằng `fetch`, nhận `accessToken` trong Client Component, dùng `any`, không kiểm tra `res.ok`, không theo repository → resource → query hook và BFF/session boundary hiện hành.
5. Module đã vượt nhu cầu gốc: booking request, claim offer, interaction analytics/logging. Chưa có yêu cầu sản phẩm rõ; tăng dữ liệu cá nhân, lifecycle, audit và vận hành.
6. Guest Home chưa có Nearby widget. Owner chưa có route riêng; owner navigation đang trỏ chung `/hotels/{hotelId}/partners`, khác bản plan gốc.
7. UI Nearby dùng dark slate riêng, hardcoded tiếng Việt/material icon text, card click bằng `div`, tap target nhỏ; chưa đồng bộ Guest OS hiện tại, i18n, keyboard/focus, inline error/retry.
8. Test hiện tại chủ yếu mock service happy path; thiếu controller/guard, cross-hotel, guest-session, URL validation, missing-distance và frontend interaction tests.
9. Rollback “bỏ module khỏi AppModule” không rollback migration đã áp dụng và có thể để lại route/menu/contracts lệch nhau.

## 2. Mục tiêu sản phẩm đã chốt cho MVP

Cho khách đang có Guest OS session xem danh bạ dịch vụ/địa điểm do khách sạn tuyển chọn, ưu tiên gần khách sạn; cho owner/manager/front desk quản lý danh bạ đúng phạm vi khách sạn.

MVP chỉ cần:

- Danh mục.
- Đối tác/địa điểm theo khách sạn.
- Trạng thái hiển thị, nổi bật, thứ tự.
- Tên, mô tả, địa chỉ, ảnh, giờ hoạt động.
- Điện thoại, website/Zalo, link chỉ đường đã validate.
- Khoảng cách số do nhân viên nhập (`distanceMeters`) hoặc tọa độ đối tác để chuẩn bị tính sau.
- Guest Home preview tối đa 3 mục nổi bật + “Xem tất cả”.
- Trang Guest Nearby đầy đủ.
- Trang quản trị dùng chung cho owner/staff, hành động hiện theo capability.

## 3. YAGNI — bỏ khỏi MVP

Không triển khai/không expose trong MVP:

- GPS vị trí khách; Nearby tính theo khách sạn, không xin location permission.
- Map SDK, geocoding provider, route-time API.
- Claim offer, mã giảm giá tự sinh.
- Booking request qua lễ tân.
- Interaction log/analytics click.
- Tự động ghi `Billing Folio`.
- Search server-side khi danh sách còn nhỏ; lọc danh mục + danh sách bounded đủ dùng. Chỉ thêm search khi dữ liệu thực tế chứng minh cần.
- Hard delete trong UI. MVP dùng `ACTIVE`/`DISABLED`; xóa dữ liệu cần yêu cầu riêng.

**Migration đã tồn tại:** không tự drop model/bảng. Sau phê duyệt phải kiểm tra migration đã áp dụng ở local/UAT hay chưa:

- Chưa áp dụng ở bất kỳ DB dùng chung nào: có thể thu gọn migration/schema trước deploy.
- Đã áp dụng: giữ schema additive, ngừng expose phần ngoài MVP; cleanup bằng migration riêng sau backup và phê duyệt riêng.

## 4. Kiến trúc tối thiểu

### Backend boundary

Giữ `LocalPartnersModule` trong modular monolith. Không tách microservice, queue, cache, provider adapter.

- Module sở hữu bảng Local Partner.
- Tái sử dụng `HotelAccessService` qua `property-public.ts` cho owner/staff authorization.
- Tái sử dụng `GuestSessionGuard` và session context qua `guest-operations-public.ts` cho Guest API.
- Guest không gửi/không quyết định `hotelId`, `stayId`, phòng hoặc identity; backend suy ra từ guest session.
- Mọi read/write quản trị truy vấn bằng khóa kép/resource scope: `hotelId + resourceId`.
- List endpoint bounded; MVP mặc định 50, max 100. Không pagination UI phức tạp trước nhu cầu.
- Zod `parseWithZod` tại mọi param/query/body boundary.
- URL chỉ nhận `http:`/`https:`; phone giới hạn định dạng/độ dài; latitude `[-90,90]`, longitude `[-180,180]`; cặp tọa độ phải cùng có hoặc cùng thiếu.
- Offers chỉ giữ nếu sản phẩm xác nhận cần trong MVP; nếu giữ, chỉ text offer đang active/đúng validity window, không claim lifecycle.

### Distance semantics

Không lưu chuỗi tự do để tính/sort.

- `distanceMeters: Int?` là khoảng cách hiển thị/sort thủ công trong MVP.
- Nếu đủ tọa độ hotel + partner ở phase sau, backend tính Haversine; không ghi đè khoảng cách thủ công nếu chưa có quy tắc provenance.
- Thiếu distance: không hiện “Gần khách sạn”, không lọt vào filter bán kính; xếp sau mục có khoảng cách bằng `isFeatured`, `sortOrder`.
- Hiển thị locale-aware: `< 1 km`, `1,2 km`; không hiển thị mét giả.
- Hotel hiện chưa có canonical coordinates. Không thêm field vào `Hotel` trong MVP trừ khi duyệt riêng; dùng `distanceMeters` nhập thủ công.

### Frontend boundary

Tạo đúng feature shape cần dùng, không thêm folder rỗng:

`types` → `repositories` → `resources` → `queries/hooks` → `components`.

- Dùng `@dangminhdev04032005/query-resource` đã cài.
- Guest repository gọi BFF/session-safe route hoặc Guest API qua existing Guest OS transport; không raw backend `fetch` trong component.
- Staff/owner dùng BFF route handlers; không truyền access token vào Client Component.
- Route page mỏng; một management component dùng chung cho owner/staff.
- Frontend types lấy từ generated OpenAPI hoặc wrapper hẹp; không `any`.

## 5. API contract đề xuất

### Guest — bắt buộc `GuestSessionGuard`

- `GET /guest/local-partners/categories`
- `GET /guest/local-partners?categoryId=&featured=&limit=`
- `GET /guest/local-partners/:partnerId`

Không có `hotelId`/`stayId` trong guest URL/body. Backend suy ra hotel từ guest session; chỉ trả partner `ACTIVE`, category active, đúng hotel.

### Owner/staff — JWT + capability + hotel access

- `GET /hotels/:hotelId/local-partners`
- `GET /hotels/:hotelId/local-partners/categories`
- `POST /hotels/:hotelId/local-partners`
- `PATCH /hotels/:hotelId/local-partners/:partnerId`
- `PATCH /hotels/:hotelId/local-partners/:partnerId/status`

Capability:

- View: `hotel.local-partners.view` hoặc manage.
- Write/status: `hotel.local-partners.manage`.

Không cần PUT, DELETE, analytics, booking, interactions trong MVP.

## 6. UX Pro-Max acceptance

### Guest Home widget

File compose: `frontends/front-end-vietsage/src/app/(vietsage)/g/home/page.tsx`.

Feature component riêng trong `src/features/local-partners/components/`; page chỉ compose.

- Chỉ load khi guest session + hotel context hợp lệ.
- Tối đa 3 featured/nearest entries; không biến Home thành full listing.
- Skeleton giữ kích thước; lỗi widget không phá Home.
- Empty state ngắn; không hiện CTA chết.
- CTA “Khám phá xung quanh” deep-link `/g/nearby`.

### Guest Nearby page

Giữ route hiện có: `src/app/(vietsage)/g/nearby/page.tsx`.

- Đồng bộ light surface/tokens/typography hiện tại của Guest OS; không dark theme riêng.
- Card semantic `<article>` + link/button thật; keyboard Enter/Space; visible focus.
- Touch target tối thiểu 44×44 px; không phụ thuộc hover/màu.
- Loading, empty, inline error + retry; không chỉ `console.error`.
- Category filter có accessible selected state; search bỏ khỏi MVP.
- Ảnh khai báo kích thước/aspect ratio, lazy load; alt đúng nghĩa.
- Một primary action/card. Chi tiết cung cấp `Gọi`, `Chỉ đường`, `Website/Zalo` nếu có; link ngoài dùng `noopener noreferrer` và nhãn rõ.
- Hiển thị disclaimer: dịch vụ do bên thứ ba cung cấp; thanh toán trực tiếp, không tự ghi Folio.
- Copy vào feature i18n; tối thiểu vi/en theo Guest OS hiện hữu.

### Owner/staff management

Giữ một route thực tế `/hotels/{hotelId}/partners` cho cả owner/staff để tránh component/page trùng lặp. Navigation owner/staff cùng trỏ route này là chủ ý.

- View-only role không thấy nút tạo/sửa/bật-tắt.
- Form dùng visible labels, helper text; lỗi tiếng Việt ngay dưới field; focus first invalid field.
- Native/select cho category; không nhập raw ID.
- Không hard delete.
- Confirm trước disable; success/error inline hoặc toast hỗ trợ, không alert popup.
- Responsive 375/768/1440; không horizontal overflow; bảng chuyển card/list hợp lý trên mobile.

## 7. Kế hoạch triển khai sau phê duyệt — TDD theo lát dọc

### Task 0 — Đóng băng baseline và xác định migration state

**Không sửa code trước khi hoàn thành gate này.**

1. Ghi HEAD + scoped status; bảo toàn dirty work ngoài module.
2. Chạy `npx prisma migrate status` trên DB local được phép.
3. Xác nhận migration `20260810000000_add_local_partners_module` đã áp dụng ở local/UAT nào; không chạm production.
4. Chốt giữ hay thu gọn offers/booking/log models dựa trên kết quả và scope MVP.

### Task 1 — Guest session + tenant isolation

**Test RED trước:**

- Guest không session bị từ chối.
- Guest session hotel A không đọc partner hotel B dù đoán ID.
- Guest không truyền được hotel/stay identity.
- Disabled partner/category không xuất hiện.

**GREEN tối thiểu:** import `GuestOperationsModule`, dùng `GuestSessionGuard`, đổi Guest API sang session-derived hotel scope, thu hẹp public matcher.

**Files dự kiến:**

- `services/auth-service/src/modules/local-partners/local-partners.module.ts`
- `services/auth-service/src/modules/local-partners/api/guest-local-partners.controller.ts`
- `services/auth-service/src/modules/local-partners/application/guest-local-partners.service.ts`
- `services/auth-service/src/common/config/routes.config.ts`
- `services/auth-service/src/modules/local-partners/tests/*`

### Task 2 — Owner/staff resource scoping

**Test RED trước:** mọi get/update/status/offer request với URL hotel A + resource hotel B phải 404/403, không mutate.

**GREEN tối thiểu:** dùng `HotelAccessService`; repository/service nhận `hotelId` trong mọi resource operation; không lookup/update theo ID đơn.

**Files dự kiến:**

- `services/auth-service/src/modules/local-partners/local-partners.module.ts`
- `services/auth-service/src/modules/local-partners/api/local-partners.controller.ts`
- `services/auth-service/src/modules/local-partners/application/local-partners.service.ts`
- `services/auth-service/src/modules/local-partners/infrastructure/local-partners.repository.ts`
- `services/auth-service/src/modules/local-partners/tests/*`

### Task 3 — Contract/input/distance correctness

**Test RED trước:** URL scheme xấu, tọa độ ngoài range, một nửa cặp tọa độ, negative distance, invalid date range, missing distance filter behavior, expired offer visibility.

**GREEN tối thiểu:** Zod refinements; typed inputs thay `any`; distance null semantics; bounded list; OpenAPI response schemas.

**Files dự kiến:**

- `services/auth-service/src/modules/local-partners/domain/schemas/local-partners.schema.ts`
- `services/auth-service/src/modules/local-partners/infrastructure/local-partners.repository.ts`
- `services/auth-service/src/common/openapi/contract-schemas.ts`
- `services/auth-service/prisma/schema.prisma` và migration chỉ khi Task 0 cho phép.
- `shared/api-contract/openapi/v1/openapi.{json,yaml}` generated.

### Task 4 — Frontend transport chuẩn, không token trong client

**Test RED trước:** repository error mapping, stable resource keys/scope, cache invalidation; BFF không forward hotel ngoài session scope.

**GREEN tối thiểu:** thay raw client bằng repository/resource/query hooks; BFF owner/staff; guest transport session-safe; generated contract sync.

**Files dự kiến:**

- Xóa/thay `frontends/front-end-vietsage/src/features/local-partners/service/local-partners.client.ts`.
- Tạo tối thiểu:
  - `src/features/local-partners/repositories/local-partners-repository.ts`
  - `src/features/local-partners/resources/local-partners-resource.ts`
  - `src/features/local-partners/queries/use-local-partners.ts`
- `src/app/api/guest/local-partners/**`
- `src/app/api/hotel-ops/hotels/[hotelId]/local-partners/**`
- `src/features/local-partners/types/local-partners-contract.ts`

### Task 5 — Guest UI + Home widget

**Test RED trước:** loading/error/retry/empty, preview giới hạn 3, disabled/missing-distance copy, keyboard-open detail, external-link safety.

**GREEN tối thiểu:** đồng bộ Guest OS style, i18n, semantic controls; thêm widget Home; giữ `/g/nearby`.

**Files dự kiến:**

- `frontends/front-end-vietsage/src/app/(vietsage)/g/home/page.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/g/nearby/page.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/components/guest-local-partners.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/components/partner-detail-modal.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/components/guest-nearby-preview.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/i18n/*`

### Task 6 — Management UI + navigation

**Test RED trước:** view-only không render mutation controls; manage role render controls; inline validation; disable confirmation; owner active-nav fallback.

**GREEN tối thiểu:** một shared management component; bỏ hard delete; route/page mỏng; giữ active-session fallback capability trong registry.

**Files dự kiến:**

- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/partners/page.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/components/staff-local-partners-client.tsx`
- `frontends/front-end-vietsage/src/features/local-partners/components/partner-form-modal.tsx`
- `frontends/front-end-vietsage/src/features/workspace/config/workspace-registry.ts`

### Task 7 — Contract closure, review, context refresh

1. Backend OpenAPI export.
2. Frontend generated type sync.
3. Verify backend → BFF → repository → resource → hook → UI callers.
4. Independent security/code review; fix blocker only.
5. `graphify update .`; regenerate bounded Repomix packs cho backend module + frontend feature.
6. Commit theo lát nhỏ. Không push/deploy nếu chưa có phê duyệt riêng.

## 8. Verification gates

### Database

```bash
cd services/auth-service
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Không chạy `migrate reset`, `db push`, drop hoặc deploy migration nếu chưa duyệt DB target.

### Backend focused

```bash
cd services/auth-service
npm test -- --runInBand src/modules/local-partners/tests
node scripts/check-service-boundaries.mjs
npm run build
npm run openapi:export
```

Bắt buộc có test:

- Guest session required.
- Hotel A/B isolation cho list/detail/update/status.
- Disabled/inactive/expired filtering.
- Missing distance không lọt radius filter.
- URL/coordinate/distance validation.
- Booking/claim/interaction endpoints không tồn tại nếu bị loại khỏi MVP.

### Frontend focused

```bash
cd frontends/front-end-vietsage
pnpm run sync:api:types
npx tsc --noEmit
npx eslint "src/features/local-partners" "src/app/(vietsage)/g/home/page.tsx" "src/app/(vietsage)/g/nearby/page.tsx" "src/app/(vietsage)/hotels/[hotelId]/partners/page.tsx" "src/features/workspace/config/workspace-registry.ts"
```

Manual/browser acceptance:

- 375, 768, 1440 px; light/dark nếu shell hỗ trợ.
- Keyboard-only, visible focus, modal focus trap/restore, Escape close.
- Touch target ≥44 px; contrast ≥4.5:1; reduced motion.
- Slow/failing network: skeleton, inline error + retry; Home vẫn dùng được.
- Guest không có session; owner/staff sai hotel; role view-only/manage.
- External URL mở an toàn; không javascript/data scheme.
- Billing Folio không đổi, không charge tự động.

### Regression

```bash
cd services/auth-service
npm test -- --runInBand

cd ../../frontends/front-end-vietsage
npm run build
```

Chỉ chạy full gates sau focused gates xanh. Không sửa unrelated failures trong cùng scope; ghi baseline và báo riêng.

## 9. Rollback an toàn

1. Trước cutover: feature chưa deploy; rollback bằng không phát hành commit/image.
2. Sau cutover: ẩn navigation/Home widget và chặn route ở app; rollback app về image trước.
3. Giữ bảng additive; không drop dữ liệu trong rollback khẩn cấp.
4. Migration đã apply không được “rollback” chỉ bằng xóa `LocalPartnersModule`.
5. Cleanup schema cần backup + migration riêng + phê duyệt riêng.
6. Xác minh Guest Home, workspace navigation, Guest Services và Billing Folio sau rollback.

## 10. Không thay đổi

- `Hotel`, `GuestStay`, catalog dịch vụ nội bộ hiện có, trừ khi Task 0 dẫn tới phê duyệt schema riêng.
- Billing/Folio/payment flow.
- Package dependencies/package.json/lockfile.
- Production/VPS/deploy.
- Secrets.
- Dirty work ngoài scope.

## 11. Approval gate

Phê duyệt plan chỉ cho phép bắt đầu Task 0–7 trên working tree local. Commit code theo lát được phép; **push, migration target, deploy/cutover vẫn cần phê duyệt riêng**.

Lệnh chốt đề xuất:

`PHÊ DUYỆT PLAN LOCAL PARTNERS MVP — triển khai local theo TDD; không push/deploy/migrate DB dùng chung.`
