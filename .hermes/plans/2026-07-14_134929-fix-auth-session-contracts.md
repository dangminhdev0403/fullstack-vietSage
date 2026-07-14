# VietSage Auth Session & Contract Fix Implementation Plan

> **For Hermes:** Execute this plan task-by-task only after explicit user approval. Use TDD and systematic debugging; do not expose refresh/access tokens to the browser session.

**Mission:** `AUTH-SESSION-CONTRACT-STABILIZATION`

**Goal:** Fix the frontend protected-route login loop and align logout, refresh idempotency, and empty-login validation across the Next.js frontend and NestJS backend without weakening token secrecy.

**Architecture:** Keep access/refresh tokens only in the encrypted Auth.js JWT HttpOnly cookie and server-only readers. Project only a non-sensitive `canRefresh` boolean into the public Auth.js session, use that flag in the Next.js proxy, send bearer access tokens to the private backend logout endpoint, and retain one idempotency key per logical refresh attempt so ambiguous retries can recover the same rotated result. Validate login payloads before Passport consumes missing credentials so API errors stay consistent.

**Tech stack:** Next.js 16, Auth.js/NextAuth v5 beta, TypeScript 5.9, NestJS 11, Passport, Zod, Jest, OpenAPI.

---

## 1. Confirmed context and root causes

The supplied DOCX and the executed QA evidence agree on the following:

1. `frontends/front-end-vietsage/src/lib/auth.ts` stores `refreshToken` in the Auth.js JWT but intentionally omits it from the public `session()` result.
2. `frontends/front-end-vietsage/src/proxy.ts` reads `session.refreshToken`; because `auth()` exposes only fields returned by `session()`, this is always absent. The proxy clears Auth.js cookies and redirects an otherwise valid login to `/login?...reauth=1`.
3. Exposing `refreshToken` from `session()` is rejected because `/api/auth/session` is browser-readable.
4. Frontend logout calls `authService.logout(refreshToken)` as a public body request, while backend `/auth/logout` is private and revokes the session identified by bearer access-token claims.
5. Backend refresh supports `Idempotency-Key`, but frontend refresh currently does not forward one.
6. Empty login bodies are rejected by Passport before the Zod schema runs, producing `401 UNAUTHORIZED` instead of the project-standard `400 VALIDATION_ERROR`.

Repository constraints:

- Current frontend path is `frontends/front-end-vietsage`.
- Do not modify any `package.json` or add dependencies without separate approval.
- Preserve unrelated dirty files: `frontends/front-end-vietsage/docs/PLANS.md` and `frontends/front-end-vietsage/src/components/marketing/marketing-header.tsx` are already modified. If progress docs must be updated, merge only the mission entry without overwriting existing changes.
- No database schema or migration is required.

## 2. Acceptance criteria

- Valid `tenant_owner` login remains on `/owner/dashboard` and does not add `reauth=1`.
- `/api/auth/session` returns `canRefresh: true` for a refreshable session but contains neither `accessToken` nor `refreshToken`.
- Protected routes accept a valid refreshable session; a session with no refresh capability is cleaned up and redirected once.
- Near-expiry access tokens refresh server-side, update the encrypted JWT cookie, and return to the original safe internal route.
- External and unknown callback URLs remain sanitized to an allowed role default.
- Frontend sign-out calls backend `/auth/logout` with `Authorization: Bearer <accessToken>` and no refresh token in body or public request.
- One stable `Idempotency-Key` is forwarded for the same logical refresh/retry; a new logical refresh receives a new key.
- Empty login body returns `400 VALIDATION_ERROR`; invalid credentials still return `401 AUTH_INVALID_CREDENTIALS`.
- Existing login, refresh rotation/replay protection, logout-all, RBAC, build, lint, and OpenAPI verification remain green.

---

## 3. Implementation tasks

### Task 1 — Create a deterministic regression loop for the frontend login loop

**Objective:** Make the exact QA symptom fail before changing production code.

**Files:**
- Create: `frontends/front-end-vietsage/scripts/auth-session-regression.mjs` only if this can run with existing dependencies and without changing `package.json`.
- Otherwise use a temporary browser/API harness outside the repository and retain the exact command in the validation record.

**Steps:**

