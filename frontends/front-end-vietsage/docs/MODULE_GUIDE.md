# Frontend Feature Guide

## Purpose

This guide explains how to add and maintain frontend feature modules without bloating `ARCHITECTURE.md`.

## Standard Feature Shape

```txt
features/[feature-name]/
├── repositories/
├── resources/
├── queries/
├── hooks/
├── service/
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
| `repositories/` | Transport calls, endpoint paths, DTO mapping, response transforms, and pagination normalization. |
| `resources/` | Capability declarations, stable keys, query options, mutations, local invalidation, and cache operations built with `@dangminhdev04032005/query-resource`. |
| `queries/` | Client query hooks that bind resource scope and expose TanStack Query results. |
| `hooks/` | Permissions, feature flags, normalized filters, cross-resource orchestration, navigation, and UI feedback. |
| `service/` | Existing server loaders or domain orchestration that is not client cache behavior. Do not use it as a second repository layer. |
| `store/` | Client-only feature state. |
| `types/` | Frontend-facing feature types and contract wrappers. |
| `utils/` | Pure feature helpers. |
| `components/` | Feature-specific reusable UI. |
| `i18n/` | Feature-local translations. |
| `schemas/` | Runtime validation when needed. |

## Dependency Rules

- Feature UI may use feature hooks or query hooks.
- Feature hooks may use feature resources, queries, stores, and explicit cross-resource coordination.
- Resources may use their feature repository and stable feature contract types. They must not import React components or UI state.
- Repositories may use the runtime-appropriate core HTTP utility or internal route handler. They must not import resources or React.
- `@dangminhdev04032005/query-resource` is the shared frontend infrastructure package. Do not add a local factory copy, nested package.json, pnpm workspace package, or feature-local `node_modules` for resource utilities.
- Reuse the published package in another project; do not copy VietSage repositories or resources with it.
- Keep response-affecting scope in `scopeKey` and response-affecting inputs in `inputKey`. Treat scope and input values as immutable after options are created.
- Declare domain commands such as `approve`, `cancel`, `checkIn`, or `markRead` as named mutations. Do not recreate an untyped `extra` bucket.
- Keep local invalidation in the resource definition. Coordinate invalidation across different resources explicitly in a feature hook so dependencies remain visible.
- Server route pages should pass scope and presentation decisions to feature-owned loaders instead
  of coordinating multiple endpoint calls directly.
- Feature code must not import unrelated feature internals unless an explicit shared contract exists.
- Reusable UI primitives must not import feature services.

## Adding a Feature

1. Define the product surface and route ownership.
2. Define the backend/API contract.
3. Create `src/features/[feature-name]` with only needed folders.
4. Add a repository for transport, DTO mapping, transforms, and pagination.
5. Declare only the resource capabilities the backend actually supports with `createResource`, `defineQuery`, `defineInfiniteQuery`, and `defineMutation` from `@dangminhdev04032005/query-resource`.
6. Add query or feature hooks for scope, permissions, flags, filters, and UI-side orchestration.
7. Add local hooks/store only for frontend interaction state.
8. Add feature components for reusable domain UI.
9. Add route pages that compose the feature.
10. Add loading, error, and empty states where the user flow needs them.
11. Add resource type/runtime tests for keys, cache behavior, invalidation, and rollback as applicable.
12. Run the validation commands required by `RULES.md` or the task scope.

## Extending a Workspace Dashboard

Workspace composition lives in `src/features/workspace/config/workspace-registry.ts`. Add a
registry extension when a role alias, navigation item, or dashboard widget must be introduced
without adding persona checks to route pages.

```ts
const registry = createWorkspaceRegistry([
  {
    roleAliases: { HOTEL_AUDITOR: "finance" },
    navigation: [auditNavigation],
    widgets: [auditSummaryWidget],
  },
]);
```

- Use stable, namespaced keys such as `finance.audit-summary`.
- Declare `personas`, `anyCapabilities`, and `requiresHotel` on each entry. Missing capability or
  hotel scope filters the entry out.
- Registry configuration changes presentation only. Backend endpoints must continue to enforce
  authorization and resource scope.
- Duplicate keys and role aliases are rejected. Set `replaceExisting: true` only for an intentional,
  reviewed replacement.
- Keep data loading conditional on the resolved widget set so hidden modules do not trigger API
  requests.
- Keep widget keys inside the Workspace boundary. Pass domain-neutral decisions such as
  `includeRequests` or `includeServices` into a Hotel Operations loader.

## Anti-patterns

- Putting large business UI logic directly in `page.tsx`.
- Calling backend APIs directly from reusable UI components.
- Handwriting query keys and mutation invalidation repeatedly in feature hooks.
- Putting transport, DTO envelopes, permissions, or UI notifications inside a resource definition.
- Treating every endpoint group as full CRUD when it only exposes a subset of capabilities.
- Duplicating backend authorization or workflow rules as frontend truth.
- Creating every optional feature folder even when unused.
- Sharing feature internals by deep imports instead of defining a stable interface.
