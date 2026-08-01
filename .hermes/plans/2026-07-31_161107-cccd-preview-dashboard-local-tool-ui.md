# CCCD Preview Dashboard + Local Tool UI Implementation Plan

> **For Hermes:** Execute task-by-task with strict TDD, one writer, Graphify-first navigation, scoped Repomix, fresh security review, and real HN-212 UAT before completion.

**Goal:** Nâng cấp flow quét CCCD thành trải nghiệm vận hành lễ tân hoàn chỉnh: tool local rõ trạng thái và preview tốt; dashboard VietSage hiển thị ảnh + các trường CCCD thực sự nhận được; ảnh chỉ relay tạm qua VPS trong RAM, tuyệt đối không lưu DB/object storage/cache/log/analytics.

**Architecture:** Mỗi khách sạn chạy một Scan Receiver trên máy cắm HN-212. Receiver ghép một lần với VietSage VPS, poll lệnh outbound HTTPS, đọc CCCD từ `ws://localhost:8000`, gửi payload theo scan request. VPS giữ payload tạm trong volatile store có TTL; dashboard của đúng khách sạn/operator đọc và ACK/xóa. Form check-in chỉ persist các trường hiện đã được nghiệp vụ chấp thuận; ảnh và trường CCCD mở rộng chỉ phục vụ preview ở slice này.

**Tech Stack:** Python 3.11 stdlib local receiver, HTML/CSS/ES modules, Next.js 16, React 19, TypeScript, Zod, TanStack Query v5 via `@dangminhdev04032005/query-resource`, Tailwind v4, Node test runner.

**Design read:** Giao diện vận hành lễ tân, trust-first, mật độ vừa, ưu tiên đọc nhanh và trạng thái rõ. Không giữ kiểu “test console”, không dark-tech trang trí, không thêm dependency/UI framework mới.

**Design dials:** variance 3, motion 2, density 6. Motion chỉ dùng cho feedback trạng thái; hỗ trợ `prefers-reduced-motion`.

---

## 1. Quyết định đã chốt

### 1.1 Topology

```text
Khách sạn A: HN-212 -> Scan Receiver A -- outbound HTTPS --> VietSage VPS
Khách sạn B: HN-212 -> Scan Receiver B -- outbound HTTPS --> VietSage VPS
Khách sạn C: HN-212 -> Scan Receiver C -- outbound HTTPS --> VietSage VPS
```

- Tool UI giữ loopback: `http://127.0.0.1:8765`.
- HN-212 giữ loopback: `ws://localhost:8000`.
- Không mở inbound port router/LAN cho VPS.
- Mỗi receiver có credential riêng, gắn hotel, lưu Windows user-scoped DPAPI.
- Pair một lần; restart tự load credential và tự poll lại.

### 1.2 Boundary ảnh preview

Ảnh được phép truyền tạm qua VPS nhưng:

- Không ghi DB.
- Không ghi file/temp file.
- Không ghi object storage/CDN.
- Không đưa vào URL/query string/cookie.
- Không đưa vào console, `[API_RES]`, server logs, exception payload, analytics, tracing, screenshot artifact.
- Mọi response/request liên quan có `Cache-Control: no-store, private`.
- Payload chỉ tồn tại trong volatile memory/shared volatile store đến khi browser ACK/discard hoặc TTL hết.
- Browser chỉ giữ trong component state/Blob URL; revoke/clear khi đóng form, quét lại, timeout, submit thành công hoặc unmount.
- Không có nút download/copy/export ảnh trong slice này.

### 1.3 Persistence boundary

Slice này không thêm migration, không thêm cột DB.

Persist khi check-in chỉ giữ behavior hiện tại:

- `guestDisplayName`.
- `guestIdentityNumber` nếu endpoint hiện đã nhận.
- Các trường check-in hiện hữu.

Không persist trong slice này:

- portrait/photo.
- date of birth.
- gender.
- nationality.
- race/ethnicity.
- residence/address.
- issue/expiry dates.
- chip/SOD verification.
- captured timestamp.

Các trường trên chỉ preview. Mở persistence sau bằng yêu cầu, consent, retention và migration riêng.

### 1.4 Optional-field rule

- Field có giá trị hợp lệ: render.
- Field `undefined`, `null`, chuỗi rỗng/whitespace: không render row/card.
- Không render dấu `--`, ô trống hoặc “Chưa có dữ liệu” trong preview hoàn tất.
- Loading/error có UI riêng; không dùng field trống để biểu diễn trạng thái.
- `age` không truyền/lưu; dashboard tính động từ `dateOfBirth` tại thời điểm render. Nếu ngày sinh vắng/sai thì không render tuổi.
- CCCD luôn là string, không convert number.

---

## 2. Contract mục tiêu

### 2.1 Payload relay v2

