# AGY 12 — Request coordinate versus execute

**Goal:** Separate owner coordination from frontdesk request execution.
**Depends on:** AGY 00 integrated.
**Allowed files:**
- `services/auth-service/src/modules/guest-operations/api/hotel-requests.controller.ts`
- `services/auth-service/src/modules/guest-operations/application/hotel-requests.service.ts`
- `services/auth-service/src/modules/guest-operations/infrastructure/repositories/hotel-requests.repository.ts`
- `services/auth-service/src/modules/guest-operations/domain/schemas/requests.schema.ts`
- `services/auth-service/src/modules/guest-operations/tests/hotel-request-permissions.spec.ts`
**Acceptance:** Assignment/priority/internal coordination requires `hotel.requests.coordinate`; operational status/guest-facing execution requires `hotel.requests.execute`; view stays read-only. Any assigned user supplied through status or assignment path is validated as active and assignable in this hotel/tenant. Existing transition and folio idempotency remains.
**Focused check:** `cd services/auth-service && npx jest src/modules/guest-operations/tests/hotel-request-permissions.spec.ts --runInBand`


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
