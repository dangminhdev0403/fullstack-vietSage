# Billing & Revenue Protection — Production-Grade Antigravity Implementation Plan

> **Cho Hermes:** Chỉ triển khai phase đã được duyệt. Gọi Antigravity đúng một lần/phase; Cockpit Tools tự chuyển tài khoản. Sau đó Hermes đọc diff thật, chạy lại gate, sửa phần thiếu. Không tin PASS tự báo.

**Mission:** `billing-revenue-protection`

**Goal:** Bảo đảm mỗi room-day tính phí có đúng một charge; không thất thu do event/runtime; retry, crash, deploy, concurrency, delayed checkout không làm thiếu/trùng; lịch sử tài chính bất biến.

**Architecture:** Giữ modular monolith. Guest folio hiện hữu vẫn thuộc `billing`; phí VietSage thuộc module `platform-billing`. `GuestStay` là V1 operational source; `PlatformUsage` là interval chuẩn hóa/replayable; `PlatformBillableDay` là immutable financial charge. Reconciler trong tiến trình dùng `@nestjs/schedule` đã có; correctness nằm ở PostgreSQL constraints + deterministic replay, không nằm ở scheduler.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, Next.js 16, Zod, Jest, OpenAPI. Không package mới.

---

## 1. Evidence và kết luận review

### Files/flows đã kiểm tra

- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/src/app.module.ts`
- `services/auth-service/src/modules/property/infrastructure/repositories/reservations.repository.ts`
- `services/auth-service/src/modules/property/infrastructure/repositories/hotel-rooms.repository.ts`
- `services/auth-service/src/modules/property/application/hotel-rooms.service.ts`
- `services/auth-service/src/modules/billing/application/billing.service.ts`
- `services/auth-service/src/modules/billing/infrastructure/repositories/billing.repository.ts`
- `services/auth-service/src/modules/property/application/hotel-dashboard.service.ts`
- hotel schemas/services; frontend admin/billing contracts/pages; RBAC/event/docs.
- Graphify-first + bounded Repomix: `graphify-out/repomix/billing-revenue-protection-plan.xml`.

Baseline: `dcc69d67e15f5473de5f41c30ac3b40f383e3215`.

### Architectural weaknesses found

| Weakness | Failure | Modification |
|---|---|---|
| Tạo Billable Day chỉ lúc check-in | Stay nhiều ngày chỉ có ngày đầu; downtime qua midnight làm mất ngày | Check-in chỉ mở usage + ghi ngày hiện tại. Deterministic reconciler materialize mọi local date có interval overlap; checkout và period close bắt buộc reconcile lại. |
| Plan cũ chỉ nối reservation check-in | Repo có thêm `checkInStay()` và `createAndCheckInStay()` | Mọi đường check-in gọi một transaction helper chung. Không vá controller/caller riêng lẻ. |
| Plan cũ chỉ nối billing checkout | Repo có property checkout, zero-balance checkout, payment webhook checkout | Mọi đường đóng stay gọi chung `closeUsageAndReconcile(tx, ...)` trong cùng DB transaction. Reconciler vẫn phục hồi nếu legacy/path mới bỏ sót. |
| Runtime event là điều kiện tạo charge | Crash/deploy/event consumer lỗi có thể mất doanh thu | Không dùng event làm source tài chính. Rebuild từ persisted `GuestStay`/`PlatformUsage`; event chỉ audit/signal. |
| Usage và Billable Day ghép chặt | Khó hỗ trợ nhiều usage trong một room-day, hourly/meeting | Hai aggregate độc lập. Usage mô tả interval; Billable Day dedupe theo billing subject/date/contract, không FK bắt buộc 1:1 với usage. |
| Config billing đặt trực tiếp vào `Hotel` | Upgrade/downgrade/trial làm thay lịch sử | `PlatformBillingContract` + immutable revisions. `Hotel` chỉ giữ property data. |
| Manual monthly close duy nhất | Quên close tạo operational failure | Một idempotent `finalizePeriod()` dùng bởi internal scheduled catch-up và admin API. Scheduler là trigger; command + DB là correctness. |
| “Append-only” mới chỉ là convention | App/Prisma vẫn update/delete được ledger | PostgreSQL trigger cấm UPDATE/DELETE charge, contract revision, finalized invoice snapshot; corrections dùng append-only adjustment/reversal. |
| Dashboard có nguy cơ aggregate ledger toàn bảng | Tăng dữ liệu gây scan/chậm | Transactional daily projection + immutable period totals; dashboard chỉ đọc bounded projection/indexed invoice state. |
| Timezone logic chưa có implementation an toàn | JS date arithmetic sai DST/month boundary | PostgreSQL native timezone/date boundaries; interval-overlap predicate. Không tự viết timezone library. |
| Serializable chưa đủ nếu không có uniqueness | Retry/concurrent workers vẫn có duplicate | Unique/partial unique constraints là authority; `INSERT ... ON CONFLICT DO NOTHING`; bounded retry cho `P2034`/serialization only. |

### Mathematical limitation được xử lý rõ

Không hệ thống nào tạo row đúng midnight khi DB/service đang tắt. Production guarantee khả thi:

1. ngày hiện tại được materialize atomically khi check-in;
2. ngày mới được reconciler tạo khi tiến trình hoạt động;
3. mọi ngày bị thiếu trong downtime được catch-up deterministic sau restart;
4. **không period/invoice nào được FINALIZED nếu expected-set còn thiếu một ngày**.

Vì vậy downtime có thể tạo **lag tạm thời**, không thể tạo **revenue loss** hoặc finalized underbilling.

---

## 2. Invariants bắt buộc

### Ledger

1. Một positive charge duy nhất cho `(contractId, subjectType, subjectId, serviceDate)`.
2. Charge row không UPDATE/DELETE.
3. `unitPrice`, tier, currency, amount, `serviceDate`, contract revision, usage rule snapshot không đổi vĩnh viễn.
4. Correction = signed immutable adjustment/reversal tham chiếu charge gốc; không sửa charge.
5. Invoice snapshot không lấy pricing hiện tại; chỉ lấy ledger + adjustment đã khóa.

### Usage

1. Một normalized usage duy nhất cho `(sourceType, sourceId, occurrence)`; V1 occurrence = stay lifecycle `1`.
2. Open usage chỉ được đóng một lần bằng guarded update `endedAt IS NULL`.
3. Closed usage không mở lại/sửa timestamps. Sai nghiệp vụ sửa bằng correction record, không rewrite history.
4. Reconciler có thể tạo/đóng usage bị thiếu từ persisted `GuestStay`; không cần event replay.

### Period

1. Một period duy nhất cho `(contractId, periodStart, periodEnd)`.
2. Finalize chạy reconciliation trong cùng command, kiểm tra expected-set, khóa snapshot, rồi mới chuyển FINALIZED.
3. Repeated close trả cùng result; partial failure rollback transaction.
4. Due/overdue là derived state từ immutable `dueAt` + settlement; không cron mutate status hằng ngày.

### Performance

1. Mọi reconciliation request bắt buộc có `fromDate` và `toDateExclusive`; reject range rỗng, đảo chiều hoặc vượt ceiling của command.
2. Normal operation chỉ dùng một trong bốn scope: current local day, active usages trong bounded window, fixed catch-up chunk, hoặc đúng một billing period đang finalize.
3. Không normal job nào replay từ `billingStartedAt` đến hiện tại. Gap dài được xử lý nhiều chunk nhỏ qua nhiều tick.
4. `reconciledThroughDate` là cursor tối ưu có thể xóa/rebuild; ledger/usage/contract mới là financial truth.
5. Automatic reconciliation bỏ qua mọi date thuộc FINALIZED period. Historical replay chỉ qua audited recovery command với contract + bounded date range + reason + idempotency key.

---

## 3. Data model cập nhật

Tên cuối được xác nhận khi implementation, semantics không đổi.

### `PlatformBillingContract`

```text
id, hotelId, status, onboardedAt, billingStartedAt,
currentRevisionId?, reconciledThroughDate?, createdAt, updatedAt
```

- Một active contract/hotel bằng partial unique index khi status thuộc active states.
- Contract status có thể đổi; không chứa historical price.
- `reconciledThroughDate` chỉ là monotonic optimization watermark. Không dùng nó để chứng minh charge tồn tại, tính tiền hoặc finalize period.

### `PlatformBillingContractRevision` — append-only

```text
id, contractId, effectiveFrom(date), effectiveTo?(date),
starTierSnapshot, roomDayUnitPrice, currency,
billingCycle=MONTHLY, paymentTermDays,
trialUntil?, discount rule chỉ khi spec duyệt,
createdByUserId, createdAt
```

- Unique `(contractId, effectiveFrom)`.
- Effective range `[from,to)`; transaction khóa contract row, reject overlap/gap nguy hiểm.
- PostgreSQL trigger cấm UPDATE/DELETE revision.
- Upgrade/downgrade/suspension = thêm revision/status transition; không sửa revision cũ.
- Free trial/discount chưa có acceptance criteria: **không triển khai rule engine**. Model revision đủ mở rộng bằng field explicit/migration sau.

### `PlatformUsage` — operational interval, độc lập ledger

```text
id, hotelId, subjectType=ROOM, subjectId=roomId,
usageKind=STAY, sourceType=GUEST_STAY, sourceId=stayId, occurrence=1,
startedAt, endedAt?, durationMinutes?, hotelTimezoneSnapshot,
createdAt, closedAt?
```

- Unique `(sourceType, sourceId, occurrence)`.
- Index `(hotelId, startedAt, endedAt)` và `(subjectType, subjectId, startedAt)`.
- `subjectType/subjectId` cho phép meeting room/coworking sau mà không đổi ledger shape; không thêm behavior tương lai.
- Usage có thể nhiều lần/ngày; Billable Day vẫn một charge.

### `PlatformBillableDay` — immutable positive charge

```text
id, contractId, contractRevisionId, hotelId,
subjectType=ROOM, subjectId=roomId, serviceDate(date),
hotelTimezoneSnapshot, starTierSnapshot,
unitPrice, quantity=1, amount, currency,
calculationVersion, sourceWindowStart, sourceWindowEnd,
createdAt
```

- Unique `(contractId, subjectType, subjectId, serviceDate)`.
- CHECK: quantity = 1; unitPrice >= 0; amount = unitPrice; currency length 3.
- FK contract revision; trigger cấm UPDATE/DELETE.
- Không FK 1:1 tới usage: nhiều interval cùng phòng/ngày vẫn một room-day.

### `PlatformBillingAdjustment` — append-only correction

```text
id, contractId, billableDayId?, periodId?, amount(signed), currency,
reasonCode, note, actorUserId, reversesAdjustmentId?, createdAt
```

- Không sửa Billable Day.
- Idempotency key bắt buộc cho manual API; unique `(contractId, idempotencyKey)`.
- Trigger cấm UPDATE/DELETE.

### `PlatformBillingPeriod` — invoice snapshot

```text
id, contractId, periodStart(date), periodEnd(date),
status=DRAFT|FINALIZED|VOID,
dueAt, chargeCount, subtotal, adjustmentTotal, total, currency,
finalizedAt?, finalizedByUserId?, snapshotHash?, createdAt
```

- Unique `(contractId, periodStart, periodEnd)`.
- CHECK half-open period, nonnegative totals theo policy.
- Monetary/period/snapshot columns immutable sau FINALIZED qua DB trigger.
- VOID không xóa; replacement period/version chỉ nếu correction workflow được duyệt. V1 correction trước finalize; sau finalize dùng adjustment kỳ sau hoặc explicit void/reissue admin command có audit.

### `PlatformBillingSettlement` — append-only

```text
id, periodId, amount, method, reference?, paidAt,
idempotencyKey, actorUserId, createdAt
```

- Unique `(periodId, idempotencyKey)`.
- Không mutate invoice money; paid/outstanding = period total minus settlement sum.

### `PlatformBillingDailySummary` — rebuildable projection

```text
serviceDate, hotelId, contractId,
billableRoomCount, grossAmount, adjustmentAmount, netAmount, updatedAt
```

- Unique `(contractId, serviceDate)`.
- Dashboard đọc projection, không ledger.
- Reconciler upsert lại summary từ bounded date slice; projection không phải financial truth.

### Native DB immutability

Migration tạo trigger functions:

- reject UPDATE/DELETE `PlatformBillableDay`;
- reject UPDATE/DELETE `PlatformBillingAdjustment`/`Settlement`;
- reject UPDATE/DELETE contract revision;
- reject mutation monetary/snapshot fields của FINALIZED period.

Migration test thực hiện raw UPDATE/DELETE và phải fail. Không dựa vào private method/Prisma service convention.

---

## 4. Deterministic Daily Ledger Algorithm

### Source of truth

V1 source authority:

```text
GuestStay.checkedInAt + GuestStay.checkedOutAt/status
  -> normalized PlatformUsage
  -> expected room-day set
  -> immutable PlatformBillableDay
