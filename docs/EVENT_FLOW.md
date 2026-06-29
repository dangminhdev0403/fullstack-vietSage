# VietSage Event Flow

## Purpose

Keep service request tracking auditable and ready for async/event-driven processing later.

## V1 Approach

Use synchronous database writes with an event/history table. Do not introduce a message broker until there is a real async scaling need.

## Request Created Flow

```txt
Guest submits request
  -> Guest API validates active stay
  -> Service Request application service starts transaction
  -> Insert service_requests row with PENDING status
  -> Insert service_request_events row with REQUEST_CREATED event
  -> Commit transaction
  -> Return request summary
```

Transaction boundary:
- `service_requests` insert and first `service_request_events` insert must commit together.

## Request Status Updated Flow

```txt
Staff updates request status
  -> Staff API validates role
  -> Application service validates allowed status transition
  -> Start transaction
  -> Update service_requests.status
  -> Insert service_request_events row with STATUS_CHANGED event
  -> Commit transaction
  -> Return updated request summary
```

Transaction boundary:
- Status update and event append must commit together.

## Guest Tracking Flow

```txt
Guest opens tracking screen
  -> API validates guest owns active stay/request
  -> Read service request
  -> Read request events ordered by created_at ASC
  -> Return current status + timeline
```

Query optimization:
- Use `service_requests.room_id, created_at` index for guest history.
- Use `service_request_events.request_id, created_at` index for timeline.

## Staff Queue Flow

```txt
Staff opens dashboard/requests
  -> API validates STAFF or ADMIN role
  -> Query service_requests by status/priority/created_at
  -> Join/select room and category summary only
  -> Return paginated result
```

Query optimization:
- Use `service_requests.status, priority, created_at` index.
- Avoid N+1 queries by selecting required related fields in one Prisma query.

## Future Async Events

Potential future events:
- `service_request.created`
- `service_request.status_changed`
- `guest_stay.checked_in`
- `guest_stay.checked_out`

Do not add Kafka/RabbitMQ/Redis streams in V1. Add a broker only when there is a concrete cross-service async requirement.

## Observability

Each request-changing operation should record:
- request id
- actor user id
- previous status
- next status
- request id/correlation id from HTTP context
- timestamp

OpenTelemetry spans should wrap:
- HTTP request handling
- application use case
- database query/transaction
