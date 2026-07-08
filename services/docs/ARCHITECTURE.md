# VietSage Backend Architecture

## 1. Purpose

This document defines the reusable backend architecture standard for VietSage backend services.

Keep this file short. It should explain only the core service, module, boundary, and request-flow rules an AI agent or developer must know before changing a backend service. Detailed conventions live in topic-specific docs in this same `docs/` folder.

## 2. Docs Index

All backend documentation should stay under `services/docs/` or the specific service's own `docs/` folder.

| Need | Read |
| --- | --- |
| Core architecture and service/module boundaries | `ARCHITECTURE.md` |
| Module structure, dependency direction, and module extension workflow | `MODULE_GUIDE.md` |
| API contracts, authorization, data ownership, migrations, realtime/integrations | `CONTRACT_GUIDE.md` |
| New services, service extraction, and service extension workflow | `EXTENSION_GUIDE.md` |
| Development rules, security rules, validation gates, execution contract | `RULES.md` |
| Active/archived backend milestones and progress tracking | `PLANS.md` |

Rule: do not read all docs by default. Start with this file, then open only the doc matching the current task.

## 3. Core Principles

- Backend services own business rules, authorization enforcement, persistence, domain workflows, contracts, and external provider integration.
- Frontend apps own UI rendering, route composition, user interaction state, and API consumption.
- Start with a modular monolith when domain boundaries are still evolving.
- Split a service only when there is clear ownership, scaling, deployment, security, or integration need.
- Keep controllers thin, services business-focused, and repositories persistence-focused.
- Keep contracts explicit and stable through OpenAPI or versioned event contracts.
- Architecture docs must avoid current-service snapshots that make the standard hard to reuse.

## 4. Service Boundary Model

Before creating or extracting a backend service, define its boundary.

| Boundary | Meaning |
| --- | --- |
| Domain ownership | Which business capability the service owns. |
| Data ownership | Which tables, schemas, migrations, and lifecycle rules the service owns. |
| API ownership | Which REST/OpenAPI endpoints the service exposes. |
| Event ownership | Which events the service publishes or consumes. |
| Integration ownership | Which external providers the service calls or receives callbacks from. |
| Operational ownership | Which health, logging, config, validation, and deployment readiness concerns the service owns. |

A module should remain inside an existing service until its contract, data ownership, and operational needs justify extraction.

## 5. Standard Backend Service Structure

```txt
services/
└── [service-name]/
    ├── src/
    │   ├── main.ts
    │   ├── app.bootstrap.ts
    │   ├── app.module.ts
    │   ├── modules/
    │   ├── common/
    │   ├── shared/
    │   └── prisma/ or infrastructure/database/
    ├── prisma/
    ├── scripts/
    ├── docs/
    └── package.json
```

Only create folders that the service actually needs.

## 6. Layer Responsibilities

| Layer | Responsibility |
| --- | --- |
| `modules/` | Business/domain modules. |
| `common/` | Cross-cutting infrastructure: config, logging, filters, validation, OpenAPI, middleware, import utilities, security helpers. |
| `shared/` | Application-level guards, decorators, interfaces, and reusable helpers shared by modules. |
| `src/prisma/` or `infrastructure/database/` | Runtime database integration wrapper. |
| `prisma/` | Database schema, migrations, and seed data when the service owns persistence. |
| `scripts/` | Build, export, maintenance, and operations helper scripts. |
| `docs/` | Architecture, rules, guides, plans, runbooks, and operational notes. |

## 7. Module Summary

Domain modules should be easy to review, extend, test, and extract later.

```txt
modules/[domain]/
├── [domain].module.ts
├── [domain].controller.ts
├── [domain].service.ts
├── [domain].repository.ts
├── schemas/
└── tests/
```

Create only the files/folders needed by the module. See `MODULE_GUIDE.md` for detailed responsibilities and dependency rules.

## 8. Request and Contract Flow Summary

```txt
HTTP Request
  ↓
Request Context / Logging Middleware
  ↓
Global Guards
  ↓
Controller
  ↓
Schema Validation
  ↓
Service
  ↓
Repository / Integration Adapter
  ↓
Database / External Provider
  ↓
Exception Filter / Response Transformation
  ↓
HTTP Response
```

Rules:

- Controllers delegate; they do not own business rules.
- Services decide workflow and transaction boundaries.
- Repositories isolate persistence details.
- Integration adapters isolate external providers.
- OpenAPI is the HTTP contract source of truth.
- Event contracts must be versioned if asynchronous messaging is introduced.

See `CONTRACT_GUIDE.md` for detailed contract, auth, data, migration, realtime, and integration rules.

## 9. Backend and Frontend Boundary

Backend owns:

- Business rules.
- API and event contracts.
- Authorization and authentication enforcement.
- Data persistence and migrations.
- Domain workflows.
- External provider integration.
- Operational readiness.

Frontend owns:

- UI rendering.
- Route composition.
- API consumption.
- User interaction state.
- Browser-specific behavior.
- Loading, empty, and display states.

The frontend may hide unavailable actions for UX, but backend authorization remains the source of truth.

## 10. Rules Summary

- Keep controllers thin.
- Keep business rules in services.
- Keep database access behind repositories or infrastructure services.
- Keep external provider calls behind adapters/services.
- Keep routes private by default.
- Keep public routes explicitly allowlisted.
- Keep contracts stable and explicit.
- Keep pagination bounded.
- Keep indexes aligned with query patterns.
- Keep transactions intentional.
- Do not introduce Redis, queues, brokers, or service splits without measured need.
- Keep architecture docs generic and short.
- Keep detailed docs in the same `docs/` folder, referenced by the Docs Index.
