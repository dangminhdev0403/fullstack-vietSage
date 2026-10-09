# VietSage Service Evolution

## Decision

VietSage remains a modular monolith until a concrete extraction trigger exists. The current deployed backend is the core API at `services/auth-service`.

## What does not justify extraction by itself

- A module has many files.
- A folder name is historically inaccurate.
- A future architecture diagram shows possible services.
- A feature feels important.
- An AI-generated plan says microservices are cleaner.

## Extraction triggers

A context may be extracted only when at least one of these is true and documented:

| Trigger | Evidence required |
| --- | --- |
| Independent scaling | Metrics show one context has different CPU/memory/traffic profile. |
| Independent deployment | Team/release cadence conflicts are measurable. |
| Reliability isolation | Provider retries/failures need separate queues/workers/SLOs. |
| Security isolation | Secrets/data/regulatory boundary cannot share the core API runtime. |
| Stable contract | OpenAPI/event contract has been stable across releases. |
| Stable data ownership | Tables and transactions no longer require frequent cross-context writes. |
| Operational maturity | Health checks, logs, migrations, rollback, observability, and on-call ownership are defined. |

## Current direction

No context is scheduled for extraction. Keep one Core API and one PostgreSQL database. A future
proposal must bring measured evidence for a trigger below and preserve current transaction and
rollback guarantees; this document is a decision gate, not an extraction roadmap.

## Pre-extraction checklist

- [ ] Owner context has a public port/API and no external repository imports.
- [ ] OpenAPI or event contracts are versioned.
- [ ] Data ownership and migration plan are written.
- [ ] Transaction boundaries are resolved with synchronous API calls or events/outbox.
- [ ] Secrets/config/env files are isolated.
- [ ] Health/readiness/metrics/logs exist.
- [ ] Rollback plan exists.
- [ ] Frontend contract consumption is verified.

## Rename policy

Renaming `services/auth-service` to `services/core-api` or `services/vietsage-api` is allowed only as a separate phase after boundaries are stable. The rename phase must update Docker, CI, scripts, docs, OpenAPI export, and frontend env references in one controlled pass.
