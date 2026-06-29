# VietSage Service Boundary

## Current Direction

Use modular monolith first inside `services/auth-service`, while keeping domain boundaries ready for a future service split.

## Why

The current backend is a NestJS starter. Splitting into deployed microservices now would add network, transaction, deployment, and observability complexity before the domain model is stable.

## Boundaries

### Auth / Identity

Owns:
- Users
- Credentials
- Roles
- Access token issuing
- Auth guards

Does not own:
- Room lifecycle
- Service request workflow
- Admin operational metrics

### Hotel Context

Owns:
- Hotel metadata
- Rooms
- Guest stay/session binding

Does not own:
- User credentials
- Request status workflow

### Service Requests

Owns:
- Service categories
- Guest requests
- Request status transitions
- Request timeline/events
- Staff queue filters

Does not own:
- Password/session management
- Room master data except references

### Admin Reporting

Owns:
- Read-only operational aggregation
- KPI calculation

Does not own:
- Source-of-truth writes for request lifecycle

## Dependency Rules

- Controllers depend on application services only.
- Application services orchestrate domain rules and repositories.
- Domain code does not depend on NestJS transport concerns.
- Infrastructure implements persistence and external integrations.
- No circular module dependency.
- No business logic in controllers.

## Data Ownership

When split later:
- Auth service owns user identity database.
- Hotel service owns room/stay database.
- Request service owns request/event database.
- Reporting reads from events/projections, not by owning operational writes.

For V1 modular monolith:
- One PostgreSQL database is acceptable.
- Keep table ownership clear by module.
- Do not create cross-module writes without an application-level use case.

## Transaction Boundaries

Use DB transaction for:
- Create service request + first request event.
- Update service request status + append request event.
- Create guest stay + required room occupancy update if implemented together.

Avoid transaction for:
- Simple read endpoints.
- Dashboard aggregation reads.
- Independent logging/telemetry.

## Cache Boundary

No Redis/cache by default.

Only introduce cache when:
- A real measured bottleneck exists.
- Query/index optimization is not enough.
- Cache key, TTL, invalidation, and stale-data risk are documented.
