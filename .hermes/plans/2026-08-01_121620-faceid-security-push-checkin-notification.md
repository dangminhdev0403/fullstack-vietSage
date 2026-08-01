# FaceID Security PUSH Check-in to Hotel Notification Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Sau khi quét CCCD và check-in thành công, lưu hồ sơ tối thiểu + ảnh mặt xuống SenseFace; khi khách xác thực mặt, VietSage lưu sự kiện và thông báo đúng khách sạn.

**Architecture:** SenseFace chủ động kết nối tới HTTPS Security PUSH listener trên máy lễ tân. VietSage cloud tạo job bền vững; receiver đã ghép nối poll job bằng outbound HTTPS, chuyển job thành lệnh PUSH trả qua `/iclock/getrequest`, nhận ACK tại `/iclock/devicecmd`, nhận recognition tại `rtlog`/`transaction`, rồi upload sự kiện về cloud. TCP `4370` không mở Internet; chỉ giữ làm read-only capability probe/fallback có kiểm chứng.

**Tech Stack:** ZKTeco Security PUSH Protocol 2025, Python stdlib receiver, DPAPI workstation credential, NestJS/Prisma/PostgreSQL, Next.js/query-resource, existing hotel-scoped realtime infrastructure.

---

## 1. Nguồn protocol và quy tắc bảo mật tài liệu

Nguồn cục bộ đã kiểm tra:

```text
C:\Users\Dangminhdev0403\Desktop\workspace\vietsage-biometric-local\ZKTeco Security PUSH Protocol-20250429-confidential\
```

Có:

- `Security PUSH Communication Protocol 20250429.pdf`
- `Brief Analysis of AC Push Protocol-only for reference.docx`
- Java demo source `demo/java/pushdemo-acc/src/...`
- `DeviceSettingTool(ENG)-V4.0.exe`

Quy tắc:

- Không chạy `.exe` trong quá trình phát triển tự động.
- Không commit/copy protocol PDF, DOCX, ZIP, demo binary vào fullstack repo.
- Chỉ dùng tài liệu làm reference cục bộ; tests dùng fixture tự viết tối thiểu, không sao chép tài liệu dài.
- Không log SN đầy đủ, PIN, ảnh Base64, CCCD hoặc template.

## 2. Contract đã xác nhận từ protocol 2025

### Device lifecycle

```text
GET/POST /iclock/cdata
POST     /iclock/registry
GET      /iclock/push
GET      /iclock/getrequest
POST     /iclock/devicecmd
GET      /iclock/ping
POST     /iclock/querydata
POST     /iclock/fdata
```

- Device chủ động gọi server.
- `/iclock/push` trả `Realtime=1` để nhận event ngay.
- `/iclock/getrequest` lấy command `C:<CmdID>:...`.
- `/iclock/devicecmd` trả `ID`, `Return`, `CMD`.
- Một command outstanding cho mỗi device cho đến khi ACK hoặc timeout.

### Provision user

```text
C:<id>:DATA UPDATE user CardNo=\tPin=<opaquePin>\tPassword=\tGroup=0\tStartTime=0\tEndTime=0\tName=<shortName>\tPrivilege=0\tDisable=0
```

- `Pin` là ID tương quan duy nhất.
- Không dùng CCCD, phone, stayId hoặc tên làm PIN.
- Tạo PIN số opaque theo `(hotelId, deviceId)`.
- Sanitize tab/newline; giới hạn tên theo firmware.

### Provision visible-light face

```text
C:<id>:DATA UPDATE biophoto PIN=<opaquePin>\tType=9\tNo=0\tIndex=0\tSize=<base64Length>\tContent=<jpegBase64>\tFormat=0\tPostBackTmpFlag=1
```

- `Type=9` khi server gửi visible-light face.
- `Size` là số ký tự Base64, không phải byte JPEG.
- `Format=0` là inline Base64.
- `PostBackTmpFlag=1` yêu cầu device tạo/trả template nếu firmware hỗ trợ; VietSage không lưu template.
- Chỉ gửi JPEG hợp lệ, bounded size.

