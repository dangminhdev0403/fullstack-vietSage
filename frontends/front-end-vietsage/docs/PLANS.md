## [complete] 2026-07-21 - Mission: staff-rooms-pagination-and-animation

- Added server-side rooms pagination with a limit of 20 rooms per page.
- Created BFF route handler for staff room listing `/api/hotel-ops/hotels/[hotelId]/rooms` to proxy paginated and filtered list requests.
- Integrated TanStack Query (`useQuery`) in `StaffRoomsClient` with debounced search query input, keeping filters, header, summary, and check-in panels intact.
- Implemented `placeholderData: keepPreviousData` to prevent UI flickering during page transitions and filters.
- Added pagination controls (`< Prev 1 2 3 ... Next >`) and a loading overlay spinner on the room grid.
- Implemented Y-offset slide-in and fade-in entrance animation (duration: 240ms, ease-out) for the Quick Check-in panel.
- Modified backend `listRooms` to filter by floor, type, and VIP status on the database level, returning unique floors, unique types, and total available rooms.

Verification result:
- Backend `npm run build` compiled successfully.
- Frontend `npm run smoke:build` compiled successfully.
- ESLint and React hooks dependency warnings were resolved.

Remaining manual checkpoint:
- Verify pagination and filters behavior on the UI with Representative front desk user credentials.
- Verify smooth transition when opening Quick Check-in panel.

## [complete] 2026-07-21 - Mission: staff-stitch-operations-sync

- Replaced the borrowed owner room and billing surfaces with Front Desk staff screens aligned to
  `shared/stitch_vietsage` templates for room management/check-in and payment/checkout.
- Removed the duplicated `Khách đến` staff tab and route; arrivals now live inside
  `Phòng & check-in` beside room cards, walk-in check-in, reservation creation, room assignment,
  and reservation check-in actions.
- Kept staff scoped to an assigned hotel workspace and removed the generic operations overview
  from the Front Desk navigation; staff flows stay under `/hotels/:hotelId/*`.
- Added staff billing detail BFF routes for folio detail, items, and summary so the checkout UI
  reads backend totals before issuing invoices or collecting payment.
- Added request-center search through the existing hotel-ops BFF and preserved capability-gated
  staff actions.
- Updated dashboard attention links and quick actions to use staff-safe hotel routes instead of
  owner paths.

Verification result:

- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm run lint` passed with 10 pre-existing admin/owner unused-variable warnings and 0 errors.
- Workspace registry tests passed (6 tests).
- Shared OpenAPI verification passed after regenerating the 82-path contract and frontend API
  types.

Remaining manual checkpoint:

- Browser QA with a real Front Desk account should cover walk-in check-in, reservation check-in,
  guest QR request/note handling, checkout/payment, room status transitions, and invoice output.

## [complete] 2026-07-20 - Mission: workspace-rbac-and-staff-administration

- Replaced dynamic/raw permission navigation with the typed workspace registry as the single
  source for Admin, Owner, Manager, Front Desk, Housekeeping, Maintenance, F&B, and Finance nav.
- Added capability-filtered arrivals navigation and removed duplicate owner navigation branches.
- Added Owner staff administration with explicit tenant/hotel scope, role assignment, and hotel
  assignment; multi-tenant owners must select a tenant before data loads.
- Expanded Admin users into separate Owner and Hotel Staff tabs with tenant-scoped role and hotel
  assignment management.
- Kept view-only RBAC surfaces read-only; mutation controls render only with
  `hotel.staff.manage`.
- Changed Admin permission browsing to fetch only the selected permission module instead of
  preloading every module page.
- Added same-origin BFF routes and TanStack Query invalidation for staff mutations; no raw backend
  tokens are exposed to client components.

Verification result:

- Workspace registry tests passed (6 tests).
- `pnpm exec tsc --noEmit --pretty false` and `pnpm run lint` passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build` passed and emitted 35 pages.
- Frontend OpenAPI types were regenerated from the 80-path shared contract.

Remaining manual checkpoint:

- Run the authenticated Admin/Owner/Front Desk/operations matrix in the handoff after applying the
  database migration.

## [complete] 2026-07-20 - Mission: workspace-v2-service-boundaries (P3)

- Moved Staff dashboard request/service orchestration out of the App Router page into a
  Hotel Operations server loader.
- Kept Workspace responsible for persona, capability, widget, and hotel-scope decisions while
  Hotel Operations owns endpoint orchestration and dashboard data mapping.
- Preserved existing routes, API contracts, authorization behavior, and UI output.
- Aligned the frontend boundary guide with the backend public-port rules used by P3.

Verification result:

- Workspace/auth Node tests passed (10 tests).
- `pnpm exec tsc --noEmit --pretty false` and `pnpm run lint` passed.
- `pnpm run build` passed and emitted all 34 pages.
- Auth session contract and refresh smoke harnesses passed.

Remaining manual checkpoint:

- Pull the final branch locally and run the authenticated role matrix described in the handoff.

## [complete] 2026-07-20 - Mission: workspace-v2-dashboard-registry (P2)

- Promoted the P1 workspace configuration into an immutable dashboard registry with typed role aliases, navigation entries, and dashboard widgets.
- Added `createWorkspaceRegistry(extensions)` as the controlled extension point for new role aliases, navigation, and widgets without editing page-level condition trees.
- Registry extensions fail closed on duplicate keys unless replacement is explicitly requested.
- Centralized capability and explicit hotel-scope filtering for both navigation and dashboard widgets.
- Migrated the Admin module cards and Staff metrics/request feed/service counters to registry-driven visibility and data loading.
- Kept existing persona routes, layout language, API contracts, and backend authorization boundaries unchanged.
- Added focused tests for capability filtering, required hotel scope, extension registration, role aliases, and duplicate-key protection.

Verification result:

- Workspace/auth Node tests passed (10 tests).
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm run lint` passed.
- `pnpm run build` passed and emitted all 34 pages, including the persona dashboard routes.
- Auth session contract and refresh smoke harnesses passed.

Remaining blockers/risks and next checkpoint:

- Authenticated browser QA remains required with representative accounts and real hotel assignments.
- New widget data sources must still be backed by explicit API contracts; the registry controls composition and visibility, not backend authorization.
- A future plugin/module loader may compose registry extensions at application bootstrap, but runtime remote module loading is intentionally outside P2.

## [complete] 2026-07-19 - Mission: workspace-v2-persona-dashboards (P1)

- Added a shared `WorkspaceShell` for Admin, Owner, Manager, Front Desk, and Operations surfaces while preserving the existing visual language and route-level business components.
- Added a single workspace registry for persona labels, default routes, capability-filtered navigation, and future role extension.
- Replaced the hotel-operations content previously shown on the Admin dashboard with a platform-only control center for hotels, tenant owners, roles, and permissions.
- Kept the Owner dashboard and hotel workflows intact behind the shared shell.
- Added dedicated staff dashboard routes: `/staff/manager`, `/staff/front-desk`, and `/staff/operations`; `/staff` remains the compatible explicit hotel selector/workspace entry.
- Staff pages now load only request/service data allowed by the active persona capabilities, and service-management actions are not rendered or fetched for Front Desk/Operations without permission.
- Added compact mobile workspace navigation; desktop navigation retains the inherited sidebar layout.
- Updated role-default routing so established role codes enter their persona dashboard rather than the generic staff root.

Verification result:

- Workspace/auth Node tests passed (7 tests).
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm run lint` passed.
- `pnpm run build` passed and emitted all 34 pages, including the three new staff persona routes.
- Auth session contract and refresh smoke harnesses passed.

Remaining blockers/risks and next checkpoint:

- Authenticated browser QA is still required with real Manager, Front Desk, Housekeeping/Maintenance, Finance, Owner, and Admin accounts.
- Operations request filtering remains constrained by the current backend request-list contract; the UI does not invent department/assignee filtering that the API does not expose.
- P2 should focus on authenticated QA, missing dashboard data contracts, and measured module-boundary hardening before any physical microservice extraction.

## [complete] 2026-07-19 - Mission: workspace-v2-active-context (P0-A)

- Consumed the session's `activeRole` and capabilities from `GET /auth/me` without placing raw tokens, capability lists, or hotel lists in the browser session cookie; only the compact active role code is retained for route UX.
- Updated protected admin/owner/staff/hotel layouts and login redirects to use the active role instead of merging all assigned roles.
- Kept navigation fail-closed when capability/menu data is empty or unavailable.
- Replaced the hotel-scope authorization stubs with capability + assignment checks and required staff to choose an allowed hotel explicitly through URL state; the first assigned hotel is never inferred.
- Added reusable persona/context utilities for platform admin, owner, manager, front desk, housekeeping, maintenance, and finance.

Verification result:

- `node --test src/features/auth/utils/auth-role.test.ts src/features/workspace/utils/workspace-context.test.ts` passed (5 tests).
- `node scripts/auth-session-contract-smoke.mjs` and `node scripts/auth-refresh-smoke.mjs` passed.
- `pnpm exec tsc --noEmit --pretty false`, `pnpm run lint`, and `pnpm run build` passed.
- Backend verification is recorded in `services/docs/PLANS.md`; OpenAPI export and shared contract verification passed.

Remaining blockers/risks and next checkpoint:

- Existing browser sessions created before this change lack `activeRoleCode` and will be sent through one safe re-login.
- Authenticated browser QA for the hotel selector remains required because this environment has no user session.
- P0-B is complete: backend resource actor checks now receive the session-bound active role and cannot inherit resource-scope elevation from another role. P1 is next: introduce the shared persona-aware `WorkspaceShell` while preserving the current layout and centralizing labels/navigation.

## [complete] 2026-06-06 - Owner hotels React Query list cache

- Added TanStack Query to the frontend and registered a shared `ReactQueryProvider` in the root layout.
- Moved `/owner/hotels` hotel-list loading from server props into a cached `useOwnerHotelsQuery` hook under `src/features/owner/queries`.
- Updated the owner hotels client to render `GET /api/owner/hotels` data, show loading/error states, support manual refresh, and keep local search filtering over cached results.
- Kept the internal owner API route as the authenticated proxy to backend `GET /hotels`, so the browser does not call the backend directly or send `tenantId`.

Verification result:

- `pnpm exec eslint --% src/app/layout.tsx src/app/_components/react-query-provider.tsx "src/app/(vietsage)/owner/hotels/page.tsx" "src/app/(vietsage)/owner/hotels/owner-hotels-client.tsx" src/features/owner/queries/use-owner-hotels-query.ts` passed.
- `pnpm exec tsc --noEmit` passed.

Remaining blockers/risks:

- `pnpm build` reached the final TypeScript completion line in this runner but did not emit a clear exit-code footer; `tsc --noEmit` was used as the reliable type validation fallback.
- The worktree already contains many unrelated modified/untracked files; only the owner hotels/query-provider/package/doc changes are part of this task.
# PROJECT PLANS

Last Updated: 2026-06-04

---

# Active Plan

Status labels:

- complete: item delivered and verified.
- processing: item is being worked on or follow-up is still needed.

## [processing] Frontend foundation and management system development

- Scope: continue stabilizing auth flows, routing governance, and core UX foundations.
- Current focus: desktop responsiveness and visual quality uplift for key guest-facing pages.

## [processing] Cross-device visual QA and cache verification

- Validate login/register/guest pages on mobile and desktop breakpoints.
- Confirm stale browser cache issues are cleared with hard-refresh guidance.

## [processing] Staff route UX completion and RBAC hardening follow-up

- Implement and validate missing staff route screens.
- Prepare upgrade path from role-based checks to permission-key checks when backend exposes permission claims.

---

# Execution Log

## [complete] 2026-07-16 - Mission: landing-motion-continuity

