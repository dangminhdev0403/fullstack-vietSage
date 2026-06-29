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
- Updated `docs/PROJECT_RULES.md` with a mandatory `API Logging Rule` requiring response logs.

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
