# Tenant-Owned Service Category and Service Item Spreadsheet Implementation Plan

> **For Hermes:** Implement only after explicit approval. Use TDD in bounded vertical slices. Preserve unrelated work. No DB reset, push, deploy, or package changes.

**Goal:** Make each External Service Tenant belong to exactly one Platform Admin-owned Marketplace Category; make every tenant Service Item inherit that category; add safe tenant-scoped spreadsheet import/export containing tenant-editable item fields only; preserve Hotel service behavior unchanged.

**Architecture:** Keep the current NestJS/Prisma/Next.js modular monolith and the existing `marketplace` module, Import framework, BFF, query-resource, RBAC, and design system. Move the category foreign key from `MarketplaceService` to `ServiceTenantProfile`, then remove category input from every Service Portal boundary. Add one Marketplace Service Item import adapter using the existing preview/diff/commit transaction pipeline. Use UTF-8 CSV as the initial Excel-compatible format because the repository has no XLSX parser/writer and package changes are not approved; add native `.xlsx` only if explicitly required.

**Tech Stack:** PostgreSQL, Prisma 7, NestJS 11, Zod 4, existing Import framework, Next.js 16 App Router/BFF, TanStack Query through `@dangminhdev04032005/query-resource`, existing UI primitives.

**Baseline:** `HEAD 0833fbcc6fe173d13bdd80ad4594f61103b727d7`; clean worktree before this plan. Graphify artifact was built at `5631a99b88e8e6d096f9625e0f14cd0f3843a4c7`, so it was used only to bound the working set; current source and Git history were used as truth. Scoped Repomix pack: `graphify-out/repomix/tenant-service-category-excel-plan.xml` (28 files, 26,569 tokens, security scan clean).

---

## 1. Current vs Target Architecture

### Current

| Concern | Current implementation | Conflict |
|---|---|---|
| Global categories | `MarketplaceCategory`, managed by Platform Admin | Correct ownership already exists. |
| Tenant category | `ServiceTenantProfile` has no category | A tenant has zero direct categories. |
| Item category | `MarketplaceService.categoryId` is required | Tenant can choose/change category per item; redundant under target model. |
| Tenant creation | `serviceTenantBodySchema` and Admin UI do not require category | Admin cannot assign the required category. |
| Tenant update | Update contract handles display/status/owner only | Admin cannot correct category. |
| Service APIs | `POST/PATCH /service-portal/services` accept `categoryId`; `GET /service-portal/categories` exposes all active categories | Violates tenant ownership restriction. |
| Service UI | Item form contains category dropdown and filtering by item category | Tenant can select category. |
| Hotel catalog | Separate `HotelServiceCategory` and `HotelServiceItem.categoryId`; import has categories + items tabs | Correct multi-category Hotel behavior; must remain untouched. |
| Import framework | Generic schema, row/column issues, preview/diff/commit, one Prisma transaction | Reusable. No Tenant Service Item adapter yet. |
| Spreadsheet transport | Category sync reads Google Sheets; templates are UTF-8 CSV; no XLSX library exists | True `.xlsx` cannot be parsed/written without approved dependency or custom ZIP/XML code, which is not justified. |
| Bulk persistence | Hotel adapter loops `upsert`/translations inside one transaction | Safe but query-heavy; new flat item import can use bounded batches without copying category/translation complexity. |

### Target

```text
MarketplaceCategory (Platform Admin-owned)
  1 ──< ServiceTenantProfile.categoryId (required)
            1 ──1 Tenant(type=SERVICE)
                    1 ──< MarketplaceService

MarketplaceService.category = serviceTenant.serviceProfile.category
MarketplaceService has no categoryId column or category mutation input.
```

Rules:

1. Platform Admin alone creates/updates global `MarketplaceCategory`.
2. Platform Admin assigns one active category while creating a Service Tenant and may reassign it while managing that Tenant.
3. Service users cannot list taxonomy for selection, create categories, or submit category fields.
4. Service Items contain only item-owned fields. API responses may expose a derived tenant category for display; persistence remains single-source on `ServiceTenantProfile.categoryId`.
5. `HotelServiceCategory`, `HotelServiceItem`, Hotel APIs/UI/imports remain unchanged.
6. Guest discovery filters/groups by the tenant profile category after contract migration.

### Deliberate simplifications

- Reuse the existing `marketplace` module and Import framework. No new service, repository interface, queue, job system, staging table, or generic bulk framework.
- Initial spreadsheet format is one UTF-8 CSV file, Excel-compatible. No dependency/package edit. Add `.xlsx` only after explicit requirement and dependency approval.
- Import limit: 2,000 rows, matching existing Marketplace category import. Increase only after measured need.
- Import is all-or-nothing. No partial success mode.

