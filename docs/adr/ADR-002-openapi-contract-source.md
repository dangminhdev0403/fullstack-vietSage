# ADR-002: Generated OpenAPI Is HTTP Contract Source

Date: 2026-07-11
Status: Accepted

## Context

Manual endpoint docs can drift from controllers and schemas.

## Decision

Generated OpenAPI from `services/auth-service` is the HTTP contract source of truth. Root API docs describe policy and runtime notes, not a full duplicated endpoint catalog.

## Consequences

- Frontend and shared contract consumers should use exported OpenAPI.
- HTTP behavior changes require OpenAPI export and contract verification.
- Manual docs should focus on architecture, rules, and migration notes.