- Changed marketing reveals to remain visible after their first viewport entry, preventing sections from disappearing and replaying while users scroll back and forth.
- Prepared already-visible elements before enabling motion styles to remove the post-hydration opacity flash.
- Added distinct fade, scale, directional, and CTA reveal choreography while keeping mobile movement shorter and preserving reduced-motion behavior.
- Replaced direct fixed-background swaps with layered opacity crossfades and stabilized scene selection around a single viewport focus line.
- Added a focused no-dependency regression harness for reveal permanence, hydration safety, choreography variety, backdrop layering, and reduced-motion visibility.

Verification result:

- `node --test scripts/marketing-motion-smoke.test.mjs` passed with 5 tests.
- Focused ESLint for the landing motion files and regression harness passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed; Next.js emitted only the existing Node localStorage experimental warning.
- Browser QA confirmed reveal elements remain visible after reverse scrolling, scene backdrops crossfade to the active section, and the Operations layout has no measured navbar overlap.

Remaining blockers/risks:

- Motion timing should still be sampled on lower-powered physical mobile devices because automated desktop emulation cannot fully represent GPU and touch-scroll behavior.
- Existing unrelated worktree files outside the frontend landing scope were preserved.

## [complete] 2026-07-15 - Production secure Auth.js session cookie reader

- Fixed the server-only Auth.js JWT reader to select `__Secure-authjs.session-token` for HTTPS requests while preserving `authjs.session-token` for local HTTP development.
- Added explicit support for chunked secure session cookies and a focused regression test for HTTPS, HTTP, cookie-driven fallback, and forwarded-header behavior.
- Kept raw access and refresh tokens server-only; no token fields were added to the browser-visible Auth.js session.

Verification result:

- `node --test src/lib/auth-cookie-policy.test.ts` passed with 4 tests.
- `node scripts/auth-session-contract-smoke.mjs` passed all auth session contract checks.
- `node scripts/auth-refresh-smoke.mjs` passed success and refresh-failure scenarios.
- `npm run lint` passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed with the existing Node localStorage experimental warning only.
- Production image build result is recorded separately after the committed source is pulled on the VPS.

Remaining blockers/risks:

- The new frontend image must pass production health checks and real admin/tenant login verification before traffic cutover.
- Production cutover remains a separate explicit confirmation checkpoint with the current frontend image retained for rollback.

## [complete] 2026-07-14 - Landing motion refactor

- Replaced mount-time animation on all landing sections with one shared `IntersectionObserver` reveal controller that animates content only as it enters the viewport.
- Added intentional hero sequencing, card/logo stagger, smoother navigation and CTA interactions, FAQ feedback, and focus-visible states without adding a motion dependency.
- Removed the large continuously drifting device animation, slowed decorative orb movement, disabled continuous decoration motion on mobile, and limited primary reveals to compositor-friendly opacity/transform changes.
- Preserved progressive enhancement and added full `prefers-reduced-motion` handling so content remains visible when motion is disabled or the observer is unavailable.

Verification result:

- `git diff --check -- src/app/page.tsx src/app/globals.css src/components/marketing/marketing-shell.tsx src/components/marketing/marketing-motion-root.tsx` passed with line-ending warnings only.
- Focused ESLint and TypeScript checks could not run in the workspace sandbox because Windows returned `EPERM` while reading executables under `node_modules`; the requested unsandboxed validation was not approved.

Remaining blockers/risks:

- Run focused lint/typecheck and a browser smoke pass on desktop/mobile when executable access is available; no package or backend changes were made.

## [complete] 2026-07-13 - Auth.js JWT reader Turbopack compatibility

- Replaced the static named `next-auth/jwt` `getToken` import in the server-only session token helper with a focused `createRequire` compatibility loader.
- Preserved raw token access behind `server-only`; browser `/api/auth/session` remains limited to safe session metadata.
- Kept `/api/auth/refresh-session` missing-refresh-token handling on the existing `401` path while leaving unexpected helper failures as server errors.

Verification result:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `git diff --check` passed with line-ending warnings only.
- Node sanity check confirmed `next-auth/jwt` exposes `getToken` as a function through the compatibility loader path.

Remaining blockers/risks:

- No code blocker identified. Runtime browser smoke against the already-running dev server is still recommended to verify the real Auth.js cookie refresh flow end-to-end.

## [complete] 2026-07-13 - Phase 8 cleanup flags and final docs alignment

- Removed the stale backend 401 retry config flag and the no-op auth-refresh bypass request option from browser transport code.
- Removed guest service auth-refresh bypass call-site flags; guest/public flows now rely on `isPublic`, public allowlist behavior, or plain bearer transport behavior.
- Aligned API transport rules to pure `http-client` / pure `http-server` boundaries and documented `internal-api-client` as the same-origin browser BFF refresh owner.
- Kept `accessTokenExpiresAt` intentionally as session metadata and future cleanup surface; it is not a transport refresh owner.

Verification result:

- `node scripts/auth-refresh-smoke.mjs` passed.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed; Next.js emitted the known localStorage experimental warning.
- `git diff --check` passed with line-ending warnings only.
- UTF-8 scan for touched docs/src files returned `bad_utf8_count 0`.
- Stale retry/bypass flag search across `src` and current docs returned no active implementation matches.
- Browser transport invariant search confirmed `src/core/http/http-client.ts` has no refresh helpers, navigation side effects, logout dispatch, or refresh-route coupling.
- Current transport docs no longer describe `http-client.ts` as the browser auth-refresh owner.

Remaining blockers/risks:

- No Phase 8 blockers identified. `accessTokenExpiresAt` remains intentionally as session metadata/future cleanup, not a transport refresh owner.

## [complete] 2026-07-13 - Phase 7 concurrency refresh smoke harness

- Added `scripts/auth-refresh-smoke.mjs`, a no-dependency Node harness that deterministically simulates concurrent browser BFF `401` recovery, single-flight refresh, one retry per logical request, and one logout-required signal on refresh failure.
- Updated frontend smoke documentation with the script command, the exact guarantees it covers, and manual browser QA steps for real Auth.js cookies and backend refresh-token validation.

Verification result:

- `node scripts/auth-refresh-smoke.mjs` passed.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `git diff --check` passed with line-ending warnings only.
- UTF-8 scan for touched docs/scripts files returned `bad_utf8_count 0`.

Remaining blockers/risks:

- The harness validates the frontend recovery algorithm against a deterministic mock server only; manual browser QA remains required for real cookie expiry, Auth.js session behavior, and backend refresh-token rotation.

## [complete] 2026-07-13 - Phase 6 hard refresh failure and callback safety smoke pass

- Added shared internal callback sanitization that only accepts same-origin relative paths beginning with a single `/`, rejects protocol-relative and absolute external URLs, and removes nested `callbackUrl` query values.
- Applied sanitized callback handling to proxy login redirects, proxy refresh-session redirects, and `/api/auth/refresh-session` GET/POST redirect construction.
- Changed browser BFF `POST /api/auth/refresh-session` expected refresh failures, including missing/revoked refresh-token cases, to return `401` JSON envelopes without raw token fields; unexpected failures remain `500`.
- Documented manual smoke coverage for stale Auth.js cookie cleanup, missing/revoked refresh tokens, callback nesting/external rejection, and single logout-required signaling.

Verification result:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed; Next.js emitted the known localStorage experimental warning.
- `git diff --check` passed with line-ending warnings only.
- Callback sanitizer invariant search returned no naive `callbackUrl?.startsWith("/")` acceptance in `src/app/api/auth/refresh-session/route.ts` or `src/proxy.ts`.
- `rg "serverErrorResponse\(\)" src/app/api/auth/refresh-session/route.ts` shows `500` remains only for the unexpected-error branch after expected refresh failures are classified as `401`.
- `rg "accessToken|refreshToken" src/app/api/auth/refresh-session/route.ts` shows token variables/metadata only; the JSON response exposes only `accessTokenExpiresAt`, not raw tokens.
- UTF-8 scan for touched `src` and `docs` files returned `bad_utf8_count 0`.

Remaining blockers/risks:

- Manual browser smoke is still required to observe real cookie expiration behavior, revoked backend refresh-token behavior, and single logout-required dispatch under concurrent BFF failures.

## [complete] 2026-07-13 - Phase 1 Auth session token privacy

- Removed raw `accessToken` and `refreshToken` from the client-visible Auth.js `Session` shape and session callback output.
- Added server-only JWT token access in `src/lib/server-session-tokens.ts` using `next-auth/jwt` `getToken`, keeping raw token reads behind `server-only`.
- Updated server refresh, BFF owner auth, server HTTP auth, protected layouts, and server pages to read/rotate raw tokens from server-only helpers instead of `/api/auth/session` data.
- Preserved JWT-held raw tokens for HttpOnly/encrypted Auth.js cookie rotation while keeping `/api/auth/session` limited to safe metadata.
- Fixed one Codex-introduced UTF-8 mojibake regression in `src/app/(vietsage)/owner/hotels/page.tsx` before final verification.

Verification result:

- `rg "session\\.accessToken|session\\.refreshToken|accessToken=\\{session\\.accessToken|refreshToken=\\{session\\.refreshToken" src` returned no raw `session.accessToken` / `session.refreshToken` reads.
- `rg "accessToken: session\\.accessToken|refreshToken: session\\.refreshToken" src` returned no matches.
- UTF-8 scan over `src` returned `bad_utf8_count 0`.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed; Next.js emitted the known localStorage experimental warning.
- `git diff --check` passed.

Remaining blockers/risks:

- Some client components still receive a raw access token from server-only JWT helpers for hotel operations where full same-origin BFF migration is not complete. This is now documented as the planned BFF migration scope after transport cleanup; those tokens no longer come from client-visible Auth.js `Session` or `/api/auth/session`.

## [complete] 2026-07-13 - Phase 2 pure server HTTP transport

- Refactored `src/core/http/http-server.ts` into a pure server transport: callers now provide explicit `accessToken` or `Authorization` headers, non-2xx responses throw `HttpError`, and the transport no longer reads session/JWT data, refreshes tokens, or maps `403 GET` to `notFound()`.
- Updated admin and RBAC service fallback paths to read server-only JWT tokens outside the transport and pass `accessToken` explicitly into `httpServer`.

Verification result:

- `rg "notFound|refreshAndSaveSessionTokens|readServerSessionTokens|auth\(|next/navigation" src/core/http/http-server.ts` returned no matches.
- `rg "isAuth:\s*true|httpServer\.request|httpServer\.get|httpServer\.post|httpServer\.put|httpServer\.patch|httpServer\.delete" src` returned only the two expected direct `httpServer.request` service fallback call sites.
- `rg "session\.accessToken|session\.refreshToken" src` returned no raw token matches; only `session.accessTokenExpiresAt` metadata matches.
- `npm run lint` passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed; Next.js emitted the known localStorage experimental warning.
- `git diff --check` passed.

Remaining blockers/risks:

- Browser `src/core/http/http-client.ts` still owned browser-side refresh/logging side effects at this point and remained the planned Phase 3 scope.

## [complete] 2026-07-13 - Phase 3/4/5 browser transport, BFF migration, and realtime token policy

- Refactored `src/core/http/http-client.ts` into a pure browser/backend transport: it now only builds requests, attaches an explicit bearer token when provided for non-public paths, parses/logs responses, and throws `HttpError` for non-OK responses.
- Removed browser auth refresh ownership, 401 retry loops, logout event dispatching, and client navigation side effects from `HttpClient`; `accessTokenExpiresAt` remained accepted as deprecated no-op compatibility metadata.
- Migrated staff hotel service catalog and request detail Client Components from raw token props to existing same-origin owner BFF routes through `requestInternalApi` / `requestInternalApiEnvelope`.
- Removed raw owner realtime token payload usage from browser realtime hooks and disabled owner realtime subscription by default until a safe scoped realtime credential exists.