```

`DomainEvent` không phải source vì repo chưa có durable dispatcher và event có thể chưa được xử lý. Reconciler đọc database state.

### Billable date definition

Usage interval là `[startedAt, effectiveEnd)`.

- closed usage: `effectiveEnd = endedAt`;
- open usage: `effectiveEnd = reconciliationWatermark`;
- intersect thêm contract active range/billing start;
- một local service day `D` billable khi:

```text
startedAt < endInstant(D, hotelTimezone)
AND effectiveEnd > startInstant(D, hotelTimezone)
```

Half-open interval loại ngày checkout nếu checkout đúng local midnight. PostgreSQL `AT TIME ZONE` tạo local-day boundaries; không cộng 86.400.000ms. DST 23/25 giờ, leap day, month/year boundary vẫn đúng.

### Reconcile command

Input luôn bounded:

```text
reconcileContract(contractId, fromDate, toDateExclusive, watermark)
```

Validation chung, một chỗ:

- `fromDate < toDateExclusive`;
- normal current-day window = 1 ngày;
- automatic catch-up mỗi transaction tối đa 31 ngày;
- finalize = đúng một contract period, tối đa 31 ngày cho monthly V1;
- audited recovery cũng bắt buộc bounded range; range lớn phải gọi theo chunk, không có “all history” mode.

Transaction flow:

1. Lock contract row `FOR UPDATE`; load revisions intersect range bằng predicate `effectiveFrom < toDateExclusive AND (effectiveTo IS NULL OR effectiveTo > fromDate)`.
2. Automatic mode query FINALIZED periods intersect range. Loại các date đã finalized trước khi đọc usage/ledger; nếu toàn range finalized thì no-op. Recovery mode yêu cầu audit envelope và không tự động bỏ qua.
3. Sync missing/open `PlatformUsage` từ `GuestStay` bằng unique source key và predicates `checkedInAt < endInstant(toDateExclusive) AND (checkedOutAt IS NULL OR checkedOutAt > startInstant(fromDate))`:
   - insert missing usage;
   - guarded close nếu stay checked out and usage `endedAt IS NULL`;
   - không sửa closed usage.
4. PostgreSQL query sinh expected set bằng `generate_series(fromDate, toDateExclusive - 1 day, 1 day)` **trong bounded range**, join usage theo interval-overlap và revision effective range.
5. `INSERT ... SELECT DISTINCT ... ON CONFLICT DO NOTHING` vào Billable Day; ledger read/write luôn có `contractId` và `serviceDate >= fromDate AND serviceDate < toDateExclusive`.
6. Re-query `expected EXCEPT actual` trong same bounded transaction. Nếu còn row: throw, rollback.
7. Detect `actual EXCEPT expected` trong cùng contract/date range:
   - không delete/mutate;
   - log/block finalize;
   - yêu cầu adjustment/correction được audit.
8. Rebuild/upsert `PlatformBillingDailySummary` cho đúng bounded dates từ ledger + adjustments.
9. Advance `reconciledThroughDate` bằng guarded monotonic update chỉ khi chunk contiguous kế tiếp đã verify; failure không advance. Đây vẫn chỉ là cursor.
10. Commit.

`DISTINCT` không là dedupe authority; unique index mới là authority.

### Replay/recovery

- Check-in: reconcile đúng service date hiện tại trong cùng transaction sau khi usage được insert.
- Internal scheduler: keyset-paginate active contracts. Current-day pass luôn 1 ngày; catch-up lấy chunk kế tiếp tối đa 31 ngày từ watermark, loại FINALIZED dates. Không query toàn history. Safety overlap tối đa 2 ngày, vẫn bounded.
- Checkout: close usage + reconcile **chỉ current unfinalized monthly period intersect usage**, tối đa 31 ngày, trong cùng transaction. Không dùng watermark để mở range tùy ý. Older unfinalized gaps do bounded catch-up/finalizer xử lý; FINALIZED dates luôn bỏ qua.
- Startup/deploy: lần scheduler kế tiếp catch up từng chunk; gap lớn cần nhiều tick nhưng mỗi query vẫn bounded/indexed. Watermark mất/sai chỉ làm chậm; finalize vẫn derive expected-set từ period truth.
- Period finalize: luôn reconcile toàn period và verify expected/actual trước snapshot. Đây là hard gate chống thất thu.
- Admin recovery API: explicit `recoverRange(contractId, fromDate, toDateExclusive, reason, idempotencyKey)` gọi cùng expected-set engine ở recovery mode; tái dùng `AuditLog`, ghi request/result. Với FINALIZED range, command chỉ chẩn đoán discrepancy và append adjustment/correction được audit; không back-insert charge làm thay population của snapshot đã finalize. Không có unbounded/all-history endpoint.

### Missing day detection

- Per command: exact set difference `expected EXCEPT actual`.
- Operational query: contracts có `reconciledThroughDate < local yesterday` hoặc mismatch count trong current/catch-up window; không global ledger comparison.
- Dashboard chỉ hiển thị bounded health count; không full scan.
- Alert transport không thuộc scope; structured log đủ Phase 1.

---

## 5. Updated event/transaction flows

### Mọi check-in path

Áp dụng cho:

- `ReservationsRepository.checkInReservation()`;
- `HotelRoomsRepository.checkInStay()`;
- `HotelRoomsRepository.createAndCheckInStay()`.

```text
Serializable transaction
  -> lock/guard room + stay
  -> create/activate GuestStay
  -> create/reuse guest folio
  -> ensure PlatformUsage by source unique key
  -> reconcile current local service date
  -> create audit DomainEvent
  -> commit
