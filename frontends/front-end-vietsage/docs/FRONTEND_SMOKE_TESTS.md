# Frontend Smoke Tests

Mission: cutover UX readiness.

Use this checklist before cutover or after changes to route protection, API transport, guest session, or owner/admin/staff workflows. It uses the existing Next.js app and lint/build dependencies only.

## Automated Commands

Run from `frontends/front-end-vietsage`:

```powershell
node scripts/auth-refresh-smoke.mjs
npm run smoke:lint
npm run smoke:build
```

Expected result:

- `auth-refresh-smoke.mjs` exits with `PASS all auth refresh smoke checks`.
- `smoke:lint` exits with no errors. Warnings should be reviewed and either fixed or listed in the refactor backlog.
- `smoke:build` completes `next build` and prerenders/routes without contract or type failures.

## Auth Refresh Concurrency Harness

Run from `frontends/front-end-vietsage`:

```powershell
node scripts/auth-refresh-smoke.mjs
```

This script is a deterministic no-dependency harness for the frontend browser BFF recovery algorithm. It starts an in-process Node HTTP server on an ephemeral local port and simulates concurrent same-origin calls through a `requestInternalApi`-like flow.

It proves:

- 5 concurrent BFF calls that initially receive `401` share one refresh operation.
- `POST /api/auth/refresh-session` is issued once in the successful recovery path.
- Each original logical request retries at most once.
- If refresh returns `401`, only one logout-required signal is emitted.

It does not replace manual browser QA against real cookies, Auth.js session state, or backend refresh-token rotation.

## Manual Route Smoke

Start the app with `npm run dev`, then check these paths:

- `/` renders the marketing/home entry without console errors.
- `/login` renders the login form and preserves a safe `callbackUrl`.
- `/admin/dashboard` redirects unauthenticated users to login; authenticated admin users see dashboard chrome.
- `/owner/dashboard` redirects unauthenticated users to login; authenticated owners see dashboard chrome.
- `/owner/hotels/{hotelId}` either renders the owner hotel workspace or a scoped access message/404 without a blank screen.
- `/hotels/{hotelId}/requests` is blocked for unauthenticated users and renders the request queue for authorized staff/admin users.
- `/staff` is blocked for unauthenticated users and renders staff operations for authorized staff users.
- `/g/home`, `/g/services`, and `/g/requests` render either the guest session-required state or the guest workflow without crashing.

For each protected route, verify that temporary API failures render the route-level error boundary with a visible retry button instead of a blank app shell.

## Workspace V2 P3 Role Matrix

After pulling P3, authenticate with one active role at a time and use only a hotel returned by
`GET /auth/me`:

| Active role | Entry route | Expected modules |
| --- | --- | --- |
| `SUPER_ADMIN` | `/admin/dashboard` | Platform hotels/users/access modules only; no hotel operations feed. |
| `TENANT_OWNER` / `HOTEL_OWNER` | `/owner/dashboard` | Owner portfolio and existing hotel workflows. |
| `HOTEL_MANAGER` | `/staff/manager?hotelId={assignedHotelId}` | Request metrics/feed and service metrics when capabilities allow. |
| `HOTEL_FRONTDESK` / `RECEPTIONIST` | `/staff/front-desk?hotelId={assignedHotelId}` | Request queue; service management stays hidden. |
| `HOTEL_HOUSEKEEPING` / `HOTEL_MAINTENANCE` | `/staff/operations?hotelId={assignedHotelId}` | Operations request work only when capability allows. |
| `HOTEL_FINANCE` | `/staff/operations?hotelId={assignedHotelId}` | Finance persona with only capability-backed widgets/navigation. |

For every staff role, also remove `hotelId` and supply an unassigned `hotelId`. Expected: the UI
requires an explicit allowed hotel and never silently selects the first assignment. In the Network
panel, hidden request/service widget groups must not trigger their backend list calls.

## Auth Refresh And Callback Smoke

Run these checks after auth refresh, proxy, or login redirect changes:

- Concurrency harness: run `node scripts/auth-refresh-smoke.mjs`. Expected: both success and refresh-failure scenarios pass, with one refresh request counted per scenario.
- Stale/chunked cookies cleanup: create or keep stale `next-auth.*`, `authjs.*`, `__Secure-authjs.*`, and chunked cookie names, then open `/admin/dashboard`. Expected: redirect to `/login?reauth=1&callbackUrl=/admin/dashboard` and stale Auth.js cookies are expired.
- Missing refresh token: keep an Auth.js session without `refreshToken`, then call `POST /api/auth/refresh-session`. Expected: `401` JSON envelope with no raw `accessToken` or `refreshToken` fields.
- Revoked refresh token/backend refresh `401`: invalidate the backend refresh token, then call `POST /api/auth/refresh-session`. Expected: `401` JSON envelope, not `500`, with no raw token fields.
- Callback nesting prevention: open `/admin/dashboard?callbackUrl=/owner/dashboard`. Expected login/refresh redirects store only `/admin/dashboard`, not a nested `callbackUrl` query.
- Unsafe callback rejection: open `/login?callbackUrl=https://example.com`, `/login?callbackUrl=//example.com`, and protected flows that carry those values. Expected: redirect targets fall back to `/admin/dashboard` or the current role default, never an external URL.
- Real app success path: authenticate in the browser, let or force the access token to become stale while the refresh token remains valid, then trigger a screen that makes several same-origin `/api/...` BFF calls at once. Expected: the Network panel shows one `POST /api/auth/refresh-session`; original BFF calls retry once and finish successfully.
- Real app refresh-failure path: authenticate in the browser, revoke or invalidate the backend refresh token without clearing the browser session cookie, then trigger concurrent same-origin BFF calls. Expected: one `POST /api/auth/refresh-session` returns `401`, one `vietsage:auth:logout-required` dispatch/log occurs, no response exposes raw tokens, and the browser reaches `/login?reauth=1&callbackUrl=<current-path>`.

## Remaining Large-Component And A11y Refactor List

- `src/app/(vietsage)/hotels/[hotelId]/requests/request-queue-client.tsx`: split modal, filters, assignment controls, and table/list rendering; add focused keyboard-path tests for the request detail modal.
- `src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx`: split permission matrix state from rendering; review generated `aria-label` copy and keyboard flow for bulk permission controls.
- `src/app/(vietsage)/owner/hotels/[hotelId]/rooms/owner-rooms-client.tsx`: split room form, QR modal, and room list; verify dialog focus return and error announcement.
- `src/app/(vietsage)/owner/hotels/[hotelId]/services/owner-service-catalog-client.tsx`: split category/item forms and catalog table; review locale toggle semantics and validation summaries.
- `src/app/(vietsage)/g/services/page.tsx` and `src/app/(vietsage)/g/requests/page.tsx`: move large client workflows into smaller components/hooks; add mobile touch target and live status review for request submission/cancel flows.
