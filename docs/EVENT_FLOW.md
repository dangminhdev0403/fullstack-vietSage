# VietSage Event Flow

## Purpose

Keep guest/service workflows auditable while staying ready for async/event-driven processing later. V1 remains synchronous and database-backed; do not introduce a broker without a concrete need.

## Current approach

Use synchronous database writes with event/history tables and in-process publication where needed. Guest request realtime fan-out now goes through the shared `GuestRequestEventPublisher` port; domain modules must not call the Socket.IO emitter directly.

Request realtime transport authenticates at the Socket.IO handshake. Owner browsers obtain a short-lived, hotel-scoped ticket through the same-origin BFF; the backend uses the dedicated `request-realtime` audience and derives the room only from signed claims. Guest sockets use the current guest session token and derive their room from the authenticated session. Backend and frontend feature flags default false as the rollback path, producing no browser ticket or socket activity.

Polling, an outbox dispatcher, durable retry/backoff delivery, urgent SLA escalation, and a broker remain Batch D and are not implemented here.

```txt
HTTP request
  -> Controller validates request shape
  -> Application service validates authorization/resource access
  -> Transaction writes state change + event/history row where required
  -> Commit
  -> GuestRequestEventPublisher publishes in-process realtime/provider notifications when needed
  -> Return HTTP response
```

## Guest request lifecycle compatibility

The public GuestOS lifecycle is exactly `CREATED -> ACKNOWLEDGED -> IN_PROGRESS -> COMPLETED`.
Guests may cancel only from `CREATED`; staff may cancel from `CREATED` or `ACKNOWLEDGED`, and
may mark a request `FAILED` only from `IN_PROGRESS`.

During the compatibility release, persisted legacy values are normalized at application
boundaries: `NEW -> CREATED`, `CONFIRMED|ACCEPTED -> ACKNOWLEDGED`,
`PENDING|ON_THE_WAY -> IN_PROGRESS`, and `REJECTED -> FAILED`. Staff default queues include
canonical and equivalent legacy active rows, while HTTP and realtime payloads expose only the
six canonical statuses. Migration `0031_guest_request_canonical_status_compatibility` rewrites
request and timeline status columns and changes the request default to `CREATED` without removing
legacy enum values. New request, initial timeline, and domain event writes remain one transaction.

## Standard event envelope

Any cross-context or future async event should use a versioned envelope:

```ts
interface DomainEventEnvelope<TPayload> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: string;
  correlationId?: string;
  actor?: {
    type: "guest" | "staff" | "system";
    id?: string;
  };
  payload: TPayload;
}
```

Rules:

- Event type is stable, e.g. `guest_request.created`.
- Payload is explicit and versioned.
- Do not expose Prisma model objects as event payloads.
- Use correlation/request id when available.
- Consumers must be idempotent before async delivery is introduced.

## Request Created Flow

```txt
Guest submits request
  -> Guest API validates active stay/session
  -> Guest Operations service starts transaction
  -> Insert guest request row
  -> Insert guest request event row with REQUEST_CREATED
  -> Commit transaction
  -> Publish in-process notification intent if needed
  -> Return request summary
```

Transaction boundary:

- `guest_requests` insert and first `guest_request_events` insert must commit together.

## Request Status Updated Flow

```txt
Staff updates request status
  -> Staff API validates role and hotel access
  -> Application service validates allowed transition
  -> Start transaction
  -> Update guest_requests.status
  -> Insert guest_request_events row with STATUS_CHANGED
  -> Commit transaction
  -> Publish in-process realtime/provider notification if needed
  -> Return updated request summary
```

Transaction boundary:

- Status update and event append must commit together.

## Guest Tracking Flow

```txt
Guest opens tracking screen
  -> API validates guest owns active stay/request
  -> Read request
  -> Read request events ordered by created_at ASC
  -> Return current status + timeline
```

Guest-facing tracking reads only staff events marked `visibility = GUEST`. Internal staff notes,
assignment comments, and operational handoff events use `visibility = INTERNAL` and remain in the
staff audit trail without being returned to GuestOS or pushed through guest realtime.

## Staff Queue Flow

```txt
Staff opens dashboard/requests
  -> API validates staff permission and hotel access
  -> Query guest_requests by status/priority/created_at
  -> Select room/stay/category summary only
  -> Return paginated result
```

Staff queue search accepts a scoped `q` filter over request text, room, stay guest, guest phone,
reservation code, service item, and category. Assignment targets must belong to the same hotel via
an active hotel staff assignment.

## Checkout Completion Flow

```txt
Staff issues invoice
  -> Backend recalculates folio and marks the stay checkout-pending
  -> Staff records successful payment or zero-balance settlement
  -> Backend closes invoice and folio
  -> Backend checks out stay and revokes GuestOS access
  -> Backend deactivates active room QR
  -> Backend moves the room to processing
```

## Future async events

Potential future events:

- `guest_request.created`
- `guest_request.status_changed`
- `guest_stay.checked_in`
- `guest_stay.checked_out`
- `payment.succeeded`
- `emergency_incident.created`
- `notification.delivery_failed`

## Guest stay message flow

Guest-to-front-desk messages are a short-lived, stay-scoped conversation rather than a guest
profile inbox. Conversation existence is decided only by the related `GuestStay`: `status = ACTIVE`
and `checkedOutAt IS NULL`. `Room.status` must never decide whether a conversation is visible;
Room is joined only for room number, floor, and type metadata.

```txt
Guest or front desk sends message
  -> API validates active guest session or hotel staff access
  -> Transaction rechecks active GuestStay for the exact stay/hotel/room
  -> Upsert the stay's message thread
  -> Append immutable message row
  -> Update thread last-message timestamp
  -> Commit transaction
  -> Publish guest_message.created to hotel staff and the exact guest-stay socket room
  -> UI upserts the waiting list and matching open thread
```

The staff inbox uses a stable `(lastMessageAt, id)` cursor ordered newest first. Realtime is the
primary refresh path; bounded 30-second polling is recovery only. Read receipts update
`GuestMessage.readAt` without changing thread order.

```txt
Checkout transaction commits GuestStay as checked out
  -> Guest sessions and room QR are revoked in the same checkout flow
  -> After commit, publish conversation.closed for hotelId + stayId + roomId
  -> Staff removes that stay from the waiting list
  -> If staff or guest is viewing it, UI disables sending and shows the ended-session state
```

Direct checkout, zero-balance settlement, and successful payment-webhook checkout must all publish
`conversation.closed` only after their transaction commits. Socket delivery is a UX optimization;
every list/get/send/reply/read API independently enforces the active-stay predicate. Threads carry
`expiresAt = planned checkout + 14 days` for operational cleanup, but checked-out history is not
returned to staff or a later guest in the same room.

Do not add Kafka/RabbitMQ/Redis streams in V1. Add a broker or outbox worker only after delivery retries, cross-service isolation, or throughput needs are documented.

## Outbox readiness

Before adding an outbox worker:

- define event envelope and versioning;
- define retry/backoff/dead-letter behavior;
- define idempotency key per consumer;
- decide retention and replay policy;
- add observability around publish attempts and lag;
- verify transaction boundary with state change.

## Observability

Each request-changing operation should record:

- request/correlation id;
- actor id and actor type;
- hotel/tenant/resource id when applicable;
- previous and next status;
- timestamp;
- provider delivery result if any.
