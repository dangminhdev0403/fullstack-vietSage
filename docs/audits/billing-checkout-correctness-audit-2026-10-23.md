---
title: Billing and checkout correctness audit
status: confirmed
created: 2026-10-23
scope: reservation pricing, folio, invoice, payment, checkout, guest services, marketplace, OTA/direct booking
---

# Billing and checkout correctness audit

## Verdict

Checkout is not yet safe for every supported booking and payment path.

Confirmed findings: **2 Critical, 7 High, 3 Medium**. Existing focused tests pass but do not cover the failing financial invariants below.

## Verified behavior

- Reservation custom prices, group per-room prices, and explicit zero prices survive into `GuestStay.nightlyRateSnapshot`.
- Changing the current Room/RoomType price does not alter a stay that already has a nightly-rate snapshot.
- Room reassignment before check-in preserves the reservation's agreed rate.
- Walk-in stays can snapshot an explicit rate at check-in.
- Marketplace normally separates partner subtotal from hotel fee and validates order currency.
- Invoice/payment operations use transactions and row locking; payment callbacks have duplicate-event protection.
- Direct stay checkout is blocked while a folio remains `OPEN` or `CHECKOUT_PENDING`.

## Findings

### C1 — Mixed currencies can be added directly

**Severity:** Critical

**Evidence**

- `services/auth-service/src/modules/property/domain/schemas/service-catalog.schema.ts:53-60`
- `services/auth-service/src/modules/guest-operations/infrastructure/repositories/hotel-requests.repository.ts:339-390`
- `services/auth-service/src/modules/billing/application/billing.service.ts:819-852`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1643-1657`

A service item may use a currency different from the folio currency. Reconciliation posts its numeric amount to the folio without conversion or currency equality validation.

**Reproduction:** VND folio + `100 USD` service can add numeric `100` to a VND invoice.

**Required fix:** fail closed when service and folio currency differ, unless an explicit snapshotted FX conversion exists.

### C2 — OTA-collected bookings can be collected again

**Severity:** Critical

**Evidence**

- `services/auth-service/src/modules/channel-manager/services/channex-api-client.service.ts:110-119`
- `services/auth-service/src/modules/channel-manager/services/channex-booking-ingestion.service.ts:245-254`
- `services/auth-service/src/modules/channel-manager/services/channex-booking-ingestion.service.ts:385-418`
- `services/auth-service/prisma/schema.prisma:1133-1166`

Channex provides `payment_collect: "ota" | "property"`, but ingestion does not persist or reconcile it. Checkout therefore treats the whole invoice as property-collectable.

**Reproduction:** OTA already collected `2,500,000`; PMS still asks the guest for `2,500,000`.

**Required fix:** persist collection ownership and prepaid amount/reference; post a folio payment/credit exactly once before checkout; block unresolved OTA-payment reconciliation.

### H1 — Room nights use elapsed timestamps instead of the booking commitment

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/billing/application/billing.service.ts:1473-1512`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1557-1583`
- `services/auth-service/src/modules/billing/domain/schemas/billing.schema.ts:51-63`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx:579-589`

Current calculation rounds elapsed milliseconds between actual check-in and the earlier of now/planned checkout. `isEarlyDeparture` exists but is not used, and the frontend does not send it.

| Scenario | Contract | Current charge |
|---|---:|---:|
| Five-night booking; check-in two days late | 5 nights | 3 nights |
| Five-night booking; leave one day early | 5 nights | 4 nights |

**Required fix:** charge committed nights by default. Shorten only through an explicit early-departure decision. Extension/late checkout must create an explicit extension or surcharge.

### H2 — Checkout service reconciliation can price a catalog-default service at zero

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/billing/application/billing.service.ts:1679-1687`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1741-1773`
- `services/auth-service/prisma/schema.prisma:1280-1320`
- `services/auth-service/src/modules/guest-operations/infrastructure/repositories/hotel-requests.repository.ts:348-351`

Checkout reads `req.serviceItem?.priceOverride ?? req.unitPrice ?? 0`, but `GuestRequest` has no persisted `unitPrice`. A service relying on category `defaultPrice` can become zero during checkout reconciliation.

**Required fix:** snapshot service unit price and currency when the request is created; use the snapshot in both normal completion and checkout reconciliation.

### H3 — Missing room price silently becomes current room price or `500,000`

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/billing/application/billing.service.ts:1501-1507`
- `services/auth-service/src/modules/property/infrastructure/repositories/reservations.repository.ts:882-887`
- `services/auth-service/src/modules/property/infrastructure/repositories/reservations.repository.ts:962-964`
- `services/auth-service/src/modules/billing/tests/billing.service.checkout-safety.spec.ts:1337-1347`

Fallback priority is stay snapshot, current room price, then magic value `500,000`. This can rewrite the commercial agreement at checkout.

**Required fix:** remove the magic/current-price fallback from financial settlement and fail with `ROOM_RATE_REQUIRED`; require an audited agreed-rate snapshot.

### H4 — Excess discount produces a negative invoice that closes as zero balance

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/billing/domain/schemas/billing.schema.ts:29-43`
- `services/auth-service/src/modules/billing/application/billing.service.ts:331-344`
- `services/auth-service/src/modules/billing/application/billing.service.ts:823-852`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1025-1037`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1100-1144`

