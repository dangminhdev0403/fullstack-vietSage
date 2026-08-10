# Platform Billing Debt Completion Plan

> **For Hermes:** After explicit user approval, invoke Antigravity sequentially, one bounded writer per slice. Independently verify every slice before starting the next.

**Goal:** Make VietSage platform SaaS debt accurate end to end: partial settlement, outstanding balance, paid/overdue projection, correct admin and owner UI.

**Architecture:** Keep `PlatformBillingPeriod.status` as lifecycle state (`DRAFT | FINALIZED | VOID`). Do not add `PAID` or mutate financial history. Derive `settledAmount`, `outstandingAmount`, and payment state from append-only settlements at the backend projection seam. Enforce overpayment under the period row lock inside the existing settlement transaction.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Jest, Next.js/React, existing internal API proxy. No package or lockfile changes.

## Scope decisions

- Included: platform SaaS debt under `platform-billing`.
- Excluded: guest folio credit/receivables. Current checkout remains full-payment or zero-balance only. This is a separate product policy and data-model slice.
- Reuse: existing settlement table, period transaction, controller, BFF route, admin billing page, owner analytics page.
- No new payment-status enum. Derived states: `UNPAID`, `PARTIALLY_PAID`, `PAID`; `isOverdue` is a separate boolean based on `dueAt` and positive outstanding balance.
- Money comparison uses Prisma Decimal. Never JS floating-point arithmetic in backend money paths.

## Existing dirty-work boundary

Preserve every pre-existing modified/untracked file. Never reset, checkout, overwrite, commit, push, deploy, or run migrations. Target billing service currently has a pre-existing formatting-only diff; Antigravity must not reformat unrelated ranges.

---

### Slice 1: Settlement invariants and debt projection

**Observable change:** Backend rejects overpayment and returns exact outstanding/payment state for each finalized period.

**Allowed files, hard boundary:**
- Modify: `services/auth-service/src/modules/platform-billing/application/platform-billing.service.ts`
- Modify: `services/auth-service/src/modules/platform-billing/tests/platform-billing-period.spec.ts`

**Proven root cause:** `recordSettlement()` appends any positive amount without locking the period or summing previous settlements. `PlatformBillingPeriod.status` has no `PAID`, so payment state must be derived.

**TDD:**
1. RED: settlement equal to remaining balance succeeds.
2. RED: partial settlement returns `PARTIALLY_PAID` and positive `outstandingAmount`.
3. RED: cumulative settlement above period total is rejected before insert.
4. RED: same idempotency key returns the existing settlement without double counting.
5. GREEN: lock period row, load/sum settlements, compare Decimal totals, append only if amount does not exceed outstanding.
6. GREEN: add one private projection helper or inline projection, whichever yields the smaller correct diff. Return projected fields from `recordSettlement()`, `listPeriods()`, `getPeriod()`, `getDashboardSummary()`, and `getOwnerAnalytics()` through one shared seam.

**Required projection:**
```ts
{
  settledAmount,
  outstandingAmount,
  paymentState: "UNPAID" | "PARTIALLY_PAID" | "PAID",
  isOverdue
}
```

**Focused gate:**
```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests/platform-billing-period.spec.ts --runInBand
```
Expected: PASS; new tests prove partial, exact, overpay, idempotent retry.

**Stop conditions:** More than 2 files, schema/migration need, unclear Decimal behavior, or inability to produce genuine RED.

---

### Slice 2: Correct dashboard debt totals

**Observable change:** Dashboard counts and totals only real positive outstanding debt; collected money is labeled separately from finalized charges.

**Allowed files, hard boundary:**
- Modify: `services/auth-service/src/modules/platform-billing/application/platform-billing.service.ts`
- Modify: `services/auth-service/src/modules/platform-billing/tests/platform-billing-onboarding.spec.ts`

**TDD:**
1. RED: fully settled period excluded from due count/list.
2. RED: partial settlement contributes only remaining balance.
3. RED: overdue count requires `dueAt < now` and positive outstanding.
4. GREEN: derive bounded summary from the existing 20-period due projection. Do not add a reporting subsystem or new table.

**Dashboard contract:**
```ts
{
  activeContracts,
  finalizedPeriods,
  finalizedAmount,
  collectedAmount,
  outstandingAmount,
  unpaidPeriodCount,
  overduePeriodCount,
  duePeriods
}
```

`duePeriods` entries include the Slice 1 projection. Remove ambiguous `totalFinalizedRevenue`; finalized charges are not collected revenue.