Verification result:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed; Next.js emitted the known localStorage experimental warning.
- `git diff --check` passed with line-ending warnings only.
- The browser transport invariant search returned no refresh helpers, navigation, logout dispatch, retry config, or refresh-session matches in `src/core/http/http-client.ts`.
- Scoped client-prop checks confirmed the concrete hotel service catalog and request detail pages no longer pass `tokens.accessToken` into Client Components; broader `src/app/(vietsage)` matches remain server-side data-loading/navigation call sites.
- `owner:join_hotel_requests` emits only `{ hotelId }`; no `accessToken` is included in the socket payload, and owner realtime subscriptions are disabled by default.
- UTF-8 scan over `src/**/*.{ts,tsx,js,jsx,css,md,json}` returned `bad_utf8_count 0`; focused mojibake pattern search returned no matches.

Remaining blockers/risks:

- Owner realtime remains disabled by default for browser owner/staff surfaces until backend/BFF provides a scoped realtime join token or cookie-authenticated socket join path that does not expose raw Auth.js/backend access tokens.
- Other `src/app/(vietsage)` server pages still pass server-only raw tokens into server-side data loaders and navigation resolution; those are not Client Component raw-token props in this phase.

## [complete] 2026-07-13 - Phase 0 documentation path hygiene

- Replaced stale markdown references to the old frontend folder name with `frontends/front-end-vietsage` in active documentation.
- Updated Windows path snippets to use `.\frontends\front-end-vietsage`.

Verification result:

- `git diff --check` passed.
- `rg -n "[f]ont-end-vietsage" --glob "*.md"` returned no matches.

Remaining blockers/risks:

- No blockers identified; this was a docs-only path hygiene pass.

## [complete] 2026-07-13 - Delegation-aware approval rule for Codex workers

- Updated root `docs/RULES.md` so direct user-facing sessions remain guarded, while delegated specialist/đệ/Kanban/Codex workers may execute when the launch prompt states user/Hermes already approved the scoped task.
- Updated `frontends/front-end-vietsage/docs/RULES.md` to reference the delegation-aware approval rule and avoid asking for another interactive `CHO PHÉP SỬA` inside Codex after Hermes/user approval.
- Clarified that stale Codex approval guards should be handled by restarting Codex with approved execution context at the top of the prompt.

Verification result:

- Workspace markdown search found no remaining active old approval-guard wording outside the new delegation-aware rule.
- `git diff --check -- docs/RULES.md frontends/front-end-vietsage/docs/RULES.md` passed.

Remaining blockers/risks:

- Existing already-running Codex processes must be restarted to pick up the updated docs/profile instructions.

## [complete] 2026-07-13 - Mission: Frontend auth HTTP stabilization

- Added browser-side single-flight refresh coordination for same-origin BFF calls through `src/core/http/internal-session-refresh.ts`.
- Refactored `src/core/http/internal-api-client.ts` to use same-origin `fetch` with credentials for `/api/...` calls, retry exactly once after `401` via `POST /api/auth/refresh-session`, and emit a single logout-required signal when refresh/retry fails.
- Kept `/api/auth/refresh-session` browser response limited to `accessTokenExpiresAt`, and changed `/api/auth/refresh` compatibility output to stop returning raw `accessToken` / `refreshToken`.
- Updated `AuthRefreshGate` to schedule background refresh without blanking protected UI while the refresh is in progress.
- Extended proxy auth cookie cleanup to include Auth.js v5 `authjs` cookie prefixes and chunks.

Verification result:

- `CI=true pnpm install --frozen-lockfile` restored the local `node_modules` tree from the existing lockfile after the renamed checkout had broken package links.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed; Next.js emitted only the known Node localStorage experimental warning during static generation.

Remaining blockers/risks:

- `session.accessToken` and `session.refreshToken` remain present for current server-only call sites; removing them globally needs a broader server-only token replacement pass.

## [complete] 2026-06-13 - Mission: GuestOS top-left menu removal

- Removed the top-left hamburger control from GuestOS Home, Services, and Requests pages by disabling the shared top-bar left control for those screens.

Verification result:

- `pnpm exec eslint --% "src/app/(vietsage)/g/home/page.tsx" "src/app/(vietsage)/g/services/page.tsx" "src/app/(vietsage)/g/requests/page.tsx"` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `GET http://localhost:3000/g/services` returned `200`.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-06-13 - Mission: GuestOS service mobile grid refactor

- Refactored the GuestOS service category card markup into a reusable `ServiceTile` component.
- Reorganized the service category grid into 3 columns on mobile while preserving the richer 3-column desktop/tablet presentation.
- Compact mobile tiles now show icon, service name, and action cue, with descriptions shown from desktop/tablet sizing to prevent cramped mobile rows.

Verification result:

- `pnpm exec eslint --% "src/app/(vietsage)/g/services/page.tsx"` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `GET http://localhost:3000/g/services` returned `200`.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-06-13 - Mission: GuestOS language/home button cleanup

- Removed the secondary `Bỏ qua` action from the GuestOS language-selection screen.
- Removed the gray `QR {qrCode}` action button from the GuestOS Home hero action area.

Verification result:

- `pnpm exec eslint --% "src/app/(vietsage)/g/[qrCode]/page.tsx" "src/app/(vietsage)/g/home/page.tsx"` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `GET http://localhost:3000/g/demo-room-402` and `GET http://localhost:3000/g/home` returned `200`.

Remaining blockers/risks:

- The language-selection hero still shows a small non-button QR badge for context.

## [complete] 2026-06-13 - Mission: GuestOS image host config

- Added `images.unsplash.com` to `next.config.ts` image remote patterns so GuestOS template thumbnails can render through `next/image`.

Verification result:

- `pnpm exec eslint --% next.config.ts "src/app/(vietsage)/g/services/page.tsx"` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `GET http://localhost:3000/g/services` returned `200`.

Remaining blockers/risks:

- If the current dev server was already running before this config change, restart it if the browser still shows the old unconfigured-host error.

## [complete] 2026-06-13 - Mission: GuestOS local entry flow

- Added a dedicated persisted GuestOS Zustand store at `src/features/guest-os/store/guest-store.ts` with `qrCode`, `language`, `setQrCode`, `setLanguage`, and `clearSession`.
- Implemented `/g/[qrCode]` as a local QR entry and first-visit language selection flow using `templates/guest_ui/vietsage-language-page.html` as the visual reference.
- Added `/g/home` as the Guest Home step using the existing guest welcome template direction.
- Reworked `/g/services` and `/g/requests` to use static local template-based data only, with no backend API integration.
- Updated the GuestOS bottom navigation to support the requested Home -> Services -> Requests flow.
- Added local `VsIcon` glyphs for QR scanning and info states used by the flow.

Verification result:

- `rg -n "guestOsService|useGuestSession|getStoredGuestSession|setStoredGuestSession|sessionToken|/api/guest|fetch\(|sessionStorage" "src/app/(vietsage)/g" "src/features/guest-os/store"` returned no matches.
- `pnpm exec eslint --% "src/features/guest-os/store/guest-store.ts" "src/app/(vietsage)/_components/vs-bottom-nav.tsx" "src/app/(vietsage)/_components/vs-icon.tsx" "src/app/(vietsage)/g/[qrCode]/page.tsx" "src/app/(vietsage)/g/home/page.tsx" "src/app/(vietsage)/g/services/page.tsx" "src/app/(vietsage)/g/requests/page.tsx"` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.

Remaining blockers/risks:

- The requested `src/templates/guest_ui` path does not exist in this checkout; the implementation reused the available `templates/guest_ui` HTML templates instead.
- Backend API integration is intentionally not connected yet per scope.

## [complete] 2026-06-13 - Mission: Zustand state rule

- Checked project dependency and usage status: `zustand` is installed at `^5.0.14`, but no Zustand stores are currently implemented.
- Found existing direct browser storage usage in guest session storage utilities and an admin unauthorized counter flow.
- Updated `docs/RULES.md` to require Zustand for global client state, shared UI state, and storage-backed client state while preserving TanStack Query as the server-state cache.
- Documented that shared/persistent browser state should use Zustand `persist` / `createJSONStorage` or a dedicated storage utility used by the store, rather than direct component-level `localStorage` / `sessionStorage` access.

Verification result:

- `rg -n "zustand|createJSONStorage|persist\(|use.*Store|localStorage|sessionStorage" .` confirmed Zustand dependency and current storage usage points.
- Documentation-only rule update; no runtime build required.

Remaining blockers/risks:

- Existing storage utilities were not migrated in this task; future shared/persistent state work should introduce Zustand stores according to the new rule.

## [complete] 2026-06-04 - Mission: admin code sequences CRUD

- Added `/admin/codes` for managing backend Code sequence records with server-preloaded list data.
- Added manual Code sequence contract types and `AdminService` methods for `GET /codes`, `GET /codes/:id`, `POST /codes`, and `PATCH /codes/:id`.
- Added internal admin Route Handlers for create, fetch-by-id, and update flows under `/api/admin/codes`.
- Added the admin codes client UI with search, active filter, create/edit dialogs, backend validation error display, and no delete/status-only actions.
- Added navigation resolution for backend `codes` menu entries and `/admin/dashboard?tab=codes` redirects.

Verification result:

- `pnpm exec tsc --noEmit` passed.
- `pnpm exec eslint --% src/features/admin/types/admin-contract.ts src/features/admin/service/admin-service.ts src/lib/frontend-navigation.ts "src/app/(vietsage)/admin/dashboard/page.tsx" "src/app/(vietsage)/admin/codes/page.tsx" "src/app/(vietsage)/admin/codes/codes-admin-client.tsx" src/app/api/admin/codes/route.ts "src/app/api/admin/codes/[codeId]/route.ts"` passed.
- `rg -n "fetch\(" src/app src/features src/lib src/core/http` reports raw `fetch` only inside central HTTP transport files.
- Confirmed no delete action or `/codes/:id/status` route was added for the codes module.

Remaining blockers/risks:

- Browser/API verification is still recommended against the live backend for duplicate-name `409`, missing-code `404`, and the exact `/codes` list response shape.

## [complete] 2026-06-04 - Mission: cleanup junk files and centralize internal API calls

- Removed generated junk artifacts from the project root, including tracked build/dev log files and regenerated TypeScript build info.
- Added `src/core/http/internal-api-client.ts` as a browser-only internal Route Handler wrapper backed by the central `HttpClient` transport.
- Replaced raw internal API `fetch` calls in admin hotels, tenant owners, roles, permissions, and auth refresh gate client flows with the central HTTP transport wrapper.
- Preserved existing 401 redirect/error behavior while routing requests through `HttpClient`.
- Removed unused permission preset scaffolding from the permissions browser to clear focused lint warnings in the touched module.
- Confirmed the active documentation target for this mission is `docs/PLANS.md`.

Verification result:

- `pnpm exec tsc --noEmit` passed.
- `pnpm exec eslint --% src/core/http/internal-api-client.ts "src/app/(vietsage)/_components/auth-refresh-gate.tsx" "src/app/(vietsage)/admin/hotels/hotels-admin-client.tsx" "src/app/(vietsage)/admin/users/tenant-owners-client.tsx" "src/app/(vietsage)/admin/roles/_components/roles-live-filter.tsx" "src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx"` passed.
- `rg -n "fetch\(" src/app src/features src/lib src/core/http` now reports raw `fetch` only inside `src/core/http/http-client.ts` and `src/core/http/http-server.ts`.

Remaining blockers/risks:

- No functional blockers identified.
- Existing unrelated documentation changes outside this `docs/PLANS.md` mission log were left intact.

## [complete] 2026-06-04 - Mission planning and git commit rules added

- Updated `docs/RULES.md` to require a short mission name for each implementation task.
- Added a rule to keep the working plan aligned to the mission until completion.
- Added mandatory git commit guidance:
  - inspect `git status --short` before committing.
  - avoid including unrelated modified/untracked files.
  - never revert user changes unless explicitly requested.
  - keep commits scoped to the mission and completed plan.
  - use clear conventional commit-style messages when no stricter project commit format is provided.

