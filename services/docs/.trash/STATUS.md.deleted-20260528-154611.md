# VietSage Backend Status

## Current Truth (Unified)

Date/time: 2026-05-27

- Active service: `services/auth-service`.
- Milestone 0: Done.
- Milestone 1: Done (Prisma 7 foundation + migration pipeline + CI gate).
- Milestone 2 (Auth Core): Done (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`).
- Track 3 (Authorization layer): Plan Mode (RBAC + tenant enforcement design in progress).
- Migration baseline/deploy issue from Session 3 is resolved based on user confirmation.

## Current Snapshot

Date/time: 2026-05-27

Current backend state:

- `services/auth-service` is active and no longer a default starter-only state.
- Milestone 0 foundation is implemented:
  - `GET /health`
  - global validation pipe
  - global exception filter with normalized error shape
  - request id middleware
  - request logging middleware
  - environment config via `NODE_ENV` and `PORT`
- Milestone 1 foundation is completed:
  - Prisma 7 schema for auth/RBAC core entities
  - migration scripts and CI gate (`prisma:check`)
  - seed scaffold for roles, permissions, and super admin bootstrap
  - Prisma runtime module/service integrated into NestJS app
- Auth/session endpoints (Milestone 2) are implemented with Passport local/jwt and validated by unit/e2e/build/lint.
- RBAC/business APIs (Milestone 3+) are not implemented yet and are now in Plan Mode.

Docs prepared:

- `services/docs/PLANS.md`
- `services/docs/RULES.md`
- `services/docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/API_SPEC.md`
- `docs/SERVICE_BOUNDARY.md`
- `docs/EVENT_FLOW.md`
- `docs/RULES.md`
- `docs/FRONTEND_SYNC_VALIDATION.md`

## Track 2 Release Checklist (Auth Core)

- API contracts stable and implemented:
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`
- Authentication stack in place: `passport-local` + `passport-jwt`.
- Token flow in place: access token issuance, refresh-token hashing/storage, revoke on logout.
- Route boundary enforced: global JWT guard + explicit public allowlist.
- Validation suite expected before release:
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run lint`
- Environment readiness checks:
  - verify `DATABASE_URL`
  - verify JWT envs (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, expirations)
  - ensure Prisma migration status is clean (`npm run prisma:check`)

## Latest Session

### Session 11 - Docs cleanup for Task 2 closure and Task 3 plan framing

Date/time: 2026-05-27
Milestone: Track 2 closure alignment + Track 3 planning clarity

Files changed:

- `services/docs/PLANS.md`
- `services/docs/STATUS.md`
- `services/docs/RULES.md`

Commands run:

- Docs-only updates (no runtime validation command).

Result:

- Clarified current state: Milestone 2 is done; Milestone 3+ remains pending.
- Refined Milestone 3 task list to reflect current baseline (`JwtAuthGuard` already global) and next implementation targets.
- Added Track 2 release checklist section for fast pre-release verification.
- Added milestone execution rule to prevent starting Milestone 4 before Milestone 3 authorization chain is complete.

Known risks:

- STATUS still contains long historical logs; future cleanup may archive old sessions to keep the file concise.

Next step:

- Start Track 3 implementation: scaffold `@Roles`, `@Permissions`, `@TenantId`, and RBAC/tenant guards with tests.

### Session 2 - Milestone 1 Prisma foundation setup

Date/time: 2026-05-27
Milestone: Milestone 1 (Auth & RBAC Database Foundation)

Files changed:

- `services/auth-service/.env.example`
- `services/auth-service/package.json`
- `services/auth-service/package-lock.json`
- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/prisma/seed.js`
- `services/auth-service/prisma/migrations/migration_lock.toml`
- `services/auth-service/prisma/migrations/0001_init/migration.sql`
- `services/auth-service/src/prisma/prisma.service.ts`
- `services/auth-service/src/prisma/prisma.module.ts`
- `services/auth-service/src/app.module.ts`
- `services/docs/STATUS.md`

Commands run:

- `npm install @prisma/client`
- `npm install -D prisma`
- `npm install @prisma/client@6.19.0 && npm install -D prisma@6.19.0`
- `npx prisma generate`
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/0001_init/migration.sql`
- `npm run prisma:generate`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

Result:

- Added Prisma/PostgreSQL foundation with Milestone 1 schema, enums, indexes, migration SQL, and seed script.
- Added Prisma runtime integration (`PrismaModule`, `PrismaService`) and wired it into `AppModule`.
- Added Prisma scripts in `package.json` and database URL template in `.env.example`.
- Validation passed for build, unit test, e2e test, lint, and Prisma client generation.

Known risks:

- Seed script is scaffolded but was not executed because it requires a reachable PostgreSQL instance.
- `prisma` currently pinned to 6.19.0 to avoid Prisma 7 datasource config breaking changes; future upgrade needs explicit migration to `prisma.config.ts`.
- `passwordHash` in seed uses temporary SHA-256 bootstrap hashing and must be replaced by bcrypt or argon2 in Milestone 2 auth flow.

Next step:

- Implement Milestone 2 auth endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`) using the new schema.