---

## 2. Identified Conflicts and Root Causes

1. **Wrong ownership boundary:** category is persisted on `MarketplaceService`, not the Service Tenant profile.
2. **Trust-boundary leak:** backend accepts `categoryId` from Service Portal create/update; removing only the UI would remain insecure.
3. **Admin contract gap:** tenant create/update has no category field, so the required invariant cannot be established.
4. **Existing-data ambiguity:** existing Service Tenants may have zero items, one item category, or several item categories. Automatic selection for zero/multi-category tenants would invent business data.
5. **Read-path coupling:** service listing, guest discovery, order validation, category grouping/filtering, OpenAPI, and frontend types currently read item category.
6. **UI mismatch:** Service Item form exposes a category dropdown; edit is currently informational rather than a full mutation flow.
7. **Import asymmetry:** Hotel import owns categories and items together; copying it would accidentally let Service Tenants manage categories.
8. **Bulk consistency risk:** preview state can become stale before commit. Current generic `ImportService.commit()` trusts the captured preview rather than re-reading state.
9. **N+1 risk:** row-by-row `find` and `upsert` would scale poorly. The new flat item adapter should load state once and write deterministic chunks.
10. **Spreadsheet tooling gap:** no installed XLSX dependency. Building OOXML manually is more code and risk than the requirement justifies.

---

## 3. DB / Schema Plan

### 3.1 Target Prisma model

Modify `services/auth-service/prisma/schema.prisma`:

```prisma
model ServiceTenantProfile {
  tenantId   String @id
  categoryId String
  // existing fields unchanged

  tenant   Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category MarketplaceCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([categoryId, status])
}

model MarketplaceCategory {
  // existing fields unchanged
  serviceTenants ServiceTenantProfile[]
}

model MarketplaceService {
  id              String @id @default(cuid())
  serviceTenantId String
  importKey       String? @db.VarChar(120)
  // remove categoryId and category relation
  // existing item-owned fields unchanged

  @@unique([serviceTenantId, importKey])
  @@index([serviceTenantId, status, updatedAt])
}
```

Notes:

- `importKey` is nullable so manually-created existing items remain valid.
- Uniqueness is tenant-scoped, not global.
- Keep `MarketplaceCategory` deletion restricted by `ServiceTenantProfile.categoryId`. Admin must deactivate an in-use category, not delete it and cascade tenants/items.
- Replace the existing `MarketplaceService_serviceTenantId_status_idx` with `(serviceTenantId, status, updatedAt)` only if `EXPLAIN` or Prisma migration SQL confirms no duplicate redundant index is left.
- Existing money/nonnegative DB checks remain.

### 3.2 Non-destructive expand/resolve/contract migrations

Use three reviewable migrations. Never reset or `db push`.

#### Migration A — expand

Create `prisma/migrations/<timestamp>_add_service_tenant_category/`:

1. Add nullable `ServiceTenantProfile.categoryId`.
2. Add FK to `MarketplaceCategory(id)` with `ON DELETE RESTRICT`.
3. Add category/status index.
4. Add nullable `MarketplaceService.importKey` and unique `(serviceTenantId, importKey)`.
5. Backfill `ServiceTenantProfile.categoryId` only where all existing items for that tenant use exactly one distinct category.
6. Do not choose a category for tenants with zero or multiple distinct item categories.
7. Add an audit query/test returning unresolved tenants with counts and category IDs.

#### Resolution release

Before enforcing `NOT NULL`:

1. Platform Admin create/update requires `categoryId` for newly managed records.
2. Add an Admin-only unresolved-tenant view/filter.
3. For each unresolved existing tenant, Admin explicitly selects one category.
4. Reassignment immediately defines the category for all items semantically; old item `categoryId` remains compatibility-only until contract migration.
5. Report unresolved count. Contract migration gate requires `0`.

#### Migration B — contract

Create `prisma/migrations/<timestamp>_move_marketplace_category_to_tenant/` only after resolution:

1. Fail migration with a clear precondition block if any `ServiceTenantProfile.categoryId IS NULL`.
2. Set `ServiceTenantProfile.categoryId NOT NULL`.
3. Drop `MarketplaceService_categoryId_status_idx`.
4. Drop `MarketplaceService_categoryId_fkey`.
5. Drop `MarketplaceService.categoryId`.
6. Add/confirm tenant/status/updatedAt and import-key indexes.
7. Do not touch Hotel category/item tables.

### 3.3 Data compatibility policy

