# External Service Flow Completion and Google MCP Verification Plan

> **For Hermes:** Audit/plan only. Do not modify source, DB, Google Sheets, commit, push, migrate, or deploy until separately approved. Preserve the current dirty order-flow work.

**Goal:** Close only the proven gaps between the approved tenant-owned external-service plan and the current implementation, then verify the real Google Sheets workflow through a narrowly scoped Google Workspace MCP test sheet.

**Architecture:** Keep VietSage runtime independent of MCP. MCP is an operator/QA tool for creating, inspecting, and round-trip testing a Google Sheet. Production sync remains the existing application path. Reuse the current Marketplace module, CodesService, CSV pipeline, Prisma transaction, BFF/resource chain, and real Service Tenants.

**Tech stack:** NestJS/Prisma/PostgreSQL, Next.js, existing Import framework, Google Sheets API, Hermes native MCP, `google-workspace-mcp@2.3.6` pinned for reproducibility.

---

## 1. Audited baseline

- Repository: `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`
- HEAD: `2c6be103bb4fc7d571c3966ff70e5f4d3734f99f`
- Original approved plan: `.hermes/plans/2026-08-12_031517-tenant-category-owned-service-items-excel.md`
- Scoped Repomix audit: `graphify-out/repomix/external-service-plan-audit.xml` — 20 files, 29,383 tokens, security scan clean.
- Graphify worked but reported skill `0.9.20` vs package `0.9.33`; exact current source was used as truth.
- Current working tree contains uncommitted external-order/realtime/status work plus migration `20260812020000_add_confirmed_order_status`. Do not overwrite, revert, stage, or attribute it without provenance review.

### Real verification already run

| Gate | Result |
|---|---|
| Marketplace focused Jest | **PASS — 5 suites, 38 tests** |
| Frontend `npx tsc --noEmit` | **PASS** |
| Prisma schema validation | **PASS** |
| Scoped `git diff --check` | **PASS**; CRLF warnings only |
| Backend repository-wide `tsc` | **FAIL** — pre-existing/cross-scope errors plus one dirty Marketplace spec signature error at `marketplace-order.service.spec.ts:181` |
| Google Workspace MCP auth | **BLOCKED** — `~/.google-mcp/credentials.json` missing; 0 accounts |

---

## 2. Plan compliance verdict

**Overall: PARTIAL. Core business flow exists. Original plan is not fully closed.**

| Requirement | Status | Evidence / gap |
|---|---|---|
| Platform Admin owns categories | DONE | Admin category API/UI/import exists. |
| Admin assigns one category to Service Tenant | DONE for new/updated tenants | `serviceTenantBodySchema.categoryId`; Admin create/edit selector; active-category validation. |
| Tenant cannot choose category | DONE at API boundary | Service item schemas are `.strict()` and contain no `categoryId`; tests cover rejection. |
| Item inherits tenant category | PARTIAL compatibility window | Writes copy profile category into legacy `MarketplaceService.categoryId`; read paths derive profile category. |
| Exactly one category at DB level | MISSING | `ServiceTenantProfile.categoryId` remains nullable. |
| Remove redundant item category | MISSING | `MarketplaceService.categoryId` and relation/index remain. No contract migration. |
| Category deletion non-destructive | DONE | Referenced category returns conflict; services are not cascaded. |
| Hotel remains multi-category | DONE by schema separation | Hotel models still retain category-per-item. Run regression test before completion. |
| Tenant item fields and CRUD | DONE backend; UI present | Price, waiting/preparation, capacity, mode, status supported. |
| Safe preview/commit | DONE baseline | Reparse + state hash + transaction + tenant scoping. |
| System-generated service code | DONE | Existing `CodesService.generateEntityCode()` used inside transaction. |
| Upsert-only; omission does not delete | DONE | Adapter supports only `upsert`; disable count is zero. |
| Row/column validation | PARTIAL | Required/type/enum/range/forbidden-category handled; unknown non-category columns silently pass. |
| Multilingual import | PARTIAL / BUG | Translation rows are written, but translation-only edits are classified unchanged and skipped. |
| Multilingual export | MISSING | Export omits translations entirely. |
| Guest multilingual service names | MISSING | Guest query localizes categories only; service translations are not loaded/applied. |
| Correct CSV export | BUG | Header fields are concatenated with `join("")`; no commas between header cells. |
| Google Sheet live read | PARTIAL | Frontend fetches exported CSV URL; private sheets are unsupported without runtime auth. |
| Generated-code writeback | UNVERIFIED | Uses `google.auth.GoogleAuth`/ADC, not Hermes MCP OAuth. No real credential proof. |
| External order creation | DONE | Idempotent canonical `MarketplaceOrder`, capacity reservation, snapshots. |
| Provider processing | DONE in current dirty baseline | `PENDING → CONFIRMED → COMPLETED`, cancellation exception. |
| Hotel read-only coordination | DONE/dirty | Dedicated hotel coordination/voucher paths exist. |
| Realtime guest/hotel/provider | DONE/dirty | Multi-party events/hooks exist; current changes remain uncommitted. |
| Folio posting on completion | DONE | Atomic, idempotent source tuple, fails closed without compatible open folio. |