Nâng schema theo backward-compatible union trong giai đoạn chuyển tiếp; không phá receiver cũ ngay.

```ts
type IntakePayloadV2 = {
  schemaVersion: 2;
  transferId: string;       // UUID
  capturedAt: string;       // ISO datetime
  guest: {
    displayName: string;
    identityNumber: string; // 9-12 digits
    dateOfBirth?: string;   // YYYY-MM-DD
    gender?: string;
    nationality?: string;
    race?: string;
    residencePlace?: string;
    identityIssueDate?: string;
    identityExpiryDate?: string;
  };
  verification: {
    chipAuthenticated?: boolean;
    sodVerified?: boolean;
  };
  portrait?: {
    mimeType: "image/jpeg" | "image/png";
    base64: string;
  };
};
```

Validation ceilings:

- Request JSON toàn bộ: tối đa `1 MiB` như hiện tại.
- Portrait decoded: đề xuất tối đa `512 KiB`.
- Base64 phải hợp lệ; không nhận SVG/GIF/WebP trong slice này.
- Text lengths giữ bounded: name 160, gender 32, nationality/race 80, address 512.
- Reject unknown fields bằng `.strict()`.
- Normalize date local ở receiver thành ISO date trước khi gửi.
- Không đưa raw vendor frame, device serial, local path hoặc opaque hardware metadata vào payload.

### 2.2 Scan lifecycle

```text
waiting -> claimed -> received -> displayed -> acknowledged/deleted
                    \-> expired/deleted
```

Rules:

- Chỉ workstation đã claim mới complete.
- Chỉ đúng hotel + operator tạo request mới đọc/ACK.
- `GET` không xóa ngay để tránh mất dữ liệu khi response/network lỗi.
- Dashboard gửi ACK sau khi payload đã parse và state preview đã được tạo.
- ACK xóa portrait + payload khỏi volatile store; dashboard giữ bản local đến khi form lifecycle kết thúc.
- Nếu không ACK: TTL tự xóa.
- Đóng form trước ACK: gửi discard best-effort; TTL vẫn là fail-safe.
- Scan cũ không được reuse cho modal/form mới.

### 2.3 Production store gate

Hiện `WorkstationStore` là `Map` process-local. Chỉ hợp local/dev, không an toàn khi VPS restart hoặc nhiều frontend instance.

Trước production multi-hotel:

- Chọn shared volatile store có TTL và atomic claim (ưu tiên Redis nếu hạ tầng đã có).
- Không lưu portrait vào durable DB/AOF/snapshot. Nếu Redis persistence đang bật, dùng instance/namespace volatile phù hợp hoặc tắt persistence cho store này.
- Atomic claim/complete/ACK bằng transaction/Lua/CAS tương đương.
- Nếu chưa có shared volatile store được duyệt, production gate phải giữ frontend biometric ở một instance và ghi rõ restart mất request; không gọi production-ready.
- Không tự thêm Redis package/config trong UI slice nếu chưa được phê duyệt dependency/hạ tầng.

---

## 3. UX mục tiêu

### 3.1 Dashboard VietSage: nâng toàn bộ check-in thành workspace

UI hiện tại đã lỗi thời theo hai cách:

- Owner: modal `max-w-3xl` chứa form thủ công trước, scanner là panel phụ ở cuối.
- Staff: form `Check-in nhanh` nằm trong right rail hẹp, không đủ diện tích cho portrait, xác minh và dữ liệu CCCD.

Không vá thêm field vào hai layout này. Tạo một feature-owned `CheckInWorkspace` dùng chung cho Owner/Staff; route clients chỉ cấp room, quyền, dữ liệu form và callback submit.

Hierarchy bắt buộc:

1. Header: `Check-in phòng <số phòng>`; bỏ eyebrow `CHECK-IN` trùng nghĩa.
2. Room summary gọn: số phòng, loại phòng khi có, trạng thái `Phòng sẵn sàng`; bỏ dữ liệu không nhãn/mơ hồ.
3. `Xác minh giấy tờ`: trạng thái thiết bị tách khỏi trạng thái CCCD; nút Quét là primary action trước khi có preview.
4. Identity preview: portrait + các field CCCD thực sự có.
5. Stay details: tên khách chính, số điện thoại, dự kiến check-out.
6. Validation/operational warnings.
7. Sticky footer: `Hủy` + `Hoàn tất check-in`; bỏ copy kỹ thuật `Đồng bộ check-in`.

Desktop:

- Dialog/workspace rộng `min(1100px, 94vw)`, cao tối đa `90dvh`, body scroll riêng.
- Header/footer sticky; không để CTA trôi khỏi viewport.
- Body hai cột sau scan: trái 38-42% cho scanner/portrait/verification; phải 58-62% cho identity + stay fields.
- Trước scan, scanner là khối hành động rõ ràng; manual fields vẫn hoạt động khi receiver offline.

