# Graph Report - front-end-vietsage  (2026-08-02)

## Corpus Check
- 451 files · ~308,118 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2798 nodes · 6634 edges · 163 communities (138 shown, 25 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fe932a21`
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

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 109 edges
2. `unwrapApiEnvelope()` - 107 edges
3. `Execution Log` - 78 edges
4. `executeOwnerBackendRequest()` - 63 edges
5. `successResponse()` - 60 edges
6. `ownerHttpErrorResponse()` - 60 edges
7. `unknownServerErrorResponse()` - 60 edges
8. `executeHotelOpsBackendRequest()` - 57 edges
9. `validationErrorResponse()` - 56 edges
10. `successResponse()` - 55 edges

## Surprising Connections (you probably didn't know these)
- `GuestQrEntryPage()` --indirect_call--> `session()`  [INFERRED]
  src/app/(vietsage)/g/[qrCode]/page.tsx → src/libs/auth.ts
- `OwnerInvoiceDetailPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx → src/libs/server-api-auth.ts
- `OwnerBillingPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx → src/libs/server-api-auth.ts
- `OwnerHotelRoomsPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/page.tsx → src/libs/server-api-auth.ts
- `OwnerHotelServicesPage()` --calls--> `createAuthorizedApiExecutor()`  [EXTRACTED]
  src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/services/page.tsx → src/libs/server-api-auth.ts

## Import Cycles
- None detected.

## Communities (163 total, 25 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.06
Nodes (96): Params, POST(), Params, POST(), Params, PATCH(), updateRequestAssignmentSchema, createRequestEventSchema (+88 more)

### Community 1 - "executeHotelOpsBackendRequest"
Cohesion: 0.06
Nodes (90): Params, POST(), GET(), Params, GET(), Params, GET(), Params (+82 more)

### Community 2 - "guest-os-contract.ts"
Cohesion: 0.05
Nodes (84): POST(), POST(), GET(), POST(), POST(), sanitizeScanPayload(), cancelGuestRequest(), Params (+76 more)

### Community 3 - "Execution Log"
Cohesion: 0.03
Nodes (78): [complete] 2026-05-26 - Guest templates visual alignment pass, [complete] 2026-05-26 - Guest welcome page desktop UX upgrade, [complete] 2026-05-26 - Guest welcome page strict template sync pass, [complete] 2026-05-26 - Project rules execution contract update, [complete] 2026-05-27 - API spec runtime alignment for frontend sync, [complete] 2026-05-27 - Docs governance + frontend sync validation baseline, [complete] 2026-05-27 - Legacy direct-approval guard update (superseded), [complete] 2026-05-27 - Stitch UI/UX sync pass (VietSage only) (+70 more)

### Community 4 - "httpErrorResponse"
Cohesion: 0.09
Nodes (58): GET(), HotelParams, jsonRecordSchema, PATCH(), updateHotelSchema, Context, DELETE(), mutate() (+50 more)

### Community 5 - "unwrapApiEnvelope"
Cohesion: 0.06
Nodes (30): unwrapApiEnvelope(), AuthRequestOptions, createHotelOpsService(), HotelOpsService, HotelOpsServiceOptions, hotelPath(), isRecord(), parseServiceCatalogSyncResponse() (+22 more)

### Community 6 - "request-queue-client.tsx"
Cohesion: 0.08
Nodes (49): actionMeta, compareValues(), defaultLabels, escapeHtml(), formatDayFilterValue(), formatRequestMoney(), getHttpErrorMessage(), getServiceDetailPrice() (+41 more)

### Community 7 - "page.tsx"
Cohesion: 0.11
Nodes (39): GuestRequestsPage(), GuestCurrentRequest(), Props, GuestRequestCard(), Props, formatGuestMoney(), getEstimatedTotal(), getMiddleProgressIcon() (+31 more)

### Community 8 - "marketing-shell.tsx"
Cohesion: 0.07
Nodes (32): items, metadata, items, metadata, metadata, posts, items, metadata (+24 more)

### Community 9 - "staff-billing-workspace-client.tsx"
Cohesion: 0.08
Nodes (31): displayGuest(), displayRoom(), FolioItemsPage, formatDate(), getFolioInvoiceId(), getItemIcon(), getStatusBadge(), Props (+23 more)

### Community 10 - "PLANS.md"
Cohesion: 0.04
Nodes (47): Archived Legacy PLANS.md, [complete] 2026-06-06 - Owner hotels React Query list cache, [complete] 2026-07-19 - Mission: workspace-v2-active-context (P0-A), [complete] 2026-07-19 - Mission: workspace-v2-persona-dashboards (P1), [complete] 2026-07-20 - Mission: workspace-rbac-and-staff-administration, [complete] 2026-07-20 - Mission: workspace-v2-dashboard-registry (P2), [complete] 2026-07-20 - Mission: workspace-v2-service-boundaries (P3), [complete] 2026-07-21 - Mission: owner-navigation-active-state (+39 more)

### Community 11 - "loadServerWorkspaceContext"
Cohesion: 0.16
Nodes (30): PageProps, StaffInvoicePage(), PageProps, StaffBillingPage(), PageProps, StaffHotelBiometricPage(), formatDayMonth(), attentionRoute() (+22 more)

### Community 12 - "auth-service.ts"
Cohesion: 0.08
Nodes (30): AuthErrorCode, AuthLoginResult, AuthMeResult, AuthService, AuthServiceOptions, AuthTokens, toAuthIdentity(), toAuthServiceError() (+22 more)

### Community 13 - "room-messages-client.tsx"
Cohesion: 0.09
Nodes (28): formatMessageTime(), Message, RoomMessagesClient(), Thread, ThreadList, ThreadPage, AudioWindow, OwnerHotelRequestRealtimeNotifier() (+20 more)

### Community 14 - "page.tsx"
Cohesion: 0.11
Nodes (29): navItems, NavKey, VsBottomNav(), VsBottomNavProps, VsTopBar(), GuestHomePage(), normalizeVietnameseText(), GuestMessagesPage() (+21 more)

### Community 15 - "roles-live-filter.tsx"
Cohesion: 0.09
Nodes (25): AuthRedirectError, emptyRoleForm(), formatDate(), getUnauthorizedCount(), handleUnauthorizedResponse(), isRecord(), moduleFromPath(), PROTECTED_ROLE_CODES (+17 more)

### Community 16 - "2026-05-31"
Cohesion: 0.06
Nodes (33): 2026-05-31, Remaining Blockers / Risks, Remaining Blockers / Risks (401 Refresh + Logout Handling), Remaining Blockers / Risks (Fix Too Many Redirect Loop), Remaining Blockers / Risks (Hotfix: ERR_TOO_MANY_REDIRECTS), Remaining Blockers / Risks (Navigation Stability), Remaining Blockers / Risks (Per-API 401 Refresh + Retry), Remaining Blockers / Risks (Permissions UI Sync: Remove Back CTA + Keep Horizontal Tabs) (+25 more)

### Community 17 - "role-permissions-browser.tsx"
Cohesion: 0.11
Nodes (30): arePermissionIdsEqual(), buildPermissionModules(), BUSINESS_MODULE_LABELS, businessActionLabel(), countPermissionSelectionDelta(), DraftPermissionIdsByRoleId, ErrorByRoleId, fetchRolePermissions() (+22 more)

### Community 18 - "route-boundary-state.tsx"
Cohesion: 0.08
Nodes (11): BoundaryTone, ContentErrorState(), ContentErrorStateProps, ContentLoadingState(), ContentLoadingStateProps, RouteBoundaryState(), RouteBoundaryStateProps, RouteLoadingState() (+3 more)

### Community 19 - "compilerOptions"
Cohesion: 0.06
Nodes (30): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+22 more)

