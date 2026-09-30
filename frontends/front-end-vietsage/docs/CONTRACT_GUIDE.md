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
- Identity-document OCR uses the hotel-scoped authenticated BFF and the internal production OpenMRZ service; browsers never call an OCR host directly.
- Feature services should not contain UI display decisions.

## Auth and Session Rules

- Backend remains the authentication and authorization source of truth.
- Frontend session state is a UX/session bridge, not the security authority.
- Server-rendered management workspaces load `GET /auth/me` through the auth feature service and
  treat `activeRole`, `permissions`, and `accessibleHotels` as one fail-closed context.
- Do not merge capabilities from the compatibility `roles` list. Use only the session-bound
  `activeRole` capability set returned by the backend.
- Do not persist the full capability or hotel-scope payload in the Auth.js cookie. Resolve it in a
  server-only boundary and require an explicit hotel ID from route or URL state.
- Refresh tokens and cookie persistence must stay in server-safe boundaries.
- Do not rotate refresh tokens in arbitrary Server Components.
- Client components must not access backend refresh tokens directly.
- Route protection must be consistent with backend authorization.

## Error Contract Rules

- Map API/backend errors before displaying them to users.
- Do not show raw provider, database, or backend error objects directly.
- Preserve stable backend error codes/titles where the UI needs deterministic handling.
- UI copy for errors should be user-facing and localized when required.

## KBTT Connection (Phase 1)

- BFF: `/api/hotel-ops/hotels/{hotelId}/kbtt/connection` supports GET, PUT, DELETE; POST uses `/connection/check` (with backwards-compatible `/api/owner` proxy). Backend paths omit `/api/hotel-ops` or `/api/owner`.
- GET reads stored status only. Provider authentication/checks happen only after an explicit connect, check, or re-login action; no polling, background reconnect, or guest submission.
- Read capability: `hotel.kbtt.view`; write capability: `hotel.kbtt.manage`. Navigation also accepts `hotel.dashboard.view` for active-session compatibility; this does not grant API access.
- PUT accepts only username (trimmed, 1–120 characters) and password (1–256 characters, whitespace preserved). Password is never prefilled, persisted to browser storage, or returned; completed mutation variables are scrubbed.
- Responses contain only the confirmed KBTT status/CSLT metadata contract. Unknown fields are stripped; provider errors are translated through an allowlist; BFF responses use `Cache-Control: no-store`.
- Focused contract check: `node --test src/features/kbtt/kbtt-contract.test.mjs`.

## KBTT Declaration States

- Declaration status preserves `DRAFT`, `READY`, `SENDING`, `SUBMITTED`, `FAILED`, `UNKNOWN`, and `CANCELLED`; derived status additionally supports `MISSING_PROFILE`. List and detail contracts must accept the same backend states without coercing failures into drafts or success.
- Normal UI submission allows only missing profiles, drafts, ready declarations, or corrected failures. Public draft-save and submit operations reject `SENDING`, `UNKNOWN`, and `CANCELLED` with HTTP 409 / `KBTT_DECLARATION_LOCKED`, before changing data or contacting BCA. Unknown outcomes require reconciliation, not blind resubmission.
- Loading, failed reads, empty pages, and empty filtered results never imply successful submission. Success banners describe only the loaded page and require every row on that page to be `SUBMITTED`; filters must not change that conclusion. Client submission pauses while list data is unavailable or refreshing.

## Public LocalMate chat

- `/trangchu` calls same-origin `POST /api/localmate/public-chat`; browser code never receives the n8n webhook URL, chat key, or Knowledge API key.
- The BFF accepts a bounded message, stated location, supported locale, and at most eight bounded recent chat entries; it applies request-size and rate limits before forwarding server-to-server.
- Recent chat is untrusted conversational context only. The current Knowledge API result remains the sole factual source for every turn.
- The public n8n flow has no hotel or guest-session context. Missing location produces a follow-up question; supplied location is forwarded as `destination`, while the backend remains canonical for destination/province resolution and knowledge filtering.
- Empty knowledge returns deterministic clarification without spending a model call. Ambiguous grounded questions may ask one clarification with up to three suggestions.
- Public responses expose only `reply`, up to three follow-up `suggestions`, `knowledgeVersion`, and `cached`; `action` is always `null`.

## Channex channel manager

- `/channel-manager` consumes same-origin role-scoped BFF routes through the channel-manager repository/resource/hooks. Browser payloads never contain `CHANNEX_API_KEY` or the webhook secret.
- Platform admins run idempotent Content Sync. Admin/owner users edit and save PMS ARI before explicitly pushing it to Channex. Readback is displayed as matched only when sampled availability and rate/restriction values equal the values sent.
- The OTA tab reads the complete provider catalog from Channex `GET /channels/list` and connected-channel status from property-scoped `GET /channels`; do not hardcode a small test-provider list.
- Adapters using the common `room_rate_multioccupancy` contract and known rate fields render a native dynamic wizard from `params`/`rate_params`: test connection, load mapping details, map local rate plans, create inactive, run readiness, then require a separate confirmed activation. OAuth/listing/tree or unknown mapping fields fall back to the official Channex iframe. The one-time iframe URL stays only in component state; it is never stored in local/session storage.
- Manual booking-feed polling, Doctor results, and raw mappings stay under admin operational tools. The backend minute poller and authenticated webhook are the normal inbound paths.
- Real inbound certification tests use Channex Booking CRS or an official OTA test channel; the normal UI does not present PMS-local synthetic reservations as Channex-created bookings.
- A provider modification creates a reconciliation warning; staff must review it instead of the UI claiming that dates were automatically changed.

## Anti-patterns

- Raw `fetch` scattered in components.
- Route handlers that duplicate feature service logic without a session/proxy reason.
- Frontend-only authorization as the only protection layer.
- Handwritten API types that drift from generated backend contracts.
