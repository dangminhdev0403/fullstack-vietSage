# VietSage Architecture

## 1. Architecture decision

VietSage currently runs as a **modular monolith**:

```txt
frontends/font-end-vietsage/        # Next.js frontend
services/auth-service/              # current deployed core API (NestJS)
shared/api-contract/                # exported OpenAPI/shared contract package
```

Despite the historical folder name `auth-service`, the backend now owns more than authentication: identity/RBAC, tenant and hotel operations, Guest Operations, billing, emergency workflows, notifications, health, and shared backend infrastructure. Treat it as the **VietSage core API** until a dedicated rename phase is approved.

This repo should **not** be refactored by rebuilding from scratch or prematurely splitting services. The target is a production-grade modular monolith with clear domain boundaries that can be extracted later when there is a real operational reason.

## 2. Current runtime topology

```txt
Browser / mobile web
  -> Next.js frontend
  -> NestJS core API (services/auth-service)
  -> PostgreSQL
  -> External providers where enabled (Google Sheets, Telegram, payment providers)
```

No API gateway, message broker, distributed cache, or database-per-service split is part of the current architecture baseline.

## 3. Bounded contexts

| Context | Current module area | Owns | Notes |
| --- | --- | --- | --- |
| Identity & Access | `src/modules/identity`, shared guards/decorators | Authentication, sessions, users, roles, permissions, authorization checks | Consolidated boundary; legacy `auth`, `rbac`, `hotel-users` folders should not be reintroduced. |
| Organization / Tenancy | `tenant-owners`, tenant user relations | Tenant ownership, tenant membership, platform/tenant scopes | Depends on Identity for actor identity. |
| Property | `src/modules/property`; HTTP routes still use `/hotels` for compatibility | Hotels, rooms, QR, stays, service catalog, hotel access checks | Public access port is exported via `property-public.ts`; repositories are internal. |
| Guest Operations | `src/modules/guest-operations`; HTTP routes still use `/guest` for compatibility; staff request workflows currently parked in Property until extraction | Guest sessions, guest requests, request timeline/status | Public guest session/service ports are exported via `guest-operations-public.ts`; should publish notification intents instead of calling providers directly. |
| Billing | `billing` | Folios, folio items, invoices, payments, checkout rules | Uses property access, should not depend on property persistence internals. |
| Emergency | `emergency` | Emergency locations, incidents, call lifecycle, notifications | Should use guest/property resolver ports. |
| Notifications | `src/modules/notifications`; webhook route uses `/integrations/telegram/webhook`; staff route config still uses `/hotels/:hotelId/notification-routes*` for compatibility | Notification routing, provider delivery callbacks, delivery tracking | Telegram is the first provider adapter; webhook secrets are validated by header, not URL path. |
| Platform/Common | `common`, `shared`, `prisma`, `codes`, `health` | Infrastructure, validation, logging, OpenAPI, code generation, health | Cross-cutting; keep generic and small. |

See `DOMAIN_MAP.md` for ownership details.

## 4. Dependency direction

Allowed direction:

```txt
Controller -> Application Service -> Repository/Adapter -> Database/Provider
```

Cross-context calls must go through a public service/port exported by the owning module. Repositories and Prisma query details are internal to their context.

Rules:

- Controllers stay thin and own HTTP parsing/response mapping only.
- Services own workflow, authorization/resource checks, and transaction decisions.
- Repositories own persistence details and are not exported across module boundaries.
- Shared guards/decorators may depend on public Identity contracts, not deep auth implementation details.
- External providers stay behind adapters/services.

## 5. Contract source of truth

OpenAPI export from the backend is the HTTP contract source of truth:

```bash
cd services/auth-service
npm run openapi:export
```

`docs/API_SPEC.md` should describe contract policy and runtime notes. It should not become a hand-maintained endpoint catalog that drifts from generated OpenAPI.

## 6. Event and async strategy

V1 uses synchronous transactions and in-process publication where needed. Do not introduce Kafka, RabbitMQ, Redis streams, or an outbox worker without a specific workflow requirement.

When events are needed, use a versioned envelope:

```txt
id, type, version, occurredAt, producer, correlationId, actor, payload
```

See `EVENT_FLOW.md` for the event and outbox-readiness policy.

## 7. Service extraction policy

A bounded context may be extracted only when at least one trigger is real and measured:

- independent scaling or deployment cadence;
- isolation/security requirement;
- external integration reliability requirement;
- clear data ownership and contract stability;
- team ownership boundary;
- operational need such as independent retries/queueing.

Until then, keep contexts inside the core API. See `SERVICE_EVOLUTION.md`.

## 8. Rename policy

`services/auth-service` is a historical name. A future rename to `services/core-api` or `services/vietsage-api` is reasonable, but only after module boundaries and tests are stable. Rename must be a separate phase because it touches Docker, CI, scripts, docs, OpenAPI export, and frontend environment references.
