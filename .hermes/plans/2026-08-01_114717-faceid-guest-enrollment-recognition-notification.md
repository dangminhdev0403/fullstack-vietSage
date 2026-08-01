# FaceID Guest Enrollment, Recognition, and Notification Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Sau check-in thành công và có consent, đồng bộ tên khách + ảnh mặt xuống SenseFace 7A; khi thiết bị nhận diện, VietSage lưu sự kiện và thông báo cho lễ tân.

**Architecture:** Giữ SenseFace trong LAN. VietSage tạo job bền vững; receiver đã ghép nối chủ động poll qua outbound HTTPS, thực hiện TCP/PUSH nội bộ, ACK kết quả. Recognition đi chiều ngược lại qua HTTPS, được persist + dedupe trước khi realtime. Không mở TCP 4370 ra Internet, không coi socket là nguồn sự thật.

**Tech Stack:** NestJS modular monolith, Prisma/PostgreSQL, Next.js, existing workstation credential channel, Python SenseFace bridge, ZKTeco TCP 4370 + HTTPS PUSH/ADMS.

---

## 1. Evidence and current state

### Verified hardware/runtime

- Device: ZKTeco SenseFace 7A.
- Device protocol verified locally: TCP `4370`.
- Face algorithm: ZKFace VX4.0.
- Existing bridge already supports:
  - creating/updating a terminal user;
  - PUSH `DATA UPDATE biophoto` with `Type=9`, `PostBackTmpFlag=1`;
  - waiting for `/iclock/devicecmd` ACK and accepting success only when `Return=0`;
  - polling attendance records;
  - mapping verified firmware status `15 -> face`, `1 -> fingerprint`;
  - dedupe by `(userId, timestamp, statusCode, punchCode)`;
  - local SSE events.

### Verified VietSage gaps

- `GuestStay` stores identity metadata, not portrait/biometric enrollment state.
- CCCD portrait is volatile and intentionally omitted from the current stay request.
- Workstation pairing/scan channel is currently Next.js process-local; multi-instance production is not safe.
- No Prisma model exists for biometric devices, enrollment jobs, templates, or recognition events.
- Existing Telegram notification schema is guest-service-specific and must not be reused for FaceID.
- `DomainEvent` rows exist, but no durable dispatcher currently exists. A PENDING row alone is not a queue.

### Constraints

- Enroll only after successful check-in and explicit guest consent.
- Do not use government ID as terminal PIN. Generate a hotel-scoped opaque numeric `deviceUserId`.
- Device receives only required fields: opaque PIN, short display name, validity window if firmware supports it, face photo.
- Never log portrait Base64, face template, full CCCD, or raw provider payload.
- TCP `4370` remains LAN-only.
- Checkout removal deletes the guest user/face template only; it must not clear device attendance history or unrelated users.
- Browser notification is UX; persisted recognition event is authoritative.

---

## 2. Target flow

```text
HN-212 scan
  -> browser holds volatile CCCD portrait
  -> operator reviews + records consent
  -> createAndCheckInStay commits GuestStay
  -> frontend uploads portrait against returned stayId
  -> core API stores encrypted/opaque short-lived photo + ENROLL job
  -> paired receiver polls outbound HTTPS
  -> receiver creates/updates opaque terminal PIN through TCP 4370
  -> receiver queues biophoto through local HTTPS PUSH
  -> SenseFace ACK Return=0
  -> receiver ACKs ENROLLED to VietSage
  -> UI shows FaceID ready

Guest presents face
  -> SenseFace attendance record
  -> receiver normalizes + dedupes
  -> receiver POSTs signed event to VietSage
  -> core API dedupes + persists recognition event
  -> event publisher emits hotel-scoped refresh signal
  -> reception dashboard shows toast/banner + optional sound

Checkout
  -> GuestStay checkout commits
  -> REMOVE job created
  -> receiver deletes only mapped device user/face
  -> receiver ACKs REMOVED
  -> enrollment mapping retained as audit metadata without portrait/template
```

---

## 3. Canonical state machines

### Enrollment

```text
PENDING -> CLAIMED -> USER_PROVISIONED -> FACE_QUEUED -> ENROLLED
       -> RETRY_WAIT -> CLAIMED
       -> FAILED
       -> CANCELLED
```

Rules:

