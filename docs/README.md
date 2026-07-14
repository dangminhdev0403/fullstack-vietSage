# VietSage Documentation Index

This folder is the root documentation hub for cross-system VietSage documents.

## Current architecture baseline

VietSage is currently a **modular monolith**: one deployed NestJS core API under the historical path `services/auth-service`, one Next.js frontend, and a shared OpenAPI contract package. Do not treat `api-gateway`, `hotel-service`, database-per-service, queues, or microservices as current runtime unless a future extraction phase explicitly creates them.

## Documentation Structure

| Scope | Location | Purpose |
| --- | --- | --- |
| Root / cross-system | `docs/` | System architecture, bounded contexts, service evolution, API/event/secret/RBAC policies, deployment and validation. |
| Backend standards | `services/docs/` | Backend modular-monolith standards, module guide, contract/data guide, extension workflow, rules/plans/migration notes. |
| Current backend core API | `services/auth-service/` | NestJS runtime service currently acting as VietSage core API. |
| Frontend app | `frontends/front-end-vietsage/docs/` | Frontend architecture standard, module guide, contract guide, runtime/UI guide, rules/plans/design/smoke/i18n notes. |
| Shared API contract package | `shared/api-contract/docs/` | Generated/curated API catalog and contract changelog. |

## Read Order For AI Agents

1. Start with the nearest `ARCHITECTURE.md` for the scope being changed.
2. For cross-domain work, read `DOMAIN_MAP.md` and `SERVICE_EVOLUTION.md`.
3. Open only the guide matching the task: `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `RUNTIME_UI_GUIDE.md`, `EXTENSION_GUIDE.md`, or the relevant root doc.
4. Open `RULES.md` before implementation or validation work.
5. Open `PLANS.md` only when the task involves planning/progress tracking.

Do not load every markdown file by default.

## Root Docs

| File | Purpose |
| --- | --- |
| `ARCHITECTURE.md` | Cross-system modular-monolith architecture overview. |
| `DOMAIN_MAP.md` | Bounded context ownership map and allowed dependencies. |
| `SERVICE_EVOLUTION.md` | Criteria and roadmap for future service extraction. |
| `RULES.md` | Documentation governance and plan-mode rules. |
| `API_SPEC.md` | API contract policy/runtime notes; generated OpenAPI remains source of truth. |
| `SERVICE_BOUNDARY.md` | Service/module ownership and boundary notes. |
| `EVENT_FLOW.md` | Event envelope, lifecycle flow, and outbox-readiness notes. |
| `FRONTEND_SYNC_VALIDATION.md` | Frontend sync validation checklist. |
| `P1_QA_MIGRATION_VERIFICATION_CHECKLIST.md` | QA/migration verification checklist. |
| `RBAC_ARCHITECTURE.md` | Cross-system RBAC architecture and migration direction. |
| `DEPLOYMENT.md` | VPS/deployment notes. |
| `SECRETS.md` | Runtime secrets policy and file structure. |
| `adr/` | Architecture decision records. |
