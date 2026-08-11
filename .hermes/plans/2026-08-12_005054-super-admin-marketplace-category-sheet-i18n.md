# Super Admin Marketplace Category Sheet + I18n Implementation Plan

> **For Hermes:** Implement task-by-task with TDD. Do not deploy, commit, push, or touch VPS without separate approval.

**Goal:** Make Google Sheets the primary management path for Super Admin “Danh mục dịch vụ ngoài”, while preserving a small manual fallback and serving localized category names to guests.

**Architecture:** Reuse the existing `ImportModule`, `ImportService`, Google Sheets client, validation/diff/transaction contract, query-resource frontend pattern, and locale resolver. Add one Marketplace-specific import adapter. Vietnamese remains the base field; non-base locales live in a translation table. Preview and commit each re-read the sheet; commit compares a workbook hash to prevent committing data changed after preview.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, existing `googleapis`, Next.js App Router, query-resource, existing DataTable/inline sync UI.

---

## Product decisions

1. **Primary workflow:** paste Google Sheets URL → Preview → review validation/diff → Commit.
2. **Import mode:** `upsert` only. Missing spreadsheet rows remain untouched. No mass-disable in phase 1.
3. **Manual CRUD:** keep as a secondary “Thêm thủ công” fallback; do not remove existing emergency editing.
4. **Stable key:** sheet column `category_key` maps to nullable `MarketplaceCategory.importKey`; never match by translated name.
5. **Locales:** Vietnamese base (`nameVi`); translations: `en`, `zh`, `ko`, `ru`, `hi`.
6. **Fallback:** requested locale → Vietnamese `nameVi` → stable `importKey`/`code`.
7. **English migration:** migrate existing `nameEn` into `MarketplaceCategoryTranslation(locale='en')`, then remove `nameEn` from DB/API.
8. **Blank translation cells:** preserve existing translation. No blank-means-delete.
9. **No new package:** reuse installed `googleapis`; template download is UTF-8 CSV, directly usable by Excel/Google Sheets.
10. **No persistent import-session table:** preview returns `workbookHash`; commit re-fetches and rejects a changed sheet. Add persistence only if import history/resume becomes a real requirement.
11. **No category icon field:** UI uses fixed presentation icons; the persisted `MarketplaceCategory.icon` has no business use and will be dropped.

## Sheet contract

One sheet, first tab, named diagnostically `categories`:

| Column | Required | Rule |
|---|---:|---|
| `category_key` | yes | lowercase stable key, `^[a-z0-9][a-z0-9_-]{1,79}$` |
| `name_vi` | yes | Vietnamese base name, max 120 |
| `sort_order` | no | integer ≥ 0, default 0 |
| `status` | no | `ACTIVE` / `DISABLED`, default `ACTIVE` |
| `name_en` | no | English translation |
| `name_zh` | no | Chinese translation |
| `name_ko` | no | Korean translation |
| `name_ru` | no | Russian translation |
| `name_hi` | no | Hindi translation |

Header aliases may include current Vietnamese labels, but persisted matching always uses canonical keys.

---

### Task 1: Add Marketplace category import identity and translations

**Objective:** Store stable spreadsheet identity and normalized non-Vietnamese names.

**Files:**
- Modify: `services/auth-service/prisma/schema.prisma`
- Create: `services/auth-service/prisma/migrations/<timestamp>_marketplace_category_import_i18n/migration.sql`
- Test: `services/auth-service/src/modules/marketplace/tests/marketplace-category-import-migration.spec.ts`

**Steps:**

1. Add a RED migration/schema test asserting:
   - `MarketplaceCategory.importKey` exists and is unique when non-null;
   - `MarketplaceCategoryTranslation` has cascade FK and unique `(categoryId, locale)`;
   - `MarketplaceCategory.nameEn` no longer exists.
   - `MarketplaceCategory.icon` no longer exists.
2. Run the targeted test; expect failure.
3. Change Prisma minimally:

