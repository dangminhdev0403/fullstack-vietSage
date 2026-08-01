# Module thiết bị sinh trắc lễ tân — Kế hoạch triển khai chuẩn

> **Trạng thái:** READY FOR APPROVAL — chỉ lập kế hoạch, chưa triển khai.
>
> **Executor:** Antigravity A/Claude → A/Gemini 3.6 → B/Claude → B/Gemini 3.6 → Hermes. Chỉ chuyển lane khi output chứng minh quota/rate-limit. Một writer. Hermes kiểm tra diff thật, hoàn thiện và chạy toàn bộ gates.

## 1. Mục tiêu

Hoàn thiện một vertical slice vận hành được:

```text
Cài đặt máy lễ tân
→ chẩn đoán Bridge / HN-212 / SenseFace
→ readiness còn hạn 60 giây
→ quét CCCD vào pending local
→ người dùng xem và xác nhận
→ tạo + check-in GuestStay trên VPS
→ tạo/cập nhật user SenseFace
→ PUSH ảnh CCCD Type=9
→ ACK return=0
→ hiển thị SYNCED hoặc FAILED có retry
```

Nhập thủ công luôn hoạt động. Thiết bị lỗi không được làm mất GuestStay đã tạo.

## 2. Phạm vi cứng

### Được phép

- `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`
- `C:\Users\Dangminhdev0403\Desktop\workspace\app_sinh_trac`

### Vai trò từng project

- `fullstack-vietSage/tools/biometric-bridge`: runtime sản phẩm duy nhất.
- `fullstack-vietSage/frontends/front-end-vietsage`: Settings UI và Check-in orchestration.
- `app_sinh_trac/scan-receiver`: hardware lab/reference. Chỉ đồng bộ các sửa lỗi PUSH/TCP thật sự dùng chung; không trở thành dependency runtime.

### Không thuộc module

- Không tạo VPS `DeviceConfig` hay migration mới.
- Không upload portrait, communication key, IP LAN, certificate/private key hoặc pending scan lên VPS.
- Không thêm dependency/package/lockfile nếu chưa được duyệt riêng.
- Không thay port mặc định, deploy VPS, commit hoặc push nếu chưa được yêu cầu.
- Không xóa attendance log, user, face template, fingerprint template.
- Không đọc/tạo ngoài hai project. Thao tác hệ thống Windows như trust certificate/startup cần xác nhận riêng ngay trước khi chạy.

## 3. Kiến trúc chuẩn

```text
VPS VietSage HTTPS
        │ GuestStay + reviewed identity text only
        ▼
Browser máy lễ tân
  ├─ Next API/VPS: tạo GuestStay
  └─ HTTPS 127.0.0.1: Local Bridge
          ├─ ws://localhost:8000 → HN212Plugin
          ├─ TCP 192.168.55.11:4370 → SenseFace
          └─ TLS PUSH 192.168.55.10:18081 ← SenseFace
```

### Nguồn dữ liệu

| Dữ liệu | Nơi lưu |
|---|---|
| GuestStay, họ tên đã duyệt, CCCD text | VPS |
| Pending scan, portrait, enrollment request | Bridge local |
| SenseFace IP/ports, certificate paths | Config local |
| Communication key, pairing secret | Windows DPAPI-protected local secret store |
| Readiness | Memory/browser cache tối đa 60 giây |

Không dùng plaintext fallback cho secrets. Nếu DPAPI unavailable: Settings báo `BLOCKED secret-store`, không ghi key xuống file.

## 4. Trạng thái hiện tại đã xác minh

- Word plan: flow nghiệp vụ đúng; thiếu security/concurrency/runtime details.
- Antigravity A và B: `claude-sonnet-4-6` bounded probe đều trả `QUOTA_OK`; `gemini-3.6-flash-high` có trong catalog.
- VietSage bridge baseline: **25/25 tests PASS**.
- `app_sinh_trac` baseline: **20/20 tests PASS**.
- Graphify VietSage hiện diện.
- Scoped Repomix: **12 files / 10,793 tokens**, security PASS.
- `app_sinh_trac` chưa có Graphify; chỉ dùng exact-file fallback.
- Working tree VietSage đang dirty nhiều phần không liên quan; phải bảo toàn tuyệt đối.

