# VietSage Auth/HTTP Stabilization Phase Plan

> **For Hermes:** Use Codex CLI for each implementation phase, with the approval line `CHO PHÉP SỬA` as the first line of every Codex prompt. Keep each phase small, inspect diff after Codex, then run lint/typecheck/build before continuing.

**Goal:** Complete the DOCX Auth/HTTP refactor without causing code chaos: one scoped phase at a time, small diffs, verified after every phase.

**Architecture:** Move toward BFF-first authenticated browser calls, one refresh owner, token privacy, and pure transport boundaries. Do not mix transport, auth/session mutation, cookie writes, navigation, and UI side effects in the same module.

**Tech Stack:** Next.js 16 App Router, Auth.js v5 JWT sessions, Route Handlers as BFF, TypeScript, existing pnpm/npm scripts.

---

## Current State Summary

Already completed and verified:

- `src/core/http/internal-session-refresh.ts` exists for browser-side single-flight refresh for same-origin BFF calls.
- `src/core/http/internal-api-client.ts` calls `/api/...` with `credentials: "same-origin"`, retries `401` once through `POST /api/auth/refresh-session`, then emits a logout-required signal.
- `src/app/api/auth/refresh-session/route.ts` and `src/app/api/auth/refresh/route.ts` no longer return raw `accessToken` / `refreshToken` to browser responses.
- `src/app/(vietsage)/_components/auth-refresh-gate.tsx` schedules background refresh and no longer blanks children while refreshing.
- `src/proxy.ts` clears Auth.js v5 `authjs.` cookie prefixes.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` passed after `CI=true pnpm install --frozen-lockfile` restored `node_modules`.

Known remaining risks:

- `session.accessToken` and `session.refreshToken` are still exposed by `src/lib/auth.ts` and typed in `src/types/next-auth.d.ts`.
- `src/core/http/http-server.ts` still imports/uses `auth()`, `refreshAndSaveSessionTokens()`, and `notFound()`.
- `src/core/http/http-client.ts` still owns browser refresh state and UI side effects (`window.dispatchEvent`, `window.location.replace`).
- Some UI/client paths still receive `session.accessToken` and call backend services directly instead of BFF Route Handlers.
- Root docs still reference the old renamed path `frontends/font-end-vietsage`; update carefully without touching unrelated docs semantics.

---

## Global Rules for Every Phase

1. Work only in `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage` and the active frontend path `frontends/front-end-vietsage` unless a phase explicitly says root docs may be changed.
2. Preserve unrelated dirty files.
3. Do not modify `package.json`, lockfiles, backend schema, backend business logic, RBAC policy, Docker/deploy, or secrets.
4. Use Codex CLI for implementation:
   ```bash
   codex exec --sandbox danger-full-access "$(cat .hermes/codex-<phase>.txt)"
   ```
5. Every Codex prompt must start with:
   ```txt
   CHO PHÉP SỬA
   ```
6. After every phase run:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run build
   git diff --check
   ```
7. If a phase touches many files or build fails, stop and fix before continuing.
8. Update `docs/PLANS.md` after each completed phase with real verification output.
9. Prefer small adapters/coordinators over large rewrites.
10. Do not remove fields from `Session` until all compile errors and call-sites are migrated in the same phase.

---

## Phase 0 — Repo Path + Documentation Hygiene

**Objective:** Remove path confusion caused by rename from `font-end-vietsage` to `front-end-vietsage` and make future agents read the right docs.

**Files likely to change:**

- Modify: `../../AGENTS.md`
- Modify: `../../docs/README.md`
- Modify: `../../docs/ARCHITECTURE.md`
- Modify: `../../docs/RULES.md`
- Modify: `../../docs/FRONTEND_SYNC_VALIDATION.md`
- Modify: `../../docs/P1_QA_MIGRATION_VERIFICATION_CHECKLIST.md`
- Modify: `../../shared/api-contract/README.md`
- Modify: `docs/FRONTEND_SMOKE_TESTS.md`
- Modify: `docs/PLANS.md`

**Steps:**