### Community 20 - "vs-icon.tsx"
Cohesion: 0.10
Nodes (19): commonLinks, ACCESS_CONTROL_TABS, AccessControlNavHeaderProps, AccessControlTab, iconGlyph(), VsIcon(), VsIconProps, GuestHomeCta() (+11 more)

### Community 21 - "admin-service.ts"
Cohesion: 0.13
Nodes (17): HttpClient, AdminService, AdminServiceOptions, createAdminService(), TemporaryPasswordResult, AdminPage, CreateHotelInput, Hotel (+9 more)

### Community 22 - "page.tsx"
Cohesion: 0.09
Nodes (19): LaunchHold(), metadata, VsLogoutButton(), VsLogoutButtonProps, items, VsSidebarProps, VsTopBarProps, getInitialLoginValues() (+11 more)

### Community 23 - "workspace-registry.ts"
Cohesion: 0.12
Nodes (24): AdminDashboardPage(), DashboardPageProps, OwnerHotelsPage(), buildWorkspaceNavigation(), createWorkspaceRegistry(), getWorkspaceDashboardWidgets(), hasAnyCapability(), mergeByKey() (+16 more)

### Community 24 - "page.tsx"
Cohesion: 0.14
Nodes (20): getQrCodeParam(), GUEST_QR_ERROR_KEYS, GuestQrEntryPage(), GuestQrErrorInfo, inferGuestQrErrorStatus(), isRecord(), isSessionSwitchRequired(), parseGuestQrError() (+12 more)