Mobile/tablet `<768px`:

- Full-screen dialog/sheet, không modal nhỏ giữa màn hình.
- Một cột theo thứ tự room -> scanner -> preview -> stay details -> warnings.
- Sticky footer, safe-area padding, keyboard không che CTA.
- Không đặt hai input cạnh nhau.

State separation:

- `deviceState`: checking/offline/ready.
- `scanState`: idle/requested/receiving/received/expired/error.
- `verificationState`: not-checked/passed/failed/partial; không suy ra từ device online.
- `stayFormState`: manual/editable fields được persist.
- `identityPreviewState`: read-only, memory-only fields không persist ở slice này.

Field ownership:

- Editable/persisted hiện tại: guest name, phone, planned checkout; identity number chỉ gửi theo contract hiện hữu khi scan có.
- Read-only preview: DOB, derived age, gender, nationality, race, residence, issue/expiry, captured time, chip/SOD, portrait.
- Không tự thêm adults/children/companions/notes/booking fields nếu backend contract hiện chưa có.
- Tên scan có thể prefill guest name; người vận hành vẫn sửa field nghiệp vụ. Preview luôn giữ legal name gốc để thấy khác biệt.

Dialog accessibility:

- `role="dialog"`, `aria-modal`, labelled/described title.
- Focus trap; focus vào heading/first action khi mở; trả focus về trigger khi đóng.
- `Escape`/backdrop close phải cảnh báo nếu có form dirty hoặc preview chưa xử lý.
- Close button có accessible name, không chỉ `title`.
- Error summary đầu form + field `aria-describedby`.
- Room availability được backend revalidate lúc submit; badge UI không phải authority.

### 3.2 Dashboard VietSage: `CccdCheckInPanel` bên trong workspace

Desktop:

```text
┌ Trạng thái máy quét + thao tác quét ─────────────────────┐
│                                                         │
│  Portrait  │ Họ tên + CCCD                              │
│  3:4       │ ngày sinh | tuổi | giới tính | quốc tịch  │
│            │ dân tộc | địa chỉ | ngày cấp | hết hạn    │
│            │ giờ quét | chip | SOD                      │
│                                                         │
│  Thông báo privacy: preview tạm, không lưu ảnh          │
└─────────────────────────────────────────────────────────┘
```

Mobile `<768px`:

- 1 cột.
- Portrait trên, thông tin dưới.
- Actions full-width hoặc wrap rõ.
- Giá trị dài `overflow-wrap:anywhere`; địa chỉ chiếm full row.

States bắt buộc:

1. Checking workstation.
2. Unpaired/offline.
3. Pairing code issued.
4. Ready.
5. Scan requested/countdown.
6. Receiving.
7. Preview ready.
8. No portrait but metadata valid.
9. Invalid payload/image.
10. Expired.
11. Network error/retry.
12. Cleared after close/submit/unmount.

Field rendering:

- Always when payload valid: name, CCCD, captured time.
- Optional: DOB, derived age, gender, nationality, race, address, issue, expiry.
- Verification status only when boolean exists: `Đạt` or `Không đạt`; never infer missing as pass.
- Status uses text + icon/shape, not color alone.
- Full CCCD chỉ hiện trong active authorized check-in preview; clear cùng preview lifecycle.

Portrait:

- Aspect ratio 3:4, reserved space to avoid CLS.
- `object-fit: contain`.
- Loading skeleton matching frame.
- Missing/error placeholder distinct.
- `alt="Ảnh chân dung đọc từ chip CCCD"`; không lặp CCCD/name trong alt.
- `draggable={false}`, no download button.

Accessibility:

- `<dl>/<dt>/<dd>` cho identity details.
- `aria-live="polite"` cho progress; `role="alert"` cho blocking error.
- Focus quay về nút Quét khi reset/expiry.
- Button min height 44px, focus-visible rõ.
- WCAG AA labels/status/inputs.
- Không dùng uppercase 10px cho toàn bộ labels; tối thiểu 12-14px thực tế.

### 3.3 Tool local: từ test console thành workstation console

Information architecture:

1. Header: `Trạm quét CCCD`, trạng thái Receiver, HN-212, VietSage.
2. Setup panel: chỉ hiện khi chưa pair hoặc lỗi credential.
3. Active command banner: khách sạn đang yêu cầu quét, countdown, hướng dẫn đặt CCCD.
4. Main preview: portrait lớn + thông tin optional.
5. Verification summary: Chip/SOD rõ bằng chữ.
6. Action bar: kiểm tra kết nối, quét lại/clear local preview; pairing reset chỉ trong settings có confirm.
7. Privacy footer: ảnh/dữ liệu chỉ relay tạm, không lưu trên máy/VPS.

Loại bỏ/ẩn khỏi production UI:

- `Mô phỏng lượt quét` khỏi default operator surface. Chỉ bật bằng explicit dev flag.
- “Xóa phiên” mơ hồ. Đổi thành `Xóa preview trên máy`; xác nhận rõ không xóa thiết bị/VietSage.
- History giả/rỗng nếu không có nhu cầu; YAGNI, không tạo persistent history.
- Các từ kỹ thuật như DPAPI/token/polling khỏi UI người vận hành; đặt trong diagnostics nếu cần.

Tool state machine:

```text
booting
unpaired
ready
command_received
reading_card
preview_ready
sending
accepted
offline
expired
error
```

Behavior:

- Pairing code chỉ một lần; paired restart thì setup hidden.
- Command mới reset preview cũ trước khi đọc.
- HN-212 info and image frames merge by `scanId`/active command only.
- Không tự gửi scan không gắn active VPS command.
- Khi payload accepted: show `Đã chuyển về VietSage`; giữ preview cục bộ ngắn hạn cho operator, sau đó clear khi command mới/TTL/manual clear.
- Không ghi profile/photo vào IndexedDB/localStorage/sessionStorage/file.
- `indexedDB.deleteDatabase` cũ được loại nếu không còn DB use.

Visual direction:

- Dùng token CSS hiện có nhưng giảm “dark hacker console”.
- Nền trung tính sáng hoặc auto theme theo `DESIGN.md`; một accent xanh VietSage.
- Radius system thống nhất: cards 12px, controls 8px.
- Không gradient/glow trang trí.
- Không animation liên tục; chỉ transition 150-200ms cho state changes, reduced-motion fallback.

---

## 4. Kế hoạch triển khai theo TDD

## Task 0: Freeze scope, capture baseline, resolve dirty state

**Objective:** Tránh overwrite dirty work và xác định chính xác source hiện tại trước khi code.

**Inspect:**

- `frontends/front-end-vietsage/src/features/local-biometric/components/cccd-check-in-panel.tsx`
- `frontends/front-end-vietsage/src/features/local-biometric/intake/intake-contract.ts`
- `frontends/front-end-vietsage/src/features/local-biometric/workstation/workstation-store.ts`
- `frontends/front-end-vietsage/src/app/api/biometric-workstations/**`
- Owner/Staff check-in clients.
- `C:/Users/Dangminhdev0403/Desktop/workspace/vietsage-biometric-local/app/{index.html,app.mjs,receiver_server.py,workstation_client.py}`
- Relevant tests only.

**Steps:**

1. `git status --short` in `fullstack-vietSage`; record dirty files, never reset.
2. Run Graphify query/affected for current panel/store/routes.
3. Verify `manifest.json` freshness for selected files.
4. Build scoped Repomix pack under `graphify-out/repomix/`; keep under 20k tokens.
5. Read exact current ranges after pack.
6. Record baseline test/build results.
7. Confirm no package/lockfile changes.

**Gate:** Stop if selected source has conflicting dirty edits by another writer.

---

## Task 1: Expand strict relay contract with optional fields and portrait

**Objective:** Contract accepts only real optional CCCD fields and bounded portrait.

**Files:**

- Modify: `frontends/front-end-vietsage/src/features/local-biometric/intake/intake-contract.ts`
- Create/modify test: `frontends/front-end-vietsage/src/features/local-biometric/intake/intake-contract.test.ts`

**RED tests:**

1. Accept full v2 payload.
2. Accept omitted optional fields/portrait.
3. Reject whitespace-only optional text after normalization policy.
4. Reject unknown keys.
5. Reject non-JPEG/PNG MIME.
6. Reject malformed base64.
7. Reject decoded portrait over `512 KiB`.
8. Reject invalid dates and numeric CCCD.
9. Parse v1 metadata-only during migration if backward compatibility retained.

**Implementation:**

- Add v2 Zod schema and narrow union/version parser.
- Export stable frontend type derived from schema.
- Keep validation pure; no UI formatting inside contract.

**Run:**

```bash
node --experimental-strip-types --test src/features/local-biometric/intake/intake-contract.test.ts
```

Expected: all contract tests pass.

---

## Task 2: Make local receiver produce safe optional payload + portrait

**Objective:** Receiver sends only present fields and bounded portrait; no sensitive logs/storage.

**Files:**

- Modify: `C:/Users/Dangminhdev0403/Desktop/workspace/vietsage-biometric-local/app/receiver_server.py`
- Modify: `C:/Users/Dangminhdev0403/Desktop/workspace/vietsage-biometric-local/app/app.mjs`
- Modify: `.../tests/test_receiver_server.py`
- Modify: `.../tests/app.test.mjs`

**RED tests:**