### Command success

- Lưu raw `Return`.
- Mặc định chỉ `Return=0` là success cho vertical slice.
- Protocol chung nói một số command có thể thành công với mã không âm; chỉ allowlist mã khác sau hardware evidence trên đúng model/firmware.
- User ACK phải success trước khi phát face command.
- Face ACK success mới chuyển enrollment thành `ENROLLED`.

### Recognition event

Realtime:

```text
POST /iclock/cdata?SN=<serial>&table=rtlog
```

Offline replay:

```text
POST /iclock/cdata?SN=<serial>&table=transaction
```

Payload có tối thiểu:

```text
time=<deviceTime>\tpin=<opaquePin>\tevent=<code>\tverifytype=<value>\tindex=<value>
```

- Preserve `event`, `verifytype`, `index`, `inoutstatus`, raw optional fields.
- New `verifytype` có thể là bit-string; không đoán “face” nếu firmware chưa được test.
- Dedupe key đề xuất: hash `(SN, table, index, time, pin, event, verifytype)`.
- Device có thể replay offline records; API phải idempotent.

### Targeted removal

```text
DATA DELETE userauthorize Pin=<opaquePin>
DATA DELETE biophoto PIN=<opaquePin> Type=9
DATA DELETE user Pin=<opaquePin>
```

- Chạy tuần tự, ACK từng command.
- Không clear attendance, không reset device, không xóa user khác.

---

## 3. Flow sản phẩm chốt

```text
1. Nạp CCCD
2. Receiver trả identity + portrait tạm thời
3. Lễ tân kiểm tra dữ liệu
4. Khách đồng ý FaceID
5. VietSage tạo/check-in GuestStay
6. Sau check-in success, upload portrait riêng theo stayId
7. Cloud tạo enrollment + ENROLL_FACE job
8. Receiver hotel-scoped claim job bằng outbound HTTPS
9. PUSH listener trả DATA UPDATE user
10. Device ACK user Return=0
11. PUSH listener trả DATA UPDATE biophoto
12. Device ACK face Return=0
13. Receiver ACK cloud; UI hiện “Đã lưu khuôn mặt”
14. Khách nhìn thiết bị
15. Device POST rtlog; receiver parse + spool
16. Receiver upload recognition bằng credential hotel-scoped
17. Cloud derive hotel từ credential/device mapping, persist + dedupe
18. Cloud publish hotel-scoped refresh signal
19. Tab FaceID/dashboard đúng hotel hiện thông báo
20. Checkout tạo REMOVE_FACE job; device xóa đúng PIN
```

Điểm bắt buộc:

- CCCD scan không tự enroll.
- Check-in lỗi thì không enroll.
- FaceID lỗi không rollback stay đã check-in.
- Receiver payload không được tự quyết định `hotelId`; server derive từ credential + registered device SN.
- Notification realtime không phải source of truth; recent-events API đọc DB.

---

## 4. State machines

### Cloud enrollment

```text
PENDING
→ CLAIMED
→ USER_COMMAND_SENT
→ USER_ACKED
→ FACE_COMMAND_SENT
→ ENROLLED
```

Failure/recovery:

```text
* → RETRY_WAIT → CLAIMED
* → FAILED
PENDING|CLAIMED → CANCELLED
```

Rules:

- Claim lease có expiry.
- User command id và face command id lưu riêng.
- Retry sau lost response phải reuse semantic idempotency; không tạo nhiều PIN.
- Nonzero user ACK dừng trước face.
- Nonzero face ACK không báo enrolled.
- Photo purge ngay sau `ENROLLED`, consent withdrawal, terminal reject, hoặc TTL.

### Local command queue

```text
QUEUED → DELIVERED → ACKED
              ↘ TIMED_OUT
              ↘ REJECTED
```

- Một outstanding command/device.
- ACK phải match exact `(SN, CmdID)`.
- ACK cũ/khác device bị bỏ và audit an toàn.
- Restart phải khôi phục queue/ACK state từ SQLite; không dùng memory-only.

