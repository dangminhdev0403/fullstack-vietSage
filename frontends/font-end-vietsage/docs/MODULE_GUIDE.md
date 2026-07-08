# Frontend Feature Guide

## Purpose

This guide explains how to add and maintain frontend feature modules without bloating `ARCHITECTURE.md`.

## Standard Feature Shape

```txt
features/[feature-name]/
├── service/
├── queries/
├── hooks/
├── store/
├── types/
├── utils/
├── components/
├── i18n/
└── schemas/
```

Create only the folders the feature needs.

## Folder Responsibilities

| Folder | Responsibility |
| --- | --- |
| `service/` | Backend/API interaction and endpoint-level mapping. |
| `queries/` | TanStack Query wrappers for server state. |
| `hooks/` | Feature orchestration hooks. |
| `store/` | Client-only feature state. |
| `types/` | Frontend-facing feature types and contract wrappers. |
| `utils/` | Pure feature helpers. |
| `components/` | Feature-specific reusable UI. |
| `i18n/` | Feature-local translations. |
| `schemas/` | Runtime validation when needed. |

## Dependency Rules

- Feature UI may use feature hooks.
- Feature hooks may use feature queries, stores, and services.
- Feature services may use core HTTP utilities or internal route handlers.
- Feature code must not import unrelated feature internals unless an explicit shared contract exists.
- Reusable UI primitives must not import feature services.

## Adding a Feature

1. Define the product surface and route ownership.
2. Define the backend/API contract.
3. Create `src/features/[feature-name]` with only needed folders.
4. Add service methods for backend-backed behavior.
5. Add query hooks for server state when needed.
6. Add local hooks/store only for frontend interaction state.
7. Add feature components for reusable domain UI.
8. Add route pages that compose the feature.
9. Add loading, error, and empty states where the user flow needs them.
10. Run the validation commands required by `RULES.md` or the task scope.

## Anti-patterns

- Putting large business UI logic directly in `page.tsx`.
- Calling backend APIs directly from reusable UI components.
- Duplicating backend authorization or workflow rules as frontend truth.
- Creating every optional feature folder even when unused.
- Sharing feature internals by deep imports instead of defining a stable interface.