### Community 25 - "owner-service-catalog-client.tsx"
Cohesion: 0.07
Nodes (22): BaseLocale, CatalogLocale, catalogLocales, CatalogPage, CategoryFormState, CategorySortKey, emptyCategoryForm, getPageBounds() (+14 more)

### Community 26 - "page.tsx"
Cohesion: 0.10
Nodes (15): buildConfirmHtml(), escapeHtml(), getQuantityHint(), getServicePrice(), GuestTranslator, GuestRequestSheet(), GuestRequestSheetProps, GuestServiceEmptyState() (+7 more)

### Community 27 - "owner-rooms-client.tsx"
Cohesion: 0.10
Nodes (22): getBusinessErrorMessage(), getClientOriginSnapshot(), getNestedMessage(), getRoomPrice(), getServerOriginSnapshot(), isRecord(), isTechnicalMessage(), Props (+14 more)

### Community 28 - "server-workspace-context.ts"
Cohesion: 0.15
Nodes (18): AdminLayout(), redirectToLogin(), AuthRefreshGate(), AuthRefreshGateProps, loginUrl(), logoutToLogin(), HotelsLayout(), redirectToLogin() (+10 more)

### Community 29 - "readServerSessionTokens"
Cohesion: 0.15
Nodes (18): POST(), serverErrorResponse(), tokenTail(), unauthorizedResponse(), refreshServerSessionAccessToken(), ServerAuthRefreshResult, HttpMethod, HttpQuery (+10 more)

### Community 30 - "page.tsx"
Cohesion: 0.13
Nodes (18): AnimatedDashboardNumber(), AnimatedDashboardNumberProps, formatAnimatedValue(), parseNumberValue(), Dashboard, fallbackStatusLabel(), formatTime(), formatVnd() (+10 more)

### Community 31 - "internal-api-client.ts"
Cohesion: 0.12
Nodes (21): containsTenantId(), FormState, hotelToForm(), OwnerHotelDetailClient(), OwnerHotelDetailClientProps, parseBrandSettings(), ApiEnvelope, isRecord() (+13 more)

### Community 32 - "guest-session-bootstrap.tsx"
Cohesion: 0.18
Nodes (17): GuestSessionBootstrap(), GuestSessionState, useGuestSession(), normalizeGuestLocale(), decideGuestSessionValidationError(), isCurrentGuestSessionValidation(), isProtectedGuestRoute(), PROTECTED_GUEST_ROUTES (+9 more)

### Community 33 - "rbac-service.ts"
Cohesion: 0.12
Nodes (23): createRbacService(), CreateRoleBody, DeleteRoleResult, ListPermissionModulePermissionsOptions, ListPermissionsOptions, RbacServiceOptions, UpdateRoleBody, PermissionsListQuery (+15 more)

### Community 34 - "page.tsx"
Cohesion: 0.11
Nodes (15): guestIntlLocale(), GuestLocale, guestLocaleOptions, guestLocales, Dict, en, guestDictionaries, hi (+7 more)

### Community 35 - "hotel-ops-contract.ts"
Cohesion: 0.14
Nodes (16): GuestRequestType, ownerRoomsRepository, StaffRoomsListInput, staffRoomsRepository, ownerRoomsResource, staffRoomsResource, HotelOpsPage, hotelRequestPriorities (+8 more)