- Existing items are never deleted, reset, or duplicated.
- Existing Service Tenant category conflicts require Admin resolution; no first-row, lowest-ID, or most-common auto-selection.
- Orders retain service snapshots and `serviceId`; no order rewrite.
- Category reassignment affects current discovery/grouping, not historical order snapshots.
- In-use categories become non-deletable. Replace current category deletion behavior that deletes child Marketplace Services; this behavior conflicts with non-destructive ownership and must be removed.

---

## 4. Backend APIs and RBAC

### 4.1 Platform Admin contracts

Keep existing controller/service paths and permissions:

```text
GET    /admin/marketplace/categories                          platform.marketplace.view
POST   /admin/marketplace/categories                          platform.marketplace.manage
PATCH  /admin/marketplace/categories/:categoryId              platform.marketplace.manage
POST   /admin/marketplace/service-tenants                     platform.marketplace.manage
PATCH  /admin/marketplace/service-tenants/:tenantId           platform.marketplace.manage
```

Contract changes:

- `POST /service-tenants`: require `categoryId`.
- `PATCH /service-tenants/:tenantId`: permit `categoryId`.
- Validate category exists and is active when assigning.
- Return `serviceProfile.category` in tenant list/detail.
- Category delete: reject with localized `409` when referenced by a Service Tenant; recommend deactivate/reassign. Never delete tenant services to satisfy FK.
- Tenant category reassignment: one profile update plus audit entry in one transaction. No item updates after `MarketplaceService.categoryId` removal.
- Keep `platform.marketplace.manage`; no new permission keys.

Files:

- `services/auth-service/src/modules/marketplace/domain/marketplace-admin.schema.ts`
- `services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts`
- `services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-admin.service.spec.ts`

### 4.2 Service Portal contracts

Keep existing permissions:

```text
GET    /service-portal/profile                               service.marketplace.view
GET    /service-portal/services                              service.marketplace.view
POST   /service-portal/services                              service.marketplace.manage
PATCH  /service-portal/services/:serviceId                   service.marketplace.manage
PATCH  /service-portal/services/:serviceId/availability      service.marketplace.manage
```

Changes:

- Remove `GET /service-portal/categories`; tenant cannot select taxonomy.
- Remove `categoryId` from `marketplaceServiceBodySchema` and update schema.
- Zod object schemas must reject unknown category fields (`.strict()`), not silently strip them.
- `createService()` derives tenant from authenticated membership and writes no category.
- `updateService()` ignores no category input because validation rejects it.
- List response includes `tenantCategory` once per response or `category` derived through `serviceTenant.serviceProfile.category`; choose one stable OpenAPI shape. Preferred response envelope:

```ts
{
  profile: ServiceProfile & { category: MarketplaceCategorySummary };
  services: ServiceItem[]; // no categoryId
}
```

- Fix tenant resolution while in scope: require exactly one active SERVICE membership. Current fallback can return an inactive membership and current code does not reject multiple active memberships despite its error text. Add explicit `memberships.length !== 1` denial.
- All item lookups remain scoped by `{ id, serviceTenantId }`.

Files:

- `services/auth-service/src/modules/marketplace/domain/service-portal.schema.ts`
- `services/auth-service/src/modules/marketplace/application/service-portal.service.ts`
- `services/auth-service/src/modules/marketplace/api/service-portal.controller.ts`
- `services/auth-service/src/modules/marketplace/tests/service-portal.service.spec.ts`

### 4.3 Guest/read-path changes

Update Marketplace guest queries so category filtering joins through:

```text
MarketplaceService.serviceTenant.serviceProfile.categoryId
```

Requirements:

- Active item + active tenant profile + active tenant category + active hotel link remain required.
- Category filter compares the tenant profile category.
- Category lists contain only active categories represented by visible linked tenants/items.
- Select required fields in one query/include; no per-item category lookup.
- Stable pagination and ordering remain.

Likely files:

- `services/auth-service/src/modules/marketplace/application/guest-marketplace.service.ts`
- `services/auth-service/src/modules/marketplace/tests/guest-marketplace.service.spec.ts`
- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts` if active-category validation reads `MarketplaceService.category`.

### 4.4 OpenAPI and error contracts

- Use `parseWithZod` at every changed controller boundary.
- Add stable Vietnamese domain errors:
  - inactive/missing category assignment;
  - category in use;
  - stale import preview;
  - duplicate import key;
  - invalid row/column value.
- Do not leak Prisma errors.
- Export OpenAPI and sync frontend generated types.
- Update `shared/api-contract/docs/CONTRACT_CHANGES.md`.

---

## 5. Spreadsheet Template, Import, and Export

### 5.1 Format decision

Initial format: UTF-8 BOM CSV, one flat table, Excel-compatible.

Reason: existing template infrastructure already emits CSV; no XLSX library is installed; package changes are forbidden without approval. CSV meets editing/import/export needs without custom OOXML code.

If product requires real `.xlsx` features such as dropdown validation, multiple sheets, styles, or >2,000-row streaming, stop before implementation and request approval for one established XLSX dependency. Do not hand-build ZIP/XML.

### 5.2 Tenant-editable columns only

Template/export columns:

| Key | Vietnamese header | Required | Type/rule |
|---|---|---:|---|
| `item_key` | Mã dịch vụ | Yes | 2–120 chars, lowercase `[a-z0-9_-]`; stable tenant-scoped upsert key |
| `name` | Tên dịch vụ | Yes | trimmed, 1–160 chars |
| `description` | Mô tả | No | max 1,000 chars |
| `unit_price` | Giá | Yes | decimal, `>= 0`, max DB `DECIMAL(12,2)` |
| `preparation_minutes` | Thời gian chuẩn bị (phút) | Yes | integer `>= 0` |
| `capacity` | Sức chứa | No | blank = unlimited; otherwise integer `>= 0` |
| `fulfillment_method` | Hình thức phục vụ | Yes | `DELIVERY_TO_HOTEL` or `CUSTOMER_AT_SERVICE` |
| `status` | Trạng thái | Yes | `DRAFT`, `ACTIVE`, or `DISABLED` |

Excluded intentionally:

- `categoryId`, category key/name/code;
- `serviceTenantId`;
- `currency` (server fixes `VND`);
- DB `id`, version, timestamps;
- order/capacity reservation internals;
- image URLs until the existing item UI/API has an approved upload/URL workflow.

The downloaded template may display the inherited category above the table only as non-imported metadata if needed. Preferred simplest version: filename contains tenant code; no category cell exists anywhere.

### 5.3 Endpoints

```text
GET  /service-portal/services/export
GET  /service-portal/services/import/template
POST /service-portal/services/import/preview
POST /service-portal/services/import/commit
```

Permissions:

- export/template: `service.marketplace.view`;
- preview/commit: `service.marketplace.manage`.

Transport:

- Template/export return `text/csv; charset=utf-8` plus BOM and safe filenames.
- Preview accepts a bounded CSV upload (`multipart/form-data`) or raw CSV body through a dedicated parser boundary. Preferred: multipart upload for browser UX.
- Commit accepts `previewToken`/hash, not the full trusted preview object from the browser.

### 5.4 Import adapter

Create:

- `services/auth-service/src/modules/marketplace/infrastructure/imports/marketplace-service-item-import.adapter.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-service-item-import.adapter.spec.ts`

Reuse:

- `ImportWorkbookSchema`;
- `ImportValidationIssue` row/column shape;
- `ImportService.preview()` / transaction commit;
- `ImportTemplateService`;
- `ImportErrorReportService` if downloadable error CSV is exposed;
- `ImportRegistry` registration in `MarketplaceModule`.

Do not copy the Hotel two-sheet category/item adapter. New adapter owns one `items` sheet/table and resolves `serviceTenantId` plus category entirely from authenticated context.

### 5.5 Matching and bulk behavior

- `item_key` is the only import identity. Never match by mutable display name.
- Upsert mode only for this first release. Do not inherit Hotel replace-mode hard deletion because the business request asks safe create/update, not deletion-by-omission.
- Load current tenant items in one bounded query with selected fields.
- Build maps/Sets in memory for duplicate and diff checks.
- Before commit, re-read current rows or compare a server-side state hash/version to reject stale preview.
- Commit all valid rows in one Prisma transaction.
- Process rows in chunks of 100–250 to cap parameter/query size.
- Use `createMany` for creates where returned IDs are unnecessary.
- Use tenant-scoped `updateMany` per changed row because Prisma bulk update cannot apply different values per row safely; bounded 2,000-row limit and chunk loop are acceptable. Never perform preliminary per-row reads.
- Alternative only if profiling proves update count too slow: one parameterized `UPDATE ... FROM (VALUES ...)` through Prisma safe SQL helpers. Do not start there.
- Skip unchanged rows.
- On any write failure, transaction rolls back all rows. Return one import failure; no partial counts claimed.

### 5.6 Export behavior

- One tenant-scoped query selecting only export fields.
- Stable order by `updatedAt DESC, id ASC` or `name ASC, id ASC`; choose and test one.
- Stream rows to response only when result size approaches the 2,000-row cap. For current cap, a bounded in-memory CSV string is simpler and safe.
- Formula injection protection: prefix cells beginning with `=`, `+`, `-`, or `@` with `'` during export/template/error reports.
- Correct CSV quoting for commas, quotes, CR/LF, and UTF-8 Vietnamese text.