### Session 1 - Backend status sync and validation pass

Date/time: 2026-05-27
Milestone: Milestone 0 stabilization

Files changed:

- `services/auth-service/test/app.e2e-spec.ts`
- `services/docs/STATUS.md`

Commands run:

- `git status --short`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

Result:

- Removed duplicate imports in e2e test file.
- Verified backend foundation behavior with passing build, unit test, e2e test, and lint.
- Synchronized backend status document with actual repository state and current docs naming (`PLANS.md`, `RULES.md`).

Known risks:

- Milestone 1+ implementation is still pending (database, auth, and domain APIs).
- `npm run lint` uses `--fix`, so future runs may auto-edit additional files.

Next step:

- Start Milestone 1 from `services/docs/PLANS.md` (Prisma + PostgreSQL foundation).

## Session: Auth Service - Prisma 7 Upgrade (Completed)

### Goal

HoÃ n táº¥t nÃ¢ng cáº¥p `services/auth-service` lÃªn Prisma 7 vÃ  Ä‘áº£m báº£o toÃ n bá»™ pipeline backend cháº¡y á»•n Ä‘á»‹nh.

### Key Changes

- Chuáº©n hÃ³a Prisma 7 config qua `prisma.config.ts` (dÃ¹ng `env("DATABASE_URL")`).
- Cáº­p nháº­t seed flow sang Prisma 7:
  - `package.json`: `db:seed` -> `prisma db seed`
  - `prisma.config.ts`: thÃªm `migrations.seed = "node prisma/seed.js"`
- Cáº­p nháº­t schema Prisma Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch Prisma 7 runtime.
- Bá»• sung driver adapter cho Prisma Client engine:
  - cÃ i `pg`, `@prisma/adapter-pg`
  - `src/prisma/prisma.service.ts`: khá»Ÿi táº¡o `PrismaPg` adapter vÃ  truyá»n vÃ o `super({ adapter })`.
- Giá»¯ `DATABASE_URL` dáº¡ng placeholder an toÃ n trong docs/env example: `[REDACTED]`.

### Files Updated

- `auth-service/package.json`
- `auth-service/package-lock.json`
- `auth-service/.env.example`
- `auth-service/prisma.config.ts`
- `auth-service/prisma/schema.prisma`
- `auth-service/prisma/seed.js`
- `auth-service/prisma/migrations/migration_lock.toml`
- `auth-service/prisma/migrations/0001_init/migration.sql`
- `auth-service/src/prisma/prisma.service.ts`
- `auth-service/src/prisma/prisma.module.ts`
- `auth-service/src/app.module.ts`

### Validation

- `npm run prisma:generate` âœ…
- `npm run build` âœ…
- `npm run test` âœ…
- `npm run test:e2e` âœ…
- `npm run lint` âœ…

### Issues Encountered & Resolved

1. Prisma 7 config mismatch (`P1012`)
   - ÄÃ£ chuyá»ƒn sang flow Prisma 7 qua `prisma.config.ts`.
2. `PrismaClientInitializationError: Missing configured driver adapter`
   - ÄÃ£ fix báº±ng `@prisma/adapter-pg` + `pg` vÃ  inject adapter trong `PrismaService`.
3. Lint fail (`ENOENT/EPERM`) do file `.ts` bá»‹ hidden attribute trÃªn Windows
   - ÄÃ£ clear hidden attributes vÃ  lint pass láº¡i.