### Community 36 - "workstation-store.ts"
Cohesion: 0.15
Nodes (17): GET(), Context, GET(), headers, parseRecognition(), POST(), acceptsRecognitionBodyLength(), bearerToken() (+9 more)

### Community 37 - "RbacService"
Cohesion: 0.14
Nodes (6): RbacService, toRolePermissionPayload(), RbacPermission, RbacPermissionModulePermissionsPage, RbacPermissionModuleSummary, RbacRole

### Community 38 - "staff-directory-resource.ts"
Cohesion: 0.11
Nodes (11): AssignStaffRoleInput, RepositoryRequestOptions, StaffDirectoryListInput, staffDirectoryRepository, TemporaryPasswordResult, UpdateStaffAssignmentInput, UpdateStaffUserInput, INVALIDATE_DIRECTORY (+3 more)

### Community 39 - "workspace-context.ts"
Cohesion: 0.18
Nodes (17): AdminUsersPage(), first(), Props, first(), OwnerStaffPage(), Props, StaffEntryPage(), StaffManagementClient() (+9 more)

### Community 40 - "staff-rooms-client.tsx"
Cohesion: 0.15
Nodes (21): activeStayProgress(), emptyReservation(), FlowMode, formatDateTime(), getGuestQrUrl(), getRoomNumber(), getRoomQrValue(), getRoomStatus() (+13 more)

### Community 41 - "owner-stay-room-grid-client.tsx"
Cohesion: 0.16
Nodes (20): defaultCheckOutValue(), formatRoomDate(), formatRoomPrice(), getBusinessErrorMessage(), getNestedMessage(), getRoomAvailability(), getRoomNumber(), getRoomStatus() (+12 more)

### Community 42 - "auth.ts"
Cohesion: 0.12
Nodes (14): AuthServiceError, createAuthService(), authService, applySessionTokenUpdate(), AuthorizedUser, credentialsSchema, jwt(), returnJwtToken() (+6 more)

### Community 43 - "auth.ts"
Cohesion: 0.12
Nodes (14): AdminHotelsPage(), listTenantOwnersForSelector(), OwnerBillingPage(), PageProps, OwnerHotelRoomsPage(), PageProps, OwnerHotelServicesPage(), PageProps (+6 more)

### Community 44 - "workspace-shell.tsx"
Cohesion: 0.21
Nodes (14): AdminShell(), AdminShellProps, VsDashboardSidebar(), VsDashboardSidebarProps, OwnerShell(), OwnerShellProps, useWorkspaceProfile(), WorkspaceShell() (+6 more)

### Community 45 - "page.tsx"
Cohesion: 0.13
Nodes (17): InvoiceActions(), Props, buildWordHtml(), downloadWordInvoice(), getInvoiceFileName(), InvoicePrintButton(), InvoicePrintButtonProps, folioStatusLabels (+9 more)

### Community 46 - "hotels-admin-client.tsx"
Cohesion: 0.13
Nodes (16): buildTenantOptions(), createHotelFormSchema, emptyHotelForm, formatDate(), FormMode, HotelFormState, HotelsAdminClient(), HotelsAdminClientProps (+8 more)

### Community 47 - "dependencies"
Cohesion: 0.11
Nodes (19): @auth/core, motion, dependencies, @auth/core, motion, qrcode.react, react, react-dom (+11 more)

### Community 48 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, openapi-typescript, devDependencies, eslint, eslint-config-next, openapi-typescript, tailwindcss (+11 more)

### Community 49 - "authorize-hotel-workstation.ts"
Cohesion: 0.18
Nodes (12): Context, DELETE(), GET(), POST(), Context, POST(), Context, DELETE() (+4 more)

### Community 50 - "OwnerServiceCatalogClient"
Cohesion: 0.14
Nodes (19): categoryToForm(), emptyItemForm(), emptyTranslations(), formatPriceInput(), formatQuantityRule(), formatVnd(), getItemCategory(), getItemCurrency() (+11 more)

### Community 51 - "http-client.ts"
Cohesion: 0.17
Nodes (17): clampBackendApiLimit(), clampBackendApiLimitValue(), appendQuery(), createTimeoutController(), extractApiResponseMessage(), HttpClientOptions, HttpRequestOptions, isPublicRequest() (+9 more)