### Recognition

```text
RECEIVED_LOCAL
→ SPOOLED
→ UPLOADED
→ CLOUD_ACKED
```

Cloud classification:

```text
MATCHED_ACTIVE_STAY
MATCHED_INACTIVE_STAY
UNKNOWN_PIN
DUPLICATE
UNPROVEN_METHOD
```

Chỉ `MATCHED_ACTIVE_STAY` + method face đã chứng minh mới bật success notification.

---

## 5. Data model tối thiểu

Trong `services/auth-service/prisma/schema.prisma`:

### `BiometricDevice`

- `id`, `hotelId`, `serialHash`, encrypted/full serial only if operationally required
- `model`, `firmware`, `displayName`, `status`, `lastSeenAt`
- `capabilities Json`
- unique `(hotelId, serialHash)`

### `BiometricEnrollment`

- `id`, `hotelId`, `stayId`, `deviceId`, `deviceUserId`
- `displayNameSnapshot`
- `consentRecordedAt`, `consentRecordedByUserId`
- `status`, `lastErrorCode`
- encrypted temporary photo reference/blob, `photoExpiresAt`
- `userCommandId`, `faceCommandId`, `enrolledAt`, `removedAt`
- unique `(hotelId, stayId, deviceId)`
- unique `(deviceId, deviceUserId)`

### `BiometricDeviceJob`

- `id`, `hotelId`, `deviceId`, `enrollmentId`
- `type ENROLL_FACE | REMOVE_FACE`
- claim lease, idempotency key, status, attempts, nextAttemptAt, error code

### `BiometricRecognitionEvent`

- `id`, `hotelId`, `deviceId`, nullable `enrollmentId`, nullable `stayId`
- `providerEventId`, `deviceUserId`, `occurredAt`, `receivedAt`
- `sourceTable`, `eventCode`, `verifyType`, `deviceIndex`, `inOutStatus`
- `classification`, `method`
- unique `(deviceId, providerEventId)`

Không tái dùng `GuestRequestNotification` hoặc coi `DomainEvent(PENDING)` là job queue.

---

## 6. Phased implementation

## Phase 0 — Protocol emulator contracts, không chạm hardware

**Objective:** Khóa parser/serializer/state machine trước khi đổi cấu hình SenseFace.

Create in local receiver:

- `app/security_push_protocol.py`
- `app/security_push_store.py`
- `tests/test_security_push_protocol.py`
- `tests/test_security_push_store.py`

Tests RED→GREEN:

1. Build user command; sanitize tab/newline; nonzero unique CmdID.
2. Build biophoto; reject non-JPEG/oversize; exact Base64 `Size`; `Type=9`.
3. Parse ACK; require matching SN/CmdID; preserve raw Return.
4. User reject blocks face.
5. Face ACK `0` completes.
6. Two sequential enrollments reset to user stage correctly.
7. Parse `rtlog` and `transaction` with optional fields.
8. Duplicate event inserts once.
9. Restart restores queue and local event spool.
10. `/iclock/fdata` responds success and does not block `/getrequest`.

No hardware action in this phase.

## Phase 1 — Real SenseFace Security PUSH gate

**Objective:** Prove exact protocol behavior on the current SenseFace firmware with one synthetic PIN.

1. Record model, masked SN, firmware, face algo, counts.
2. Read capabilities: `BioPhotoFun`, `MultiBioPhotoSupport`, `MaxMultiBioPhotoCount`, PUSH version.
3. Start dedicated LAN HTTPS PUSH listener; keep CCCD/UI listener loopback.
4. Configure device server IP/port once; no reset/initialize.
5. Verify sequence `/cdata → /registry → /push → /getrequest`.
6. Verify `Realtime=1`.
7. Send user command for synthetic PIN; require ACK.
8. Query/read back exact PIN.
9. Send one authorized test JPEG; require face ACK.
10. Present authorized face; capture raw `rtlog` event and establish exact `event` + `verifytype` for face success.
11. Disconnect/reconnect network; verify offline `transaction` replay dedupes.
12. Delete biophoto/user for exact PIN; verify unrelated users and attendance unchanged.

