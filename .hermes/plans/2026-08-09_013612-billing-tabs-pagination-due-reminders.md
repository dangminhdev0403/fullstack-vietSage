# Billing Tabs, Pagination, and Due Reminder Implementation Plan

> **For Hermes:** After explicit approval, run sequential bounded Antigravity slices with strict RED/GREEN and independent verification.

**Goal:** Remove the React key warning at its real composition seam, paginate billing lists, fully Vietnamese-localize visible dashboard copy, show each room's corresponding SaaS amount, and surface actionable payment reminders to the owner and authorized hotel staff.

**Architecture:** Stop passing instantiated React elements through `BillingTabSwitcher`; let the switcher own its two client components from plain serializable props. Reuse existing pagination and URL `searchParams`. Keep billing arithmetic backend-owned: verify billable-day uniqueness before changing any calculation, aggregate each room's amount from immutable `PlatformBillableDay.amount`, and return one backend reminder projection. Staff sees the reminder only when the active session already has `hotel.revenue-protection.view`; do not silently grant financial permissions.

**Tech Stack:** Next.js App Router, React, existing NestJS/Prisma platform-billing service, Zod, existing internal API/BFF routes. No dependency or package/lockfile changes.

## Scope decisions

- Pagination applies to:
  - Owner folios: existing backend `page/limit`, default 20.
  - SaaS billing periods: default 10, maximum 50.
  - Monthly billable-day details: default 20, maximum 100.
- Pagination state uses URL query parameters. No global store, table library, or new hook.
- “Sắp đến hạn” means positive outstanding balance with `dueAt` from now through the next 7 calendar days. “Quá hạn” remains `dueAt < now`. This reminder window is unrelated to the displayed number of charged room-days.
- Reminder source is backend projection, never client date/debt recomputation.
- All visible owner/staff dashboard copy is Vietnamese. Remove visible `ACTIVE`, `Usage Count`, `Billable Day`, `Room-Days`, `Period Start`, `Period End`, and similar mixed-English labels. Internal code/API identifiers stay unchanged.
- Replace visible “Billable Day” with “Ngày phòng tính phí”. The count means unique charged room-dates in the selected month, not a rolling 7-day metric.
- Do not “fix” a displayed count such as 7 by changing money logic without proof. First test uniqueness by `(contractId, subjectType, subjectId, serviceDate)` and reconcile the selected month/date range.
- Each room summary card displays `Số lượt lưu trú`, `Ngày phòng tính phí`, and `Phí tương ứng`. `Phí tương ứng` is the sum of persisted `PlatformBillableDay.amount` rows for that room and selected month, not `count × current unit price`.
- Staff reminder is informational: “Báo chủ khách sạn”. No staff settlement action.
- Staff without `hotel.revenue-protection.view` receives no SaaS debt data or banner. Granting this permission to more roles is a separate RBAC decision, excluded.
- Existing unrelated dirty/untracked work must be preserved. No reset, checkout, broad formatting, commit, push, deploy, or migration.

---

### Slice 1: Fix `BillingTabSwitcher` key warning at the composition seam

**Observable change:** Opening owner billing produces no `Each child in a list should have a unique key prop` warning.

**Allowed files:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.test.ts`

**Root cause:** `OwnerBillingPage` creates two React elements and passes them as `ReactNode` props across the Server Component to Client Component boundary. `BillingTabSwitcher` only needs plain data and can instantiate both existing client components itself.

**TDD:**
1. RED source-contract test rejects `folioComponent={<.../>}` / `saasComponent={<.../>}` and `ReactNode` tab payloads.
2. GREEN changes switcher props to plain `hotelId` and folio page data.
3. GREEN imports `BillingFolioTableClient` and `OwnerSaasBillingClient` inside `billing-tab-switcher.tsx`; renders one directly by active tab.
4. Remove unused optional `hotelId` and ReactNode props. Do not add arbitrary `key` props to silence the symptom.

**Focused gates:**
```bash
cd frontends/front-end-vietsage
node --experimental-strip-types 'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.test.ts'
npx eslint \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.tsx' \
  'src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.test.ts'
