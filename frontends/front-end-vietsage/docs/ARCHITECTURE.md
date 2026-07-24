# VietSage Frontend Architecture

## 1. Purpose

This document defines the reusable frontend architecture standard for VietSage frontend apps.

Keep this file short. It should explain only the core boundaries an AI agent or developer must know before changing the app. Detailed conventions live in topic-specific docs in this same `docs/` folder.

## 2. Docs Index

All frontend documentation must stay under `frontends/[frontend-app]/docs/`.

| Need | Read |
| --- | --- |
| Core architecture and layer boundaries | `ARCHITECTURE.md` |
| Feature/module structure and extension workflow | `MODULE_GUIDE.md` |
| Backend API, generated contracts, route handlers, auth/session calls | `CONTRACT_GUIDE.md` |
| Runtime boundaries, components, state, realtime, errors, i18n | `RUNTIME_UI_GUIDE.md` |
| Development rules and execution contracts | `RULES.md` |
| Active/archived implementation plans | `PLANS.md` |
| UI brand, visual system, component style | `DESIGN.md` |
| Smoke test commands and manual route checks | `FRONTEND_SMOKE_TESTS.md` |
| Guest-facing i18n frontend instructions | `FRONTEND_GUEST_I18N_INSTRUCTIONS.md` |
| Backend proposal for GuestOS i18n | `BACKEND_GUEST_I18N_PROPOSAL.md` |

Rule: do not read all docs by default. Start with this file, then open only the doc matching the current task.

## 3. Core Principles

- Frontend apps own route composition, UI behavior, client interaction, display states, and API consumption.
- Backend services own business rules, authorization enforcement, persistence, domain workflows, contracts, and external provider integration.
- Pages compose product surfaces; features own domain-specific UI logic.
- API calls must go through feature services, core HTTP utilities, or route handlers.
- Runtime boundaries must be explicit: server, client, route handler, proxy, browser storage, and realtime.
- Reusable UI components must not depend on domain services.
- Architecture docs must avoid current-project snapshots that make the standard hard to reuse.

## 4. Standard App Structure

```txt
frontends/
└── [frontend-app]/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── core/
    │   ├── features/
    │   ├── generated/
    │   ├── lib/
    │   ├── providers/
    │   ├── configs/
    │   ├── types/
    │   └── proxy.ts
    ├── packages/
    ├── docs/
    ├── scripts/
    └── package.json
```

Only create folders that the app actually needs.

## 5. Layer Responsibilities

| Layer | Responsibility |
| --- | --- |
| `app/` | App Router route composition, layouts, route handlers, loading/error boundaries, and product surfaces. |
| `features/` | Domain-specific services, hooks, queries, state, types, utilities, and UI components. |
| `core/` | Cross-cutting infrastructure such as HTTP, errors, query setup, i18n, storage, and realtime primitives. |
| `components/` | Reusable UI primitives and shared presentation components. |
| `generated/` | Generated API contract types or generated client artifacts. |
| `providers/` | App-level React providers. |
| `configs/` | Environment and application configuration. |
| `lib/` | Small app-level utilities that do not belong to a feature or core infrastructure area. |
| `packages/` | Transport- and product-neutral packages that can be built and consumed outside VietSage. |
| `docs/` | Architecture, rules, guides, plans, design notes, smoke tests, and domain-specific instructions. |

## 6. Runtime Boundary Summary

Default to Server Components unless a component needs client-only behavior.

Use Client Components for browser APIs, event handlers, local interactive state, Zustand, TanStack Query hooks, realtime subscriptions, effects, or client navigation hooks.

Use Route Handlers for BFF/proxy endpoints, session-sensitive backend calls, cookie/session bridge behavior, and refresh-token rotation.

See `RUNTIME_UI_GUIDE.md` for detailed runtime, component, state, realtime, error, and i18n conventions.

## 7. Product Surface and Route Ownership

Before adding routes, define the product surface.

A product surface is a user-facing area with its own route ownership, access rules, shell, loading state, and error behavior.

Common surface types:

| Surface type | Typical responsibility |
| --- | --- |
| Public marketing | Landing pages, public content, contact pages. |
| Authentication | Login, registration, session entry points. |
| Admin | Privileged system administration workflows. |
| Manager/Owner | Business management dashboards and operational management. |
| Staff/Ops | Internal operational workflows. |
| Guest/Public app | Guest-facing or unauthenticated flows. |
| Internal API | Route handlers used as BFF/proxy/session bridges. |

Rules:

- Route groups should organize product surfaces, not unrelated implementation details.
- Authenticated surfaces should define layout, loading, error, and access behavior.
- Route pages should compose feature components rather than contain large business UI logic.

## 8. Feature Module Summary

Domain-specific frontend logic should live under `features/[feature-name]`.

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

Create only the folders needed by the feature. See `MODULE_GUIDE.md` for detailed folder responsibilities and extension workflow.

## 9. Data and API Flow Summary

```txt
Route / UI
  ↓
Feature Hook / Query Hook
  ↓
Resource
  ↓
Repository
  ↓
Core HTTP Utility or Route Handler
  ↓
Backend API
```

Rules:

- Do not introduce raw backend `fetch` calls in pages, layouts, or reusable UI components.
- Repositories own transport calls, DTO mapping, response transforms, and pagination normalization.
- Resources own stable keys, TanStack Query options, mutations, local invalidation, and cache operations.
- Feature hooks own permissions, feature flags, filter normalization, cross-resource coordination, and UI feedback.
- Components consume feature hooks; they do not know endpoints, DTOs, query keys, or invalidation rules.
- Backend-backed types should come from generated contracts or feature contract wrappers.
- Route Handlers should own session-sensitive proxy calls.
- Frontend must not duplicate backend business rules as the source of truth.

See `CONTRACT_GUIDE.md` for detailed API, contract, and auth/session integration rules.

## 10. Frontend and Backend Boundary

Frontend owns:

- UI rendering.
- Route composition.
- API consumption.
- User interaction state.
- Browser-specific behavior.
- Loading, empty, and display states.

Backend owns:

- Business rules.
- API and event contracts.
- Authorization and authentication enforcement.
- Data persistence and migrations.
- Domain workflows.
- External provider integration.

The frontend may hide unavailable actions for UX, but backend authorization remains the source of truth.

## 11. Rules Summary

- Keep pages thin.
- Keep domain UI logic in features.
- Keep API calls out of UI components.
- Keep reusable UI free of feature-service dependencies.
- Keep generated API contracts as the source of truth for backend-backed types.
- Keep server state out of client stores.
- Keep backend business rules out of frontend.
- Keep architecture docs generic and short.
- Keep detailed docs in the same `docs/` folder, referenced by the Docs Index.
