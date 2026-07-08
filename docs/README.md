# VietSage Documentation Index

This folder is the root documentation hub for cross-system VietSage documents.

## Documentation Structure

| Scope | Location | Purpose |
| --- | --- | --- |
| Root / cross-system | `docs/` | System-wide architecture, documentation rules, deployment, secrets policy, API/service boundary, event flow, QA/validation, RBAC architecture. |
| Backend services | `services/docs/` | Backend architecture standard, module guide, contract/data guide, service extension guide, backend rules/plans/migrations/i18n notes. |
| Frontend app | `frontends/font-end-vietsage/docs/` | Frontend architecture standard, module guide, contract guide, runtime/UI guide, frontend rules/plans/design/smoke/i18n notes. |
| Shared API contract package | `shared/api-contract/docs/` | Generated/curated API catalog and contract changelog. |

## Read Order For AI Agents

1. Start with the nearest `ARCHITECTURE.md` for the scope being changed.
2. Open only the guide matching the task: `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `RUNTIME_UI_GUIDE.md`, `EXTENSION_GUIDE.md`, or the relevant root doc.
3. Open `RULES.md` before implementation or validation work.
4. Open `PLANS.md` only when the task involves planning/progress tracking.

Do not load every markdown file by default.

## Root Docs

| File | Purpose |
| --- | --- |
| `ARCHITECTURE.md` | Cross-system architecture overview. |
| `RULES.md` | Documentation governance and plan-mode rules. |
| `API_SPEC.md` | Cross-system API/runtime specification notes. |
| `SERVICE_BOUNDARY.md` | Service ownership and boundary notes. |
| `EVENT_FLOW.md` | Event and lifecycle flow notes. |
| `FRONTEND_SYNC_VALIDATION.md` | Frontend sync validation checklist. |
| `P1_QA_MIGRATION_VERIFICATION_CHECKLIST.md` | QA/migration verification checklist. |
| `RBAC_ARCHITECTURE.md` | Cross-system RBAC architecture and migration direction. |
| `DEPLOYMENT.md` | VPS/deployment notes. |
| `SECRETS.md` | Runtime secrets policy and file structure. |