### Community 52 - "2026-07-14 - Guest Request Contract Sync"
Cohesion: 0.11
Nodes (18): 2026-07-14 - Batch C Authenticated Request Realtime, 2026-07-14 - Guest Request Contract Sync, 2026-07-14 - GuestOS Reliable Request Recovery Batch B, [complete] 2026-07-21 - Mission: recover-e4711-ui-auth-rbac, [complete] 2026-07-27 - Mission: account-and-guest-entrypoint-ui-fixes, [complete] 2026-07-27 - Mission: per-hotel-google-sheets, [complete] 2026-07-27 - Mission: public-launch-and-frontdesk-workflow, Remaining Blockers / Risks (+10 more)

### Community 53 - "cccd-preview.ts"
Cohesion: 0.18
Nodes (11): PageProps, BiometricOwnerTabs(), CccdPreview(), Props, WorkstationTestScanPanel(), buildCccdPreviewModel(), calculateAge(), CccdPreviewModel (+3 more)

### Community 54 - "CODEX-STITCH-SYNC.md"
Cohesion: 0.12
Nodes (16): Before modifying existing implemented screens, Command Understanding, Data Rules, Error Handling, Finalization, If the screen does not exist, If the screen exists clearly, If the user command is ambiguous (+8 more)

### Community 55 - "VietSage Auth/HTTP Stabilization Phase Plan"
Cohesion: 0.12
Nodes (16): Codex Prompt Template per Phase, Current State Summary, Final Definition of Done, Global Rules for Every Phase, Phase 0 — Repo Path + Documentation Hygiene, Phase 1 — Token Privacy: Stop Exposing Tokens in Browser Session, Phase 2 — Server Auth Coordinator + Pure `http-server.ts`, Phase 3 — Pure Browser `http-client.ts` + Remove Duplicate Refresh Owner (+8 more)

### Community 56 - "redirect-isolation-core.ts"
Cohesion: 0.21
Nodes (14): GET(), firstForwardedValue(), isLocalHost(), parseOrigin(), PostLoginRedirectInput, PostLoginRedirectUrlInput, resolveForwardedOrigin(), resolvePostLoginRedirect() (+6 more)

### Community 58 - "page.tsx"
Cohesion: 0.13
Nodes (8): getValidationErrors(), heroTypingPhrases, initialFormValues, inputClass(), RegisterFormErrors, RegisterFormValues, RegisterPage(), registerSchema

### Community 59 - "guest-stagger.tsx"
Cohesion: 0.19
Nodes (12): GuestHomeHero(), GuestHomeHeroProps, GuestHomeHighlight, GuestHomeHighlights(), GuestStagger(), GuestStaggerItem(), GuestStaggerProps, GuestServiceCard() (+4 more)

### Community 60 - "tenant-owners-client.tsx"
Cohesion: 0.15
Nodes (13): createOwnerSchema, editOwnerSchema, emptyForm, formatDate(), FormMode, OwnerFormState, ownerStatuses, requestJson() (+5 more)

### Community 61 - "owner-hotels-client.tsx"
Cohesion: 0.20
Nodes (10): formatDate(), getErrorMessage(), OwnerHotelsClient(), statusLabel(), statusTone(), useOwnerHotelsQuery(), OwnerHotelsListInput, ownerHotelsRepository (+2 more)

### Community 62 - "hasAppRole"
Cohesion: 0.23
Nodes (11): APP_ROLE_PRIORITY, getPrimaryAppRole(), hasAppRole(), isRoleMatch(), normalizeRole(), AccountAction, GUEST_ACTION, resolveLandingAction() (+3 more)

### Community 63 - "check-in-workspace.tsx"
Cohesion: 0.19
Nodes (11): CccdCheckInCapture, CccdCheckInPanel(), Props, CheckInWorkspace(), WorkstationConnectionPanel(), useWorkstationScan(), WorkstationScanState, CheckInOccupantField (+3 more)

### Community 64 - "http-server.ts"
Cohesion: 0.21
Nodes (13): changePasswordSchema, noStore(), POST(), appendQuery(), createTimeoutController(), httpServer, HttpServerRequestConfig, isPublicRequest() (+5 more)

