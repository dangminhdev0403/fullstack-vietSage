# VietSage Backend Module Guide

## Purpose

Use this guide when adding or refactoring a module inside the current core API (`services/auth-service`). The architecture target is modular-monolith first, not premature microservices.

## Module ownership

Every module should declare:

- business capability it owns;
- data/models it owns;
- controllers/routes it exposes;
- public services/ports other modules may import;
- events it publishes/consumes, if any;
- tests that protect behavior.

## Public vs internal files

Internal by default:

```txt
repositories/**
schemas/** implementation details
private helper services
Prisma query shapes
provider-specific adapters
```

Public only when intentionally exported:

```txt
module exports
index.ts / *-public.ts
public service/port interfaces
shared DTO/contract types
```

## Cross-module dependency rule

Allowed:

```ts
import { HotelAccessService } from "../property/property-public";
```

Forbidden unless explicitly approved:

```ts
import { HotelCoreRepository } from "../property/infrastructure/repositories/hotel-core.repository";
```

If another context needs owner data, create a public query/port on the owner context instead of exporting a repository.

## Refactor workflow

1. Add or identify a failing test that captures the desired boundary/behavior.
2. Move one slice at a time.
3. Keep HTTP routes and DTO behavior stable unless explicitly approved.
4. Run targeted tests after each slice.
5. Run full build/test/lint before finishing.

## Recommended module shapes

Small:

```txt
health.module.ts
health.controller.ts
health.service.ts
```

Medium:

```txt
<domain>.module.ts
api/
application/
infrastructure/
tests/
```

Complex:

```txt
<domain>.module.ts
api/
application/
domain/
infrastructure/
tests/
<domain>-public.ts
```

Do not create empty folders. Let complexity justify structure.

## Current boundary examples

| Context | Public boundary now | Internal details |
| --- | --- | --- |
| Property | `HotelAccessService` via `src/modules/property/property-public.ts` | `infrastructure/repositories/*`, persistence query shapes |
| Guest Operations | `GuestOsService`, `GuestSessionGuard` via `src/modules/guest-operations/guest-operations-public.ts` | `infrastructure/repositories/*`, guest session persistence |
| Notifications | `TelegramNotificationService` via `src/modules/notifications/notifications-public.ts`; HTTP webhook uses `/integrations/telegram/webhook` with `X-Telegram-Bot-Api-Secret-Token` | provider adapters, delivery status persistence, notification route configuration internals |
| Identity/Auth bridge | `AuthService`, `AuthorizationService`, shared `AuthenticatedUser` contract | `AuthRepository`, route permission sync internals |
| Billing | Billing controllers/services | `BillingRepository`, Prisma financial snapshots |

## Verification commands

```bash
cd services/auth-service
npm run build
npm run test -- --runInBand
npx eslint "{src,apps,libs,test}/**/*.ts"
git diff --check
```

Use scoped targeted tests during development.