```prisma
model MarketplaceCategory {
  id           String                           @id @default(cuid())
  code         String                           @unique @db.VarChar(80)
  importKey    String?                          @unique @db.VarChar(80)
  nameVi       String                           @db.VarChar(120)
  sortOrder    Int                              @default(0)
  isActive     Boolean                          @default(true)
  createdAt    DateTime                         @default(now())
  updatedAt    DateTime                         @updatedAt
  translations MarketplaceCategoryTranslation[]
  services     MarketplaceService[]

  @@index([isActive, sortOrder])
}

model MarketplaceCategoryTranslation {
  id         String              @id @default(cuid())
  categoryId String
  locale     String              @db.VarChar(10)
  name       String              @db.VarChar(120)
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  category   MarketplaceCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([categoryId, locale])
  @@index([locale])
}
```

4. Migration order:
   - add nullable `importKey`;
   - create translation table/indexes;
   - insert `nameEn` as locale `en` where nonblank;
   - drop `nameEn` only after backfill;
   - drop unused `icon` directly; no backfill;
   - preserve all category IDs and service FKs.
5. Run `npx prisma validate`, generate client, targeted migration test.
6. Do **not** apply production migration.

**Expected:** migration test PASS; schema valid.

---

### Task 2: Add Marketplace category ImportAdapter

**Objective:** Reuse the generic framework for parsing, validation, diff, and atomic upsert.

**Files:**
- Create: `services/auth-service/src/modules/marketplace/infrastructure/imports/marketplace-category-import.adapter.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/marketplace-category-import.adapter.spec.ts`
- Modify: `services/auth-service/src/modules/marketplace/marketplace.module.ts`

**Steps:**

1. Write RED tests for:
   - canonical sheet columns and five translation columns;
   - duplicate/malformed `category_key` errors include sheet, row, column, value;
   - unsupported status rejected;
   - new key produces `create`, changed row produces `update`, identical row `unchanged`;
   - blank translation preserves DB translation;
   - one transaction upserts category and nonblank translations;
   - adapter supports only `upsert`.
2. Run targeted test; expect failure.
3. Implement `ImportAdapter` with `type = "marketplace-categories"`.
4. Reuse the current Service Catalog adapter conventions:
   - same key regex style;
   - same translation locales;
   - same issue/diff shapes;
   - same `ImportRegistry.register(this)` lifecycle.
5. `authorize` requires `actorUserId`; endpoint permission remains the actual enforcement point.
6. Commit behavior:
   - generate immutable `code` only for creates via existing `CodesService`;
   - upsert by `importKey`;
   - update `nameVi`, `sortOrder`, `isActive`;
   - upsert only translations with a nonblank cell;
   - never delete a translation in phase 1.
7. Import `ImportModule` into `MarketplaceModule`; register adapter. No new generic framework or repository layer.
8. Run adapter test; expect PASS.

**Expected:** import behavior isolated to one adapter; existing manual categories untouched.

---

### Task 3: Add bounded Google Sheets preview/commit orchestration

**Objective:** Read one sheet safely, preview without writes, commit only the exact reviewed workbook.

**Files:**
- Create: `services/auth-service/src/modules/marketplace/application/marketplace-category-sheet.service.ts`
- Create: `services/auth-service/src/modules/marketplace/domain/marketplace-category-import.schema.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/marketplace-category-sheet.service.spec.ts`
- Modify: `services/auth-service/src/modules/marketplace/marketplace.module.ts`

**Steps:**

1. Add Zod schemas:

```ts
const sheetInput = z.object({
  spreadsheetUrl: z.string().trim().url(),
});

const commitInput = sheetInput.extend({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
});
```

2. Write RED tests:
   - extracts only a valid Google Sheets ID;
   - rejects missing credentials, inaccessible sheet, missing first tab, empty required rows;
   - converts first tab to `ParsedImportWorkbook`;
   - SHA-256 hash is deterministic;
   - preview calls `ImportService.preview` and never commit;
   - commit re-reads, rejects hash mismatch, re-previews, rejects errors, commits once.
3. Run tests; expect failure.
4. Implement the smallest service by extracting/reusing the Google Sheets read/normalization logic currently embedded in `google-sheets-service-catalog-sync.service.ts`; do not duplicate auth/header normalization.
5. Preview response returns only safe client data:

```ts
{
  workbookHash,
  summary,
  validation,
  diff
}
```

Do not return internal `payload`, `currentState`, or Prisma values.
6. Commit receives URL + expected hash, re-reads once, revalidates, then commits server-owned preview.
7. Cap rows at 2,000; reject structural/file-level errors. No partial import for this global catalog in phase 1.
8. Run targeted tests; expect PASS.