### Community 65 - "intake-contract.ts"
Cohesion: 0.18
Nodes (11): Context, POST(), createIntakeSessionSchema, IntakePayload, intakePayloadSchema, IntakePayloadV2, intakePayloadV2Schema, IntakeSessionIssued (+3 more)

### Community 66 - "permission-workbench.tsx"
Cohesion: 0.20
Nodes (12): filterPermissions(), METHOD_FILTERS, MethodFilter, methodToneClassMap, PermissionWorkbench(), PermissionWorkbenchProps, sortPermissions(), toPermissionKey() (+4 more)

### Community 67 - "qr-export-client.tsx"
Cohesion: 0.25
Nodes (10): PageProps, getClientOriginSnapshot(), getServerOriginSnapshot(), OwnerRoomsQrExportClient(), Props, subscribeClientOriginChange(), useClientOrigin(), getGuestQrUrl() (+2 more)

### Community 68 - "change-password-dialog.tsx"
Cohesion: 0.22
Nodes (11): ChangePasswordDialog(), emptyForm, hiddenPasswords, PasswordField, passwordFields, useChangePassword(), authRepository, ChangePasswordInput (+3 more)

### Community 69 - "rbac.ts"
Cohesion: 0.24
Nodes (14): canAccessPath(), canAccessPathByRoles(), getDefaultPathForRole(), getDefaultPathForRoles(), isKnownRedirectPath(), isUserRole(), matchesPrefix(), normalizeInternalPath() (+6 more)

### Community 70 - "Backend Proposal: GuestOS Multilingual API Support for `/g/**`"
Cohesion: 0.14
Nodes (13): 1. Locale Negotiation, 2. Translated Service Catalog Responses, 3. Request Snapshot Localization, 4. QR Session Language Persistence, 5. Error and Validation Messages, 6. Realtime Event Localization, Acceptance Criteria, Backend Proposal: GuestOS Multilingual API Support for `/g/**` (+5 more)

### Community 71 - "PROJECT RULES"
Cohesion: 0.14
Nodes (13): API Logging Rule (Mandatory), API Transport Rule (Mandatory), Auth & Routing Rules, Change Tracking Rule (Mandatory), Core Rules, Data Fetching, Execution Contract (Mandatory), Git Commit Rule (Mandatory) (+5 more)

### Community 72 - "proxy.ts"
Cohesion: 0.16
Nodes (8): config, authRoutes, clearNextAuthCookies(), config, isNextAuthCookie(), nextAuthCookiePrefixes, protectedPrefixes, proxy

### Community 73 - "page.tsx"
Cohesion: 0.23
Nodes (13): RolesLiveFilterRole, AdminRolesPage(), isRecord(), mapRole(), moduleFromPath(), normalizeSidebarItems(), RolePermissionView, RolesPageProps (+5 more)

### Community 74 - "page.tsx"
Cohesion: 0.18
Nodes (11): getFirst(), getPositiveInt(), normalizeDayFilter(), OwnerHotelRequestsPage(), PageProps, EMPTY_STAFF_DASHBOARD_DATA, loadStaffDashboardData(), LoadStaffDashboardDataInput (+3 more)

### Community 75 - "OwnerRoomsClient"
Cohesion: 0.23
Nodes (14): canActivateQr(), compareRooms(), formatPriceInput(), formatVnd(), getActiveGuestDeviceCount(), getQrMeta(), getResolvedMaxActiveGuestDevices(), getRoomStatusMeta() (+6 more)

### Community 76 - "backend-api-config.ts"
Cohesion: 0.25
Nodes (11): BackendApiEnvironment, BackendApiLimitQueryValue, BackendApiLimitValue, getBrowserBackendApiBaseUrl(), getConfiguredBackendApiBaseUrl(), resolveBrowserReachableBackendUrl(), resolveConfiguredBackendApiBaseUrl(), createRequestRealtimeSocket() (+3 more)

### Community 77 - "staff-management-client.tsx"
Cohesion: 0.20
Nodes (10): OneTimePasswordDialog(), Props, FormFieldErrors, Props, StaffHotelOption, normalizeQuery(), StaffDirectoryQueryParams, useStaffDirectoryQuery() (+2 more)

