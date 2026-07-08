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

## Anti-patterns

- Frontend-specific assumptions defining backend contracts.
- Database access from frontend or external consumers.
- Silent response shape changes.
- Public APIs without explicit security review.
- Provider SDK calls directly in controllers.