Verification result:

- Documentation-only update; no build required.
- Verified by reading `docs/RULES.md` and updating this completion log.

Remaining blockers/risks:

- No functional blockers; commit-message format may be refined later if a stricter repository convention is introduced.

## [complete] 2026-06-04 - Auth refresh boundary and HTTP transport module completed

- Completed the auth refresh stabilization module across proxy, route handler, client refresh, and server HTTP boundaries.
- Added pre-SSR refresh timing through `src/proxy.ts`, redirecting near-expired protected requests to `/api/auth/refresh-session?callbackUrl=<current-path>` before page data loading starts.
- Added `GET /api/auth/refresh-session` for cookie-writable refresh + `unstable_update`, then redirect back to the original protected route.
- Kept `POST /api/auth/refresh-session` available for client/manual refresh flows.
- Kept server-side HTTP refresh blocked outside cookie-writable boundaries with `[API_AUTH] 401_server_refresh_blocked` logging.
- Historical note: this earlier phase still kept client-side refresh in the browser HTTP layer with single-flight/cooldown behavior; later phases moved same-origin BFF refresh ownership to `internal-api-client`.
- Completed the API transport documentation rule requiring `httpClient` / `httpServer` for future backend API work.

Verification result:

- `pnpm exec tsc --noEmit` passed.
- `pnpm exec eslint src/proxy.ts src/core/http/http-client.ts src/core/http/http-server.ts src/lib/auth-session-refresh.ts src/lib/server-api-auth.ts src/lib/role-menus.ts src/features/auth/service/auth-service.ts src/features/admin/service/admin-service.ts src/features/rbac/service/rbac-service.ts src/app/api/auth/refresh-session/route.ts --% "src/app/(vietsage)/_components/auth-refresh-gate.tsx" "src/app/(vietsage)/admin/layout.tsx" "src/app/(vietsage)/staff/layout.tsx" "src/app/(vietsage)/hotels/layout.tsx"` passed.

Remaining blockers/risks:

- Browser verification is still recommended for the redirect chain on near-expired sessions: `/admin/users` -> `/api/auth/refresh-session` -> original callback route.
- The workspace still contains unrelated modified/untracked files; this module completion did not revert or normalize unrelated worktree changes.

## [complete] 2026-06-04 - Mandatory HTTP transport and docs intake rules

- Updated `docs/RULES.md` to require reading `docs/RULES.md` and relevant files in `docs/` before implementation work.
- Added a mandatory API transport rule requiring backend API calls to use the central HTTP transports:
  - `src/core/http/http-client.ts` for client-side/public API flows.
  - `src/core/http/http-server.ts` for server-side authenticated backend API calls.
- Documented that raw `fetch`/`axios` calls must not be introduced in pages, layouts, UI components, or feature services.
- Updated `docs/ARCHITECTURE.md` to mirror the `httpClient` / `httpServer` transport split and refresh boundary guidance.

Verification result:

- Documentation-only update; no build required.
- Ran targeted markdown content checks by reading `docs/RULES.md`, `docs/ARCHITECTURE.md`, and `docs/PLANS.md`.

Remaining blockers/risks:

- Rule compliance depends on future tasks following the docs intake rule before making implementation changes.

## [complete] 2026-06-02 - SweetAlert2 loading box added for save/reset operations

- Added SweetAlert2 loading box helpers (`showLoadingBox`, `closeLoadingBox`) in permission editor component.
- Integrated loading box into role-level reset flow after confirmation and before reset-success alert.
- Integrated loading box into role-level save flow while waiting for permission replace API response.
- Kept existing success/error/info SweetAlert2 behavior and button order settings.

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.

Remaining blockers/risks:

- Loading box is currently scoped to save/reset actions only.

## [complete] 2026-06-02 - SweetAlert2 confirm/cancel button order swapped

- Swapped Agree/Reject button positions in permission-page SweetAlert2 confirmation dialogs by enabling `reverseButtons: true`.
- Applied to both role-level confirmation dialogs: reset confirmation and save confirmation.

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.

Remaining blockers/risks:

- No functional blockers identified for dialog button order.

## [complete] 2026-06-02 - SweetAlert2 alerts now include OK button and auto-close

- Updated permission-page SweetAlert2 result/info alerts to include both `confirmButtonText: "OK"` and auto-close timer behavior.
- Added timer progress bar for SweetAlert2 alerts for better visual feedback.
- Kept confirmation dialogs (`Yes/Cancel`) for save/reset operations unchanged.

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.

Remaining blockers/risks:

- No functional blockers identified for alert UX behavior.

## [complete] 2026-06-02 - Save/Reset pointer fix and SweetAlert2 confirmation flow

- Added `cursor-pointer` to permission page action buttons (`Reset`, `Save changes`) so enabled actions show pointer cursor correctly.
- Added SweetAlert2 operation confirmations:
  - confirm before resetting all unsaved role permission edits
  - confirm before saving permission changes
- Replaced in-component toast notifications with SweetAlert2 dialogs for success/failure/info messages during save/reset operations.
- Added dependency `sweetalert2`.

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- SweetAlert2 dialogs are currently applied to save/reset flows in permission editor component scope.

## [complete] 2026-06-02 - Per-permission reset button in individual permission cells

- Added an individual reset control per permission row in `admin/permissions` so each permission cell can be reverted independently to backend-assigned state.
- Cell-level reset uses current server assignment as source of truth (`GET /roles/{id}/permissions` cache), without affecting other row edits.
- Reset icon button is enabled only when that specific permission differs from backend state; otherwise it stays disabled with synced tooltip.

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.

Remaining blockers/risks:

- No functional blockers identified for individual-cell reset behavior.

## [complete] 2026-06-02 - Permission page reset button usability update

- Updated `admin/permissions` reset action so `Reset` is available whenever a role is loaded (not only when unsaved changes are detected).
- Added explicit toast feedback when no reset is needed (`No changes to reset`).
- Kept `Save changes` guard unchanged (still enabled only when there are unsaved changes).

Verification result:

- `npx eslint src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx` passed successfully.

Remaining blockers/risks:

- No functional blockers identified for reset interaction.

## [complete] 2026-06-02 - Role permission detail save flow switched to full-list PUT contract

- Updated `admin/permissions` interactive browser to use backend contract exactly:
  - load checked state from `GET /roles/{id}/permissions`
  - submit final role selection to `PUT /roles/{id}/permissions` with full `permissionIds` list
  - removed read-only toggle behavior and removed grant/revoke-style mutation path from this UI flow
- Added per-role editable draft state in `role-permissions-browser` so toggle ON/OFF is derived from backend-assigned IDs and user edits only.
- Added module-level actions (`Select All`, `Disable All`) that mutate draft state locally, then persist through the same full-list PUT endpoint.
- Added active save/reset footer controls with loading state and Sonner alerts for success/failure.
- Preserved temporary debug log `[RBAC_PERMISSION_DEBUG]` to compare `totalPermissions`, `assignedPermissionsFromApi`, and `renderedActivePermissions`.
- Removed obsolete static read-only footer block from `admin/permissions/page.tsx`.

Verification result:

- `npm run lint` completed with existing pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (no errors).
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Role-permission editing is now contract-correct, but server-side permission catalog building on `admin/permissions` still preloads module pages; lazy-loading catalog data per opened module is a separate optimization task.

## [complete] 2026-06-02 - Super Admin fallback render when module catalog APIs are not allowed

- Added fallback catalog logic in `admin/permissions` so when `/roles/me/permission-modules*` is unavailable, the page falls back to selected role assignments (`GET /roles/{id}/permissions`) for rendering.
- Suppressed module-catalog warning toasts when fallback catalog is available, avoiding misleading `Not allowed` alerts while UI can still render role permissions.
- Kept existing API contracts and UI layout unchanged.

Verification result:

- `npm run lint` completed with existing pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (no errors).
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- In fallback mode, OFF toggles for permissions outside the fallback catalog cannot be shown because module catalog data is not available from backend.

## [complete] 2026-06-02 - Permissions page warning text replaced by Sonner alert package

- Added `sonner` and wired a global `Toaster` in root layout.
- Replaced plain inline warning text block on `admin/permissions` with package-based alert toasts.
- Added client alert bridge `PermissionsWarningsAlert` to emit warning toasts from server-calculated `apiWarnings`.
- Kept existing API contract unchanged and preserved page layout.

Verification result:

- `npm run lint` completed with existing pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (no errors).
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Alerts are toast-based and transient by design; warning history is not persisted in-page.

## [complete] 2026-06-02 - RBAC role-permission detail toggle truth from backend assignment

- Fixed `admin/permissions` toggle logic to derive active state strictly from assigned role-permission IDs returned by `GET /roles/{id}/permissions`.
- Added permission-catalog loading from `/roles/me/permission-modules` + `/roles/me/permission-modules/{moduleKey}/permissions` so unassigned permissions render OFF instead of being omitted/assumed active.
- Removed hardcoded toggle-on state (`checked={true}`) and replaced with `assignedPermissionIds.has(permission.id)`.
- Kept visual layout unchanged while adding safe loading guards before role-assignment data is ready.
- Added temporary debug log `[RBAC_PERMISSION_DEBUG]` with `totalPermissions`, `assignedPermissionsFromApi`, and `renderedActivePermissions`.

Verification result:

- `npm run lint` completed with existing pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (no errors).
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Module permission catalog depends on `/roles/me/permission-modules*`; if those endpoints fail, UI shows warning and cannot render full ON/OFF matrix.

## [complete] 2026-06-01 - Sync GET /roles enabledCount field in RBAC pages

- Extended RBAC role contract with optional `enabledCount` to support the new `/roles` payload shape.
- Updated roles-page mapper to use `enabledCount` as permission-count fallback when `rolePermissions` is not present.
- Updated permissions-page role mapper and role-permissions browser model to carry `enabledCount`.
- Updated permissions detail header counter to show `enabledCount` before role permissions are lazily loaded, then switch to fetched count after load.

Verification result:

- `npm run lint` completed with existing pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (no errors).
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- OpenAPI-generated `RolesController_listRoles` currently still documents `{ id, name, menus }`; contract should be regenerated when backend OpenAPI includes `enabledCount` in that endpoint schema.

## [complete] 2026-06-01 - Permissions page: remove horizontal nav and restore back button

- Removed the horizontal Access Control nav header block from `src/app/(vietsage)/admin/permissions/page.tsx` as requested.
- Added a dedicated back button (`Back to Roles List`) linking to `/admin/roles` at the top of the permissions detail content area.
- Kept role-permissions preload/fetch flow unchanged (only navigation UI adjusted).

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-06-01 - Roles page click-through to permission detail by roleId

- Updated `src/app/(vietsage)/admin/roles/page.tsx` so clicking role name and permission-count badge navigates to `/admin/permissions?roleId=<roleId>`.
- Keeps existing action icon link unchanged while making row-level role entry interaction more explicit for the role-to-permissions workflow.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-06-01 - Permission page preloads selected role permissions from Roles-page click

- Enhanced `admin/permissions` role-centric flow so query `roleId` from Roles page triggers immediate server-side preload of `GET /roles/{id}/permissions`.
- Passed preloaded permissions into `RolePermissionsBrowser` as initial cache (`initialPermissionsByRoleId`), so the selected role renders permissions immediately after navigation.
- Kept click-to-fetch behavior for other roles with per-role client cache reuse.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- If `roleId` query is invalid or not found in current role list, page falls back to manual role click fetch as a safe fallback.

## [complete] 2026-06-01 - Role-centric permissions UI (click role -> fetch role permissions)

- Reworked `admin/permissions` UX to make role list the primary interaction and remove redundant preloaded permission-module flow.
- Added client browser component `src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx`:
  - click a role chip to fetch that role permissions (`GET /roles/{id}/permissions`)
  - cache permissions per role in client state to avoid duplicate fetch on reselect
  - render permissions grouped by module after role-specific fetch completes
