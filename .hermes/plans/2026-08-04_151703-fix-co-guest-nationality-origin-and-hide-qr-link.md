# Sửa Quốc tịch, Quê quán người ở cùng và ẩn link QR — Implementation Plan

> **For Hermes:** Thực hiện tuần tự theo TDD; một writer; không mở rộng ngoài scope này.

**Goal:** Khách đại diện và người ở cùng quét CCCD hoặc nhập tay đều lưu/hiển thị/in được Quốc tịch và Quê quán; màn QR chỉ hiện QR, không hiện URL bên dưới.

**Architecture:** Tái sử dụng hai field đã tồn tại xuyên suốt hệ thống: `nationality` và `residencePlace`. Sửa điểm rơi dữ liệu đang hỏng tại BFF lễ tân, bổ sung hai input vào form hiện hữu, xóa đúng đoạn render URL dưới QR. Không thêm bảng, cột, endpoint, dependency hoặc abstraction mới.

**Tech Stack:** Next.js/React/TypeScript, Zod BFF validation, NestJS/Prisma hiện hữu, Node test/Jest hiện hữu.

---

## Bối cảnh và root cause đã xác minh

1. Commit hiện tại `e6637f3` đã có:
   - DB `GuestStayOccupant.nationality`, `GuestStayOccupant.residencePlace`.
   - migration `20260804150000_add_occupant_nationality_residence`.
   - backend Zod/repository/response mapping.
   - scanner map CCCD vào `occupants[].nationality/residencePlace`.
2. Form cả khách đại diện và người ở cùng hiện không render Quốc tịch/Quê quán; lễ tân không thể nhập tay dù state và scanner đã có dữ liệu.
3. BFF lễ tân `src/app/api/hotel-ops/hotels/[hotelId]/stays/route.ts` dùng `occupantSchema` thiếu hai field. Zod mặc định strip key lạ, nên dữ liệu scanner đã có ở frontend vẫn bị loại trước khi gọi backend.
4. BFF owner đã nhận hai field; backend đã lưu được. Không cần migration/schema mới.
5. URL dưới QR nằm tại `owner-rooms-client.tsx:1572-1574`; QR vẫn cần URL nội bộ làm `value`, chỉ bỏ phần `<p>` hiển thị URL.

## Acceptance criteria

- Mọi slot khách có hai ô tùy chọn: **Quốc tịch**, **Quê quán**.
- Quét CCCD có dữ liệu hợp lệ: tự điền đúng slot đang chọn; lễ tân sửa tay được trước submit.
- CCCD thiếu/rỗng field: không ghi đè dữ liệu lễ tân đã nhập bằng giá trị rỗng.
- Submit qua luồng lễ tân giữ nguyên `occupants[].nationality/residencePlace` đến backend và DB.
- Chi tiết lưu trú + danh sách in hiển thị dữ liệu; thiếu dữ liệu giữ `chưa có`.
- Popup QR chỉ hiện QR; không hiện URL/link dạng chữ bên dưới.
- Không đổi QR payload, lifecycle, scan behavior, API path, package/lockfile.

---

### Task 1: Khóa regression tại UI và BFF

**Objective:** Tạo check nhỏ thất bại với source hiện tại, chứng minh đủ hai lỗi.

**Files:**
- Modify test: `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace-layout.test.ts`
- Create test only nếu route chưa có harness phù hợp: `frontends/front-end-vietsage/src/app/api/hotel-ops/hotels/[hotelId]/stays/route.test.ts`

**Steps:**

1. Thêm assertion cả form khách đại diện và người ở cùng có label/input cho `nationality` và `residencePlace`.
2. Thêm assertion BFF `occupantSchema` chấp nhận, giữ hai giá trị sau parse; ưu tiên export helper/schema tối thiểu chỉ khi test trực tiếp cần, không tạo module mới.
3. Thêm assertion QR modal không render URL text dưới `BrandedRoomQr`; QR `value={getGuestQrUrl(...)}` vẫn tồn tại.
4. Chạy test, kỳ vọng **FAIL** trước fix:

```bash
node --test src/features/local-biometric/components/check-in-workspace-layout.test.ts
```

Chạy route test bằng command test hiện hữu của frontend nếu tạo file; không thêm framework.

---

### Task 2: Sửa đúng seam BFF lễ tân

**Objective:** Ngăn Zod strip dữ liệu Quốc tịch/Quê quán của người ở cùng.

**Files:**
- Modify: `frontends/front-end-vietsage/src/app/api/hotel-ops/hotels/[hotelId]/stays/route.ts:13-20`

**Steps:**

1. Thêm vào `occupantSchema` hiện hữu:

```ts
nationality: z.string().trim().max(80).optional(),
residencePlace: z.string().trim().max(500).optional(),
```

2. Giữ tên/giới hạn đồng nhất backend và BFF owner; không thêm mapper/helper.
3. Chạy regression route test; kỳ vọng **PASS**.

---

### Task 3: Thêm nhập tay, giữ auto-fill an toàn

**Objective:** Lễ tân nhập/sửa Quốc tịch và Quê quán cho đúng slot khách.

**Files:**
- Modify: `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace.tsx:283-324`
- Existing type, no expected change: `frontends/front-end-vietsage/src/features/local-biometric/types/check-in-workspace.ts`

**Steps:**

1. Trong nhánh khách đại diện, thêm hai input native dùng `inputClass`:
   - `Quốc tịch` → `fields.guestNationality`.
   - `Quê quán` → `fields.guestResidencePlace`.
