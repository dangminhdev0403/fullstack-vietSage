# VietSage Domain Map

## Purpose

This document maps the current modular-monolith runtime to the bounded contexts proposed by the architecture refactor. It is an ownership guide before moving code or extracting services.

## Bounded contexts

| Context | Current code | Data ownership | Public API/port | Extraction readiness |
| --- | --- | --- | --- | --- |
| Identity & Access | `src/modules/identity` (`api`, `application`, `domain`, `infrastructure`, `tests`), `src/shared/guard`, `src/shared/decorators` | `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, tenant-user access relations where identity-owned | `IdentityModule`; `identity-public.ts` exports auth/session/access-control services and the shared `AuthenticatedUser` contract | Consolidated in core API; do not reintroduce legacy `auth`, `rbac`, or `hotel-users` module folders. |
| Organization / Tenancy | `src/modules/tenant-owners`, tenant owner APIs | `Tenant`, `TenantUser`, tenant audit metadata | Tenant membership and ownership queries | Keep in core API; closely coupled to Identity. |
| Property | `src/modules/property` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP routes still use `/hotels` for API compatibility | `Hotel`, `Room`, `RoomQRCode`, `GuestStay`, `HotelServiceCategory`, `HotelServiceItem`, translations | `PropertyModule`; `property-public.ts` exports `HotelAccessService` as the current cross-context access port; future `PropertyAccessPort`, `StayResolverPort` | Consolidated in core API; do not reintroduce the legacy `hotels` module folder. Guest request pieces remain here only until Guest Operations extraction slice. |
| Guest Operations | `src/modules/guest-operations` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP routes still use `/guest`; staff request workflows currently parked in `src/modules/property/application/hotel-requests.service.ts` | `GuestSession`, guest-facing `GuestRequest`, `GuestRequestEvent` | `GuestOperationsModule`; `guest-operations-public.ts` exports `GuestOsService` and `GuestSessionGuard`; `GuestRequestEventPublisher` for realtime fan-out | Consolidated in core API; do not reintroduce the legacy `guest-os` module folder. Staff request workflow extraction remains a later slice. |
| Billing | `src/modules/billing` | `Folio`, `FolioItem`, `Invoice`, `Payment`, `PaymentTransaction` | Billing APIs and invoice/payment workflows | Candidate after payment provider integration and financial boundaries harden. |
| Emergency | `src/modules/emergency` | Emergency location/call/incident/notification models | Emergency incident/call workflows | Candidate only if reliability/isolation needs appear. |
| Notifications | `src/modules/telegram`, notification route pieces currently parked in Property until the Notifications extraction slice | `NotificationRoute`, `GuestRequestNotification`, provider callback state | Telegram provider adapter plus shared guest request event publisher | Good first extraction candidate if retries/provider scaling become real. |
| Platform/Common | `src/common`, `src/prisma`, `src/modules/codes`, `src/modules/health` | Code sequences, runtime config/logging/health, Prisma wrapper | Shared infrastructure utilities | Do not extract as a business service. |

## Allowed dependencies

```txt
Identity <- Global Guards / Controllers
Property <- Billing, Guest Operations, Emergency through public access/resolver ports
Notifications <- Guest Operations / Emergency through notification intent port
Platform/Common <- all modules for infrastructure utilities
```

Avoid dependencies in the opposite direction. If a context needs data from another context, ask the owner through a public service/port.

## Transaction boundaries

Keep these inside the core API until data ownership is clearer:

- Guest request creation + first request event.
- Guest request status update + request event append.
- Stay check-in/check-out + QR/session/folio side effects.
- Billing post/invoice/payment state changes.
- Emergency incident creation + notification intent.

If a boundary crosses contexts, prefer an in-process domain event or public application service first; do not add a broker by default.

## Refactor sequence

1. Document context ownership and update docs.
2. Stop exporting repositories from modules.
3. Create public ports for existing cross-context uses.
4. Move shared contracts like `AuthenticatedUser` out of deep auth module paths.
5. Split module folders only after tests cover existing behavior.
6. Export OpenAPI and review contract diff after HTTP changes.