Example: `500,000` charges minus `700,000` discount gives `-200,000`. Manual payment treats every `balance <= 0` as zero balance, closes the invoice/stay, and loses refund/credit semantics.

**Required fix:** prohibit a discount that makes the total negative until a dedicated credit/refund workflow exists.

### H5 — Checkout retry can duplicate manual surcharge/discount lines

**Severity:** High

**Evidence**

- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx:531-589`
- `services/auth-service/src/modules/billing/application/billing.service.ts:299-384`
- `services/auth-service/src/modules/billing/domain/schemas/billing.schema.ts:29-43`

The frontend posts surcharge, then discount, then invoice. A failure after either adjustment causes a retry to post the adjustment again. Manual folio items have no request idempotency key.

**Required fix:** one atomic checkout command, or mandatory idempotency keys backed by a unique constraint.

### H6 — Insufficient cash can still be recorded as full payment

**Severity:** High

**Evidence**

- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx:1580-1603`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx:1643-1654`
- `services/auth-service/src/modules/billing/application/billing.service.ts:924-952`

The UI displays `Khách còn thiếu` but leaves checkout enabled. `cashGivenInput` is not sent; the backend records the full invoice balance as paid.

**Required fix:** block full settlement when received cash is below balance, or submit the real payment amount and retain the outstanding balance.

### H7 — Partial payment, deposits, and overpayment are not represented

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/billing/application/billing.service.ts:924-952`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1254-1262`

Manual collection supports exact full balance or zero balance. Provider callbacks reject amounts different from the full balance. Partial payments/deposits cannot accumulate; overpayment has no change/credit/refund lifecycle.

**Required fix:** calculate balance from successful payments, keep invoice open until balance is zero, and model overpayment explicitly.

### H8 — Marketplace treats a valid zero amount as missing

**Severity:** High

**Evidence**

- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts:1389-1392`
- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts:1642-1645`
- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts:1878-1881`
- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts:2034-2046`

Checks using `value && !value.isZero() ? value : fallback` replace a legitimate zero with a fallback price.

**Required fix:** fallback only on `null`/`undefined`; preserve zero.

### M1 — OTA/direct total is divided and recomposed with rounding drift

**Severity:** Medium

**Evidence**

- `services/auth-service/src/modules/channel-manager/services/channex-booking-ingestion.service.ts:397-403`
- `services/auth-service/src/modules/channel-manager/services/direct-booking.service.ts:461-465`

`1,000,000 / 3` is stored as `333,333.33`; checkout recomposes `999,999.99`.

**Required fix:** snapshot the quoted booking total or allocate the remainder to the final night so the sum remains exact. VND should use integer đồng.

### M2 — No database invariant prevents duplicate room charges

**Severity:** Medium

**Evidence**

- `services/auth-service/prisma/schema.prisma:1547-1598`
- `services/auth-service/src/modules/billing/application/billing.service.ts:1569-1607`

Application logic uses `findFirst()` followed by create/update. No unique identity protects `(folioId, sourceType, sourceId)`. Existing duplicates are all included in invoice totals.

**Required fix:** add source identity uniqueness and require exactly one active `ROOM_CHARGE` per stay. A migration/backfill requires separate approval before application.

### M3 — Tax policy is stored but not enforced

**Severity:** Medium

Room charge, service, marketplace, and manual items generally retain zero tax. The system has no authoritative included/excluded VAT rule.

**Required fix:** decide whether prices include VAT; snapshot rate and amount per item. Until then, expose that tax is not calculated rather than implying a calculated zero.

## Remediation order

1. OTA prepaid/collection ownership.
2. Cross-currency rejection.
3. Contract-night calculation and explicit early departure.
4. Service price/currency snapshot.
5. Missing-room-rate fail-closed behavior.
6. Negative-total and real payment-amount rules.
7. Atomic/idempotent adjustments and checkout.
8. Zero-value marketplace preservation.
9. Exact booking-total preservation and room-charge uniqueness.
10. Tax policy after an explicit product/accounting decision.

## Verification evidence

- Backend focused suites: **7/7 suites, 143/143 tests passed**.
- Billing frontend calculation tests: **4/4 passed**.
- Folio seam frontend tests: **4/4 passed**.
- `pnpm build:api`: passed.
- Formula reproduction:
  - OTA quote `1,000,000` over three nights recomposes to `999,999.99`.
  - Late arrival on a five-night booking charges three nights.
  - Early departure on a five-night booking charges four nights.
  - `500,000 - 700,000` produces `-200,000`.
- Unrelated frontend baseline failure: `front-desk-room-detail-panel.test.ts:123` expects obsolete UI copy; 14/15 tests passed in that file's combined run.

## Implementation boundaries

- Preserve existing dirty work, especially `frontends/front-end-vietsage/src/features/workspace/types/workspace-registry.ts`.
- Do not apply migrations/backfills, install dependencies, commit, push, or deploy without explicit approval.
- Financial fixes require regression tests at the shared source of truth, not only UI guards.