**Expected:** no client-tampered preview commit; no persistent session table.

---

### Task 4: Add Super Admin APIs and template

**Objective:** Expose private permission-gated preview, commit, and template endpoints.

**Files:**
- Modify: `services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts`
- Modify: `services/auth-service/src/modules/marketplace/domain/marketplace-admin.schema.ts` only if shared list/create contracts need translation DTOs
- Modify: `services/auth-service/src/common/openapi/contract-schemas.ts`
- Test: `services/auth-service/test/marketplace-category-import.e2e-spec.ts`

**Endpoints:**

```text
GET  /admin/marketplace/categories/import/template
POST /admin/marketplace/categories/import/preview
POST /admin/marketplace/categories/import/commit
```

**Steps:**

1. Write RED e2e tests:
   - unauthenticated → 401;
   - view-only permission cannot preview/commit;
   - `platform.marketplace.manage` can preview/commit;
   - invalid body → 400 localized envelope;
   - preview has no writes;
   - hash mismatch → 409;
   - validation errors block commit;
   - template is UTF-8 CSV with canonical headers.
2. Run targeted e2e; expect failure.
3. Add thin controller routes using `parseWithZod`.
4. Use stable success-message keys, not new hardcoded response prose.
5. Template route reuses `ImportTemplateService.toCsvSheets(...)`; return only the `categories` CSV with BOM for Excel compatibility.
6. Update OpenAPI schemas and export contract.
7. Run targeted e2e; expect PASS.

**Expected:** private, bounded, review-before-write workflow.

---

### Task 5: Localize Marketplace category readers

**Objective:** Return requested-language category names to Guest Marketplace while admin receives all editable translations.

**Files:**
- Modify: `services/auth-service/src/modules/marketplace/application/guest-marketplace.service.ts`
- Modify: `services/auth-service/src/modules/marketplace/api/guest-marketplace.controller.ts`
- Modify: `services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/guest-marketplace.service.spec.ts`
- Test: `services/auth-service/src/modules/marketplace/tests/marketplace-admin.service.spec.ts`

**Steps:**

1. Write RED tests for `vi`, each supported locale, missing translation fallback, unsupported locale fallback.
2. Reuse the existing request locale resolver (`?lang`, `x-lang`, `Accept-Language`); do not create another locale convention.
3. Guest DTO keeps stable IDs/codes, adds localized `name`, and may temporarily retain `nameVi` during frontend transition only if contract compatibility requires it.
4. Admin list includes `translations[]` for sheet/manual inspection; it does not localize away source values.
5. Search/filter remains based on base and translation names only where the API already supports search; do not add speculative full-text search.
6. Run targeted tests.

**Expected fallback:** requested translation → `nameVi` → `importKey`/`code`.

---

### Task 6: Make the Super Admin UI sheet-first

**Objective:** Promote batch management without deleting the manual escape hatch.

**Files:**
- Modify: `frontends/front-end-vietsage/src/features/marketplace-admin/types.ts`
- Modify: `frontends/front-end-vietsage/src/features/marketplace-admin/repository.ts`
- Modify: `frontends/front-end-vietsage/src/features/marketplace-admin/resource.ts`
- Modify: `frontends/front-end-vietsage/src/features/marketplace-admin/marketplace-admin-client.tsx`
- Modify: `frontends/front-end-vietsage/src/app/api/admin/marketplace/route.ts` or create narrow child route handlers under `src/app/api/admin/marketplace/categories/import/`
- Test: smallest existing frontend test location for Marketplace Admin import state/response parsing

**UI:**

```text
[Google Sheets URL________________] [Xem trước]
[Tải file mẫu CSV]

Preview:
Tạo N | Cập nhật N | Không đổi N | Lỗi N
[validation rows + diff table]
[Áp dụng thay đổi]  (disabled while errors > 0)

Secondary: [Thêm thủ công]
```

**Steps:**

1. Add RED tests for response parsing, disabled commit on errors, and exact hash forwarding.
2. Extend the existing repository/resource; add named `previewImport` and `commitImport` mutations. No raw fetch in component.
3. Preserve inline errors with `role="alert"`; show sheet/row/column/value/correction.
4. Reuse `DataTable`; paginate preview if needed. Keep category list pagination unchanged.
5. Use `SwalVietSage` only for the consequential commit confirmation and success. Errors remain inline.
6. Keep manual create/edit under a secondary action; imported rows remain editable but sheet will overwrite managed fields on next import.
7. Invalidate `data` after successful commit.
8. Run TypeScript, scoped ESLint, targeted test, production build.

