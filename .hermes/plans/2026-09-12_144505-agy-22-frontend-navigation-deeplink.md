# AGY 22 — Persona navigation, route state, deep links

**Goal:** Align owner/frontdesk navigation and make request/flow deep links real.
**Depends on:** backend lanes integrated.
**Allowed files:**
- `frontends/front-end-vietsage/src/features/workspace/config/workspace-registry.ts`
- `frontends/front-end-vietsage/src/features/workspace/utils/workspace-nav-active.test.ts`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/requests/request-queue-client.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/requests/page.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/rooms/page.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx`
- `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/dashboard/page.tsx`
**Existing dirty:** `workspace-registry.ts` and its test already contain user work in the baseline. Preserve it byte-for-byte except this boundary's exact lines.
**Acceptance:** Owner nav is governance/monitoring; frontdesk nav is shift/rooms/requests/messages/checkout/tools. `requestId` opens detail on click/reload/back. `flow=check-in|reservation` is consumed or removed from emitting CTA—no fake query state. Partial/view-only capability does not crash whole page; action 403 is not converted to empty/logout.
**Focused check:** `cd frontends/front-end-vietsage && node --test 'src/features/workspace/utils/workspace-nav-active.test.ts'`
**Stop:** If current runner cannot execute `.ts`, use the exact existing command documented beside this test; no dependency addition.


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