### Current Status

Prisma 7 upgrade cho `auth-service` Ä‘Ã£ hoÃ n táº¥t, build/test/e2e/lint Ä‘á»u pass.

### Session 3 - Prisma migration pipeline stabilization (Phase 1)

Date/time: 2026-05-27
Milestone: Milestone 1 stabilization (migration pipeline)

Files changed:

- `services/auth-service/package.json`
- `services/docs/RULES.md`
- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `npm run prisma:generate`
- `npm run prisma:status`
- `npm run prisma:check`
- `npm run prisma:deploy`

Result:

- Added migration pipeline gate scripts (`prisma:status`, `prisma:check`) to enforce Prisma health check before deploy.
- Standardized environment usage rules for local/CI/staging/production migration flow.
- Added Phase 1 dry-run checklist, runbook, and acceptance criteria for migration safety.
- Runtime check output showed pending migration (`0001_init`) and `prisma:deploy` failed with `P3005` because current DB schema is not empty (baseline required).

Known risks:

- Current database is not baselined for Prisma migrations; deploy will keep failing until baseline strategy is applied.
- `prisma:status`/`prisma:check` require reachable PostgreSQL with valid `DATABASE_URL`; they fail in offline/local-no-DB setups.
- CI workflow file is not present in this repository scope, so gate integration is documented and scripted but not wired into a CI YAML yet.

Next step:

- Baseline existing DB before first deploy migration, then re-run `npm run prisma:check` and `npm run prisma:deploy`.
- Wire `npm run prisma:check` into the actual CI pipeline config once workflow files are added/available.

### Session 4 - CI gate integration for Prisma check

Date/time: 2026-05-27
Milestone: Milestone 1 stabilization (CI gate wiring)

Files changed:

- `services/.github/workflows/auth-service-prisma-gate.yml`
- `services/docs/RULES.md`
- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `npm run prisma:check`

Result:

- Added GitHub Actions workflow gate to run `npm run prisma:check` for auth-service changes.
- Wired workflow to use `AUTH_SERVICE_DATABASE_URL` secret for Prisma status checks.
- Validation command passed in local runtime after DB baseline/deploy confirmation from user.
- Marked Phase 1 migration pipeline stabilization as done in plan docs.

Known risks:

- CI gate requires `AUTH_SERVICE_DATABASE_URL` secret in GitHub repo settings; workflow fails without it.
- If auth-service migration files change and DB target does not match expected baseline, `prisma:check` will fail by design.

Next step:

- Start Milestone 2 (Auth Flow) implementation with login/refresh/logout/me endpoints.

### Session 5 - Track 0/1 docs sync (unified plan)

Date/time: 2026-05-27
Milestone: Track 0 (plan hygiene) and Track 1 closure alignment

Files changed:

- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- No runtime validation command (docs-only synchronization).

Result:

- Unified roadmap language into a single execution track model.
- Marked Milestone 1 as done consistently in plan docs.
- Added a clear `Current Truth (Unified)` section to reduce ambiguity between current state and historical sessions.

Known risks:

- Historical session logs still contain context-specific past risks; readers should prioritize `Current Truth (Unified)` for present state.

Next step:

- Start Track 2 (Milestone 2 Auth Core) implementation.

### Session 6 - Track 2 Auth Core (Passport scaffolding)

Date/time: 2026-05-27
Milestone: Milestone 2 (Auth Flow)

Files changed:

- `services/auth-service/package.json`
- `services/auth-service/package-lock.json`
- `services/auth-service/.env.example`
- `services/auth-service/src/common/config/env.config.ts`
- `services/auth-service/src/app.module.ts`
- `services/auth-service/src/modules/auth/auth.module.ts`
- `services/auth-service/src/modules/auth/auth.controller.ts`
- `services/auth-service/src/modules/auth/auth.service.ts`
- `services/auth-service/src/modules/auth/guards/local-auth.guard.ts`
- `services/auth-service/src/modules/auth/guards/jwt-auth.guard.ts`
- `services/auth-service/src/modules/auth/strategies/local.strategy.ts`
- `services/auth-service/src/modules/auth/strategies/jwt.strategy.ts`
- `services/auth-service/src/modules/auth/interfaces/authenticated-user.interface.ts`
- `services/auth-service/test/app.e2e-spec.ts`
- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `npm install argon2`
- `npm install -D @types/passport-local @types/passport-jwt`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`
- `npm run prisma:generate`

Result:

- Added NestJS Passport auth foundation with `passport-local` for email/password login and `passport-jwt` for bearer-protected identity.
- Implemented endpoints scaffold: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Added refresh-token persistence/rotation logic in Prisma-backed `AuthService`.
- Added e2e coverage for auth error-path contracts (`/auth/me` unauthorized, `/auth/refresh` malformed/missing token).
- All listed validation commands passed.

Known risks:

- Success-path e2e for `/auth/login` and `/auth/refresh` still needs deterministic DB fixture user with argon2 password.
- Seed currently uses legacy SHA-256 bootstrap hash; runtime auto-upgrades on successful login, but seed should migrate to argon2 in a follow-up.

Next step:

- Add integration fixture flow for login/refresh success and complete Milestone 2 acceptance tests.

### Session 7 - Track 2 test coverage completion

Date/time: 2026-05-27
Milestone: Milestone 2 (Auth Flow)

Files changed:

- `services/auth-service/src/modules/auth/auth.service.spec.ts`
- `services/auth-service/src/main.ts`
- `services/docs/STATUS.md`

Commands run:

- `npm run test`
- `npm run test:e2e`
- `npm run build`
- `npm run lint`

Result:

- Added unit tests for `AuthService` covering:
  - argon2 password validation path
  - legacy SHA-256 password upgrade path
  - refresh-token rejection when not active
  - refresh-token rotation success path
  - invalid JWT payload type rejection
- e2e suite remains green for auth error-path contracts.
- build/lint remain green after test updates.

Known risks:

- Success-path e2e for `/auth/login` and `/auth/refresh` still depends on deterministic DB fixture setup.

Next step:

- Add fixture-backed e2e flow for login success + refresh success to close Milestone 2 acceptance criteria.

### Session 8 - Track 2 closure and Track 3 planning handoff

Date/time: 2026-05-27
Milestone: Milestone 2 (Auth Flow) -> Track 3 (Plan Mode)

Files changed:

- `services/auth-service/src/common/filters/global-exception.filter.ts`
- `services/auth-service/src/modules/auth/auth.controller.ts`
- `services/auth-service/src/modules/auth/auth.service.ts`
- `services/auth-service/src/modules/health/health.controller.ts`
- `services/auth-service/test/app.e2e-spec.ts`
- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`

Result:

- Closed Milestone 2 as done with stable auth flow endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`).
- Reworked global exception filter for clearer Prisma and HTTP error mapping with request-id oriented debugging.
- Added success messages at controller layer to keep response envelope informative and consistent.
- Removed temporary debug logging from auth service to avoid sensitive payload leaks.
- Validation suite remained green across build, lint, unit test, and e2e test.

Known risks:

- Runtime integration for login still depends on correct `DATABASE_URL`; invalid credentials will raise Prisma `P1000`.

Next step:

- Enter Track 3 Plan Mode and define RBAC guard/decorator rollout (`@Roles`, `@Permissions`, `@TenantId`, tenant-access guard, authz tests).

### Session 9 - Route access rule codification

Date/time: 2026-05-27
Milestone: Track 3 (Plan Mode)

Files changed:

- `services/docs/RULES.md`
- `services/docs/STATUS.md`

Commands run:

- No runtime validation command (docs-only update).

Result:

- Added explicit project rules for Public vs Private route handling when creating new modules/endpoints.
- Defined allowlist-first route policy via `routes.config.ts` and `publicMatcher` behavior contract.
- Added required validation and e2e expectations for access-control changes.

Known risks:

- Existing route config still needs cleanup to remove non-auth-service broad public patterns before enabling global guard rollout.

Next step:

- Finish `JwtAuthGuard` integration with `public-route.matcher` in code and tighten `PUBLIC_PATTERNS` to minimal safe list.

### Session 10 - Public/private guard flow hardening

Date/time: 2026-05-27
Milestone: Track 3 (Plan Mode, auth boundary hardening)

Files changed:

- `services/auth-service/src/common/config/routes.config.ts`
- `services/auth-service/src/common/config/public-route.matcher.ts`
- `services/auth-service/src/modules/auth/guards/jwt-auth.guard.ts`
- `services/auth-service/src/modules/auth/auth.controller.ts`
- `services/auth-service/src/app.module.ts`
- `services/docs/STATUS.md`

Commands run:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`

