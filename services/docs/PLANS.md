# VietSage Backend Plan

Last updated: 2026-07-12

## 1. Snapshot

- Workspace: `services/`
- Current core API path: `services/auth-service/` (historical name)
- Stack: NestJS 11, Prisma 7, PostgreSQL, Zod
- Runtime architecture: modular monolith
- API contract: Swagger/OpenAPI export via `npm run openapi:export`
- Current active contexts: identity/access (`src/modules/identity`), organization/tenancy (`src/modules/organization` with `/tenant-owners` API routes preserved), property (`src/modules/property` with `/hotels` API routes preserved), guest operations (`src/modules/guest-operations` with `/guest` and `/hotels/:hotelId/requests*` API routes preserved), billing (`src/modules/billing` with `api/application/domain/infrastructure` structure), emergency (`src/modules/emergency` with `api/application/domain/infrastructure` structure and `/emergency/guest/calls` route preserved), notifications, codes, health

## 2. Architecture Refactor Status

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 - Foundation | Done | Health, config, logging, global filter, validation pipeline |
| M1 - DB Foundation | Done | Prisma 7 setup, migration flow, seed/CI migration gate |
| M2 - Auth Core | Done | Login/refresh/logout/me bridge |
| M3 - RBAC Bridge | Done/In progress | Business permission keys with route fallback |
| M4 - Hotel/Guest/Billing Expansion | Done/In progress | Property, guest operations, billing, emergency, Telegram modules exist |
| M5 - DOCX Architecture Alignment | In progress | Modular-monolith docs, domain map, secret hygiene, module boundary cleanup |

## 3. Current DOCX Refactor Focus

- [x] Align architecture docs to modular-monolith/current-runtime truth.
- [x] Add domain map and service evolution criteria.
- [x] Remove filled values from tracked legacy secret files.
- [x] Hide Hotels repositories from module exports.
- [x] Move shared authenticated-user contract to shared security boundary.
- [x] Add `GuestRequestEventPublisher` shared port for Guest Operations/Property/Notifications realtime publication.
- [x] Replace remaining cross-context implementation dependencies with public ports and final boundary regression tests.
- [x] Split Identity/Auth folders into `src/modules/identity` after behavior tests covered seams.
- [x] Split Hotels/Property folders into `src/modules/property` after behavior tests covered seams.
- [x] Split legacy guest-facing folders into `src/modules/guest-operations` after behavior tests covered seams.
- [x] Move staff-side hotel request workflow into `src/modules/guest-operations` while preserving `/hotels/:hotelId/requests*` routes.
- [x] Move tenant owner management into `src/modules/organization` while preserving `/tenant-owners` routes.
- [x] Restructure `src/modules/billing` into `api/application/domain/infrastructure/tests` without API changes.
- [x] Harden `src/modules/emergency` into `api/application/domain/infrastructure/tests`, keep `/emergency/guest/calls`, and consume guest context through the Guest Operations public port.
- [x] Split Telegram provider and notification route management into `src/modules/notifications` after boundary/webhook tests covered seams.
- [x] Replace Telegram webhook URL-path secret with header secret validation on `/integrations/telegram/webhook`.
- [x] Export OpenAPI and sync frontend generated types during final release gate.

## 4. Release Gate

Backend:

```bash
npm run build
npm run test -- --runInBand --silent
npm run test:e2e -- --runInBand --silent
npx eslint "{src,apps,libs,test}/**/*.ts"
npm run openapi:export
git diff --check
```

Frontend contract consumers:

```bash
pnpm run sync:api:types
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

The modular-monolith boundary consolidation is complete for the current codebase. Future service extraction still requires ADRs, operational readiness, data migration plans, and versioned contracts.

## 5. Non-Goals

- No microservice split in this phase.
- No message broker/cache by default.
- No service rename in this phase.
- No package/dependency changes without approval.
- No frontend scope unless a contract change requires sync.