- Added internal route proxy `src/app/api/rbac/roles/[roleId]/permissions/route.ts` using session access token.
- Removed unused module-lazy files from the previous approach:
  - `src/app/(vietsage)/admin/permissions/_components/permission-modules-grid.tsx`
  - `src/app/api/rbac/permission-modules/[moduleKey]/permissions/route.ts`

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Superseded by the 2026-06-01 preload update above; selected role now preloads when `roleId` is provided from Roles page.

## [complete] 2026-06-01 - Permission modules lazy-load per open module with client cache

- Refactored `admin/permissions` page to stop prefetching every `/roles/me/permission-modules/{moduleKey}/permissions` endpoint on initial render.
- Added client component `src/app/(vietsage)/admin/permissions/_components/permission-modules-grid.tsx`:
  - calls module-permissions API only when a module card is opened
  - caches loaded module payloads in client state to avoid duplicate calls for reopened modules
  - keeps per-module loading and error state with retry action
- Added secure internal proxy route `src/app/api/rbac/permission-modules/[moduleKey]/permissions/route.ts`:
  - resolves current session token server-side
  - forwards paginated module-permissions requests to backend
  - enforces `limit <= 100` and returns backend-compatible error envelopes

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Module permission cache is page-lifetime memory cache; full page refresh intentionally re-fetches on next module open.

## [complete] 2026-06-01 - Single-owner refresh flow to prevent revoked refresh-token reuse

- Simplified `src/lib/server-api-auth.ts`: removed direct `/auth/refresh` fallback logic and refresh-token reads from JWT cookies.
- Delegated refresh ownership to NextAuth JWT callback only; executor now redirects to `/login?reauth=1&callbackUrl=...` when backend APIs return `401`.
- Prevents stale/rotated refresh-token reuse from server-page fallback flow, which previously caused `Refresh token is no longer active`.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- If an access token is invalid and not recoverable via current session state, users are redirected to login instead of silent per-page refresh; this is intentional for token-rotation consistency.

## [complete] 2026-06-01 - React Query API call and cache governance rule

- Added a mandatory React Query Rule section to docs/RULES.md for client-side interactive API flows.
- Standardized that API calls in page/layout/presentational components must go through TanStack Query hooks (queries/\*), not raw fetch/axios.
- Documented cache governance requirements: stable queryKey, mutation-driven invalidateQueries(...)/setQueryData(...), and enabled guards to reduce premature auth calls/401 noise.
- Clarified boundary: server-side (RSC/layout) fetching remains in server layers, while React Query governs client cache/interaction.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Rule effectiveness depends on consistent enforcement in PR review and future implementation tasks.

## [complete] 2026-06-01 - API logger success message fallback from response envelope

- Updated `src/core/http/http-client.ts` logger to read `response.message` when explicit log `message` is not provided.
- Success logs now show backend envelope message (for example, `Role permission module permissions fetched successfully`) instead of `message: undefined`.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- If an endpoint returns a non-envelope payload without `message`, log `message` remains undefined by design.

## [complete] 2026-06-01 - Module permissions pagination limit hotfix (<=100)

- Fixed permission-module fetch query to respect backend validator (`limit <= 100`) in `admin/permissions` flow.
- Replaced single `limit=500` call with paginated loading (`page=1..N`, `limit=100`) and merged all pages before rendering.
- Prevents `400 VALIDATION_ERROR` on `/roles/me/permission-modules/{moduleKey}/permissions` while preserving full module permission list.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Very large module sets increase request count because data is now fetched across multiple pages intentionally.

## [complete] 2026-06-01 - OpenAPI module permissions sync

- Ran OpenAPI type sync from `shared/api-contract/openapi/v1/openapi.json` via `npm run sync:api:types`.
- Updated RBAC contract/service to support new module-permission endpoints:
  - `GET /roles/me/permission-modules`
  - `GET /roles/me/permission-modules/{moduleKey}/permissions`
  - `POST /roles/me/permission-modules/{moduleKey}/select-all`
  - `POST /roles/me/permission-modules/{moduleKey}/disable-all`
- Updated `admin/permissions` page to prefer module-permission API payloads for permission catalog rendering, with fallback to `GET /permissions` when module endpoints are unavailable.
- Added role payload compatibility handling for both legacy role shape and new compact `/roles` shape to prevent type/runtime mismatches.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- Module-permission endpoints are currently `roles/me/*`; role-switch chips still depend on `/roles` payload and can display reduced metadata when backend returns compact role records.

## [complete] 2026-05-31 - Public routes auth hardening: strip Authorization header

- Hardened `src/core/http/http-client.ts` so public requests always remove `Authorization` header before dispatch.
- This applies even when an access token or manual `Authorization` header is passed by mistake.
- Public-route detection now uses centralized helper `isPublicApiPath(...)` + explicit `isPublic` flag.

Verification result:

- `npm run lint` passed successfully.
- `npx tsc --noEmit` passed successfully.

Remaining blockers/risks:

- If new backend public routes are added, update `src/core/http/public-api-paths.ts` to keep auth-strip behavior complete.

## [complete] 2026-05-31 - Move Select All inside module and add Disable All

- Moved module-level `Select All` control from the header area into the expanded module content block in `src/app/(vietsage)/admin/permissions/page.tsx`.
- Added a matching `Disable All` control beside `Select All` inside each module content block.
- Kept existing behavior read-only to stay consistent with the current permission preview flow.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Controls are currently status indicators (read-only) and do not mutate permission state yet.

## [complete] 2026-05-31 - Permission toggle icon up/down rotation by open state

- Updated permission module toggle icon to rotate by module open state in `src/app/(vietsage)/admin/permissions/page.tsx`.
- Closed state shows down direction; open state shows up direction with smooth transition.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-05-31 - Permission module toggle switched to icon-only

- Replaced `An/Hien` text badge in permission module headers with an icon-only indicator.
- Kept existing collapse/expand behavior unchanged.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- If needed, we can add directional rotation for the icon to reflect open/closed state.

## [complete] 2026-05-31 - Permissions grid stretch fix for collapsible modules

- Fixed CSS Grid stretch behavior in `src/app/(vietsage)/admin/permissions/page.tsx` where opening one module visually expanded neighboring module cards.
- Added `items-start` on the module grid and `self-start` on each module card (`details`) so each card keeps independent height.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.

## [complete] 2026-05-31 - Permission modules collapse/expand toggle

- Updated module cards in `src/app/(vietsage)/admin/permissions/page.tsx` to use collapsible `details/summary` sections.
- Each module now has a single header toggle (`An/Hien`) to expand or collapse its permission list.
- Preserved existing role-permission status UI and read-only toggles inside each permission row.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Module lists now default to collapsed; if you want default expanded for selected modules, we can add that rule in a follow-up.

## [complete] 2026-05-31 - Permissions list: hide route path, keep description only

- Updated Permission Bento Grid item content in `src/app/(vietsage)/admin/permissions/page.tsx` to remove visible route path (e.g. `/permissions/roles/...`).
- Kept only `description` text in each permission row as requested.
- Updated item accessibility label to use description instead of path.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- If backend returns empty descriptions, rows will show the existing fallback description generated by current mapper.

## [complete] 2026-05-31 - Access control shared nav header sync

- Created shared nav component at `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` for common Access Control header UI.
- Unified breadcrumb + title + horizontal tabs (`Danh sách Vai trò` / `Danh sách Quyền hạn`) between `admin/roles` and `admin/permissions`.
- Replaced only nav/tab blocks in both pages while preserving each page's existing data flow and content sections.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- No functional blockers identified; visual QA is recommended to confirm spacing parity on mobile and desktop.

## [complete] 2026-05-31 - Partial sync: Permission Bento Grid only

- Updated only the `Permission Bento Grid` section in `src/app/(vietsage)/admin/permissions/page.tsx` based on `templates/permision_page.html`.
- Preserved all other page sections and business logic (header, role chips, warnings, footer, data loading) without overwrite.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Grid visuals now follow template direction, but route-level behaviors remain intentionally unchanged.

## [complete] 2026-05-30 - Roles API payload diagnostics and menu parser compatibility

- Logged runtime `/roles` payload in local diagnostics and confirmed backend shape differs from generated OpenAPI expectation.
- Added server-side debug logs (`[RBAC_NAV] ...`) in navigation resolver to trace roles response, role matching, and menu generation paths.
- Extended menu resolver compatibility to support backend payload model `{ id, name, menus: string[] }` in addition to role-permission model.
- Added fallback mapping from menu slugs (e.g. `/dashboard`, `/users`, `/roles`) to navigable frontend routes so sidebar does not render empty state.

Verification result:

- `npm run lint` passed successfully.
- Manual API check confirmed current runtime payload: `{"id":"super_admin","name":"Super Admin","menus":["/dashboard","/users","/roles","/auth"]}`.

Remaining blockers/risks:

- Frontend currently maps unknown backend menu slugs to dashboard query tabs because dedicated routes for those slugs are not yet implemented.

## [complete] 2026-05-30 - Logout UI flow integration

- Added reusable client logout control at `src/app/(vietsage)/_components/vs-logout-button.tsx` using `next-auth/react` `signOut(...)`.
- Wired logout action to redirect users to `/login` after sign-out, while preserving existing backend logout event handling in NextAuth.
- Integrated logout button into profile mode of shared top bar component so authenticated pages can trigger logout directly.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Top bar in `rightMode=icons` still shows account icon only; if needed, a dedicated logout affordance can be added there as a follow-up UX pass.

## [complete] 2026-05-30 - UTF-8 text normalization for admin dashboard page

- Repaired mojibake/garbled Vietnamese text in `src/app/(vietsage)/admin/dashboard/page.tsx` by normalizing the file back to proper UTF-8 content.
- Preserved existing page logic and RBAC navigation integration; change only affects display text encoding.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- PowerShell output may still display Vietnamese incorrectly depending on terminal codepage, even when source file bytes are valid UTF-8.

## [complete] 2026-05-30 - Dynamic sidebar menu from roles API

- Removed hard-coded sample dashboard menu definitions from frontend navigation module.
- Built sidebar menu items directly from `GET /roles` response (`rolePermissions` with `GET` method + navigable app paths).
- Added automatic label/icon inference from permission metadata and path, with dedupe/sort for stable menu order.
- Updated dashboard sidebar active-state logic to compare by current path (`activePath`) so dynamic API menus highlight correctly.
- Kept fallback path: when roles API is unavailable, derive menu from `session.user.permissions` without using sample menu constants.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Menu visibility now depends on backend permission path quality; non-navigable permission paths (dynamic placeholders or non-app prefixes) are intentionally filtered out.

## [complete] 2026-05-30 - Session bearer token injection for protected backend routes

- Extended NextAuth session mapping to expose `session.accessToken` sourced from JWT token state after login/refresh.
- Updated dashboard RBAC navigation resolver to pass session bearer token into `GET /roles` requests.
- Updated admin dashboard page to forward `session.accessToken` into `resolveDashboardNavigation(...)` for authenticated role resolution.
- Updated NextAuth type augmentation so `Session` now includes `accessToken` for typed server-side consumption.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Current bearer injection is applied on server-side flow already wired for RBAC roles (`/roles`). Other future protected backend endpoints should reuse the same session token handoff pattern.

## [complete] 2026-05-30 - RBAC roles endpoint integration for dashboard navigation

- Added RBAC feature service/types wired to OpenAPI `RolesController_listRoles` and shared HTTP client.
- Added navigation resolver at `src/lib/frontend-navigation.ts` to derive dashboard sidebar items from backend `GET /roles` role-permission mappings.
- Added fallback parsing from `session.user.permissions` when `/roles` is unavailable or unauthorized, so navigation stays stable.
- Updated `src/app/(vietsage)/admin/dashboard/page.tsx` to resolve session-aware sidebar items server-side and pass them to the sidebar component.
- Refactored `src/app/(vietsage)/_components/vs-dashboard-sidebar.tsx` to accept external navigation items with a default fallback.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- `GET /roles` is currently requested without bearer token in this frontend path; if backend enforces auth for this endpoint, filtering falls back to `session.user.permissions`.