- `ENROLLED` only after face command ACK `Return=0`.
- HTTP delivery, TCP connection, user presence, or queue insertion are not success.
- One active enrollment per `(hotelId, stayId, deviceId)`.
- Same idempotency key returns existing job.
- Nonzero device ACK records provider code, stops blind retry.
- Retry only transient network/timeouts with bounded exponential backoff.

### Recognition

```text
RECEIVED -> MATCHED_ACTIVE_STAY | MATCHED_INACTIVE_STAY | UNKNOWN_PIN | DUPLICATE
```

Rules:

- Unique key: `(deviceId, providerEventId)` where `providerEventId` is a hash of serial/PIN/timestamp/status/punch.
- Resolve through `(hotelId, deviceId, deviceUserId)`, never by name.
- Notify prominently only for `MATCHED_ACTIVE_STAY` and proven `method=face`.
- Preserve raw numeric status/punch; unknown firmware codes remain `unknown`.

### Removal

```text
PENDING -> CLAIMED -> REMOVED
       -> RETRY_WAIT -> CLAIMED
       -> FAILED
```

Rules:

- Removal targets exact `(deviceId, deviceUserId)`.
- No global clear/reset APIs.
- Checkout remains successful even if device is offline; removal retries asynchronously.

---

## 4. Minimal data model

Create a dedicated `biometrics` backend module. Do not put device integration persistence inside Property repositories.

### `BiometricDevice`

- `id`, `hotelId`, `serialHash`/masked serial, `displayName`, `model`, `status`
- `lastSeenAt`, `capabilities`, `createdAt`, `updatedAt`
- unique `(hotelId, serialHash)`

### `BiometricEnrollment`

- `id`, `hotelId`, `stayId`, `deviceId`
- `deviceUserId` opaque numeric string
- `displayNameSnapshot`
- `consentRecordedAt`, `consentRecordedByUserId`
- `status`, `attemptCount`, `nextAttemptAt`, `lastErrorCode`
- `photoCiphertext` or equivalent encrypted short-lived blob
- `photoExpiresAt`, `enrolledAt`, `removedAt`
- unique `(hotelId, stayId, deviceId)`
- unique `(deviceId, deviceUserId)`

Photo policy:

- Encrypt before persistence with a dedicated runtime key; never source-control the key.
- Delete/null photo immediately after `ENROLLED`, terminal rejection, consent withdrawal, or TTL expiry.
- Do not store generated face template in VietSage.

### `BiometricRecognitionEvent`

- `id`, `hotelId`, `deviceId`, nullable `enrollmentId`, nullable `stayId`
- `providerEventId`, `deviceUserId`, `occurredAt`, `receivedAt`
- `method`, `result`, `statusCode`, `punchCode`
- unique `(deviceId, providerEventId)`
- indexes `(hotelId, occurredAt)`, `(stayId, occurredAt)`

### `BiometricDeviceJob`

Use an explicit job table, not `DomainEvent`, because the receiver must claim/ACK work.

- `id`, `hotelId`, `deviceId`, nullable `enrollmentId`
- `type`: `ENROLL_FACE | REMOVE_USER`
- `status`: `PENDING | CLAIMED | RETRY_WAIT | COMPLETED | FAILED | CANCELLED`
- `idempotencyKey`, `claimedBy`, `claimExpiresAt`
- `attemptCount`, `nextAttemptAt`, `lastErrorCode`
- `createdAt`, `completedAt`

---

## 5. Implementation phases

## Phase 0 — Real-device capability gate

**Purpose:** Avoid building cloud orchestration on unverified deletion/provision behavior.

1. Record device model, serial suffix, firmware, ZKFace version, user count, face count.
2. Confirm PUSH options: `FaceFunOn`, `BioPhotoFun`, `MultiBioPhotoSupport`, capacity.
3. Create one opaque numeric test PIN, not a real CCCD.
4. Provision user through TCP; read it back.
5. PUSH one JPEG via `biophoto`; require `Return=0`.
6. Present the test face; prove attendance status `15` on this firmware.
7. Verify exact single-user deletion API and that unrelated users/logs remain.
8. Clean only the test user/template.

**Gate:** Do not start cloud integration until enroll, recognize, and targeted removal are all proven on this device.

Likely files:

- `tools/biometric-bridge/zkteco_bridge.py`
- `tools/biometric-bridge/push_receiver.py`
- `tools/biometric-bridge/test_zkteco_bridge.py`
- `tools/biometric-bridge/test_push_receiver.py`