1. Replace stale documentation path references from `frontends/font-end-vietsage` to `frontends/front-end-vietsage`.
2. Keep content semantic unchanged; this is path hygiene only.
3. Run:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run build
   git diff --check
   ```
4. Update `docs/PLANS.md` with a short “path hygiene” completion entry.

**Acceptance criteria:**

- `rg "font-end-vietsage" C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage --glob '*.md'` returns no relevant stale frontend path references, except if intentionally documenting legacy history.
- Build remains green.

---

## Phase 1 — Token Privacy: Stop Exposing Tokens in Browser Session

**Objective:** Remove `accessToken` and `refreshToken` from client-visible `Session` while preserving server access to JWT token fields through server-only helpers.

**Files likely to change:**

- Modify: `src/lib/auth.ts`
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/server-api-auth.ts`
- Modify: `src/features/hotel-ops/utils/hotel-route-auth.ts`
- Modify: `src/app/(vietsage)/admin/layout.tsx`
- Modify: `src/app/(vietsage)/staff/layout.tsx`
- Modify: `src/app/(vietsage)/hotels/layout.tsx`
- Modify: `src/app/(vietsage)/owner/_components/owner-auth.ts`
- Modify: `src/app/(vietsage)/owner/layout.tsx`
- Modify: direct session token page files found by search.
- Modify: `docs/PLANS.md`

**Design:**

- Keep JWT token fields internally:
  - `token.accessToken`
  - `token.refreshToken`
  - `token.accessTokenExpiresAt`
  - `token.authError`
- Client-visible `session` should expose only:
  - `session.user.id`
  - `session.user.roles`
  - `session.accessTokenExpiresAt`
  - `session.authError`
  - optionally `session.isRefreshable` boolean if layouts need to know whether refresh token exists without exposing it.
- Do not expose `refreshToken` or `accessToken` through `/api/auth/session`.

**Steps:**

1. Add a server-only helper if needed, e.g. `src/lib/server-session-tokens.ts`, that returns token fields only on the server using `auth()`.
2. Update `src/lib/auth.ts` `session` callback to stop assigning `session.accessToken` and `session.refreshToken`.
3. Update `src/types/next-auth.d.ts` to remove `Session.accessToken` and `Session.refreshToken`; keep JWT fields.
4. Replace server-side checks `session.refreshToken` with safe helper or `session.isRefreshable`.
5. Do not migrate UI direct backend calls in this phase unless required to compile; if required, route them through existing BFF or defer with an explicit temporary server-only wrapper.
6. Search:
   ```bash
   rg "session\.accessToken|session\.refreshToken|accessToken=\{session\.accessToken|refreshToken=\{session\.refreshToken" src
   ```
7. Run verification.
8. Update `docs/PLANS.md`.

**Acceptance criteria:**

- No `session.accessToken` or `session.refreshToken` reads remain in client-visible code.
- `/api/auth/session` cannot contain raw access/refresh token fields.
- Lint/type/build pass.

**Risk:**

- This phase may surface direct browser backend calls that must be migrated to BFF in Phase 4.

---

## Phase 2 — Server Auth Coordinator + Pure `http-server.ts`

**Objective:** Remove auth/session/cookie mutation/UI routing from `src/core/http/http-server.ts`.

**Files likely to change:**

- Create/modify: `src/lib/server-auth-coordinator.ts`
- Modify: `src/core/http/http-server.ts`
- Modify: `src/lib/server-api-auth.ts`
- Modify: `src/app/api/admin/_utils.ts`
- Modify: `src/app/api/owner/_utils.ts`
- Modify: BFF route handlers that rely on `httpServer` implicit auth.
- Modify: server pages that use `createAuthorizedApiExecutor`.
- Modify: `docs/PLANS.md`

**Design:**

- `http-server.ts` should only:
  - build URL/query/headers/body;
  - attach explicit bearer token if provided;
  - parse response;
  - throw `HttpError`;
  - log redacted response if existing architecture supports it.
- `http-server.ts` must not import:
  - `@/auth`
  - `refreshAndSaveSessionTokens`
  - `next/navigation`