---

## 3. Proven root gaps

### Gap A — contract migration never finished

Current schema still carries both sources:

```text
ServiceTenantProfile.categoryId  nullable
MarketplaceService.categoryId    required legacy copy
```

This is a deliberate migration window, not the target architecture. Close only after a real unresolved-tenant audit returns zero.

### Gap B — multilingual item sync is not round-trip safe

`MarketplaceServiceItemImportAdapter.changes()` ignores translations. Commit skips an existing row when scalar changes are empty. Therefore changing only `name_en`, `description_zh`, etc. produces `unchanged` and never calls translation upsert.

Export also does not select or serialize `MarketplaceServiceTranslation`. Guest discovery does not localize service item name/description.

### Gap C — export CSV is malformed

`ServiceItemImportService.export()` builds header cells and joins the whole array with an empty separator. Header commas are missing. Existing test checks formula escaping only; no parse-back/header equality test catches this.

### Gap D — Google auth boundaries are inconsistent

- Application CSV read: direct URL fetch. Works only for a publicly/export-accessible sheet.
- Application code writeback: Google ADC via `GoogleAuth`; separate credentials and access model.
- Google MCP: user OAuth under `~/.google-mcp`; useful for QA/operator actions only.

Do not make production depend on Hermes MCP. Decide public-sheet vs private-sheet runtime ownership explicitly.

### Gap E — verification debt

Focused tests pass. Full backend typecheck is red. One Marketplace error is in current dirty work (`marketplace-order.service.spec.ts:181`, expected 2 args, got 3); other errors are outside this scope. Completion requires the scoped Marketplace error fixed without absorbing unrelated repository failures.

---

## 4. Minimal implementation plan

### Task 0 — freeze provenance and audit data

**No source change yet.**

1. Record HEAD and scoped dirty status again.
2. Inspect the author/provenance of current dirty order/realtime/status changes.
3. Run the existing read-only audit:

```bash
cd services/auth-service
# Use the existing configured local/UAT DB only; never production without separate approval.
psql "$DATABASE_URL" -f prisma/audits/service-tenant-category-resolution.sql
```

4. Record counts for zero-category, one-category, and multi-category tenants.
5. Stop contract migration if unresolved count is non-zero.

**Gate:** no DB writes.

### Task 1 — fix CSV round-trip with one regression test

**Files:**

- Modify: `services/auth-service/src/modules/marketplace/application/service-item-import.service.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/marketplace-service-item-import.adapter.spec.ts`

**RED:** export one item; feed export back through preview/parser; assert exact canonical headers and one data row.

**GREEN:** replace hand-built empty-separator export with the existing `csvRow()` for both header and data rows.

```ts
return "\uFEFF" + [this.csvRow(headers), ...rows.map((row) => this.csvRow(row))].join("\n");
```

No new CSV dependency.

### Task 2 — make translations part of state/diff/export

**Files:** same adapter/service/tests only unless guest localization requires the read service.

1. RED: translation-only change must produce `update`.
2. Include translations in `loadCurrentState()` using one relation include; no per-row query.
3. Compare normalized translation name/description in `changes()`.
4. Export all supported locale columns in the same order as the template.
5. RED: export/import round trip preserves `en`, `zh`, `ko`, `ru`, `hi`.
6. Preserve blank-cell semantics explicitly:
   - blank locale name = leave existing translation unchanged for V1; or
   - blank locale name = delete translation.

**Default:** leave unchanged. Deletion-by-blank is destructive and was never approved.

### Task 3 — localize guest service items

**Files:**

- Modify: `services/auth-service/src/modules/marketplace/application/guest-marketplace.service.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/guest-marketplace.service.spec.ts`
- Sync frontend contract only if response shape changes.

1. Load service translations in the existing single Marketplace query.
2. Return localized `name`/`description`: requested locale → Vietnamese base fields.
3. Do not alter category localization or Hotel service behavior.
4. Add one locale fallback test.

### Task 4 — reject unknown spreadsheet columns

**Files:** import service + focused test.

1. Derive allowed canonical keys from adapter schema.
2. Reject unknown headers with row `1`, exact column, Vietnamese message.
3. Keep explicit `CATEGORY_COLUMN_FORBIDDEN` for category aliases.
4. Do not add a generic validation framework.

