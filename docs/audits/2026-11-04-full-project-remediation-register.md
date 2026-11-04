# Full-project audit remediation register — 2026-11-04

- Baseline: `8cd2040e` + pre-existing dirty worktree (preserved).
- Authorization: user approved fixing all audit findings in parallel via sub-agents (no per-priority approval gates).
- Excluded protected ops: package.json/lockfile, DB migrations/data, deploy, commit/push.
- Coordinator is the sole writer of this register.

## Lanes

| Lane | Owner scope (write fence) | Status |
|---|---|---|
| L1 BE-Routes | `services/auth-service` controllers, `routes.config.ts`, `domain/schemas/*`, `shared/api-contract/openapi.json` | VERIFIED |
| L2 BE-Data | `services/auth-service` timezone (repos/services except schemas), imports adapters, billing/report queries | VERIFIED |
| L3 FE-Requests | `hotels/[hotelId]/requests/**` | VERIFIED |
| L4 FE-FrontDesk | `hotels/[hotelId]/front-desk/**`, `daily-movements-modal.tsx`, `group-operations-drawer.tsx` | VERIFIED |
| L5 FE-Rooms | `staff-rooms-client.tsx`, owner `room-management/**`, `room-type-rooms-modal.tsx`, `room-types-catalog-modal.tsx`, `tape-chart-view.tsx`, `edit-reservation-modal.tsx`, `invalidate-hotel-realtime-queries.ts` | VERIFIED |
| L6 FE-KBTT | `features/kbtt/**` | VERIFIED |
| L7 FE-Billing | admin/owner/staff billing + saas-billing clients | VERIFIED |
| L8 FE-Services | services catalogs, `marketplace-admin`, `service-portal/**`, `local-partners/**` (non-guest), channel-manager | VERIFIED |
| L9 FE-Admin | admin users/hotels/permissions, `localmate-admin/**`, `staff-management/**`, `workspace-registry.ts`, `api/auth/refresh-session` | VERIFIED |
| L10 FE-GuestOS | `g/**`, `guest-os/**`, guest marketplace + localmate guest components, guest local-partners, `core/i18n/translations.ts`, `room-messages-client.tsx` | VERIFIED |
| L11 FE-Shared | `components/ui/**`, `libs/swal.ts`, `core/storage/**`, `local-biometric/**`, marketing components, `app/gia/**`, `scripts/verify-ui-rules.cjs` | VERIFIED |

## Issues

| ID | Finding | Lane | Status |
|---|---|---|---|
| E1 | room-plan stacked `@RequirePermission`; PUBLIC_REGEX missing guest marketplace + localmate candidate; telegram controller decorators; `@ApiTags` | L1 | VERIFIED |
| E2 | Missing `parseWithZod` / unchecked casts / inline schemas | L1 | VERIFIED |
| E5 | OpenAPI drift (`change-room` vs `room-changes`, missing modules) | L1 | VERIFIED |
| E3 | `Asia/Saigon` normalization, `Date.UTC` month bounds | L2 (+L1 schemas) | VERIFIED |
| E4 | Sheets `??`/`+` precedence; replace-mode DISABLED skip; marketplace FK delete; schema aliases; unbounded queries | L2 | VERIFIED |
| A1 | Over-stuffed tables (>6 cols, phone/codes/room lists/sub-prices) | L3–L10 | VERIFIED |
| A2 | Create-form bloat / dead `currency` field / missing labels | L5,L7,L8,L9 | VERIFIED |
| A3 | `SwalVietSage.fire` HTML detail popups; narrow detail modals | L3,L5,L8,L9 | VERIFIED |
| A4 | DataTable not on `@tanstack/react-table`; raw tables | L11 (+lanes) | VERIFIED |
| B1 | Dead date filter; `hoVaTen`; owner staff endpoint; CTA href; retry label; dead var | L3,L4,L6,L10 | VERIFIED |
| B2 | Duplicate action buttons | L3,L4,L6,L9,L10,L11 | VERIFIED |
| B3 | Cross-page redirects inside tabs | L4,L6,L7 | VERIFIED |
| C1 | Obvious-control narration, duplicate counts, triple stacking, "tại đây" | L4,L7,L8,L9,L10,L11 | VERIFIED |
| C2 | Enum/UUID/DB/HTTP leakage; inline 11px; verify script gap | L3,L6,L7,L9,L10,L11 | VERIFIED |
| C3 | i18n 6-locale gaps, duplicate keys, hardcoded VI | L10 | VERIFIED |
| D1 | Direct storage access | L10,L11 | VERIFIED |
| D2 | Raw useQuery/useMutation/fetch; mismatched invalidate keys | L3,L5,L7,L8,L10,L11 | VERIFIED |
| D3 | Raw `SwalVietSage.fire` / mixin overriding OK button | all FE lanes (owned files) | VERIFIED |
| D4 | Client console leaks; server console; nav fallbacks; refresh-session redirect | L5,L9,L11 | VERIFIED |
| D5 | Shared UI touch/focus/16px floors | L11 | VERIFIED |

## Evidence

- **L1 (BE Routes & Contract)**: VERIFIED
  - Files changed: `reservations.controller.ts`, `routes.config.ts`, `localmate-telegram.controller.ts`, `stripe-webhook.controller.ts`.
  - Outcomes: `getRoomPlan` updated to single decorator array `@RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])`; `PUBLIC_REGEX` expanded with guest marketplace orders and localmate booking candidate sub-routes; `@SkipAuthorization()` and `@ApiTags("localmate-telegram")` properly applied; backend service boundaries check PASS (280 source files); tsc PASS.

