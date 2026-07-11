# VietSage DOCX Architecture Refactor Plan

Created: 2026-07-11
Source: `VietSage_Architecture_Refactor_Proposal.docx`
Repo: `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`

## Executive summary

The DOCX proposal recommends **not rebuilding from scratch** and **not splitting microservices yet**. The safe target is a production-ready **modular monolith**: one deployed backend API with explicit bounded contexts, public module boundaries, OpenAPI as the HTTP contract source of truth, and event/outbox readiness only where a concrete workflow needs it.

The current repo already moves in this direction, but documentation and a few module boundaries still describe or imply a more distributed architecture than the runtime actually has.

## Current architecture vs DOCX target

| Area | Current repo snapshot | DOCX target | Refactor action |
| --- | --- | --- | --- |
| Runtime model | One deployed NestJS API under `services/auth-service`, plus frontend and shared contract package. Some docs still mention `api-gateway`, `hotel-service`, and database-per-service as if current. | One deployed core API / modular monolith until extraction criteria are met. | Align docs to current truth and mark microservices as future extraction only. |
| Service naming | `auth-service` contains auth, RBAC, hotels, billing, GuestOS, emergency, notifications, codes, and health. | Either keep name temporarily or rename later after boundaries stabilize. | Do not rename in this phase; document it as `core API currently located at auth-service`. |
| Boundaries | Modules exist, but cross-module imports still use implementation services in some places. | Modules expose public ports/services only; repositories remain internal. | Start by hiding Hotels repositories from module exports and introducing public boundary docs. |
| Identity/Auth | Auth, RBAC, user/session/permission logic are still in `auth`/`rbac`/`hotel-users`. | Identity should become a clear bounded context with authentication, sessions, users, access-control, audit. | First safe slice: move `AuthenticatedUser` contract to shared security boundary while preserving compatibility. |
| Contracts | OpenAPI export exists, but root `API_SPEC.md` can drift as manual endpoint catalog. | OpenAPI/exported contract is source of truth. | Make docs describe policy and export flow, not duplicate endpoint truth. |
| Events | Realtime/domain event pieces exist, but event boundary needs explicit envelope and outbox readiness. | No broker by default; define event envelope and in-process publisher/outbox readiness. | Update event docs; code ports can follow per workflow. |
| Secrets | `secrets/env_backend` was tracked with filled values; compose uses ignored `secrets/docker/*.env` and `secrets/production/*.env`. | No real runtime secrets in git; only skeleton/examples and docs. | Replace tracked legacy files with non-secret skeletons and update policy. |
| Future microservices | Some docs imply service split earlier than justified. | Extract only after contract/data/ops/scaling trigger. | Add service evolution criteria and ADR. |

## Approved execution strategy

1. **Docs baseline**: align root/services docs to modular-monolith truth.
2. **Secret hygiene**: remove filled values from tracked legacy secret files without printing values.
3. **Domain map + service evolution**: define bounded contexts, ownership, and extraction criteria.
4. **Hotels boundary first slice**: hide repository exports; add test to enforce public boundary.
5. **Identity boundary first slice**: expose `AuthenticatedUser` from shared security boundary; keep old import path as compatibility barrel.
6. **Verification**: build, tests, lint, diff check, docs sanity checks.

## Explicit non-goals for this phase

- No rebuild from scratch.
- No microservice extraction.
- No API gateway or message broker.
- No database-per-service split.
- No rename of `services/auth-service` yet.
- No package/dependency changes.
- No frontend refactor except future documentation references if needed.
- No printing or committing real secret values.

## Follow-up code phases after this baseline

1. Replace direct cross-module implementation dependencies with public ports:
   - Billing -> PropertyAccessPort
   - GuestOS/Emergency -> GuestSessionResolverPort
   - Guest request notifications -> NotificationPublisherPort
2. Split Identity module folders after tests cover auth/session/access-control seams.
3. Complete OpenAPI export and contract diff review after any HTTP shape changes.
4. Consider `auth-service -> core-api` rename only in a dedicated phase.