## [complete] 2026-05-29 - Register hero not visible on desktop breakpoint fix

- Investigated missing register hero image: asset endpoint and page endpoint both returned 200, so issue was layout breakpoint visibility rather than missing file.
- Fixed left hero section visibility class from hidden md:block md:w-1/2 lg:w-3/5 to hidden lg:block lg:w-3/5 so desktop breakpoint reliably enables the panel.
- Resolved transient runtime issue (`adapterFn is not a function` + `/register` 404) by terminating stale dev process, clearing `.next` cache, and restarting dev server cleanly on port 3000.
- Kept hero image source as /brand/register-hero.png and existing animation logic unchanged.

Verification result:

- npm run lint passed successfully.

Remaining blockers/risks:

- Recommend hard refresh (Ctrl+F5) once to clear stale CSS/JS cache in browser.

## [complete] 2026-05-29 - Register hero image replaced with user-provided asset

- Added user-provided hero image to public assets: public/brand/register-hero.png.
- Updated register page hero source to local asset path /brand/register-hero.png.

Verification result:

- npm run lint passed successfully.

Remaining blockers/risks:

- No functional blocker identified.

## [complete] 2026-05-29 - Register hero image/effects sync with login

- Updated src/app/(vietsage)/register/page.tsx to reuse the same hero visual direction as login page.
- Added animated hero typing/fade cycle with rotating phrases to mirror login left-panel motion language.
- Reworked register left hero section to match login treatment: full-bleed image, cinematic gradient overlay, and highlighted caret pulse.
- Kept register form validation and submission behavior unchanged.

Verification result:

- npm run lint passed successfully.

Remaining blockers/risks:

- No functional blocker identified; recommend quick visual QA on mobile + desktop to confirm final alignment with login tone.

## [complete] 2026-05-29 - Redirect loop fix for auth proxy

- Removed duplicate root-level `proxy.ts` and kept a single proxy source at `src/proxy.ts`.
- Eliminated redirect-loop risk caused by dual proxy logic paths in the same project.
- Hardened login redirect builder to prevent nested callback growth by removing existing `callbackUrl` from protected-route query before composing new login redirect.

Verification result:

- `npm run lint` passed successfully.
- `npm run build` passed with exit code `0` (captured to `build.proxy-fix.log`).

Remaining blockers/risks:

- Browser cookie state from prior loop can still trigger stale behavior until cookies/session storage are cleared once.

## [complete] 2026-05-29 - Auth module API sync (OpenAPI v1)

- Added repeatable OpenAPI type sync workflow via `openapi-typescript` with script `npm run sync:api:types`.
- Added generated contract types at `src/generated/openapi/v1.ts` sourced from `shared/api-contract/openapi/v1/openapi.json`.
- Added shared HTTP/API foundation: `HttpClient`, `HttpError`, and response envelope unwrapping helpers.
- Added auth service layer for `login`, `refresh`, `logout`, and `me`, including one-time auto-refresh retry on `401` for profile fetch.
- Replaced local demo-credential auth in `src/lib/auth.ts` with backend auth integration through NextAuth credentials provider.
- Extended JWT/session mapping with role, roles, permissions, tenants, token expiry metadata, and auth error flag.
- Added best-effort backend logout hook in NextAuth `events.signOut`.
- Updated login submit handling to map sign-in error codes to user-facing messages.
- Added env template keys: `AUTH_API_BASE_URL` and `NEXT_PUBLIC_AUTH_API_BASE_URL`.

Verification result:

- `npm run sync:api:types` passed successfully.
- `npm run lint` passed successfully.
- `npm run build` passed with exit code `0` (captured via redirected build command).

Remaining blockers/risks:

- Backend auth service must be reachable at `AUTH_API_BASE_URL`; otherwise login returns `AUTH_SERVICE_UNAVAILABLE`.
- OpenAPI contract currently declares bearer security scheme but does not mark operation/global security requirements; integration assumes bearer token for `/auth/me`.

## [complete] 2026-05-28 - Project rules sync for RBAC routing governance

- Updated `docs/RULES.md` with an `Auth & Routing Rules` section.
- Standardized RBAC routing policy source at `src/lib/rbac.ts` and proxy convention at `src/proxy.ts`.
- Documented mandatory behavior for protected routes: unauthenticated -> login redirect, unauthorized -> `404`.
- Documented callback redirect safety requirement via `resolveSafeRedirect(...)`.

Verification result:

- Markdown-only update; no runtime build/test command required.

Remaining blockers/risks:

- Rules are effective only if future tasks keep using `src/lib/rbac.ts` as the single policy source.

## [complete] 2026-05-28 - RBAC router guard + safe redirect enforcement

- Added a frontend RBAC source of truth in `src/lib/rbac.ts` with route policy matrix and role default routes.
- Added `src/proxy.ts` (Next.js 16 proxy convention) to redirect unauthenticated users from protected routes to `/login?callbackUrl=...`.
- Added proxy-layer protection to redirect authenticated users away from `/login` and `/register` to role-safe default routes.
- Added server-side guard layouts for `guest`, `admin`, and `staff` groups to enforce `notFound()` on unauthorized role access.
- Updated login redirect flow to resolve callback URLs through role-aware safety checks and avoid unsafe/path-unknown redirects.

Verification result:

- `npm run lint` passed successfully.
- `npm run build` passed successfully.

Remaining blockers/risks:

- Staff route screens are not implemented yet; staff guard is in place but full UX validation for staff pages is pending route implementation.
- Access policy is still role-based from session claims; when backend permission keys are introduced, `canAccessPath` should be upgraded to permission-based checks.

## [complete] 2026-05-27 - Legacy direct-approval guard update (superseded)

- Historical note: this entry described the older direct-user confirmation guard in `docs/RULES.md`.
- Superseded on 2026-07-13 by the delegation-aware approval rule: direct user-facing sessions remain guarded, but delegated specialist/đệ/Kanban/Codex workers do not ask for another confirmation when Hermes/user approval is already present in the launch prompt.

Verification result:

- Markdown-only update; no runtime build/test command required.

Remaining blockers/risks:

- Rule effectiveness depends on consistent adherence in future sessions.

## [complete] 2026-05-27 - API spec runtime alignment for frontend sync

- Updated `docs/API_SPEC.md` to separate current runtime implementation from planned contract endpoints.
- Aligned error shape with backend global exception filter (`code`, `message`, `details`, `requestId`, `timestamp`, `path`).
- Corrected health endpoint contract to current runtime values (`service: auth-service`, includes `uptimeSeconds`, and `x-request-id` behavior).
- Added frontend mapping notes and explicit "not implemented yet" endpoint list to reduce integration ambiguity.

Verification result:

- Markdown-only update; no runtime build/test command required.

Remaining blockers/risks:

- Planned endpoints in `docs/API_SPEC.md` are still not implemented in backend runtime and will return 404 until milestone delivery.

## [complete] 2026-05-27 - Docs governance + frontend sync validation baseline

- Added root documentation governance file at `docs/RULES.md` to centralize documentation update rules.
- Added root validation checklist at `docs/FRONTEND_SYNC_VALIDATION.md` so frontend sync tasks follow one consistent verification flow.
- Linked root validation checklist from `docs/RULES.md` to improve discoverability for frontend implementation tasks.
- Linked root rules and validation docs from `docs/ARCHITECTURE.md` for system-level navigation.

Verification result:

- Markdown-only update; no runtime build/test command required.

Remaining blockers/risks:

- Existing architecture and API docs still contain some historical assumptions and should be aligned in a dedicated follow-up pass.

## [complete] 2026-05-27 - Stitch UI/UX sync pass (VietSage only)

- Synchronized branding updates from latest VietSage Stitch screens to local Next.js shared components and routes.
- Updated shared top bar to support Stitch-style brand lockup (icon + VIETSAGE text), large brand mode, optional left control, and icon-based right actions.
- Updated affected routes to use the new top bar behavior: guest services, guest tracking, guest request detail, staff dashboard, staff requests, and admin dashboard.
- Updated admin/staff sidebar branding block with VietSage icon lockup to align with the refreshed design language.
- Added new brand icon asset extracted from latest Stitch screen output: `public/brand/vietsage-icon.png`.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- Existing text encoding artifacts are present in several page strings and should be normalized in a dedicated pass.
- Visual QA is recommended on mobile and desktop for final pixel-level alignment against Stitch screenshots.

## [complete] 2026-05-26 - Guest templates visual alignment pass

- Aligned guest-facing Next.js pages with the Stitch templates under `templates/` instead of keeping the previous custom responsive redesign.
- Updated shared guest shell styling so pages use full-width template layout, 1200px content container, fixed translucent top bar, Material Symbols, and mobile bottom navigation behavior.
- Reworked guest routes module-by-module: welcome, services, request detail, and tracking.
- Preserved routes, content intent, and existing mock-data flow; changes are presentation-focused.

Verification result:

- `pnpm lint` passed successfully.
- `pnpm build` passed successfully and generated all guest/staff/admin routes.

Remaining blockers/risks:

- Visual QA in browser is still recommended against the static HTML templates at mobile, tablet, and desktop widths.
- Admin/staff routes were intentionally not redesigned in this pass because the available templates target guest screens.

## [complete] 2026-07-06 - Cutover UX readiness boundaries and smoke scaffold

- Added shared App Router boundary UI in `src/app/(vietsage)/_components/route-boundary-state.tsx`.
- Added route-level `loading.tsx` and `error.tsx` boundaries for high-risk app sections:
  - `src/app/(vietsage)/admin`
  - `src/app/(vietsage)/owner`
  - `src/app/(vietsage)/hotels`
  - `src/app/(vietsage)/staff`
  - `src/app/(vietsage)/g`
- Added dependency-free smoke readiness scripts in `package.json`:
  - `npm run smoke:lint`
  - `npm run smoke:build`
- Added `docs/FRONTEND_SMOKE_TESTS.md` with protected-route, guest-flow, and error-boundary smoke coverage plus remaining large-component/a11y refactor backlog.
- Completed the previously incomplete `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` export to clear its unused-symbol lint warnings.

Verification result:

- `npm run smoke:lint` passed.
- `npm run lint` passed.
- `npm run smoke:build` was blocked before compilation by an existing Next.js build lock: `Another next build process is already running`. Active Node processes and `.next/lock` were present, so the lock was not removed to avoid interrupting unrelated local work.

Remaining blockers/risks:

- Re-run `npm run smoke:build` after the active/stale Next build process is resolved.
- Manual browser smoke from `docs/FRONTEND_SMOKE_TESTS.md` is still recommended for authenticated admin/owner/staff and QR-backed guest sessions.
- Large component and a11y refactors remain tracked in `docs/FRONTEND_SMOKE_TESTS.md`.

## [complete] 2026-05-26 - Project rules execution contract update

- Updated [project rules](./RULES.md) to add a mandatory execution contract for approved code tasks.
- Fixed documentation path references from placeholder names to `docs/PLANS.md` and `docs/RULES.md`.
- Fixed UI preference typo from `proudct-focused visuals` to `product-focused visuals`.
- Added explicit completion evidence requirements to prevent agents from stopping after intent/planning statements.

Verification result:

- Markdown-only update; no build or lint command required.

Remaining blockers/risks:

- Rule effectiveness depends on Codex loading and following `docs/RULES.md` before execution.

## [complete] 2026-05-26 - Guest welcome page strict template sync pass