1. Start backend on `8080` and frontend on `3000` using their existing ignored `.env` files.
2. Automate or manually assert this sequence:
   - unauthenticated `GET /owner/dashboard` redirects to login with a safe callback;
   - valid login creates an Auth.js session;
   - navigation to `/owner/dashboard` currently redirects back to login with `reauth=1`.
3. Query `/api/auth/session` and assert it does not expose `accessToken` or `refreshToken`.
4. Record this loop as RED for `AUTH-FE-01`.

**Expected before fix:** login succeeds at the backend but the protected route redirects back to login.

### Task 2 — Add safe `canRefresh` session metadata

**Objective:** Let edge/proxy code determine refresh capability without exposing token material.

**Files:**
- Modify: `frontends/front-end-vietsage/src/types/next-auth.d.ts`
- Modify: `frontends/front-end-vietsage/src/lib/auth.ts`

**Steps:**

1. Extend `Session` with `canRefresh: boolean`.
2. In the Auth.js `session()` callback, derive:

```ts
session.canRefresh =
  typeof token.refreshToken === "string" &&
  token.refreshToken.length > 0;
```

3. Keep `accessToken` and `refreshToken` absent from the returned session.
4. Add an invariant regression assertion:

```ts
expect(session.canRefresh).toBe(true);
expect(session).not.toHaveProperty("refreshToken");
expect(session).not.toHaveProperty("accessToken");
```

5. If no frontend unit-test runner exists, do not add one or modify `package.json`; verify the invariant through `/api/auth/session` plus production build/type checking.

**Expected:** public session exposes only refresh capability, never token values.

### Task 3 — Make the proxy consume `canRefresh`

**Objective:** Stop valid sessions from being falsely classified as non-refreshable.

**Files:**
- Modify: `frontends/front-end-vietsage/src/proxy.ts`

**Steps:**

1. Replace the `session.refreshToken` lookup with `const canRefresh = session?.canRefresh === true`.
2. Change the protected-route rejection condition to `!canRefresh` and rename the diagnostic event to `[AUTH_PROXY_REDIRECT_NOT_REFRESHABLE]`.
3. Change the authenticated login/register redirect condition to require `canRefresh`.
4. Do not change the existing `authError`, expiry, role, callback sanitization, or cookie-cleanup policies.
5. Re-run the Task 1 loop.

**Expected after fix:** valid tenant-owner login reaches and remains on `/owner/dashboard`.

### Task 4 — Align frontend logout with the private backend contract

**Objective:** Revoke the backend session using bearer access-token authentication without sending refresh tokens in a request body.

**Files:**
- Modify: `frontends/front-end-vietsage/src/features/auth/service/auth-service.ts`
- Modify: `frontends/front-end-vietsage/src/lib/auth.ts`
- Potentially modify after contract regeneration: `frontends/front-end-vietsage/src/features/auth/types/auth-contract.ts`
- Regenerate, do not hand-edit: `frontends/front-end-vietsage/src/generated/openapi/v1.ts` if the existing sync command changes it.

**Steps:**

1. Change `AuthService.logout` to accept an access token.
2. Send `POST /auth/logout` with `accessToken` so the central transport adds `Authorization: Bearer ...`; send no refresh-token body and do not mark the request public.
3. In the Auth.js `signOut` event, read `token.accessToken` server-side and pass it to `authService.logout`.
4. Keep sign-out idempotent from the UI perspective. If backend revocation fails, ensure Auth.js local cookie cleanup still completes while logging a redacted warning.
5. Verify request logs contain no raw access or refresh tokens.
6. Refresh generated OpenAPI types if `AuthLogoutRequest` is stale and remove the obsolete request-body alias/import only after generation proves it is no longer part of the contract.

**Expected:** backend logout returns `200`; the old access and refresh session can no longer be used; browser session cookie is removed.

### Task 5 — Forward and retain refresh idempotency keys

**Objective:** Make refresh rotation recoverable when the backend processes a request but the frontend loses the response.

**Files:**
- Modify: `frontends/front-end-vietsage/src/features/auth/service/auth-service.ts`
- Modify: `frontends/front-end-vietsage/src/lib/auth-session-refresh.ts`
- Potentially modify: `frontends/front-end-vietsage/src/core/http/http-client.ts` only if transport typing prevents the existing `headers` option from being used; no behavioral transport rewrite is expected.

**Steps:**

1. Change `AuthService.refresh(refreshToken, idempotencyKey)` and forward:

```ts
headers: { "Idempotency-Key": idempotencyKey }
```

2. Generate the key at the server-only refresh coordinator boundary, not in UI code.
3. Associate one UUID with the old refresh token for the logical refresh operation.
4. Reuse that UUID for concurrent calls and ambiguous network retries. Retain it for the backend idempotency window (currently 300 seconds) when no response is received; remove it after a confirmed successful save or TTL expiry.
5. Bound and clean the in-memory key map to avoid unbounded growth. Document that process-local coordination is sufficient for current single-instance development but a shared coordinator would be needed for horizontally scaled frontend instances.
6. Never log the full refresh token or idempotency key; existing token-tail diagnostics may remain if consistent with project policy.
7. Validate:
   - same logical retry → same key and same rotated token result;
   - separate refresh → new key;
   - replay with a different key remains rejected by backend.

**Expected:** a lost-response retry can retrieve the original rotation result rather than trigger family replay revocation.

### Task 6 — Normalize empty-login validation before Passport

**Objective:** Return the same `400 VALIDATION_ERROR` contract for missing/invalid login payloads before authentication is attempted.

**Files:**
- Modify: `services/auth-service/src/modules/identity/infrastructure/guards/local-auth.guard.ts`
- Modify: `services/auth-service/src/modules/identity/infrastructure/strategies/local.strategy.ts`
- Create or modify: `services/auth-service/src/modules/identity/tests/infrastructure/local-auth.guard.spec.ts`
- Modify: `services/auth-service/test/app.e2e-spec.ts` if its harness can cover the real route cheaply.

**Steps:**

1. Write a RED test asserting `POST /auth/login` with `{}` returns `400` and `VALIDATION_ERROR`.
2. In `LocalAuthGuard.canActivate`, parse and normalize `request.body` with `loginCredentialsSchema` before `super.canActivate(context)`.
3. Let Zod reject missing email/password before Passport maps the request to `401`.
4. Remove duplicate schema parsing from `LocalStrategy.validate`; it should call `authService.validateUser(email, password)` with the guard-normalized values.
5. Preserve these distinctions:
   - missing/malformed payload → `400 VALIDATION_ERROR`;
   - well-formed wrong credentials → `401 AUTH_INVALID_CREDENTIALS`;
   - valid credentials → `200`.
6. Run focused guard/schema/auth tests before the full backend suite.

**Expected:** validation and authentication errors are contractually consistent without changing credential secrecy.

### Task 7 — Synchronize OpenAPI and consumer types

**Objective:** Eliminate stale frontend assumptions after logout-contract alignment.

**Files generated or updated only if commands produce diffs:**
- `shared/api-contract/openapi/v1/openapi.json`
- `shared/api-contract/openapi/v1/openapi.yaml`
- `shared/api-contract/docs/CONTRACT_CHANGES.md`
- `frontends/front-end-vietsage/src/generated/openapi/v1.ts`
- `frontends/front-end-vietsage/src/features/auth/types/auth-contract.ts`

**Commands:**

```bash
cd services/auth-service
npm run openapi:export
cd ../../shared/api-contract
npm run verify
cd ../../frontends/front-end-vietsage
npm run sync:api:types
```

**Steps:**

1. Confirm `/auth/logout` is documented as bearer-authenticated with no refresh-token request body.
2. Confirm `/auth/refresh` retains the optional `Idempotency-Key` header.
3. Do not manually invent or preserve stale generated request types.
4. Update contract changelog only if generated contract behavior changes.

### Task 8 — Complete regression and end-to-end verification

**Objective:** Prove all fixes together and close the previously blocked UI cases.

**Backend commands:**

```bash
cd services/auth-service
npm test -- --runInBand \
  src/modules/identity/tests/authentication.service.spec.ts \
  src/modules/identity/tests/schemas/auth.schema.spec.ts \
  src/modules/identity/tests/infrastructure/local-auth.guard.spec.ts
npm run build
npm run test -- --runInBand
npm run test:e2e
npx eslint "{src,apps,libs,test}/**/*.ts"
```

**Frontend commands:**

```bash
cd frontends/front-end-vietsage
npm run lint
npm run build
```

**Manual/browser matrix:**

