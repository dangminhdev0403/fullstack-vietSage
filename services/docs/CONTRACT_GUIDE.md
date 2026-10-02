# Backend Contract and Data Guide

## Purpose

This guide covers API contracts, authorization, data ownership, migrations, realtime, events, and external integrations.

## API Contracts

- OpenAPI is the HTTP contract source of truth.
- Controllers must use stable tags and response shapes.
- Route paths, security schemes, and response structures must not change silently.
- Consumers should integrate through documented APIs or events, not direct database access.
- Event contracts must define name, payload shape, version, retry behavior, and owner.

## Authorization

- Routes are private by default.
- Public routes must be explicitly allowlisted.
- Authorization must run at the API boundary before business logic.
- Frontend route gating is UX only; backend remains the enforcement authority.
- Route permission keys should be stable and based on method/path contracts when route-permission sync is used.
- Role APIs expose persisted `SYSTEM_TEMPLATE` or `CUSTOM` type. System templates are immutable.
- Permission mutation ceilings come only from the session-bound active role, never the union of a user's roles.

## Error Contracts

- Keep API error shapes stable.
- Redact sensitive fields.
- Do not leak raw provider/database errors to consumers.
- Validation, authorization, and domain errors should use consistent response formatting.

## Data Ownership

A service that owns tables owns:

- Schema definitions or equivalent models.
- Migration files.
- Seed data when required.
- Repository access patterns.
- Index strategy.
- Data lifecycle and retention rules.

## Migration Rules

- Use migration-based release flow.
- Do not use ad-hoc schema sync for production/release flow.
- List endpoints must have explicit bounded pagination.
- Indexes must match query patterns.
- Transaction boundaries must be intentional.
- Use transactions for multi-write operations that must be atomic.
- Avoid transactions for simple read endpoints and independent telemetry/logging writes.

## Realtime and External Integrations

- Do not introduce queues, brokers, cache, or service splits by default.
- Add asynchronous infrastructure only for a measured need.
- External provider calls must be wrapped by adapters/services, not controllers.
- Webhooks must validate provider authenticity where supported.
- Integration failures should be observable and should not leak provider internals to API consumers.

### Channex staging contract

- Hotel-scoped `RoomType` stores the publishable VND base price; `Room.price`
  remains an operational override. Existing name-keyed Channex mappings remain
  readable until explicit reconciliation; outbound rate paths fail closed when
  the exact type has no catalog price. New room type + room + QR writes share
  one transaction. Additive catalog migration precedes enabling these routes.
- Local reconciliation: run `node scripts/reconcile-room-types.cjs` from
  `services/auth-service` for a read-only preflight, then `--apply` only on the
  approved loopback `vietsage_auth`. It rejects price/name/mapping conflicts,
  links existing rooms, and rekeys local room/rate mappings without changing
  Channex IDs or dated overrides. Repeating the dry-run must report zero changes.
  Catalog creation rejects conflicting, missing, or mismatched legacy room prices;
  resolve these explicitly before setting a publishable base price. Rate-writing
  ARI validates every target rate-plan mapping before any availability/provider write.
  Staging and production need separate migration, backup, and cutover approval.
- The backend is the only holder of `CHANNEX_API_KEY`; frontend and BFF payloads never accept provider credentials.
- Content sync is idempotent through durable property, room-type, and rate-plan mappings. ARI sends availability and restrictions separately, filters past dates, compresses equal date ranges, and compares sampled live readback values.
- Incoming bookings use apply-then-ack. New multi-room bookings create one reservation segment per provider room inside one transaction; duplicate provider booking IDs are idempotent. Cancellations update all non-checked-in segments. Modifications are recorded as `RECONCILIATION_REQUIRED` instead of blindly rewriting live stays.
- The exact public webhook requires `X-Channex-Webhook-Secret`. Channex has no built-in HMAC signature; configure a long custom shared-secret header and HTTPS.
- The minute poller drains the account-wide revision feed as webhook backstop. A hotel-scoped manual poll filters by that hotel's mapped Channex property. The in-process overlap guard is sufficient for the current single backend runtime; use a shared lease before running multiple replicas.
- OTA setup uses Channex Channel IFrame with a 15-minute one-time token. Do not build or persist a parallel provider credential form in the browser.

## Anti-patterns

- Frontend-specific assumptions defining backend contracts.
- Database access from frontend or external consumers.
- Silent response shape changes.
- Public APIs without explicit security review.
- Provider SDK calls directly in controllers.