- Synchronized [guest welcome page](<../src/app/(vietsage)/guest/welcome/page.tsx>) to the visual structure and interaction tone of [stitch_guest_welcome template](../templates/stitch_guest_welcome.html).
- Restored centered hero-canvas composition with background image overlay, focused welcome hierarchy, centered room-info card, and template-aligned dual CTA section.
- Preserved existing route boundaries, component wiring, and screen content while aligning spacing, emphasis, and card proportions to the template standard.
- Kept featured amenity cards with template-consistent overlay/hover treatment and responsive behavior.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.
- Recommend one visual QA pass on mobile + desktop to confirm final pixel-level alignment against template intent.

## [complete] 2026-05-26 - Guest welcome page desktop UX upgrade

- Updated [guest welcome page layout](<../src/app/(vietsage)/guest/welcome/page.tsx>) for desktop and large-screen breakpoints.
- Reworked section composition into a two-column hero + room summary structure on PC while preserving mobile-first flow.
- Improved spacing, hierarchy, and CTA placement to reduce empty horizontal space and improve usability on wide screens.
- Kept existing business logic and content intact; changes are presentation-only.

Verification result:

- `npm run lint` passed successfully.

Remaining blockers/risks:

- No functional blockers identified.
- Recommend running a visual QA pass across 1024px, 1280px, and 1440px widths to validate consistency with other guest pages.

## [complete] 2026-06-02 - Admin UI Vietnamese translation and UTF-8 cleanup

- Translated admin-facing UI copy to Vietnamese (ASCII-safe) across:
  - `src/app/(vietsage)/admin/dashboard/page.tsx`
  - `src/app/(vietsage)/admin/roles/page.tsx`
  - `src/app/(vietsage)/admin/permissions/page.tsx`
  - `src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx`
  - `src/app/(vietsage)/admin/permissions/_components/permission-workbench.tsx`
- Cleaned corrupted mojibake text on admin dashboard and logout button to prevent UTF-8 display issues.
- Localized shared admin UI labels in:
  - `src/app/(vietsage)/_components/vs-top-bar.tsx`
  - `src/app/(vietsage)/_components/vs-dashboard-sidebar.tsx`
  - `src/app/(vietsage)/_components/vs-logout-button.tsx`
- Localized technical warning copy shown on admin pages from `failed` to `that bai` while keeping endpoint context intact.

Verification result:

- `pnpm lint` completed with 0 errors and 4 pre-existing warnings in `src/app/(vietsage)/admin/_components/access-control-nav-header.tsx` (unused symbols).
- `pnpm exec tsc --noEmit` passed.

Remaining blockers/risks:

- `access-control-nav-header.tsx` remains unused/incomplete and still triggers lint warnings unrelated to this translation task.
- Vietnamese content is intentionally ASCII-only to avoid recurring UTF-8 rendering regressions in the current environment.

---

# Archived Legacy PLANS.md

# PROJECT PLAN

## 2026-06-05

### Roadmap: Owner Stay Management

- Added Owner Stay Management as a future milestone after Tenant Owner Management, Hotel Management, and Room Management.
- Purpose: allow tenant owners to manage active and historical guest stays within hotels they own, with operational visibility for room occupancy, guest sessions, and service requests.
- Future backend APIs:
  - `GET /hotels/:hotelId/stays`
  - `GET /hotels/:hotelId/stays/:id`
  - `POST /hotels/:hotelId/stays`
  - `PATCH /hotels/:hotelId/stays/:id`
  - `PATCH /hotels/:hotelId/stays/:id/check-in`
  - `PATCH /hotels/:hotelId/stays/:id/check-out`
- Future frontend routes:
  - `/owner/hotels/[hotelId]/stays`
  - `/owner/hotels/[hotelId]/stays/[stayId]`
- Future owner capabilities: view active stays, view stay history, check in guest, check out guest, view guest session status, and view requests associated with a stay.
- Current scope decision: do not implement backend or frontend stay screens in this milestone, do not generate mock APIs, and do not assume missing OpenAPI endpoints.
- Reason: Guest Stay is a core GuestOS domain entity and should become the parent entity for guest sessions, QR access, service requests, and stay lifecycle management after hotel and room management are complete.

## 2026-05-31

### What Changed

- Added centralized API response logging in `src/core/http/http-client.ts` for all HTTP requests.
- Added consistent response logs with prefix `[API_RES]` for both success and error flows.
- Logged required fields: `method`, `url`, `status`, `ok`, `durationMs`, `response`, and optional `message`.
- Added payload-safe logging helpers (trim long strings, cap array/object sizes, prevent deep/circular logging).
- Updated `docs/RULES.md` with a mandatory `API Logging Rule` requiring response logs.

### Verification Result

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks

- Response payload logging is sanitized but still may include sensitive business fields from backend payloads. If needed, add redaction rules for specific keys in `toLogSafePayload(...)`.
- Verbose logs can increase console noise in development; format remains centralized and can be tuned in one place.

### What Changed (Navigation Stability)

- Hardened `resolveDashboardNavigation(...)` to never return an empty sidebar menu.
- Added static role-based fallback nav when both RBAC roles payload and session permission parsing produce no items.
- Admin static fallback now includes: `Dashboard`, `Auth`, `Permissions`, `Roles`, `Users`.
- Staff/guest fallback menus were added to avoid `No menu available for this role.` on route transitions.
- Updated admin dashboard page to compute `activePath` from `searchParams.tab`, so nav active state follows route query tabs.

### Verification Result (Navigation Stability)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Navigation Stability)

- Static fallback labels for admin tab routes are currently generic and tied to dashboard-tab pattern.
- When backend RBAC payload becomes stable, static fallback can be reduced or made optional by feature flag.

### What Changed (Template Sync: Permissions + Roles)

- Synced `admin/permissions` UI to `templates/permision_page.html` layout direction:
  - role detail header
  - grouped permission cards by module
  - method badges + role-assigned toggles (read-only)
  - sticky footer action bar
- Added new `admin/roles` route synced from `templates/role_page.html` structure:
  - breadcrumb/title/actions area
  - search + module filter section
  - roles table with permission count and link to role permission detail
  - info cards section
- Updated dashboard tab redirect logic:
  - `?tab=permissions` -> `/admin/permissions`
  - `?tab=roles` -> `/admin/roles`
- Updated nav canonicalization + fallback routing:
  - canonicalized `/admin/dashboard?tab=roles` -> `/admin/roles`
  - static fallback admin nav now points to `/admin/roles` and `/admin/permissions`

### Verification Result (Template Sync: Permissions + Roles)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Template Sync: Permissions + Roles)

- Template interactions (editable switches, save/reset mutation flow) are rendered as read-only preview for now.
- If backend permission payload changes naming conventions for modules, grouping labels may need additional normalization rules.

### What Changed (401 Refresh + Logout Handling)

- Added token validation flow in `next-auth` JWT callback:
  - validates access token periodically via `authService.me(...)`
  - on `401` from `/auth/me`, `authService.me` refreshes token and retries automatically
  - updates JWT with refreshed tokens + identity fields when successful
- Added `accessTokenValidatedAt` marker to JWT typing.
- Added hard-fail auth redirect behavior when refresh cannot recover:
  - `proxy.ts` now redirects protected routes to login when `token.authError === RefreshAccessTokenError`
  - `/login` is no longer auto-redirected away when token exists but has refresh error
  - admin/staff/guest protected layouts now redirect to login when `session.authError === RefreshAccessTokenError`
- Added explicit `401` handling in server pages:
  - `/admin/permissions` and `/admin/roles` redirect to login immediately on RBAC `401` failures
  - prevents lingering broken state with warnings only

### Verification Result (401 Refresh + Logout Handling)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (401 Refresh + Logout Handling)

- Periodic token validation adds one `/auth/me` check per validation interval for active sessions; this is intentional for stronger 401 recovery.
- If auth backend latency spikes, first protected render may be slightly slower due to validation/refresh round-trip.

### What Changed (Per-API 401 Refresh + Retry)

- Added a reusable server-side executor in `src/lib/server-api-auth.ts`:
  - runs authorized API calls with current access token
  - on `401`, reads `refreshToken` from NextAuth JWT cookie, calls refresh API, and retries once
  - if refresh fails or retry still returns `401`, redirects to `/login?callbackUrl=<current-page>`
- Updated `admin/permissions` page to use the new executor for:
  - `GET /roles`
  - `GET /permissions`
  - and passed preloaded `rolesPayload` into nav resolver to avoid duplicate RBAC call.
- Updated `admin/roles` page to use the same executor for `GET /roles` and preload `rolesPayload` for nav resolver.
- Updated `admin/dashboard` page sidebar RBAC fetch to use the same executor, so dashboard nav role loading also follows `401 -> refresh -> retry`.
- Extended `resolveDashboardNavigation(...)` in `src/lib/frontend-navigation.ts`:
  - supports optional `rolesPayload` (caller-provided roles data)
  - uses `unstable_rethrow(error)` in catch path so redirect/notFound errors are not swallowed.

### Verification Result (Per-API 401 Refresh + Retry)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Per-API 401 Refresh + Retry)

- Refresh done by page-level executor is request-scoped; it guarantees retry for the current server render, but may require another refresh on later requests until NextAuth JWT callback persists a refreshed token.
- `admin/permissions` and `admin/roles` currently live in untracked paths in this workspace; ensure they are included in the intended commit scope.

### What Changed (Fix Too Many Redirect Loop)

- Fixed redirect loop between protected pages and `/login` when a stale token still exists but backend returns `401` on page API calls.
- Updated server-side unauthorized redirect in `src/lib/server-api-auth.ts` to include `reauth=1`:
  - redirect target is now `/login?reauth=1&callbackUrl=<...>`.
- Updated `src/proxy.ts` auth-route guard:
  - added `isForcedReauth(request)`.
  - when `reauth=1` is present, proxy allows access to `/login` even if a token exists.
  - prevents bounce loop `/admin/* -> /login -> /admin/* -> /login`.

### Verification Result (Fix Too Many Redirect Loop)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Fix Too Many Redirect Loop)

- Existing session cookie remains until re-login/sign-out; this is intentional to avoid forced cookie mutation in proxy.
- If future flows use different forced-auth query keys, proxy should be updated consistently to avoid new loop variants.

### What Changed (Sidebar IA: Access Control Parent)

- Aligned information architecture with horizontal tabs: `Roles` and `Permissions` are now treated as children of one module in the left sidebar, not two separate vertical items.
- Canonicalized admin permission-related nav targets to a single sidebar node (`/admin/roles`) in `src/lib/frontend-navigation.ts`, including dashboard-tab aliases and `/admin/permissions`.
- Updated sidebar normalization in both `admin/roles` and `admin/permissions` pages to:
  - dedupe role/permission links into one `Access Control` item
  - keep a single fallback sidebar entry for the module
- Updated permissions page sidebar active path to the shared module path so active highlight stays consistent across the two horizontal routes.

### Verification Result (Sidebar IA: Access Control Parent)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Sidebar IA: Access Control Parent)

- URL structure remains `/admin/roles` and `/admin/permissions`; this change unifies sidebar IA only. If true nested URLs are required (for example `/admin/access-control/roles`), route migration and redirects should be added in a follow-up.

### What Changed (Permissions UI Sync: Remove Back CTA + Keep Horizontal Tabs)

- Reworked the top section of `admin/permissions` to match `templates/permision_page.html` flow for navigation emphasis.
- Removed the `Back to roles list` button from the permissions page.
- Kept and standardized horizontal sub-navigation tabs:
  - `Danh sách Vai trò` (link to `/admin/roles`)
  - `Danh sách Quyền hạn` (active state on `/admin/permissions`)
- Kept role chips (`role.code`) below tabs for quick role-context switching while staying on permissions route.
- Updated breadcrumb wording from `Roles` to `Access Control` for IA consistency with the new sidebar parent module.

### Verification Result (Permissions UI Sync: Remove Back CTA + Keep Horizontal Tabs)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Permissions UI Sync: Remove Back CTA + Keep Horizontal Tabs)

