# ADR-003: Outbox Readiness Before Broker

Date: 2026-07-11
Status: Accepted

## Context

VietSage has request timelines, realtime notifications, Telegram callbacks, billing, and emergency workflows that may later need async delivery.

## Decision

Do not introduce Kafka, RabbitMQ, Redis streams, or a worker outbox by default. Define event envelope, idempotency, transaction boundary, and retry policy first; add async infrastructure only when there is a concrete requirement.

## Consequences

- Current system stays simpler and easier to operate.
- Event contracts can be introduced incrementally.
- Notification provider reliability can become the first extraction trigger if needed.