```

Nếu ledger insert fail, check-in rollback. Retry replay-safe.

### Mọi checkout path

Áp dụng cho:

- `HotelRoomsRepository.checkOutStay()`;
- `BillingService.settleZeroBalanceCheckout()`;
- `BillingService.processPaymentWebhook()` success branch.

```text
Serializable transaction
  -> lock stay/payment/invoice as current flow requires
  -> capture one checkoutAt
  -> guarded close PlatformUsage where endedAt IS NULL
  -> reconcile through checkoutAt using same tx
  -> close stay/session/folio/invoice as applicable
  -> append audit event
  -> commit
  -> publish conversation.closed after commit
```

Không duplicate helper code. `platform-billing` export một application transaction function nhận `Prisma.TransactionClient`; property/billing không truy cập repository nội bộ.

### Scheduled reconciliation

```text
@Interval using existing ScheduleModule
  -> keyset batch eligible contracts
  -> each contract: bounded reconcile transaction
  -> log success/mismatch/failure
  -> next tick retries failures
```

Không in-memory global lock làm correctness. Multi-instance cùng chạy được: row lock + unique constraints. Một worker chờ/retry; kết quả giống nhau.

### Period finalize

```text
scheduled catch-up OR admin API
  -> begin Serializable
  -> lock contract + period
  -> create/reuse DRAFT period
  -> reconcile exact period range
  -> verify expected == actual
  -> aggregate immutable charge + adjustments for period
  -> write totals/count/hash once
  -> transition DRAFT -> FINALIZED with guarded update
  -> commit