- Server auth coordinator owns:
  - reading server auth state;
  - deciding redirect/login/notFound at boundary;
  - refresh via writable route where appropriate.

**Steps:**

1. Create server coordinator with explicit functions:
   - `requireServerSessionForPage(callbackUrl)`
   - `getServerAccessTokenOrRedirect(callbackUrl)`
   - `handleBackendAuthError(error, callbackUrl)`
2. Change `HttpServerRequestConfig` from `isAuth` implicit auth to explicit `accessToken?: string`.
3. Update BFF utils to call coordinator, then pass explicit `accessToken` into `httpServer`.
4. Move `notFound()` decisions out of `http-server.ts` into route/page/coordinator boundary.
5. Search:
   ```bash
   rg "auth\(|refreshAndSaveSessionTokens|notFound\(|redirect\(" src/core/http/http-server.ts
   ```
6. Run verification.
7. Update `docs/PLANS.md`.

**Acceptance criteria:**

- `http-server.ts` has no `auth()`, no refresh, no `notFound()`, no redirect.
- All server callers pass explicit token or intentionally public mode.
- Lint/type/build pass.

---

## Phase 3 — Pure Browser `http-client.ts` + Remove Duplicate Refresh Owner

**Objective:** Keep `http-client.ts` as a pure backend transport for public/guest or explicitly tokened calls; remove browser refresh and UI side effects from it.

**Files likely to change:**

- Modify: `src/core/http/http-client.ts`
- Possibly create: `src/core/http/http-transport.ts` if extraction remains small.
- Modify: callers that rely on `HttpClient` browser refresh.
- Modify: `docs/PLANS.md`

**Design:**

- `HttpClient` should not call `/api/auth/refresh-session`.
- `HttpClient` should not dispatch logout events.
- `HttpClient` should not call `window.location.replace`.
- Authenticated browser UI should use `internal-api-client.ts` instead.
- Public/guest direct backend flows may still use `HttpClient` if unauthenticated or session token based and intentionally public.

**Steps:**

1. Remove module variables:
   - `clientAccessTokenExpiresAt`
   - `clientRefreshInFlight`
   - `lastClientRefreshResult`
   - `lastClientRefreshAt`
2. Remove `refreshClientAccessToken()` and related retry path from `http-client.ts`.
3. Replace browser logout event handling with caller-level handling in BFF/internal client only.
4. Replace `window.location.replace('/404')` mapping with `HttpError(403)` and move 403 mapping to route/page boundary.
5. Search:
   ```bash
   rg "refreshClientAccessToken|clientRefreshInFlight|window\.dispatchEvent|window\.location|/api/auth/refresh-session" src/core/http/http-client.ts
   ```
6. Run verification.
7. Update `docs/PLANS.md`.

**Acceptance criteria:**

- `http-client.ts` no longer owns refresh state.
- `http-client.ts` no longer performs UI navigation.
- BFF/internal client remains the only browser 401 refresh owner.
- Lint/type/build pass.

---

## Phase 4 — Migrate Direct Authenticated Browser Calls to BFF

**Objective:** Stop passing session access tokens into Client Components for authenticated admin/owner/staff/hotel ops operations.

**Files likely to change:**

- Modify/create BFF routes under:
  - `src/app/api/owner/**/route.ts`
  - `src/app/api/admin/**/route.ts`
  - `src/app/api/rbac/**/route.ts`
  - `src/app/api/hotel-ops/**` if needed
- Modify client components found by search:
  - `src/app/(vietsage)/hotels/[hotelId]/services/page.tsx`
  - `src/app/(vietsage)/hotels/[hotelId]/services/service-catalog-client.tsx`
  - `src/app/(vietsage)/hotels/[hotelId]/requests/[requestId]/page.tsx`
  - `src/app/(vietsage)/hotels/[hotelId]/requests/[requestId]/request-detail-client.tsx`
  - any remaining `accessToken` props from session.
- Modify feature services only if needed to separate backend service from BFF client API.
- Modify `docs/PLANS.md`

**Steps:**

