# Agent E — Editable LocalMate platform fee

**Goal:** Add `localMatePlatformFeeRate` to the existing Marketplace pricing admin API/UI, distinct from delivery fee, with `0..100` validation and immutable-order explanation.

**Workspace:** Your assigned Orca worktree only.

**Read first:** `PONYTAIL.md`, `.agents/AGENTS.md`, backend/frontend rules and contracts, then master plan sections “Admin pricing config” and “Agent E”.

**Allowed writes:**
- `services/auth-service/src/modules/marketplace/domain/marketplace-admin.schema.ts`
- `services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts`
- `services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-admin.service.spec.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/types.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/repository.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/resource.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/client.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/marketplace-admin-client.tsx`
- one focused admin pricing contract test

**Do not write:** Prisma/migrations, LocalMate payment/order/Telegram internals, packages, secrets, n8n, generated contracts.

**Required behavior:**
- Existing `GET/PATCH /admin/marketplace/pricing-config` includes `localMatePlatformFeeRate`.
- Server validates both fee fields independently in inclusive range `0..100`; no truthy fallback that overwrites valid zero.
- Existing `platform.marketplace.view/manage` authorization remains unchanged.
- UI labels LocalMate fee as VietSage revenue collected before guide handoff; explains edits affect new orders only.
- Preserve current `deliveryServiceFeeRate` and all unrelated Marketplace admin behavior.
- Use current UI primitives, validation, `SwalVietSage`, and locale conventions; no new abstraction.

**Acceptance:** Focused tests cover GET/default, PATCH zero, PATCH 15, reject below 0/above 100, preservation of delivery fee, and frontend mapping with zero retained.

**Focused checks:**
```bash
cd services/auth-service && node node_modules/jest/bin/jest.js --runInBand src/modules/marketplace/tests/marketplace-admin.service.spec.ts
cd ../../frontends/front-end-vietsage && node --test src/features/marketplace-admin/localmate-platform-fee.test.mjs
```

**Forbidden:** install, migration application, provider write, commit/push/deploy. Stop only for a concrete blocker; otherwise finish.