### Đã có

- Scan ở RAM, opaque `scanId`, TTL.
- `guestIdentityNumber` optional 9–12 chữ số.
- Enrollment idempotent theo `stayId`.
- SenseFace user create/update.
- PUSH `biophoto Type=9`.
- `SYNCED/FAILED`, retry, mask CCCD.
- Loopback API, origin allowlist.
- Manual Check-in độc lập.

### Còn thiếu

- Local pairing/authentication.
- Settings persistence + runtime apply/reconnect.
- Diagnostics/readiness contract 60 giây.
- Non-destructive test scan + discard.
- Settings pages/navigation.
- Frontend local repository/resource/hook.
- Save-first orchestration sau `result.data.stay.id`.
- Concurrency/ACK/path/body-limit hardening.
- Windows install/startup/certificate operational path.
- Hardware E2E HN-212 + SenseFace.

## 5. Hợp đồng nghiệp vụ bất biến

1. Manual không phụ thuộc Bridge.
2. Quét CCCD cần `bridgeReady && hn212Ready`; không cần SenseFace.
3. Face enrollment cần thêm `senseFaceTcpReady && pushFresh`.
4. `pushFresh` là request PUSH hợp lệ trong ≤60 giây; ping không đủ.
5. Đặt CCCD chỉ tạo pending local; không DB, user hoặc PUSH.
6. Chỉ explicit Submit mới tạo GuestStay.
7. Chỉ response `201` có `result.data.stay.id` mới cho phép `/enrollments`.
8. FaceID lỗi không rollback GuestStay.
9. Retry enrollment không POST GuestStay lần hai.
10. `SYNCED` chỉ sau đúng ACK face `return=0`.
11. Không tự xóa user/template. Không auto-retry vô hạn.
12. Một pending scan active trên một workstation; scan mới phải cancel/expire scan cũ rõ ràng.

## 6. State contracts

### Readiness

```ts
type BiometricReadiness = {
  checkedAt: string;
  expiresAt: string; // checkedAt + 60s
  bridge: "PASS" | "FAIL";
  hn212: "PASS" | "FAIL" | "UNKNOWN";
  senseFaceTcp: "PASS" | "FAIL" | "UNKNOWN";
  senseFacePush: "PASS" | "FAIL" | "UNKNOWN";
  scanReady: boolean;
  faceReady: boolean;
  deviceSerial?: string;
  errors: Array<{ code: string; message: string }>;
};
```

```text
scanReady = bridge PASS && hn212 PASS
faceReady = scanReady && senseFaceTcp PASS && senseFacePush PASS
expired = now >= expiresAt
```

Đây là freshness TTL, không phải chờ warmup 60 giây.

### Scan

```text
WAITING → READY → CONSUMED
       ↘ CANCELLED
       ↘ EXPIRED
```

`TEST` scan không thể chuyển sang enrollment. `CHECK_IN` scan chỉ `CONSUMED` sau enrollment request được ghi nhận.

### Enrollment

```text
PENDING_PROVISION → PENDING_PUSH → SYNCED
        │                 │
        └──────────────→ FAILED → explicit RETRY
```

Mỗi transition có safe error code; không log full identity/portrait/opaque IDs.

## 7. API local tối thiểu

```text
GET  /health
POST /pair
GET  /settings
PUT  /settings
POST /diagnostics/run
POST /scans/start              { mode: "CHECK_IN" | "TEST" }
GET  /scans/{scanId}
POST /scans/{scanId}/discard
POST /enrollments              { stayId, scanId }
GET  /enrollments/{requestId}
POST /enrollments/{requestId}/retry
```

### Security