---

## 6. Validation and Error Handling

### 6.1 File-level

- Maximum 2,000 non-empty data rows.
- Explicit file size limit, proposed 5 MB.
- UTF-8 CSV only; reject binary/XLSX signature with guidance.
- Exactly one header row.
- Reject duplicate normalized headers.
- Reject unknown category-related headers (`category`, `category_id`, `category_key`, `danh mục`) with a specific error, not silent ignore.
- Allow normalized lowercase aliases only where explicitly defined.

### 6.2 Row/column

Every issue uses existing shape:

```ts
{
  severity: "error" | "warning";
  sheet: "items";
  row: number;
  column: string;
  code: string;
  message: string;
  value?: unknown;
}
```

Validate:

- required values after trim;
- exact number/integer parsing; reject `NaN`, infinity, locale-formatted ambiguous numbers;
- decimal precision/range for price;
- enum membership, case normalization only if documented;
- capacity blank vs zero semantics;
- string maximum lengths;
- duplicate `item_key` case-insensitively in file;
- duplicate against DB via tenant-scoped import-key map;
- immutable context fields absent;
- active tenant category exists before preview and again before commit.

### 6.3 Preview and commit

Preview response:

```ts
{
  previewToken: string;
  summary: { create; update; unchanged; errors; warnings; totalEntities };
  validation: ImportValidationIssue[];
  diff: ImportDiffEntry[];
}
```

- Disable commit when errors > 0.
- Keep row/column messages inline/table-based; no raw error popup.
- Commit recomputes/validates server-side from an integrity-bound preview token or persisted short-lived preview. Simplest stateless token: HMAC of tenant ID, actor ID, file hash, DB state hash, mode, expiry. Use existing server secret/config only if available; otherwise re-upload file on commit and compare hashes. Do not add a new secret casually.
- Preferred no-new-infrastructure flow: commit re-uploads the same file plus expected file/state hashes; backend reparses, reloads, and diffs. This avoids storing uploads or adding cache tables.
- If file or DB state changed, return `409` and require preview again.

---

## 7. Frontend Flow

### 7.1 Platform Admin

Preserve current Marketplace Admin visual system and tabs.

Tenant create/edit modal changes:

- Add required category `<select>` populated from existing Platform Admin category query.
- Show category name/status in tenant table/detail.
- Disable inactive categories for new assignment; show current inactive assignment read-only until Admin chooses an active replacement.
- Tenant create cannot submit without category.
- Tenant edit can reassign category after a clear confirmation explaining all tenant items inherit the new category.
- Category delete UI handles backend `409`; offer deactivate/reassign, never imply service deletion.

Files:

- `frontends/front-end-vietsage/src/features/marketplace-admin/types.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/client.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/repository.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/resource.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/marketplace-admin-client.tsx`
- existing Admin BFF routes under `src/app/api/admin/marketplace/**`

### 7.2 Service Portal catalog

Preserve existing catalog cards/forms/theme.

Changes:

- Remove category selector from create/edit forms.
- Show inherited category as a read-only badge/header from profile data.
- Remove category filter when every item necessarily shares one category.
- Complete real item update/activate/deactivate mutations through the existing resource chain; current informational edit action does not satisfy target management behavior.
- Add Import, Export, Download Template actions near catalog controls.
- Import modal flow: choose CSV → preview metrics → row/column error table → commit → invalidate catalog query.
- Use inline Vietnamese validation errors. Use `SwalVietSage` only for commit/reassignment confirmations and success feedback per project standard.
- Keep touch targets, labels, focus management, loading/empty/error states accessible.

Data chain:

```text
Component -> useServicePortal -> servicePortalResource -> repository -> BFF -> backend
```

Fix repository transport while touched: retain same-origin BFF fetch only in repository, map backend error details, and add typed operations. Do not put fetch in UI/hooks.

Files:

- `frontends/front-end-vietsage/src/features/service-portal/types.ts`
- `frontends/front-end-vietsage/src/features/service-portal/service-client.ts`
- `frontends/front-end-vietsage/src/features/service-portal/repository.ts`
- `frontends/front-end-vietsage/src/features/service-portal/resource.ts`
- `frontends/front-end-vietsage/src/features/service-portal/use-service-portal.ts`
- `frontends/front-end-vietsage/src/features/service-portal/components/service-catalog-view.tsx`
- BFF routes under `frontends/front-end-vietsage/src/app/api/service-portal/**`

No new frontend dependency. No visual redesign.

---

## 8. Migration and Backward Compatibility

### Release sequence

