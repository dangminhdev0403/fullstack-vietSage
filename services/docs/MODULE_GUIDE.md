# Backend Module Guide

## Purpose

This guide describes how to structure and extend backend domain modules without bloating `ARCHITECTURE.md`.

## Standard Module Shape

```txt
modules/[domain]/
├── [domain].module.ts
├── [domain].controller.ts
├── [domain].service.ts
├── [domain].repository.ts
├── schemas/
└── tests/
```

Create only the files/folders the module needs.

## Layer Responsibilities

| Layer | Allowed responsibility | Not allowed |
| --- | --- | --- |
| Controller | Routes, decorators, auth metadata, request parsing, response mapping. | Business rules, raw database queries, transaction orchestration. |
| Schema | Runtime validation, request/response schema helpers, typed parsing. | Database access, provider calls. |
| Service | Business orchestration, domain rules, transaction decisions, workflow coordination. | Raw HTTP response handling, framework-only concerns. |
| Repository | Persistence, Prisma queries, data loading, query-specific selection. | Business policy decisions, route authorization. |
| Module | Dependency composition and provider wiring. | Business logic. |
| Tests | Behavior, validation, access, and contract coverage. | Mocks that hide broken contracts or skipped behavior. |

## Dependency Direction

```txt
Controller
  ↓
Service
  ↓
Repository
  ↓
Database / External Provider
```

Rules:

- A controller may depend on its service.
- A service may depend on repositories and other application services.
- A repository may depend on database/infrastructure providers.
- A repository must not call controllers.
- Cross-module calls should prefer service-level contracts over direct repository access.
- Shared utilities must not import domain modules unless explicitly designed as extension points.

## Adding a Module

1. Define the domain capability.
2. Define data/API/event ownership.
3. Create a module with only the needed files.
4. Keep controllers thin and services business-focused.
5. Add schema validation at module boundaries.
6. Add migrations if the module owns data.
7. Decide route access: private by default or explicitly public.
8. Keep OpenAPI tags and response shapes stable.
9. Add tests and run validation required by `RULES.md` or the task scope.

## Anti-patterns

- Business rules in controllers.
- Raw database access scattered outside repositories/infrastructure.
- Direct repository access across unrelated modules.
- Public routes added without explicit allowlist review.
- Tests that mock away the contract being validated.