**Focused gate:**
```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests/platform-billing-onboarding.spec.ts src/modules/platform-billing/tests/platform-billing-period.spec.ts --runInBand
```
Expected: PASS.

**Stop conditions:** Query becomes unbounded, needs aggregation over all settlement history without period bound, or changes public billing behavior outside platform billing.

---

### Slice 3: Admin debt UI uses backend truth

**Observable change:** Admin sees correct unpaid/partial/paid/overdue state and cannot submit more than the outstanding amount.

**Allowed files, hard boundary:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/admin/billing/admin-billing-client.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/admin/billing/admin-billing-debt.test.ts`

**TDD:**
1. RED source/behavior check proves UI no longer treats period lifecycle status as `PAID`.
2. RED check proves settlement modal defaults to `outstandingAmount`, not `total`.
3. GREEN: update local DTOs and render backend-derived `paymentState`, `outstandingAmount`, `isOverdue`.
4. GREEN: KPI labels use `finalizedAmount`, `collectedAmount`, `outstandingAmount`, `overduePeriodCount`.
5. GREEN: validate amount `> 0 && <= outstandingAmount`; Vietnamese inline error. Keep server rejection authoritative.
6. GREEN: generate idempotency key once when opening the modal; preserve it across submit retries. Do not use a fresh `Date.now()` per retry.

**Focused gates:**
```bash
cd frontends/front-end-vietsage
node --experimental-strip-types --test 'src/app/(vietsage)/admin/billing/admin-billing-debt.test.ts'
npx eslint 'src/app/(vietsage)/admin/billing/admin-billing-client.tsx' 'src/app/(vietsage)/admin/billing/admin-billing-debt.test.ts'
```
Expected: PASS, 0 ESLint errors.

**Stop conditions:** New dependency/test framework required, BFF contract change required, or existing unrelated `system-audit` TypeScript failures block only global typecheck. Do not fix those failures.

---

### Slice 4: Owner debt visibility

**Observable change:** Hotel owner sees each period's paid amount, remaining debt, and overdue state from the same backend projection.

**Allowed files, hard boundary:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-debt.test.ts`

**TDD:**
1. RED check for projected fields and Vietnamese labels.
2. GREEN: replace client settlement summation/status inference with backend fields.
3. GREEN: show `Đã thanh toán`, `Còn phải trả`, `Quá hạn`; no payment mutation for owner.
4. Keep existing API route and permissions. No new endpoint.

**Focused gates:**
```bash
cd frontends/front-end-vietsage
node --experimental-strip-types --test 'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-debt.test.ts'
npx eslint 'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx' 'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-debt.test.ts'
```
Expected: PASS, 0 ESLint errors.

---

### Final independent verification

Hermes reruns, never trusts writer summaries:

```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests --runInBand
npm run build

cd ../../frontends/front-end-vietsage
node --experimental-strip-types --test \
  'src/app/(vietsage)/admin/billing/admin-billing-debt.test.ts' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-debt.test.ts'
npx eslint \
  'src/app/(vietsage)/admin/billing/admin-billing-client.tsx' \
  'src/app/(vietsage)/admin/billing/admin-billing-debt.test.ts' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-debt.test.ts'
```

Global frontend `npx tsc --noEmit` is attempted after writers stop. Existing unrelated `system-audit` errors are reported separately, not fixed or attributed to this scope. Inspect scoped diff, verify HEAD/provenance, then refresh Graphify and regenerate a bounded Repomix pack only after all four slices pass.

## Antigravity dispatch contract

- Canonical workspace: `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`.
- One writer at a time. One invocation per approved slice. Maximum 8 files, 20-minute internal time box, 25-minute outer timeout.
- English prompt. `effort medium`.
- Read-only project-binding probe first. Writer launch only after explicit user approval.
- Forbidden: sibling repositories, clone/worktree, package/lockfile, migration, secrets, unrelated dirty files, commit, push, deploy, production.
- Strict RED/GREEN. Stop batch on first failed gate, scope expansion, or provenance surprise.
- Hermes sends STARTED/DONE/BLOCKED directly through the configured notifier and independently verifies real files and commands.

## Residual risk

- No DB-backed concurrency integration test is added in this minimal slice. Serializable transaction plus period-row lock is covered by service behavior tests. Add a PostgreSQL concurrency test only if production contention or a race is observed.
- Guest folio debt remains out of scope. Add only after product decisions for debtor identity, credit limit, due date, collection permissions, and checkout behavior are approved.
