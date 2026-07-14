# API Catalog v1 (Auth Service)

Source of truth for frontend integration with `services/auth-service`.

## Base Protocol

- Base URL: `http://<host>:<PORT>` (default local run uses app `PORT`).
- Content-Type: `application/json`.
- Protected APIs require `Authorization` header with JWT access token.
- Tenant-scoped APIs accept `x-tenant-id` header (recommended when actor has multi-tenant scope).

### Success Envelope

All successful responses are wrapped by interceptor:

```json
{
  "status": 200,
  "error": null,
  "message": "Success message",
  "data": {}
}
```

> `status` follows actual HTTP status (200/201/etc). Below, each endpoint documents only the `data` payload.

### Error Envelope

All errors are normalized by global exception filter:

```json
{
  "status": 400,
  "error": "BAD_REQUEST_EXCEPTION",
  "message": "Validation message",
  "data": {
    "requestId": "...",
    "timestamp": "2026-05-28T00:00:00.000Z",
    "path": "/api/path",
    "details": {}
  }
}
```

## Common Data Types

### `AuthTokens`

```json
{
  "accessToken": "jwt",
  "refreshToken": "vsr_opaque-token",
  "tokenType": "Bearer",
  "accessTtl": "15m",
  "refreshTtl": "30d",
  "accessExpiresAt": "ISO",
  "refreshExpiresAt": "ISO",
  "sessionId": "uuid"
}
```

### `Role`

