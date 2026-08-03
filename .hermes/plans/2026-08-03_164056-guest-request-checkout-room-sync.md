# Guest Request, Checkout Reconciliation, and Room Sync

## Goal
Preserve operational acknowledgement, safely reconcile unfinished service requests at checkout, and update every room/billing surface immediately after payment without F5.

## Confirmed baseline
- Required lifecycle is `CREATED -> ACKNOWLEDGED -> IN_PROGRESS -> COMPLETED`; terminal alternatives: `CANCELLED`, `FAILED`.
- Current dirty work incorrectly collapses `ACKNOWLEDGED/IN_PROGRESS` into `CREATED`; do not build on or discard it blindly.
- Payment already atomically closes invoice/folio/stay/session and sets room `PROCESSING`.
- Current frontend adds broad invalidation, but stale behavior needs exact query-key/runtime proof.
- Urgent SLA escalation/polling is not implemented.

## Constraints
Preserve all dirty/untracked work and identify provenance before edits. One writer. TDD. No dependency/package, broad refactor, commit, push, deploy, or production action. Keep Guest Operations, Billing, Property boundaries explicit.

## Phase 1 — Restore request lifecycle
1. Write RED backend/frontend contract tests for all canonical states and transitions.
2. Restore normalization, Zod/OpenAPI/frontend types, labels, filters, actions, realtime payloads, and timeline semantics.
3. Remove/replace the incorrect `simplify-feedback-statuses` test and stale completed-plan claims; do not remove legacy DB enum values this release.
4. Reception acceptance persists actor/time (`ACKNOWLEDGED`); start persists `IN_PROGRESS`; completion persists `COMPLETED`.

## Phase 2 — Urgent handling
1. Keep `URGENT` as priority, not a separate status.
2. Immediate visible/audio/realtime alert; persisted business ACK remains truth.
3. Define configurable ACK deadline and overdue indicator/escalation using existing scheduler/notification infrastructure; no broker.
4. Reconnect/fallback HTTP refresh must recover missed socket delivery.
5. Test hotel isolation, dedupe, permission, ACK timing, overdue escalation, and checked-out suppression.

## Phase 3 — Checkout service reconciliation
1. Extend checkout validation/read model to return active requests for the stay (`CREATED`, `ACKNOWLEDGED`, `IN_PROGRESS`) with price/billing evidence.
2. Before invoice issue, show an inline reconciliation gate per request:
   - `provided`: mark `COMPLETED`, include one idempotent service charge;
   - `not_provided`: keep open, exclude from invoice, block checkout until explicitly deferred by allowed policy;
   - `cancelled`: mark `CANCELLED`, exclude charge, require reason.
3. Never infer delivery from `IN_PROGRESS`; never silently charge or auto-complete by timeout.
4. Keep operational status separate from billing status/source linkage. Prevent duplicate charge by stable request/source ID.
5. Execute request resolution + folio item reconciliation + invoice snapshot under a concurrency-safe transaction/idempotency boundary. Reject stale/replayed choices with actionable Vietnamese inline errors.
6. Preserve audit actor/time/reason and immutable issued invoices.

## Phase 4 — Eliminate post-payment F5
1. Reproduce and classify: mutation 2xx, DB room `PROCESSING`, subsequent GET, active query key, server component props, navigation/tab behavior.
2. Write RED integration/component tests: pay -> invoice/folio closes -> room list/grid/billing queue update immediately.
3. Use resource-generated keys only. After success, update/remove exact active billing and room caches, then await scoped invalidation/refetch. Avoid catch-all `["vietsage"]` invalidation as the fix.
4. Ensure staff rooms, owner rooms/stay grid, folio queue, invoice detail, dashboard projections, and realtime reconnect consume fresh server truth.
5. Handle inactive queries/navigation via invalidation plus `router.refresh`; handle active queries via awaited refetch/cache update. Prevent stale Server Component props from overwriting fresh client cache.
6. Publish a post-commit checkout/payment room-change refresh signal where existing event infrastructure supports it; HTTP remains truth.

## Likely working set
- `services/auth-service/src/modules/guest-operations/{domain,application,infrastructure,tests}/**`
- `services/auth-service/src/modules/billing/{application,infrastructure,tests}/**`
- `services/auth-service/src/modules/property/{application,infrastructure,tests}/**`
- relevant Prisma additive migration only if persisted ACK/SLA/billing linkage is missing
- request queue/detail, GuestOS request display/contracts
- billing invoice/workspace clients and BFF routes
- staff/owner room resources, hooks, grids, invalidation/realtime utility
- OpenAPI/generated types and canonical event/plan docs

## Validation
- RED/GREEN focused request transition, urgent, checkout, billing idempotency, and room projection suites
- Prisma validate/generate and migration topology checks if schema changes
- OpenAPI export, contract verification, generated frontend type sync
- Frontend focused tests, TypeScript, scoped ESLint, production build
- Authenticated runtime marker: request -> ACK -> IN_PROGRESS -> checkout reconcile -> pay -> room shows `PROCESSING` across affected views without F5
- Reconnect/missed-event recovery and duplicate-submit tests
- Scoped diff/provenance review; Graphify refresh + bounded Repomix regeneration after completion

## Acceptance
- Reception acknowledgement remains visible/auditable.
- Urgent requests require ACK and expose overdue escalation.
- Unfinished requests cannot be silently charged or lost at checkout.
- Payment closes financial/stay state atomically and room becomes `PROCESSING`.
- All room/billing views show committed state without manual refresh.
- No duplicate service charge, cross-hotel cache update, lost dirty work, or unrelated change.