2. Trong nhánh `activeGuestIndex > 0`, thêm hai input tương ứng qua `handleOccupantChange(index, "nationality" | "residencePlace", value)`.
3. Giữ cả hai tùy chọn; placeholder tiếng Việt; `id/htmlFor` duy nhất theo slot.
4. Điều chỉnh `handleCapture` theo merge tối thiểu cho cả đại diện và người ở cùng: chỉ ghi đè mỗi field khi scanner trả chuỗi hợp lệ/non-empty; nếu scanner thiếu field, giữ giá trị nhập tay hiện tại.
5. Không thêm state, component, validation library mới.
6. Chạy UI regression; kỳ vọng **PASS**.

---

### Task 4: Củng cố persistence regression

**Objective:** Chứng minh cả Quốc tịch/Quê quán của co-guest được backend nhận và đưa vào nested DB create.

**Files:**
- Modify: `services/auth-service/src/modules/property/tests/rooms.guest-identity.spec.ts:129-166`
- Production code chỉ sửa nếu test lộ lỗi thật; hiện dự kiến không sửa backend.

**Steps:**

1. Mở rộng test `persists the primary guest and every co-guest...` với:

```ts
{
  fullName: "Tran Thi B",
  identityNumber: "034205005952",
  nationality: "Việt Nam",
  residencePlace: "Hải Dương",
}
```

2. Assert nested create giữ nguyên hai field.
3. Chạy targeted Jest:

```bash
npm test -- --runInBand src/modules/property/tests/rooms.guest-identity.spec.ts
```

Kỳ vọng: **PASS**.

---

### Task 5: Chỉ hiện QR, ẩn URL chữ

**Objective:** Giữ QR hoạt động; bỏ phần link bên dưới.

**Files:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx:1561-1575`

**Steps:**

1. Giữ `getGuestQrUrl(...)` làm điều kiện và `BrandedRoomQr.value`.
2. Xóa duy nhất `<p>` render `{getGuestQrUrl(selectedQrRoom, clientOrigin)}`.
3. Không xóa `clientOrigin`, `getGuestQrUrl`, download/print QR vì QR payload vẫn cần chúng.
4. Chạy regression QR; kỳ vọng **PASS**.

---

### Task 6: Validation, docs, context sync

**Objective:** Xác minh end-to-end contract và cập nhật context dự án.

**Files:**
- Modify: `frontends/front-end-vietsage/docs/PLANS.md`
- Modify backend plan chỉ nếu backend test/production code thay đổi: `services/docs/PLANS.md`
- Refresh generated context: `graphify-out/**`
- Regenerate scoped pack: `graphify-out/repomix/co-guest-fields-qr-final.xml`

**Steps:**

1. Frontend targeted test:

```bash
node --test src/features/local-biometric/components/check-in-workspace-layout.test.ts
```

2. Frontend gates:

```bash
npx tsc --noEmit
npx eslint \
  src/features/local-biometric/components/check-in-workspace.tsx \
  'src/app/api/hotel-ops/hotels/[hotelId]/stays/route.ts' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx'
```

3. Backend targeted test nếu Task 4 đổi test:

```bash
npm test -- --runInBand src/modules/property/tests/rooms.guest-identity.spec.ts
npm run build
```

4. Manual localhost/UAT:
   - Nhập tay Quốc tịch/Quê quán cho khách đại diện; submit; mở chi tiết/in danh sách, xác minh giá trị.
   - Thêm người ở cùng; nhập tay hai field; submit; mở chi tiết/in danh sách, xác minh giá trị.
   - Quét CCCD có hai field; xác minh auto-fill đúng slot và lưu được.
   - Quét payload thiếu field sau khi đã nhập tay; xác minh không mất giá trị.
   - Mở QR phòng; xác minh QR scan được, URL chữ không còn.
5. Cập nhật `frontends/.../docs/PLANS.md` với root cause, files, commands, kết quả, rủi ro.
6. Chạy:

```bash
graphify update .
npx repomix@latest . --include "<exact changed source/test/docs files>" --compress --style xml --output graphify-out/repomix/co-guest-fields-qr-final.xml
```

7. Kiểm provenance cuối:

```bash
git rev-parse HEAD
git status --short --untracked-files=all
git diff --check -- <scoped source/test/docs paths>
```

## Files dự kiến thay đổi tối thiểu

1. `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace.tsx`
2. `frontends/front-end-vietsage/src/app/api/hotel-ops/hotels/[hotelId]/stays/route.ts`
3. `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx`
4. `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace-layout.test.ts`
5. `services/auth-service/src/modules/property/tests/rooms.guest-identity.spec.ts`
6. `frontends/front-end-vietsage/docs/PLANS.md`
7. Generated Graphify/Repomix context.

## Không làm

- Không tạo migration/cột DB mới: đã tồn tại.
- Không đổi `residencePlace` thành field mới `placeOfOrigin`: tránh duplicate data/contract.
- Không sửa QR lifecycle/payload/download/print.
- Không thêm dependency/package/lockfile.
- Không backfill dữ liệu cũ không có nguồn đáng tin.

## Rủi ro còn lại

- `residencePlace` từ CCCD đang được dùng làm nhãn nghiệp vụ **Quê quán**. Nếu sau này cần phân biệt “Nơi thường trú” và “Quê quán”, phải có yêu cầu contract riêng; không gộp suy đoán trong fix này.
- Dữ liệu các lượt check-in cũ đã lưu `null` không thể tự khôi phục; chỉ nhập lại nếu còn lượt ở và có UI cập nhật occupant phù hợp.