1. Invalid/missing form inputs show UI validation.
2. Wrong password shows generic login failure.
3. Valid tenant-owner login lands on `/owner/dashboard`.
4. `/api/auth/session` has `canRefresh: true`, no access/refresh token.
5. Direct `/owner/dashboard` access does not redirect to `reauth=1`.
6. Near-expiry access token refreshes and returns to the same route.
7. Session missing refresh capability redirects and clears cookies once.
8. Logout cancel preserves session.
9. Logout confirm revokes backend session and prevents protected-route reuse.
10. External callback URL is sanitized and never navigated to.
11. Refresh retry uses a stable idempotency key and does not revoke the family.
12. Backend empty body is `400`; wrong credentials remain `401`.

**Security checks:**

- Inspect `/api/auth/session`, browser network payloads, console output, and server logs for token leakage.
- Confirm cookies remain HttpOnly and refresh tokens are only read in server-safe boundaries.
- Confirm no credentials are written to tracked fixtures, docs, screenshots, or logs.

### Task 9 — Documentation and clean handoff

**Objective:** Record only verified work without overwriting unrelated user changes.

**Files:**
- Merge mission status into: `frontends/front-end-vietsage/docs/PLANS.md`
- Merge mission status into: `services/docs/PLANS.md` if backend validation behavior is changed.
- Update `frontends/front-end-vietsage/docs/RULES.md` or `CONTRACT_GUIDE.md` only if a durable rule is added: public session may expose `canRefresh` metadata but never token values.
- Update backend contract docs only if exported HTTP behavior changes.

**Steps:**

1. Re-read dirty docs before editing and preserve existing modifications.
2. Record date, root causes, actual files changed, exact validation commands/results, and remaining risks.
3. Inspect `git diff --check` and `git status --short`.
4. Do not commit unless separately requested.

---

## 4. Likely production files changed

| Area | File | Change |
|---|---|---|
| Frontend session type | `frontends/front-end-vietsage/src/types/next-auth.d.ts` | Add `canRefresh` |
| Auth.js callbacks/events | `frontends/front-end-vietsage/src/lib/auth.ts` | Project `canRefresh`; bearer logout |
| Edge route protection | `frontends/front-end-vietsage/src/proxy.ts` | Consume `canRefresh` |
| Auth API client | `frontends/front-end-vietsage/src/features/auth/service/auth-service.ts` | Bearer logout and idempotency header |
| Refresh coordinator | `frontends/front-end-vietsage/src/lib/auth-session-refresh.ts` | Stable bounded idempotency-key lifecycle |
| Backend pre-auth validation | `services/auth-service/src/modules/identity/infrastructure/guards/local-auth.guard.ts` | Validate before Passport |
| Backend local strategy | `services/auth-service/src/modules/identity/infrastructure/strategies/local.strategy.ts` | Remove duplicate parse |
| Contracts/tests/docs | Generated types, focused tests, `PLANS.md` | Regression coverage and verified tracking |

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Accidentally exposing refresh/access tokens through `/api/auth/session` | Explicit negative assertions and browser payload inspection |
| Proxy and Auth.js callback type drift | Type augmentation plus production build |
| Logout clears browser session but fails backend revocation | Send bearer access token server-side; log redacted failure; verify old tokens fail |
| Lost refresh response causes replay-family revocation | Stable idempotency key retained across ambiguous retry for backend TTL |
| In-memory idempotency map grows or fails across multiple instances | TTL/bounded cleanup; document current single-instance limit and future shared-store requirement |
| Guard-level parsing mutates body unexpectedly | Replace body only with schema-normalized credentials and cover trimming in tests |
| Generated contract/type drift | Export OpenAPI, verify shared package, regenerate frontend types |
| Existing dirty user work is overwritten | Re-read before patching; do not touch `marketing-header.tsx`; merge only scoped `PLANS.md` entries |
| Rate-limit test temporarily blocks the shared account | Run rate-limit tests last or use isolated IP/config; wait for configured window before final valid-login verification |

## 6. Execution order and approval boundary

Recommended order:

1. RED reproduction.
2. `canRefresh` metadata.
3. Proxy fix.
4. Re-run the four previously blocked frontend cases.
5. Logout bearer-contract alignment.
6. Refresh idempotency forwarding/retention.
7. Empty-body validation normalization.
8. OpenAPI/type synchronization.
9. Full validation and documentation.

No implementation, package change, dependency installation, commit, or push is authorized by this plan alone. Begin code changes only after the user explicitly approves this scope.