1. Search all direct session token props:
   ```bash
   rg "accessToken=\{|refreshToken=\{|session\.accessToken|session\.refreshToken" src/app src/features
   ```
2. Pick one vertical slice at a time. Recommended order:
   1. Hotel service catalog client.
   2. Hotel request detail client.
   3. Owner realtime token strategy separately in Phase 5.
3. For each slice, create/update BFF Route Handler.
4. Client Component calls `requestInternalApiEnvelope()` only.
5. Remove token props from the page/component boundary.
6. Run verification after each slice, not after a giant migration.
7. Update `docs/PLANS.md` after each vertical slice.

**Acceptance criteria:**

- No authenticated Client Component receives `accessToken` from `session` for HTTP calls.
- Browser authenticated HTTP mutations go through same-origin `/api/...` BFF.
- Lint/type/build pass after each slice.

---

## Phase 5 — Realtime/WebSocket Token Contract

**Objective:** Stop using the generic HTTP session access token for realtime unless explicitly approved by architecture.

**Files likely to change:**

- Modify: `src/app/(vietsage)/owner/layout.tsx`
- Modify: `src/app/(vietsage)/owner/_components/owner-request-realtime-notifier.tsx`
- Modify: `src/features/request-realtime/**`
- Possibly create: `src/app/api/realtime/token/route.ts` if backend supports a dedicated short-lived realtime token.
- Modify: `docs/RUNTIME_UI_GUIDE.md` or `docs/CONTRACT_GUIDE.md` if contract changes.
- Modify: `docs/PLANS.md`

**Steps:**

1. Inspect current realtime client and backend expectations.
2. Decide one of two scoped options:
   - short-term: disable realtime auth token prop and rely on same-origin cookie if backend supports it;
   - proper: BFF endpoint issues short-lived realtime token with no refresh token exposure.
3. Do not invent backend contract. If backend lacks realtime token endpoint, document blocker and keep HTTP token removal separate.
4. Run verification.
5. Update docs.

**Acceptance criteria:**

- No broad `session.accessToken` is passed to realtime UI unless documented as an approved exception.
- No refresh token exposure.
- Lint/type/build pass.

---

## Phase 6 — Hard Refresh Failure + Callback Safety Smoke Pass

**Objective:** Verify refresh failure behavior: cookie cleanup, one login redirect, no nested callback loops.

**Files likely to change:**

- Modify: `src/proxy.ts`
- Modify: `src/app/api/auth/refresh-session/route.ts`
- Modify: `src/app/(vietsage)/_components/auth-refresh-gate.tsx`
- Modify: `docs/FRONTEND_SMOKE_TESTS.md`
- Modify: `docs/PLANS.md`

**Steps:**

1. Add explicit smoke checklist commands/steps for:
   - stale `authjs.*` cookies;
   - refresh-token missing;
   - refresh-token revoked;
   - callbackUrl nesting.
2. Confirm `callbackUrl` is same-origin relative path only.
3. Confirm logout signal fires once per tab/session failure.
4. Run verification.
5. Update docs.

**Acceptance criteria:**

- Refresh failure does not return 500 for normal expired/revoked refresh token where frontend can classify 401.
- Cookie prefixes/chunks are cleaned.
- Login redirect callback is not nested repeatedly.
- Lint/type/build pass.

---

## Phase 7 — Concurrency Test Harness / Manual QA Script

**Objective:** Prove single-flight and retry-once behavior with repeatable checks.

**Files likely to change:**

- Create: `scripts/auth-refresh-smoke.mjs` or docs-only checklist if test automation is not feasible.
- Modify: `docs/FRONTEND_SMOKE_TESTS.md`
- Modify: `docs/PLANS.md`

**Steps:**

1. Do not add test dependencies unless separately approved.
2. Prefer a small Node script using built-in `fetch` if feasible.
3. Simulate or document:
   - 5 concurrent BFF calls receiving 401;
   - one refresh request;
   - every original request retry at most once;
   - refresh failure -> single logout event.
4. If backend/test env is unavailable, document exact manual QA steps and expected logs.
5. Run verification.

