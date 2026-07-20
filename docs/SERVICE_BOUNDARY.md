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
| Public module API | Explicit module exports and `index.ts`/public interfaces where needed | Other contexts import only public services/ports. |
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
| Identity & Access | `AuthorizationService`, `AuthService`, route-permission helpers, `JwtAuthGuard` via `identity-public.ts` | Global guards/strategies/controllers | Keeps security consumers off Identity domain/infrastructure paths. |
| Codes | `CodesService` via `codes-public.ts` | Organization, Property, Billing | Generates entity codes without exposing the repository. |

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
`<context>-public.ts`; Nest composition may import `<context>.module.ts`.

Frontend route pages should delegate multi-endpoint orchestration to a feature-owned loader or
query. For example, the Staff workspace selects widgets and hotel scope, while Hotel Operations
owns loading request and service dashboard data.