npx tsc --noEmit
```

**Runtime smoke:** Open owner billing, switch both tabs, verify browser console has no key warning.

---

### Slice 2: Paginate owner folios using the existing API contract

**Observable change:** Owner folio table shows 20 rows per page with previous/next controls and stable search/filter behavior for the current backend page.

**Allowed files:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.tsx`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-folio-table-client.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-folio-pagination.test.ts`

**Reuse:** `BillingPage<T>` already exposes `page`, `limit`, `total`, `items`; `BillingService.listFolios()` already forwards query parameters.

**TDD:**
1. RED rejects hardcoded `limit: 50`; requires bounded `page` parsed from `searchParams` and `limit: 20`.
2. GREEN parses `folioPage` as positive integer, fallback 1. Backend remains authoritative.
3. Pass the whole `BillingPage<FolioListItem>` to the switcher/table, not only `items`.
4. Add native `<Link>` previous/next controls preserving the active billing tab query value. Disable boundaries using `page` and `Math.ceil(total / limit)`.
5. Keep search/status filters local to the loaded page. No client-side fake “global search” claim.

**Focused gates:** Node source-contract test, touched-file ESLint, `npx tsc --noEmit`.

---

### Slice 3: Verify billable-day truth, add bounded pagination, room amounts, and due-soon projection

**Observable change:** Owner SaaS history and monthly charged-room-day detail paginate independently; every room card shows its persisted corresponding fee; analytics returns a backend-derived reminder summary.

**Allowed files, max 8:**
- Modify: `services/auth-service/src/modules/platform-billing/domain/schemas/platform-billing.schema.ts`
- Modify: `services/auth-service/src/modules/platform-billing/api/platform-billing.controller.ts`
- Modify: `services/auth-service/src/modules/platform-billing/application/platform-billing.service.ts`
- Modify: `services/auth-service/src/modules/platform-billing/tests/platform-billing-onboarding.spec.ts`
- Modify: `frontends/front-end-vietsage/src/app/api/owner/platform-billing/analytics/[hotelId]/route.ts`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-pagination.test.ts`

**Backend query contract:**
```ts
{
  monthDate?: string;
  periodPage: number;       // default 1
  periodLimit: number;      // default 10, max 50
  billableDayPage: number;  // default 1
  billableDayLimit: number; // default 20, max 100
}
```

**Response additions:**
```ts
{
  periodsPage: { page, limit, total, items },
  billableDaysPage: { page, limit, total, items },
  reminder: {
    dueSoonCount,
    overdueCount,
    dueSoonOutstandingAmount,
    overdueOutstandingAmount,
    nearestDueAt: string | null
  },
  roomUsageSummary: Array<{
    roomNumber: string;
    usageCount: number;
    billableDaysCount: number;
    billedAmount: number;
    currency: string;
  }>
}
```

**TDD:**
1. RED validates defaults, caps, invalid page rejection, and offset bounds.
2. RED proves each room's `billableDaysCount` counts unique persisted service dates in the selected month; duplicate room/date rows cannot inflate count or money.
3. RED proves `billedAmount` equals the sum of persisted `PlatformBillableDay.amount` for that room/month, including price revisions; never recompute from current unit price.
4. RED proves due-soon includes only FINALIZED periods with positive outstanding and `now <= dueAt <= now + 7 days`.
5. RED proves paid periods excluded; overdue counted separately.
6. GREEN replaces period `take: 12` and unpaginated monthly billable-day fetch with Prisma `count` plus bounded `skip/take` inside `Promise.all`.
7. GREEN extends the existing room aggregation loop by one Decimal amount accumulator. No new reporting class/query layer.
8. GREEN calculates reminder in one bounded aggregate SQL query scoped to the hotel contract. Reuse settlement aggregation logic; no scheduler/table/event.
9. BFF forwards the request query string unchanged after preserving authenticated backend targeting.
10. Owner client renders native previous/next controls for both lists. No new table package.