---

## Phase 1 — Backend biometric domain and migrations

**Files likely to create:**

- `services/auth-service/src/modules/biometrics/biometrics.module.ts`
- `services/auth-service/src/modules/biometrics/biometrics-public.ts`
- `services/auth-service/src/modules/biometrics/domain/biometric.schema.ts`
- `services/auth-service/src/modules/biometrics/application/biometric-enrollment.service.ts`
- `services/auth-service/src/modules/biometrics/application/biometric-device-jobs.service.ts`
- `services/auth-service/src/modules/biometrics/application/biometric-recognition.service.ts`
- `services/auth-service/src/modules/biometrics/infrastructure/biometric.repository.ts`
- `services/auth-service/src/modules/biometrics/api/biometric-management.controller.ts`
- `services/auth-service/src/modules/biometrics/api/biometric-workstation.controller.ts`
- focused specs beside each service/controller

**Files to modify:**

- `services/auth-service/prisma/schema.prisma`
- new canonical migration under `services/auth-service/prisma/migrations/`
- `services/auth-service/src/app.module.ts`
- `services/auth-service/src/modules/property/application/hotel-rooms.service.ts`
- Property public port only where checkout must request removal
- OpenAPI/generated contract artifacts

**TDD sequence:**

1. RED: opaque numeric `deviceUserId` allocation is unique per device and never equals CCCD.
2. GREEN: allocator + DB uniqueness retry.
3. RED: enrollment requires active stay, hotel scope, portrait, consent, supported device.
4. GREEN: create enrollment + ENROLL job transactionally.
5. RED: duplicate idempotency key returns same job.
6. GREEN: idempotent create.
7. RED: receiver claim is hotel/device scoped; expired claims can be reclaimed.
8. GREEN: bounded claim lease.
9. RED: `Return=0` completes; nonzero ACK fails without claiming success.
10. GREEN: ACK transition logic.
11. RED: recognition duplicate creates one row; wrong-hotel PIN cannot resolve.
12. GREEN: persistence + mapping.
13. RED: checkout creates one REMOVE job after stay closure.
14. GREEN: use Biometrics public port from Property; checkout must not fail because receiver is offline.
15. RED: photo is nulled after successful enrollment/TTL.
16. GREEN: cleanup service/command.

**Authorization:**

- Management routes: existing hotel access plus a dedicated capability if RBAC supports adding one, preferably `hotel.biometric.manage`.
- Reception event reads: `hotel.stays.manage` initially only if adding a new capability is deferred.
- Receiver routes: workstation credential + bound `hotelId` + `deviceId`; no staff cookie/session.

---

## Phase 2 — Secure receiver command channel

Extend the existing paired outbound workstation channel; do not expose bridge HTTP or TCP 4370 publicly.

Receiver endpoints:

```text
POST /biometric/workstations/devices/register
POST /biometric/workstations/jobs/claim
POST /biometric/workstations/jobs/{jobId}/ack
POST /biometric/workstations/recognitions
POST /biometric/workstations/heartbeat
```

Contracts:

- Receiver identifies with DPAPI-protected credential.
- Claim returns one job at a time per device.
- ENROLL payload includes opaque PIN, short display name, expiring photo download capability/reference; never full CCCD.
- ACK includes stable outcome code, stage, masked device metadata; no raw template/photo.
- Recognition batch supports retry and server-side dedupe.
- Heartbeat reports capability booleans, counts, firmware/model, last device contact; no user list.

Bridge changes:

- Split local demo `ProfileStore` from production cloud-job executor.
- Preserve one outstanding PUSH command per device.
- Add durable local spool for unuploaded recognition events; delete after cloud ACK.
- Add bounded retry/backoff and crash recovery.
- Add targeted `remove_user(deviceUserId)` only after Phase 0 proof.
- Keep status `unknown` for unverified method codes.

Likely files:

- `vietsage-biometric-local/app/workstation_client.py`
- `vietsage-biometric-local/app/receiver_server.py`
- `vietsage-biometric-local/app/senseface_client.py` (new minimal adapter)
- `vietsage-biometric-local/app/recognition_spool.py` (new, SQLite/stdlib preferred)
- corresponding unit tests
- reuse proven logic from `tools/biometric-bridge/zkteco_bridge.py` and `push_receiver.py`; do not run two competing owners of the same device.