1. `build_intake_payload` includes `race`, `residencePlace`, issue/expiry only when non-empty.
2. Missing fields are omitted, not sent as `null`/empty.
3. Portrait converted to `{mimeType, base64}` only for JPEG/PNG.
4. Invalid/oversized image blocks submission with safe message.
5. Payload never includes raw `photo`, local path, serial, secret or address under an unintended key.
6. No active command means real scan stays local preview only; cannot complete VPS request.
7. Logging output never contains identity number, name, address or base64.

**Implementation:**

- Add pure normalization helpers in `app.mjs` or receiver module; no dependency.
- Convert dates to ISO date.
- Strip/omit optional blanks.
- Preserve `transferId`, `capturedAt`, chip/SOD.
- Keep 1 MiB request ceiling.

**Run:**

```bash
PYTHONPATH='<absolute-app>;<absolute-future-senseface>' python -m unittest discover -s tests -v
node --test tests/app.test.mjs
python -m py_compile app/*.py
```

Expected: Python and JS suites pass; compile pass.

---

## Task 3: Harden VPS volatile lifecycle and no-store/no-log behavior

**Objective:** Portrait survives only long enough for the authorized dashboard to display, then is destroyed.

**Files:**

- Modify: `.../workstation/workstation-store.ts`
- Modify: `.../workstation/workstation-store.test.ts`
- Modify: `.../scans/[scanRequestId]/complete/route.ts`
- Modify: `.../scans/[scanRequestId]/route.ts`
- Create: `.../scans/[scanRequestId]/ack/route.ts`
- Create/modify route behavior tests if project pattern exists.
- Potentially modify central response logger redaction utility/test; exact file selected by Graphify before edit.

**RED tests:**

1. Wrong hotel/operator cannot read or ACK.
2. Wrong/unclaimed workstation cannot complete.
3. Complete after expiry rejected.
4. GET before ACK can retry safely.
5. ACK deletes payload/portrait.
6. TTL cleanup deletes unacknowledged payload.
7. Re-read after ACK returns gone/expired, never image.
8. Every image-bearing route response has `Cache-Control: no-store, private`.
9. Request/response logging serializes portrait as `[REDACTED]`, while caller still receives original data.
10. Error paths never echo validation input/base64/identity.
11. Body cap rejects oversized input before parse.

**Implementation:**

- Add explicit scan status and `acknowledgeScan`/`discardScan` behavior.
- Lazy cleanup expired entries on every relevant store operation.
- Add no-store headers to pair/commands/scans where sensitive state exists.
- Add structural redaction for keys `portrait`, `base64`, `identityNumber`, `residencePlace` in response logging. Never mutate actual response object.
- Do not log whole biometric API payload in route handlers.

**Production gate:** Decide shared volatile store before deployment. Process-local Map remains dev-only.

---

## Task 4: Restore repository/resource/hook boundary for biometric UI

**Objective:** Remove raw `fetch` from `CccdCheckInPanel`; comply with frontend architecture.

**Files likely:**

- Create: `src/features/local-biometric/repositories/workstation-repository.ts`
- Create: `src/features/local-biometric/resources/workstation-resource.ts`
- Create: `src/features/local-biometric/hooks/use-workstation-scan.ts`
- Modify: `src/features/local-biometric/components/cccd-check-in-panel.tsx`
- Add focused tests for repository mapping/resource keys/hook pure state reducer.

**Rules:**

- Repository owns same-origin calls and DTO parsing.
- Resource declares real capabilities only: pairing status, issue pairing, request scan, read scan, ACK/discard.
- Scope key includes `hotelId`; input key includes `scanRequestId` where applicable.
- Hook owns bounded polling, expiry, ACK/discard orchestration and UI messages.
- Component owns presentation/local preview only.
- No package changes; `@dangminhdev04032005/query-resource` already installed.

**RED tests:**

1. Hotel A/B resource keys differ.
2. Scan IDs produce distinct query keys.
3. Poll stops on received/expired/unmount.
4. Payload delivered once; stale transfer cannot overwrite new scan.
5. ACK only after payload parse/preview state creation.
6. Reset clears query/local state and calls discard best-effort.

---

## Task 5: Build pure preview view-model and optional-field renderer

**Objective:** Centralize field omission/formatting; Owner and Staff get identical preview.

**Files:**

- Create: `src/features/local-biometric/utils/cccd-preview.ts`
- Create: `src/features/local-biometric/utils/cccd-preview.test.ts`
- Create: `src/features/local-biometric/components/cccd-preview.tsx`

**RED tests:**

1. Full payload yields expected ordered fields.
2. Blank/missing optional fields yield no row.
3. Age calculated correctly before/after birthday; invalid DOB omits age.
4. Dates render `DD/MM/YYYY`; captured timestamp uses full year and local timezone.
5. Missing verification omitted; false renders `Không đạt`.
6. Long address remains plain text; never injected as HTML.
7. Portrait MIME/base64 maps to safe data URL/Blob URL.

