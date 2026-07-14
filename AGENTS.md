# Agent Instructions for fullstack-vietSage

These instructions are mandatory for Codex and any delegated coding agent working in this repository.

## Required Reading Before Changes

Start from the closest relevant documentation scope. Do not load every markdown file by default.

### Cross-system / repository-wide work

Read:

1. `docs/README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RULES.md`
4. A task-specific root doc when relevant:
   - API/runtime notes: `docs/API_SPEC.md`
   - service boundaries: `docs/SERVICE_BOUNDARY.md`
   - event/lifecycle flow: `docs/EVENT_FLOW.md`
   - RBAC: `docs/RBAC_ARCHITECTURE.md`
   - deployment: `docs/DEPLOYMENT.md`
   - secrets policy: `docs/SECRETS.md`

### Frontend work

Read:

1. `frontends/front-end-vietsage/docs/ARCHITECTURE.md`
2. `frontends/front-end-vietsage/docs/RULES.md`
3. The task-specific guide:
   - feature/module work: `frontends/front-end-vietsage/docs/MODULE_GUIDE.md`
   - API/contract work: `frontends/front-end-vietsage/docs/CONTRACT_GUIDE.md`
   - runtime/UI/state/realtime/error/i18n work: `frontends/front-end-vietsage/docs/RUNTIME_UI_GUIDE.md`
   - planning/progress work: `frontends/front-end-vietsage/docs/PLANS.md`

### Backend work

Read:

1. `services/docs/ARCHITECTURE.md`
2. `services/docs/RULES.md`
3. The task-specific guide:
   - module work: `services/docs/MODULE_GUIDE.md`
   - API/contract/data work: `services/docs/CONTRACT_GUIDE.md`
   - service extension/extraction work: `services/docs/EXTENSION_GUIDE.md`
   - migration work: `services/docs/MIGRATION_GUIDE.md`
   - i18n backend work: `services/docs/MULTILINGUAL_BACKEND_PLAN.md`
   - planning/progress work: `services/docs/PLANS.md`

## Hard Rules

- Do not create architecture/rules/plans docs outside the canonical docs folders.
- Do not modify any `package.json` unless explicitly approved by the user.
- Do not add dependencies unless explicitly approved by the user.
- Do not write secrets, tokens, passwords, API keys, or connection strings into docs or code.
- Do not commit unrelated modified/untracked files.
- Keep frontend/backend/shared API boundaries explicit.
- API behavior changes must update the relevant contract docs in the same task.
- Architecture docs should stay short; put detailed guidance in companion guide files.

## Before Final Report

Report:

- files inspected;
- files changed;
- validation commands run and real results;
- docs updated;
- remaining risks/blockers.
