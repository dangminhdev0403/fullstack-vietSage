# Contract Changes

## Unreleased

- Added protected `POST /hotels/{hotelId}/request-realtime-ticket`, returning only a short-lived `ticket` and `expiresAt` after hotel access authorization.
- Owner tickets use audience `request-realtime` and type `request_realtime_owner`; Socket.IO authentication now uses `handshake.auth` for owners and guests, with no join-event authentication fallback.
- Disabled ticket issuance returns `503`; frontend rollback uses `NEXT_PUBLIC_REQUEST_REALTIME_ENABLED=false`.

- Guest request list, detail, mutation, summary, and realtime-facing schemas now expose only the
  six canonical statuses: `CREATED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and
  `FAILED`.
- Legacy persisted statuses remain accepted internally during the compatibility release and are
  normalized before API output.

## 0.2.0

- Added session-backed authentication with access JWT `sid` claims and opaque rotating refresh tokens.
- Added `accessExpiresAt`, `refreshExpiresAt`, and `sessionId` to auth token responses.
- Added optional refresh `Idempotency-Key`, replay detection, private session logout, and `POST /auth/logout-all`.
- Retained one-time legacy refresh JWT migration during the configured compatibility window.

## 0.1.1

- Added `API_CATALOG.md` with module-level request/response contract for frontend integration.
- Documented success/error envelopes and public/private route behavior.

## 0.1.0

- Initialized shared API contract package.
- Added OpenAPI export pipeline from `services/auth-service`.
- Added verification and SDK preparation scripts.