**Gate:** Không triển khai cloud enrollment cho đến khi user, face, recognition, offline replay, targeted removal đều PASS.

## Phase 2 — Local receiver production integration

Modify/create:

- `app/receiver_server.py` — lifecycle/orchestration only
- `app/workstation_client.py` — cloud claim/ACK/event upload
- `app/security_push_server.py` — `/iclock/*` listener
- `app/security_push_protocol.py` — pure parser/builders
- `app/security_push_store.py` — SQLite command/event spool
- `app/settings.py` or existing settings layer — device LAN config, never secrets in source
- tests for each seam

Network boundary:

```text
127.0.0.1:8765       operator UI/CCCD receiver
<LanPCIP>:<pushPort>  SenseFace HTTPS PUSH only
https://VietSage     outbound cloud only
```

- Firewall Private profile only for push port.
- No public port-forward.
- TLS cert scoped to LAN IP, accepted by exact device.
- One process owns PUSH/device; remove competing legacy bridge runtime.

## Phase 3 — Backend biometric module + migration

Create:

- `services/auth-service/src/modules/biometrics/biometrics.module.ts`
- domain schemas/state transitions
- application enrollment/job/recognition services
- repository
- management + receiver controllers
- focused specs

Modify:

- `services/auth-service/prisma/schema.prisma`
- new canonical migration directory
- `services/auth-service/src/app.module.ts`
- Property public boundary for checkout removal
- OpenAPI export/shared generated contract

Receiver APIs:

```text
POST /biometric/workstations/devices/register
POST /biometric/workstations/jobs/claim
POST /biometric/workstations/jobs/{jobId}/ack
POST /biometric/workstations/recognitions
POST /biometric/workstations/heartbeat
```

Management APIs:

```text
POST /hotels/{hotelId}/stays/{stayId}/face-enrollments
GET  /hotels/{hotelId}/stays/{stayId}/face-enrollments
POST /hotels/{hotelId}/face-enrollments/{id}/retry
DELETE /hotels/{hotelId}/face-enrollments/{id}
GET  /hotels/{hotelId}/biometric-recognitions
GET  /hotels/{hotelId}/biometric-devices
```

Hotel isolation tests:

- Credential A cannot claim/ACK/post for device B.
- Server ignores/rejects payload hotelId mismatch.
- Device SN belongs to one registered hotel.
- Same event resend creates one row.

## Phase 4 — Check-in handoff

Modify:

- `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace.tsx`
- `types/check-in-workspace.ts`
- owner/staff stay clients

Create frontend layers:

- `repositories/face-enrollment-repository.ts`
- `resources/face-enrollment-resource.ts`
- `hooks/use-face-enrollment.ts`

UX:

- Consent unchecked by default.
- Explain purpose + deletion at checkout + manual alternative.
- Preserve volatile portrait until check-in response returns `stay.id`.
- Portrait sent through separate enrollment API, never added to stay DTO/query key/log.
- Show `Đang gửi → Đã lưu khuôn mặt` only from backend status.
- Failed enrollment offers retry; does not rollback room/stay.

Tests:

- no consent/no portrait/check-in failure means no enrollment;
- success sends once with idempotency key;
- retry reuses enrollment;
- sensitive image absent from stay body, localStorage, URL and logs.

## Phase 5 — FaceID horizontal tab + hotel notification

Use existing horizontal tab in:

```text
/owner/hotels/{hotelId}/biometric
[ CCCD ] [ FaceID ]
```

Replace the current BroadcastChannel-only simulation with:

- device health + masked SN + last seen;
- enrollment/job status;
- recent recognition list from backend;
- authenticated hotel-scoped realtime refresh;
- visible toast/banner and optional sound;
- clearly separate `Gửi sự kiện kiểm thử` available only in dev/test mode.

Realtime event contains IDs/status only. UI refetches canonical API row. Opening hotel A and B simultaneously must prove A event never appears in B.

## Phase 6 — Checkout cleanup and recovery

