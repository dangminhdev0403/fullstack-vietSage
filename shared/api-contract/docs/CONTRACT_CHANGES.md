# Contract Changes

## Unreleased

- Hardened stay-scoped room messages:
  - `GET /hotels/{hotelId}/messages` now returns only threads whose related `GuestStay` is `ACTIVE`
    with `checkedOutAt = null`, ordered newest first with `cursor`/`nextCursor` pagination.
  - `GET`, guest send, staff reply, and read-receipt operations enforce the same active-stay
    predicate; room status is not a conversation or existing GuestOS-session lifecycle condition.
  - Added `POST /hotels/{hotelId}/messages/{threadId}/read` and
    `POST /guest/messages/read`.
  - Removed `PATCH /hotels/{hotelId}/messages/{threadId}/clear`.
  - Thread projections now include `stayId`, room metadata, and staff unread count; messages include
    `readAt`.
  - OpenAPI export contains 88 paths and frontend generated API types were synchronized.

- Added `RoomStatus.BLOCKED`. A blocked room cannot be assigned to a reservation or checked in
  until staff or an owner changes it back to an operational room status. Room status updates reject
  lifecycle-only states and refuse to block a room with an active stay.

- Staff hotel operations sync:
  - `GET /hotels/{hotelId}/requests` and `/requests/summary` accept `q` for scoped staff search.
  - Staff request event creation accepts `visibility` (`GUEST` or `INTERNAL`); GuestOS timelines
    expose only guest-visible staff events.
  - Folio list status filtering now accepts the persisted `FolioStatus` enum, including
    `CHECKOUT_PENDING` and `VOID`.
  - OpenAPI export now contains 82 paths and frontend generated API types were synchronized.
- Standardized new tenant-scoped hotel and staff-management calls on `x-tenant-id`. Existing
  `tenantId` query/body inputs remain deprecated compatibility fallbacks for one release cycle;
  backend membership and resource guards continue to validate all tenant hints.
- Added a lightweight Admin tenant-options projection and bounded tenant/hotel/search/page inputs
  for staff-directory queries. Staff mutation bodies no longer carry tenant ownership as business
  data.

- Added tenant-scoped hotel staff administration contracts: managed role discovery plus hotel staff
  assignment list/assign/revoke. The contracts require the session-bound active role, business
  capability checks, and Property resource access checks.
- Added `hotel.staff.view` and `hotel.staff.manage`; migration `0034_workspace_role_capabilities`
  applies one-time built-in role presets without re-granting later administrator revocations.
- Added `activeRole` to `GET /auth/me`. Its `menus` and `permissions`, plus route/business capability authorization, now use only the role bound to the authenticated session instead of merging every active user role; `roles` remains the complete compatibility list and no active hotel is inferred.
- Added Front Desk reservation lifecycle endpoints: `POST /hotels/{hotelId}/reservations`, `GET /hotels/{hotelId}/arrivals`, `PUT /hotels/{hotelId}/reservations/{reservationId}/room`, and `POST /hotels/{hotelId}/reservations/{reservationId}/check-in`. Reservations may be created without a room; room assignment requires an available, non-overlapping room. Check-in requires a usable room QR and no active stay/blocking folio, then transactionally creates an active stay and open folio, activates GuestOS access/QR, emits check-in events, and moves the room to `OCCUPIED`; serializable conflicts are retried and translated to stable `409` responses.
- Added additive `Reservation` persistence with `CONFIRMED -> ARRIVAL_READY -> CHECKED_IN` lifecycle and an optional unique link from `GuestStay` for compatibility with legacy stay endpoints.
- Added `hotel.reservations.view` and `hotel.reservations.manage` business capabilities. They are fail-closed; migration `0034_workspace_role_capabilities` applies one-time defaults to built-in Owner, Manager, and Front Desk roles, after which administrator changes are preserved.
- Corrected `GET /auth/me` runtime output to include deduplicated `permissions` from active role grants and `accessibleHotels` from active hotel assignments constrained by active tenant memberships; clients must explicitly select hotel context.
- Checkout safety semantics: `POST /hotels/{hotelId}/folios/{folioId}/checkout/issue-invoice` now validates folio freshness before issuing/reusing an invoice and moves an open folio to `CHECKOUT_PENDING`; checkout side effects (folio close, stay checkout/access revocation, room `PROCESSING`, active QR deactivation) occur only after a verified `payment.succeeded`/`payment.success` webhook. `POST /payments/webhook/{provider}` bypasses JWT only for the exact provider path and requires `X-VietSage-Payment-Webhook-Secret`.
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
