# Frontend Smoke Tests

Mission: cutover UX readiness.

Use this checklist before cutover or after changes to route protection, API transport, guest session, or owner/admin/staff workflows. It uses the existing Next.js app and lint/build dependencies only.

## Automated Commands

Run from `frontends/font-end-vietsage`:

```powershell
npm run smoke:lint
npm run smoke:build
```

Expected result:

- `smoke:lint` exits with no errors. Warnings should be reviewed and either fixed or listed in the refactor backlog.
- `smoke:build` completes `next build` and prerenders/routes without contract or type failures.

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

## Remaining Large-Component And A11y Refactor List

- `src/app/(vietsage)/hotels/[hotelId]/requests/request-queue-client.tsx`: split modal, filters, assignment controls, and table/list rendering; add focused keyboard-path tests for the request detail modal.
- `src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx`: split permission matrix state from rendering; review generated `aria-label` copy and keyboard flow for bulk permission controls.
- `src/app/(vietsage)/owner/hotels/[hotelId]/rooms/owner-rooms-client.tsx`: split room form, QR modal, and room list; verify dialog focus return and error announcement.
- `src/app/(vietsage)/owner/hotels/[hotelId]/services/owner-service-catalog-client.tsx`: split category/item forms and catalog table; review locale toggle semantics and validation summaries.
- `src/app/(vietsage)/g/services/page.tsx` and `src/app/(vietsage)/g/requests/page.tsx`: move large client workflows into smaller components/hooks; add mobile touch target and live status review for request submission/cancel flows.