```

- Crash trước commit: không có partial finalization.
- Retry: unique period, lock, FINALIZED trả snapshot cũ.
- Quên close: scheduler scans due unfinalized periods, gọi same command.
- Rollback nghiệp vụ: không UPDATE ledger; append adjustment hoặc explicit VOID/reissue flow.

---

## 6. Concurrency guarantees

| Race | DB guarantee |
|---|---|
| Hai check-in cùng phòng | Existing guarded room update + Serializable; thêm DB-level active usage/source uniqueness. |
| Hai workers tạo cùng day | Unique charge key + `ON CONFLICT DO NOTHING`. |
| Checkout + scheduler | Contract/stay/usage row locks; guarded usage close; deterministic replay. |
| Hai checkout | Existing invoice/payment locks; usage `endedAt IS NULL`; second request idempotent/conflict theo current API. |
| Hai period close | Unique period + `FOR UPDATE`; one FINALIZED snapshot. |
| Duplicate webhook | Existing provider event unique; period/usage logic thêm unique/guarded writes. |
| Prisma timeout/DB restart | Transaction rollback; next API/scheduler replay from persisted source. |
| Contract revision overlap | Contract row lock + overlap validation + unique effectiveFrom; migration test concurrent insert. |
| Lost update | Immutable financial rows; guarded state transitions with previous status predicate/count check. |

Serializable retry tối đa 3 chỉ cho known retryable DB errors, có jitter nhỏ bằng stdlib timer nếu cần; không retry validation/domain errors.

---

## 7. Updated phased plan

Thứ tự/scope cũ giữ nguyên; chỉ gia cố correctness.

## Phase 1 — Contract revisions + usage + daily ledger + recovery

**Objective:** Hoàn thành nền tài chính đúng trước UI/công nợ.

### Task 1.1 — RED: calendar/pricing pure contract

Tests trước code:

- tier 2/3/4/5;
- interval same day, multi-day, long stay;
- checkout exact midnight;
- Asia/Saigon boundary;
- DST zone 23h/25h;
- Feb 29, month/year boundary;
- delayed checkout/open watermark;
- billing start giữa stay;
- revision change giữa stay.

Không tự viết JS timezone converter. Integration test PostgreSQL query là authority.

### Task 1.2 — RED: schema constraints/immutability

**Files:**

- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/prisma/migrations/<timestamp>_platform_billing_ledger/migration.sql`
- `services/auth-service/src/modules/platform-billing/tests/platform-billing-schema.spec.ts`

