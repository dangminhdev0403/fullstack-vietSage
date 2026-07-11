# VietSage Domain Map

## Purpose

This document maps the current modular-monolith runtime to the bounded contexts proposed by the architecture refactor. It is an ownership guide before moving code or extracting services.

## Bounded contexts

| Context | Current code | Data ownership | Public API/port | Extraction readiness |
| --- | --- | --- | --- | --- |
| Identity & Access | `src/modules/auth`, `src/modules/rbac`, `src/modules/hotel-users`, `src/shared/guard`, `src/shared/decorators` | `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, tenant-user access relations where identity-owned | Auth/session/access-control services; shared `AuthenticatedUser` contract | High priority to clarify, but keep in core API until contracts stabilize. |
| Organization / Tenancy | `src/modules/tenant-owners`, tenant owner APIs | `Tenant`, `TenantUser`, tenant audit metadata | Tenant membership and ownership queries | Keep in core API; closely coupled to Identity. |
| Property | `src/modules/hotels` core, rooms, stays, QR, service catalog | `Hotel`, `Room`, `RoomQRCode`, `GuestStay`, `HotelServiceCategory`, `HotelServiceItem`, translations | `HotelAccessService` now; future `PropertyAccessPort`, `StayResolverPort` | Not ready for extraction; many workflows still share transactions. |
| Guest Operations | `src/modules/guest-os`, request workflow parts in `hotels` | `GuestSession`, `GuestRequest`, `GuestRequestEvent` | Guest session/request application services; `GuestRequestEventPublisher` for realtime fan-out | Candidate after event contract and request lifecycle stabilize. |
| Billing | `src/modules/billing` | `Folio`, `FolioItem`, `Invoice`, `Payment`, `PaymentTransaction` | Billing APIs and invoice/payment workflows | Candidate after payment provider integration and financial boundaries harden. |
| Emergency | `src/modules/emergency` | Emergency location/call/incident/notification models | Emergency incident/call workflows | Candidate only if reliability/isolation needs appear. |
| Notifications | `src/modules/telegram`, notification routes under hotels | `NotificationRoute`, `GuestRequestNotification`, provider callback state | Telegram provider adapter plus shared guest request event publisher | Good first extraction candidate if retries/provider scaling become real. |
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
