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

## Suggested future extraction order

1. **Notifications** — if Telegram/provider delivery needs independent retrying, rate limits, and webhook isolation.
2. **Billing/Payments** — if payment provider integrations require separate audit/security/retry boundaries.
3. **Emergency** — if incident reliability/SLO requirements diverge from hotel operations.
4. **Identity & Access** — only after token/session/permission contracts and service-to-service auth are stable.
5. **Property / Guest Operations** — last, because stays/rooms/requests often share transactions.

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
