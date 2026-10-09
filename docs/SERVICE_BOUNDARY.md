# VietSage Service and Module Boundary

## Current boundary model

The current backend is one deployed NestJS core API located at `services/auth-service`. The folder name is historical; do not infer that the service owns only authentication.

Inside this core API, boundaries are enforced at the **module/context** level first. Service extraction is a future option, not the present runtime.

## Boundary layers

| Boundary | Present implementation | Rule |
| --- | --- | --- |
| HTTP/API | Controllers in `services/auth-service/src/modules/**` | OpenAPI export is the contract truth. |
| Application | Module services | Own workflow, authorization/resource checks, and transactions. |
| Persistence | Repositories and Prisma service | Repositories are internal to their owning module. |
| Public module API | Explicit module exports and `*-public.ts` interfaces where needed | Other contexts import only public services/ports. |
| Event/notification | In-process services/adapters today | Add versioned event envelope before async extraction. |

## Public boundary rules

- A module must not export repositories just to let another module query its tables.
- A module may export a public service/port that hides persistence details.
- Cross-module imports from `repositories/`, `schemas/` implementation internals, or deep service helpers require refactor approval.
- Controllers from one module must not call controllers from another module.
- Shared guards/decorators should depend on shared security contracts and public Identity services only.

## Current approved public ports/services

| Owner context | Public export | Consumers | Reason |
| --- | --- | --- | --- |
| Property / Hotels | `HotelAccessService` | Billing and other resource-scoped modules | Validates actor access to hotel/tenant without exposing hotel repositories. |
| Identity & Access | `AuthorizationService`, `AuthService`, `HotelUserDirectoryService`, route-permission helpers, `JwtAuthGuard` via `identity-public.ts` | Global guards/strategies/controllers and Property staff assignment workflows | Keeps consumers off Identity domain/infrastructure paths while allowing tenant-scoped staff validation. |
| Codes | `CodesService` via `codes-public.ts` | Organization, Property, Billing | Generates entity codes without exposing the repository. |
| Guest Operations | `GuestSessionGuard`, `GuestOsService` via `guest-operations-public.ts` | Emergency, Marketplace | Resolves guest/session capability without persistence leakage. |
| LocalMate | `LocalMateService`, Telegram pairing service, geography helpers via `localmate-public.ts` | Marketplace, app composition | Keeps profile persistence internal. |
| LocalMate Payments | `LocalMatePaymentsService` via `localmate-payments-public.ts` | Marketplace | Exposes payment workflow only; Stripe infrastructure remains private. |
| Marketplace | order/conversation services and Telegram marketplace adapter via `marketplace-public.ts` | App composition | Marketplace owns order, conversation, and guide-notification workflows. |
| Notifications | Telegram delivery transport and composition tokens via `notifications-public.ts` | App composition, Marketplace | Provider transport stays separate from Marketplace behavior. |
| Request Realtime | `RequestRealtimeTicketService` via `request-realtime-public.ts` | Marketplace | Issues bounded realtime tickets without exposing internals. |

## Repository export policy

Repositories must remain internal. If a consumer needs a query, add a public application query/port to the owner context instead of exporting the repository.

For example:

```txt
BillingService -> HotelAccessService        # allowed
BillingService -> HotelCoreRepository       # forbidden
BillingService -> Prisma hotel query direct # avoid unless it owns that data
```

## Future service extraction

Extraction requires stable ownership and operational need. See `SERVICE_EVOLUTION.md`.

## Boundary verification

Run the executable boundary check before merging a module/service refactor:

```bash
cd services/auth-service
node scripts/check-service-boundaries.mjs
```

The check scans production source files and fails when one context imports another context's
private path or when a Nest module exports a repository. Cross-context consumers must use
`<context>-public.ts`; Nest composition may import `<context>.module.ts`. The checker also rejects
cycles in production Nest module imports. The final release guard discovers every current module,
rejects repository exports, private cross-context imports, and mutable static dispatchers.

Telegram transport is composed once in `AppModule` through Nest tokens. Marketplace owns Telegram
order/conversation adapters; Notifications owns transport and delivery. Cross-module collaboration
must use Nest DI or an existing in-process event port, never mutable process-global setters.

```bash
cd services/auth-service
npm test -- --runInBand src/modules/tests/final-boundary-release.spec.ts
```

Frontend route pages should delegate multi-endpoint orchestration to a feature-owned loader or
query. For example, the Staff workspace selects widgets and hotel scope, while Hotel Operations
owns loading request and service dashboard data.

Staff assignment ownership is split deliberately: Identity owns users, active roles, and tenant
membership; Property owns `HotelStaffAssignment`. Property consumes only the public
`HotelUserDirectoryService` to validate an assignable tenant staff user and never imports the
Identity repository.