### Task 5 — close category contract migration only after audit gate

**Files:**

- `services/auth-service/prisma/schema.prisma`
- New migration: `..._move_marketplace_category_to_tenant/migration.sql`
- Marketplace admin/service/guest/import services and focused tests.

Migration precondition:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ServiceTenantProfile" WHERE "categoryId" IS NULL) THEN
    RAISE EXCEPTION 'Unresolved ServiceTenantProfile.categoryId rows exist';
  END IF;
END $$;
```

Then:

1. Set `ServiceTenantProfile.categoryId NOT NULL`.
2. Drop `MarketplaceService.categoryId` FK/index/column.
3. Remove compatibility writes on create/import/reassignment.
4. Remove `MarketplaceCategory.services` relation.
5. Keep category reassignment as one profile update plus audit only.
6. Keep Hotel category models untouched.

**Do not run migration on VPS/production in this phase.** Generate and validate locally only after approval.

### Task 6 — verify current dirty order flow separately

Do not mix catalog fixes with the current uncommitted order/status work.

1. Fix only the scoped Marketplace spec signature mismatch.
2. Re-run transition, idempotency, capacity release, folio posting, revenue, settlement, realtime tests.
3. Verify no double folio item for repeated completion attempts.
4. Verify completion fails atomically when no open folio/currency mismatch.
5. Verify Hotel UI remains coordination/read-only; provider owns fulfillment transitions.
6. Keep this as a separate scoped commit after user approval.

---

## 5. Google MCP setup and real-operation plan

### Important boundary

Google MCP is **not** application runtime infrastructure. Use it to create/read/write a disposable QA spreadsheet and verify what the user sees. The app still syncs through its own backend/BFF path.

### Phase G0 — credentials, no Google data mutation

Prerequisites:

1. User creates/selects a Google Cloud project.
2. Enable Drive API and Sheets API.
3. Create Desktop OAuth client.
4. Add the Google account as test user when consent screen is in Testing.
5. Download JSON to a non-repository location, recommended:

```text
C:\Users\Dangminhdev0403\.google-mcp\credentials.json
```

Never place credentials/token files in the VietSage repo.

Authenticate:

```bash
npx -y google-workspace-mcp@2.3.6 setup
npx -y google-workspace-mcp@2.3.6 accounts add vietsage -c "C:/Users/Dangminhdev0403/.google-mcp/credentials.json"
npx -y google-workspace-mcp@2.3.6 accounts test-permissions vietsage
npx -y google-workspace-mcp@2.3.6 status
```

This opens Google OAuth. User completes sign-in/consent. Hermes never types passwords, 2FA, or secrets.

### Phase G1 — install read-only MCP first

```bash
hermes mcp add google-workspace-ro \
  --command npx \
  --connect-timeout 120 \
  --args -y google-workspace-mcp@2.3.6 serve --read-only

hermes mcp test google-workspace-ro
hermes mcp configure google-workspace-ro
```

Enable only the discovered equivalents of:

- `listGoogleSheets`
- `getSpreadsheetInfo`
- `readSpreadsheet`

Then `/reset` or `/reload-mcp` as supported by the active Hermes surface.

**Read-only acceptance:** inspect the target sheet metadata and header/sample ranges; no writes.

### Phase G2 — disposable write-capable QA MCP

Requires separate user approval because this creates/modifies Google data.

```bash
hermes mcp add google-workspace-qa \
  --command npx \
  --connect-timeout 120 \
  --args -y google-workspace-mcp@2.3.6 serve

