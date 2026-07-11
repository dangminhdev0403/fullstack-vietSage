# VietSage Backend Architecture

## 1. Purpose

This document defines the reusable backend architecture standard for VietSage backend code. The current backend runtime is a modular monolith under `services/auth-service`; that folder name is historical and should be treated as the current core API.

Keep this file short. Detailed conventions live in topic-specific docs in this same `docs/` folder.

## 2. Docs Index

| Need | Read |
| --- | --- |
| Core backend architecture and module boundaries | `ARCHITECTURE.md` |
| Module structure, dependency direction, and module extension workflow | `MODULE_GUIDE.md` |
| API contracts, authorization, data ownership, migrations, realtime/integrations | `CONTRACT_GUIDE.md` |
| New service/service-extraction workflow | `EXTENSION_GUIDE.md` |
| Development rules, security rules, validation gates, execution contract | `RULES.md` |
| Active/archived backend milestones and progress tracking | `PLANS.md` |

Rule: do not read all docs by default. Start with this file, then open only the doc matching the current task.

## 3. Core Principles

- Start with a modular monolith while domain boundaries are evolving.
- Split a service only when ownership, scaling, deployment, security, or integration needs justify it.
- Keep controllers thin, services workflow-focused, and repositories persistence-focused.
- Keep repositories internal to their owning module; expose public ports/services for cross-module use.
- Keep contracts explicit and stable through OpenAPI or versioned event contracts.
- Do not introduce Redis, queues, brokers, API gateways, or service splits without measured need.

## 4. Current Backend Runtime

```txt
services/auth-service/
  src/
    modules/
      auth/              # authentication/session bridge
      rbac/              # roles/permissions bridge
      hotel-users/       # user/tenant/hotel access APIs
      tenant-owners/     # tenant ownership APIs
      hotels/            # property, rooms, stays, service catalog, request workflow
      guest-os/          # guest sessions/guest-facing requests
      billing/           # folio/invoice/payment workflows
      emergency/         # emergency workflows
      telegram/          # provider notification/webhook adapter
      codes/             # code generation
      health/            # health
    common/              # infrastructure
    shared/              # guards/decorators/contracts
    prisma/              # Prisma runtime wrapper
```

## 5. Standard Module Boundary

Small module:

```txt
module.ts
controller.ts
service.ts
```

Medium module:

```txt
api/
application/
infrastructure/
tests/
```

Complex module:

```txt
api/
application/
domain/
infrastructure/
tests/
index.ts
```

Create only folders that are needed now. Do not add empty architecture folders just to match a template.

## 6. Request and Contract Flow

```txt
HTTP Request
  -> Request Context / Logging Middleware
  -> Global Guards
  -> Controller
  -> Schema Validation
  -> Service/Application Use Case
  -> Repository / Integration Adapter
  -> Database / External Provider
  -> Exception Filter / Response Transformation
  -> HTTP Response
```

Rules:

- Controllers delegate; they do not own business rules.
- Services decide workflow and transaction boundaries.
- Repositories isolate persistence details.
- Integration adapters isolate external providers.
- OpenAPI is the HTTP contract source of truth.
- Event contracts must be versioned before asynchronous messaging is introduced.

## 7. Backend and Frontend Boundary

Backend owns business rules, authorization, data persistence/migrations, API/event contracts, external integrations, and operational readiness.

Frontend owns UI rendering, route composition, API consumption, browser state, loading/empty/error display, and user interactions. Frontend may hide unavailable actions, but backend authorization remains source of truth.
