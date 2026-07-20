# Frontend Runtime and UI Guide

## Purpose

This guide contains detailed runtime, component, state, realtime, error, loading, and i18n conventions.

## Server and Client Components

Default to Server Components.

Use Client Components only when the code needs:

- Browser APIs.
- Event handlers.
- `useState`, `useEffect`, or client navigation hooks.
- Zustand or another client store.
- TanStack Query hooks.
- Realtime sockets.

Client components must be explicit with `"use client"`.

## Component Ownership

| Component type | Location | Rule |
| --- | --- | --- |
| Route-local components | `src/app/**/_components` or colocated route files | Use only within that route area. |
| Feature components | `src/features/[feature]/components` | May use feature hooks/services. |
| UI primitives | `src/components/ui` | Must not import feature services or app routes. |
| Shared app components | `src/components/shared` or route-group `_components` | Shared presentation/shell logic. |
| Marketing components | `src/components/marketing` | Public marketing sections and shells. |

## State Ownership

| State type | Recommended owner |
| --- | --- |
| Server state | TanStack Query or server data loading. |
| URL/shareable state | Route params and search params. |
| Local UI state | React state. |
| Cross-component client state | Zustand or another explicit client store. |
| Session state | Auth/session provider. |
| Persistent browser state | Storage abstraction. |

Rules:

- Do not store server state in Zustand.
- Do not use TanStack Query for purely local UI state.
- Prefer URL state for shareable filters, pagination, and selected views.
- Browser storage must be wrapped by feature/core utilities.

## Workspace navigation and RBAC rendering

- The typed workspace registry owns persona aliases, dashboard definitions, labels, and nav order.
- Navigation is projected from the session-bound active role capabilities and explicit hotel ID;
  raw permission keys must never be used as user-facing labels.
- A view capability may render read-only content. Create, assign, revoke, and status controls render
  only when the matching manage capability is present.
- Tenant and hotel scope stay in URL/local query state. Do not load tenant staff before an explicit
  tenant is selected, and do not load hotel assignments before a hotel is selected.
- Frontend capability filtering improves clarity and request volume; it never replaces backend
  authorization.

## Realtime

- Isolate socket clients behind a feature or core realtime module.
- Components should subscribe through hooks, not direct socket instances.
- Realtime events should update or invalidate server-state caches when appropriate.
- Connection lifecycle, cleanup, reconnect behavior, and auth context must be centralized.

## Loading, Error, and Empty States

- Use route-level `loading.tsx` and `error.tsx` when a product surface needs its own boundary.
- Use component-level loading states for localized async sections.
- Empty states should guide user action.
- Do not display raw backend error objects directly.
- Use toasts for user-triggered action feedback, not as the only error boundary.

## I18n

- App-wide copy belongs in `core/i18n` or config-level i18n files.
- Feature-specific copy belongs in `features/[feature]/i18n`.
- Route-only copy may be colocated only when it is not reusable.
- Avoid hardcoding user-facing copy in large interactive flows.