---

## Phase 3 — Check-in consent and enrollment handoff

Current UI intentionally omits portrait from stay persistence. Preserve that boundary for normal stays; add a separate enrollment call only after check-in succeeds.

UX:

- Checkbox: `Khách đồng ý sử dụng khuôn mặt để nhận diện trong thời gian lưu trú`.
- Default unchecked.
- Explain purpose, retention, removal at checkout, and manual alternative.
- Check-in success is independent of FaceID enrollment success.
- After check-in response returns `stayId`, call enrollment endpoint with volatile portrait and idempotency key.
- UI state: `Chưa đăng ký | Đang gửi thiết bị | Đã lưu khuôn mặt | Lỗi - Thử lại`.
- Closing/reloading must reload status from backend, not infer from browser state.

Frontend boundaries:

- repository -> query-resource resource -> hook -> component.
- No raw fetch in presentation components.
- Do not add portrait to `CreateStayBodyInput`.

Likely files:

- `frontends/front-end-vietsage/src/features/local-biometric/components/check-in-workspace.tsx`
- `frontends/front-end-vietsage/src/features/local-biometric/types/check-in-workspace.ts`
- create `features/local-biometric/repositories/face-enrollment-repository.ts`
- create `features/local-biometric/resources/face-enrollment-resource.ts`
- create `features/local-biometric/hooks/use-face-enrollment.ts`
- staff and owner room-grid clients to pass returned `stayId` and retained volatile payload through the post-success handler
- BFF routes only if required for session forwarding

TDD:

- no consent means no enrollment call;
- failed check-in means no enrollment call;
- check-in success + consent + portrait sends exactly once;
- FaceID failure does not roll back successful stay;
- retry reuses idempotency key;
- portrait never appears in stay request, logs, URL, localStorage, or query key.

---

## Phase 4 — Recognition notification

### Persistence first

Receiver POSTs event; backend authenticates receiver, validates clock skew, maps exact opaque PIN, inserts idempotently, then returns ACK.

### Realtime second

Add a biometrics event publisher port and hotel-scoped realtime signal. Reuse existing authenticated hotel realtime infrastructure only as transport; do not reuse guest-request payload/domain tables.

Reception UX:

- Toast/banner: `Đã nhận diện: <tên khách> · Phòng <room> · <time>`.
- Optional short sound; user can mute.
- Unknown PIN: low-priority device event, no guest name guess.
- Inactive/checked-out stay: warning, not success.
- Recent-recognition list reads backend API; socket only triggers cache update/refetch.

Optional later:

- Telegram route for security/reception only after in-app path is stable.
- Do not overload `GuestRequestNotification`.

Tests:

- hotel A receiver cannot post/read hotel B events;
- duplicate provider event emits one notification;
- disconnected socket recovers from recent-events API;
- checked-out stay does not render green success;
- event payload contains no portrait/template/full CCCD.

---

## Phase 5 — Checkout removal, retention, recovery

- Checkout transaction closes stay as today.
- After/with the canonical state transition, create idempotent REMOVE job through Biometrics public port.
- Offline device leaves job pending; does not fail billing/checkout.
- Retry with claim lease; alert Owner after bounded failures.
- Retain minimal audit: enrollment IDs, device ID, status timestamps, errors.
- Purge photo immediately after enrollment or expiry.
- Recognition retention: choose a bounded default (proposal: 30 days), configurable only when policy/legal need exists.
- Never auto-clear device attendance logs.

Recovery tests:

- receiver crashes after device success before cloud ACK: replay ACK completes idempotently;
- cloud accepts recognition then response is lost: resend dedupes;
- claim lease expires: another poll can reclaim;
- checkout while enroll job pending cancels ENROLL and creates REMOVE only when target may exist;
- re-check-in same person creates a new stay enrollment mapping, not name-based reuse;
- hotel deletion/capability revocation fails closed.

---

## 6. API contract sketch

Management:

```text
POST /hotels/{hotelId}/stays/{stayId}/face-enrollments
GET  /hotels/{hotelId}/stays/{stayId}/face-enrollments
POST /hotels/{hotelId}/face-enrollments/{id}/retry
DELETE /hotels/{hotelId}/face-enrollments/{id}
GET  /hotels/{hotelId}/biometric-recognitions?cursor=&limit=
GET  /hotels/{hotelId}/biometric-devices
```