- Tab labels are currently plain Vietnamese text without diacritics to stay consistent with existing page copy style; if desired, we can normalize all labels to fully accented Vietnamese in a dedicated copy pass.

### What Changed (Hotfix: ERR_TOO_MANY_REDIRECTS)

- Hardened auth redirect flow to prevent login/protected bounce loops when stale cookies are present.
- Updated `src/proxy.ts`:
  - `buildLoginRedirect(...)` now always includes `reauth=1`.
  - on `/login` or `/register`, if token exists but is expired (`accessTokenExpiresAt <= now`), proxy now allows staying on auth page instead of forcing redirect to role home.
- Updated protected group layouts to use forced re-auth query during auth failure redirects:
  - `src/app/(vietsage)/admin/layout.tsx`
  - `src/app/(vietsage)/staff/layout.tsx`
  - `src/app/(vietsage)/guest/layout.tsx`
  - all now redirect to `/login?reauth=1&callbackUrl=...`.

### Verification Result (Hotfix: ERR_TOO_MANY_REDIRECTS)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Hotfix: ERR_TOO_MANY_REDIRECTS)

- This patch prevents common stale-cookie loops; if a custom browser extension rewrites query strings and strips `reauth`, loops can still reappear until cookies are refreshed.

### What Changed (Route 401 -> Hard Logout)

- Fixed the stale-session loop for protected routes that fail with `401` and cannot refresh.
- Updated `src/proxy.ts` to clear all NextAuth cookies (`next-auth.*`, `__Secure-next-auth.*`, `__Host-next-auth.*`) in forced reauth/logout paths.
- `buildLoginRedirect(...)` now performs hard cookie cleanup before redirecting to `/login?reauth=1&callbackUrl=...`.
- Added forced-reauth auth-route handling: when `/login` or `/register` is opened with `reauth=1`, proxy clears auth cookies and allows rendering auth page instead of bouncing back.
- This ensures route-level `401` failures end in a true logout state, not a half-alive session.

### Verification Result (Route 401 -> Hard Logout)

- Ran `npm run lint` successfully.
- Ran `npx tsc --noEmit` successfully.

### Remaining Blockers / Risks (Route 401 -> Hard Logout)

- If any custom non-NextAuth auth cookies are added later, they are not cleared by this middleware and should be included explicitly.

### What Changed (Permissions UI: Keep Layout, Adjust Horizontal Nav Only)

- Kept the existing permission page layout (role header, permission module cards, sticky footer) unchanged.
- Updated only the horizontal sub-navigation block in `admin/permissions`:
  - `/admin/roles` shown as inactive tab.
  - `/admin/permissions` shown as active tab with stronger visual emphasis.
- Removed tab underline style and switched to pill-button style to match the requested look while preserving the rest of the screen.

### Verification Result (Permissions UI: Horizontal Nav Only)

- Ran `npm run lint` successfully.

## 2026-07-14 - Cinematic Landing Motion

### What Changed

- Completed the existing landing-page cinematic direction without replacing VietSage content or touching application business flows.
- Added deterministic ambient particles, scene watermarks, section-aware backgrounds, a compact-on-scroll transparent navbar, scroll progress, scene rail, and responsive scroll snapping.
- Reworked hero motion into independent entrance, damped pointer-parallax, and floating layers so transforms no longer compete or snap abruptly.
- Added reusable in-view reveal timing, staggered cards, dark operations storytelling, scroll cue, hover depth, and mobile/reduced-motion fallbacks.
- Kept the implementation dependency-free and limited browser work to passive listeners, IntersectionObserver, and requestAnimationFrame.

### Verification Result

- Ran `pnpm exec eslint src/app/page.tsx src/components/marketing/marketing-shell.tsx src/components/marketing/marketing-motion-root.tsx` successfully.
- Ran `pnpm exec tsc --noEmit` successfully.
- Ran `pnpm build` successfully.
- Ran `git diff --check` for the landing-page files successfully; only existing LF-to-CRLF checkout warnings were reported.

### Remaining Blockers / Risks

- Visual QA in multiple physical mobile browsers is still recommended because device GPU performance and browser scroll-snap behavior vary.
- The marketing copy remains English to preserve the current landing-page content scope.

## 2026-07-14 - Restore Frontend Dev Task

### What Changed

- Added a repository-level VS Code task for `pnpm run dev`.
- Fixed the task working directory to `frontends/front-end-vietsage` so Next.js discovers the existing `src/app` App Router.
- Kept the application code, dependencies, and package scripts unchanged.

### Verification Result

- Ran `pnpm run dev` from `frontends/front-end-vietsage` and confirmed Next.js 16.2.6 reached `Ready` without the missing `pages` or `app` directory error.

### Remaining Blockers / Risks

- Developers opening only a nested folder instead of the repository root will not receive the repository-level task and should run the command from the frontend package root.

## 2026-07-14 - Marketing Navigation Usability Fix

### What Changed

- Replaced the transparent fixed marketing header with a sticky, consistently readable cream navigation surface.
- Added route-aware active states and kept the Solutions dropdown available for keyboard focus and pointer hover.
- Added a responsive navigation menu with accessible labels, large tap targets, Escape handling, outside-click dismissal, and mobile sign-in/demo actions.
- Adjusted the marketing hero height and spacing so the in-flow sticky header no longer occupies the hero content area.

### Verification Result

- Ran targeted ESLint for the marketing header, shell, and landing page successfully.
- Ran `pnpm exec tsc --noEmit` successfully.
- Ran `pnpm run build` successfully with Next.js 16.2.6.

### Remaining Blockers / Risks

- Physical-device visual QA is still recommended for browser-specific backdrop blur rendering and very narrow mobile viewports.

## 2026-07-14 - Solutions Dropdown Alignment Fix

### What Changed

- Removed the duplicate Tailwind horizontal translation from the desktop Solutions dropdown while preserving its centered anchor, CSS animation, dimensions, content, and mobile navigation.

### Verification Result

- Ran focused ESLint for `src/components/marketing/marketing-header.tsx` successfully.
- Ran `git diff --check` successfully.

### Remaining Blockers / Risks

- Browser visual smoke testing was not run; desktop dropdown alignment should still be confirmed in a browser.

## [complete] 2026-07-14 - Guest Experience Redesign (Phases 0-3)

### What Changed

- Added the approved exact `motion@12.42.2` dependency, Guest Experience product definition, and reduced-motion-aware Guest motion provider, page transition, reveal, stagger, and timing tokens.
- Completed the phased Guest redesign across QR entry, language selection, home, services, requests, shared Guest states, top navigation, and bottom navigation while preserving existing sessions, APIs, contracts, auth, and realtime behavior.
- Refactored `/g/requests` from an 810-line mixed route into a 119-line orchestration page plus feature presentation components for the hero, current request, semantic progress, filters, list, cards, loading/error/empty states, and CTA.
- Preserved request list/cancel calls, realtime handlers, status mapping, `ENDED` semantics, search, selected-request priority, price calculations, SweetAlert confirmation, and toast feedback.
- Removed nested interactive controls from request cards, added separate semantic select/cancel buttons, visible search labeling, `aria-pressed` filters, focus-visible states, 44px targets, safe mobile padding, and recovery actions.
- Removed obsolete Guest legacy rise/delay/breathe/flow CSS after repository-wide usage checks, capped Guest comfort transitions at 300ms, and stopped the QR loading spinner from repeating when reduced motion is preferred.

### Verification Result

- Ran focused ESLint for all `/g` pages, all Guest components, and the changed shared top/bottom navigation successfully with zero errors or warnings.
- Ran `pnpm exec tsc --noEmit` successfully.
- Ran `pnpm build` successfully with Next.js 16.2.6.
- Ran `git diff --check` successfully; only checkout LF-to-CRLF warnings were reported.
- Verified no Guest usage remains for `.vs-rise-in`, `.vs-delay-*`, `.vs-breathe`, `.vs-flow-line`, `duration-500`, or `duration-1000`; the only remaining infinite Guest motion is the meaningful QR loader and its `useReducedMotion` branch does not repeat.
- Verified no `role="button"` or manual `tabIndex={0}` interactive emulation remains in Guest routes/components.

### Remaining Blockers / Risks

- Physical-device browser QA remains recommended for narrow-screen wrapping, sticky bottom navigation safe areas, SweetAlert focus behavior, realtime status transitions, and reduced-motion behavior on iOS Safari and Android Chrome.
- The CTA image remains remotely hosted, so browser QA should confirm loading behavior under slow hotel Wi-Fi.
# 2026-07-14 - Guest Request Contract Sync

- Synced generated OpenAPI types after the backend restricted guest request API statuses to
  `CREATED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and `FAILED`.

## 2026-07-14 - GuestOS Reliable Request Recovery Batch B

### What Changed

- Switched the Guest services screen to the session-scoped `/guest/services` catalog and adapted effective price/currency fields for the existing presentation components while preserving backend category/item order.
- Made the persisted `vietsage.guest-os.v1` Zustand store the sole GuestOS runtime session source, with one-time cleanup/import of the two legacy compatibility keys.
- Added exact-route session bootstrap validation for `/g/home`, `/g/language`, `/g/services`, and `/g/requests`; dynamic QR entry remains unguarded.
- Invalid/closed sessions (`401`, `403`, `410`) now clear the persisted session while preserving language; transient failures preserve the session and expose retry.
- Added focus, online, and visible-tab revalidation with a shared in-flight request, plus refreshed hotel/room/guest display snapshots from `/guest/session/me`.
- Updated the backend API fallback URL to `http://localhost:8080` while preserving server-env then public-env precedence.

### Verification Result

- Added Node built-in tests for catalog adaptation, compatibility migration, exact protected-route policy, validation error decisions, and backend URL precedence.

### Remaining Blockers / Risks

- Physical-browser QA remains recommended for focus/online/visibility recovery and switching between QR sessions under unstable hotel Wi-Fi.
## 2026-07-14 - Batch C Authenticated Request Realtime

- Added the owner ticket BFF, handshake credentials, a ref-counted owner connection per hotel, and guest token-aware socket cleanup.
- Mounted the guest realtime notifier across the authenticated GuestOS layout so updates are visible outside `/g/requests`; the requests page consumes the shared in-app event instead of opening a duplicate socket.
- Urgent owner notifications remain visible until dismissed or opened via `Xử lý ngay`; audio is best-effort because browsers may block sound before user interaction.
- `NEXT_PUBLIC_REQUEST_REALTIME_ENABLED` defaults false; rollback performs no ticket/socket calls and preserves HTTP workflows. Local runtime must explicitly enable both frontend and backend flags and restart both processes.
- Realtime remains a refresh signal. Polling, outbox/durable delivery, acknowledgement SLA, and escalation remain Batch D.
## [complete] 2026-07-21 - Mission: recover-e4711-ui-auth-rbac

- Rebuilt the auth, tenant, workspace, permissions, and user-management changes on top of UI
  baseline `e4711efe18d237ba3df703cc515645bc07bfc06d`; `master` was not used as the visual source.
- Added session-aware landing actions and a server-owned post-login continuation that revalidates
  callbacks against the new active role.
- Kept workspace chrome in protected layouts with local content boundaries, while preserving the
  baseline shell tokens and supporting existing page wrappers.
- Standardized new staff-management requests on `x-tenant-id`, added light tenant options and
  server pagination/search, and kept role/hotel assignment as separate operations.
- Reworked permissions role/module selection without full route reload and preserved the full role
  permission set when saving a single module.

Verification result:

- `npm run lint` passed.
- `npm run build` passed and emitted the expected public, Admin, Owner, and Staff routes.
- OpenAPI frontend types were regenerated from the 81-path shared contract.

Remaining manual checkpoint:

- The product owner performs final authenticated visual and role-switch QA on 390 px, 768 px, and
  desktop viewports using representative Admin, Owner, and Staff accounts.
