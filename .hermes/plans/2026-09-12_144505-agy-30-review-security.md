# AGY 30 — Read-only security/RBAC review

**Goal:** Review integrated diff only. No edits.
**Scope:** Capability registry/migration, all changed backend controllers/services/tests, BFF authorization assumptions.
**Acceptance:** Report only actionable findings with severity and file:line for owner execution leakage, active-role union, custom-role denial, cross-tenant access, view mutation, pending payment/webhook regression, migration data loss. Otherwise PASS.
**Focused check:** none; read-only review.
**Forbidden:** all writes, tests that mutate DB, commit/push/deploy. On tool/auth/quota error, report failed worker_done and stop.


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