1. **Expand release:** nullable tenant category + import key; backend dual-read compatibility.
2. **Admin resolution release:** all new tenants require category; Admin resolves old tenants.
3. **Read-path cutover:** guest/service APIs derive category from tenant profile; item API rejects category input.
4. **Contract migration:** require tenant category; remove item category FK/column.
5. **Cleanup:** remove obsolete Service Portal categories endpoint/UI/types/tests.

### Dual-read window

During expansion only:

```text
effectiveCategoryId = ServiceTenantProfile.categoryId ?? MarketplaceService.categoryId
```

Rules:

- New/updated tenants must have profile category.
- New item writes during transition may copy profile category to legacy item column solely to keep old readers working; this compatibility write is removed with Migration B.
- Do not expose category mutation to Service users.
- Keep the window short and tested.

### Rollback

- Before Migration B: rollback application to old read path; additive columns remain harmless.
- After Migration B: application rollback must use a compatible build that no longer expects item `categoryId`; do not reconstruct/drop data during operational rollback.
- Database rollback strategy is restore-forward, not destructive down migration. Keep backup before production migration.
- CSV import rollback is automatic transaction rollback. Committed business changes require a new corrective import or item edits; no hidden undo log is introduced.
- Hotel behavior and schema are not part of rollback because they are not changed.

---

## 9. Tests

### 9.1 Schema/migration tests

Add migration SQL tests under Marketplace tests:

- expand migration contains no reset/truncate/drop of Hotel tables;
- single-category tenants backfill correctly;
- zero/multi-category tenants remain unresolved;
- contract migration refuses unresolved profiles;
- contract migration drops only Marketplace item category artifacts;
- tenant category FK uses restrict;
- import key uniqueness is tenant-scoped;
- Hotel category/item schema remains byte/behavior compatible.

### 9.2 Backend unit/integration tests

Admin:

- create tenant requires active category;
- inactive/missing category rejected;
- category persisted atomically with tenant/profile/owner/RBAC/audit;
- reassignment updates profile and audit only;
- category in use cannot be deleted and services are not deleted;
- view permission cannot mutate.

Service Portal:

- exactly one active SERVICE membership required;
- item create/update schemas reject `categoryId`;
- create derives tenant and inherited category context;
- cross-tenant IDs return 404;
- update, activation/deactivation, price, preparation time, capacity, and method work;
- inactive/missing tenant category blocks publishing/import.

Guest/order:

- category filter uses profile category;
- all items from one tenant appear under the same category;
- reassignment moves discovery grouping without rewriting items/orders;
- active category/profile/item/link gates remain.

Import/export:

- template headers contain only allowed fields;
- exported CSV quotes safely and blocks formula injection;
- required/type/enum/range/price/duplicate errors include exact row+column;
- category columns rejected;
- create/update/unchanged diff correct;
- same item key in different tenants allowed;
- one preload query, no per-row reads;
- chunk boundaries preserve all rows;
- stale file/state hash returns 409;
- any write failure rolls back all creates/updates;
- 2,001 rows and oversized file rejected;
- zero price/capacity accepted according to semantics; blank capacity means unlimited.

### 9.3 Frontend tests

- Admin tenant create/edit requires category and sends it.
- Service item payload never contains category.
- inherited category is read-only.
- import preview renders create/update/unchanged/errors with safe key fallbacks.
- row/column errors render Vietnamese text.
- commit disabled on errors/pending state.
- export/template download routes preserve filenames/content type.
- resource invalidation refreshes catalog after CRUD/import.

### 9.4 Manual acceptance

1. Platform Admin creates two categories.
2. Admin creates Tenant A with Category 1; Tenant cannot see a category selector.
3. Tenant creates several items; all appear under Category 1 for Guest discovery.
4. Tenant exports, edits allowed fields in Excel, previews, commits, and sees updates.
5. Add category column to CSV; preview rejects exact row/column/header.
6. Duplicate an item key; preview identifies both rows.
7. Change DB item after preview; commit returns 409 and writes nothing.
8. Force a mid-batch DB failure; verify no rows changed.
9. Admin reassigns Tenant A to Category 2; all current items move in discovery without item rewrites.
10. Attempt to delete Category 2; API returns 409; no services disappear.
11. Hotel creates/imports multiple Hotel categories/items exactly as before.

---

## 10. Implementation Order

### Slice 0 — Baseline and data audit

1. Record HEAD and scoped status.
2. Run `npm run prisma:status`; stop on drift/connectivity failure.
3. Add a read-only SQL/test query classifying each Service Tenant as zero/one/multi item categories.
4. Capture unresolved counts; do not alter data.
5. Commit audit/test only after approval.

