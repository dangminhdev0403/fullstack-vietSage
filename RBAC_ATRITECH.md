# RBAC Architecture

## Current Refactor Status

This document summarizes the upgraded RBAC direction for VietSage and the bridge implementation currently in the codebase.

## Goals

- Move away from hard-to-manage endpoint-level permissions.
- Introduce stable business permission keys that are understandable by admins.
- Keep backend authorization explicit and fail-safe.
- Keep frontend permission management focused on features, not raw HTTP paths.
- Preserve compatibility with the current `Permission`, `Role`, and `RolePermission` tables during migration.

## Problems In The Old Model

- Permissions were generated from HTTP method + route path.
- Admins had to reason about technical API routes instead of business capabilities.
- Route sync could skip routes without descriptions.
- Missing permission rows could be allowed when strict mode was off.
- Menu visibility was inferred from backend route paths.
- Role permission management APIs were too granular.
- Full permission replacement was riskier than grouped feature access updates.

## New Permission Model

The new model uses business permission keys such as:

```txt
platform.users.view
platform.users.manage
platform.roles.view
platform.roles.manage
platform.permissions.manage
platform.hotels.view
platform.hotels.manage
hotel.dashboard.view
hotel.rooms.view
hotel.rooms.manage
hotel.rooms.qr.manage
hotel.stays.view
hotel.stays.manage
hotel.requests.view
hotel.requests.manage
hotel.billing.view
hotel.billing.manage
hotel.services.view
hotel.services.manage
guest.experience.use
system.health.view
```

These keys are stable and should not change when route paths change.

## Backend Architecture

### Permission Registry

Business permissions are defined in:

```txt
services/auth-service/src/common/config/business-permissions.registry.ts
```

Each permission contains:

- `key`: stable permission key.
- `moduleKey`: grouping key for UI and reporting.
- `domain`: permission domain, such as `PLATFORM`, `HOTEL`, `GUEST`, or `SYSTEM`.
- `label`: human-readable title.
- `description`: admin-facing description.
- `menuPath`: optional frontend menu route.
- `risk`: `low`, `medium`, or `high`.

### Explicit Permission Decorator

Routes can now declare business permissions explicitly with:

```ts
@RequirePermission("platform.roles.manage")
```

Decorator file:

```txt
services/auth-service/src/shared/decorators/require-permission.decorator.ts
```

### Authorization Flow

`AuthorizationGuard` now checks in this order:

1. Public routes bypass authorization.
2. If authorization enforcement is disabled, allow.
3. Require authenticated user.
4. If `@RequirePermission(...)` exists, check business permission.
5. Otherwise fall back to the old route-based permission check.

This makes the refactor incremental and compatible with existing routes.

### Business Permission Storage

To avoid a risky database migration in the first pass, business permissions are stored in the existing `Permission` table:

- `method = OPTIONS`
- `path = business permission key`
- `description = business permission description`
- `moduleKey = business permission moduleKey`

This is a bridge strategy. A future migration can add a dedicated `Permission.key` column.

## Current Protected RBAC Permissions

RBAC endpoints are protected with business permissions:

```txt
platform.roles.view
platform.roles.manage
platform.permissions.manage
```

Suggested policy:

- Viewing roles: `platform.roles.view`
- Creating/updating/disabling roles: `platform.roles.manage`
- Granting/revoking/replacing permissions: `platform.permissions.manage`

## Recommended Future API Shape

Long-term, simplify RBAC APIs to:

```txt
GET    /rbac/roles
POST   /rbac/roles
PATCH  /rbac/roles/:roleId
POST   /rbac/roles/:roleId/disable

GET    /rbac/permission-catalog
GET    /rbac/roles/:roleId/access
PUT    /rbac/roles/:roleId/access

GET    /rbac/templates
POST   /rbac/roles/from-template
```

Avoid exposing low-level permission mutation APIs to normal frontend users:

```txt
POST /roles/:roleId/modules/:moduleKey/permissions/grant
POST /roles/:roleId/modules/:moduleKey/permissions/revoke
PUT  /roles/:id/permissions
```

Those can remain internal or super-admin-only.

## Frontend Direction

The frontend should eventually manage grouped feature permissions instead of endpoint rows.

Recommended UI groups:

- Platform
- Hotels
- Rooms & QR
- Stays
- Guest Requests
- Billing
- Service Catalog
- GuestOS
- System

Recommended UI labels:

```txt
View rooms
Manage rooms
Manage room QR
View stays
Manage check-in/check-out
View billing
Manage billing
View guest requests
Manage guest requests
Manage service catalog
Manage roles
Manage permissions
```

## Role Templates

Use protected templates instead of directly editing built-in roles:

```txt
SUPER_ADMIN
PLATFORM_OPERATOR
TENANT_OWNER
HOTEL_OWNER
FRONT_DESK
HOUSEKEEPING
SERVICE_STAFF
BILLING_STAFF
```

Recommended behavior:

- Built-in templates are immutable.
- Admins clone templates into custom roles.
- Custom roles can be edited within actor scope.
- High-risk permissions require extra confirmation or super-admin access.

## Security Rules

- Production authorization should be fail-closed.
- Missing explicit permission metadata should fail CI once migration is complete.
- Missing permission rows should deny in production.
- Permission mutation must be audited.
- Actor cannot grant permissions outside their own scope unless super-admin.
- Route authorization and resource authorization are separate:
  - RBAC says the user can perform an action.
  - Resource access says the user can perform it on this tenant/hotel/resource.

## Migration Plan

### Phase 1: Bridge

- Add business permission registry.
- Seed business permissions into existing `Permission` table.
- Add `@RequirePermission(...)` support.
- Decorate high-risk RBAC routes.
- Keep route-based fallback.

### Phase 2: Expand Coverage

- Add `@RequirePermission(...)` to hotel, billing, request, room, stay, service, and user routes.
- Add tests that every non-public route has either `@RequirePermission(...)` or `@Public()`.
- Turn strict mode on in production.

### Phase 3: Frontend Simplification

- Replace endpoint matrix UI with grouped permission toggles.
- Add role templates.
- Hide HTTP method/path details behind developer/audit view.
- Use backend-provided `permissionCatalog`, `features`, and `menus`.

### Phase 4: Database Cleanup

- Add a dedicated `Permission.key` column.
- Backfill business keys.
- Move route permissions into an audit table or remove them from admin-facing UI.
- Update unique constraints around permission keys.

## Verification Performed

Ad-hoc verification was performed with temporary scripts under:

```txt
C:\Users\ADMIN\AppData\Local\Temp\hermes-verify-*.py
```

Checks performed:

```txt
npm run build
npm test -- authorization.guard.spec.ts rbac.service.spec.ts --runInBand
```

Result:

- Backend build passed.
- Focused RBAC/authorization tests passed.