```json
{
  "id": "string",
  "code": "HOTEL_MANAGER",
  "name": "Hotel Manager",
  "description": "optional",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### `Permission`

```json
{
  "id": "string",
  "method": "GET|POST|PUT|PATCH|DELETE|OPTIONS",
  "path": "/resource/:id",
  "description": "string",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### `TenantScopedHotelUser`

```json
{
  "id": "string",
  "email": "staff@hotel.com",
  "fullName": "Staff Name",
  "userStatus": "ACTIVE|LOCKED|DISABLED",
  "tenantStatus": "ACTIVE|INVITED|DISABLED",
  "tenantId": "string",
  "joinedAt": "ISO|null",
  "roles": [
    {
      "id": "string",
      "code": "HOTEL_FRONTDESK",
      "name": "Frontdesk",
      "assignedAt": "ISO",
      "assignedById": "string|null"
    }
  ]
}
```

## Module: health

### `GET /health` (Public)

- Request: no body.
- `data` response:

```json
{
  "status": "ok",
  "service": "auth-service",
  "uptimeSeconds": 123,
  "timestamp": "ISO"
}
```

## Module: auth

### `POST /auth/login` (Public)

- Request body:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

- Validation:
  - `email`: required, valid email, max 320.
  - `password`: required, max 256.
- `data` response: `AuthTokens`.

### `POST /auth/refresh` (Public)

- Request body:

```json
{
  "refreshToken": "vsr_opaque-token"
}
```

- Validation: `refreshToken` required string.
- Optional header: `Idempotency-Key` (1-64 safe ASCII characters). Reusing the same key for the same token returns the original rotation result.
- Replaying an already rotated token with a different key revokes its refresh family.
- `data` response: `AuthTokens`.

### `POST /auth/logout` (Private)

- Revokes the session identified by the access JWT `sid` claim.
- `data` response: `{ "success": true }`.

### `POST /auth/logout-all` (Private)

- Revokes every active auth session owned by the authenticated user.
- `data` response: `{ "success": true }`.

- Validation: same as refresh.
- `data` response:

```json
{
  "success": true
}
```

### `GET /auth/me` (Protected)

- Request: `Authorization` bearer token.
- `data` response:

```json
{
  "id": "string",
  "email": "user@example.com",
  "fullName": "User Name",
  "status": "ACTIVE|LOCKED|DISABLED",
  "roles": ["SUPER_ADMIN"],
  "permissions": ["GET:/roles", "POST:/hotel-users"],
  "tenants": [
    {
      "id": "string",
      "code": "TENANT_A",
      "name": "Tenant A",
      "status": "ACTIVE|INVITED|DISABLED"
    }
  ]
}
```

## Module: rbac.roles

### `POST /roles` (Protected)

- Request body:

```json
{
  "code": "HOTEL_FRONTDESK",
  "name": "Hotel Frontdesk",
  "description": "optional"
}
```

- Validation:
  - `code`: required, regex `^[A-Z0-9_]+$`, length 2..80.
  - `name`: required, length 2..120.
  - `description`: optional, max 255.
- `data` response: `Role`.

### `GET /roles` (Protected)

- Request: no query.
- `data` response: `RoleWithRelations[]`.

```json
[
  {
    "id": "string",
    "code": "HOTEL_MANAGER",
    "name": "Hotel Manager",
    "description": "...",
    "createdAt": "ISO",
    "updatedAt": "ISO",
    "rolePermissions": [
      {
        "id": "string",
        "roleId": "string",
        "permissionId": "string",
        "permission": {
          "id": "string",
          "method": "GET",
          "path": "/hotel-users",
          "description": "...",
          "createdAt": "ISO",
          "updatedAt": "ISO"
        }
      }
    ],
    "_count": {
      "userRoles": 1,
      "rolePermissions": 3
    }
  }
]
```

### `GET /roles/:id` (Protected)

- Path param: `id`.
- `data` response: same shape as one item in `GET /roles`.

### `PATCH /roles/:id` (Protected)

- Path param: `id`.
- Request body (at least one field expected by business):

```json
{
  "name": "optional",
  "description": "optional"
}
```

- Validation:
  - `name`: optional, length 2..120.
  - `description`: optional, max 255.
- `data` response: `Role`.

### `DELETE /roles/:id` (Protected)

- Path param: `id`.
- `data` response:

```json
{
  "deleted": true
}
```

### `GET /roles/:id/permissions` (Protected)

- Path param: `id`.
- `data` response: `Permission[]`.

### `POST /roles/:id/permissions/grant` (Protected)

- Path param: `id`.
- Request body:

```json
{
  "permissionIds": ["perm-id-1", "perm-id-2"]
}
```

- Validation: `permissionIds` non-empty array.
- `data` response: updated `Permission[]`.

### `POST /roles/:id/permissions/revoke` (Protected)

- Path param: `id`.
- Request body: same as grant.
- `data` response: updated `Permission[]`.

### `PUT /roles/:id/permissions` (Protected)

- Path param: `id`.
- Request body:

```json
{
  "permissionIds": ["perm-id-1", "perm-id-2"]
}
```

- Validation: `permissionIds` array (can be empty to clear all permissions).
- `data` response: updated `Permission[]`.

## Module: rbac.permissions

### `GET /permissions` (Protected)

- Query params (optional):
  - `method`: `GET|POST|PUT|PATCH|DELETE|OPTIONS`
  - `path`: substring filter on path
  - `q`: substring search over path/description
- `data` response: `Permission[]`.

### `GET /permissions/:id` (Protected)

- Path param: `id`.
- `data` response: `Permission`.

## Module: hotel-users

### `POST /hotel-users` (Protected)

- Headers:
  - `x-tenant-id` (optional, recommended)
- Request body:

```json
{
  "email": "staff@hotel.com",
  "fullName": "Staff Name",
  "password": "strong-password",
  "tenantId": "optional-tenant-id",
  "roleIds": ["role-id-1"]
}
```

- Validation:
  - `email`: required, valid email, max 320.
  - `fullName`: required, length 2..120.
  - `password`: required, length 8..128.
  - `tenantId`: optional, max 80.
  - `roleIds`: optional, 1..20, each id max 64.
- `data` response: `TenantScopedHotelUser`.

### `GET /hotel-users` (Protected)

- Headers:
  - `x-tenant-id` (optional, recommended)
- Query params (optional):
  - `tenantId` (max 80)
  - `page` (int >= 1, default 1)
  - `limit` (int 1..100, default 20)
  - `status` (`ACTIVE|INVITED|DISABLED`, default `ACTIVE`)
  - `q` (max 120)
- `data` response:

```json
{
  "page": 1,
  "limit": 20,
  "total": 100,
  "items": [
    {
      "id": "string",
      "email": "staff@hotel.com",
      "fullName": "Staff Name",
      "userStatus": "ACTIVE",
      "tenantStatus": "ACTIVE",
      "tenantId": "string",
      "joinedAt": "ISO",
      "roles": []
    }
  ]
}
```

### `GET /hotel-users/:id` (Protected)

- Path param: `id`.
- Query param: `tenantId` optional.
- Header: `x-tenant-id` optional.
- `data` response: `TenantScopedHotelUser`.

### `PATCH /hotel-users/:id/status` (Protected)

- Path param: `id`.
- Query param: `tenantId` optional.
- Header: `x-tenant-id` optional.
- Request body:

```json
{
  "status": "ACTIVE"
}
```

- Validation: status only `ACTIVE` or `DISABLED`.
- `data` response: `TenantScopedHotelUser`.

### `POST /hotel-users/:id/roles` (Protected)

- Path param: `id`.
- Query param: `tenantId` optional.
- Header: `x-tenant-id` optional.
- Request body:

```json
{
  "roleIds": ["role-id-1", "role-id-2"]
}
```

- Validation: `roleIds` required, size 1..20.
- `data` response: `TenantScopedHotelUser`.

### `DELETE /hotel-users/:id/roles/:roleId` (Protected)

- Path params: `id`, `roleId`.
- Query param: `tenantId` optional.
- Header: `x-tenant-id` optional.
- `data` response:

```json
{
  "revoked": true,
  "userId": "string",
  "roleId": "string"
}
```

## Public Route Allowlist

Current explicit public routes:

- `GET /health`
- `POST /auth/login`
- `POST /auth/refresh`

All other routes are private by default.

## Quick Frontend Handshake

1. Login via `POST /auth/login`.
2. Keep tokens in the trusted BFF/server session; do not expose refresh tokens to browser JavaScript.
3. Send JWT access token in `Authorization` header for private routes.
4. On 401 due token expiry, call `POST /auth/refresh` then retry original request.
5. On logout, call private `POST /auth/logout` with the current access token; use `POST /auth/logout-all` to revoke every device.
