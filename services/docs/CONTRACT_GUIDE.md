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

### BCA connection identity

- Hotel-scoped connection responses add `username: string | null` from the encrypted saved credentials after the existing KBTT permission and hotel-access checks. Reads remain local and never authenticate with BCA. Decryption failure preserves stored status metadata and returns `username: null`. Keep `maskedUsername` for older clients; never return passwords, tokens or encryption fields.

### BCA background delivery

- `POST /hotels/:hotelId/kbtt/declarations/:occupantId/submit` validates locally and returns the existing declaration shape with `status: READY` and `providerCode: LOCAL_QUEUED`. It does not authenticate or transmit to BCA. Repeating the same queued request returns the same record; editing its draft removes it from the queue. The existing minute scheduler sends only records still queued at dispatch, using CAS and the existing delivery lease. An ambiguous transmission remains `UNKNOWN` for reconciliation.
- Check-in also queues initial declarations. The live auto-submit test action schedules the existing background run; dry-run remains local-only. The kill switch and live flag govern dispatch; the lifecycle flag independently governs extension/check-out/recovery work.
- Hotel automatic delivery shares one persisted `autoSubmitEnabled` switch between tenant and front desk. Private `GET /hotels/:hotelId/kbtt/auto-submit/enabled` returns `{autoSubmitEnabled:boolean}` with local-only reads (false when unconfigured); private `PUT` accepts exactly that boolean and changes no schedule/connection fields. Reads require a KBTT view or manage permission; writes require `hotel.kbtt.manage` or `hotel.kbtt.declarations.manage`, always followed by hotel-scope enforcement. The BFF exposes the same suffix under `/api/hotel-ops/hotels/:hotelId/kbtt`.
- Disabled hotels retain queued initial declarations and lifecycle work without authenticating or transmitting. Automatic daily/continuation/recovery runs skip dispatch; pausing an active run stops remaining guests and retains unsent work. A transmission already in flight may finish. Explicit tenant manual delayed runs and dry runs retain their existing semantics. `delivery.state` is `PAUSED` when the hotel switch is off. `PUT /auto-submit` accepts either or both configuration fields and preserves omitted values, so a schedule-only save cannot overwrite a newer switch change.
- `GET /hotels/:hotelId/kbtt/declarations` adds `delivery`: `{mode:'BACKGROUND', state:'RUNNING'|'PAUSED'|'NOT_CONFIGURED', lifecycleEnabled:boolean, pendingCount:number, sendingCount:number, reviewCount:number, lastSucceededAt:string|null, recentIssues:Array<{id:string,kind:'INITIAL'|'EXTEND'|'CHECKOUT'|'RECOVER',status:'FAILED'|'REJECTED'|'UNKNOWN'|'BLOCKED',roomNumber:string,fullName:string,message:string|null,updatedAt:string}>}`.
- Delivery monitoring reads only local state, includes departed stays, and follows the caller's hotel/room scope. PostgreSQL selects the latest state per guest/action, suppresses completed recovery/obsolete updates, aggregates counts and returns at most 20 recent issues. Last success includes initial and lifecycle sends. It exposes no payloads, identity documents, provider messages or credentials and makes no provider calls.

### BCA lifecycle and front desk validation

- Foreign residence validity must come from explicitly supplied data; never infer it from the hotel departure. Missing validity remains a local validation error before submission.
- BCA lifecycle routing compares Vietnam calendar days (`Asia/Ho_Chi_Minh`) for both guest kinds. An hour-only departure change on the acknowledged day sends nothing. A later departure day uses API 12/13 GH when the acknowledged day is today or later; when it is before today, a confirmed later day (today or later) goes directly to API 4/5 as a new declaration (RECOVER), preserving actual arrival and acknowledged identity. Initial dispatch and transactional claim guards compare the same calendar days. The domestic GH 30-day limit and independently confirmed foreign residence validity also use calendar days. Actual PMS timestamps and documented datetime wire fields remain intact. Do not probe GH or infer expiry from a disappearing web list. Repeated acknowledged target days are superseded; later expiry cycles remain possible. Timeout/unknown results block dependent delivery and are not retried blindly.
- Date reductions and extensions of checked-out/cancelled stays are rejected under the stay transaction lock before guest/stay/event writes. Same-date updates emit no extension event; new extensions must end in the future. Cleaning/ready/maintenance/blocked changes do not transmit guest updates. Completed checkout uses TS.
- Primary/co-guest birth dates supplied to create-stay and reservation check-in must be real calendar dates and not in the future; blank dates remain optional and a valid year-only value remains YYYY. At the BCA boundary, foreign year-only DOB is encoded as Y with YYYY-01-01; it is never labeled as a known full date. Check-in validates entered document/date values before confirmation.
- Local declaration GET accepts optional q (max 200), status (UNSENT, QUEUED, SUBMITTED, LOCAL_ERROR, REJECTED, SENDING, UNKNOWN, CANCELLED), nationality (VNM, FOREIGN), and checkInDate (valid YYYY-MM-DD in Vietnam time). Filters use projected draft values before pagination; totals are filtered. Delivery counters retain hotel/room scope. LOCAL_ERROR is distinct from a provider rejection. These are local reads, never BCA lookups.
- Existing invoice issue requests accept optional expectedBalanceAmount (finite, nonnegative). Front desk settlement checks the entered amount before issue; the server checks the authoritative invoice balance, including deposits, in its transaction. Once an invoice exists, settlement uses its total/paid/balance from the existing folio summary rather than subtracting booking deposits again. A mismatch returns CHECKOUT_BALANCE_CHANGED and rolls back. Existing callers omitting the field retain their behavior; payment confirmation still enforces full settlement.

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
  resolve these explicitly before setting a publishable base price.