- Browser API bind loopback-only.
- PUSH bind đúng dedicated NIC.
- Production dùng HTTPS loopback certificate được Windows trust; không chấp nhận mixed-content workaround.
- Exact CORS origins.
- Pairing code một lần tại workstation; bridge phát session token local ngắn hạn.
- Token không qua Next API/VPS; browser giữ local, không log.
- Mọi mutating endpoint cần pairing token.
- Body cap 1 MiB; portrait decoded-size cap riêng.
- JSON strict; IP/port/ID/path validated.
- `GET /settings` chỉ trả `communicationKeyConfigured`, không trả secret.

## 8. Kế hoạch triển khai theo vertical slices TDD

Mỗi behavior: viết test → chạy thấy FAIL đúng lý do → code tối thiểu → focused PASS → full slice PASS → refactor. Không gom toàn bộ tests rồi mới code.

### Slice 0 — Workspace guard

**Mục tiêu:** bảo toàn dirty work, one-writer.

1. Snapshot `git status --short`.
2. Hash working-set files.
3. Atomic writer lock trong `/workspace/.hermes-locks/`, ngoài repo nhưng trong root đã duyệt.
4. Lane còn lại read-only/stopped.
5. Mỗi Antigravity call: explicit file list ≤25, Repomix ≤20k tokens, cấm repo scan.

**Gate:** pre-existing diff được nhận diện; không reset/stash/checkout.

### Slice 1 — Enrollment và PUSH correctness

**VietSage files:**

- `tools/biometric-bridge/biometric_api.py`
- `tools/biometric-bridge/push_receiver.py`
- `tools/biometric-bridge/zkteco_bridge.py`
- tests tương ứng

**Parity files khi cùng bug tồn tại:**

- `app_sinh_trac/scan-receiver/push_receiver.py`
- `app_sinh_trac/scan-receiver/zkteco_bridge.py`
- tests tương ứng

**Behaviors:**

1. Không giữ `BiometricStore.lock` trong TCP provision/PUSH enqueue; concurrent scan/status không bị block theo network timeout.
2. Ghi enrollment request trước side effect; provision/enqueue lỗi chuyển `FAILED`, request vẫn retry được.
3. `synced()` chỉ nhận enrollment đang `PENDING_PUSH`; late ACK không đổi `FAILED`.
4. Enqueue profile mới không clear lỗi cũ/toàn cục.
5. ACK phải tương quan đúng outstanding command **nếu fixture firmware xác nhận ACK có command ID**. Nếu protocol thực tế không mang ID: giữ one-outstanding invariant, reject ACK khi không có outstanding, ghi rõ residual risk; không bịa parser.
6. PUSH request body >1 MiB trả `413`.
7. `idCode` bắt buộc `^\d{9,12}$` trước dùng làm PIN/path; chặn traversal.
8. Serialize provision/UID allocation; cùng identity là update idempotent; không xóa template.
9. Retry bounded, explicit; một lần gọi tạo tối đa một queue item mới.

**Required tests:**

- concurrent enroll/status không deadlock.
- provision failure leaves retryable request.
- new enqueue preserves old error.
- late/stale ACK cannot advance wrong enrollment.
- failed enrollment cannot become synced without explicit retry.
- body cap/path traversal/duplicate ID/concurrent UID.

### Slice 2 — Local secret, pairing, settings

**Files:**

- Modify `tools/biometric-bridge/bridge_app.py`
- Create `tools/biometric-bridge/local_settings.py`
- Create `tools/biometric-bridge/local_secrets.py` only if DPAPI code would otherwise pollute settings.
- Focused tests.

**Behaviors:**

1. Non-secret settings atomic-write bằng temp file cùng directory + flush/fsync + `os.replace`.
2. Secrets encrypt/decrypt bằng Windows DPAPI, user-scoped.
3. No plaintext fallback.
4. Pairing bootstrap chỉ local/operator initiated; code single-use, expires; session token bounded.
5. `GET /settings` masks secrets.
6. `PUT /settings` validates IPv4, ports 1–65535, cert paths, exact origins.
7. Save increments config generation; supervised HN/SenseFace workers reconnect bằng config mới. Response chỉ success sau config accepted; `restartRequired` nếu runtime không thể hot-apply an toàn.
8. Invalid update không phá config đang chạy.