**Field order:**

1. Họ tên.
2. CCCD.
3. Ngày sinh.
4. Tuổi derived.
5. Giới tính.
6. Quốc tịch.
7. Dân tộc.
8. Địa chỉ.
9. Ngày cấp.
10. Hết hạn.
11. Giờ quét.
12. Xác thực chip.
13. Toàn vẹn SOD.

**Implementation:**

- Return view model array; component maps semantic `<dl>`.
- No empty placeholders after success.
- Provide portrait missing/error states separately.

---

## Task 6: Redesign `CccdCheckInPanel`

**Objective:** Replace test panel with complete operational preview surface.

**Files:**

- Modify: `src/features/local-biometric/components/cccd-check-in-panel.tsx`
- Use new preview/hook modules.
- Add source/render tests using existing stack; do not add React test dependency without approval.

**Implementation steps:**

1. Split status/header, setup, scan action, preview, privacy note.
2. Add clear state-specific copy.
3. Render responsive portrait + optional fields.
4. Disable duplicate scan while active.
5. Countdown from authoritative `expiresAt`.
6. Clear preview on new scan, form close, expiry, submit success, unmount.
7. Maintain manual check-in when workstation offline.
8. No autoplay sound/motion unless explicitly requested later.

**Acceptance:**

- No raw fetch.
- No raw endpoint URLs in component.
- All states keyboard accessible.
- Optional rows absent when missing.
- Image visible on dashboard; no download/export.

---

## Task 7: Create shared `CheckInWorkspace` and retire legacy modal/sidebar forms

**Objective:** Replace Owner modal + Staff narrow right-rail form with one responsive, feature-owned operational workspace.

**Files:**

- Create: `src/features/local-biometric/components/check-in-workspace.tsx`
- Create: `src/features/local-biometric/types/check-in-workspace.ts`
- Create focused pure state/validation tests where possible.
- Modify: `.../owner-stay-room-grid-client.tsx`
- Modify: `.../staff-rooms-client.tsx`

**Component boundary:**

- Props contain only open state, hotel/room summary, permissions, initial stay fields, submit state and callbacks.
- Do not pass whole Owner/Staff clients or backend DTOs into shared presentation.
- Workspace owns layout, field presentation, dirty state, scanner placement and accessible dialog lifecycle.
- Owner/Staff clients retain their existing transport/business submit callbacks.

**RED tests/source gates:**

1. Owner and Staff import the same workspace.
2. Staff walk-in no longer renders scanner inside narrow right rail; selecting a room opens workspace.
3. Manual check-in remains possible offline.
4. CTA copy is `Hoàn tất check-in`; no `Đồng bộ check-in`.
5. Unknown room metadata does not render unlabeled values.
6. Preview-only fields never become editable stay inputs.
7. Mobile layout is full-screen; desktop has bounded dialog with sticky footer.
8. Dirty form/active preview close requires confirmation; clean close does not.
9. Dialog focus lifecycle and accessible close name exist.
10. Submit callback receives only approved persisted fields + optional identity number.

**Implementation:**

1. Move shared form presentation/state orchestration into workspace.
2. Put scanner before stay details in visual hierarchy.
3. Show legal scan identity read-only; prefill editable guest name separately.
4. Replace Owner legacy modal markup.
5. Replace Staff walk-in sidebar form with launcher/summary that opens workspace.
6. Keep Staff reservation flow unchanged unless it directly invokes actual check-in.
7. Preserve existing error mapping and manual fallback.
8. Revalidate room availability/idempotency in existing final submit path; do not trust status badge snapshot.

---

## Task 8: Integrate preview lifecycle into Owner and Staff check-in

**Objective:** Both surfaces show same preview; no stale capture leaks between rooms/forms.

**Files:**

- Modify: `.../owner-stay-room-grid-client.tsx`
- Modify: `.../staff-rooms-client.tsx`
- Add focused tests around check-in payload/state reset where feasible.

**RED tests:**

1. Opening room B after room A clears A preview.
2. Closing form clears capture/Blob URL.
3. Scan timeout clears capture.
4. Successful check-in clears capture.
5. Failed check-in keeps preview for correction/retry but does not re-request scan.
6. Submission persists only approved fields; portrait and preview-only fields absent.
7. Manual check-in succeeds with no receiver/preview.

**Implementation:**

- Extend `CccdCheckInCapture` to carry preview payload, not just name/identity.
- Keep form autofill limited to supported form fields.
- Pass explicit `resetKey`/lifecycle callback rather than hidden module global state.
- Avoid adding optional CCCD fields to check-in DTO in this slice.

---

## Task 9: Redesign local Scan Receiver operator UI

**Objective:** Tool becomes a daily workstation console, not connection test page.

**Files:**

