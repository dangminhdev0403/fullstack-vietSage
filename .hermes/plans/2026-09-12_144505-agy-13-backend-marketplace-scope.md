# AGY 13 — Marketplace mutation permissions and capability-based hotel scope

**Goal:** Remove mutations from view permission and stop rejecting valid custom roles by role code.
**Depends on:** AGY 00 integrated.
**Allowed files:**
- `services/auth-service/src/modules/marketplace/api/hotel-marketplace.controller.ts`
- `services/auth-service/src/modules/property/application/hotel-access.service.ts`
- `services/auth-service/src/modules/property/infrastructure/repositories/hotel-core.repository.ts`
- `services/auth-service/src/modules/property/tests/hotel-access.service.spec.ts`
- `services/auth-service/src/modules/marketplace/tests/hotel-marketplace-permissions.spec.ts`
**Acceptance:** Acknowledge/voucher/cancel never use a `.view` key; choose coordinate or execute from target contract based on actual command semantics. Hotel access uses session-bound active role + capability/resource scope; valid custom role is not blocked solely by unknown code. Owner tenant scope and staff assignment isolation remain.
**Focused check:** `cd services/auth-service && npx jest src/modules/property/tests/hotel-access.service.spec.ts --runInBand`
**Stop:** Telegram/webhook or broader RBAC actor-ceiling issues are out of slice; report only.


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