### Slice 1 — Expand schema

1. RED migration tests for nullable profile category and tenant-scoped import key.
2. Add Prisma relations/indexes.
3. Generate create-only migration; hand-review SQL.
4. Backfill only unambiguous tenants.
5. Run Prisma generate/status and migration tests.
6. Scoped commit.

### Slice 2 — Admin category assignment

1. RED service/schema tests.
2. Require category on create; allow category on update.
3. Change category deletion to conflict-if-in-use.
4. Return category in Admin contract.
5. Update BFF/resource/UI with required `<select>` and inherited-data messaging.
6. Export OpenAPI/sync types; targeted builds/tests.
7. Scoped commit.

### Slice 3 — Resolve legacy tenants

1. Add unresolved filter/report in Admin flow only if audit finds unresolved rows.
2. Admin assigns categories explicitly.
3. Verify unresolved count is zero locally/UAT before contract migration.
4. No production data update without separate migration/deployment approval.

### Slice 4 — Service Portal contract cutover

1. RED tests that category fields are rejected.
2. Remove category endpoint/input and derive category from profile.
3. Fix exact-one-active-membership invariant.
4. Add complete typed item update/status mutations.
5. Remove category selector/filter; show inherited badge.
6. Update guest/order read paths and tests.
7. Export OpenAPI/sync types; builds/tests.
8. Scoped commit.

### Slice 5 — Spreadsheet backend

1. RED adapter tests for schema, validation, duplicate matching, diff, stale preview, rollback.
2. Add flat tenant item adapter and registration.
3. Add safe CSV parser/serializer using existing code/stdlib; no dependency.
4. Add template/export/preview/commit endpoints.
5. Implement bounded preload, maps, chunked writes, one transaction.
6. Add formula-injection and file-limit tests.
7. Scoped commit.

### Slice 6 — Spreadsheet frontend

1. Add typed repository/resource/BFF operations.
2. Add template/export buttons.
3. Add accessible preview/commit modal and row/column errors.
4. Invalidate catalog after commit.
5. Run focused frontend tests/typecheck/lint/build.
6. Scoped commit.

### Slice 7 — Contract migration and cleanup

1. Gate on zero unresolved profiles.
2. RED migration/read-path tests.
3. Set profile category NOT NULL; drop item category relation/column/index.
4. Remove dual-read/compatibility writes and dead types/routes.
5. Run full Marketplace + Hotel catalog regression.
6. Export/sync contracts and update docs.
7. Refresh Graphify and regenerate scoped Repomix packs after verified module completion.
8. Scoped commit. No push/deploy without separate approval.

---

## 11. Files Likely to Change

### Backend/schema

```text
services/auth-service/prisma/schema.prisma
services/auth-service/prisma/migrations/<timestamp>_add_service_tenant_category/migration.sql
services/auth-service/prisma/migrations/<timestamp>_move_marketplace_category_to_tenant/migration.sql
services/auth-service/src/modules/marketplace/domain/marketplace-admin.schema.ts
services/auth-service/src/modules/marketplace/domain/service-portal.schema.ts
services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts
services/auth-service/src/modules/marketplace/api/service-portal.controller.ts
services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts
services/auth-service/src/modules/marketplace/application/service-portal.service.ts
services/auth-service/src/modules/marketplace/application/guest-marketplace.service.ts
services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts        # only if current category gate requires it
services/auth-service/src/modules/marketplace/infrastructure/imports/marketplace-service-item-import.adapter.ts
services/auth-service/src/modules/marketplace/marketplace.module.ts
services/auth-service/src/modules/marketplace/tests/marketplace-admin.service.spec.ts
services/auth-service/src/modules/marketplace/tests/service-portal.service.spec.ts
services/auth-service/src/modules/marketplace/tests/guest-marketplace.service.spec.ts
services/auth-service/src/modules/marketplace/tests/marketplace-service-item-import.adapter.spec.ts
services/auth-service/src/modules/marketplace/tests/<migration-test>.spec.ts
services/auth-service/src/common/import/*                    # only minimal CSV/state-hash fixes proven reusable
services/auth-service/src/common/openapi/contract-schemas.ts
shared/api-contract/openapi/v1/openapi.json
shared/api-contract/openapi/v1/openapi.yaml
shared/api-contract/docs/CONTRACT_CHANGES.md
```

### Frontend

