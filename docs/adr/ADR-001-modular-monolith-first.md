# ADR-001: Modular Monolith First

Date: 2026-07-11
Status: Accepted

## Context

VietSage currently runs as one backend API under `services/auth-service`, but the product scope now includes hotels, guest operations, billing, emergency workflows, notifications, and identity/access control.

Some older docs implied a microservice layout. The DOCX architecture proposal recommends not rebuilding and not splitting services prematurely.

## Decision

Keep VietSage as a modular monolith while domain boundaries evolve. Strengthen module boundaries, contracts, and tests before any service extraction.

## Consequences

- Faster refactor with lower operational risk.
- Cross-module transactions remain simple while workflows are still evolving.
- Future extraction remains possible because ownership, ports, and contracts are documented.
- Service rename/extraction must be separate approved phases.
