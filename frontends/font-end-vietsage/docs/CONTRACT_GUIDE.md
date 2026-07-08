# Frontend API Integration Guide

## Purpose

This guide describes how frontend code should consume backend APIs, generated contracts, route handlers, and auth/session-sensitive flows.

## Standard API Flow

```txt
Route / UI
  ↓
Feature Hook or Query
  ↓
Feature Service
  ↓
Core HTTP Utility or Route Handler
  ↓
Backend API
```

## Contract Rules

- Generated API artifacts should live under `src/generated/`.
- Backend-backed feature types should use generated contracts or narrow wrappers around them.
- Do not invent response shapes that are not backed by a backend contract.
- Contract changes should be synchronized through the agreed API sync workflow before frontend assumptions change.

## HTTP Rules

- Do not introduce raw backend `fetch` calls in pages, layouts, or reusable UI components.
- Use feature services for domain API calls.
- Use core HTTP utilities for shared transport concerns.
- Use route handlers for BFF/proxy behavior and session-sensitive calls.
- Feature services should not contain UI display decisions.

## Auth and Session Rules

- Backend remains the authentication and authorization source of truth.
- Frontend session state is a UX/session bridge, not the security authority.
- Refresh tokens and cookie persistence must stay in server-safe boundaries.
- Do not rotate refresh tokens in arbitrary Server Components.
- Client components must not access backend refresh tokens directly.
- Route protection must be consistent with backend authorization.

## Error Contract Rules

- Map API/backend errors before displaying them to users.
- Do not show raw provider, database, or backend error objects directly.
- Preserve stable backend error codes/titles where the UI needs deterministic handling.
- UI copy for errors should be user-facing and localized when required.

## Anti-patterns

- Raw `fetch` scattered in components.
- Route handlers that duplicate feature service logic without a session/proxy reason.
- Frontend-only authorization as the only protection layer.
- Handwritten API types that drift from generated backend contracts.