**Backend gates:**
```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests/platform-billing-onboarding.spec.ts src/modules/platform-billing/tests/platform-billing-period.spec.ts --runInBand
npm run build
```

**Frontend gates:** source-contract test, touched-file ESLint, `npx tsc --noEmit`.

---

### Slice 4: Fully Vietnamese owner overview, room prices, and due reminder

**Observable change:** Owner billing overview contains no mixed-English business labels, room cards show corresponding fees, and one actionable banner appears when debt is due within 7 days or overdue.

**Allowed files:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx`
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-pagination.test.ts`

**Behavior:**
- Overdue wins visual priority over due-soon.
- Banner displays count, outstanding amount, nearest due date.
- Vietnamese labels only: `Hợp đồng đang hoạt động`, `Số lượt lưu trú`, `Ngày phòng tính phí`, `Phí SaaS ước tính tháng này`, `Các kỳ hóa đơn đã chốt`, `Phí tương ứng`.
- Room card fee formats backend `billedAmount` with backend currency. No frontend multiplication.
- Add one short helper sentence: `Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn.`
- No popup, sound, toast, browser notification, or dismiss-state table.
- Existing billing page is the “overview”; do not duplicate the banner on unrelated owner dashboards without a separate request.

**Focused gates:** source-contract test, ESLint, typecheck.

---

### Slice 5: Authorized staff reminder to notify the corresponding owner

**Observable change:** Staff billing page shows a read-only “Báo chủ khách sạn” reminder only when the active session has `hotel.revenue-protection.view` and debt is due soon/overdue.

**Allowed files:**
- Modify: `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/page.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-saas-reminder.tsx`
- Create: `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-saas-reminder.test.ts`
- Reuse existing authenticated backend call path; if a staff same-origin proxy is required, pause and request scope expansion instead of copying the owner proxy blindly.

**TDD:**
1. RED proves no analytics request without `hotel.revenue-protection.view`.
2. RED proves due-soon/overdue banner uses backend reminder fields, not client calculation.
3. GREEN fetches only when capability exists, in parallel with current folio/dashboard calls.
4. Banner text identifies this as VietSage SaaS debt and instructs staff to notify the hotel owner. No settlement button.
5. Fail closed: analytics fetch failure hides the financial reminder and logs/returns existing page normally; never expose cross-hotel data.

**Focused gates:** source-contract test, touched-file ESLint, `npx tsc --noEmit`.

---

## Final verification

```bash
cd services/auth-service
npx jest src/modules/platform-billing/tests --runInBand
npm run build

cd ../../frontends/front-end-vietsage
# Run the four new source-contract files directly
npx eslint <all touched frontend files>
npx tsc --noEmit
npm run build
```

Runtime browser smoke:
1. Owner billing loads without key warning.
2. Folio pagination changes backend page.
3. SaaS period and billable-day pagination are independent.
4. Dashboard visible copy is Vietnamese; each room card shows its backend fee; charged-room-day count matches unique persisted dates for the selected month.
5. Due-soon (7 days) and overdue owner banners show correct amounts/dates.
6. Authorized staff sees read-only reminder; unauthorized staff sees nothing.
7. No console errors, duplicate requests, cross-hotel data, or mutation controls for staff.

After all gates pass: `graphify update .`, regenerate one bounded billing Repomix pack, verify artifacts are newer than changed source.

## Excluded

- Telegram/email/push reminders, scheduler, acknowledgment workflow, notification persistence.
- Automatic RBAC grants to front desk.
- Global owner dashboard reminder outside billing.
- New pagination library or generic pagination abstraction.
- Commit, push, deploy, migration.