- Modify: `vietsage-biometric-local/app/index.html`
- Modify: `vietsage-biometric-local/app/app.mjs`
- Modify: `vietsage-biometric-local/tests/app.test.mjs`
- Modify: `vietsage-biometric-local/tests/test_receiver_server.py`
- Update: `vietsage-biometric-local/README.md`

**RED tests / source assertions:**

1. Pairing setup hidden when `paired:true`.
2. Production UI has no visible simulation action by default.
3. Optional fields omitted.
4. Portrait and metadata render from merged frames.
5. Active command shows countdown/state.
6. New command clears old preview.
7. Clear action affects PC preview only.
8. No IndexedDB/localStorage/sessionStorage persistence.
9. No device user/template/log deletion endpoint invoked.
10. Responsive structure and semantic status regions exist.

**Implementation:**

- Keep one HTML + one ES module; no framework/dependency migration.
- Use CSS variables/tokens and native grid.
- Setup panel collapsed after pair.
- Status is operational: Receiver, HN-212, VietSage.
- Preview uses same field order as dashboard.
- Diagnostics secondary; operator action primary.
- Remove fake history and ambiguous actions.

---

## Task 10: Security/privacy verification

**Objective:** Prove “relay-only, no persist/cache/log” rather than merely document it.

**Automated checks:**

- Search changed code for writes involving `portrait`, `base64`, `identityNumber`.
- Assert no storage APIs in tool/dashboard preview path.
- Assert no image/body in logger fixtures.
- Assert cache headers on all sensitive responses.
- Assert TTL/ACK deletion.
- Assert cross-hotel/operator isolation.
- Assert 1 MiB request cap and decoded image cap.
- Assert no full identity/portrait in thrown errors.

**Manual checks:**

1. Browser DevTools Network: image exists only in scan JSON response; `no-store` present.
2. Application tab: no image/CCCD in Local Storage, Session Storage, IndexedDB, Cache Storage, cookies.
3. VPS logs: no name, CCCD, address or base64.
4. Receiver `.runtime`: only settings + DPAPI credential; no portrait/profile file.
5. Close modal/reload: preview gone.
6. Wait TTL: scan endpoint no longer returns payload.

**Independent review:**

Fresh scoped review after final code and tests. Required verdict: `passed: true`. Review focuses on tenant isolation, image lifecycle, logs/cache, stale scan, manual fallback.

---

## Task 11: Full verification ladder

### Local receiver

```bash
PYTHONPATH='<absolute-app>;<absolute-future-senseface>' python -m unittest discover -s tests -v
node --test tests/app.test.mjs
python -m py_compile app/*.py
```

### Frontend focused

```bash
node --experimental-strip-types --test \
  src/features/local-biometric/intake/intake-contract.test.ts \
  src/features/local-biometric/workstation/workstation-store.test.ts \
  src/features/local-biometric/utils/cccd-preview.test.ts
npx eslint <changed-frontend-files>
npx tsc --noEmit --pretty false
npm run build
```

Use temporary process-only build secret only if the known local `AUTH_SECRET` gate requires it; never write secret to file/log/plan.

### Browser smoke

Owner and Staff:

1. Receiver offline: manual check-in remains usable.
2. Receiver online: scan action enabled.
3. Full mock payload: portrait + all fields render.
4. Partial payload: absent fields do not render.
5. Invalid image: safe error/placeholder, no broken layout.
6. Mobile 320px, tablet, desktop; no horizontal overflow.
7. Zoom 200%; labels/values readable.
8. Keyboard-only flow and visible focus.
9. Close/reopen different room: no stale preview.
10. Submit: no portrait/preview-only fields in stay request.

### Real HN-212 UAT

One physical step at a time:

1. Authorized test subject inserts CCCD.
2. Receiver receives identity frame.
3. Receiver receives portrait frame.
4. Tool preview displays exact present fields.
5. Tool completes matching VPS command.
6. Dashboard displays same fields + portrait.
7. Check Network/Storage/Logs for no persistence.
8. Confirm form values, then perform or cancel check-in as chosen.
9. Verify ACK/TTL deletes VPS payload.

Simulation evidence cannot replace hardware UAT.

---

## 5. Files likely to change

### VietSage frontend/VPS

- `frontends/front-end-vietsage/src/features/local-biometric/intake/intake-contract.ts`
- `.../intake/intake-contract.test.ts` (new)
- `.../workstation/workstation-store.ts`
- `.../workstation/workstation-store.test.ts`
- `.../repositories/workstation-repository.ts` (new)
- `.../resources/workstation-resource.ts` (new)
- `.../hooks/use-workstation-scan.ts` (new)
- `.../utils/cccd-preview.ts` (new)
- `.../utils/cccd-preview.test.ts` (new)
- `.../components/cccd-preview.tsx` (new)
- `.../components/cccd-check-in-panel.tsx`
- `.../components/check-in-workspace.tsx` (new)
- `.../types/check-in-workspace.ts` (new)
- `frontends/front-end-vietsage/src/app/api/biometric-workstations/scans/[scanRequestId]/complete/route.ts`
- `.../scans/[scanRequestId]/route.ts`
- `.../scans/[scanRequestId]/ack/route.ts` (new)
- Owner/Staff room check-in clients.
- Central API response logger redaction utility/test selected by Graphify.
- `frontends/front-end-vietsage/docs/PLANS.md` after implementation completion.
- Contract/security docs only if behavior rules change materially.