hermes mcp test google-workspace-qa
hermes mcp configure google-workspace-qa
```

Enable only:

- `createSpreadsheet`
- `getSpreadsheetInfo`
- `readSpreadsheet`
- `writeSpreadsheet`
- optionally `clearSpreadsheetRange`

Do not enable Gmail, Calendar, Docs, Slides, Forms, broad Drive deletion, sharing, or unrelated tools.

### Phase G3 — real QA sheet operations

After showing the exact title/content and receiving approval:

1. Create one disposable sheet: `VietSage External Service Catalog QA <timestamp>`.
2. Write canonical headers to `items!A1:R1`.
3. Write two rows:
   - valid multilingual create row with blank system code;
   - valid update row using an existing tenant-scoped generated code only in local/UAT.
4. Read `items!A1:R3` back through MCP; compare exact values.
5. Put the resulting sheet URL into one local/UAT Service Tenant profile only.
6. Run application Preview. Expected: exact create/update/unchanged counts; no category field.
7. Do not Commit yet. Capture preview evidence.
8. After separate DB-write approval, Commit once in local/UAT.
9. Read Sheet column A through MCP. Expected: generated service code written back.
10. Query local/UAT DB/API. Expected: scalar fields and all translations match.
11. Change only `name_en`; Preview must show update after Task 2.
12. Commit with approval; Guest locale `en` must show updated English name after Task 3.
13. Add forbidden `category_id` column; Preview must fail with exact header error and write nothing.
14. Change a DB item after Preview; Commit must return stale-preview conflict and write nothing.
15. Re-run Hotel catalog smoke test. No behavior change.

### Phase G4 — cleanup

Requires confirmation.

- Trash the disposable QA spreadsheet; do not permanently delete.
- Remove `google-workspace-qa` MCP after testing if ongoing writes are unnecessary.
- Keep `google-workspace-ro` only if repeated audits justify it.
- Never revoke or delete user credentials without explicit request.

---

## 6. Runtime Google authorization decision

Choose before claiming private-sheet support:

### Option A — public/export-accessible sheet

- Minimal code.
- Existing CSV fetch works.
- Sheet content is accessible to anyone with export URL.
- Generated-code writeback still needs a separately authorized Google identity with edit access.

### Option B — private sheet

- Preferred for production data.
- Backend must fetch/write with a dedicated Google credential model.
- MCP OAuth cannot serve as runtime auth.
- Store only credential references/secrets outside DB logs and repo.
- Requires a separate security/design plan; do not smuggle it into this fix.

**Default for this plan:** use a disposable non-sensitive QA sheet. Do not claim production-private support.

---

## 7. Verification commands

Backend focused:

```bash
cd services/auth-service
npm test -- --runInBand \
  src/modules/marketplace/tests/marketplace-admin.service.spec.ts \
  src/modules/marketplace/tests/service-portal.service.spec.ts \
  src/modules/marketplace/tests/guest-marketplace.service.spec.ts \
  src/modules/marketplace/tests/marketplace-service-item-import.adapter.spec.ts \
  src/modules/marketplace/tests/marketplace-order.service.spec.ts
npx prisma validate
npm run build
```

Hotel regression:

```bash
npm test -- --runInBand src/modules/property/tests/infrastructure/imports/service-catalog-import.adapter.spec.ts
```

Frontend:

```bash
cd frontends/front-end-vietsage
npx tsc --noEmit
npx eslint \
  "src/features/marketplace" \
  "src/features/service-portal" \
  "src/features/request-realtime" \
  "src/app/(vietsage)/g/services" \
  "src/app/(vietsage)/hotels/[hotelId]/requests"
npm run build
```

Contract/schema:

```bash
cd services/auth-service
npm run openapi:export
cd ../../shared/api-contract
npm run verify
```

Context sync after verified implementation only:

```bash
graphify update .
npx repomix@latest . --include "<exact changed marketplace files>" --compress --style xml --output graphify-out/repomix/external-service-final.xml
```

---

## 8. Acceptance criteria

- [ ] `ServiceTenantProfile.categoryId` is non-null after explicit legacy resolution.
- [ ] `MarketplaceService.categoryId` no longer exists after contract migration.
- [ ] Tenant API/UI cannot submit category per item.
- [ ] CSV export parses back with exact headers and values.
- [ ] Translation-only spreadsheet edit previews and commits as update.
- [ ] Export preserves all supported translations.
- [ ] Guest locale uses service translation with Vietnamese fallback.
- [ ] Unknown/forbidden columns report row 1 + exact column; no writes.
- [ ] Preview/commit stale-state guard blocks changed state.
- [ ] Code generation uses existing CodesService once per new item.
- [ ] Google MCP round-trip succeeds on a disposable QA sheet.
- [ ] Application Preview succeeds using that QA sheet.
- [ ] Application Commit and generated-code writeback run only after separate approval.
- [ ] Hotel multi-category behavior remains unchanged.
- [ ] Marketplace focused tests, frontend typecheck/build, Prisma validation pass.
- [ ] Existing dirty order-flow work preserved and reviewed separately.

---

## 9. Approval gates

1. **Code changes:** approve Tasks 1–4 first. They are small, non-migration fixes.
2. **Migration:** approve Task 5 only after unresolved count is zero.
3. **Current dirty order work:** approve separate validation/fix scope.
4. **Google OAuth:** user supplies credential JSON path and completes browser consent.
5. **Google creation/write:** approve exact QA sheet title/range/rows before MCP mutation.
6. **Local/UAT DB commit:** approve after Preview evidence.
7. **Production/VPS:** separate backup, migration, cutover, rollback approval. Not included here.

**Status:** `PLAN SAVED — NO SOURCE/DB/GOOGLE MUTATION PERFORMED`.

→ skipped: new runtime MCP dependency, new CSV/XLSX package, private-sheet auth redesign. Add only when production-private Sheets support is explicitly approved.
