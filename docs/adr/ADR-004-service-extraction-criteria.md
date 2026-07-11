# ADR-004: Service Extraction Criteria

Date: 2026-07-11
Status: Accepted

## Context

A modular monolith can become a microservice architecture later, but premature extraction increases operational complexity.

## Decision

Extract a context only when there is documented evidence of independent scaling, deployment, reliability, security, team ownership, stable contracts, stable data ownership, and operational readiness.

## Consequences

- Module size alone is not enough to extract a service.
- Notifications and billing are likely earlier candidates than property/guest operations.
- `auth-service` rename is separate from service extraction.
