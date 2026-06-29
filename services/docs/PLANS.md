# VietSage Backend Plan

Last updated: 2026-05-28

## 1) Snapshot

- Workspace: `services/`
- Main service: `services/auth-service/`
- Stack: NestJS 11, Prisma 7, PostgreSQL, Zod
- Active modules: `health`, `auth`, `rbac`, `hotel-users`
- API contract: Swagger UI at `/docs` and OpenAPI export via `npm run openapi:export`
- Error contract (current standard):
  - Shape: `{ status, message, data?: { detail } }`
  - `message`: title/code only (example: `VALIDATION_ERROR`, `UNAUTHORIZED`)
  - `data.detail`: `string` for a single issue, `string[]` for multiple issues

## 2) Milestone Status

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 - Foundation | Done | Health endpoint, config, request id/logging, global filter, validation pipeline |
| M1 - DB Foundation | Done | Prisma 7 setup, migration flow, seed, CI migration gate |
| M2 - Auth Core | Done | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` |
| M3 - Route-based RBAC | Done | Route permission sync + route key authorization by `method:path` |
| M4 - Hotel User Management | Done | Tenant-scoped staff APIs, soft-revoke role flow, Zod validation |
| M5 - Hardening and Observability | In progress | Runtime hardening, contract tests, deployment safety |

## 3) Completed Recently

- Refactored module structure to repository-first DB access (`*.repository.ts`) with business logic in services.
- Consolidated module tests into local `tests/` folders to remove scattered test files.
- Enabled Swagger/OpenAPI generation and shared API contract export flow.
- Standardized exception payloads across auth/rbac/hotel-users with a single global format.
- Improved Zod validation error mapping so field-level issues can be returned in `data.detail`.
- Added explicit Swagger request/response schemas so OpenAPI export includes `requestBody` and non-empty `responses.content`.
- Removed duplicated `sdk` mirror under `shared/api-contract`; frontend should consume `openapi/v1/openapi.json` directly.

## 4) Current Focus (M5)

- [x] RBAC lazy-load permission modules for role management:
  - Add `moduleKey` persistence/indexing for route permissions.
  - Add module summary/detail APIs with page/limit pagination.
  - Add module-level bulk APIs (`select-all`, `disable-all`).
- [ ] Environment schema alignment for permission sync:
  - Run `npm run prisma:deploy` on each environment.
  - Confirm `Permission.method` and `Permission.path` exist in the target DB.
  - Keep `AUTHZ_ROUTE_SYNC_STRICT_MODE=false` only as temporary fallback.
- [ ] Add/maintain e2e coverage for error contract consistency (`message` + `data.detail`).
- [x] Keep OpenAPI output import-friendly for Postman and FE SDK sync.
- [ ] Add operational runbook for route-permission sync and authz troubleshooting.

## 7) GuestOS MVP

- [x] Add hotel, room, room QR, stay, guest session, guest request, request event, and domain event schema.
- [x] Add modular hotel operations APIs for rooms, stays, QR lifecycle, checkout revocation, and staff request queue.
- [x] Add GuestOS APIs for QR scan, guest session access, guest requests, and session close.
- [x] Complete full validation gate after GuestOS implementation.

## 5) Release Gate

```bash
npm run prisma:check
npm run build
npm run test
npm run test:e2e
npm run lint
```

## 6) Non-Goals (V1)

- No Redis/cache until a measured bottleneck exists.
- No microservice split before domain and API contracts are stable.
- No message broker in this phase.
- No frontend scope in backend milestones.
