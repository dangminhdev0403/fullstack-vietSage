# RBAC Architecture

## Current direction

VietSage uses business permission keys rather than making admins manage raw HTTP method/path rows. This remains compatible with the modular-monolith architecture: authorization is enforced inside the core API and can later be moved behind an Identity service boundary only after contracts stabilize.

## Goals

- Move away from hard-to-manage endpoint-level permissions.
- Use stable business permission keys that are understandable by admins.
- Keep backend authorization explicit and fail-safe.
- Keep frontend permission management focused on features, not raw HTTP paths.
- Preserve compatibility with the current `Permission`, `Role`, and `RolePermission` tables during migration.
- Avoid symmetric shared JWT secrets for future extracted services; prefer short-lived tokens and explicit service-to-service auth if extraction happens.

## Business permission examples

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

## Backend architecture

### Permission registry

Business permissions are defined in:

```txt
services/auth-service/src/common/config/business-permissions.registry.ts
```

Each permission contains a stable key, grouping metadata, admin-facing label/description, optional menu path, and risk level.

### Explicit permission decorator

Routes can declare business permissions explicitly with:

```ts
@RequirePermission("platform.roles.manage")
```

Decorator file:

```txt
services/auth-service/src/shared/decorators/require-permission.decorator.ts
```

### Authorization flow

`AuthorizationGuard` checks:

1. Public routes bypass authorization.
2. If authorization enforcement is disabled, allow only for configured non-production migration mode.
3. Require authenticated user.
4. If `@RequirePermission(...)` exists, check business permission within the role ID bound to the
   authenticated session; never aggregate grants from the user's other active roles.
5. Otherwise fall back to old route-based permission only during the bridge phase.

Production target is fail-closed.

### Active workspace context

Each authenticated session is bound to one active role ID. `GET /auth/me` exposes that role as
`activeRole`; its `menus` and `permissions` are calculated only from that role. The compatibility
`roles` array may list other active assignments, but clients must not merge their capabilities into
the current workspace. Hotel scope remains explicit through `accessibleHotels`; the API does not
select or infer an active hotel.

## Bridge storage strategy

Business permissions currently use the existing `Permission` table:

- `method = OPTIONS`
- `path = business permission key`
- `description = business permission description`
- `moduleKey = business permission moduleKey`

A later database cleanup can add a dedicated `Permission.key` column.

## Identity boundary direction

Long term, split Identity into:

```txt
identity/
  authentication/
  sessions/
  users/
  access-control/
    roles/
    permissions/
    authorization/
  audit/
  identity-public.ts
```

Current safe boundary slice:

- shared `AuthenticatedUser` contract lives in `src/shared/security/`;
- global guards/controllers import the shared contract or `src/modules/identity/identity-public.ts`, not legacy deep auth-module paths;
- legacy `auth`, `rbac`, and `hotel-users` module folders have been consolidated into `src/modules/identity`.

## Security rules

- Production authorization should be fail-closed.
- Missing explicit permission metadata should fail CI once migration is complete.
- Missing permission rows should deny in production.
- Permission mutation must be audited.
- Actor cannot grant permissions outside their own scope unless super-admin.
- Route authorization and resource authorization are separate:
  - RBAC says the user can perform an action.
  - Resource access says the user can perform it on this tenant/hotel/resource.
- Property resource access must receive the session-bound role ID and load only that active role when
  deriving elevated, tenant-owner, or assignment-required scope. Other active roles assigned to the
  same user must not expand the current workspace.

## Migration plan

1. Keep bridge model and explicit `@RequirePermission(...)` support.
2. Expand business permission coverage to hotel, billing, request, room, stay, service, and user routes.
3. Move shared identity contracts out of deep auth module paths. ✅
4. Split auth/session/access-control services after tests cover behavior. ✅
5. Add dedicated permission key column only in a DB migration phase.
6. Design service-to-service auth only if Identity is extracted.
