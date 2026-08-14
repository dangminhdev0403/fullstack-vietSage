# Graph Report - front-end-vietsage  (2026-08-13)

## Corpus Check
- 567 files · ~389,338 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3389 nodes · 8362 edges · 206 communities (174 shown, 32 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `37e80ba6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HttpError
- executeHotelOpsBackendRequest
- guest-os-contract.ts
- Execution Log
- httpErrorResponse
- unwrapApiEnvelope
- request-queue-client.tsx
- page.tsx
- marketing-shell.tsx
- staff-billing-workspace-client.tsx
- PLANS.md
- loadServerWorkspaceContext
- auth-service.ts
- room-messages-client.tsx
- page.tsx
- roles-live-filter.tsx
- 2026-05-31
- role-permissions-browser.tsx
- route-boundary-state.tsx
- compilerOptions
- vs-icon.tsx
- admin-service.ts
- page.tsx
- workspace-registry.ts
- page.tsx
- owner-service-catalog-client.tsx
- page.tsx
- owner-rooms-client.tsx
- server-workspace-context.ts
- readServerSessionTokens
- page.tsx
- internal-api-client.ts
- guest-session-bootstrap.tsx
- rbac-service.ts
- page.tsx
- hotel-ops-contract.ts
- workstation-store.ts
- RbacService
- staff-directory-resource.ts
- workspace-context.ts
- staff-rooms-client.tsx
- owner-stay-room-grid-client.tsx
- auth.ts
- auth.ts
- workspace-shell.tsx
- page.tsx
- hotels-admin-client.tsx
- dependencies
- devDependencies
- authorize-hotel-workstation.ts
- OwnerServiceCatalogClient
- http-client.ts
- 2026-07-14 - Guest Request Contract Sync
- cccd-preview.ts
- CODEX-STITCH-SYNC.md
- VietSage Auth/HTTP Stabilization Phase Plan
- redirect-isolation-core.ts
- WorkstationStore
- page.tsx
- guest-stagger.tsx
- tenant-owners-client.tsx
- owner-hotels-client.tsx
- hasAppRole
- check-in-workspace.tsx
- http-server.ts
- intake-contract.ts
- permission-workbench.tsx
- qr-export-client.tsx
- change-password-dialog.tsx
- rbac.ts
- Backend Proposal: GuestOS Multilingual API Support for `/g/**`
- PROJECT RULES
- proxy.ts
- page.tsx
- page.tsx
- OwnerRoomsClient
- backend-api-config.ts
- staff-management-client.tsx
- VietSage Frontend Architecture
- DESIGN.md
- route.ts
- mock.ts
- use-guest-request-realtime.ts
- page.tsx
- service-catalog-client.tsx
- page.tsx
- data-table.tsx
- v1.ts
- owner-connection-manager.ts
- Frontend Runtime and UI Guide
- auth-refresh-smoke.mjs
- layout.tsx
- workstation-repository.ts
- Frontend API Integration Guide
- Frontend Feature Guide
- staff-management-service.ts
- Frontend Smoke Tests
- scripts
- PRODUCT.md
- Frontend Instructions: GuestOS Backend I18n Sync
- PROJECT PLAN
- password-ui-entrypoints.test.mjs
- sync-openapi-types.mjs
- admin-resource.ts
- use-google-sheet-config.ts
- service-catalog-error.ts
- password-security.ts
- next-auth.d.ts
- Frontend Codex Instructions
- Frontend Codex Instructions
- auth-session-contract-smoke.mjs
- chat-layout-regression.test.mjs
- marketing-motion-smoke.test.mjs
- face-id-notification-test.test.ts
- auth-cookie-policy.ts
- 2026-07-14 - Cinematic Landing Motion
- 2026-07-14 - Marketing Navigation Usability Fix
- 2026-07-14 - Solutions Dropdown Alignment Fix
- 2026-07-22 - Stay-Scoped Front Desk Messages
- Active Plan
- [complete] 2026-07-14 - Guest Experience Redesign (Phases 0-3)
- [complete] 2026-07-27 - Mission: tenant-room-action-icons
- package.json
- README.md
- staff-room-qr-regression.test.mjs
- tenant-room-action-icons.test.mjs
- getNestedMessage
- workstation-connection-panel.test.ts
- [complete] 2026-07-28 - Mission: guest-qr-device-recovery
- page.tsx
- page.tsx
- page.tsx
- cccd-check-in-panel.test.ts
- check-in-workspace-layout.test.ts
- workstation-test-scan-panel.test.ts
- @dangminhdev04032005/query-resource
- eslint.config.mjs
- next
- next-auth
- next.config.ts
- sweetalert2
- zod
- postcss.config.mjs
- internal-api-error-regression.test.mjs
- message-send-regression.test.mjs
- dashboard-presentation.test.ts
- owner-room-modal-layout.test.ts
- { GET, POST }
- mapBackendRolesToUserRole
- requestPriorityLabelMap
- requestTypeLabelMap
- guest-request-realtime-notifier.tsx
- room-messages-client.tsx
- HttpClient
- owner-hotel-detail-client.tsx
- validationErrorResponse
- login-page.tsx
- _utils.ts
- guest-store.ts
- guest-local-partners.tsx
- billing-folio-table-client.tsx
- admin-billing-client.tsx
- hotel-messages-resource.ts
- audio-notifier.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- invoice-print-button.tsx
- categoryToForm
- staff-dashboard-loader.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- route.ts
- staff-saas-reminder.test.ts
- billing-folio-pagination.test.ts
- getNestedMessage
- MemoryStorage
- billing-tab-switcher.test.ts
- owner-saas-pagination.test.ts
- workspace-context.test.ts
- motion
- admin-billing-debt.test.ts
- owner-saas-debt.test.ts

## God Nodes (most connected - your core abstractions)
1. `unwrapApiEnvelope()` - 143 edges
2. `HttpError` - 139 edges
3. `executeHotelOpsBackendRequest()` - 106 edges
4. `successResponse()` - 99 edges
5. `hotelOpsHttpErrorResponse()` - 99 edges
6. `unknownServerErrorResponse()` - 99 edges
7. `Execution Log` - 78 edges
8. `validationErrorResponse()` - 70 edges
9. `executeOwnerBackendRequest()` - 69 edges
10. `ownerHttpErrorResponse()` - 66 edges

## Surprising Connections (you probably didn't know these)
- `GuestQrEntryPage()` --indirect_call--> `session()`  [INFERRED]
  src/app/(vietsage)/g/[qrCode]/page.tsx → src/libs/auth.ts
- `confirmOwnerSave()` --references--> `SwalVietSage`  [EXTRACTED]
  src/app/(vietsage)/admin/users/tenant-owners-client.tsx → src/libs/swal.ts
- `GuestRequestsPage()` --indirect_call--> `request()`  [INFERRED]
  src/app/(vietsage)/g/requests/page.tsx → src/features/marketplace/repositories/guest-marketplace-repository.ts
- `OwnerInvoiceDetailPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx → src/libs/server-api-auth.ts
- `OwnerBillingPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx → src/libs/server-api-auth.ts

## Import Cycles
- None detected.

## Communities (206 total, 32 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.14
Nodes (25): Params, POST(), Params, POST(), Params, POST(), Params, POST() (+17 more)

### Community 1 - "executeHotelOpsBackendRequest"
Cohesion: 0.09
Nodes (21): GET(), Params, Params, POST(), Params, POST(), GET(), Params (+13 more)

### Community 2 - "guest-os-contract.ts"
Cohesion: 0.08
Nodes (31): createGuestOsService(), GuestOsService, GuestOsServiceOptions, localeHeaders(), CancelGuestRequestResult, CreateGuestEmergencyCallInput, CreateGuestRequestInput, EmergencyLocationConfidence (+23 more)

### Community 3 - "Execution Log"
Cohesion: 0.03
Nodes (78): [complete] 2026-05-26 - Guest templates visual alignment pass, [complete] 2026-05-26 - Guest welcome page desktop UX upgrade, [complete] 2026-05-26 - Guest welcome page strict template sync pass, [complete] 2026-05-26 - Project rules execution contract update, [complete] 2026-05-27 - API spec runtime alignment for frontend sync, [complete] 2026-05-27 - Docs governance + frontend sync validation baseline, [complete] 2026-05-27 - Legacy direct-approval guard update (superseded), [complete] 2026-05-27 - Stitch UI/UX sync pass (VietSage only) (+70 more)

### Community 4 - "httpErrorResponse"
Cohesion: 0.07
Nodes (73): GET(), HotelParams, jsonRecordSchema, PATCH(), updateHotelSchema, Context, DELETE(), mutate() (+65 more)

### Community 5 - "unwrapApiEnvelope"
Cohesion: 0.12
Nodes (8): unwrapApiEnvelope(), HotelOpsService, hotelPath(), CreateHotelStayInput, HotelArrival, HotelServiceItem, HotelStaySummary, req()

### Community 6 - "request-queue-client.tsx"
Cohesion: 0.09
Nodes (33): actionMeta, compareValues(), defaultLabels, escapeHtml(), formatDayFilterValue(), formatRequestMoney(), getExternalOrderStatusLabel(), getHttpErrorMessage() (+25 more)

### Community 7 - "page.tsx"
Cohesion: 0.08
Nodes (49): getExternalOrderStatusBadge(), GuestRequestsPage(), RequestSourceTab, GuestCurrentRequest(), Props, GuestRequestCard(), Props, GuestRequestCta() (+41 more)

### Community 8 - "marketing-shell.tsx"
Cohesion: 0.07
Nodes (33): items, metadata, items, metadata, metadata, posts, items, metadata (+25 more)

### Community 9 - "staff-billing-workspace-client.tsx"
Cohesion: 0.16
Nodes (11): AuthRequestOptions, BillingService, BillingServiceOptions, createBillingService(), hotelPath(), IssueInvoiceInput, FolioItem, FolioSummary (+3 more)

### Community 10 - "PLANS.md"
Cohesion: 0.01
Nodes (145): Archived Legacy PLANS.md, [complete] 2026-06-06 - Owner hotels React Query list cache, [complete] 2026-07-19 - Mission: workspace-v2-active-context (P0-A), [complete] 2026-07-19 - Mission: workspace-v2-persona-dashboards (P1), [complete] 2026-07-20 - Mission: workspace-rbac-and-staff-administration, [complete] 2026-07-20 - Mission: workspace-v2-dashboard-registry (P2), [complete] 2026-07-20 - Mission: workspace-v2-service-boundaries (P3), [complete] 2026-07-21 - Mission: owner-navigation-active-state (+137 more)

### Community 11 - "loadServerWorkspaceContext"
Cohesion: 0.10
Nodes (42): itemTypeLabels, labelStatus(), PageProps, paymentMethodLabels, paymentStatusLabels, StaffInvoicePage(), PageProps, StaffBillingPage() (+34 more)

### Community 12 - "auth-service.ts"
Cohesion: 0.08
Nodes (30): AuthErrorCode, AuthLoginResult, AuthMeResult, AuthService, AuthServiceOptions, AuthTokens, toAuthIdentity(), toAuthServiceError() (+22 more)

### Community 13 - "room-messages-client.tsx"
Cohesion: 0.35
Nodes (10): AudioWindow, OwnerHotelRequestRealtimeNotifier(), playUrgentRequestSound(), requestQueuePath(), HotelOpsRealtimeNotifier(), useSafeQueryClient(), StaffRequestListItem, invalidateHotelRealtimeQueries() (+2 more)

### Community 14 - "page.tsx"
Cohesion: 0.13
Nodes (23): navItems, NavKey, VsBottomNav(), VsBottomNavProps, GuestHomePage(), normalizeVietnameseText(), GuestMessagesPage(), getQuantityHint() (+15 more)

### Community 15 - "roles-live-filter.tsx"
Cohesion: 0.08
Nodes (34): AuthRedirectError, confirmRoleAction(), emptyRoleForm(), formatDate(), getUnauthorizedCount(), handleUnauthorizedResponse(), isRecord(), moduleFromPath() (+26 more)

### Community 16 - "2026-05-31"
Cohesion: 0.06
Nodes (33): 2026-05-31, Remaining Blockers / Risks, Remaining Blockers / Risks (401 Refresh + Logout Handling), Remaining Blockers / Risks (Fix Too Many Redirect Loop), Remaining Blockers / Risks (Hotfix: ERR_TOO_MANY_REDIRECTS), Remaining Blockers / Risks (Navigation Stability), Remaining Blockers / Risks (Per-API 401 Refresh + Retry), Remaining Blockers / Risks (Permissions UI Sync: Remove Back CTA + Keep Horizontal Tabs) (+25 more)

### Community 17 - "role-permissions-browser.tsx"
Cohesion: 0.07
Nodes (44): filterPermissions(), METHOD_FILTERS, MethodFilter, methodToneClassMap, PermissionWorkbench(), PermissionWorkbenchProps, sortPermissions(), toPermissionKey() (+36 more)

### Community 18 - "route-boundary-state.tsx"
Cohesion: 0.08
Nodes (11): BoundaryTone, ContentErrorState(), ContentErrorStateProps, ContentLoadingState(), ContentLoadingStateProps, RouteBoundaryState(), RouteBoundaryStateProps, RouteLoadingState() (+3 more)

### Community 19 - "compilerOptions"
Cohesion: 0.06
Nodes (30): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+22 more)

### Community 20 - "vs-icon.tsx"
Cohesion: 0.21
Nodes (36): POST(), GET(), GET(), allowed, Context, GET(), POST(), POST() (+28 more)

### Community 21 - "admin-service.ts"
Cohesion: 0.11
Nodes (19): AdminService, AdminServiceOptions, createAdminService(), TemporaryPasswordResult, AdminPage, CreateHotelInput, Hotel, HotelListQuery (+11 more)

### Community 22 - "page.tsx"
Cohesion: 0.15
Nodes (8): LaunchHold(), metadata, items, VsSidebarProps, VsTopBar(), VsTopBarProps, VietSageBrand(), VietSageBrandProps

### Community 23 - "workspace-registry.ts"
Cohesion: 0.09
Nodes (37): AdminShell(), AdminShellProps, SECTION_LABELS, SECTION_ORDER, VsDashboardSidebar(), VsDashboardSidebarProps, OwnerShell(), OwnerShellProps (+29 more)

### Community 24 - "page.tsx"
Cohesion: 0.21
Nodes (16): getQrCodeParam(), GUEST_QR_ERROR_KEYS, GuestQrEntryPage(), GuestQrErrorInfo, inferGuestQrErrorStatus(), isRecord(), isSessionSwitchRequired(), parseGuestQrError() (+8 more)

### Community 25 - "owner-service-catalog-client.tsx"
Cohesion: 0.07
Nodes (23): BaseLocale, CatalogLocale, catalogLocales, CatalogPage, CategoryFormState, CategorySortKey, emptyCategoryForm, getPageBounds() (+15 more)

### Community 26 - "page.tsx"
Cohesion: 0.04
Nodes (44): commonLinks, ACCESS_CONTROL_TABS, AccessControlNavHeaderProps, AccessControlTab, iconGlyph(), VsIcon(), VsIconProps, buildConfirmHtml() (+36 more)

### Community 27 - "owner-rooms-client.tsx"
Cohesion: 0.11
Nodes (29): canActivateQr(), compareRooms(), formatPriceInput(), formatVnd(), getActiveGuestDeviceCount(), getClientOriginSnapshot(), getQrMeta(), getResolvedMaxActiveGuestDevices() (+21 more)

### Community 28 - "server-workspace-context.ts"
Cohesion: 0.09
Nodes (35): AdminHotelsPage(), listTenantOwnersForSelector(), AdminLayout(), redirectToLogin(), AuthRefreshGate(), AuthRefreshGateProps, loginUrl(), logoutToLogin() (+27 more)

### Community 29 - "readServerSessionTokens"
Cohesion: 0.15
Nodes (18): POST(), serverErrorResponse(), tokenTail(), unauthorizedResponse(), GET(), refreshServerSessionAccessToken(), ServerAuthRefreshResult, HttpMethod (+10 more)

### Community 30 - "page.tsx"
Cohesion: 0.14
Nodes (14): AnimatedDashboardNumber(), AnimatedDashboardNumberProps, formatAnimatedValue(), parseNumberValue(), Dashboard, fallbackStatusLabel(), formatTime(), formatVnd() (+6 more)

### Community 31 - "internal-api-client.ts"
Cohesion: 0.25
Nodes (12): assertInternalApiPath(), createRequestInit(), fetchInternalApi(), InternalApiRequestOptions, parseResponseBody(), readInternalApiErrorMessage(), requestInternalApiEnvelope(), dispatchAuthLogoutRequired() (+4 more)

### Community 32 - "guest-session-bootstrap.tsx"
Cohesion: 0.23
Nodes (16): GuestSessionBootstrap(), GuestSessionState, useGuestSession(), normalizeGuestLocale(), decideGuestSessionValidationError(), isCurrentGuestSessionValidation(), isProtectedGuestRoute(), PROTECTED_GUEST_ROUTES (+8 more)

### Community 33 - "rbac-service.ts"
Cohesion: 0.07
Nodes (29): createRbacService(), CreateRoleBody, DeleteRoleResult, ListPermissionModulePermissionsOptions, ListPermissionsOptions, RbacService, RbacServiceOptions, toRolePermissionPayload() (+21 more)

### Community 34 - "page.tsx"
Cohesion: 0.11
Nodes (18): CategoryChipItem, GuestCategoryChips(), GuestCategoryChipsProps, guestIntlLocale(), GuestLocale, guestLocaleOptions, guestLocales, Dict (+10 more)

### Community 35 - "hotel-ops-contract.ts"
Cohesion: 0.33
Nodes (7): ownerRoomsRepository, StaffRoomsListInput, staffRoomsRepository, ownerRoomsResource, staffRoomsResource, HotelOpsPage, HotelRoomSummary

### Community 36 - "workstation-store.ts"
Cohesion: 0.12
Nodes (25): authCache, GET(), getCachedWorkstation(), headers, Context, GET(), headers, parseRecognition() (+17 more)

### Community 37 - "RbacService"
Cohesion: 0.12
Nodes (28): Params, POST(), Params, POST(), GET(), Params, POST(), GET() (+20 more)

### Community 38 - "staff-directory-resource.ts"
Cohesion: 0.05
Nodes (42): ChangePasswordDialog(), emptyForm, hiddenPasswords, PasswordField, passwordFields, canResetFrontdeskPassword(), PasswordSecurityFields, resetResponseHeaders() (+34 more)

### Community 39 - "workspace-context.ts"
Cohesion: 0.16
Nodes (18): AdminDashboardPage(), DashboardPageProps, AdminUsersPage(), first(), Props, first(), OwnerStaffPage(), Props (+10 more)

### Community 40 - "staff-rooms-client.tsx"
Cohesion: 0.13
Nodes (25): activeStayProgress(), emptyReservation(), FlowMode, formatDateTime(), getGuestQrUrl(), getRoomNumber(), getRoomQrValue(), getRoomStatus() (+17 more)

### Community 41 - "owner-stay-room-grid-client.tsx"
Cohesion: 0.14
Nodes (23): defaultCheckOutValue(), formatRoomDate(), formatRoomPrice(), getBusinessErrorMessage(), getNestedMessage(), getRoomAvailability(), getRoomNumber(), getRoomStatus() (+15 more)

### Community 42 - "auth.ts"
Cohesion: 0.13
Nodes (13): AuthServiceError, createAuthService(), authService, applySessionTokenUpdate(), AuthorizedUser, credentialsSchema, jwt(), returnJwtToken() (+5 more)

### Community 43 - "auth.ts"
Cohesion: 0.25
Nodes (7): BillingTabSwitcher(), BillingTabSwitcherProps, OwnerSaasBillingClient(), OwnerBillingPage(), PageProps, BillingPage, FolioListItem

### Community 44 - "workspace-shell.tsx"
Cohesion: 0.14
Nodes (20): Params, Params, Params, Params, Params, Params, Params, Params (+12 more)

### Community 45 - "page.tsx"
Cohesion: 0.14
Nodes (16): InvoiceActions(), Props, folioStatusLabels, formatQuantity(), InvoiceDetailView(), invoiceStatusLabels, isExternalInvoiceItem(), itemTypeLabels (+8 more)

### Community 46 - "hotels-admin-client.tsx"
Cohesion: 0.14
Nodes (17): buildTenantOptions(), createHotelFormSchema, emptyHotelForm, formatDate(), formatTenantDisplayName(), FormMode, HotelFormState, HotelsAdminClient() (+9 more)

### Community 47 - "dependencies"
Cohesion: 0.11
Nodes (19): @auth/core, @dangminhdev04032005/query-resource, dependencies, @auth/core, @dangminhdev04032005/query-resource, qrcode.react, react, react-dom (+11 more)

### Community 48 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, openapi-typescript, devDependencies, eslint, eslint-config-next, openapi-typescript, tailwindcss (+11 more)

### Community 49 - "authorize-hotel-workstation.ts"
Cohesion: 0.27
Nodes (7): Context, Context, DELETE(), Context, GET(), resolveIntakeAuthorizationMode(), authorizeHotelWorkstation()

### Community 50 - "OwnerServiceCatalogClient"
Cohesion: 0.14
Nodes (17): formatPriceInput(), formatQuantityRule(), formatVnd(), getItemCategory(), getItemCurrency(), getItemEffectivePrice(), getPageItems(), getPreviewErrorMessage() (+9 more)

### Community 51 - "http-client.ts"
Cohesion: 0.17
Nodes (17): clampBackendApiLimit(), clampBackendApiLimitValue(), appendQuery(), createTimeoutController(), extractApiResponseMessage(), HttpClientOptions, HttpRequestOptions, isPublicRequest() (+9 more)

### Community 52 - "2026-07-14 - Guest Request Contract Sync"
Cohesion: 0.07
Nodes (29): 2026-07-14 - Batch C Authenticated Request Realtime, 2026-07-14 - Guest Request Contract Sync, 2026-07-14 - GuestOS Reliable Request Recovery Batch B, [complete] 2026-07-21 - Mission: recover-e4711-ui-auth-rbac, [complete] 2026-07-27 - Mission: account-and-guest-entrypoint-ui-fixes, [complete] 2026-07-27 - Mission: per-hotel-google-sheets, [complete] 2026-07-27 - Mission: public-launch-and-frontdesk-workflow, [complete] 2026-07-27 - Mission: tenant-room-action-icons (+21 more)

### Community 53 - "cccd-preview.ts"
Cohesion: 0.11
Nodes (21): PageProps, BiometricOwnerTabs(), CccdCheckInCapture, CccdCheckInPanel(), Props, CccdPreview(), Props, WorkstationConnectionPanel() (+13 more)

### Community 54 - "CODEX-STITCH-SYNC.md"
Cohesion: 0.12
Nodes (16): Before modifying existing implemented screens, Command Understanding, Data Rules, Error Handling, Finalization, If the screen does not exist, If the screen exists clearly, If the user command is ambiguous (+8 more)

### Community 55 - "VietSage Auth/HTTP Stabilization Phase Plan"
Cohesion: 0.12
Nodes (16): Codex Prompt Template per Phase, Current State Summary, Final Definition of Done, Global Rules for Every Phase, Phase 0 — Repo Path + Documentation Hygiene, Phase 1 — Token Privacy: Stop Exposing Tokens in Browser Session, Phase 2 — Server Auth Coordinator + Pure `http-server.ts`, Phase 3 — Pure Browser `http-client.ts` + Remove Duplicate Refresh Owner (+8 more)

### Community 56 - "redirect-isolation-core.ts"
Cohesion: 0.22
Nodes (12): firstForwardedValue(), isLocalHost(), parseOrigin(), PostLoginRedirectInput, PostLoginRedirectUrlInput, resolveForwardedOrigin(), resolvePostLoginRedirect(), fakeCanAccess() (+4 more)

### Community 58 - "page.tsx"
Cohesion: 0.13
Nodes (8): getValidationErrors(), heroTypingPhrases, initialFormValues, inputClass(), RegisterFormErrors, RegisterFormValues, RegisterPage(), registerSchema

### Community 59 - "guest-stagger.tsx"
Cohesion: 0.13
Nodes (23): POST(), GET(), Params, Params, POST(), Params, POST(), Params (+15 more)

### Community 60 - "tenant-owners-client.tsx"
Cohesion: 0.15
Nodes (13): confirmOwnerSave(), createOwnerSchema, editOwnerSchema, emptyForm, formatDate(), formatTenantDisplayName(), FormMode, OwnerFormState (+5 more)

### Community 61 - "owner-hotels-client.tsx"
Cohesion: 0.29
Nodes (8): OwnerRequestRealtimeNotifier(), formatDate(), getErrorMessage(), OwnerHotelsClient(), statusLabel(), statusTone(), useOwnerHotelsQuery(), ownerHotelsResource

### Community 62 - "hasAppRole"
Cohesion: 0.10
Nodes (28): GET(), APP_ROLE_PRIORITY, getPrimaryAppRole(), isPrincipalRole(), isRoleMatch(), normalizeRole(), AccountAction, GUEST_ACTION (+20 more)

### Community 63 - "check-in-workspace.tsx"
Cohesion: 0.11
Nodes (22): BillableDayItem, OwnerAnalyticsData, PaginatedResult, PeriodItem, DataTable(), pageBounds(), resolveAlignment(), resolveWidthClass() (+14 more)

### Community 64 - "http-server.ts"
Cohesion: 0.12
Nodes (22): changePasswordSchema, noStore(), POST(), appendQuery(), createTimeoutController(), httpServer, HttpServerRequestConfig, isPublicRequest() (+14 more)

### Community 65 - "intake-contract.ts"
Cohesion: 0.11
Nodes (15): createIntakeSessionSchema, IntakePayload, intakePayloadSchema, IntakePayloadV2, intakePayloadV2Schema, IntakeSessionIssued, IntakeSessionStatus, omitBlankOptionals() (+7 more)

### Community 66 - "permission-workbench.tsx"
Cohesion: 0.14
Nodes (18): useGuestMarketplace(), guestMarketplaceRepository, request(), guestMarketplaceResource, CreateMarketplaceOrderInput, MarketplaceCategory, MarketplaceCategoryTranslation, MarketplaceOrder (+10 more)

### Community 67 - "qr-export-client.tsx"
Cohesion: 0.18
Nodes (13): PageProps, getClientOriginSnapshot(), getServerOriginSnapshot(), OwnerRoomsQrExportClient(), Props, subscribeClientOriginChange(), useClientOrigin(), getGuestQrUrl() (+5 more)

### Community 68 - "change-password-dialog.tsx"
Cohesion: 0.16
Nodes (17): Context, DELETE(), HotelStaffMutationResult, mutate(), PUT(), createUserSchema, GET(), POST() (+9 more)

### Community 69 - "rbac.ts"
Cohesion: 0.13
Nodes (22): BUSINESS_ERROR_KEYS, ErrorPayload, HTTP_ERROR_KEYS, isNetworkError(), isRecord(), logFrontendError(), numberField(), readErrorPayload() (+14 more)

### Community 70 - "Backend Proposal: GuestOS Multilingual API Support for `/g/**`"
Cohesion: 0.14
Nodes (13): 1. Locale Negotiation, 2. Translated Service Catalog Responses, 3. Request Snapshot Localization, 4. QR Session Language Persistence, 5. Error and Validation Messages, 6. Realtime Event Localization, Acceptance Criteria, Backend Proposal: GuestOS Multilingual API Support for `/g/**` (+5 more)

### Community 71 - "PROJECT RULES"
Cohesion: 0.13
Nodes (14): API Logging Rule (Mandatory), API Transport Rule (Mandatory), Auth & Routing Rules, Change Tracking Rule (Mandatory), Core Rules, Data Fetching, Entity Selection & UX Rules (Mandatory), Execution Contract (Mandatory) (+6 more)

### Community 72 - "proxy.ts"
Cohesion: 0.10
Nodes (23): config, buildLoginRedirect(), GET(), getCallbackUrl(), isExpectedRefreshFailure(), POST(), refreshFailureResponse(), serverErrorResponse() (+15 more)

### Community 73 - "page.tsx"
Cohesion: 0.18
Nodes (15): AdminRolesPage(), isRecord(), mapRole(), moduleFromPath(), normalizeSidebarItems(), RolePermissionView, RolesPageProps, toObjectArray() (+7 more)

### Community 74 - "page.tsx"
Cohesion: 0.53
Nodes (5): getFirst(), getPositiveInt(), normalizeDayFilter(), OwnerHotelRequestsPage(), PageProps

### Community 75 - "OwnerRoomsClient"
Cohesion: 0.10
Nodes (19): ApiEnvelope, isRecord(), toApiErrorMessage(), AuthRequestOptions, createHotelOpsService(), HotelOpsServiceOptions, isRecord(), parseServiceCatalogSyncResponse() (+11 more)

### Community 76 - "backend-api-config.ts"
Cohesion: 0.19
Nodes (15): GET(), PATCH(), POST(), proxyToNest(), BackendApiEnvironment, BackendApiLimitQueryValue, BackendApiLimitValue, getBrowserBackendApiBaseUrl() (+7 more)

### Community 77 - "staff-management-client.tsx"
Cohesion: 0.20
Nodes (11): OneTimePasswordDialog(), generateTemporaryPassword(), getErrorMessage(), MarketplaceAdminClient(), marketplaceAdminRepository, invalidates, marketplaceAdminResource, MarketplaceAdminAction (+3 more)

### Community 78 - "VietSage Frontend Architecture"
Cohesion: 0.15
Nodes (12): 10. Frontend and Backend Boundary, 11. Rules Summary, 1. Purpose, 2. Docs Index, 3. Core Principles, 4. Standard App Structure, 5. Layer Responsibilities, 6. Runtime Boundary Summary (+4 more)

### Community 79 - "DESIGN.md"
Cohesion: 0.15
Nodes (12): Admin Data Visualization, Brand & Style, Colors, Components, Elevation & Depth, Input Fields, Layout & Spacing, Premium Service Cards (+4 more)

### Community 80 - "route.ts"
Cohesion: 0.12
Nodes (18): createRequestEventSchema, Params, POST(), GET(), getPositiveInt(), normalizeDayFilter(), normalizePriority(), Params (+10 more)

### Community 81 - "mock.ts"
Cohesion: 0.17
Nodes (10): statusClassMap, VsStatusChipProps, adminRecentRequests, guestServices, guestTrackingHistory, RequestPriority, RequestStatus, ServiceCategory (+2 more)

### Community 82 - "use-guest-request-realtime.ts"
Cohesion: 0.17
Nodes (6): createGuestConnectionManager(), Entry, GuestRealtimeHandlers, GuestSocket, RealtimeError, OwnerRealtimeHandlers

### Community 83 - "page.tsx"
Cohesion: 0.31
Nodes (8): PermissionsWarningsAlert(), PermissionsWarningsAlertProps, AdminPermissionsPage(), extractParam(), isRecord(), mapRole(), PermissionsPageProps, toObjectArray()

### Community 84 - "service-catalog-client.tsx"
Cohesion: 0.11
Nodes (28): defaultLabels, hasDisplayableTimelineEvent(), RequestDetailClient(), RequestDetailClientProps, RequestDetailLabels, CategoryFormState, emptyCategoryForm, ItemFormState (+20 more)

### Community 85 - "page.tsx"
Cohesion: 0.33
Nodes (8): assertCanAccessOwner(), ownerAccessMessage(), redirectOwnerToLogin(), requireOwnerServerTokens(), getOwnerVisibleHotel(), OwnerHotelPage(), OwnerHotelPageProps, OwnerLayout()

### Community 86 - "data-table.tsx"
Cohesion: 0.16
Nodes (14): CodeCell(), DateCell(), MoneyCell(), STATUS_MAP, StatusBadge(), StatusBadgeProps, StatusVariant, TextCell() (+6 more)

### Community 87 - "v1.ts"
Cohesion: 0.21
Nodes (13): PartnerFormModal(), PartnerFormModalProps, OwnerNearbyProvidersClient(), StaffLocalPartnersClient(), useLocalPartners(), useNearbyServiceProviders(), localPartnersRepository, invalidates (+5 more)

### Community 88 - "owner-connection-manager.ts"
Cohesion: 0.13
Nodes (8): createOwnerConnectionManager(), Entry, ManagedSocket, RealtimeError, ownerRequestRealtimeManager, serviceTenantRequestRealtimeManager, Handlers, Handlers

### Community 89 - "Frontend Runtime and UI Guide"
Cohesion: 0.20
Nodes (9): Component Ownership, Frontend Runtime and UI Guide, I18n, Loading, Error, and Empty States, Purpose, Realtime, Server and Client Components, State Ownership (+1 more)

### Community 90 - "auth-refresh-smoke.mjs"
Cohesion: 0.42
Nodes (9): assert(), checks, createRefreshCoordinator(), createServer(), listen(), requestInternalApiLike(), runFailureScenario(), runSuccessScenario() (+1 more)

### Community 91 - "layout.tsx"
Cohesion: 0.23
Nodes (8): AppToaster(), getQueryClient(), makeQueryClient(), ReactQueryProvider(), ReactQueryProviderProps, fraunces, manrope, metadata

### Community 92 - "workstation-repository.ts"
Cohesion: 0.18
Nodes (16): DELETE(), GET(), headers, POST(), Context, headers, POST(), headers (+8 more)

### Community 93 - "Frontend API Integration Guide"
Cohesion: 0.22
Nodes (8): Anti-patterns, Auth and Session Rules, Contract Rules, Error Contract Rules, Frontend API Integration Guide, HTTP Rules, Purpose, Standard API Flow

### Community 94 - "Frontend Feature Guide"
Cohesion: 0.22
Nodes (8): Adding a Feature, Anti-patterns, Dependency Rules, Extending a Workspace Dashboard, Folder Responsibilities, Frontend Feature Guide, Purpose, Standard Feature Shape

### Community 95 - "staff-management-service.ts"
Cohesion: 0.13
Nodes (15): POST(), GET(), inputSchema, Params, POST(), Params, POST(), schema (+7 more)

### Community 96 - "Frontend Smoke Tests"
Cohesion: 0.25
Nodes (7): Auth Refresh And Callback Smoke, Auth Refresh Concurrency Harness, Automated Commands, Frontend Smoke Tests, Manual Route Smoke, Remaining Large-Component And A11y Refactor List, Workspace V2 P3 Role Matrix

### Community 97 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, smoke:build, smoke:lint, start, sync:api:types

### Community 98 - "PRODUCT.md"
Cohesion: 0.25
Nodes (7): Accessibility, Anti-References, Core Jobs, Personality, Product Principles, Register, Users

### Community 99 - "Frontend Instructions: GuestOS Backend I18n Sync"
Cohesion: 0.29
Nodes (6): Backend Follow-Up Still Needed, Current Backend Contract, Expected Behavior After Frontend Sync, Frontend Instructions: GuestOS Backend I18n Sync, Implementation Instructions, Verification Checklist

### Community 100 - "PROJECT PLAN"
Cohesion: 0.29
Nodes (7): 2026-06-05, 2026-07-14 - Restore Frontend Dev Task, PROJECT PLAN, Remaining Blockers / Risks, Roadmap: Owner Stay Management, Verification Result, What Changed

### Community 101 - "password-ui-entrypoints.test.mjs"
Cohesion: 0.29
Nodes (5): changePasswordDialog, owners, secretDialog, staff, topbar

### Community 102 - "sync-openapi-types.mjs"
Cohesion: 0.29
Nodes (5): __dirname, __filename, outputPath, projectRoot, sourcePath

### Community 103 - "admin-resource.ts"
Cohesion: 0.43
Nodes (3): adminRepository, TemporaryPasswordResult, adminResource

### Community 104 - "use-google-sheet-config.ts"
Cohesion: 0.24
Nodes (8): useOwnerGoogleSheetSync(), useOwnerServiceCatalogCommit(), useOwnerServiceCatalogPreview(), googleSheetConfigRepository, adminGoogleSheetConfigResource, HotelScope, ownerGoogleSheetSyncResource, ServiceCatalogSyncResult

### Community 105 - "service-catalog-error.ts"
Cohesion: 0.43
Nodes (5): getServiceCatalogErrorMessage(), getServiceCatalogSyncNotice(), isRecord(), nestedDetail(), SyncNoticeInput

### Community 106 - "password-security.ts"
Cohesion: 0.23
Nodes (16): useHotelMessageUnread(), UseHotelMessageUnreadOptions, useOptionalQueryClient(), badgeText(), ConversationClosedRealtimeEvent, createEventDeduper(), GuestMessageRealtimeEvent, isConversationClosedEvent() (+8 more)

### Community 107 - "next-auth.d.ts"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 108 - "Frontend Codex Instructions"
Cohesion: 0.40
Nodes (4): Completion Report, Frontend Codex Instructions, Frontend Rules, Required Reading

### Community 109 - "Frontend Codex Instructions"
Cohesion: 0.40
Nodes (4): Completion Report, Frontend Codex Instructions, Frontend Rules, Required Reading

### Community 111 - "chat-layout-regression.test.mjs"
Cohesion: 0.40
Nodes (4): guestDictionarySource, guestSource, staffSource, workspaceShellSource

### Community 112 - "marketing-motion-smoke.test.mjs"
Cohesion: 0.40
Nodes (4): globalCss, landingPage, marketingShell, motionRoot

### Community 113 - "face-id-notification-test.test.ts"
Cohesion: 0.40
Nodes (4): page, panel, registry, tabs

### Community 114 - "auth-cookie-policy.ts"
Cohesion: 0.20
Nodes (17): displayGuest(), displayRoom(), FolioItemsPage, formatDate(), formatNumberInput(), formatNumberOrPercentInput(), getFolioInvoiceId(), getItemIcon() (+9 more)

### Community 115 - "2026-07-14 - Cinematic Landing Motion"
Cohesion: 0.50
Nodes (4): 2026-07-14 - Cinematic Landing Motion, Remaining Blockers / Risks, Verification Result, What Changed

### Community 116 - "2026-07-14 - Marketing Navigation Usability Fix"
Cohesion: 0.50
Nodes (4): 2026-07-14 - Marketing Navigation Usability Fix, Remaining Blockers / Risks, Verification Result, What Changed

### Community 117 - "2026-07-14 - Solutions Dropdown Alignment Fix"
Cohesion: 0.50
Nodes (4): 2026-07-14 - Solutions Dropdown Alignment Fix, Remaining Blockers / Risks, Verification Result, What Changed

### Community 118 - "2026-07-22 - Stay-Scoped Front Desk Messages"
Cohesion: 0.50
Nodes (4): 2026-07-22 - Stay-Scoped Front Desk Messages, Remaining Blockers / Risks, Verification Result, What Changed

### Community 119 - "Active Plan"
Cohesion: 0.50
Nodes (4): Active Plan, [processing] Cross-device visual QA and cache verification, [processing] Frontend foundation and management system development, [processing] Staff route UX completion and RBAC hardening follow-up

### Community 120 - "[complete] 2026-07-14 - Guest Experience Redesign (Phases 0-3)"
Cohesion: 0.50
Nodes (4): [complete] 2026-07-14 - Guest Experience Redesign (Phases 0-3), Remaining Blockers / Risks, Verification Result, What Changed

### Community 121 - "[complete] 2026-07-27 - Mission: tenant-room-action-icons"
Cohesion: 0.25
Nodes (11): ServiceCatalogPage(), ServiceDashboardPage(), ServiceSettingsPage(), escapeHtml(), ServiceCatalogView(), getNextStatus(), ServiceDashboardView(), locationFrom() (+3 more)

### Community 122 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 123 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 124 - "staff-room-qr-regression.test.mjs"
Cohesion: 0.50
Nodes (3): guestQrEntrySource, ownerQrUtilsSource, staffRoomsSource

### Community 126 - "getNestedMessage"
Cohesion: 0.67
Nodes (4): getBusinessErrorMessage(), getNestedMessage(), isRecord(), isTechnicalMessage()

### Community 127 - "workstation-connection-panel.test.ts"
Cohesion: 0.50
Nodes (3): dashboard, route, source

### Community 128 - "[complete] 2026-07-28 - Mission: guest-qr-device-recovery"
Cohesion: 0.21
Nodes (14): ServiceOrdersPage(), getGuestOrderStatusBadge(), GuestMarketplace(), formatQuantityWithUnit(), formatSubtotalAmount(), formatUnitPriceWithUnit(), getServicePricingUnit(), GuestTranslator (+6 more)

### Community 135 - "@dangminhdev04032005/query-resource"
Cohesion: 0.22
Nodes (3): LocalPartnersClientService, HotelMarketplaceOrder, LocalPartner

### Community 163 - "guest-request-realtime-notifier.tsx"
Cohesion: 0.18
Nodes (10): GuestMotionProvider(), GuestPageTransition(), AudioWindow, dispatchGuestRequestRealtime(), GuestRequestRealtimeBrowserEvent, GuestRequestRealtimeNotifier(), playGuestRequestSound(), guestRequestRealtimeManager (+2 more)

### Community 164 - "room-messages-client.tsx"
Cohesion: 0.20
Nodes (14): appendMessageToThreadCache(), emitTypingSignal(), formatMessageTime(), markThreadReadInCache(), Message, removeClosedStayFromWaitingListInCache(), RoomMessagesClient(), Thread (+6 more)

### Community 166 - "owner-hotel-detail-client.tsx"
Cohesion: 0.22
Nodes (11): FormState, locationFromHotel(), OwnerHotelDetailClient(), OwnerHotelDetailClientProps, LocationFields(), LocationValue, parseGoogleMapsCoordinates(), Loaded() (+3 more)

### Community 167 - "validationErrorResponse"
Cohesion: 0.19
Nodes (11): GET(), Params, Params, POST(), createCategorySchema, GET(), Params, POST() (+3 more)

### Community 168 - "login-page.tsx"
Cohesion: 0.20
Nodes (10): getInitialLoginValues(), getLoginSearchParams(), getValidationErrors(), heroTypingPhrases, initialLoginValues, LoginFormErrors, LoginFormValues, LoginPage() (+2 more)

### Community 169 - "_utils.ts"
Cohesion: 0.20
Nodes (10): Params, PATCH(), updateRequestAssignmentSchema, getOwnerAccessToken(), getOwnerAuthTokens(), OwnerAuthTokens, OwnerBackendRequest, OwnerSessionTokenMetadata (+2 more)

### Community 170 - "guest-store.ts"
Cohesion: 0.18
Nodes (10): emitHydrationChange(), GuestHotelState, GuestProfileState, GuestRoomState, GuestStore, hydrationListeners, initialGuestState, subscribeToHydration() (+2 more)

### Community 171 - "guest-local-partners.tsx"
Cohesion: 0.29
Nodes (7): distanceLabel(), GuestLocalPartners(), GuestNearbyPreview(), PartnerDetailModal(), safeExternalUrl(), useGuestLocalPartners(), guestLocalPartnersResource

### Community 172 - "billing-folio-table-client.tsx"
Cohesion: 0.27
Nodes (7): BillingFolioTableClient(), BillingFolioTableClientProps, FolioModal(), StatusBadge(), statusLabels, toDisplayStatus(), formatDateTime()

### Community 173 - "admin-billing-client.tsx"
Cohesion: 0.25
Nodes (6): AdminBillingClient(), Contract, HotelOption, Period, Summary, metadata

### Community 174 - "hotel-messages-resource.ts"
Cohesion: 0.32
Nodes (6): hotelMessagesResource, Scope, HotelMessage, HotelMessageThread, HotelMessageThreadList, HotelMessageThreadPage

### Community 175 - "audio-notifier.ts"
Cohesion: 0.43
Nodes (6): AudioWindow, getAudioContext(), playMessageAlertSound(), playRequestAlertSound(), useServiceTenantRealtime(), ServiceTenantRealtimeNotifier()

### Community 176 - "route.ts"
Cohesion: 0.29
Nodes (6): createCategorySchema, GET(), Params, POST(), translationSchema, translationsSchema

### Community 177 - "route.ts"
Cohesion: 0.29
Nodes (6): createItemSchema, GET(), Params, POST(), translationSchema, translationsSchema

### Community 178 - "route.ts"
Cohesion: 0.29
Nodes (6): Params, PATCH(), translationSchema, translationsSchema, updateItemSchema, UpdateServiceItemInput

### Community 179 - "route.ts"
Cohesion: 0.29
Nodes (6): createItemSchema, GET(), Params, POST(), translationSchema, translationsSchema

### Community 180 - "route.ts"
Cohesion: 0.33
Nodes (5): Params, PATCH(), translationSchema, translationsSchema, updateItemSchema

### Community 181 - "route.ts"
Cohesion: 0.40
Nodes (5): GET(), Params, POST(), sanitizeCreateRoomPayload(), CreateHotelRoomInput

### Community 182 - "route.ts"
Cohesion: 0.33
Nodes (5): Params, PATCH(), translationSchema, translationsSchema, updateCategorySchema

### Community 183 - "route.ts"
Cohesion: 0.40
Nodes (5): createStaySchema, occupantSchema, Params, POST(), sanitizeCreateStayPayload()

### Community 184 - "invoice-print-button.tsx"
Cohesion: 0.47
Nodes (5): buildWordHtml(), downloadWordInvoice(), getInvoiceFileName(), InvoicePrintButton(), InvoicePrintButtonProps

### Community 185 - "categoryToForm"
Cohesion: 0.40
Nodes (6): categoryToForm(), emptyItemForm(), emptyTranslations(), itemToForm(), toPriceString(), translationsToForm()

### Community 186 - "staff-dashboard-loader.ts"
Cohesion: 0.33
Nodes (5): EMPTY_STAFF_DASHBOARD_DATA, loadStaffDashboardData(), LoadStaffDashboardDataInput, StaffDashboardData, StaffRequestSummaryResponse

### Community 187 - "route.ts"
Cohesion: 0.60
Nodes (4): GET(), normalizeDayFilter(), Params, positiveInt()

### Community 188 - "route.ts"
Cohesion: 0.40
Nodes (4): GET(), listRoomsQuerySchema, Params, paramsSchema

### Community 189 - "route.ts"
Cohesion: 0.40
Nodes (4): Params, PATCH(), updateRequestStatusSchema, UpdateHotelRequestStatusInput

### Community 190 - "route.ts"
Cohesion: 0.50
Nodes (4): Params, PATCH(), sanitizeUpdateRoomPayload(), UpdateHotelRoomInput

### Community 191 - "route.ts"
Cohesion: 0.50
Nodes (3): Params, PATCH(), schema

### Community 192 - "route.ts"
Cohesion: 0.50
Nodes (3): Params, PUT(), schema

### Community 193 - "route.ts"
Cohesion: 0.67
Nodes (3): Params, PATCH(), sanitizeUpdateRoomPayload()

### Community 194 - "staff-saas-reminder.test.ts"
Cohesion: 0.50
Nodes (3): billingServicePath, pagePath, reminderPath

### Community 195 - "billing-folio-pagination.test.ts"
Cohesion: 0.50
Nodes (3): clientPath, pagePath, switcherPath

### Community 196 - "getNestedMessage"
Cohesion: 0.67
Nodes (4): getBusinessErrorMessage(), getNestedMessage(), isRecord(), isTechnicalMessage()

## Knowledge Gaps
- **1179 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+1174 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HttpError` connect `workspace-shell.tsx` to `HttpError`, `executeHotelOpsBackendRequest`, `httpErrorResponse`, `request-queue-client.tsx`, `page.tsx`, `auth-service.ts`, `page.tsx`, `roles-live-filter.tsx`, `role-permissions-browser.tsx`, `vs-icon.tsx`, `page.tsx`, `owner-service-catalog-client.tsx`, `owner-rooms-client.tsx`, `internal-api-client.ts`, `guest-session-bootstrap.tsx`, `room-messages-client.tsx`, `RbacService`, `owner-hotel-detail-client.tsx`, `validationErrorResponse`, `_utils.ts`, `owner-stay-room-grid-client.tsx`, `hotels-admin-client.tsx`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `http-client.ts`, `route.ts`, `guest-stagger.tsx`, `route.ts`, `route.ts`, `route.ts`, `http-server.ts`, `route.ts`, `route.ts`, `route.ts`, `change-password-dialog.tsx`, `tenant-owners-client.tsx`, `rbac.ts`, `page.tsx`, `route.ts`, `page.tsx`, `staff-management-service.ts`, `password-security.ts`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `VsIcon()` connect `page.tsx` to `[complete] 2026-07-28 - Mission: guest-qr-device-recovery`, `request-queue-client.tsx`, `page.tsx`, `loadServerWorkspaceContext`, `page.tsx`, `roles-live-filter.tsx`, `role-permissions-browser.tsx`, `page.tsx`, `workspace-registry.ts`, `page.tsx`, `owner-service-catalog-client.tsx`, `owner-rooms-client.tsx`, `page.tsx`, `room-messages-client.tsx`, `staff-directory-resource.ts`, `workspace-context.ts`, `staff-rooms-client.tsx`, `owner-stay-room-grid-client.tsx`, `login-page.tsx`, `admin-billing-client.tsx`, `hotels-admin-client.tsx`, `page.tsx`, `tenant-owners-client.tsx`, `owner-hotels-client.tsx`, `check-in-workspace.tsx`, `qr-export-client.tsx`, `page.tsx`, `staff-management-client.tsx`, `page.tsx`, `page.tsx`, `auth-cookie-policy.ts`, `[complete] 2026-07-27 - Mission: tenant-room-action-icons`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `unwrapApiEnvelope()` connect `unwrapApiEnvelope` to `rbac-service.ts`, `guest-os-contract.ts`, `permission-workbench.tsx`, `room-messages-client.tsx`, `httpErrorResponse`, `staff-directory-resource.ts`, `@dangminhdev04032005/query-resource`, `HttpClient`, `staff-billing-workspace-client.tsx`, `OwnerRoomsClient`, `auth-service.ts`, `auth.ts`, `admin-service.ts`, `v1.ts`, `guest-stagger.tsx`, `workstation-repository.ts`, `internal-api-client.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _1179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `executeHotelOpsBackendRequest` be split into smaller, more focused modules?**
  _Cohesion score 0.08505747126436781 - nodes in this community are weakly interconnected._
- **Should `guest-os-contract.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08311688311688312 - nodes in this community are weakly interconnected._