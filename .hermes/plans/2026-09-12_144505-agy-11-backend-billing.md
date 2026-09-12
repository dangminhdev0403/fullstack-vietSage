# AGY 11 — Billing checkout enforcement and query purity

**Goal:** Close billing side doors that let an owner complete checkout; make read endpoints read-only.
**Depends on:** AGY 00 integrated.
**Allowed files:**
- `services/auth-service/src/modules/billing/api/folio.controller.ts`
- `services/auth-service/src/modules/billing/api/payment.controller.ts`
- `services/auth-service/src/modules/billing/application/billing.service.ts`
- `services/auth-service/src/modules/billing/tests/billing.service.checkout-safety.spec.ts`
- `services/auth-service/src/modules/billing/tests/checkout-service-reconciliation.spec.ts`
**Acceptance:** Issue invoice/manual confirmation/zero-balance/checkout completion require `hotel.billing.checkout`; provider webhook remains valid and idempotent. GET summary performs no create/update; charge materialization moves to an existing command seam only. No double charge, lost payment, or state-machine rewrite.
**Focused check:** `cd services/auth-service && npx jest src/modules/billing/tests/billing.service.checkout-safety.spec.ts --runInBand`
**Stop:** If separating summary mutation needs schema/API redesign or >5 allowed files, BLOCKED.


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