Tests unique, CHECK, trigger UPDATE/DELETE fail, revision overlap, idempotency key.

### Task 1.3 — GREEN: platform-billing core reconciler

**Likely files:**

- `services/auth-service/src/modules/platform-billing/platform-billing.module.ts`
- `.../application/platform-billing-reconciliation.service.ts`
- `.../infrastructure/platform-billing.repository.ts`
- `.../tests/platform-billing-reconciliation.spec.ts`
- `services/auth-service/src/app.module.ts`

Repository chứa bounded SQL generation/set-difference. Service chứa workflow/retry/logging. Một repository implementation; không interface/factory.

### Task 1.4 — Integrate all check-in/out seams

**Modify:**

- `property/infrastructure/repositories/reservations.repository.ts`
- `property/infrastructure/repositories/hotel-rooms.repository.ts`
- `billing/application/billing.service.ts`
- nearest tests cho cả 3 check-in + 3 checkout paths.

RED từng vertical slice rồi GREEN. Không chỉ test helper; assert transaction gọi và rollback semantics.

### Task 1.5 — Internal catch-up + operational health

Dùng `ScheduleModule` đã tồn tại. Batch keyset, bounded dates, overlap replay. Không external scheduler/package. Add startup/restart/catch-up and concurrent worker tests.

Performance tests bắt buộc assert mọi repository call có contract/date predicates. Chạy `EXPLAIN (ANALYZE, BUFFERS)` trên fixture đủ lớn cho current-day, 31-day catch-up, active-usage sync và period-finalize queries; fail review nếu ledger access là unbounded `Seq Scan` hoặc rows/buffers tăng theo toàn lịch sử thay vì bounded window.

**Phase 1 gate:**

```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests --runInBand
npx jest src/modules/property/tests/reservations.repository.spec.ts src/modules/property/tests/hotels.repository.spec.ts src/modules/property/tests/hotel-rooms.conversation-close.spec.ts src/modules/billing/tests/billing.service.checkout-safety.spec.ts --runInBand
npx prisma validate
npx prisma generate
npm run build
```

## Phase 2 — Idempotent period finalization, debt, settlement, API

### Task 2.1 — RED: period invariants

Tests:

- forgotten close caught next scheduler tick;
- repeated/manual/scheduled close returns same period;
- reconciliation mismatch blocks FINALIZED;
- crash/failure before commit leaves no partial snapshot;
- concurrent close yields one period;
- amount from immutable rows/revision snapshots;
- adjustment before finalize included once;
- settlement idempotent; no overpay V1;
- finalized money/date mutation rejected by DB.

### Task 2.2 — Implement one finalize command

API và scheduler cùng gọi `finalizePeriod()`. Không duplicated “manual close” implementation. Period range half-open; monthly calendar based contract timezone. Finalize prior due periods keyset-paginated.

### Task 2.3 — Private API + RBAC

Endpoints tối thiểu:

- bounded period/debt list;
- get period;
- idempotent finalize/reconcile recovery command;
- append settlement;
- bounded platform dashboard projection.

Permissions:

- `platform.billing.view`
- `platform.billing.manage`
- `hotel.revenue-protection.view`

Route private, capability + resource scope, cross-hotel deny.

### Task 2.4 — OpenAPI synchronization

Export backend OpenAPI, generated frontend types, `CONTRACT_CHANGES.md`; no handwritten duplicate schema.

**Phase 2 gate:** focused tests, full backend build/test/e2e/lint, OpenAPI verify. Lint có `--fix`: inspect scoped diff, không revert dirty work người dùng.

## Phase 3 — Onboarding/contract management + Backoffice projection UI

### Modification from old plan

Không thêm billing fields trực tiếp vào `Hotel`. Hotel create remains property operation; onboarding creates contract/revision through platform-billing API in explicit second action/transaction unless product requires atomic create. UI can present one form but server calls remain bounded; failed contract creation must display “khách sạn chưa kích hoạt tính phí”, không giả thành fully onboarded.

**Backend:** contract create/revise/suspend APIs, validation tiếng Việt, audit actor, overlap guard.

**Frontend:** reuse admin hotel screen; smallest contract panel/form. No wizard, no chart library, no new package. Server Component dashboard reads `PlatformBillingDailySummary` + indexed periods/settlements only.

Metrics:

- hotels/contracts;
- billable rooms from daily summary;
- SaaS accrued revenue day/month;
- finalized outstanding debt;
- due soon/overdue bounded lists.

“Accrued” và “collected” phải tách nhãn; không gọi settlement là revenue accrued.

## Phase 4 — Owner Revenue Protection analytics

Backend query default current month, max bounded range. Reads daily summary for totals; reads usage/ledger detail only with required hotel + date range + keyset pagination. Không full ledger scan, không OFFSET sâu.

Response:

- per-room usage count;
- billable-day count;
- usage intervals;
- deterministic mismatch health;
- accrued hotel operations revenue hiện hữu tách khỏi VietSage SaaS charge.

Owner capability + hotel access; front desk denied. UI table/native CSS; URL filters; Server Component unless client cache interaction thật sự cần `query-resource`.

## Phase 5 — Payment reminder, vẫn deferred

Không thuộc approval mặc định. Chỉ thêm khi chốt recipient/channel/cadence/dedupe. Dùng scheduler/Notifications hiện hữu; không broker/Redis/package.

---

## 8. Performance plan

### Indexes

- Usage: `(hotelId, startedAt, endedAt)`, `(sourceType, sourceId, occurrence)` unique, `(subjectType, subjectId, startedAt)`.
- Billable Day: unique contract/subject/date; `(contractId, serviceDate)`, `(hotelId, serviceDate)`, `(contractRevisionId, serviceDate)`.
- Contract revision: `(contractId, effectiveFrom, effectiveTo)`.
- Period: unique contract/range; `(status, periodEnd)`, `(dueAt, status)`.
- Settlement/adjustment: `(periodId, createdAt)`; unique idempotency keys.
- Daily summary: `(serviceDate)`, `(hotelId, serviceDate)`, unique contract/date.

### Query rules

- Reconcile date range bounded: daily tick safety overlap; finalize one monthly period.
- Contracts/hotels keyset batches, không load all như Google Sheet job hiện tại.
- Usage/ledger detail keyset pagination `(serviceDate,id)` or `(startedAt,id)`.
- Dashboard aggregate daily summary/period only; never `SUM` whole Billable Day table.
- Mọi SQL ledger/usage/revision/period bắt buộc có `contractId`/`hotelId` + half-open date predicate khớp composite index; code review reject query thiếu bound dù test nhỏ vẫn nhanh.
- Add `EXPLAIN (ANALYZE, BUFFERS)` fixture check với lịch sử nhiều năm nhưng request 1/31 ngày. Expected access: index/bitmap index path trên composite indexes; không unbounded ledger `Seq Scan`. So sánh rows/buffers giữa fixture nền nhỏ/lớn để chứng minh chi phí phụ thuộc window, không toàn history.
- PostgreSQL có thể chọn Seq Scan cho bảng/partition rất nhỏ; gate production dùng representative volume và bounded buffer/row evidence, không ép planner bằng config test.