Receiver:

```text
POST /biometric/workstations/jobs/claim
POST /biometric/workstations/jobs/{jobId}/ack
POST /biometric/workstations/recognitions
POST /biometric/workstations/heartbeat
```

Every response/error must be in OpenAPI. Receiver errors use stable codes such as:

```text
DEVICE_OFFLINE
DEVICE_REJECTED_USER
DEVICE_REJECTED_FACE
PHOTO_EXPIRED
CLAIM_EXPIRED
UNKNOWN_DEVICE_USER
UNSUPPORTED_CAPABILITY
```

---

## 7. Security/privacy checklist

- Explicit consent and withdrawal path.
- Manual/non-face hotel workflow remains available.
- Opaque terminal PIN, not CCCD/phone/stay ID.
- Dedicated encryption key for transient photo.
- No photo/template in logs, events, URLs, analytics, screenshots, fixtures.
- Receiver credential stored with user-scoped DPAPI.
- Receiver API hotel/device scoped; replay/idempotency enforced.
- Device TCP 4370 not exposed to WAN.
- PUSH TLS restricted to LAN and known device.
- Targeted removal only; no bulk destructive action.
- Audit actor for consent, retry, removal.
- Document retention and incident response before production.

---

## 8. Verification commands

Backend:

```bash
cd services/auth-service
npm test -- --runInBand biometric
npm run prisma:validate
npm run openapi:export
npm run build
```

Frontend:

```bash
cd frontends/front-end-vietsage
node --experimental-strip-types --test <focused FaceID tests>
npx eslint <changed files>
npx tsc --noEmit --pretty false
npm run build
```

Receiver/bridge:

```bash
python -m unittest tests.test_senseface_client tests.test_recognition_spool tests.test_workstation_client
python -m py_compile app/senseface_client.py app/recognition_spool.py app/workstation_client.py
```

Hardware acceptance:

1. Baseline target opaque PIN absent; record user/face counts.
2. Complete a real CCCD check-in with consent.
3. Verify stay succeeds before enrollment finishes.
4. Verify receiver claims one ENROLL job.
5. Verify user read-back by opaque PIN.
6. Verify face PUSH ACK `Return=0`.
7. Verify VietSage status `ENROLLED` and transient photo purged.
8. Present face once.
9. Verify one persisted recognition row and one reception notification.
10. Repeat same device record upload; verify no duplicate.
11. Checkout.
12. Verify REMOVE job, exact user/template removed, unrelated users/logs unchanged.

---

## 9. Release slicing and rollback

Feature flags:

- `BIOMETRIC_FACE_ENROLLMENT_ENABLED`
- `BIOMETRIC_RECOGNITION_INGEST_ENABLED`
- `NEXT_PUBLIC_BIOMETRIC_RECOGNITION_UI_ENABLED`

Release order:

1. Schema + APIs dark.
2. Receiver claim/ACK dark; one test hotel/device allowlist.
3. Enrollment UI for one hotel.
4. Recognition ingest without realtime.
5. Recognition UI/realtime.
6. Checkout removal.
7. Wider rollout after metrics.

Rollback:

- Disable new job creation first.
- Keep receiver ACK/event ingest alive to drain already issued work.
- Keep recent-event API available even if realtime disabled.
- Never rollback by resetting device or deleting all users.

Metrics:

- enrollment queue depth/age;
- enrollment success/failure by device/error code;
- recognition ingest lag/duplicates;
- receiver heartbeat age;
- removal queue age/failures;
- photo TTL cleanup count.

---

## 10. Explicit non-goals

- No raw face template storage in VietSage.
- No face search/matching in cloud.
- No public TCP 4370.
- No Kafka/RabbitMQ/Redis for V1.
- No Telegram-first notification.
- No bulk device reset or attendance-log deletion.
- No automatic enrollment from CCCD scan before check-in/consent.
- No correlation by name.

---

## 11. Approval boundary

Approve **Phase 0 only first**: prove opaque-PIN user creation, photo enrollment ACK, recognition, and exact single-user removal on the real SenseFace 7A. This phase does not alter VietSage production data or deploy cloud APIs.

After Phase 0 evidence passes, approve Phases 1–2 as one bounded backend/receiver vertical slice. Defer UI notifications and checkout cleanup until the enrollment round-trip is proven end-to-end.