**Tests:** atomic replace failure preserves old file; DPAPI adapter contract with injectable boundary; pair expiry/reuse rejection; unauthorized mutation 401; secret absent response/log/config JSON; runtime generation changes once.

### Slice 3 — Diagnostics, readiness, test scan

**Files:**

- `bridge_app.py`
- `biometric_api.py`
- `hn212_client.py`
- focused tests; thêm `test_hn212_client.py` vì hiện chưa có coverage.

**Behaviors:**

1. `/health`: cheap state snapshot.
2. `/diagnostics/run`: bounded synchronous first slice. Chỉ thêm async job/polling nếu đo thực tế vượt UX timeout.
3. HN readiness cần valid WebSocket handshake + recent valid reader message/state; socket open đơn thuần chưa đủ.
4. SenseFace TCP readiness cần vendor session + serial/model.
5. PUSH readiness cần expected/paired serial và valid PUSH ≤60 giây; request từ serial lạ không làm ready.
6. `scanReady` và `faceReady` tách biệt.
7. `TEST` scan reuse parser nhưng bị hard-gate khỏi `/enrollments`.
8. Discard/expiry xóa portrait pending khỏi memory; active pointer được reset an toàn.
9. Oversized/invalid WebSocket frame, malformed JSON không kill worker; reconnect bounded.

**Boundary tests:** PUSH 59s PASS/60s boundary defined consistently/61s FAIL; HN offline; TCP-only; PUSH-only; wrong serial; test scan queue unchanged; test scan enrollment rejected; expired/discarded inaccessible; active scan replacement deterministic.

### Slice 4 — Windows workstation operational path

**Files trong repo:**

- `tools/biometric-bridge/README.md`
- Tối đa hai script dưới `tools/biometric-bridge/scripts/` nếu cần.

**Deliverables:**

1. Preflight: Python/runtime dependency, HN212Plugin, NIC, ports 8000/18080/18081, cert state.
2. Install/start bridge at Windows login/service using native capability; uninstall/rollback documented.
3. Generate/install loopback HTTPS certificate có SAN phù hợp.
4. Firewall chỉ mở PUSH 18081 trên dedicated private NIC; browser API loopback-only.
5. Không embed secrets trong scripts.

**Safety:** tạo script được phép trong repo. Thực sự trust certificate, firewall, startup là thay đổi hệ thống ngoài workspace; dừng và xin xác nhận ngay trước khi chạy.

**Gate:** restart Windows process vẫn đọc được DPAPI secrets; browser HTTPS gọi bridge không certificate/mixed-content error.

### Slice 5 — Frontend local-biometric feature

**Exact feature files dự kiến:**

- `src/features/local-biometric/types/local-biometric-contract.ts`
- `src/features/local-biometric/repositories/local-biometric-repository.ts`
- `src/features/local-biometric/resources/local-biometric-resource.ts`
- `src/features/local-biometric/hooks/use-local-biometric.ts`
- UI components tối thiểu trong cùng feature.

**Rules:**

1. Repository owns loopback HTTPS transport, auth header, DTO validation/mapping.
2. Resource dùng package đã có `@dangminhdev04032005/query-resource`.
3. Components không raw fetch/query config.
4. Local pairing token không đi qua Next API/server component.
5. Network errors map thành actionable local codes; không lộ technical details.
6. Polling dừng khi unmount, terminal state hoặc timeout; không loop vô hạn.

**Tests:** repository URL forced loopback HTTPS; pairing token header local-only; abort/timeout; resource capability; enrollment polling terminal-state; malformed bridge payload rejected.

### Slice 6 — Settings UI và navigation

Không có Settings route hiện hữu. Tạo shared feature, hai thin route shells để đúng persona đang có:

```text
/owner/hotels/{hotelId}/settings/biometric-devices
/hotels/{hotelId}/settings/biometric-devices
```

**Navigation files đã xác minh:**

- `src/features/workspace/config/workspace-registry.ts`
- `src/features/workspace/config/workspace-registry.test.ts`

