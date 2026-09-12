# AGY 00 — Capability contract and additive migration

**Goal:** Add the minimal coordinate/execute capability contract and additive preset migration without enforcing it yet.
**Depends on:** verified baseline snapshot.
**Allowed files:**
- `services/auth-service/src/common/config/business-permissions.registry.ts`
- `services/auth-service/prisma/migrations/20260912144505_tenant_owner_frontdesk_execution_capabilities/migration.sql`
- `services/auth-service/src/common/config/business-permissions.registry.spec.ts`
**Existing dirty:** identity RBAC/schema migration work exists in baseline; do not touch it.
**Acceptance:** Registry exposes six target keys. Additive SQL grants execution to HOTEL_FRONTDESK, billing checkout to HOTEL_FINANCE as compatible with current billing role, coordinate to owner; it does not delete old grants yet and never targets all noncanonical/custom roles. Idempotent SQL.
**Focused check:** `cd services/auth-service && npx jest src/common/config/business-permissions.registry.spec.ts --runInBand`
**Implementation:** Test exact registry keys and migration allowlists/idempotent conflict behavior. Preserve bridge storage (`OPTIONS`, key in path). No schema/package change.


## Global contract
- Read `AGENTS.md`, `.agents/AGENTS.md`, `PONYTAIL.md`, nearest architecture/rules docs, then this file.
- Start from existing Graphify result; inspect only the bounded flow. Do not update Graphify.
- Preserve the baseline exactly, including pre-existing dirty work already embedded in the lane base.
- No package/lockfile, secrets, deployment, production, database execution, reset, checkout, broad formatting, unrelated cleanup, commit, or push.
- Use current typed permission registry and `@RequirePermission`; no role-code denial, policy engine, duplicate permission map, or frontend-only security.
- Implement only allowed files. If another file is necessary, send `BLOCKED` and stop.
- Run exactly one focused check. Do not run full lint/build/test.
- Before completion, run the injected Orca check, then `worker_done` once. Report `PONYTAIL_READ`, changed files, focused check and real result.
- Any command/tool/compile/test/auth/quota/scope error that blocks acceptance: stop; send `worker_done --outcome failed` with evidence. Do not self-route, retry with another model/account, broaden scope, or repair unrelated code.