- ARI validates every target rate-plan mapping before any PMS or provider write.
  Inventory rows expose one readiness source, `channexMappingBlockers`, using
  `PROPERTY_MAPPING_MISSING`, `ROOM_TYPE_MAPPING_MISSING`,
  `RATE_PLAN_MAPPING_MISSING`, or `MAPPING_CONFLICT`. Any blocker rejects every
  ARI mutation for that room type before the first PMS upsert. Mixed bulk requests
  fail wholly with HTTP `409` / `CHANNEX_MAPPING_REQUIRED`; the bounded public
  error metadata is `data.blockedRoomTypes`. ID-keyed mappings and compatible
  normalized-name legacy mappings are resolved together; disagreement fails closed.
- Staging and production need separate migration, backup, and cutover approval.
- The backend is the only holder of `CHANNEX_API_KEY`; frontend and BFF payloads never accept provider credentials.
- Content sync is idempotent through durable property, room-type, and rate-plan mappings. ARI sends availability and restrictions separately, filters past dates, compresses equal date ranges, and compares sampled live readback values.
- Incoming bookings use apply-then-ack. New multi-room bookings create one reservation segment per provider room inside one transaction; duplicate provider booking IDs are idempotent. Cancellations update all non-checked-in segments. Modifications are recorded as `RECONCILIATION_REQUIRED` instead of blindly rewriting live stays.
- The exact public webhook requires `X-Channex-Webhook-Secret`. Channex has no built-in HMAC signature; configure a long custom shared-secret header and HTTPS.
- The minute poller drains the account-wide revision feed as webhook backstop. A hotel-scoped manual poll filters by that hotel's mapped Channex property. The in-process overlap guard is sufficient for the current single backend runtime; use a shared lease before running multiple replicas.
- OTA setup uses Channex Channel IFrame with a 15-minute one-time token. Do not build or persist a parallel provider credential form in the browser.

### Channel Manager RBAC contract

- `hotel.channels.view` and `hotel.channels.manage` under `hotel-channels` domain define channel catalog, configuration, mapping, doctor, and synchronization authority.
- `TENANT_OWNER` is granted both channel permissions. `SUPER_ADMIN` retains platform authority through `platform.hotels.view` and `platform.hotels.manage`.
- `HOTEL_FRONTDESK` has no channel permissions (`hotel.channels.*`), but can read OTA bookings via `hotel.reservations.view`.
- Synthetic booking test tools (`simulateBooking`, `cancelSimulatedBooking`) are restricted to `platform.hotels.manage`.
- Inventory grid and availability/restriction updates remain under `hotel.rooms.view` and `hotel.rooms.manage`.
- `HotelAccessService.assertHotelAccess` remains mandatory on all hotel-scoped channel endpoints.

### Channel Manager Fleet API and Audit contract

- `GET /api/v1/channel-manager/admin/overview` exposes bounded Super Admin fleet visibility under `platform.hotels.view`.
- Zero remote Channex calls are permitted on the fleet list; all states are derived purely from local DB evidence.
- State priority:
  1. `UNCONFIGURED` (`PROPERTY_MISSING`) when no property mapping exists;
  2. `SETTING_UP` (`MAPPING_INCOMPLETE`) when property mapping exists but room type or rate plan mapping is missing;
  3. `INTERRUPTED` (`SYNC_FAILED` if latest sync failed, or `CONNECTION_INTERRUPTED` if any connection is non-active);
  4. `ATTENTION` (`RECONCILIATION_REQUIRED`) if pending inbound booking modifications exist or sync status is warning/partial;
  5. `ACTIVE` (primary issue code `null`) when fully mapped and healthy.
- Summary metrics (`totalHotels`, `configuredHotels`, `activeHotels`, `needsAttention`, `unconfiguredHotels`, `pendingReconciliations`) cover the search-filtered population unconstrained by table pagination.
- Sensitive mutations (content sync, property configuration, channel create/update/activate/deactivate/delete, full sync, feed recovery, and manual reconciliation) record append-only actor audit in `AuditLog` attributing `actorId`, `tenantId`, and `hotelId`.
- Sensitive fields (`apiKey`, `token`, `secret`, `webhookSecret`, `iframeUrl`, `credentials`, raw error objects) are strictly redacted before audit insertion. Failed provider calls never emit successful audit entries.

## Anti-patterns

- Frontend-specific assumptions defining backend contracts.
- Database access from frontend or external consumers.
- Silent response shape changes.
- Public APIs without explicit security review.
- Provider SDK calls directly in controllers.
