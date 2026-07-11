# VietSage Event Flow

## Purpose

Keep guest/service workflows auditable while staying ready for async/event-driven processing later. V1 remains synchronous and database-backed; do not introduce a broker without a concrete need.

## Current approach

Use synchronous database writes with event/history tables and in-process publication where needed. Guest request realtime fan-out now goes through the shared `GuestRequestEventPublisher` port; domain modules must not call the Socket.IO emitter directly.

```txt
HTTP request
  -> Controller validates request shape
  -> Application service validates authorization/resource access
  -> Transaction writes state change + event/history row where required
  -> Commit
  -> GuestRequestEventPublisher publishes in-process realtime/provider notifications when needed
  -> Return HTTP response
```

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

## Staff Queue Flow

```txt
Staff opens dashboard/requests
  -> API validates staff permission and hotel access
  -> Query guest_requests by status/priority/created_at
  -> Select room/stay/category summary only
  -> Return paginated result
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
