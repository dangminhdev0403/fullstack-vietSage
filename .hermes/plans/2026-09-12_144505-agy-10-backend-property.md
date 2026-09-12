# AGY 10 — Property operation enforcement

**Goal:** Enforce distinct check-in, check-out, and room-status capabilities across every property ingress.
**Depends on:** AGY 00 integrated.
**Allowed files:**
- `services/auth-service/src/modules/property/api/hotel-rooms.controller.ts`
- `services/auth-service/src/modules/property/api/reservations.controller.ts`
- `services/auth-service/src/modules/biometric-workstations/api/biometric-workstations.controller.ts`
- `services/auth-service/src/modules/property/domain/schemas/rooms.schema.ts`
- `services/auth-service/src/modules/property/application/hotel-rooms.service.ts`
- `services/auth-service/src/modules/property/tests/hotel-operation-permissions.spec.ts`
**Acceptance:** Walk-in and existing-stay check-in require `hotel.stays.check-in`; reservation check-in requires the same execution key in addition to resource validation; direct checkout requires `hotel.stays.check-out`; operational room status uses a dedicated validated command endpoint requiring `hotel.rooms.status.manage`. The existing metadata update endpoint remains under `hotel.rooms.manage` and no longer accepts `status`. QR policy remains unchanged. Biometric workstation follows check-in execution, not owner role.
**Focused check:** `cd services/auth-service && npx jest src/modules/property/tests/hotel-operation-permissions.spec.ts --runInBand`
**Implementation:** Prefer decorator-only enforcement except the approved minimal room-status split: add one strict status body schema, one service method reusing current access/repository/status validation, and one dedicated controller endpoint. Do not rewrite repositories or status machines.


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