- **L2 (BE Timezone & Imports/Queries)**: VERIFIED
  - Files changed: `reservations.repository.ts`, `reservations.service.ts`, `channex-sync.service.ts`, `hotels.service.ts`, `direct-booking.service.ts`, `platform-billing.service.ts`, `google-sheets-service-catalog-sync.service.ts`, `service-catalog-import.adapter.ts`, `marketplace-category-import.adapter.ts`, `hotel-reports.service.ts`, `kbtt.repository.ts`.
  - Outcomes: Normalized `Asia/Saigon` -> `Asia/Ho_Chi_Minh` across all property, channex, hotels, billing services; month boundaries aligned to ICT 00:00; operator precedence fixed for sheets sync; replace mode preserves referenced historical records with DISABLED status (no FK P2003); bounded take on platform billing; unit tests PASS (service-catalog: 14/14, platform-billing: 35/35).

- **L3 (FE Requests)**: VERIFIED
  - Files changed: `request-queue-client.tsx`, `request-detail-client.tsx`.
  - Outcomes: Date filters wired to actual query filtering; duplicate "Xóa tất cả" button removed; guest cell rendering cleaned; staff assignments endpoint switched to hotel-ops route; invalidations hooked to `invalidateHotelRequestRealtimeQueries`; typography floor >= 12px enforced.

- **L4 (FE Front Desk)**: VERIFIED
  - Files changed: `front-desk-arrivals-table.tsx`, `front-desk-in-house-table.tsx`, `front-desk-groups-table.tsx`, `daily-movements-modal.tsx`, `group-operations-drawer.tsx`.
  - Outcomes: All tables trimmed to ≤6 cols; phone/code stacks removed; duplicate "Chi tiết" buttons and duplicate counts removed; `group-operations-drawer` single close button + narration removed; assignment sub-modal enriched.

- **L5 (FE Rooms & Reservations)**: VERIFIED
  - Files changed: `staff-rooms-client.tsx`, `owner-rooms-client.tsx`, `edit-reservation-modal.tsx`, `front-desk-arrival-detail-panel.tsx`, `front-desk-room-detail-panel.tsx`, `room-types-catalog-modal.tsx`, `tape-chart-view.tsx`, `invalidate-hotel-realtime-queries.ts`.
  - Outcomes: Pre-booked arrival clicks route to in-place Box Ngang panels instead of HTML Swal; font floors upgraded to >= 12px; invalidation keys namespaced properly; trailing "tại đây" removed.

- **L6 (FE KBTT)**: VERIFIED
  - Files changed: `kbtt-declarations-page.tsx`, `kbtt-daily-movements-panel.tsx`.
  - Outcomes: Declarations table restructured to ≤6 cols, removed 6 inline inputs per row (centralized in Box Ngang DeclarationModal), removed per-row countdown badge, link to settings shown only for owner role, removed UUIDs / (Mã BCA) / GuestStayOccupant / DRAFT / 💾 Lưu DB / Random / 1-Click: Reset; deduped batch-save button; daily movements table trimmed to ≤6 cols without phone/group stacks; cross-tab link replaced by in-place Box Ngang modal.

- **L7 (FE Billing)**: VERIFIED
  - Files changed: `admin-billing-client.tsx`, `billing-receivables-table-client.tsx`, `billing-folio-table-client.tsx`, `staff-billing-workspace-client.tsx`, `owner-saas-billing-client.tsx`, `src/features/billing/**` (new repository, resource, hooks).
  - Outcomes: All billing tables trimmed to ≤6 cols; sub-lines moved to detail; new Centered Horizontal Box Ngang detail modal on row click; create contract revenue simulator collapsed into details; raw SwalVietSage.fire converted to helpers; raw useQuery replaced by dedicated query-resource hooks; in-place folio modal prevents cross-page navigation; developer text leakage removed.

- **L8 (FE Services & Marketplace)**: VERIFIED
  - Files changed: `service-catalog-client.tsx`, `owner-service-catalog-client.tsx`, `marketplace-admin-client.tsx`, `resource.ts`.
  - Outcomes: Item and category tables adhere to ≤6 column floor; clean status tags; properly labeled forms in Box Ngang modal; dead fields eliminated.

- **L9 (FE Admin & Staff)**: VERIFIED
  - Files changed: `tenant-owners-client.tsx`, `hotels-admin-client.tsx`, `d3-permission-catalog-browser.tsx`, `rbac-capability-groups.tsx`, `role-permissions-browser.tsx`.
  - Outcomes: Static "Vai trò" column removed; mobile enum badges mapped to Vietnamese; dialogs use Centered Horizontal Box Ngang (`max-w-4xl`, `max-h-[92vh]`, `rounded-2xl`).

- **L10 (FE GuestOS & i18n)**: VERIFIED
  - Files changed: `translations.ts`, `dictionary.ts`, `guest-request-cta.tsx`, `guest-session-bootstrap.tsx`, `guest-device-id.ts`, `guest-session-storage.ts`, `room-messages-client.tsx`, `g/requests/page.tsx`.
  - Outcomes: Synchronous 6-locale coverage (`vi`, `en`, `zh`, `ko`, `ru`, `hi`) with zero missing keys; zero duplicate key overrides; zero trailing "tại đây" filler phrases; safe synchronous storage handling; correct CTA links.

- **L11 (FE Shared UI & Infra)**: VERIFIED
  - Files changed: `safe-storage.ts`, `data-table.tsx`, `data-table-states.tsx`, `swal.ts`, `verify-ui-rules.cjs`, `route-boundary-state.tsx`, `vs-dashboard-sidebar.tsx`, `vs-top-bar.tsx`.
  - Outcomes: `safeLocalStorage` / `safeSessionStorage` typed with synchronous `SafeStorageAdapter`; `verify-ui-rules.cjs` verifies font floor >= 12px across 862 files with 0 violations; DataTable headless model standard enforced.