---

## 9. Failure/recovery proof

| Failure | Recovery |
|---|---|
| Crash during check-in | Same transaction rolls back stay/usage/day; API retry repeats safely. |
| Crash after check-in commit | Current day already committed. Future days generated by catch-up. |
| Deployment over midnight | Missing date generated after restart; finalize cannot pass while absent. |
| Crash during reconcile | Transaction rollback; next tick/admin/finalize replay. |
| DB restart/Prisma timeout | No partial commit; bounded retry or next invocation. |
| Duplicate API/webhook | Existing + new unique idempotency keys return existing result. |
| Long/delayed stay | Open interval reconciles through each watermark; checkout closes exact end then final reconcile. |
| Cancelled checkout/payment | Usage remains open; no false close. Later reconciliation continues room-days. |
| Manual correction | Append adjustment/reversal; original charge immutable/auditable. |
| Forgotten month close | Internal scheduled scan invokes same finalize command until success. |
| Two app instances | DB row locks/unique indexes arbitrate; no distributed lock needed. |
| Wrong timezone/revision discovered | Never rewrite finalized charge. Add audited correction; fix future revision. |

---

## 10. Verification and release gates

1. Capture HEAD + scoped status before/after Antigravity.
2. Read all changed/untracked migration/test files.
3. Verify RED output before GREEN for every financial behavior.
4. Run exact focused tests again after writer exits.
5. Prisma validate/generate/status; review SQL. Không `push/reset`, không production apply.
6. Raw SQL tests prove immutable triggers and uniqueness.
7. Concurrency tests: simultaneous check-in/reconcile/checkout/finalize.
8. Recovery tests: transaction fault injection, restart/catch-up, duplicate calls.
9. Calendar matrix: DST, leap, midnight, month/year, timezone, delayed checkout.
10. RBAC e2e: 401/403/cross-hotel/owner PASS.
11. OpenAPI/generated type verify.
12. Dashboard query plan on representative bounded fixture; no ledger full scan.
13. Scoped `git diff --check`; full build/test/e2e/lint according phase.
14. Update `docs/EVENT_FLOW.md`, `docs/RBAC_ARCHITECTURE.md`, contract changelog, relevant `PLANS.md` only.
15. `graphify update .`; regenerate bounded Repomix per completed module.
16. Scoped commit + push only after PASS, correct branch/remote, exact files staged; no force-push.

---

## 11. Non-goals

- No microservices, Kafka, RabbitMQ, Redis, distributed locks, external scheduler.
- No package/lockfile change.
- No hourly pricing engine, trial/discount engine, generic task module.
- No provider reminder until contract approved.
- No production migration/deploy/VPS action under this plan.
- No rewrite guest folio; only integrate shared close/check-in seam.

---

## 12. Antigravity execution contract

Project root:

`C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`

Sau khi duyệt phase:

```bash
agy --sandbox --dangerously-skip-permissions --mode accept-edits --effort high --print --print-timeout 30m '<PROMPT_PHASE>'
```

Prompt prefix:

```text
USER/HERMES APPROVED EXECUTION for mission billing-revenue-protection, phase N only.
Workspace root is exactly C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage.
One writer. Preserve unrelated dirty/untracked work. Graphify -> bounded Repomix -> exact current source. Strict TDD with real RED then GREEN. Maximum 25 files/20k context tokens; split phase task if exceeded. No package/lockfile, dependency, worktree/clone, deployment, VPS, DB reset/push, production action. Implement DB-enforced idempotency/immutability; runtime events are not financial truth. Scoped commit + push are pre-authorized only after Hermes PASS verification; exact mission files, verify branch/remote, never force-push. Vietnamese inline errors. Report exact files and command outputs.
```

Cockpit Tools tự switch; không account/model routing trong prompt. Nếu hết quota, Hermes hoàn thiện trực tiếp, báo fallback.

---

## 13. Approval boundary

Plan review đã hoàn tất; source chưa sửa; Antigravity chưa chạy; migration/commit/push/deploy chưa chạy.

Commit + push được pre-authorized **sau** phase PASS; không đồng nghĩa duyệt triển khai.

Bắt đầu:

```text
APPLY PLAN — PHASE 1
```

Sau Phase 1 PASS + review diff mới mở Phase 2. Production migration/cutover cần duyệt riêng.