**Acceptance criteria:**

- There is repeatable evidence for concurrent 401 behavior.
- The QA doc/script does not store secrets or real tokens.
- Lint/type/build pass.

---

## Phase 8 — Cleanup Flags + Final Docs Alignment

**Objective:** Remove duplicate fallback flags/legacy paths once all call-sites are migrated.

**Files likely to change:**

- Modify: `src/core/http/backend-api-config.ts`
- Modify: `src/core/http/public-api-paths.ts`
- Modify: `docs/RULES.md`
- Modify: `docs/CONTRACT_GUIDE.md`
- Modify: `docs/RUNTIME_UI_GUIDE.md`
- Modify: `docs/PLANS.md`

**Steps:**

1. Search for stale refresh flags and duplicate owners:
   ```bash
   rg "BACKEND_API_RETRY_ON_401|refreshClientAccessToken|refreshServerSessionAccessToken|refreshAndSaveSessionTokens" src
   ```
2. Remove config only when no call-site depends on it.
3. Update docs to state:
   - browser authenticated HTTP = BFF/internal API client;
   - token rotation only in refresh Route Handler/server coordinator;
   - transports are pure.
4. Run full verification.

**Acceptance criteria:**

- No duplicate browser refresh owner remains.
- Docs match implementation.
- Lint/type/build pass.

---

## Recommended Execution Order

Run exactly in this order:

1. Phase 0 — path docs hygiene.
2. Phase 1 — token privacy.
3. Phase 2 — pure server transport.
4. Phase 3 — pure browser transport.
5. Phase 4 — migrate direct authenticated browser call-sites, one vertical slice per sub-phase.
6. Phase 5 — realtime token policy.
7. Phase 6 — hard refresh failure/callback smoke.
8. Phase 7 — concurrency smoke harness/manual QA.
9. Phase 8 — cleanup flags/docs alignment.

Stop after any failed verification. Do not stack phases on top of a broken build.

---

## Standard Verification Block for Every Phase

From `frontends/front-end-vietsage`:

```bash
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

From repo root, when root docs are changed:

```bash
git status --short
git diff --stat
```

Expected before moving to next phase:

- `npm run lint` exits `0`.
- `npx tsc --noEmit` exits `0`.
- `npm run build` exits `0`.
- `git diff --check` exits `0`.
- `docs/PLANS.md` has a dated entry with real command results.

---

## Codex Prompt Template per Phase

Use a temporary prompt file, then remove it before finalizing unless intentionally tracked:

```txt
CHO PHÉP SỬA

User/Hermes already approved execution for this scoped phase. Do not stop to ask for PLAN MODE / EXECUTE MODE / CHO PHÉP SỬA again.

Work only in C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage\frontends\front-end-vietsage unless this phase explicitly allows root docs.
Preserve unrelated dirty files.
Do not modify package.json, lockfiles, backend services, deploy, docker, schema, RBAC, or secrets.

Phase: <PHASE NAME>
Objective: <OBJECTIVE>
Files likely to touch: <LIST>
Acceptance criteria: <LIST>
Verification commands: npm run lint; npx tsc --noEmit; npm run build; git diff --check.

Implement only this phase. Keep diff small. Update docs/PLANS.md with real verification results.
```

---

## Final Definition of Done

The full DOCX proposal is considered complete only when all are true:

- `/api/auth/session` does not expose raw `accessToken` or `refreshToken`.
- No browser HTTP Client Component receives `session.accessToken` for authenticated HTTP calls.
- `http-client.ts` and `http-server.ts` are transport-only and do not own refresh/session/navigation.
- Exactly one browser BFF 401 recovery path exists: internal API client -> single-flight refresh route -> retry once -> logout event on failure.
- Refresh Route Handler is the writable boundary for token rotation/session cookie update.
- Auth.js v5 cookie cleanup works for stale/chunked cookies.
- Concurrent 401 behavior is smoke-tested or documented with repeatable steps.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass.
- `docs/PLANS.md`, `docs/RULES.md`, and runtime/contract docs match the implementation.