```text
frontends/front-end-vietsage/src/features/marketplace-admin/types.ts
frontends/front-end-vietsage/src/features/marketplace-admin/client.ts
frontends/front-end-vietsage/src/features/marketplace-admin/repository.ts
frontends/front-end-vietsage/src/features/marketplace-admin/resource.ts
frontends/front-end-vietsage/src/features/marketplace-admin/marketplace-admin-client.tsx
frontends/front-end-vietsage/src/features/service-portal/types.ts
frontends/front-end-vietsage/src/features/service-portal/service-client.ts
frontends/front-end-vietsage/src/features/service-portal/repository.ts
frontends/front-end-vietsage/src/features/service-portal/resource.ts
frontends/front-end-vietsage/src/features/service-portal/use-service-portal.ts
frontends/front-end-vietsage/src/features/service-portal/components/service-catalog-view.tsx
frontends/front-end-vietsage/src/app/api/service-portal/**
frontends/front-end-vietsage/src/generated/openapi/v1.ts
```

### Documentation/progress

```text
docs/API_SPEC.md or shared/api-contract/docs/CONTRACT_CHANGES.md
services/docs/PLANS.md
frontends/front-end-vietsage/docs/PLANS.md
```

No Hotel service source should change unless a regression test needs an expectation update caused by shared import infrastructure. Any proposed Hotel behavior change is out of scope and must stop for review.

---

## 12. Verification Commands

From `services/auth-service`:

```bash
npm run prisma:generate
npm run prisma:status
npm test -- --runInBand src/modules/marketplace/tests/marketplace-admin.service.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/service-portal.service.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/guest-marketplace.service.spec.ts
npm test -- --runInBand src/modules/marketplace/tests/marketplace-service-item-import.adapter.spec.ts
npm test -- --runInBand src/modules/property/tests/infrastructure/imports/service-catalog-import.adapter.spec.ts
npm run build
npm run openapi:export
node scripts/check-service-boundaries.mjs
```

From `shared/api-contract`:

```bash
npm run verify
```

From `frontends/front-end-vietsage`:

```bash
npm run sync:api:types
npx tsc --noEmit
npx eslint "src/features/marketplace-admin" "src/features/service-portal" "src/app/api/service-portal"
npm run build
```

Migration/data checks:

```sql
-- Must return 0 before contract migration
SELECT COUNT(*)
FROM "ServiceTenantProfile"
WHERE "categoryId" IS NULL;

-- Must return 0 after contract migration
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_name = 'MarketplaceService' AND column_name = 'categoryId';
```

Final context sync after implementation only:

```bash
graphify update .
npx repomix@latest . --include "<marketplace changed files>" --compress --style xml --output graphify-out/repomix/marketplace-tenant-category.xml
npx repomix@latest . --include "<service-portal changed files>" --compress --style xml --output graphify-out/repomix/service-portal-category-import.xml
```

---

## 13. Risks, Trade-offs, and Assumptions

| Risk/assumption | Handling |
|---|---|
| Existing tenant has items in multiple categories | Never auto-pick. Admin resolves before NOT NULL/drop migration. |
| Existing tenant has no items | Admin assigns category explicitly. |
| Category reassignment changes current Guest grouping | Treat as intended current taxonomy behavior; historical orders unchanged. |
| Current category delete deletes Marketplace services | Replace with 409 conflict; non-destructive behavior is mandatory. |
| Preview becomes stale | Reparse/reload/re-diff at commit; 409 on file/state hash mismatch. |
| Row-by-row updates | One preload, no per-row reads, chunk bounded updates in one transaction. Escalate to set-based SQL only after measurement. |
| Large files | 5 MB / 2,000-row cap. In-memory CSV is acceptable at this ceiling. |
| `.xlsx` expected literally | Not included without dependency approval. CSV works in Excel. Confirm before implementation if native `.xlsx` is mandatory. |
| Formula injection on export | Escape dangerous leading characters and test. |
| Tenant membership ambiguity | Enforce exactly one active SERVICE membership while changing Service Portal boundary. |
| Hotel regression | Separate models/routes/adapters; run Hotel catalog import test and manual multi-category acceptance. |
| Production migration | Separate backup/deploy approval; no reset, `db push`, or destructive down migration. |

---

## 14. Approval Gates

Before implementation, confirm:

1. **Spreadsheet format:** UTF-8 CSV opened by Excel is acceptable for V1. Native `.xlsx` requires separate dependency approval.
2. **Legacy conflict resolution:** Platform Admin manually chooses the category for zero/multi-category existing tenants; no automatic default.
3. **Category deletion:** in-use categories return `409`; Admin deactivates or reassigns first. No service deletion cascade.
4. **Import mode:** upsert-only in V1; omission never deletes/deactivates an item.
5. **Category reassignment:** changes current category for all tenant items immediately; historical orders remain unchanged.

**Status:** `PLAN ONLY — AWAITING EXPLICIT IMPLEMENTATION APPROVAL`.
