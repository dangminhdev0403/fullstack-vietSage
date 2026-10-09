# VietSage Domain Map

## Purpose

This document maps the current modular-monolith runtime and its ownership boundaries. One Core API
and one PostgreSQL database remain the deployed architecture; this is not an extraction roadmap.

## Bounded contexts

| Context | Current code | Data ownership | Public API/port | Extraction readiness |
| --- | --- | --- | --- | --- |
| Identity & Access | `src/modules/identity` (`api`, `application`, `domain`, `infrastructure`, `tests`), `src/shared/guard`, `src/shared/decorators` | `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, tenant-user access relations where identity-owned | `IdentityModule`; `identity-public.ts` exports auth/session/access-control services and the shared `AuthenticatedUser` contract | Consolidated in core API; do not reintroduce legacy `auth`, `rbac`, or `hotel-users` module folders. |
| Organization / Tenancy | `src/modules/organization` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP routes still use `/tenant-owners` for API compatibility | `Tenant`, `TenantUser`, tenant audit metadata | `OrganizationModule`; tenant membership and ownership queries | Consolidated in core API; do not reintroduce the legacy `tenant-owners` module folder. |
| Property | `src/modules/property` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP routes still use `/hotels` for API compatibility | `Hotel`, `Room`, `RoomQRCode`, `GuestStay`, `HotelServiceCategory`, `HotelServiceItem`, translations | `PropertyModule`; `property-public.ts` exports `HotelAccessService` as the current cross-context access port; future `PropertyAccessPort`, `StayResolverPort` | Consolidated in core API; do not reintroduce the legacy `hotels` module folder. |
| Guest Operations | `src/modules/guest-operations` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP routes still use `/guest` and `/hotels/:hotelId/requests*` for API compatibility | `GuestSession`, guest-facing/staff-facing `GuestRequest`, `GuestRequestEvent` | `GuestOperationsModule`; `guest-operations-public.ts` exports `GuestOsService` and `GuestSessionGuard`; `GuestRequestEventPublisher` for realtime fan-out | Consolidated in core API; do not reintroduce the legacy `guest-os` module folder. |
| Billing | `src/modules/billing` (`api`, `application`, `domain`, `infrastructure`, `tests`) | `Folio`, `FolioItem`, `Invoice`, `Payment`, `PaymentTransaction` | `BillingModule`; billing APIs and invoice/payment workflows | Consolidated in core API; repository is internal to Billing. |
| Emergency | `src/modules/emergency` (`api`, `application`, `domain`, `infrastructure`, `tests`); HTTP route still uses `/emergency/guest/calls` for API compatibility | Emergency location/call/incident/notification models | `EmergencyModule`; incident/call workflows consume `GuestEmergencyContextService` from `guest-operations-public.ts` | Consolidated in core API; repository is internal to Emergency and does not query guest-session persistence directly. |
| Notifications | `src/modules/notifications` (`api`, `application`, `tests`); canonical Telegram webhook route is `/integrations/telegram/webhook`; staff route config still uses `/hotels/:hotelId/notification-routes*` for API compatibility | `NotificationRoute`, `GuestRequestNotification`, provider callback state | `NotificationsModule`; `notifications-public.ts` exports the current Telegram delivery adapter; webhook secret is validated via `X-Telegram-Bot-Api-Secret-Token`, not URL path | Consolidated in core API; Telegram is a provider adapter, not the context name. |
| Biometric Workstations | `src/modules/biometric-workstations` | workstation pairing/access state | `BiometricWorkstationsModule`; Property access through its public port | Core API module. |
| Channel Manager | `src/modules/channel-manager` | Channex mappings, sync logs, channel state | `ChannelManagerModule`; provider API remains internal | Core API module; booking/cancellation and ARI ordering stay together. |
| KBTT | `src/modules/kbtt` | declaration/provider connection state | `KbttModule` HTTP contracts | Core API module. |
| Local Partners | `src/modules/local-partners` | partner profiles and operations | `local-partners-public.ts` | Core API module. |
| LocalMate | `src/modules/localmate` | LocalMate profiles, knowledge, Telegram pairing | `localmate-public.ts` | Core API module; repository stays private. |
| LocalMate Payments | `src/modules/localmate-payments` | checkout/payment/provider-event state | `LocalMatePaymentsService` via `localmate-payments-public.ts` | Core API module; Stripe infrastructure stays private. |
| Marketplace | `src/modules/marketplace` | catalog, orders, conversations, settlement and notification workflow | `marketplace-public.ts` | Core API module; owns Marketplace–Telegram business adapters. |
| Platform Billing | `src/modules/platform-billing` | platform revenue/reporting | `PlatformBillingModule`; Property access via public port | Core API module. |
| Request Realtime | `src/modules/request-realtime` | realtime ticket capability | `RequestRealtimeTicketService` via `request-realtime-public.ts` | Core API module; gateway internals stay private. |
| Platform/Common | `src/common`, `src/prisma`, `src/modules/codes`, `src/modules/health` | Code sequences, runtime config/logging/health, Prisma wrapper | Shared infrastructure utilities | Do not extract as a business service. |

## Allowed dependencies

```txt
Identity <- Global Guards / Controllers
Property <- Billing, Guest Operations, Emergency through public access/resolver ports
Notifications <- Guest Operations through notification intent/delivery ports
Marketplace <- LocalMate, LocalMate Payments, Notifications, Request Realtime through public ports
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

## Executable boundary gates

```bash
cd services/auth-service
node scripts/check-service-boundaries.mjs
npm test -- --runInBand src/modules/tests/final-boundary-release.spec.ts
```

Current source and executable contracts take precedence when prose becomes stale. Repositories stay
private; cross-context runtime collaboration uses Nest DI or existing in-process events. No broker,
service split, or database split is implied.