**Access:** owner, manager, front desk có capability vận hành stay/room phù hợp. Không thêm RBAC capability backend mới trong slice này. Nếu policy hiện tại không phân biệt “xem” và “cấu hình thiết bị” đủ an toàn: `BLOCKED RBAC`, đề xuất capability riêng; không tự mở rộng quyền.

**UI:**

1. Pair Local Bridge.
2. Bridge install/connect status.
3. HN-212 guide/status.
4. SenseFace network/TCP/PUSH config/status.
5. Summary Ready/Partial/Not ready.
6. Non-destructive test scan + preview + discard.
7. Link quay lại Check-in.
8. Accessible live region, keyboard flow, status text không chỉ màu.

**Tests:** nav owner/staff; unauthorized persona absent; no bridge; unpaired; HN-only; all-ready; wrong serial; readiness expired; test scan leaves no enrollment; secret never rendered after submit.

### Slice 7 — Check-in orchestration

**Graph-selected current files:**

- `src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/owner-stay-room-grid-client.tsx`
- staff equivalent chỉ sau Graphify query xác nhận exact component.
- `src/features/hotel-ops/types/hotel-ops-contract.ts`
- existing stays Next route chỉ sửa nếu contract test chứng minh cần; không proxy local Bridge.
- focused tests cạnh existing room/check-in tests.

**UX:**

```text
[Nhập thủ công] [Quét CCCD]
```

1. Manual luôn enabled.
2. Scan checks non-expired readiness; stale thì chạy diagnostics lại.
3. Bridge+HN ready cho scan; SenseFace offline chỉ cảnh báo FaceID unavailable.
4. Preview name, portrait, masked CCCD, ChipAuthen/SOD; rescan/cancel.
5. Submit existing GuestStay API.
6. Validate `result.data.stay.id` non-empty.
7. Nếu faceReady và CHECK_IN scan: call local `/enrollments`.
8. Nếu face không ready: GuestStay vẫn success; UI cho “Thiết lập/Thử enroll sau” chỉ khi pending scan còn hạn.
9. Enrollment failure giữ GuestStay, hiển thị retry. Retry chỉ gọi local request.
10. Không refresh/unmount làm mất thông báo failure trước khi operator thấy; room data refresh tách khỏi enrollment status panel.

**Acceptance tests:**

- manual works with bridge offline/unpaired.
- scan points to Settings before setup.
- HN ready + SenseFace offline scans and saves stay without false `SYNCED`.
- card placement leaves GuestStay/device queue unchanged.
- backend failure leaves no user/PUSH.
- enrollment never starts before backend 201 + stay ID.
- missing stay ID yields visible local-enrollment failure, no second POST.
- device failure preserves successful check-in.
- retry reuses stay/request and does not create second stay.
- `SYNCED` only after matching face ACK `return=0`.

### Slice 8 — Automated quality gates

```bash
cd /workspace/fullstack-vietSage/tools/biometric-bridge
python -m unittest -v test_biometric_api.py test_push_receiver.py test_zkteco_bridge.py test_hn212_client.py test_local_settings.py
python -m py_compile bridge_app.py biometric_api.py hn212_client.py push_receiver.py zkteco_bridge.py local_settings.py

cd /workspace/app_sinh_trac/scan-receiver
python -m unittest -v test_push_receiver.py test_zkteco_bridge.py
python -m py_compile push_receiver.py zkteco_bridge.py
```

Frontend commands phải lấy từ scripts hiện có; không đoán, không sửa package. Chạy theo thứ tự:

1. focused tests;
2. typecheck;
3. lint changed scope;
4. production build nếu là gate hiện hữu.

Thêm:

- scoped secret scan;
- exact changed-path audit;
- pre-existing dirty diff comparison;
- browser smoke với Bridge simulated local process;
- no external/system mutation.

### Slice 9 — Hardware E2E từng bước

Không batch. Chờ user xác nhận từng bước.