Result:

- Removed broad and unsafe public route patterns; public allowlist is now minimal and explicit.
- Completed `JwtAuthGuard` + `publicMatcher` flow: public routes bypass auth, all other routes require JWT access token.
- Registered `JwtAuthGuard` as global guard via `APP_GUARD` to enforce consistent access control across modules.
- Kept login route behavior intact with `LocalAuthGuard` while `/auth/me` is protected by global guard.
- Full validation suite remains green.

Known risks:

- Any new endpoint is private by default; if a route should be public, it must be explicitly added to `PUBLIC_PATTERNS`.

Next step:

- Track 3 planning: design role/permission/tenant guard chain and add authorization-specific tests.

### Session 12 - Milestone 3 route-based RBAC implementation

Date/time: 2026-05-28
Milestone: Track 3 (Route-based RBAC implementation)

Files changed:

- `services/auth-service/.env.example`
- `services/auth-service/src/app.module.ts`
- `services/auth-service/src/common/config/env.config.ts`
- `services/auth-service/src/main.ts`
- `services/auth-service/src/modules/auth/auth.module.ts`
- `services/auth-service/src/modules/auth/services/authorization.service.ts`
- `services/auth-service/src/modules/auth/services/authorization.service.spec.ts`
- `services/auth-service/src/modules/auth/services/route-permission-sync.service.ts`
- `services/auth-service/src/modules/auth/services/route-permission-sync.service.spec.ts`
- `services/auth-service/src/modules/auth/utils/route-permission-key.util.ts`
- `services/auth-service/src/modules/auth/utils/route-permission-key.util.spec.ts`
- `services/auth-service/src/shared/guard/authorization.guard.ts`
- `services/auth-service/src/shared/guard/authorization.guard.spec.ts`
- `services/auth-service/test/app.e2e-spec.ts`

Commands run:

- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

Result:

- Implemented 2-layer global guard flow: `JwtAuthGuard` (authentication) then `AuthorizationGuard` (route-based authorization).
- Added route permission key normalization (`METHOD:/path-template`) with `HEAD -> GET` mapping.
- Added runtime route sync service to scan Nest route templates, exclude public routes, and upsert into `Permission` table.
- Added authz toggles: `AUTHZ_ROUTE_SYNC_ENABLED`, `AUTHZ_STRICT_MODE`, `AUTHZ_ENFORCEMENT_ENABLED`.
- Added unit tests for route-key utility, authorization service, authorization guard, and route-sync service.
- Full validation suite is green after implementation.

Known risks:

- Enforcement is intentionally disabled by default (`AUTHZ_ENFORCEMENT_ENABLED=false`) until role-permission mappings are completed.
- Route sync is add/update only in this phase; stale permissions are not auto-removed.

Next step:

- Map route-based permissions to roles (`RolePermission`) and then enable `AUTHZ_ENFORCEMENT_ENABLED=true` in target environments.
## Status Update Template

Copy this block after every coding session:

```md
### Session N - Short Title

Date/time:
Milestone:

## Files changed:

## Commands run:

## Result:

## Known risks:

## Next step:
```


### Session 13 - Milestone 3B permission method/path and RBAC admin APIs

Date/time: 2026-05-28
Milestone: Track 3 (Route-based RBAC hardening + RBAC admin management)

Files changed:

- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/prisma/migrations/0002_permission_method_path/migration.sql`
- `services/auth-service/prisma/seed.js`
- `services/auth-service/src/shared/decorators/api-descript.decorator.ts`
- `services/auth-service/src/modules/auth/utils/route-permission-key.util.ts`
- `services/auth-service/src/modules/auth/services/route-permission-sync.service.ts`
- `services/auth-service/src/modules/auth/services/authorization.service.ts`
- `services/auth-service/src/shared/guard/authorization.guard.ts`
- `services/auth-service/src/modules/rbac/rbac.module.ts`
- `services/auth-service/src/modules/rbac/rbac.controller.ts`
- `services/auth-service/src/modules/rbac/rbac.service.ts`
- `services/auth-service/src/modules/rbac/dto/*`
- `services/auth-service/src/app.module.ts`
- `services/auth-service/src/modules/auth/auth.controller.ts`
- `services/auth-service/src/modules/health/health.controller.ts`
- `services/auth-service/src/modules/auth/auth.service.ts`
- `services/auth-service/test/app.e2e-spec.ts`
- `services/auth-service/src/modules/auth/**/*.spec.ts`
- `services/auth-service/src/modules/rbac/rbac.service.spec.ts`

Commands run:

- `npm run prisma:generate`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

Result:

- Migrated Permission model from `code/name` to `method/path/description` with composite uniqueness.
- Added `@ApiDescript()` metadata and integrated it into route permission sync.
- Route sync now enforces description policy for non-public endpoints (strict fail or non-strict warn+skip).
- Authorization runtime now checks permission by `(method, path)` resolved from route template.
- Implemented RBAC admin APIs: Role CRUD, permission listing, role-permission grant/revoke/replace, role-permission list.
- Added protection for system roles (`SUPER_ADMIN`, `VIETSAGE_OPERATION`, `HOTEL_OWNER`) from update/delete.
- Added and updated unit/e2e tests; validation suite is green.

Known risks:

- Migration purges non-route legacy permissions and their mappings; environments relying on legacy permission codes must migrate policy usage before enabling enforcement.
- `AUTHZ_ENFORCEMENT_ENABLED` should remain `false` until role-permission mappings are finalized for required routes.

Next step:

- Run DB migration in target environments, execute permission sync, map role-permission via new APIs, then enable enforcement progressively.

### Session 14 - Milestone 4 planning hard-delete policy update

Date/time: 2026-05-28
Milestone: Milestone 4 (Hotel User Management planning refinement)

Files changed:

- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `read_file services/docs/PLANS.md`
- `patch services/docs/PLANS.md`
- `read_file services/docs/STATUS.md`
- `patch services/docs/STATUS.md`

Result:

- Updated Milestone 4 plan with explicit "no hard delete" policy.
- Added deletion/state policy section for role revoke and user deactivation behavior.
- Added optimized implementation order to reduce rework and security regressions.
- Normalized Markdown fences in Milestone 4 block.

Known risks:

- Current Prisma schema still uses hard delete semantics for `UserRole` relation; true soft-delete for role membership needs schema support in implementation phase.

Next step:

- In Milestone 4 execution, add relation-status/audit strategy first, then implement hotel-user APIs with strict tenant/RBAC enforcement.

### Session 15 - Milestone 4 version review and optimization proposal

Date/time: 2026-05-28
Milestone: Milestone 4 (planning quality review)

Files changed:

- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `read_file services/docs/PLANS.md`
- `patch services/docs/PLANS.md`
- `read_file services/docs/STATUS.md`
- `patch services/docs/STATUS.md`

Result:

- Reviewed Milestone 4 plan and added versioned implementation recommendation (`M4-v1` fast path, `M4-v2` recommended).
- Elevated `UserRole` soft-delete schema support into implementation order before API exposure.
- Clarified why `M4-v2` should be default when timeline permits (policy enforcement at data-model level).

Known risks:

- `M4-v2` requires schema migration and backfill strategy for existing role relations.

Next step:

- Draft migration design for `UserRole` soft-delete fields and update role-revoke API contract accordingly.

### Session 16 - Milestone 4 codex execution checklist update

Date/time: 2026-05-28
Milestone: Milestone 4 (execution planning refinement)

Files changed:

- `services/docs/PLANS.md`
- `services/docs/STATUS.md`

Commands run:

- `patch services/docs/PLANS.md`
- `read_file services/docs/STATUS.md`
- `patch services/docs/STATUS.md`

Result:

- Added Codex-optimized execution checklist to Milestone 4.
- Added phase-based prompt pack (DB/API/validation) directly inside Milestone 4 for consistent implementation.
- Kept no-hard-delete policy as a first-class invariant across execution phases.

Known risks:

- Prompt pack alignment still depends on final schema decision for `UserRole` soft-delete fields.

Next step:

- Start Prompt A (DB phase) and commit schema/migration before API implementation.