- Checkout creates idempotent `REMOVE_FACE` job after canonical stay closure.
- Offline device keeps pending job; checkout still succeeds.
- Receiver sends targeted delete commands and ACKs each.
- Never clear attendance or reset terminal.
- Cancel pending enroll if checkout occurs before face ACK.
- Purge transient photo on enrollment success/failure TTL/withdrawal.

Recovery tests:

- device success then receiver crash before cloud ACK;
- cloud insert then response loss;
- expired claim reclaimed;
- device offline across checkout;
- duplicate offline transaction upload;
- time skew and malformed rtlog;
- command ACK from wrong SN;
- unknown PIN and inactive stay do not emit green success.

---

## 7. Acceptance test, one physical action per step

1. Verify synthetic PIN absent and record baseline counts.
2. Start receiver; verify exact device registers through Security PUSH.
3. Scan authorized CCCD; verify identity + portrait pending only.
4. Check consent; complete check-in.
5. Verify GuestStay commits before FaceID finishes.
6. Verify cloud enrollment/job created for correct hotel/stay/device.
7. Verify device requests and ACKs user command.
8. Verify device requests and ACKs biophoto command.
9. Verify cloud enrollment `ENROLLED`; photo purged.
10. Present face once.
11. Verify one raw `rtlog`, one cloud event, one correct-hotel notification.
12. Replay same event; verify no duplicate.
13. Disconnect network, present face, reconnect; verify `transaction` replay once.
14. Checkout.
15. Verify targeted user/biophoto deletion; unrelated users/logs unchanged.

---

## 8. Validation commands

Local receiver:

```bash
cd C:/Users/Dangminhdev0403/Desktop/workspace/vietsage-biometric-local
PYTHONPATH=app python -m unittest tests.test_security_push_protocol tests.test_security_push_store tests.test_receiver_server tests.test_workstation_client
python -m py_compile app/security_push_protocol.py app/security_push_store.py app/security_push_server.py app/workstation_client.py
```

Backend:

```bash
cd C:/Users/Dangminhdev0403/Desktop/workspace/fullstack-vietSage/services/auth-service
npm test -- --runInBand biometric
npx prisma validate
npm run openapi:export
npm run build
```

Frontend:

```bash
cd C:/Users/Dangminhdev0403/Desktop/workspace/fullstack-vietSage/frontends/front-end-vietsage
node --experimental-strip-types --test <focused FaceID tests>
npx eslint <changed files>
npx tsc --noEmit --pretty false
npm run build
```

---

## 9. Rollout/rollback

Feature flags:

```text
BIOMETRIC_FACE_ENROLLMENT_ENABLED
BIOMETRIC_RECOGNITION_INGEST_ENABLED
NEXT_PUBLIC_BIOMETRIC_RECOGNITION_UI_ENABLED
```

Rollout:

1. Protocol parser/emulator.
2. One real device + synthetic PIN.
3. Backend dark APIs.
4. One hotel allowlist enrollment.
5. Recognition persistence without notification.
6. Hotel-scoped notification.
7. Checkout cleanup.
8. Wider rollout.

Rollback:

- Disable new enrollment jobs first.
- Keep ACK/event ingest active to drain issued work.
- Keep pending removal jobs.
- Disable realtime UI without disabling canonical event API.
- Never rollback by factory reset, bulk delete, or attendance clear.

---

## 10. Non-goals

- No cloud face matching.
- No raw template storage in VietSage.
- No TCP 4370 exposed publicly.
- No direct browser-to-LAN device API.
- No CCCD number as terminal PIN.
- No auto-enrollment before check-in/consent.
- No Telegram-first delivery.
- No broker/new dependency until measured need.
- No production use of the Java demo application.

## 11. Approval boundary

Approve **Phase 0 + Phase 1 only first**. Deliverable: protocol tests plus one controlled synthetic-PIN hardware proof covering user ACK, face ACK, `rtlog`, offline `transaction`, and targeted deletion. Không thay đổi production DB, không enroll khách thật, không deploy cloud trong boundary này.