1. Bridge HTTPS chạy, paired.
2. HN-212 cắm; HN212Plugin ready.
3. Diagnostics Bridge/HN PASS.
4. TEST scan một CCCD được phép; preview ChipAuthen/SOD; discard; xác minh không DB/user/PUSH.
5. SenseFace LAN/TCP/PUSH ready; serial đúng.
6. Real Check-in: scan → review → Submit → GuestStay ID.
7. Xác minh SenseFace user create/update.
8. Xác minh PUSH `Type=9`.
9. Chờ ACK `return=0`; UI `SYNCED`.
10. Thử nhận diện khuôn mặt; xác minh event đúng identity.
11. Negative: ngắt SenseFace sau scan, Submit vẫn tạo GuestStay, enrollment `FAILED`, retry không tạo stay thứ hai.

Không gọi delete API. Hardware chưa sẵn = `BLOCKED hardware-E2E`, không “Hoàn tất”.

### Slice 10 — Review và context completion

1. Review spec compliance.
2. Review code quality/security/race.
3. Chạy gates sau mọi sửa review.
4. `graphify update .` tại module boundary.
5. Regenerate bounded Repomix packs cho bridge/frontend; mỗi pack ≤20k tokens.
6. Chạy standard sync-context với explicit scope JSON.
7. `app_sinh_trac` không có Graphify: chỉ báo exact files/tests; không tự cài Graphify.
8. Context stale = `BLOCKED context-sync`.

## 9. File budget dự kiến

| Slice | Files | Giới hạn |
|---|---:|---:|
| Bridge hardening/settings/diagnostics | 8–12 | ≤20k tokens/pack |
| Frontend feature/settings | 10–14 | ≤20k tokens/pack |
| Check-in integration | 4–8 | ≤20k tokens/pack |
| app_sinh_trac parity | 4 | exact files only |

Không mở cả repo. Mỗi file phải có lý do từ Graphify/contract/test.

## 10. Definition of Done

- [ ] Settings owner/staff hoạt động trên máy lễ tân.
- [ ] Pairing + DPAPI secrets; không plaintext fallback.
- [ ] Bridge/HN/SenseFace diagnostics chính xác; expected serial enforced.
- [ ] Readiness TTL 60 giây; `scanReady`/`faceReady` tách đúng.
- [ ] Manual luôn dùng được.
- [ ] TEST scan không DB/user/PUSH, discard sạch.
- [ ] CHECK_IN scan pending đến explicit Submit.
- [ ] GuestStay được tạo trước enrollment.
- [ ] User create/update trước PUSH `Type=9`.
- [ ] `SYNCED` chỉ matching ACK `return=0`.
- [ ] Retry idempotent; không GuestStay/queue trùng.
- [ ] Race, stale ACK, body limit, path traversal có regression tests.
- [ ] Không leak secrets/full CCCD/portrait/opaque IDs vào VPS/Git/log.
- [ ] Python/frontend automated gates PASS.
- [ ] Windows HTTPS/startup smoke PASS sau xác nhận hệ thống.
- [ ] Real HN-212 + SenseFace E2E PASS.
- [ ] Graphify + bounded Repomix current.
- [ ] Exact diff không chứa dirty work ngoài scope.

## 11. Blockers và quyết định không được tự đoán

- Browser production HTTPS chưa chứng minh trust loopback certificate.
- ACK command-ID format phải lấy từ sanitized real fixture/manual trước khi bắt buộc correlation parser.
- HN-212 physical scan vẫn pending.
- Nếu quyền hiện tại không đủ tách cấu hình thiết bị khỏi view/check-in: xin duyệt RBAC slice riêng.
- Nếu DPAPI/startup/certificate cần thay đổi máy Windows: xin xác nhận trước thao tác.

## 12. Ước tính

- Code + automated tests: **24–36 giờ**.
- Windows operational smoke: **2–4 giờ**.
- Hardware E2E: phụ thuộc thiết bị/operator, không gộp vào cam kết code.

Ước tính tăng so với bản review đầu vì bổ sung pairing, DPAPI, certificate/startup, exact diagnostics và concurrency gates. Đây là mức hoàn thiện production-safe của module, không phải demo.