### Local receiver

- `C:/Users/Dangminhdev0403/Desktop/workspace/vietsage-biometric-local/app/index.html`
- `.../app/app.mjs`
- `.../app/receiver_server.py`
- `.../app/workstation_client.py` only if headers/ACK flow require it.
- `.../tests/app.test.mjs`
- `.../tests/test_receiver_server.py`
- `.../tests/test_workstation_client.py` if transport changes.
- `.../README.md`

Ceiling: keep implementation within 25 changed files. If shared volatile production store needs infrastructure beyond ceiling, split into separately approved mission before deployment.

---

## 6. Risks and mitigations

| Risk | Mitigation / gate |
|---|---|
| Portrait appears in mandatory `[API_RES]` logs | Structural logger redaction test before repository migration |
| Next process restart/multi-instance loses state | Shared volatile store production gate; no false production-ready claim |
| Redis persistence accidentally makes portrait durable | Dedicated volatile configuration/namespace; verify AOF/RDB behavior |
| Base64 memory amplification | 512 KiB decoded cap + 1 MiB JSON cap + TTL + ACK deletion |
| Cross-hotel data leak | Hotel/operator/workstation claim checks; negative tests |
| Stale scan reused in another room | transferId + scanRequestId + reset lifecycle tests |
| Browser caches sensitive response | `no-store, private`, no service-worker cache, DevTools check |
| UI persists via storage | No storage API; static/runtime inspection |
| Missing fields create blank clutter | Pure optional-field view model tests |
| Portrait absent delays workflow | Metadata preview remains valid; explicit `Không có ảnh` state |
| HN-212 plugin camera/reader ownership conflict | Tool consumes plugin frame only; no `getUserMedia()` |
| Dashboard becomes overloaded | Preview component limited to current scan; no history/profile management |
| Existing large Owner/Staff clients become larger | Keep new logic feature-owned; clients only manage lifecycle callbacks |
| Owner modal and Staff sidebar drift apart again | One shared `CheckInWorkspace`; both clients consume stable props/callback contract |
| Room badge becomes stale during long scan | Backend revalidates room availability/idempotency at final submit |
| Scanned legal name differs from editable guest name | Keep legal identity read-only; show edited stay name separately and visibly |

---

## 7. Definition of Done

Không dùng từ “Hoàn tất” cho đến khi tất cả đạt:

- [ ] Dashboard Owner + Staff hiển thị portrait relay tạm.
- [ ] Owner + Staff dùng chung `CheckInWorkspace`; legacy modal/sidebar scanner form đã được retire.
- [ ] Workspace hierarchy đúng: room -> scan/verify -> identity preview -> stay details -> warnings -> submit.
- [ ] CTA là `Hoàn tất check-in`; room state được revalidate server-side.
- [ ] Chỉ field thực sự có dữ liệu được render.
- [ ] Tool local có operator-grade UI và đầy đủ states.
- [ ] Manual check-in vẫn hoạt động khi receiver offline.
- [ ] Pair một lần; restart tự reconnect.
- [ ] No DB/file/object-storage/browser-storage persistence cho portrait.
- [ ] No cache/log/analytics exposure được kiểm tra thực tế.
- [ ] ACK/TTL xóa payload.
- [ ] Cross-hotel/operator/workstation tests pass.
- [ ] Python, JS, focused frontend tests, typecheck, lint, build pass.
- [ ] Browser smoke Owner/Staff desktop/mobile/keyboard pass.
- [ ] Fresh independent review passes.
- [ ] Real HN-212 E2E pass.
- [ ] Production volatile-store topology được duyệt và xác minh, hoặc feature chưa deploy production.
- [ ] `docs/PLANS.md` cập nhật kết quả thực thi.
- [ ] Graphify refresh sau khi toàn module hoàn tất.

---

## 8. Explicitly skipped in this mission

- FaceID/SenseFace enrollment.
- Upload/persist portrait.
- CCCD history/search/profile management.
- Download/export/print portrait.
- Database migrations for extra identity fields.
- OCR confidence scoring.
- Camera live preview/getUserMedia.
- WebSocket push; outbound polling remains sufficient.
- New UI/framework/dependency.

Add only when retention/legal/workflow requirements are approved separately.