**Expected:** the common path is sheet preview/commit; manual CRUD remains available but visually secondary.

---

### Task 7: Contract, migration, docs, local verification

**Files:**
- Modify: `shared/api-contract/docs/CONTRACT_CHANGES.md`
- Modify: `services/docs/PLANS.md`
- Modify: `frontends/front-end-vietsage/docs/PLANS.md`
- Refresh: OpenAPI, Graphify, scoped Repomix

**Steps:**

1. Apply migration to local Docker only after explicit implementation approval.
2. Create a local test sheet with:
   - 25 categories;
   - all five translation columns;
   - one duplicate key and one invalid status for preview proof.
3. Verify preview is read-only with DB counts before/after.
4. Fix sheet; preview again; commit.
5. Verify:
   - created/updated/unchanged counts;
   - locale responses for `vi`, `en`, `zh`, `ko`, `ru`, `hi`;
   - missing locale falls back to Vietnamese;
   - existing Marketplace services retain category FKs;
   - rerun is idempotent (`unchanged`).
6. Run:

```bash
# backend
npm test -- --runInBand src/modules/marketplace/tests/marketplace-category-import.adapter.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/marketplace-category-sheet.service.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/guest-marketplace.service.spec.ts
npm run build
npx prisma validate
npm run openapi:export

# contract
npm run verify

# frontend
npx tsc --noEmit
npx eslint <changed-files>
npm run build

git diff --check
graphify update . --force
npx repomix@latest . --include "<changed-marketplace-files>" --compress --style xml --output graphify-out/repomix/marketplace-category-sheet-i18n-final.xml
```

7. Do not deploy, run production migration, commit, or push unless separately requested.

---

## Likely changed files

```text
services/auth-service/prisma/schema.prisma
services/auth-service/prisma/migrations/<timestamp>_marketplace_category_import_i18n/migration.sql
services/auth-service/src/modules/marketplace/infrastructure/imports/marketplace-category-import.adapter.ts
services/auth-service/src/modules/marketplace/application/marketplace-category-sheet.service.ts
services/auth-service/src/modules/marketplace/domain/marketplace-category-import.schema.ts
services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts
services/auth-service/src/modules/marketplace/api/guest-marketplace.controller.ts
services/auth-service/src/modules/marketplace/application/guest-marketplace.service.ts
services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts
services/auth-service/src/modules/marketplace/marketplace.module.ts
services/auth-service/src/modules/marketplace/tests/*category-import*.spec.ts
frontends/front-end-vietsage/src/features/marketplace-admin/{types,repository,resource,marketplace-admin-client}.ts*
frontends/front-end-vietsage/src/app/api/admin/marketplace/**
shared/api-contract/docs/CONTRACT_CHANGES.md
services/docs/PLANS.md
frontends/front-end-vietsage/docs/PLANS.md
```

## Risks and controls

- **Sheet changed after preview:** SHA-256 mismatch blocks commit.
- **Translation loss:** blank cells preserve existing values; no delete semantics.
- **Wrong-row overwrite:** stable `category_key`, never translated-name matching.
- **Mass disable/data loss:** phase 1 is upsert only.
- **Existing `nameEn` loss:** migration backfills `en` rows before dropping column.
- **Client tampering:** server re-reads and rebuilds preview during commit.
- **Large sheets:** 2,000-row ceiling; raise only after measured need.
- **Concurrent imports:** DB unique `importKey` and transaction protect integrity; add advisory/import lock only if concurrent use is observed.

## Explicitly skipped

- Real `.xlsx` upload/parser: Google Sheets + Excel-compatible CSV covers the requested bulk workflow without a dependency.
- Persistent import history/resume/rollback UI: audit log and DB backup/migration cover phase 1.
- Replace/mirror mode: add only when spreadsheet is formally declared authoritative.
- Machine translation: translations are supplied explicitly; add provider integration only after quality/ownership rules exist.
- Translation descriptions: Marketplace categories currently have no description field; do not invent one.
