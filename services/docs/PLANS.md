# VietSage Backend Plan

Last updated: 2026-07-11

## 1. Snapshot

- Workspace: `services/`
- Current core API path: `services/auth-service/` (historical name)
- Stack: NestJS 11, Prisma 7, PostgreSQL, Zod
- Runtime architecture: modular monolith
- API contract: Swagger/OpenAPI export via `npm run openapi:export`
- Current active contexts: identity/access, tenancy, property/hotels, GuestOS, billing, emergency, notifications, codes, health

## 2. Architecture Refactor Status

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 - Foundation | Done | Health, config, logging, global filter, validation pipeline |
| M1 - DB Foundation | Done | Prisma 7 setup, migration flow, seed/CI migration gate |
| M2 - Auth Core | Done | Login/refresh/logout/me bridge |
| M3 - RBAC Bridge | Done/In progress | Business permission keys with route fallback |
| M4 - Hotel/Guest/Billing Expansion | Done/In progress | Property, GuestOS, billing, emergency, Telegram modules exist |
| M5 - DOCX Architecture Alignment | In progress | Modular-monolith docs, domain map, secret hygiene, module boundary cleanup |

## 3. Current DOCX Refactor Focus

- [x] Align architecture docs to modular-monolith/current-runtime truth.
- [x] Add domain map and service evolution criteria.
- [x] Remove filled values from tracked legacy secret files.
- [x] Hide Hotels repositories from module exports.
- [x] Move shared authenticated-user contract to shared security boundary.
- [x] Add `GuestRequestEventPublisher` shared port for GuestOS/Hotels/Telegram realtime publication.
- [ ] Replace remaining cross-context implementation dependencies with public ports.
- [ ] Split Identity/Auth folders after behavior tests cover seams.
- [ ] Export OpenAPI after future HTTP contract changes.

## 4. Release Gate

```bash
npm run build
npm run test -- --runInBand
npm run test:e2e
npx eslint "{src,apps,libs,test}/**/*.ts"
git diff --check
```

## 5. Non-Goals

- No microservice split in this phase.
- No message broker/cache by default.
- No service rename in this phase.
- No package/dependency changes without approval.
- No frontend scope unless a contract change requires sync.