### Community 78 - "VietSage Frontend Architecture"
Cohesion: 0.15
Nodes (12): 10. Frontend and Backend Boundary, 11. Rules Summary, 1. Purpose, 2. Docs Index, 3. Core Principles, 4. Standard App Structure, 5. Layer Responsibilities, 6. Runtime Boundary Summary (+4 more)

### Community 79 - "DESIGN.md"
Cohesion: 0.15
Nodes (12): Admin Data Visualization, Brand & Style, Colors, Components, Elevation & Depth, Input Fields, Layout & Spacing, Premium Service Cards (+4 more)

### Community 80 - "route.ts"
Cohesion: 0.31
Nodes (12): buildLoginRedirect(), GET(), getCallbackUrl(), isExpectedRefreshFailure(), POST(), refreshFailureResponse(), serverErrorResponse(), unauthorizedResponse() (+4 more)

### Community 81 - "mock.ts"
Cohesion: 0.17
Nodes (10): statusClassMap, VsStatusChipProps, adminRecentRequests, guestServices, guestTrackingHistory, RequestPriority, RequestStatus, ServiceCategory (+2 more)

### Community 82 - "use-guest-request-realtime.ts"
Cohesion: 0.18
Nodes (5): createGuestConnectionManager(), GuestSocket, RealtimeError, OwnerRealtimeHandlers, Handlers

### Community 83 - "page.tsx"
Cohesion: 0.24
Nodes (10): PermissionsWarningsAlert(), PermissionsWarningsAlertProps, RolePermissionsBrowserPermission, RolePermissionsBrowserRole, AdminPermissionsPage(), extractParam(), isRecord(), mapRole() (+2 more)

### Community 84 - "service-catalog-client.tsx"
Cohesion: 0.18
Nodes (9): CategoryFormState, emptyCategoryForm, ItemFormState, ServiceCatalogClient(), ServiceCatalogClientProps, HotelServiceStatus, hotelServiceStatuses, serviceStatusLabelMap (+1 more)

### Community 85 - "page.tsx"
Cohesion: 0.33
Nodes (8): assertCanAccessOwner(), ownerAccessMessage(), redirectOwnerToLogin(), requireOwnerServerTokens(), getOwnerVisibleHotel(), OwnerHotelPage(), OwnerHotelPageProps, OwnerLayout()

### Community 86 - "data-table.tsx"
Cohesion: 0.24
Nodes (9): DataTable(), DataTableColumn, DataTablePagination, DataTableProps, DataTableSort, DataTableSortDirection, joinClasses(), pageBounds() (+1 more)

### Community 87 - "v1.ts"
Cohesion: 0.24
Nodes (9): BackendApiPath, isPublicApiPath(), normalizePathname(), PUBLIC_API_PATH_ALLOWLIST_SET, components, $defs, operations, paths (+1 more)

### Community 88 - "owner-connection-manager.ts"
Cohesion: 0.20
Nodes (4): createOwnerConnectionManager(), Entry, ManagedSocket, RealtimeError

### Community 89 - "Frontend Runtime and UI Guide"
Cohesion: 0.20
Nodes (9): Component Ownership, Frontend Runtime and UI Guide, I18n, Loading, Error, and Empty States, Purpose, Realtime, Server and Client Components, State Ownership (+1 more)

### Community 90 - "auth-refresh-smoke.mjs"
Cohesion: 0.42
Nodes (9): assert(), checks, createRefreshCoordinator(), createServer(), listen(), requestInternalApiLike(), runFailureScenario(), runSuccessScenario() (+1 more)

### Community 91 - "layout.tsx"
Cohesion: 0.24
Nodes (6): AppToaster(), ReactQueryProvider(), ReactQueryProviderProps, fraunces, manrope, metadata

### Community 92 - "workstation-repository.ts"
Cohesion: 0.22
Nodes (7): ScanRequest, ScanResult, WorkstationPairingStatus, workstationRepository, ScanInput, Scope, workstationResource

### Community 93 - "Frontend API Integration Guide"
Cohesion: 0.22
Nodes (8): Anti-patterns, Auth and Session Rules, Contract Rules, Error Contract Rules, Frontend API Integration Guide, HTTP Rules, Purpose, Standard API Flow

### Community 94 - "Frontend Feature Guide"
Cohesion: 0.22
Nodes (8): Adding a Feature, Anti-patterns, Dependency Rules, Extending a Workspace Dashboard, Folder Responsibilities, Frontend Feature Guide, Purpose, Standard Feature Shape

### Community 95 - "staff-management-service.ts"
Cohesion: 0.39
Nodes (7): TemporaryPasswordResult, CreateHotelStaffUserInput, HotelStaffAssignment, HotelStaffAssignmentsPage, HotelStaffUser, HotelStaffUsersPage, ManagedHotelRole

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
Cohesion: 0.38
Nodes (5): useOwnerGoogleSheetSync(), googleSheetConfigRepository, adminGoogleSheetConfigResource, HotelScope, ownerGoogleSheetSyncResource

### Community 105 - "service-catalog-error.ts"
Cohesion: 0.43
Nodes (5): getServiceCatalogErrorMessage(), getServiceCatalogSyncNotice(), isRecord(), nestedDetail(), SyncNoticeInput

### Community 106 - "password-security.ts"
Cohesion: 0.53
Nodes (4): canResetFrontdeskPassword(), PasswordSecurityFields, resetResponseHeaders(), validatePasswordChange()

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
Cohesion: 0.60
Nodes (3): hasCookie(), resolveSessionCookiePolicy(), SessionCookiePolicy

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
Cohesion: 0.50
Nodes (4): [complete] 2026-07-27 - Mission: tenant-room-action-icons, Remaining Blockers / Risks, Verification Result, What Changed

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
Cohesion: 0.67
Nodes (3): [complete] 2026-07-28 - Mission: guest-qr-device-recovery, Verification Result, What Changed

## Knowledge Gaps
- **974 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+969 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HttpError` connect `HttpError` to `executeHotelOpsBackendRequest`, `guest-os-contract.ts`, `httpErrorResponse`, `request-queue-client.tsx`, `auth-service.ts`, `room-messages-client.tsx`, `page.tsx`, `roles-live-filter.tsx`, `role-permissions-browser.tsx`, `page.tsx`, `owner-service-catalog-client.tsx`, `page.tsx`, `owner-rooms-client.tsx`, `internal-api-client.ts`, `guest-session-bootstrap.tsx`, `owner-stay-room-grid-client.tsx`, `auth.ts`, `hotels-admin-client.tsx`, `http-client.ts`, `tenant-owners-client.tsx`, `http-server.ts`, `page.tsx`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `unwrapApiEnvelope()` connect `unwrapApiEnvelope` to `rbac-service.ts`, `guest-os-contract.ts`, `hotel-ops-contract.ts`, `RbacService`, `staff-billing-workspace-client.tsx`, `page.tsx`, `auth-service.ts`, `room-messages-client.tsx`, `admin-service.ts`, `staff-management-service.ts`, `internal-api-client.ts`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `VsIcon()` connect `vs-icon.tsx` to `request-queue-client.tsx`, `page.tsx`, `staff-billing-workspace-client.tsx`, `loadServerWorkspaceContext`, `room-messages-client.tsx`, `page.tsx`, `roles-live-filter.tsx`, `role-permissions-browser.tsx`, `page.tsx`, `workspace-registry.ts`, `page.tsx`, `page.tsx`, `owner-rooms-client.tsx`, `page.tsx`, `page.tsx`, `workspace-context.ts`, `staff-rooms-client.tsx`, `owner-stay-room-grid-client.tsx`, `workspace-shell.tsx`, `hotels-admin-client.tsx`, `page.tsx`, `guest-stagger.tsx`, `tenant-owners-client.tsx`, `owner-hotels-client.tsx`, `permission-workbench.tsx`, `qr-export-client.tsx`, `change-password-dialog.tsx`, `page.tsx`, `staff-management-client.tsx`, `page.tsx`, `page.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _974 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.06061742282214723 - nodes in this community are weakly interconnected._
- **Should `executeHotelOpsBackendRequest` be split into smaller, more focused modules?**
  _Cohesion score 0.062241845890898734 - nodes in this community are weakly interconnected._
- **Should `guest-os-contract.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05446907141822396 - nodes in this community are weakly interconnected._